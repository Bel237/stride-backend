// ========================================
// Stride - Association Routes
// ========================================

import { Router, Response } from 'express'
import prisma from '../lib/prisma'
import { authenticate, AuthRequest } from '../middleware/auth.middleware'

const router = Router()

// ==========================================
// GET /api/associations/:id
// Retourne les données d'une association
// ==========================================
router.get('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    // Vérifier que l'utilisateur appartient à cette association
    if (req.user!.associationId !== req.params.id) {
      return res.status(403).json({ message: 'Accès non autorisé à cette association' })
    }

    const association = await prisma.association.findUnique({
      where: { id: req.params.id }
    })

    if (!association) {
      return res.status(404).json({ message: 'Association non trouvée' })
    }

    res.json(association)
  } catch (error) {
    console.error('Get association error:', error)
    res.status(500).json({ message: 'Erreur serveur' })
  }
})

export default router
