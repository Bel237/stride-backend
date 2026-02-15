// ========================================
// Stride - Documents Routes
// ========================================

import { Router, Response } from 'express'
import prisma from '../lib/prisma'
import { authenticate, AuthRequest } from '../middleware/auth.middleware'

const router = Router()

// ==========================================
// GET /api/documents
// Liste des documents de l'association
// ==========================================
router.get('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const associationId = req.user!.associationId
    const category = req.query.category as string | undefined
    const search = req.query.search as string | undefined
    const isPublic = req.query.isPublic as string | undefined

    const where: any = { associationId }

    if (category) where.category = category
    if (isPublic === 'true') where.isPublic = true

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } }
      ]
    }

    const documents: any[] = await prisma.document.findMany({
      where,
      include: {
        uploadedBy: {
          select: { id: true, firstName: true, lastName: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    })

    const result = documents.map((d: any) => ({
      id: d.id,
      name: d.name,
      description: d.description,
      category: d.category,
      fileUrl: d.fileUrl,
      fileType: d.fileType,
      fileSize: d.fileSize,
      tags: d.tags ? JSON.parse(d.tags) : [],
      isPublic: d.isPublic,
      downloads: d.downloads,
      uploadedByName: `${d.uploadedBy.firstName} ${d.uploadedBy.lastName}`,
      uploadedById: d.uploadedBy.id,
      createdAt: d.createdAt
    }))

    res.json(result)
  } catch (error) {
    console.error('Error loading documents:', error)
    res.status(500).json({ message: 'Erreur serveur' })
  }
})

// ==========================================
// GET /api/documents/stats
// Statistiques des documents
// ==========================================
router.get('/stats', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const associationId = req.user!.associationId

    const documents = await prisma.document.findMany({ where: { associationId } })

    const total = documents.length
    const totalSize = documents.reduce((sum: number, d: any) => sum + d.fileSize, 0)
    const totalDownloads = documents.reduce((sum: number, d: any) => sum + d.downloads, 0)

    const byCategory: Record<string, number> = {}
    documents.forEach((d: any) => {
      byCategory[d.category] = (byCategory[d.category] || 0) + 1
    })

    res.json({ total, totalSize, totalDownloads, byCategory })
  } catch (error) {
    console.error('Error loading document stats:', error)
    res.status(500).json({ message: 'Erreur serveur' })
  }
})

// ==========================================
// POST /api/documents
// Créer un document (metadata only, file URL provided)
// ==========================================
router.post('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const associationId = req.user!.associationId
    const uploadedById = req.user!.id
    const { name, description, category, fileUrl, fileType, fileSize, tags, isPublic } = req.body

    if (!name || !fileUrl) {
      return res.status(400).json({ message: 'Nom et URL du fichier requis' })
    }

    const document: any = await prisma.document.create({
      data: {
        associationId,
        uploadedById,
        name,
        description: description || null,
        category: category || 'autre',
        fileUrl,
        fileType: fileType || 'pdf',
        fileSize: fileSize || 0,
        tags: tags ? JSON.stringify(tags) : null,
        isPublic: isPublic !== false
      },
      include: {
        uploadedBy: {
          select: { id: true, firstName: true, lastName: true }
        }
      }
    })

    res.status(201).json({
      id: document.id,
      name: document.name,
      description: document.description,
      category: document.category,
      fileUrl: document.fileUrl,
      fileType: document.fileType,
      fileSize: document.fileSize,
      tags: document.tags ? JSON.parse(document.tags) : [],
      isPublic: document.isPublic,
      downloads: document.downloads,
      uploadedByName: `${document.uploadedBy.firstName} ${document.uploadedBy.lastName}`,
      uploadedById: document.uploadedBy.id,
      createdAt: document.createdAt
    })
  } catch (error) {
    console.error('Error creating document:', error)
    res.status(500).json({ message: 'Erreur serveur' })
  }
})

// ==========================================
// PUT /api/documents/:id
// Modifier un document
// ==========================================
router.put('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const id = req.params.id as string
    const { name, description, category, tags, isPublic } = req.body

    const document = await prisma.document.update({
      where: { id },
      data: {
        ...(name && { name }),
        ...(description !== undefined && { description }),
        ...(category && { category }),
        ...(tags !== undefined && { tags: tags ? JSON.stringify(tags) : null }),
        ...(isPublic !== undefined && { isPublic })
      }
    })

    res.json(document)
  } catch (error) {
    console.error('Error updating document:', error)
    res.status(500).json({ message: 'Erreur serveur' })
  }
})

// ==========================================
// POST /api/documents/:id/download
// Incrémenter le compteur de téléchargements
// ==========================================
router.post('/:id/download', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const id = req.params.id as string
    const document = await prisma.document.update({
      where: { id },
      data: { downloads: { increment: 1 } }
    })
    res.json({ downloads: document.downloads, fileUrl: document.fileUrl })
  } catch (error) {
    console.error('Error downloading document:', error)
    res.status(500).json({ message: 'Erreur serveur' })
  }
})

// ==========================================
// DELETE /api/documents/:id
// Supprimer un document
// ==========================================
router.delete('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const id = req.params.id as string
    await prisma.document.delete({ where: { id } })
    res.json({ message: 'Document supprimé' })
  } catch (error) {
    console.error('Error deleting document:', error)
    res.status(500).json({ message: 'Erreur serveur' })
  }
})

export default router
