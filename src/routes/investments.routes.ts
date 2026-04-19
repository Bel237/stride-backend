// ========================================
// Stride - Investments Routes
// ========================================

import { Router, Response } from 'express'
import prisma from '../lib/prisma'
import { authenticate, AuthRequest } from '../middleware/auth.middleware'

const router = Router()

// ==========================================
// GET /api/investments
// Liste des investissements de l'association
// ==========================================
router.get('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const associationId = req.user!.associationId

    const investments = await prisma.investment.findMany({
      where: { associationId },
      include: {
        transactions: { orderBy: { createdAt: 'desc' }, take: 5 }
      },
      orderBy: { createdAt: 'desc' }
    })

    res.json(investments)
  } catch (error) {
    console.error('Get investments error:', error)
    res.status(500).json({ message: 'Erreur serveur' })
  }
})

// ==========================================
// GET /api/investments/:id
// Détail d'un investissement
// ==========================================
router.get('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const investment = await prisma.investment.findUnique({
      where: { id: req.params.id as string },
      include: {
        transactions: { orderBy: { createdAt: 'desc' } }
      }
    })

    if (!investment) {
      return res.status(404).json({ message: 'Investissement non trouvé' })
    }

    res.json(investment)
  } catch (error) {
    console.error('Get investment detail error:', error)
    res.status(500).json({ message: 'Erreur serveur' })
  }
})

// ==========================================
// POST /api/investments
// Créer un investissement
// ==========================================
router.post('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const associationId = req.user!.associationId
    const { name, type, initialAmount, risk, durationMonths, startDate } = req.body

    if (!name || !type || !initialAmount) {
      return res.status(400).json({ message: 'name, type et initialAmount sont requis' })
    }

    const investment = await prisma.investment.create({
      data: {
        associationId,
        name,
        type,
        initialAmount,
        currentValue: initialAmount,
        risk: risk || 'medium',
        durationMonths: durationMonths || 12,
        startDate: startDate ? new Date(startDate) : new Date(),
        transactions: {
          create: {
            type: 'injection',
            amount: initialAmount,
            label: 'Capital initial'
          }
        }
      },
      include: { transactions: true }
    })

    res.status(201).json(investment)
  } catch (error) {
    console.error('Create investment error:', error)
    res.status(500).json({ message: 'Erreur serveur' })
  }
})

// ==========================================
// PUT /api/investments/:id
// Mettre à jour la valorisation
// ==========================================
router.put('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { currentValue, status } = req.body

    const data: any = {}
    if (currentValue !== undefined) data.currentValue = currentValue
    if (status) data.status = status

    const investment = await prisma.investment.update({
      where: { id: req.params.id as string },
      data,
      include: { transactions: { orderBy: { createdAt: 'desc' }, take: 5 } }
    })

    res.json(investment)
  } catch (error) {
    console.error('Update investment error:', error)
    res.status(500).json({ message: 'Erreur serveur' })
  }
})

// ==========================================
// POST /api/investments/:id/transactions
// Ajouter une transaction (injection, dividende, liquidation)
// ==========================================
router.post('/:id/transactions', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { type, amount, label } = req.body
    const investmentId = req.params.id as string

    if (!type || !amount) {
      return res.status(400).json({ message: 'type et amount sont requis' })
    }

    const investment = await prisma.investment.findUnique({ where: { id: investmentId as string } })
    if (!investment) return res.status(404).json({ message: 'Investissement non trouvé' })

    // Mettre à jour la valeur courante
    let newValue = investment.currentValue
    if (type === 'injection') newValue += amount
    else if (type === 'dividend') newValue += amount
    else if (type === 'liquidation') newValue -= amount

    const [transaction] = await prisma.$transaction([
      prisma.investmentTransaction.create({
        data: { investmentId: investmentId as string, type, amount, label }
      }),
      prisma.investment.update({
        where: { id: investmentId as string },
        data: { currentValue: Math.max(0, newValue) }
      })
    ])

    res.json(transaction)
  } catch (error) {
    console.error('Add investment transaction error:', error)
    res.status(500).json({ message: 'Erreur serveur' })
  }
})

// ==========================================
// GET /api/investments/transactions/recent
// Dernières transactions d'investissement
// ==========================================
router.get('/transactions/recent', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const associationId = req.user!.associationId

    const transactions = await prisma.investmentTransaction.findMany({
      where: { investment: { associationId } },
      include: {
        investment: { select: { id: true, name: true, type: true } }
      },
      orderBy: { createdAt: 'desc' },
      take: 20
    })

    res.json(transactions)
  } catch (error) {
    console.error('Get investment transactions error:', error)
    res.status(500).json({ message: 'Erreur serveur' })
  }
})

export default router
