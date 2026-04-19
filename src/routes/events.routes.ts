import { Router, Response } from 'express'
import prisma from '../lib/prisma'
import { authenticate, AuthRequest } from '../middleware/auth.middleware'

const router = Router()
router.use(authenticate)

// GET /api/events - List events (with optional filters)
router.get('/', async (req: AuthRequest, res: Response) => {
  try {
    const { type, status, month, year } = req.query
    const where: any = { associationId: req.user!.associationId }
    if (type) where.type = type
    if (status) where.status = status
    if (month && year) {
      const m = parseInt(month as string)
      const y = parseInt(year as string)
      where.date = {
        gte: new Date(y, m - 1, 1),
        lt: new Date(y, m, 1)
      }
    } else if (year) {
      const y = parseInt(year as string)
      where.date = {
        gte: new Date(y, 0, 1),
        lt: new Date(y + 1, 0, 1)
      }
    }

    const events = await prisma.event.findMany({
      where,
      include: {
        attendances: { select: { id: true, status: true } },
        minutes: { select: { id: true, status: true } }
      },
      orderBy: { date: 'desc' }
    })

    res.json(events)
  } catch (error: any) {
    res.status(500).json({ message: error.message })
  }
})

// GET /api/events/upcoming - Upcoming events
router.get('/upcoming', async (req: AuthRequest, res: Response) => {
  try {
    const events = await prisma.event.findMany({
      where: {
        associationId: req.user!.associationId,
        date: { gte: new Date() },
        status: { in: ['scheduled', 'in_progress'] }
      },
      include: {
        attendances: { select: { id: true, status: true } }
      },
      orderBy: { date: 'asc' },
      take: 10
    })
    res.json(events)
  } catch (error: any) {
    res.status(500).json({ message: error.message })
  }
})

// GET /api/events/stats - Event statistics
router.get('/stats', async (req: AuthRequest, res: Response) => {
  try {
    const assocId = req.user!.associationId
    const [total, scheduled, completed, cancelled] = await Promise.all([
      prisma.event.count({ where: { associationId: assocId } }),
      prisma.event.count({ where: { associationId: assocId, status: 'scheduled' } }),
      prisma.event.count({ where: { associationId: assocId, status: 'completed' } }),
      prisma.event.count({ where: { associationId: assocId, status: 'cancelled' } })
    ])
    res.json({ total, scheduled, completed, cancelled })
  } catch (error: any) {
    res.status(500).json({ message: error.message })
  }
})

// GET /api/events/:id - Event detail with attendances
router.get('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const event = await prisma.event.findFirst({
      where: { id: req.params.id as string, associationId: req.user!.associationId },
      include: {
        attendances: {
          include: { user: { select: { id: true, firstName: true, lastName: true, email: true, role: true } } }
        },
        minutes: true
      }
    })
    if (!event) return res.status(404).json({ message: 'Événement non trouvé' })
    res.json(event)
  } catch (error: any) {
    res.status(500).json({ message: error.message })
  }
})

// POST /api/events - Create event
router.post('/', async (req: AuthRequest, res: Response) => {
  try {
    const { title, type, description, date, startTime, endTime, location, fineAmount } = req.body
    if (!title || !date || !startTime) {
      return res.status(400).json({ message: 'Titre, date et heure de début requis' })
    }

    const event = await prisma.event.create({
      data: {
        associationId: req.user!.associationId,
        title,
        type: type || 'assembly',
        description,
        date: new Date(date),
        startTime,
        endTime,
        location,
        fineAmount: fineAmount || 5000,
        createdById: req.user!.id
      }
    })
    res.status(201).json(event)
  } catch (error: any) {
    res.status(500).json({ message: error.message })
  }
})

// PUT /api/events/:id - Update event
router.put('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const existing = await prisma.event.findFirst({
      where: { id: req.params.id as string, associationId: req.user!.associationId }
    })
    if (!existing) return res.status(404).json({ message: 'Événement non trouvé' })

    const { title, type, description, date, startTime, endTime, location, status, fineAmount } = req.body
    const event = await prisma.event.update({
      where: { id: req.params.id as string },
      data: {
        ...(title && { title }),
        ...(type && { type }),
        ...(description !== undefined && { description }),
        ...(date && { date: new Date(date) }),
        ...(startTime && { startTime }),
        ...(endTime !== undefined && { endTime }),
        ...(location !== undefined && { location }),
        ...(status && { status }),
        ...(fineAmount !== undefined && { fineAmount })
      }
    })
    res.json(event)
  } catch (error: any) {
    res.status(500).json({ message: error.message })
  }
})

