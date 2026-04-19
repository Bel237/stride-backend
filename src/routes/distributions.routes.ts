// ========================================
// Stride - Distributions (Tontine) Routes
// ========================================

import { Router, Response } from 'express'
import prisma from '../lib/prisma'
import { authenticate, AuthRequest } from '../middleware/auth.middleware'

const router = Router()

const MONTHS_FR = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'
]

// ==========================================
// GET /api/distributions/cycles?year=2026
// Liste des cycles de distribution
// ==========================================
router.get('/cycles', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { year } = req.query
    const associationId = req.user!.associationId

    const where: any = { associationId }
    if (year) where.year = parseInt(year as string)

    const cycles = await prisma.distributionCycle.findMany({
      where,
      include: {
        distributions: {
          include: { user: { select: { id: true, firstName: true, lastName: true } } },
          orderBy: { position: 'asc' }
        }
      },
      orderBy: { year: 'desc' }
    })

    res.json(cycles)
  } catch (error) {
    console.error('Get distribution cycles error:', error)
    res.status(500).json({ message: 'Erreur serveur' })
  }
})

// ==========================================
// GET /api/distributions/cycles/:year
// Détail d'un cycle pour une année
// ==========================================
router.get('/cycles/:year', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const associationId = req.user!.associationId
    const year = parseInt(req.params.year as string)

    let cycle = await prisma.distributionCycle.findUnique({
      where: { associationId_year: { associationId, year } },
      include: {
        distributions: {
          include: { user: { select: { id: true, firstName: true, lastName: true } } },
          orderBy: { position: 'asc' }
        }
      }
    })

    if (!cycle) {
      return res.status(404).json({ message: 'Aucun cycle trouvé pour cette année' })
    }

    res.json(cycle)
  } catch (error) {
    console.error('Get cycle detail error:', error)
    res.status(500).json({ message: 'Erreur serveur' })
  }
})

// ==========================================
// POST /api/distributions/cycles
// Créer un nouveau cycle avec algorithme round-robin
// Algorithme: les membres sont ordonnés par date d'adhésion (ancienneté),
// puis ceux qui n'ont jamais reçu passent en premier.
// Si un cycle précédent existe, on décale l'ordre pour que
// le dernier bénéficiaire de l'année précédente ne soit pas le premier.
// ==========================================
router.post('/cycles', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const associationId = req.user!.associationId
    const { year, algorithm } = req.body

    if (!year) {
      return res.status(400).json({ message: "L'année est requise" })
    }

    // Vérifier qu'il n'existe pas déjà
    const existing = await prisma.distributionCycle.findUnique({
      where: { associationId_year: { associationId, year } }
    })
    if (existing) {
      return res.status(409).json({ message: 'Un cycle existe déjà pour cette année' })
    }

    // Récupérer les membres actifs
    const members = await prisma.user.findMany({
      where: { associationId, status: 'active' },
      orderBy: { joinDate: 'asc' },
      select: { id: true, firstName: true, lastName: true, joinDate: true }
    })

    if (members.length === 0) {
      return res.status(400).json({ message: 'Aucun membre actif dans cette association' })
    }

    // Round-robin: vérifier le cycle précédent pour décaler
    let orderedMembers = [...members]
    const algo = algorithm || 'round_robin'

    if (algo === 'round_robin') {
      const previousCycle = await prisma.distributionCycle.findUnique({
        where: { associationId_year: { associationId, year: year - 1 } },
        include: { distributions: { orderBy: { position: 'asc' } } }
      })

      if (previousCycle && previousCycle.distributions.length > 0) {
        // Trouver le dernier bénéficiaire de l'année précédente
        const lastPosition = previousCycle.distributions[previousCycle.distributions.length - 1]
        const lastIndex = orderedMembers.findIndex(m => m.id === lastPosition?.userId)

        if (lastIndex !== -1) {
          // Décaler: celui après le dernier bénéficiaire commence
          const rotated = [
            ...orderedMembers.slice(lastIndex + 1),
            ...orderedMembers.slice(0, lastIndex + 1)
          ]
          orderedMembers = rotated
        }
      }
    } else if (algo === 'random') {
      // Mélange aléatoire (Fisher-Yates)
      for (let i = orderedMembers.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [orderedMembers[i], orderedMembers[j]] = [orderedMembers[j]!, orderedMembers[i]!]
      }
    }

    // Créer le cycle avec les distributions
    const cycle = await prisma.distributionCycle.create({
      data: {
        associationId,
        year,
        algorithm: algo,
        distributions: {
          create: orderedMembers.map((member, index) => ({
            userId: member.id,
            position: index + 1,
            month: MONTHS_FR[index % 12] || `Mois ${index + 1}`,
            amount: 0,
            status: 'pending'
          }))
        }
      },
      include: {
        distributions: {
          include: { user: { select: { id: true, firstName: true, lastName: true } } },
          orderBy: { position: 'asc' }
        }
      }
    })

    res.status(201).json(cycle)
  } catch (error) {
    console.error('Create distribution cycle error:', error)
    res.status(500).json({ message: 'Erreur serveur' })
  }
})

// ==========================================
// PUT /api/distributions/:id/distribute
// Enregistrer une distribution (marquer comme distribué)
// ==========================================
router.put('/:id/distribute', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { amount } = req.body

    const distribution = await prisma.distribution.update({
      where: { id: String(req.params.id) },
      data: {
        amount: amount || 0,
        status: 'distributed',
        distributedAt: new Date()
      },
      include: { user: { select: { id: true, firstName: true, lastName: true } } }
    })

    res.json(distribution)
  } catch (error) {
    console.error('Distribute error:', error)
    res.status(500).json({ message: 'Erreur serveur' })
  }
})

export default router
