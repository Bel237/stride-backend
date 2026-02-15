// ========================================
// Stride - Users Management Routes
// ========================================

import { Router, Response } from 'express'
import bcrypt from 'bcryptjs'
import prisma from '../lib/prisma'
import { authenticate, AuthRequest } from '../middleware/auth.middleware'
import { z } from 'zod'

const router = Router()

// === Validation Schemas ===
const createUserSchema = z.object({
  email: z.string().email('Email invalide'),
  password: z.string().min(6, 'Le mot de passe doit contenir au moins 6 caractères'),
  firstName: z.string().min(2, 'Le prénom est requis'),
  lastName: z.string().min(2, 'Le nom est requis'),
  phone: z.string().optional(),
  role: z.enum(['member', 'president', 'vice_president', 'secretary', 'treasurer', 'commissaire', 'executive', 'admin']).default('member')
})

const updateUserSchema = z.object({
  firstName: z.string().min(2).optional(),
  lastName: z.string().min(2).optional(),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  role: z.enum(['member', 'president', 'vice_president', 'secretary', 'treasurer', 'commissaire', 'executive', 'admin']).optional(),
  status: z.enum(['pending', 'active', 'suspended', 'inactive']).optional()
})

// Helper: strip password from user object
function formatUser(user: any) {
  const { password, ...rest } = user
  return rest
}

// ==========================================
// GET /api/users
// Liste tous les membres de l'association
// ==========================================
router.get('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const associationId = req.user!.associationId
    const { status, role, search } = req.query

    const where: any = { associationId }

    if (status && status !== 'all') {
      where.status = status as string
    }
    if (role && role !== 'all') {
      where.role = role as string
    }
    if (search) {
      const s = search as string
      where.OR = [
        { firstName: { contains: s, mode: 'insensitive' } },
        { lastName: { contains: s, mode: 'insensitive' } },
        { email: { contains: s, mode: 'insensitive' } }
      ]
    }

    const users = await prisma.user.findMany({
      where,
      orderBy: { joinDate: 'asc' },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phone: true,
        role: true,
        status: true,
        joinDate: true,
        avatarUrl: true,
        createdAt: true,
        updatedAt: true
      }
    })

    res.json(users)
  } catch (error) {
    console.error('List users error:', error)
    res.status(500).json({ message: 'Erreur serveur' })
  }
})

// ==========================================
// GET /api/users/stats
// Statistiques des membres
// ==========================================
router.get('/stats', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const associationId = req.user!.associationId

    const [total, active, pending, suspended, inactive] = await Promise.all([
      prisma.user.count({ where: { associationId } }),
      prisma.user.count({ where: { associationId, status: 'active' } }),
      prisma.user.count({ where: { associationId, status: 'pending' } }),
      prisma.user.count({ where: { associationId, status: 'suspended' } }),
      prisma.user.count({ where: { associationId, status: 'inactive' } })
    ])

    // Compter par rôle
    const byRole = await prisma.user.groupBy({
      by: ['role'],
      where: { associationId },
      _count: { id: true }
    })

    const roleStats: Record<string, number> = {}
    byRole.forEach((r: any) => {
      roleStats[r.role] = r._count.id
    })

    res.json({ total, active, pending, suspended, inactive, byRole: roleStats })
  } catch (error) {
    console.error('User stats error:', error)
    res.status(500).json({ message: 'Erreur serveur' })
  }
})

// ==========================================
// GET /api/users/:id
// Détail d'un membre
// ==========================================
router.get('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const associationId = req.user!.associationId

    const user = await prisma.user.findFirst({
      where: { id: req.params.id as string, associationId },
      include: {
        contributions: {
          orderBy: { createdAt: 'desc' },
          take: 12,
          include: { session: true }
        },
        loans: {
          orderBy: { createdAt: 'desc' },
          take: 5
        },
        savingsAccounts: true,
        distributions: {
          orderBy: { createdAt: 'desc' },
          take: 5,
          include: { cycle: true }
        }
      }
    })

    if (!user) {
      return res.status(404).json({ message: 'Membre non trouvé' })
    }

    res.json(formatUser(user))
  } catch (error) {
    console.error('Get user error:', error)
    res.status(500).json({ message: 'Erreur serveur' })
  }
})

