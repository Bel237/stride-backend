import { Router } from 'express'
import prisma from '../lib/prisma'
import { authenticate, AuthRequest } from '../middleware/auth.middleware'

const router = Router()
router.use(authenticate)

// GET /api/voting - List voting sessions
router.get('/', async (req: AuthRequest, res) => {
  try {
    const { status } = req.query
    const where: any = { associationId: req.user!.associationId }
    if (status) where.status = status

    const sessions = await (prisma as any).votingSession.findMany({
      where,
      include: {
        options: {
          include: { votes: { select: { id: true } } },
          orderBy: { sortOrder: 'asc' }
        },
        votes: { select: { id: true, userId: true, optionId: true } },
        createdBy: { select: { id: true, firstName: true, lastName: true } }
      },
      orderBy: { createdAt: 'desc' }
    })

    // Count total members for participation %
    const totalMembers = await prisma.user.count({
      where: { associationId: req.user!.associationId, status: 'active' }
    })

    const currentUserId = req.user!.id
    const formatted = sessions.map((s: any) => {
      const userVote = s.votes.find((v: any) => v.userId === currentUserId)
      return {
        ...s,
        totalVotes: s.votes.length,
        participantsCount: totalMembers,
        userVote: userVote || null,
        options: s.options.map((o: any) => ({
          id: o.id,
          text: o.text,
          sortOrder: o.sortOrder,
          votes: o.votes.length,
          percentage: s.votes.length > 0 ? Math.round((o.votes.length / s.votes.length) * 100) : 0
        }))
      }
    })

    res.json(formatted)
  } catch (error: any) {
    res.status(500).json({ message: error.message })
  }
})

// GET /api/voting/:id - Session detail
router.get('/:id', async (req: AuthRequest, res) => {
  try {
    const session = await (prisma as any).votingSession.findFirst({
      where: { id: req.params.id, associationId: req.user!.associationId },
      include: {
        options: {
          include: { votes: { select: { id: true, userId: true } } },
          orderBy: { sortOrder: 'asc' }
        },
        votes: { select: { id: true, userId: true, optionId: true } },
        createdBy: { select: { id: true, firstName: true, lastName: true } }
      }
    })
    if (!session) return res.status(404).json({ message: 'Session de vote non trouvée' })

    const totalMembers = await prisma.user.count({
      where: { associationId: req.user!.associationId, status: 'active' }
    })

    // Check if current user has voted
    const userVote = session.votes.find((v: any) => v.userId === req.user!.id)

    res.json({
      ...session,
      totalVotes: session.votes.length,
      participantsCount: totalMembers,
      userVote: userVote || null,
      options: session.options.map((o: any) => ({
        id: o.id,
        text: o.text,
        sortOrder: o.sortOrder,
        votes: o.votes.length,
        percentage: session.votes.length > 0 ? Math.round((o.votes.length / session.votes.length) * 100) : 0
      }))
    })
  } catch (error: any) {
    res.status(500).json({ message: error.message })
  }
})

// POST /api/voting - Create voting session
router.post('/', async (req: AuthRequest, res) => {
  try {
    const { title, description, type, startDate, endDate, requiredQuorum, requiredMajority, options } = req.body
    if (!title || !startDate || !endDate || !options || options.length < 2) {
      return res.status(400).json({ message: 'Titre, dates et au moins 2 options requis' })
    }

    const session = await (prisma as any).votingSession.create({
      data: {
        associationId: req.user!.associationId,
        title,
        description,
        type: type || 'simple',
        status: 'draft',
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        requiredQuorum: requiredQuorum || 50,
        requiredMajority: requiredMajority || 50,
        createdById: req.user!.id,
        options: {
          create: options.map((opt: string, i: number) => ({
            text: opt,
            sortOrder: i
          }))
        }
      },
      include: {
        options: { orderBy: { sortOrder: 'asc' } }
      }
    })
    res.status(201).json(session)
  } catch (error: any) {
    res.status(500).json({ message: error.message })
  }
})

