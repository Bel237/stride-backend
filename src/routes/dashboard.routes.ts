// ========================================
// Stride - Dashboard Routes (aggregated data)
// ========================================

import { Router, Response } from 'express'
import prisma from '../lib/prisma'
import { authenticate, AuthRequest } from '../middleware/auth.middleware'

const router = Router()

// ==========================================
// GET /api/dashboard/bureau
// Aggregated data for the bureau (executive) dashboard
// ==========================================
router.get('/bureau', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const associationId = req.user!.associationId

    // Members
    const totalMembers = await prisma.user.count({ where: { associationId } })
    const activeMembers = await prisma.user.count({ where: { associationId, status: 'active' } })

    // Members with details for the table
    const members: any[] = await prisma.user.findMany({
      where: { associationId },
      select: {
        id: true, firstName: true, lastName: true, role: true, status: true,
        contributions: { select: { amountSavings: true, amountTontine: true } },
        loans: { select: { amount: true, status: true, remainingAmount: true } }
      }
    })

    const membersTable = members.map((m: any) => {
      const totalEpargne = m.contributions.reduce((s: number, c: any) => s + c.amountSavings + c.amountTontine, 0)
      const activeLoan = m.loans.find((l: any) => l.status === 'approved')
      return {
        id: m.id,
        firstName: m.firstName,
        lastName: m.lastName,
        role: m.role,
        status: m.status,
        totalEpargne,
        pretEnCours: activeLoan ? activeLoan.remainingAmount : 0,
        cotisationStatus: 'active' // will be refined below
      }
    })

    // All contributions
    const allContributions: any[] = await prisma.contribution.findMany({
      where: { session: { associationId } },
      select: { amountSavings: true, amountTontine: true, userId: true }
    })
    const totalContributions = allContributions.reduce((s: number, c: any) => s + c.amountSavings + c.amountTontine, 0)

    // Loans
    const allLoans: any[] = await prisma.loan.findMany({
      where: { associationId },
      select: { amount: true, remainingAmount: true, status: true }
    })
    const totalLoansOutstanding = allLoans
      .filter((l: any) => l.status === 'approved')
      .reduce((s: number, l: any) => s + l.remainingAmount, 0)
    const activeLoansCount = allLoans.filter((l: any) => l.status === 'approved').length

    // Current month contributions (recouvrement)
    const now = new Date()
    const currentMonth = now.getMonth() + 1
    const currentYear = now.getFullYear()
    const currentSession: any = await prisma.contributionSession.findFirst({
      where: { associationId, month: currentMonth, year: currentYear },
      include: { contributions: { select: { userId: true } } }
    })
    const paidMembersThisMonth = currentSession ? currentSession.contributions.length : 0
    const tauxRecouvrement = activeMembers > 0 ? Math.round((paidMembersThisMonth / activeMembers) * 100) : 0

    // Recent sanctions
    const recentSanctions: any[] = await prisma.sanction.findMany({
      where: { associationId },
      orderBy: { createdAt: 'desc' },
      take: 5,
      include: { user: { select: { firstName: true, lastName: true } } }
    })

    // Upcoming events
    const upcomingEvents: any[] = await prisma.event.findMany({
      where: {
        associationId,
        date: { gte: now },
        status: { not: 'cancelled' }
      },
      orderBy: { date: 'asc' },
      take: 3,
      select: { id: true, title: true, type: true, date: true, location: true }
    })

    // Alerts
    const alerts: any[] = []
    const overdueLoans = allLoans.filter((l: any) => l.status === 'approved' && l.remainingAmount > 0).length
    if (overdueLoans > 0) {
      alerts.push({ type: 'loan', msg: `${overdueLoans} prêt(s) en cours de remboursement`, severity: 'medium' })
    }
    if (tauxRecouvrement < 50) {
      alerts.push({ type: 'contribution', msg: `Taux de recouvrement faible: ${tauxRecouvrement}%`, severity: 'high' })
    }
    const pendingSanctions = await prisma.sanction.count({ where: { associationId, status: 'appliquee' } })
    if (pendingSanctions > 0) {
      alerts.push({ type: 'sanction', msg: `${pendingSanctions} sanction(s) active(s)`, severity: 'medium' })
    }

    res.json({
      totalMembers,
      activeMembers,
      totalContributions,
      totalLoansOutstanding,
      activeLoansCount,
      tauxRecouvrement,
      paidMembersThisMonth,
      membersTable,
      alerts,
      upcomingEvents: upcomingEvents.map((e: any) => ({
        id: e.id,
        title: e.title,
        type: e.type,
        date: e.date,
        location: e.location
      })),
      recentSanctions: recentSanctions.map((s: any) => ({
        id: s.id,
        userName: `${s.user.firstName} ${s.user.lastName}`,
        type: s.type,
        amount: s.amount,
        status: s.status,
        createdAt: s.createdAt
      }))
    })
  } catch (error) {
    console.error('Error loading bureau dashboard:', error)
    res.status(500).json({ message: 'Erreur serveur' })
  }
})