// PUT /api/events/:id/status - Change event status (start, complete, cancel)
router.put('/:id/status', async (req: AuthRequest, res: Response) => {
  try {
    const { status } = req.body
    if (!['scheduled', 'in_progress', 'completed', 'cancelled'].includes(status)) {
      return res.status(400).json({ message: 'Statut invalide' })
    }
    const existing = await prisma.event.findFirst({
      where: { id: req.params.id as string, associationId: req.user!.associationId }
    })
    if (!existing) return res.status(404).json({ message: 'Événement non trouvé' })

    const event = await prisma.event.update({
      where: { id: req.params.id as string },
      data: { status }
    })
    res.json(event)
  } catch (error: any) {
    res.status(500).json({ message: error.message })
  }
})

// DELETE /api/events/:id
router.delete('/:id', async (req: AuthRequest, res: Response) => {
  try {
    const existing = await prisma.event.findFirst({
      where: { id: req.params.id as string, associationId: req.user!.associationId }
    })
    if (!existing) return res.status(404).json({ message: 'Événement non trouvé' })

    await prisma.event.delete({ where: { id: req.params.id as string } })
    res.json({ message: 'Événement supprimé' })
  } catch (error: any) {
    res.status(500).json({ message: error.message })
  }
})

// ========================================
// ATTENDANCE (Présences)
// ========================================

// POST /api/events/:id/attendance - Mark attendance (bulk)
router.post('/:id/attendance', async (req: AuthRequest, res: Response) => {
  try {
    const event = await prisma.event.findFirst({
      where: { id: req.params.id as string, associationId: req.user!.associationId }
    })
    if (!event) return res.status(404).json({ message: 'Événement non trouvé' })

    const { attendances } = req.body // [{ userId, status, note }]
    if (!Array.isArray(attendances)) {
      return res.status(400).json({ message: 'Format invalide: attendances doit être un tableau' })
    }

    const results = []
    for (const att of attendances) {
      const fineApplied = att.status === 'absent' ? event.fineAmount : 0
      const result = await prisma.eventAttendance.upsert({
        where: { eventId_userId: { eventId: event.id, userId: att.userId } },
        update: { status: att.status, fineApplied, note: att.note },
        create: {
          eventId: event.id,
          userId: att.userId,
          status: att.status,
          fineApplied,
          note: att.note
        }
      })
      results.push(result)
    }

    res.json(results)
  } catch (error: any) {
    res.status(500).json({ message: error.message })
  }
})

// PUT /api/events/:id/attendance/:userId - Toggle single attendance
router.put('/:id/attendance/:userId', async (req: AuthRequest, res: Response) => {
  try {
    const event = await prisma.event.findFirst({
      where: { id: req.params.id as string, associationId: req.user!.associationId }
    })
    if (!event) return res.status(404).json({ message: 'Événement non trouvé' })

    const { status, note } = req.body as { status: string, note?: string }
    if (!['present', 'absent', 'excused'].includes(status)) {
      return res.status(400).json({ message: 'Statut invalide' })
    }

    const fineApplied = status === 'absent' ? event.fineAmount : 0
    const attendance = await prisma.eventAttendance.upsert({
      where: { eventId_userId: { eventId: event.id, userId: req.params.userId as string } },
      update: { status, fineApplied, note },
      create: {
        eventId: event.id,
        userId: req.params.userId as string,
        status,
        fineApplied,
        note
      }
    })
    res.json(attendance)
  } catch (error: any) {
    res.status(500).json({ message: error.message })
  }
})

// GET /api/events/member/attendance - Get current user's attendance history
router.get('/member/attendance', async (req: AuthRequest, res: Response) => {
  try {
    const attendances = await prisma.eventAttendance.findMany({
      where: { userId: req.user!.id },
      include: {
        event: { select: { id: true, title: true, date: true, type: true, status: true, location: true, startTime: true } }
      },
      orderBy: { event: { date: 'desc' } }
    })

    const total = attendances.length
    const presents = attendances.filter((a: any) => a.status === 'present').length
    const absents = attendances.filter((a: any) => a.status === 'absent').length
    const excused = attendances.filter((a: any) => a.status === 'excused').length
    const totalFines = attendances.reduce((sum: number, a: any) => sum + a.fineApplied, 0)

    res.json({
      attendances,
      stats: { total, presents, absents, excused, totalFines }
    })
  } catch (error: any) {
    res.status(500).json({ message: error.message })
  }
})

export default router