// ==========================================
// POST /api/users
// Créer un nouveau membre
// ==========================================
router.post('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const associationId = req.user!.associationId
    const data = createUserSchema.parse(req.body)

    // Vérifier que l'email n'existe pas déjà
    const existing = await prisma.user.findUnique({ where: { email: data.email } })
    if (existing) {
      return res.status(400).json({ message: 'Cet email est déjà utilisé' })
    }

    // Vérifier les rôles uniques (président, trésorier, secrétaire)
    const uniqueRoles = ['president', 'vice_president', 'secretary', 'treasurer']
    if (uniqueRoles.includes(data.role)) {
      const existingRole = await prisma.user.findFirst({
        where: { associationId, role: data.role as any }
      })
      if (existingRole) {
        const roleLabels: Record<string, string> = {
          president: 'Président',
          vice_president: 'Vice-Président',
          secretary: 'Secrétaire',
          treasurer: 'Trésorier'
        }
        return res.status(400).json({
          message: `Le rôle ${roleLabels[data.role] || data.role} est déjà attribué à ${existingRole.firstName} ${existingRole.lastName}`
        })
      }
    }

    const hashedPassword = await bcrypt.hash(data.password, 12)

    const user = await prisma.user.create({
      data: {
        email: data.email,
        password: hashedPassword,
        firstName: data.firstName,
        lastName: data.lastName,
        phone: data.phone,
        role: data.role as any,
        status: 'active',
        mustChangePassword: true,
        associationId
      }
    })

    res.status(201).json(formatUser(user))
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        message: 'Données invalides',
        errors: error.errors.map(e => e.message)
      })
    }
    console.error('Create user error:', error)
    res.status(500).json({ message: 'Erreur serveur' })
  }
})

// ==========================================
// PUT /api/users/:id
// Modifier un membre (infos, rôle, statut)
// ==========================================
router.put('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const associationId = req.user!.associationId
    const data = updateUserSchema.parse(req.body)

    // Vérifier que le membre existe et appartient à l'association
    const existingUser = await prisma.user.findFirst({
      where: { id: req.params.id as string, associationId }
    })
    if (!existingUser) {
      return res.status(404).json({ message: 'Membre non trouvé' })
    }

    // Empêcher de modifier le owner
    if (existingUser.role === 'owner' && req.user!.id !== existingUser.id) {
      return res.status(403).json({ message: 'Impossible de modifier le propriétaire' })
    }

    // Vérifier unicité des rôles bureau
    if (data.role) {
      const uniqueRoles = ['president', 'vice_president', 'secretary', 'treasurer']
      if (uniqueRoles.includes(data.role)) {
        const roleHolder = await prisma.user.findFirst({
          where: { associationId, role: data.role as any, NOT: { id: req.params.id as string } }
        })
        if (roleHolder) {
          const roleLabels: Record<string, string> = {
            president: 'Président',
            vice_president: 'Vice-Président',
            secretary: 'Secrétaire',
            treasurer: 'Trésorier'
          }
          return res.status(400).json({
            message: `Le rôle ${roleLabels[data.role] || data.role} est déjà attribué à ${roleHolder.firstName} ${roleHolder.lastName}`
          })
        }
      }
    }

    // Vérifier unicité email si changé
    if (data.email && data.email !== existingUser.email) {
      const emailTaken = await prisma.user.findUnique({ where: { email: data.email } })
      if (emailTaken) {
        return res.status(400).json({ message: 'Cet email est déjà utilisé' })
      }
    }

    const updateData: any = {}
    if (data.firstName) updateData.firstName = data.firstName
    if (data.lastName) updateData.lastName = data.lastName
    if (data.email) updateData.email = data.email
    if (data.phone !== undefined) updateData.phone = data.phone
    if (data.role) updateData.role = data.role
    if (data.status) updateData.status = data.status

    const user = await prisma.user.update({
      where: { id: req.params.id as string },
      data: updateData
    })

    res.json(formatUser(user))
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        message: 'Données invalides',
        errors: error.errors.map(e => e.message)
      })
    }
    console.error('Update user error:', error)
    res.status(500).json({ message: 'Erreur serveur' })
  }
})