// ==========================================
// GET /api/dashboard/member
// Aggregated data for the member dashboard
// ==========================================
router.get('/member', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id
    const associationId = req.user!.associationId

    // User info
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, firstName: true, lastName: true, role: true, createdAt: true }
    })

    // Total members in association
    const totalMembers = await prisma.user.count({ where: { associationId, status: 'active' } })

    // My contributions
    const myContributions: any[] = await prisma.contribution.findMany({
      where: { userId, session: { associationId } },
      include: { session: { select: { month: true, year: true } } },
      orderBy: { paidAt: 'desc' },
      take: 6
    })
    const totalContributed = myContributions.reduce((s: number, c: any) => s + c.amountSavings + c.amountTontine, 0)

    const monthNames = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre']
    const recentContributions = myContributions.map((c: any) => ({
      id: c.id,
      mois: `${monthNames[c.session.month - 1]} ${c.session.year}`,
      amount: c.amountSavings + c.amountTontine,
      paidAt: c.paidAt,
      status: 'payee'
    }))

    // My active loan
    const activeLoan: any = await prisma.loan.findFirst({
      where: { userId, associationId, status: 'approved' },
      include: { repayments: { orderBy: { paidAt: 'desc' }, take: 1 } }
    })

    let loanInfo = null
    if (activeLoan) {
      loanInfo = {
        id: activeLoan.id,
        amount: activeLoan.amount,
        remainingAmount: activeLoan.remainingAmount,
        monthlyPayment: activeLoan.monthlyPayment,
        dueDate: activeLoan.dueDate,
        interestRate: activeLoan.interestRate
      }
    }

    // My savings
    const savingsAccounts: any[] = await prisma.savingsAccount.findMany({
      where: { userId, associationId },
      select: { id: true, accountType: true, balance: true }
    })
    const totalSavings = savingsAccounts.reduce((s: number, a: any) => s + a.balance, 0)

    // My sanctions
    const activeSanctions = await prisma.sanction.count({ where: { userId, associationId, status: 'appliquee' } })

    // Upcoming events
    const now = new Date()
    const upcomingEvents: any[] = await prisma.event.findMany({
      where: {
        associationId,
        date: { gte: now },
        status: { not: 'cancelled' }
      },
      orderBy: { date: 'asc' },
      take: 1,
      select: { id: true, title: true, type: true, date: true, location: true }
    })

    const nextEvent = upcomingEvents.length > 0 ? {
      title: upcomingEvents[0].title,
      date: upcomingEvents[0].date,
      location: upcomingEvents[0].location,
      type: upcomingEvents[0].type
    } : null

    res.json({
      user: {
        firstName: user?.firstName || '',
        lastName: user?.lastName || '',
        role: user?.role || 'member',
        joinDate: user?.createdAt
      },
      totalMembers,
      totalContributed,
      totalSavings,
      recentContributions,
      loanInfo,
      activeSanctions,
      nextEvent,
      savingsAccounts: savingsAccounts.map((a: any) => ({
        type: a.accountType,
        balance: a.balance
      }))
    })
  } catch (error) {
    console.error('Error loading member dashboard:', error)
    res.status(500).json({ message: 'Erreur serveur' })
  }
})

export default router
