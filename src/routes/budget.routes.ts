// ========================================
// Stride - Budget Routes
// ========================================

import { Router, Response } from 'express'
import prisma from '../lib/prisma'
import { authenticate, AuthRequest } from '../middleware/auth.middleware'

const router = Router()

// ==========================================
// GET /api/budget/periods
// Liste des périodes budgétaires
// ==========================================
router.get('/periods', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const associationId = req.user!.associationId

    const periods = await prisma.budgetPeriod.findMany({
      where: { associationId },
      include: { lines: true },
      orderBy: { createdAt: 'desc' }
    })

    res.json(periods)
  } catch (error) {
    console.error('Get budget periods error:', error)
    res.status(500).json({ message: 'Erreur serveur' })
  }
})

// ==========================================
// GET /api/budget/periods/:id
// Détail d'une période avec ses lignes
// ==========================================
router.get('/periods/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const period = await prisma.budgetPeriod.findUnique({
      where: { id: req.params.id },
      include: { lines: { orderBy: { type: 'asc' } } }
    })

    if (!period) {
      return res.status(404).json({ message: 'Période non trouvée' })
    }

    res.json(period)
  } catch (error) {
    console.error('Get budget period detail error:', error)
    res.status(500).json({ message: 'Erreur serveur' })
  }
})

// ==========================================
// POST /api/budget/periods
// Créer une période budgétaire
// ==========================================
router.post('/periods', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const associationId = req.user!.associationId
    const { name, status } = req.body

    if (!name) {
      return res.status(400).json({ message: 'Le nom de la période est requis' })
    }

    const period = await prisma.budgetPeriod.create({
      data: {
        associationId,
        name,
        status: status || 'draft'
      }
    })

    res.status(201).json(period)
  } catch (error) {
    console.error('Create budget period error:', error)
    res.status(500).json({ message: 'Erreur serveur' })
  }
})

// ==========================================
// POST /api/budget/periods/:id/lines
// Ajouter une ligne budgétaire
// ==========================================
router.post('/periods/:id/lines', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { category, label, type, planned } = req.body

    if (!category || !label || !type) {
      return res.status(400).json({ message: 'category, label et type sont requis' })
    }

    const line = await prisma.budgetLine.create({
      data: {
        periodId: req.params.id,
        category,
        label,
        type,
        planned: planned || 0,
        actual: 0
      }
    })

    res.status(201).json(line)
  } catch (error) {
    console.error('Create budget line error:', error)
    res.status(500).json({ message: 'Erreur serveur' })
  }
})

// ==========================================
// PUT /api/budget/lines/:id
// Mettre à jour une ligne budgétaire (montant réel, verrouillage)
// ==========================================
router.put('/lines/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { actual, planned, isLocked, category, label } = req.body

    const data: any = {}
    if (actual !== undefined) data.actual = actual
    if (planned !== undefined) data.planned = planned
    if (isLocked !== undefined) data.isLocked = isLocked
    if (category) data.category = category
    if (label) data.label = label

    const line = await prisma.budgetLine.update({
      where: { id: req.params.id },
      data
    })

    res.json(line)
  } catch (error) {
    console.error('Update budget line error:', error)
    res.status(500).json({ message: 'Erreur serveur' })
  }
})

// ==========================================
// DELETE /api/budget/lines/:id
// Supprimer une ligne budgétaire
// ==========================================
router.delete('/lines/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const line = await prisma.budgetLine.findUnique({ where: { id: req.params.id } })
    if (!line) return res.status(404).json({ message: 'Ligne non trouvée' })
    if (line.isLocked) return res.status(400).json({ message: 'Cette ligne est verrouillée' })

    await prisma.budgetLine.delete({ where: { id: req.params.id } })
    res.json({ message: 'Ligne supprimée' })
  } catch (error) {
    console.error('Delete budget line error:', error)
    res.status(500).json({ message: 'Erreur serveur' })
  }
})

export default router
