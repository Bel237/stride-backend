// ========================================
// Stride - Sanctions Routes
// ========================================

import { Router, Response } from 'express'
import prisma from '../lib/prisma'
import { authenticate, AuthRequest } from '../middleware/auth.middleware'

const router = Router()

// ==========================================
// GET /api/sanctions
// Liste des sanctions de l'association
// ==========================================
router.get('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const associationId = req.user!.associationId
    const type = req.query.type as string | undefined
    const status = req.query.status as string | undefined
    const search = req.query.search as string | undefined

    const where: any = { associationId }

    if (type) where.type = type
    if (status) where.status = status

    if (search) {
      where.OR = [
        { reason: { contains: search, mode: 'insensitive' } },
        { user: { firstName: { contains: search, mode: 'insensitive' } } },
        { user: { lastName: { contains: search, mode: 'insensitive' } } }
      ]
    }

    const sanctions: any[] = await prisma.sanction.findMany({
      where,
      include: {
        user: {
          select: { id: true, firstName: true, lastName: true, email: true, role: true }
        },
        createdBy: {
          select: { id: true, firstName: true, lastName: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    })

    const result = sanctions.map((s: any) => ({
      id: s.id,
      userId: s.userId,
      memberName: `${s.user.firstName} ${s.user.lastName}`,
      memberEmail: s.user.email,
      memberRole: s.user.role,
      createdByName: `${s.createdBy.firstName} ${s.createdBy.lastName}`,
      type: s.type,
      reason: s.reason,
      amount: s.amount,
      applicationDate: s.applicationDate,
      status: s.status,
      paidAt: s.paidAt,
      cancelledAt: s.cancelledAt,
      cancelReason: s.cancelReason,
      createdAt: s.createdAt
    }))

    res.json(result)
  } catch (error) {
    console.error('Error loading sanctions:', error)
    res.status(500).json({ message: 'Erreur serveur' })
  }
})

// ==========================================
// GET /api/sanctions/stats
// Statistiques des sanctions
// ==========================================
router.get('/stats', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const associationId = req.user!.associationId

    const sanctions = await prisma.sanction.findMany({ where: { associationId } })

    const total = sanctions.length
    const enAttente = sanctions.filter(s => s.status === 'en_attente').length
    const appliquees = sanctions.filter(s => s.status === 'appliquee').length
    const payees = sanctions.filter(s => s.status === 'payee').length
    const annulees = sanctions.filter(s => s.status === 'annulee').length
    const totalAmount = sanctions.reduce((sum, s) => sum + s.amount, 0)
    const paidAmount = sanctions.filter(s => s.status === 'payee').reduce((sum, s) => sum + s.amount, 0)

    res.json({ total, enAttente, appliquees, payees, annulees, totalAmount, paidAmount })
  } catch (error) {
    console.error('Error loading sanctions stats:', error)
    res.status(500).json({ message: 'Erreur serveur' })
  }
})

// ==========================================
// GET /api/sanctions/member
// Sanctions du membre connecté
// ==========================================
router.get('/member', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id

    const sanctions: any[] = await prisma.sanction.findMany({
      where: { userId },
      include: {
        createdBy: {
          select: { id: true, firstName: true, lastName: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    })

    const result = sanctions.map((s: any) => ({
      id: s.id,
      type: s.type,
      reason: s.reason,
      amount: s.amount,
      applicationDate: s.applicationDate,
      status: s.status,
      paidAt: s.paidAt,
      createdByName: `${s.createdBy.firstName} ${s.createdBy.lastName}`,
      createdAt: s.createdAt
    }))

    res.json(result)
  } catch (error) {
    console.error('Error loading member sanctions:', error)
    res.status(500).json({ message: 'Erreur serveur' })
  }
})

// ==========================================
// POST /api/sanctions
// Créer une sanction
// ==========================================
router.post('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const associationId = req.user!.associationId
    const createdById = req.user!.id
    const { userId, type, reason, amount, applicationDate } = req.body

    if (!userId || !type || !reason) {
      return res.status(400).json({ message: 'Membre, type et motif requis' })
    }

    const sanction: any = await prisma.sanction.create({
      data: {
        associationId,
        userId,
        createdById,
        type,
        reason,
        amount: amount || 0,
        applicationDate: applicationDate ? new Date(applicationDate) : new Date()
      },
      include: {
        user: {
          select: { id: true, firstName: true, lastName: true, email: true, role: true }
        },
        createdBy: {
          select: { id: true, firstName: true, lastName: true }
        }
      }
    })

    res.status(201).json({
      id: sanction.id,
      userId: sanction.userId,
      memberName: `${sanction.user.firstName} ${sanction.user.lastName}`,
      memberEmail: sanction.user.email,
      memberRole: sanction.user.role,
      createdByName: `${sanction.createdBy.firstName} ${sanction.createdBy.lastName}`,
      type: sanction.type,
      reason: sanction.reason,
      amount: sanction.amount,
      applicationDate: sanction.applicationDate,
      status: sanction.status,
      createdAt: sanction.createdAt
    })
  } catch (error) {
    console.error('Error creating sanction:', error)
    res.status(500).json({ message: 'Erreur serveur' })
  }
})

// ==========================================
// PUT /api/sanctions/:id/status
// Changer le statut d'une sanction
// ==========================================
router.put('/:id/status', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const id = req.params.id as string
    const { status, cancelReason } = req.body

    if (!status) {
      return res.status(400).json({ message: 'Statut requis' })
    }

    const data: any = { status }
    if (status === 'payee') data.paidAt = new Date()
    if (status === 'annulee') {
      data.cancelledAt = new Date()
      if (cancelReason) data.cancelReason = cancelReason
    }

    const sanction = await prisma.sanction.update({
      where: { id },
      data
    })

    res.json(sanction)
  } catch (error) {
    console.error('Error updating sanction status:', error)
    res.status(500).json({ message: 'Erreur serveur' })
  }
})

// ==========================================
// DELETE /api/sanctions/:id
// Supprimer une sanction
// ==========================================
router.delete('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const id = req.params.id as string
    await prisma.sanction.delete({ where: { id } })
    res.json({ message: 'Sanction supprimée' })
  } catch (error) {
    console.error('Error deleting sanction:', error)
    res.status(500).json({ message: 'Erreur serveur' })
  }
})

// ==========================================
// GET /api/sanctions/members
// Liste des membres pour le formulaire
// ==========================================
router.get('/members', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const associationId = req.user!.associationId

    const members = await prisma.user.findMany({
      where: { associationId, status: 'active' },
      select: { id: true, firstName: true, lastName: true, email: true, role: true },
      orderBy: { firstName: 'asc' }
    })

    res.json(members)
  } catch (error) {
    console.error('Error loading members:', error)
    res.status(500).json({ message: 'Erreur serveur' })
  }
})

export default router