// ==========================================
// PUT /api/users/:id/status
// Changer le statut d'un membre (activer, suspendre, etc.)
// ==========================================
router.put('/:id/status', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const associationId = req.user!.associationId
    const { status } = req.body

    if (!['pending', 'active', 'suspended', 'inactive'].includes(status)) {
      return res.status(400).json({ message: 'Statut invalide' })
    }

    const existingUser = await prisma.user.findFirst({
      where: { id: req.params.id as string, associationId }
    })
    if (!existingUser) {
      return res.status(404).json({ message: 'Membre non trouvé' })
    }

    if (existingUser.role === 'owner') {
      return res.status(403).json({ message: 'Impossible de modifier le statut du propriétaire' })
    }

    const user = await prisma.user.update({
      where: { id: req.params.id as string },
      data: { status }
    })

    res.json(formatUser(user))
  } catch (error) {
    console.error('Update status error:', error)
    res.status(500).json({ message: 'Erreur serveur' })
  }
})

// ==========================================
// PUT /api/users/:id/role
// Changer le rôle d'un membre
// ==========================================
router.put('/:id/role', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const associationId = req.user!.associationId
    const { role } = req.body

    const validRoles = ['member', 'president', 'vice_president', 'secretary', 'treasurer', 'commissaire', 'executive', 'admin']
    if (!validRoles.includes(role)) {
      return res.status(400).json({ message: 'Rôle invalide' })
    }

    const existingUser = await prisma.user.findFirst({
      where: { id: req.params.id as string, associationId }
    })
    if (!existingUser) {
      return res.status(404).json({ message: 'Membre non trouvé' })
    }

    if (existingUser.role === 'owner') {
      return res.status(403).json({ message: 'Impossible de modifier le rôle du propriétaire' })
    }

    // Vérifier unicité des rôles bureau
    const uniqueRoles = ['president', 'vice_president', 'secretary', 'treasurer']
    if (uniqueRoles.includes(role)) {
      const roleHolder = await prisma.user.findFirst({
        where: { associationId, role: role as any, NOT: { id: req.params.id as string } }
      })
      if (roleHolder) {
        const roleLabels: Record<string, string> = {
          president: 'Président',
          vice_president: 'Vice-Président',
          secretary: 'Secrétaire',
          treasurer: 'Trésorier'
        }
        return res.status(400).json({
          message: `Le rôle ${roleLabels[role] || role} est déjà attribué à ${roleHolder.firstName} ${roleHolder.lastName}`
        })
      }
    }

    const user = await prisma.user.update({
      where: { id: req.params.id as string },
      data: { role }
    })

    res.json(formatUser(user))
  } catch (error) {
    console.error('Update role error:', error)
    res.status(500).json({ message: 'Erreur serveur' })
  }
})

// ==========================================
// PUT /api/users/:id/reset-password
// Réinitialiser le mot de passe d'un membre
// ==========================================
router.put('/:id/reset-password', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const associationId = req.user!.associationId
    const { newPassword } = req.body

    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ message: 'Le mot de passe doit contenir au moins 6 caractères' })
    }

    const existingUser = await prisma.user.findFirst({
      where: { id: req.params.id as string, associationId }
    })
    if (!existingUser) {
      return res.status(404).json({ message: 'Membre non trouvé' })
    }

    const hashedPassword = await bcrypt.hash(newPassword, 12)

    await prisma.user.update({
      where: { id: req.params.id as string },
      data: { password: hashedPassword, mustChangePassword: true }
    })

    res.json({ message: 'Mot de passe réinitialisé avec succès' })
  } catch (error) {
    console.error('Reset password error:', error)
    res.status(500).json({ message: 'Erreur serveur' })
  }
})

// ==========================================
// DELETE /api/users/:id
// Supprimer un membre
// ==========================================
router.delete('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const associationId = req.user!.associationId

    const existingUser = await prisma.user.findFirst({
      where: { id: req.params.id as string, associationId }
    })
    if (!existingUser) {
      return res.status(404).json({ message: 'Membre non trouvé' })
    }

    if (existingUser.role === 'owner') {
      return res.status(403).json({ message: 'Impossible de supprimer le propriétaire' })
    }

    // Ne pas supprimer soi-même
    if (existingUser.id === req.user!.id) {
      return res.status(403).json({ message: 'Impossible de supprimer votre propre compte' })
    }

    await prisma.user.delete({ where: { id: req.params.id as string } })

    res.json({ message: 'Membre supprimé avec succès' })
  } catch (error) {
    console.error('Delete user error:', error)
    res.status(500).json({ message: 'Erreur serveur' })
  }
})

export default router