// PUT /api/voting/:id - Update session
router.put('/:id', async (req: AuthRequest, res) => {
  try {
    const existing = await (prisma as any).votingSession.findFirst({
      where: { id: req.params.id, associationId: req.user!.associationId }
    })
    if (!existing) return res.status(404).json({ message: 'Session non trouvée' })
    if (existing.status !== 'draft') {
      return res.status(400).json({ message: 'Seuls les brouillons peuvent être modifiés' })
    }

    const { title, description, type, startDate, endDate, requiredQuorum, requiredMajority } = req.body
    const session = await (prisma as any).votingSession.update({
      where: { id: req.params.id },
      data: {
        ...(title && { title }),
        ...(description !== undefined && { description }),
        ...(type && { type }),
        ...(startDate && { startDate: new Date(startDate) }),
        ...(endDate && { endDate: new Date(endDate) }),
        ...(requiredQuorum !== undefined && { requiredQuorum }),
        ...(requiredMajority !== undefined && { requiredMajority })
      }
    })
    res.json(session)
  } catch (error: any) {
    res.status(500).json({ message: error.message })
  }
})

// PUT /api/voting/:id/status - Activate / Complete session
router.put('/:id/status', async (req: AuthRequest, res) => {
  try {
    const { status } = req.body
    if (!['draft', 'active', 'completed'].includes(status)) {
      return res.status(400).json({ message: 'Statut invalide' })
    }
    const existing = await (prisma as any).votingSession.findFirst({
      where: { id: req.params.id, associationId: req.user!.associationId }
    })
    if (!existing) return res.status(404).json({ message: 'Session non trouvée' })

    const session = await (prisma as any).votingSession.update({
      where: { id: req.params.id },
      data: { status }
    })
    res.json(session)
  } catch (error: any) {
    res.status(500).json({ message: error.message })
  }
})

// POST /api/voting/:id/vote - Cast a vote
router.post('/:id/vote', async (req: AuthRequest, res) => {
  try {
    const { optionId } = req.body
    if (!optionId) return res.status(400).json({ message: 'optionId requis' })

    const session = await (prisma as any).votingSession.findFirst({
      where: { id: req.params.id, associationId: req.user!.associationId },
      include: { options: true }
    })
    if (!session) return res.status(404).json({ message: 'Session non trouvée' })
    if (session.status !== 'active') {
      return res.status(400).json({ message: 'Cette session de vote n\'est pas active' })
    }

    // Check end date
    if (new Date() > new Date(session.endDate)) {
      return res.status(400).json({ message: 'La période de vote est terminée' })
    }

    // Check option belongs to session
    const option = session.options.find((o: any) => o.id === optionId)
    if (!option) return res.status(400).json({ message: 'Option invalide' })

    // Check if already voted
    const existingVote = await (prisma as any).vote.findUnique({
      where: { sessionId_userId: { sessionId: session.id, userId: req.user!.id } }
    })
    if (existingVote) {
      return res.status(400).json({ message: 'Vous avez déjà voté pour cette session' })
    }

    const vote = await (prisma as any).vote.create({
      data: {
        sessionId: session.id,
        optionId,
        userId: req.user!.id
      }
    })
    res.status(201).json(vote)
  } catch (error: any) {
    res.status(500).json({ message: error.message })
  }
})

// DELETE /api/voting/:id
router.delete('/:id', async (req: AuthRequest, res) => {
  try {
    const existing = await (prisma as any).votingSession.findFirst({
      where: { id: req.params.id, associationId: req.user!.associationId }
    })
    if (!existing) return res.status(404).json({ message: 'Session non trouvée' })

    await (prisma as any).votingSession.delete({ where: { id: req.params.id } })
    res.json({ message: 'Session supprimée' })
  } catch (error: any) {
    res.status(500).json({ message: error.message })
  }
})

export default router
