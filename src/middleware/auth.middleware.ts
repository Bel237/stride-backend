// ========================================
// Stride - Auth Middleware (JWT)
// ========================================

import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import prisma from '../lib/prisma'

export interface AuthRequest extends Request {
  user?: {
    id: string
    email: string
    role: string
    associationId: string
  }
}

export const authenticate = async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ message: 'Token manquant' })
    }

    const token = authHeader.split(' ')[1]
    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as {
      userId: string
      associationId: string
    }

    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: { id: true, email: true, role: true, associationId: true, status: true }
    })

    if (!user || user.status === 'suspended' || user.status === 'inactive') {
      return res.status(401).json({ message: 'Utilisateur non autorisé' })
    }

    req.user = {
      id: user.id,
      email: user.email,
      role: user.role,
      associationId: user.associationId
    }

    next()
  } catch (error) {
    return res.status(401).json({ message: 'Token invalide ou expiré' })
  }
}
