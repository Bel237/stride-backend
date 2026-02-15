// ========================================
// Stride - Savings (Épargne) Routes
// ========================================

import { Router, Response } from 'express'
import prisma from '../lib/prisma'
import { authenticate, AuthRequest } from '../middleware/auth.middleware'

const router = Router()

// ==========================================
// GET /api/savings/accounts
// Liste des comptes épargne de l'association
// ==========================================
router.get('/accounts', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const associationId = req.user!.associationId
    const { type, status } = req.query

    const where: any = { associationId }
    if (type) where.accountType = type as string
    if (status) where.status = status as string

    const accounts = await prisma.savingsAccount.findMany({
      where,
      include: {
        user: { select: { id: true, firstName: true, lastName: true, email: true } },
        transactions: { orderBy: { createdAt: 'desc' }, take: 3 }
      },
      orderBy: { createdAt: 'desc' }
    })

    res.json(accounts)
  } catch (error) {
    console.error('Get savings accounts error:', error)
    res.status(500).json({ message: 'Erreur serveur' })
  }
})

// ==========================================
// GET /api/savings/accounts/:id
// Détail d'un compte avec transactions
// ==========================================
router.get('/accounts/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const account = await prisma.savingsAccount.findUnique({
      where: { id: req.params.id },
      include: {
        user: { select: { id: true, firstName: true, lastName: true, email: true } },
        transactions: { orderBy: { createdAt: 'desc' } }
      }
    })

    if (!account) {
      return res.status(404).json({ message: 'Compte non trouvé' })
    }

    res.json(account)
  } catch (error) {
    console.error('Get savings account detail error:', error)
    res.status(500).json({ message: 'Erreur serveur' })
  }
})

// ==========================================
// POST /api/savings/accounts
// Créer un compte épargne
// ==========================================
router.post('/accounts', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const associationId = req.user!.associationId
    const { userId, accountType, interestRate, initialDeposit, maturityDate } = req.body

    if (!userId) {
      return res.status(400).json({ message: 'userId est requis' })
    }

    const account = await prisma.savingsAccount.create({
      data: {
        associationId,
        userId,
        accountType: accountType || 'epargne',
        balance: initialDeposit || 0,
        interestRate: interestRate || 3.5,
        maturityDate: maturityDate ? new Date(maturityDate) : undefined,
        transactions: initialDeposit ? {
          create: {
            type: 'deposit',
            amount: initialDeposit,
            description: 'Dépôt initial',
            balanceAfter: initialDeposit
          }
        } : undefined
      },
      include: {
        user: { select: { id: true, firstName: true, lastName: true } }
      }
    })

    res.status(201).json(account)
  } catch (error) {
    console.error('Create savings account error:', error)
    res.status(500).json({ message: 'Erreur serveur' })
  }
})

// ==========================================
// POST /api/savings/accounts/:id/deposit
// Effectuer un dépôt
// ==========================================
router.post('/accounts/:id/deposit', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { amount, description } = req.body
    const accountId = req.params.id

    if (!amount || amount <= 0) {
      return res.status(400).json({ message: 'Montant invalide' })
    }

    const account = await prisma.savingsAccount.findUnique({ where: { id: accountId } })
    if (!account) return res.status(404).json({ message: 'Compte non trouvé' })

    const newBalance = account.balance + amount

    const [transaction] = await prisma.$transaction([
      prisma.savingsTransaction.create({
        data: {
          accountId,
          type: 'deposit',
          amount,
          description: description || 'Dépôt',
          balanceAfter: newBalance
        }
      }),
      prisma.savingsAccount.update({
        where: { id: accountId },
        data: { balance: newBalance }
      })
    ])

    res.json(transaction)
  } catch (error) {
    console.error('Deposit error:', error)
    res.status(500).json({ message: 'Erreur serveur' })
  }
})

// ==========================================
// POST /api/savings/accounts/:id/withdraw
// Effectuer un retrait
// ==========================================
router.post('/accounts/:id/withdraw', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { amount, description } = req.body
    const accountId = req.params.id

    if (!amount || amount <= 0) {
      return res.status(400).json({ message: 'Montant invalide' })
    }

    const account = await prisma.savingsAccount.findUnique({ where: { id: accountId } })
    if (!account) return res.status(404).json({ message: 'Compte non trouvé' })
    if (account.balance < amount) return res.status(400).json({ message: 'Solde insuffisant' })

    const newBalance = account.balance - amount

    const [transaction] = await prisma.$transaction([
      prisma.savingsTransaction.create({
        data: {
          accountId,
          type: 'withdrawal',
          amount,
          description: description || 'Retrait',
          balanceAfter: newBalance
        }
      }),
      prisma.savingsAccount.update({
        where: { id: accountId },
        data: { balance: newBalance }
      })
    ])

    res.json(transaction)
  } catch (error) {
    console.error('Withdrawal error:', error)
    res.status(500).json({ message: 'Erreur serveur' })
  }
})

// ==========================================
// GET /api/savings/transactions
// Dernières transactions (toutes)
// ==========================================
router.get('/transactions', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const associationId = req.user!.associationId

    const transactions = await prisma.savingsTransaction.findMany({
      where: {
        account: { associationId }
      },
      include: {
        account: {
          select: { id: true, accountType: true, user: { select: { firstName: true, lastName: true } } }
        }
      },
      orderBy: { createdAt: 'desc' },
      take: 20
    })

    res.json(transactions)
  } catch (error) {
    console.error('Get savings transactions error:', error)
    res.status(500).json({ message: 'Erreur serveur' })
  }
})

export default router
