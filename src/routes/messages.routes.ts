// ========================================
// Stride - Messages & Conversations Routes
// ========================================

import { Router, Response } from 'express'
import prisma from '../lib/prisma'
import { authenticate, AuthRequest } from '../middleware/auth.middleware'

const router = Router()

// ==========================================
// GET /api/messages/conversations
// Liste des conversations de l'utilisateur
// ==========================================
router.get('/conversations', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id
    const associationId = req.user!.associationId

    const participations = await prisma.conversationParticipant.findMany({
      where: { userId },
      include: {
        conversation: {
          include: {
            participants: {
              include: {
                user: {
                  select: { id: true, firstName: true, lastName: true, avatarUrl: true, status: true }
                }
              }
            },
            messages: {
              orderBy: { createdAt: 'desc' },
              take: 1,
              include: {
                sender: {
                  select: { id: true, firstName: true, lastName: true }
                }
              }
            }
          }
        }
      },
      orderBy: { conversation: { updatedAt: 'desc' } }
    })

    // Filter to only conversations in this association
    const conversations = participations
      .filter(p => p.conversation.associationId === associationId)
      .map(p => {
        const conv = p.conversation
        const otherParticipants = conv.participants.filter(cp => cp.userId !== userId)
        const lastMessage = conv.messages[0] || null

        return {
          id: conv.id,
          type: conv.type,
          name: conv.type === 'group' ? conv.name : undefined,
          description: conv.description,
          participants: otherParticipants.map(cp => ({
            id: cp.user.id,
            firstName: cp.user.firstName,
            lastName: cp.user.lastName,
            avatarUrl: cp.user.avatarUrl,
            isOnline: cp.user.status === 'active'
          })),
          allParticipants: conv.participants.map(cp => ({
            id: cp.user.id,
            firstName: cp.user.firstName,
            lastName: cp.user.lastName
          })),
          lastMessage: lastMessage ? {
            id: lastMessage.id,
            content: lastMessage.content,
            senderId: lastMessage.senderId,
            senderName: `${lastMessage.sender.firstName} ${lastMessage.sender.lastName}`,
            createdAt: lastMessage.createdAt
          } : null,
          lastReadAt: p.lastReadAt,
          updatedAt: conv.updatedAt
        }
      })

    // Count unread per conversation
    const result = await Promise.all(conversations.map(async (conv) => {
      const participation = participations.find(p => p.conversationId === conv.id)
      const unreadCount = await prisma.message.count({
        where: {
          conversationId: conv.id,
          createdAt: { gt: participation!.lastReadAt },
          senderId: { not: userId }
        }
      })
      return { ...conv, unreadCount }
    }))

    res.json(result)
  } catch (error) {
    console.error('Error loading conversations:', error)
    res.status(500).json({ message: 'Erreur serveur' })
  }
})

// ==========================================
// POST /api/messages/conversations
// Créer une conversation (individuelle ou groupe)
// ==========================================
router.post('/conversations', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id
    const associationId = req.user!.associationId
    const { type, name, description, participantIds } = req.body

    if (!participantIds || participantIds.length === 0) {
      return res.status(400).json({ message: 'Au moins un participant requis' })
    }

    // For individual conversations, check if one already exists
    if (type === 'individual' && participantIds.length === 1) {
      const existingConv = await prisma.conversation.findFirst({
        where: {
          associationId,
          type: 'individual',
          AND: [
            { participants: { some: { userId } } },
            { participants: { some: { userId: participantIds[0] } } }
          ]
        },
        include: {
          participants: {
            include: {
              user: { select: { id: true, firstName: true, lastName: true, avatarUrl: true, status: true } }
            }
          }
        }
      })

      if (existingConv) {
        return res.json(existingConv)
      }
    }

    const allParticipantIds = [...new Set([userId, ...participantIds])]

    const conversation = await prisma.conversation.create({
      data: {
        associationId,
        type: type || 'individual',
        name: type === 'group' ? name : null,
        description: type === 'group' ? description : null,
        createdById: userId,
        participants: {
          create: allParticipantIds.map(id => ({ userId: id }))
        }
      },
      include: {
        participants: {
          include: {
            user: { select: { id: true, firstName: true, lastName: true, avatarUrl: true, status: true } }
          }
        }
      }
    })

    res.status(201).json(conversation)
  } catch (error) {
    console.error('Error creating conversation:', error)
    res.status(500).json({ message: 'Erreur serveur' })
  }
})

