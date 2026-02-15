// ========================================
// Stride - Announcements Routes
// ========================================

import { Router, Response } from 'express'
import prisma from '../lib/prisma'
import { authenticate, AuthRequest } from '../middleware/auth.middleware'

const router = Router()

// ==========================================
// GET /api/announcements
// Liste des annonces de l'association
// ==========================================
router.get('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const associationId = req.user!.associationId
    const type = req.query.type as string | undefined
    const search = req.query.search as string | undefined

    const where: any = { associationId }

    if (type && type !== 'all') {
      where.type = type
    }

    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { content: { contains: search, mode: 'insensitive' } }
      ]
    }

    const announcements = await prisma.announcement.findMany({
      where,
      include: {
        author: {
          select: { id: true, firstName: true, lastName: true, role: true }
        },
        comments: {
          include: {
            author: {
              select: { id: true, firstName: true, lastName: true }
            }
          },
          orderBy: { createdAt: 'desc' }
        },
        _count: { select: { comments: true } }
      },
      orderBy: { publishAt: 'desc' }
    })

    const result = announcements.map(a => ({
      id: a.id,
      title: a.title,
      content: a.content,
      type: a.type,
      priority: a.priority,
      targetAudience: a.targetAudience,
      authorName: `${a.author.firstName} ${a.author.lastName}`,
      authorId: a.author.id,
      publishAt: a.publishAt,
      views: a.views,
      likes: a.likes,
      commentsCount: a._count.comments,
      comments: a.comments.map(c => ({
        id: c.id,
        authorName: `${c.author.firstName} ${c.author.lastName}`,
        content: c.content,
        createdAt: c.createdAt
      })),
      createdAt: a.createdAt
    }))

    res.json(result)
  } catch (error) {
    console.error('Error loading announcements:', error)
    res.status(500).json({ message: 'Erreur serveur' })
  }
})

// ==========================================
// POST /api/announcements
// Créer une annonce
// ==========================================
router.post('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const associationId = req.user!.associationId
    const userId = req.user!.id
    const { title, content, type, priority, targetAudience } = req.body

    if (!title || !content) {
      return res.status(400).json({ message: 'Titre et contenu requis' })
    }

    const announcement = await prisma.announcement.create({
      data: {
        associationId,
        authorId: userId,
        title,
        content,
        type: type || 'info',
        priority: priority || 'medium',
        targetAudience: targetAudience || 'all'
      },
      include: {
        author: {
          select: { id: true, firstName: true, lastName: true }
        }
      }
    })

    res.status(201).json({
      ...announcement,
      authorName: `${announcement.author.firstName} ${announcement.author.lastName}`,
      commentsCount: 0,
      comments: []
    })
  } catch (error) {
    console.error('Error creating announcement:', error)
    res.status(500).json({ message: 'Erreur serveur' })
  }
})

// ==========================================
// GET /api/announcements/:id
// Détail d'une annonce (incrémente les vues)
// ==========================================
router.get('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const id = req.params.id as string

    const announcement: any = await prisma.announcement.update({
      where: { id },
      data: { views: { increment: 1 } },
      include: {
        author: {
          select: { id: true, firstName: true, lastName: true, role: true }
        },
        comments: {
          include: {
            author: {
              select: { id: true, firstName: true, lastName: true }
            }
          },
          orderBy: { createdAt: 'asc' }
        }
      }
    })

    res.json({
      ...announcement,
      authorName: `${announcement.author.firstName} ${announcement.author.lastName}`,
      comments: announcement.comments.map((c: any) => ({
        id: c.id,
        authorName: `${c.author.firstName} ${c.author.lastName}`,
        authorId: c.author.id,
        content: c.content,
        createdAt: c.createdAt
      }))
    })
  } catch (error) {
    console.error('Error loading announcement:', error)
    res.status(500).json({ message: 'Erreur serveur' })
  }
})

// ==========================================
// PUT /api/announcements/:id
// Modifier une annonce
// ==========================================
router.put('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const id = req.params.id as string
    const { title, content, type, priority, targetAudience } = req.body

    const announcement = await prisma.announcement.update({
      where: { id },
      data: {
        ...(title && { title }),
        ...(content && { content }),
        ...(type && { type }),
        ...(priority && { priority }),
        ...(targetAudience && { targetAudience })
      }
    })

    res.json(announcement)
  } catch (error) {
    console.error('Error updating announcement:', error)
    res.status(500).json({ message: 'Erreur serveur' })
  }
})

// ==========================================
// DELETE /api/announcements/:id
// Supprimer une annonce
// ==========================================
router.delete('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const id = req.params.id as string
    await prisma.announcement.delete({ where: { id } })
    res.json({ message: 'Annonce supprimée' })
  } catch (error) {
    console.error('Error deleting announcement:', error)
    res.status(500).json({ message: 'Erreur serveur' })
  }
})

// ==========================================
// POST /api/announcements/:id/like
// Liker une annonce
// ==========================================
router.post('/:id/like', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const id = req.params.id as string
    const announcement = await prisma.announcement.update({
      where: { id },
      data: { likes: { increment: 1 } }
    })
    res.json({ likes: announcement.likes })
  } catch (error) {
    console.error('Error liking announcement:', error)
    res.status(500).json({ message: 'Erreur serveur' })
  }
})

// ==========================================
// POST /api/announcements/:id/comments
// Ajouter un commentaire
// ==========================================
router.post('/:id/comments', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id
    const id = req.params.id as string
    const { content } = req.body

    if (!content || !content.trim()) {
      return res.status(400).json({ message: 'Contenu requis' })
    }

    const comment: any = await prisma.announcementComment.create({
      data: {
        announcementId: id,
        authorId: userId,
        content: content.trim()
      },
      include: {
        author: {
          select: { id: true, firstName: true, lastName: true }
        }
      }
    })

    res.status(201).json({
      id: comment.id,
      authorName: `${comment.author.firstName} ${comment.author.lastName}`,
      authorId: comment.author.id,
      content: comment.content,
      createdAt: comment.createdAt
    })
  } catch (error) {
    console.error('Error adding comment:', error)
    res.status(500).json({ message: 'Erreur serveur' })
  }
})

export default router
