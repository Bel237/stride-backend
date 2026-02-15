// ========================================
// Stride - Forum Routes
// ========================================

import { Router, Response } from 'express'
import prisma from '../lib/prisma'
import { authenticate, AuthRequest } from '../middleware/auth.middleware'

const router = Router()

// ==========================================
// GET /api/forum/categories
// Liste des catégories du forum
// ==========================================
router.get('/categories', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const associationId = req.user!.associationId

    const categories = await prisma.forumCategory.findMany({
      where: { associationId },
      include: {
        _count: { select: { posts: true } }
      },
      orderBy: { sortOrder: 'asc' }
    })

    res.json(categories.map(c => ({
      id: c.id,
      name: c.name,
      description: c.description,
      icon: c.icon,
      color: c.color,
      postsCount: c._count.posts
    })))
  } catch (error) {
    console.error('Error loading categories:', error)
    res.status(500).json({ message: 'Erreur serveur' })
  }
})

// ==========================================
// POST /api/forum/categories
// Créer une catégorie
// ==========================================
router.post('/categories', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const associationId = req.user!.associationId
    const { name, description, icon, color } = req.body

    if (!name) {
      return res.status(400).json({ message: 'Nom requis' })
    }

    const category = await prisma.forumCategory.create({
      data: {
        associationId,
        name,
        description,
        icon: icon || '💬',
        color: color || '#2563eb'
      }
    })

    res.status(201).json(category)
  } catch (error) {
    console.error('Error creating category:', error)
    res.status(500).json({ message: 'Erreur serveur' })
  }
})

// ==========================================
// GET /api/forum/posts
// Liste des posts du forum
// ==========================================
router.get('/posts', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const associationId = req.user!.associationId
    const categoryId = req.query.categoryId as string | undefined
    const search = req.query.search as string | undefined
    const pinned = req.query.pinned as string | undefined

    const where: any = { associationId }

    if (categoryId && categoryId !== 'all') {
      where.categoryId = categoryId
    }

    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { content: { contains: search, mode: 'insensitive' } }
      ]
    }

    if (pinned === 'true') {
      where.isPinned = true
    }

    const posts = await prisma.forumPost.findMany({
      where,
      include: {
        author: {
          select: { id: true, firstName: true, lastName: true, role: true }
        },
        category: {
          select: { id: true, name: true, icon: true, color: true }
        },
        _count: { select: { replies: true } }
      },
      orderBy: [
        { isPinned: 'desc' },
        { createdAt: 'desc' }
      ]
    })

    const result = (posts as any[]).map((p: any) => ({
      id: p.id,
      title: p.title,
      content: p.content,
      tags: p.tags ? JSON.parse(p.tags) : [],
      isPinned: p.isPinned,
      views: p.views,
      likes: p.likes,
      authorId: p.author.id,
      authorName: `${p.author.firstName} ${p.author.lastName}`,
      authorRole: p.author.role,
      categoryId: p.category.id,
      categoryName: p.category.name,
      categoryIcon: p.category.icon,
      categoryColor: p.category.color,
      repliesCount: p._count.replies,
      createdAt: p.createdAt
    }))

    res.json(result)
  } catch (error) {
    console.error('Error loading posts:', error)
    res.status(500).json({ message: 'Erreur serveur' })
  }
})

// ==========================================
// POST /api/forum/posts
// Créer un post
// ==========================================
router.post('/posts', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const associationId = req.user!.associationId
    const userId = req.user!.id
    const { title, content, categoryId, tags } = req.body

    if (!title || !content || !categoryId) {
      return res.status(400).json({ message: 'Titre, contenu et catégorie requis' })
    }

    const post: any = await prisma.forumPost.create({
      data: {
        associationId,
        authorId: userId,
        categoryId,
        title,
        content,
        tags: tags ? JSON.stringify(tags) : null
      },
      include: {
        author: {
          select: { id: true, firstName: true, lastName: true, role: true }
        },
        category: {
          select: { id: true, name: true, icon: true, color: true }
        }
      }
    })

    res.status(201).json({
      ...post,
      tags: post.tags ? JSON.parse(post.tags) : [],
      authorName: `${post.author.firstName} ${post.author.lastName}`,
      authorRole: post.author.role,
      categoryName: post.category.name,
      repliesCount: 0
    })
  } catch (error) {
    console.error('Error creating post:', error)
    res.status(500).json({ message: 'Erreur serveur' })
  }
})

