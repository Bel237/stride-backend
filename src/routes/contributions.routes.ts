// ========================================
// Stride - Contributions (Cotisations) Routes
// ========================================

import { Router, Response } from 'express'
import prisma from '../lib/prisma'
import { authenticate, AuthRequest } from '../middleware/auth.middleware'

const router = Router()

// ==========================================
// GET /api/contributions/sessions?year=2026
// Liste des sessions de cotisation
// ==========================================
router.get('/sessions', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { year } = req.query
    const associationId = req.user!.associationId

    const where: any = { associationId }
    if (year) where.year = parseInt(year as string)

    const sessions = await prisma.contributionSession.findMany({
      where,
      include: {
        contributions: {
          include: { user: { select: { id: true, firstName: true, lastName: true } } }
        }
      },
      orderBy: [{ year: 'desc' }, { month: 'desc' }]
    })

    res.json(sessions)
  } catch (error) {
    console.error('Get contribution sessions error:', error)
    res.status(500).json({ message: 'Erreur serveur' })
  }
})

// ==========================================
// GET /api/contributions/sessions/:month/:year
// Détail d'une session (avec cotisations de tous les membres)
// ==========================================
router.get('/sessions/:month/:year', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const associationId = req.user!.associationId
    const month = parseInt(req.params.month as string)
    const year = parseInt(req.params.year as string)

    // Trouver ou créer la session
    let session = await prisma.contributionSession.findUnique({
      where: { associationId_month_year: { associationId, month, year } },
      include: {
        contributions: {
          include: { user: { select: { id: true, firstName: true, lastName: true, email: true } } }
        }
      }
    })

    if (!session) {
      // Créer la session + une cotisation "unpaid" pour chaque membre
      const members = await prisma.user.findMany({
        where: { associationId, status: 'active' },
        select: { id: true }
      })

      session = await prisma.contributionSession.create({
        data: {
          associationId,
          month,
          year,
          contributions: {
            create: members.map(m => ({
              userId: m.id,
              amountSavings: 0,
              amountTontine: 0,
              status: 'unpaid'
            }))
          }
        },
        include: {
          contributions: {
            include: { user: { select: { id: true, firstName: true, lastName: true, email: true } } }
          }
        }
      })
    }

    res.json(session)
  } catch (error) {
    console.error('Get session detail error:', error)
    res.status(500).json({ message: 'Erreur serveur' })
  }
})

// ==========================================
// PUT /api/contributions/:id/pay
// Enregistrer le paiement d'une cotisation
// ==========================================
router.put('/:id/pay', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { amountSavings, amountTontine } = req.body

    const contribution = await prisma.contribution.update({
      where: { id: req.params.id as string },
      data: {
        amountSavings: amountSavings || 0,
        amountTontine: amountTontine || 0,
        status: 'paid',
        paidAt: new Date()
      },
      include: { user: { select: { id: true, firstName: true, lastName: true } } }
    })

    res.json(contribution)
  } catch (error) {
    console.error('Pay contribution error:', error)
    res.status(500).json({ message: 'Erreur serveur' })
  }
})

export default router
