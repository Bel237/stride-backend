import { Router } from 'express'
import prisma from '../lib/prisma'
import { authenticate, AuthRequest } from '../middleware/auth.middleware'

const router = Router()
router.use(authenticate)

// GET /api/minutes - List all meeting minutes
router.get('/', async (req: AuthRequest, res) => {
  try {
    const { status } = req.query
    const where: any = { associationId: req.user!.associationId }
    if (status) where.status = status

    const minutes = await (prisma as any).meetingMinutes.findMany({
      where,
      include: {
        event: { select: { id: true, title: true, date: true, type: true, location: true } },
        author: { select: { id: true, firstName: true, lastName: true } }
      },
      orderBy: { createdAt: 'desc' }
    })
    res.json(minutes)
  } catch (error: any) {
    res.status(500).json({ message: error.message })
  }
})

// GET /api/minutes/stats
router.get('/stats', async (req: AuthRequest, res) => {
  try {
    const assocId = req.user!.associationId
    const [total, approved, draft, review] = await Promise.all([
      (prisma as any).meetingMinutes.count({ where: { associationId: assocId } }),
      (prisma as any).meetingMinutes.count({ where: { associationId: assocId, status: 'approved' } }),
      (prisma as any).meetingMinutes.count({ where: { associationId: assocId, status: 'draft' } }),
      (prisma as any).meetingMinutes.count({ where: { associationId: assocId, status: 'review' } })
    ])
    res.json({ total, approved, draft, review })
  } catch (error: any) {
    res.status(500).json({ message: error.message })
  }
})

// GET /api/minutes/:id
router.get('/:id', async (req: AuthRequest, res) => {
  try {
    const minutes = await (prisma as any).meetingMinutes.findFirst({
      where: { id: req.params.id, associationId: req.user!.associationId },
      include: {
        event: {
          include: {
            attendances: {
              include: { user: { select: { id: true, firstName: true, lastName: true } } }
            }
          }
        },
        author: { select: { id: true, firstName: true, lastName: true } }
      }
    })
    if (!minutes) return res.status(404).json({ message: 'PV non trouvé' })
    res.json(minutes)
  } catch (error: any) {
    res.status(500).json({ message: error.message })
  }
})

// POST /api/minutes - Create meeting minutes
router.post('/', async (req: AuthRequest, res) => {
  try {
    const { eventId, title, content, decisions, actions } = req.body
    if (!eventId || !title) {
      return res.status(400).json({ message: 'eventId et titre requis' })
    }

    // Verify event belongs to association
    const event = await (prisma as any).event.findFirst({
      where: { id: eventId, associationId: req.user!.associationId },
      include: { attendances: true }
    })
    if (!event) return res.status(404).json({ message: 'Événement non trouvé' })

    // Count members
    const totalMembers = await prisma.user.count({
      where: { associationId: req.user!.associationId, status: 'active' }
    })

    const presentCount = event.attendances.filter((a: any) => a.status === 'present').length

    const minutes = await (prisma as any).meetingMinutes.create({
      data: {
        eventId,
        associationId: req.user!.associationId,
        title,
        content,
        decisions: decisions ? JSON.stringify(decisions) : null,
        actions: actions ? JSON.stringify(actions) : null,
        authorId: req.user!.id,
        presentCount,
        totalMembers
      },
      include: {
        event: { select: { id: true, title: true, date: true } },
        author: { select: { id: true, firstName: true, lastName: true } }
      }
    })
    res.status(201).json(minutes)
  } catch (error: any) {
    res.status(500).json({ message: error.message })
  }
})

// PUT /api/minutes/:id - Update minutes
router.put('/:id', async (req: AuthRequest, res) => {
  try {
    const existing = await (prisma as any).meetingMinutes.findFirst({
      where: { id: req.params.id, associationId: req.user!.associationId }
    })
    if (!existing) return res.status(404).json({ message: 'PV non trouvé' })

    const { title, content, decisions, actions, status } = req.body
    const minutes = await (prisma as any).meetingMinutes.update({
      where: { id: req.params.id },
      data: {
        ...(title && { title }),
        ...(content !== undefined && { content }),
        ...(decisions !== undefined && { decisions: JSON.stringify(decisions) }),
        ...(actions !== undefined && { actions: JSON.stringify(actions) }),
        ...(status && { status })
      },
      include: {
        event: { select: { id: true, title: true, date: true } },
        author: { select: { id: true, firstName: true, lastName: true } }
      }
    })
    res.json(minutes)
  } catch (error: any) {
    res.status(500).json({ message: error.message })
  }
})

// PUT /api/minutes/:id/status - Change status
router.put('/:id/status', async (req: AuthRequest, res) => {
  try {
    const { status } = req.body
    if (!['draft', 'review', 'approved', 'published'].includes(status)) {
      return res.status(400).json({ message: 'Statut invalide' })
    }
    const existing = await (prisma as any).meetingMinutes.findFirst({
      where: { id: req.params.id, associationId: req.user!.associationId }
    })
    if (!existing) return res.status(404).json({ message: 'PV non trouvé' })

    const minutes = await (prisma as any).meetingMinutes.update({
      where: { id: req.params.id },
      data: { status }
    })
    res.json(minutes)
  } catch (error: any) {
    res.status(500).json({ message: error.message })
  }
})

// DELETE /api/minutes/:id
router.delete('/:id', async (req: AuthRequest, res) => {
  try {
    const existing = await (prisma as any).meetingMinutes.findFirst({
      where: { id: req.params.id, associationId: req.user!.associationId }
    })
    if (!existing) return res.status(404).json({ message: 'PV non trouvé' })

    await (prisma as any).meetingMinutes.delete({ where: { id: req.params.id } })
    res.json({ message: 'PV supprimé' })
  } catch (error: any) {
    res.status(500).json({ message: error.message })
  }
})

export default router
