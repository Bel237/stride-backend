// ========================================
// Stride - Auth Routes
// ========================================

import { Router, Request, Response } from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import prisma from '../lib/prisma'
import { authenticate, AuthRequest } from '../middleware/auth.middleware'
import { z } from 'zod'

const router = Router()

// === Validation Schemas ===
const registerSchema = z.object({
  // Étape 1: Infos Owner
  email: z.string().email('Email invalide'),
  password: z.string().min(6, 'Le mot de passe doit contenir au moins 6 caractères'),
  firstName: z.string().min(2, 'Le prénom est requis'),
  lastName: z.string().min(2, 'Le nom est requis'),
  phone: z.string().optional(),
  // Étape 2: Infos Association
  associationName: z.string().min(2, "Le nom de l'association est requis"),
  associationType: z.string().optional(),
  associationDescription: z.string().optional(),
  city: z.string().optional(),
  region: z.string().optional(),
  estimatedMembers: z.number().optional(),
  logo: z.string().optional(),
  // Étape 3: Configuration
  currency: z.string().optional(),
  contributionFrequency: z.string().optional(),
  baseContribution: z.number().optional(),
  firstMeetingDate: z.string().optional()
})

const loginSchema = z.object({
  email: z.string().email('Email invalide'),
  password: z.string().min(1, 'Le mot de passe est requis')
})

// === Helper: Generate JWT ===
function generateToken(userId: string, associationId: string): string {
  return jwt.sign(
    { userId, associationId },
    process.env.JWT_SECRET!,
    { expiresIn: (process.env.JWT_EXPIRES_IN || '7d') as jwt.SignOptions['expiresIn'] }
  )
}

// === Helper: Format user for response (no password) ===
function formatUser(user: any) {
  const { password, ...userWithoutPassword } = user
  return userWithoutPassword
}

// ==========================================
// POST /api/auth/register
// Crée un owner + son association
// ==========================================
router.post('/register', async (req: Request, res: Response) => {
  try {
    const data = registerSchema.parse(req.body)

    // Vérifier si l'email existe déjà
    const existingUser = await prisma.user.findUnique({
      where: { email: data.email }
    })
    if (existingUser) {
      return res.status(400).json({ message: 'Cet email est déjà utilisé' })
    }

    // Hash du mot de passe
    const hashedPassword = await bcrypt.hash(data.password, 12)

    // Créer l'association + le owner en transaction
    const result = await prisma.$transaction(async (tx) => {
      const association = await tx.association.create({
        data: {
          name: data.associationName,
          type: data.associationType,
          description: data.associationDescription,
          city: data.city,
          region: data.region,
          estimatedMembers: data.estimatedMembers,
          logo: data.logo,
          currency: data.currency,
          contributionFrequency: data.contributionFrequency,
          baseContribution: data.baseContribution,
          firstMeetingDate: data.firstMeetingDate ? new Date(data.firstMeetingDate) : undefined
        }
      })

      // Le propriétaire est automatiquement président de l'association
      const user = await tx.user.create({
        data: {
          email: data.email,
          password: hashedPassword,
          firstName: data.firstName,
          lastName: data.lastName,
          phone: data.phone,
          role: 'president', // Owner = President par défaut
          status: 'active',
          associationId: association.id
        },
        include: { association: true }
      })

      return { user, association }
    })

    // Générer le token
    const accessToken = generateToken(result.user.id, result.association.id)

    res.status(201).json({
      accessToken,
      user: {
        ...formatUser(result.user),
        associationId: result.association.id
      }
    })
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        message: 'Données invalides',
        errors: error.errors.map(e => e.message)
      })
    }
    console.error('Register error:', error)
    res.status(500).json({ message: 'Erreur serveur lors de l\'inscription' })
  }
})

// ==========================================
// POST /api/auth/login
// Email + password uniquement
// Le backend résout l'association via user.associationId
// ==========================================
router.post('/login', async (req: Request, res: Response) => {
  try {
    const data = loginSchema.parse(req.body)

    // Trouver l'utilisateur par email
    const user = await prisma.user.findUnique({
      where: { email: data.email },
      include: { association: true }
    })

    if (!user) {
      return res.status(401).json({ message: 'Email ou mot de passe incorrect' })
    }

    // Vérifier le statut
    if (user.status === 'suspended' || user.status === 'inactive') {
      return res.status(403).json({ message: 'Votre compte est désactivé. Contactez votre administrateur.' })
    }

    // Vérifier le mot de passe
    const isPasswordValid = await bcrypt.compare(data.password, user.password)
    if (!isPasswordValid) {
      return res.status(401).json({ message: 'Email ou mot de passe incorrect' })
    }

    // Générer le token avec le associationId dedans
    const accessToken = generateToken(user.id, user.associationId)

    res.json({
      accessToken,
      user: {
        ...formatUser(user),
        associationId: user.associationId
      }
    })
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        message: 'Données invalides',
        errors: error.errors.map(e => e.message)
      })
    }
    console.error('Login error:', error)
    res.status(500).json({ message: 'Erreur serveur lors de la connexion' })
  }
})

// ==========================================
// GET /api/auth/me
// Retourne le profil de l'utilisateur connecté
// ==========================================
router.get('/me', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.id },
      include: { association: true }
    })

    if (!user) {
      return res.status(404).json({ message: 'Utilisateur non trouvé' })
    }

    res.json({
      ...formatUser(user),
      associationId: user.associationId
    })
  } catch (error) {
    console.error('Me error:', error)
    res.status(500).json({ message: 'Erreur serveur' })
  }
})

export default router
