// ========================================
// Stride - Notifications Routes
// ========================================

import { Router, Response } from 'express'
import prisma from '../lib/prisma'
import { authenticate, AuthRequest } from '../middleware/auth.middleware'

const router = Router()

// ==========================================
// GET /api/notifications
// Liste des notifications de l'utilisateur
// ==========================================
router.get('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id
    const { read, type, priority, limit } = req.query

    const where: any = { userId }
    if (read === 'true') where.read = true
    if (read === 'false') where.read = false
    if (type) where.type = type as string
    if (priority) where.priority = priority as string

    const notifications = await prisma.notification.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit ? parseInt(limit as string) : 100
    })

    res.json(notifications)
  } catch (error) {
    console.error('Get notifications error:', error)
    res.status(500).json({ message: 'Erreur serveur' })
  }
})

// ==========================================
// GET /api/notifications/unread-count
// Nombre de notifications non lues
// ==========================================
router.get('/unread-count', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const count = await prisma.notification.count({
      where: { userId: req.user!.id, read: false }
    })
    res.json({ count })
  } catch (error) {
    console.error('Unread count error:', error)
    res.status(500).json({ message: 'Erreur serveur' })
  }
})

// ==========================================
// PUT /api/notifications/:id/read
// Marquer une notification comme lue
// ==========================================
router.put('/:id/read', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const notification = await prisma.notification.updateMany({
      where: { id: req.params.id, userId: req.user!.id },
      data: { read: true }
    })
    res.json({ success: true })
  } catch (error) {
    console.error('Mark read error:', error)
    res.status(500).json({ message: 'Erreur serveur' })
  }
})

// ==========================================
// PUT /api/notifications/read-all
// Marquer toutes les notifications comme lues
// ==========================================
router.put('/read-all', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    await prisma.notification.updateMany({
      where: { userId: req.user!.id, read: false },
      data: { read: true }
    })
    res.json({ success: true })
  } catch (error) {
    console.error('Mark all read error:', error)
    res.status(500).json({ message: 'Erreur serveur' })
  }
})

// ==========================================
// DELETE /api/notifications/:id
// Supprimer une notification
// ==========================================
router.delete('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    await prisma.notification.deleteMany({
      where: { id: req.params.id, userId: req.user!.id }
    })
    res.json({ success: true })
  } catch (error) {
    console.error('Delete notification error:', error)
    res.status(500).json({ message: 'Erreur serveur' })
  }
})

// ==========================================
// DELETE /api/notifications/clear-read
// Supprimer toutes les notifications lues
// ==========================================
router.delete('/clear-read', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    await prisma.notification.deleteMany({
      where: { userId: req.user!.id, read: true }
    })
    res.json({ success: true })
  } catch (error) {
    console.error('Clear read error:', error)
    res.status(500).json({ message: 'Erreur serveur' })
  }
})

// ==========================================
// POST /api/notifications
// Créer une notification (usage interne / bureau)
// ==========================================
router.post('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { userId, type, priority, title, message, actionUrl, actionText, metadata } = req.body

    if (!title || !message) {
      return res.status(400).json({ message: 'Titre et message requis' })
    }

    const targetUserId = userId || req.user!.id

    const notification = await prisma.notification.create({
      data: {
        userId: targetUserId,
        associationId: req.user!.associationId,
        type: type || 'info',
        priority: priority || 'medium',
        title,
        message,
        actionUrl,
        actionText,
        metadata
      }
    })

    res.status(201).json(notification)
  } catch (error) {
    console.error('Create notification error:', error)
    res.status(500).json({ message: 'Erreur serveur' })
  }
})

// ==========================================
// POST /api/notifications/broadcast
// Envoyer une notification à tous les membres
// ==========================================
router.post('/broadcast', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const { type, priority, title, message, actionUrl, actionText } = req.body

    if (!title || !message) {
      return res.status(400).json({ message: 'Titre et message requis' })
    }

    const members = await prisma.user.findMany({
      where: { associationId: req.user!.associationId, status: 'active' },
      select: { id: true }
    })

    const notifications = await prisma.notification.createMany({
      data: members.map(m => ({
        userId: m.id,
        associationId: req.user!.associationId,
        type: type || 'info',
        priority: priority || 'medium',
        title,
        message,
        actionUrl,
        actionText
      }))
    })

    res.status(201).json({ count: notifications.count })
  } catch (error) {
    console.error('Broadcast notification error:', error)
    res.status(500).json({ message: 'Erreur serveur' })
  }
})

export default router
