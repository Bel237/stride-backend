// ========================================
// Stride - Audit Logs Routes
// ========================================

import { Router, Response } from 'express'
import prisma from '../lib/prisma'
import { authenticate, AuthRequest } from '../middleware/auth.middleware'

const router = Router()

// ==========================================
// GET /api/audit
// List audit logs
// ==========================================
router.get('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const associationId = req.user!.associationId
    const severity = req.query.severity as string | undefined
    const search = req.query.search as string | undefined
    const limit = parseInt(req.query.limit as string) || 50

    const where: any = { associationId }

    if (severity && severity !== 'all') where.severity = severity

    if (search) {
      where.OR = [
        { resource: { contains: search, mode: 'insensitive' } },
        { details: { contains: search, mode: 'insensitive' } },
        { user: { firstName: { contains: search, mode: 'insensitive' } } },
        { user: { lastName: { contains: search, mode: 'insensitive' } } }
      ]
    }

    const logs: any[] = await prisma.auditLog.findMany({
      where,
      include: {
        user: { select: { id: true, firstName: true, lastName: true } }
      },
      orderBy: { createdAt: 'desc' },
      take: limit
    })

    const result = logs.map((l: any) => ({
      id: l.id,
      userName: `${l.user.firstName} ${l.user.lastName}`,
      userId: l.user.id,
      action: l.action,
      resource: l.resource,
      details: l.details,
      ipAddress: l.ipAddress,
      severity: l.severity,
      createdAt: l.createdAt
    }))

    res.json(result)
  } catch (error) {
    console.error('Error loading audit logs:', error)
    res.status(500).json({ message: 'Erreur serveur' })
  }
})

// ==========================================
// GET /api/audit/stats
// Audit log statistics
// ==========================================
router.get('/stats', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const associationId = req.user!.associationId

    const total = await prisma.auditLog.count({ where: { associationId } })
    const critical = await prisma.auditLog.count({ where: { associationId, severity: 'critical' } })
    const high = await prisma.auditLog.count({ where: { associationId, severity: 'high' } })

    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const todayCount = await prisma.auditLog.count({
      where: { associationId, createdAt: { gte: today } }
    })

    res.json({ total, critical, high, todayCount })
  } catch (error) {
    console.error('Error loading audit stats:', error)
    res.status(500).json({ message: 'Erreur serveur' })
  }
})

// ==========================================
// POST /api/audit
// Create an audit log entry (internal use)
// ==========================================
router.post('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const associationId = req.user!.associationId
    const userId = req.user!.id
    const { action, resource, details, severity } = req.body

    const log = await prisma.auditLog.create({
      data: {
        associationId,
        userId,
        action: action || 'OTHER',
        resource: resource || 'Unknown',
        details: details || null,
        ipAddress: req.ip || null,
        severity: severity || 'low'
      }
    })

    res.status(201).json(log)
  } catch (error) {
    console.error('Error creating audit log:', error)
    res.status(500).json({ message: 'Erreur serveur' })
  }
})

export default router