// ==========================================
// GET /api/forum/posts/:id
// Détail d'un post (incrémente les vues)
// ==========================================
router.get('/posts/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const id = req.params.id as string

    const post: any = await prisma.forumPost.update({
      where: { id },
      data: { views: { increment: 1 } },
      include: {
        author: {
          select: { id: true, firstName: true, lastName: true, role: true }
        },
        category: {
          select: { id: true, name: true, icon: true, color: true }
        },
        replies: {
          include: {
            author: {
              select: { id: true, firstName: true, lastName: true, role: true }
            }
          },
          orderBy: { createdAt: 'asc' }
        }
      }
    })

    res.json({
      id: post.id,
      title: post.title,
      content: post.content,
      tags: post.tags ? JSON.parse(post.tags) : [],
      isPinned: post.isPinned,
      views: post.views,
      likes: post.likes,
      authorId: post.author.id,
      authorName: `${post.author.firstName} ${post.author.lastName}`,
      authorRole: post.author.role,
      categoryId: post.category.id,
      categoryName: post.category.name,
      categoryIcon: post.category.icon,
      categoryColor: post.category.color,
      replies: post.replies.map((r: any) => ({
        id: r.id,
        content: r.content,
        likes: r.likes,
        authorId: r.author.id,
        authorName: `${r.author.firstName} ${r.author.lastName}`,
        authorRole: r.author.role,
        createdAt: r.createdAt
      })),
      createdAt: post.createdAt
    })
  } catch (error) {
    console.error('Error loading post:', error)
    res.status(500).json({ message: 'Erreur serveur' })
  }
})

// ==========================================
// POST /api/forum/posts/:id/replies
// Répondre à un post
// ==========================================
router.post('/posts/:id/replies', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const userId = req.user!.id
    const id = req.params.id as string
    const { content } = req.body

    if (!content || !content.trim()) {
      return res.status(400).json({ message: 'Contenu requis' })
    }

    const reply: any = await prisma.forumReply.create({
      data: {
        postId: id,
        authorId: userId,
        content: content.trim()
      },
      include: {
        author: {
          select: { id: true, firstName: true, lastName: true, role: true }
        }
      }
    })

    res.status(201).json({
      id: reply.id,
      content: reply.content,
      likes: reply.likes,
      authorId: reply.author.id,
      authorName: `${reply.author.firstName} ${reply.author.lastName}`,
      authorRole: reply.author.role,
      createdAt: reply.createdAt
    })
  } catch (error) {
    console.error('Error adding reply:', error)
    res.status(500).json({ message: 'Erreur serveur' })
  }
})

// ==========================================
// POST /api/forum/posts/:id/like
// Liker un post
// ==========================================
router.post('/posts/:id/like', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const id = req.params.id as string
    const post = await prisma.forumPost.update({
      where: { id },
      data: { likes: { increment: 1 } }
    })
    res.json({ likes: post.likes })
  } catch (error) {
    console.error('Error liking post:', error)
    res.status(500).json({ message: 'Erreur serveur' })
  }
})

// ==========================================
// PUT /api/forum/posts/:id/pin
// Épingler/désépingler un post
// ==========================================
router.put('/posts/:id/pin', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const id = req.params.id as string
    const post = await prisma.forumPost.findUnique({ where: { id } })
    if (!post) {
      return res.status(404).json({ message: 'Post non trouvé' })
    }

    const updated = await prisma.forumPost.update({
      where: { id },
      data: { isPinned: !post.isPinned }
    })

    res.json({ isPinned: updated.isPinned })
  } catch (error) {
    console.error('Error pinning post:', error)
    res.status(500).json({ message: 'Erreur serveur' })
  }
})

// ==========================================
// DELETE /api/forum/posts/:id
// Supprimer un post
// ==========================================
router.delete('/posts/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const id = req.params.id as string
    await prisma.forumPost.delete({ where: { id } })
    res.json({ message: 'Post supprimé' })
  } catch (error) {
    console.error('Error deleting post:', error)
    res.status(500).json({ message: 'Erreur serveur' })
  }
})

// ==========================================
// GET /api/forum/stats
// Statistiques du forum
// ==========================================
router.get('/stats', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const associationId = req.user!.associationId

    const [postsCount, categoriesCount, repliesCount] = await Promise.all([
      prisma.forumPost.count({ where: { associationId } }),
      prisma.forumCategory.count({ where: { associationId } }),
      prisma.forumReply.count({
        where: { post: { associationId } }
      })
    ])

    res.json({
      posts: postsCount,
      categories: categoriesCount,
      replies: repliesCount
    })
  } catch (error) {
    console.error('Error loading forum stats:', error)
    res.status(500).json({ message: 'Erreur serveur' })
  }
})

export default router
