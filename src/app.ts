// ========================================
// Stride - Express App Configuration
// ========================================

import express from 'express'
import cors from 'cors'
import authRoutes from './routes/auth.routes'
import associationRoutes from './routes/association.routes'
import contributionsRoutes from './routes/contributions.routes'
import distributionsRoutes from './routes/distributions.routes'
import loansRoutes from './routes/loans.routes'
import savingsRoutes from './routes/savings.routes'
import investmentsRoutes from './routes/investments.routes'
import budgetRoutes from './routes/budget.routes'
import usersRoutes from './routes/users.routes'
import eventsRoutes from './routes/events.routes'
import minutesRoutes from './routes/minutes.routes'
import votingRoutes from './routes/voting.routes'
import messagesRoutes from './routes/messages.routes'
import announcementsRoutes from './routes/announcements.routes'
import forumRoutes from './routes/forum.routes'
import sanctionsRoutes from './routes/sanctions.routes'
import documentsRoutes from './routes/documents.routes'
import reportsRoutes from './routes/reports.routes'
import auditRoutes from './routes/audit.routes'
import dashboardRoutes from './routes/dashboard.routes'
import notificationsRoutes from './routes/notifications.routes'

const app = express()

// Middleware
app.use(cors({
  origin: (process.env.CORS_ORIGIN || 'http://localhost:5173').split(','),
  credentials: true
}))
app.use(express.json({ limit: '5mb' }))

// Routes
app.use('/api/auth', authRoutes)
app.use('/api/associations', associationRoutes)
app.use('/api/contributions', contributionsRoutes)
app.use('/api/distributions', distributionsRoutes)
app.use('/api/loans', loansRoutes)
app.use('/api/savings', savingsRoutes)
app.use('/api/investments', investmentsRoutes)
app.use('/api/budget', budgetRoutes)
app.use('/api/users', usersRoutes)
app.use('/api/events', eventsRoutes)
app.use('/api/minutes', minutesRoutes)
app.use('/api/voting', votingRoutes)
app.use('/api/messages', messagesRoutes)
app.use('/api/announcements', announcementsRoutes)
app.use('/api/forum', forumRoutes)
app.use('/api/sanctions', sanctionsRoutes)
app.use('/api/documents', documentsRoutes)
app.use('/api/reports', reportsRoutes)
app.use('/api/audit', auditRoutes)
app.use('/api/dashboard', dashboardRoutes)
app.use('/api/notifications', notificationsRoutes)

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

// 404 handler
app.use((_req, res) => {
  res.status(404).json({ message: 'Route not found' })
})

// Error handler
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('❌ Error:', err.message)
  res.status(err.status || 500).json({
    message: err.message || 'Internal server error'
  })
})

export default app