// ==========================================
// GET /api/messages/conversations/:id/messages
// Messages d'une conversation
// ==========================================
router.get('/conversations/:id/messages', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id
    const id = req.params.id as string
    const limit = (req.query.limit as string) || '50'
    const before = req.query.before as string | undefined

    // Verify user is participant
    const participant = await prisma.conversationParticipant.findUnique({
      where: { conversationId_userId: { conversationId: id, userId } }
    })

    if (!participant) {
      return res.status(403).json({ message: 'Accès non autorisé' })
    }

    const where: any = { conversationId: id }
    if (before) {
      where.createdAt = { lt: new Date(before as string) }
    }

    const messages = await prisma.message.findMany({
      where,
      include: {
        sender: {
          select: { id: true, firstName: true, lastName: true, avatarUrl: true }
        }
      },
      orderBy: { createdAt: 'asc' },
      take: parseInt(limit as string)
    })

    // Update lastReadAt
    await prisma.conversationParticipant.update({
      where: { conversationId_userId: { conversationId: id, userId } },
      data: { lastReadAt: new Date() }
    })

    res.json(messages)
  } catch (error) {
    console.error('Error loading messages:', error)
    res.status(500).json({ message: 'Erreur serveur' })
  }
})

// ==========================================
// POST /api/messages/conversations/:id/messages
// Envoyer un message
// ==========================================
router.post('/conversations/:id/messages', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id
    const id = req.params.id as string
    const { content } = req.body

    if (!content || !content.trim()) {
      return res.status(400).json({ message: 'Contenu requis' })
    }

    // Verify user is participant
    const participant = await prisma.conversationParticipant.findUnique({
      where: { conversationId_userId: { conversationId: id, userId } }
    })

    if (!participant) {
      return res.status(403).json({ message: 'Accès non autorisé' })
    }

    const message = await prisma.message.create({
      data: {
        conversationId: id,
        senderId: userId,
        content: content.trim()
      },
      include: {
        sender: {
          select: { id: true, firstName: true, lastName: true, avatarUrl: true }
        }
      }
    })

    // Update conversation updatedAt
    await (prisma.conversation as any).update({
      where: { id },
      data: { updatedAt: new Date() }
    })

    // Update sender's lastReadAt
    await prisma.conversationParticipant.update({
      where: { conversationId_userId: { conversationId: id, userId } },
      data: { lastReadAt: new Date() }
    })

    res.status(201).json(message)
  } catch (error) {
    console.error('Error sending message:', error)
    res.status(500).json({ message: 'Erreur serveur' })
  }
})

// ==========================================
// GET /api/messages/members
// Liste des membres pour démarrer une conversation
// ==========================================
router.get('/members', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const associationId = req.user!.associationId
    const userId = req.user!.id

    const members = await prisma.user.findMany({
      where: {
        associationId,
        id: { not: userId },
        status: 'active'
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        role: true,
        avatarUrl: true
      },
      orderBy: { firstName: 'asc' }
    })

    res.json(members)
  } catch (error) {
    console.error('Error loading members:', error)
    res.status(500).json({ message: 'Erreur serveur' })
  }
})

// ==========================================
// POST /api/messages/conversations/:id/read
// Marquer une conversation comme lue
// ==========================================
router.post('/conversations/:id/read', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id
    const id = req.params.id as string

    await prisma.conversationParticipant.update({
      where: { conversationId_userId: { conversationId: id, userId } },
      data: { lastReadAt: new Date() }
    })

    res.json({ success: true })
  } catch (error) {
    console.error('Error marking as read:', error)
    res.status(500).json({ message: 'Erreur serveur' })
  }
})

export default router
