// ========================================
// Stride - Loans (Prêts) Routes
// ========================================

import { Router, Response } from 'express'
import prisma from '../lib/prisma'
import { authenticate, AuthRequest } from '../middleware/auth.middleware'

const router = Router()

// ==========================================
// GET /api/loans
// Liste des prêts de l'association
// ==========================================
router.get('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const associationId = req.user!.associationId
    const { status } = req.query

    const where: any = { associationId }
    if (status) where.status = status as string

    const loans = await prisma.loan.findMany({
      where,
      include: {
        user: { select: { id: true, firstName: true, lastName: true, email: true } },
        repayments: { orderBy: { paidAt: 'desc' }, take: 5 }
      },
      orderBy: { createdAt: 'desc' }
    })

    res.json(loans)
  } catch (error) {
    console.error('Get loans error:', error)
    res.status(500).json({ message: 'Erreur serveur' })
  }
})

// ==========================================
// GET /api/loans/:id
// Détail d'un prêt avec historique de remboursements
// ==========================================
router.get('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const loan = await prisma.loan.findUnique({
      where: { id: req.params.id },
      include: {
        user: { select: { id: true, firstName: true, lastName: true, email: true } },
        repayments: {
          include: { user: { select: { id: true, firstName: true, lastName: true } } },
          orderBy: { paidAt: 'desc' }
        }
      }
    })

    if (!loan) {
      return res.status(404).json({ message: 'Prêt non trouvé' })
    }

    res.json(loan)
  } catch (error) {
    console.error('Get loan detail error:', error)
    res.status(500).json({ message: 'Erreur serveur' })
  }
})

// ==========================================
// POST /api/loans
// Créer une demande de prêt
// ==========================================
router.post('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const associationId = req.user!.associationId
    const { userId, amount, interestRate, durationMonths, purpose } = req.body

    if (!userId || !amount) {
      return res.status(400).json({ message: 'userId et amount sont requis' })
    }

    const rate = interestRate || 5
    const months = durationMonths || 12
    const totalWithInterest = amount * (1 + rate / 100)
    const monthly = Math.ceil(totalWithInterest / months)

    const loan = await prisma.loan.create({
      data: {
        associationId,
        userId,
        amount,
        interestRate: rate,
        durationMonths: months,
        monthlyPayment: monthly,
        remainingAmount: totalWithInterest,
        status: 'pending',
        purpose
      },
      include: {
        user: { select: { id: true, firstName: true, lastName: true } }
      }
    })

    res.status(201).json(loan)
  } catch (error) {
    console.error('Create loan error:', error)
    res.status(500).json({ message: 'Erreur serveur' })
  }
})

// ==========================================
// PUT /api/loans/:id/approve
// Approuver un prêt
// ==========================================
router.put('/:id/approve', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const loan = await prisma.loan.findUnique({ where: { id: req.params.id } })
    if (!loan) return res.status(404).json({ message: 'Prêt non trouvé' })
    if (loan.status !== 'pending') return res.status(400).json({ message: 'Ce prêt ne peut pas être approuvé' })

    const dueDate = new Date()
    dueDate.setMonth(dueDate.getMonth() + loan.durationMonths)

    const updated = await prisma.loan.update({
      where: { id: req.params.id },
      data: {
        status: 'active',
        approvalDate: new Date(),
        dueDate
      },
      include: { user: { select: { id: true, firstName: true, lastName: true } } }
    })

    res.json(updated)
  } catch (error) {
    console.error('Approve loan error:', error)
    res.status(500).json({ message: 'Erreur serveur' })
  }
})

// ==========================================
// PUT /api/loans/:id/reject
// Rejeter un prêt
// ==========================================
router.put('/:id/reject', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const updated = await prisma.loan.update({
      where: { id: req.params.id },
      data: { status: 'rejected' },
      include: { user: { select: { id: true, firstName: true, lastName: true } } }
    })

    res.json(updated)
  } catch (error) {
    console.error('Reject loan error:', error)
    res.status(500).json({ message: 'Erreur serveur' })
  }
})

// ==========================================
// POST /api/loans/:id/repay
// Enregistrer un remboursement
// ==========================================
router.post('/:id/repay', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { amount, note } = req.body
    const loanId = req.params.id

    const loan = await prisma.loan.findUnique({ where: { id: loanId } })
    if (!loan) return res.status(404).json({ message: 'Prêt non trouvé' })
    if (loan.status !== 'active') return res.status(400).json({ message: 'Ce prêt n\'est pas actif' })

    const newRemaining = Math.max(0, loan.remainingAmount - amount)
    const isCompleted = newRemaining <= 0

    const [repayment] = await prisma.$transaction([
      prisma.loanRepayment.create({
        data: {
          loanId,
          userId: loan.userId,
          amount,
          note
        }
      }),
      prisma.loan.update({
        where: { id: loanId },
        data: {
          remainingAmount: newRemaining,
          status: isCompleted ? 'completed' : 'active'
        }
      })
    ])

    res.json(repayment)
  } catch (error) {
    console.error('Repay loan error:', error)
    res.status(500).json({ message: 'Erreur serveur' })
  }
})

export default router
