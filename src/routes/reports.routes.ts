// ========================================
// Stride - Reports Routes (PDF & Word)
// ========================================

import { Router, Response } from 'express'
import prisma from '../lib/prisma'
import { authenticate, AuthRequest } from '../middleware/auth.middleware'
import PDFDocument from 'pdfkit'
import { Document as DocxDocument, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, AlignmentType, HeadingLevel, BorderStyle } from 'docx'

const router = Router()

// ==========================================
// Helper: gather monthly report data
// ==========================================
async function gatherMonthlyData(associationId: string, period: string) {
  const [year, month] = period.split('-').map(Number)
  const startDate = new Date(year, month - 1, 1)
  const endDate = new Date(year, month, 0, 23, 59, 59)

  const association = await prisma.association.findUnique({ where: { id: associationId } })

  const members = await prisma.user.findMany({
    where: { associationId, status: 'active' },
    select: { id: true, firstName: true, lastName: true, role: true }
  })

  const contributions: any[] = await prisma.contribution.findMany({
    where: {
      session: { associationId },
      paidAt: { gte: startDate, lte: endDate }
    },
    include: { user: { select: { firstName: true, lastName: true } } }
  })

  const loans: any[] = await prisma.loan.findMany({
    where: { associationId, createdAt: { gte: startDate, lte: endDate } },
    include: { user: { select: { firstName: true, lastName: true } } }
  })

  const repayments: any[] = await prisma.loanRepayment.findMany({
    where: {
      loan: { associationId },
      paidAt: { gte: startDate, lte: endDate }
    }
  })

  const sanctions: any[] = await prisma.sanction.findMany({
    where: { associationId, createdAt: { gte: startDate, lte: endDate } },
    include: { user: { select: { firstName: true, lastName: true } } }
  })

  const totalContributions = contributions.reduce((s: number, c: any) => s + c.amount, 0)
  const totalLoansGranted = loans.reduce((s: number, l: any) => s + l.amount, 0)
  const totalRepayments = repayments.reduce((s: number, r: any) => s + r.amount, 0)
  const totalSanctions = sanctions.filter((s: any) => s.status === 'payee').reduce((sum: number, s: any) => sum + s.amount, 0)

  const monthNames = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre']
  const monthLabel = `${monthNames[month - 1]} ${year}`

  return {
    association,
    members,
    contributions,
    loans,
    repayments,
    sanctions,
    totalContributions,
    totalLoansGranted,
    totalRepayments,
    totalSanctions,
    monthLabel,
    period,
    totalEntrees: totalContributions + totalRepayments + totalSanctions,
    totalSorties: totalLoansGranted
  }
}

// ==========================================
// Helper: format currency
// ==========================================
function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('fr-FR').format(amount) + ' FCFA'
}

// ==========================================
// GET /api/reports/data/monthly?period=2026-01
// Get monthly report data (for frontend display)
// ==========================================
router.get('/data/monthly', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const associationId = req.user!.associationId
    const period = (req.query.period as string) || new Date().toISOString().slice(0, 7)
    const data = await gatherMonthlyData(associationId, period)

    res.json({
      monthLabel: data.monthLabel,
      period: data.period,
      membresActifs: data.members.length,
      totalContributions: data.totalContributions,
      totalLoansGranted: data.totalLoansGranted,
      totalRepayments: data.totalRepayments,
      totalSanctions: data.totalSanctions,
      totalEntrees: data.totalEntrees,
      totalSorties: data.totalSorties,
      solde: data.totalEntrees - data.totalSorties,
      contributionsCount: data.contributions.length,
      loansCount: data.loans.length,
      sanctionsCount: data.sanctions.length
    })
  } catch (error) {
    console.error('Error loading monthly data:', error)
    res.status(500).json({ message: 'Erreur serveur' })
  }
})

// ==========================================
// GET /api/reports/data/overview
// Get overview stats for the association
// ==========================================
router.get('/data/overview', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const associationId = req.user!.associationId

    const totalMembers = await prisma.user.count({ where: { associationId, status: 'active' } })
    const activeLoans = await prisma.loan.count({ where: { associationId, status: 'approved' } })

    const allContributions: any[] = await prisma.contribution.findMany({
      where: { session: { associationId } }
    })
    const totalEpargne = allContributions.reduce((s: number, c: any) => s + c.amount, 0)

    const allLoans: any[] = await prisma.loan.findMany({ where: { associationId } })
    const totalLoans = allLoans.reduce((s: number, l: any) => s + l.amount, 0)

    res.json({ totalMembers, activeLoans, totalEpargne, totalLoans })
  } catch (error) {
    console.error('Error loading overview:', error)
    res.status(500).json({ message: 'Erreur serveur' })
  }
})

// ==========================================
// POST /api/reports/generate/pdf
// Generate a PDF report
// ==========================================
router.post('/generate/pdf', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const associationId = req.user!.associationId
    const userId = req.user!.id
    const { type, period } = req.body

    const reportType = type || 'monthly'
    const reportPeriod = period || new Date().toISOString().slice(0, 7)
    const data = await gatherMonthlyData(associationId, reportPeriod)

    const doc = new PDFDocument({ margin: 50, size: 'A4' })
    const chunks: Buffer[] = []

    doc.on('data', (chunk: Buffer) => chunks.push(chunk))

    const pdfReady = new Promise<Buffer>((resolve) => {
      doc.on('end', () => resolve(Buffer.concat(chunks)))
    })

    // --- PDF Content ---
    doc.fontSize(20).font('Helvetica-Bold').text(data.association?.name || 'Association', { align: 'center' })
    doc.moveDown(0.5)
    doc.fontSize(14).font('Helvetica').text(`Rapport Mensuel - ${data.monthLabel}`, { align: 'center' })
    doc.moveDown(0.3)
    doc.fontSize(10).fillColor('#666').text(`Généré le ${new Date().toLocaleDateString('fr-FR')}`, { align: 'center' })
    doc.fillColor('#000')
    doc.moveDown(1.5)

    // Overview
    doc.fontSize(14).font('Helvetica-Bold').text('Vue d\'ensemble')
    doc.moveDown(0.5)
    doc.fontSize(11).font('Helvetica')
    doc.text(`Membres actifs: ${data.members.length}`)
    doc.text(`Cotisations collectées: ${formatCurrency(data.totalContributions)} (${data.contributions.length} paiements)`)
    doc.text(`Prêts accordés: ${formatCurrency(data.totalLoansGranted)} (${data.loans.length} prêts)`)
    doc.text(`Remboursements reçus: ${formatCurrency(data.totalRepayments)}`)
    doc.text(`Sanctions payées: ${formatCurrency(data.totalSanctions)}`)
    doc.moveDown(1)

    // Financial summary
    doc.fontSize(14).font('Helvetica-Bold').text('Résumé Financier')
    doc.moveDown(0.5)
    doc.fontSize(11).font('Helvetica')
    doc.text(`Total Entrées: ${formatCurrency(data.totalEntrees)}`)
    doc.text(`Total Sorties: ${formatCurrency(data.totalSorties)}`)
    doc.moveDown(0.3)
    doc.font('Helvetica-Bold').text(`Solde: ${formatCurrency(data.totalEntrees - data.totalSorties)}`)
    doc.moveDown(1)

    // Contributions detail
    if (data.contributions.length > 0) {
      doc.fontSize(14).font('Helvetica-Bold').text('Détail des Cotisations')
      doc.moveDown(0.5)
      doc.fontSize(10).font('Helvetica')
      data.contributions.forEach((c: any) => {
        doc.text(`  • ${c.user.firstName} ${c.user.lastName}: ${formatCurrency(c.amount)}`)
      })
      doc.moveDown(1)
    }

    // Loans detail
    if (data.loans.length > 0) {
      doc.fontSize(14).font('Helvetica-Bold').text('Prêts Accordés')
      doc.moveDown(0.5)
      doc.fontSize(10).font('Helvetica')
      data.loans.forEach((l: any) => {
        doc.text(`  • ${l.user.firstName} ${l.user.lastName}: ${formatCurrency(l.amount)} - ${l.reason || 'N/A'}`)
      })
      doc.moveDown(1)
    }

    // Sanctions detail
    if (data.sanctions.length > 0) {
      doc.fontSize(14).font('Helvetica-Bold').text('Sanctions')
      doc.moveDown(0.5)
      doc.fontSize(10).font('Helvetica')
      data.sanctions.forEach((s: any) => {
        doc.text(`  • ${s.user.firstName} ${s.user.lastName}: ${formatCurrency(s.amount)} - ${s.reason}`)
      })
    }

    doc.end()
    const pdfBuffer = await pdfReady

    // Save report record
    const title = `Rapport Mensuel - ${data.monthLabel}`
    await prisma.report.create({
      data: {
        associationId,
        generatedById: userId,
        title,
        type: reportType,
        format: 'pdf',
        period: reportPeriod,
        fileData: pdfBuffer,
        parameters: JSON.stringify({ type: reportType, period: reportPeriod })
      }
    })

    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', `attachment; filename="rapport-${reportPeriod}.pdf"`)
    res.send(pdfBuffer)
  } catch (error) {
    console.error('Error generating PDF:', error)
    res.status(500).json({ message: 'Erreur serveur' })
  }
})

// ==========================================
// POST /api/reports/generate/docx
// Generate a Word report
// ==========================================
router.post('/generate/docx', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const associationId = req.user!.associationId
    const userId = req.user!.id
    const { type, period } = req.body

    const reportType = type || 'monthly'
    const reportPeriod = period || new Date().toISOString().slice(0, 7)
    const data = await gatherMonthlyData(associationId, reportPeriod)

    const sections: Paragraph[] = []

    // Title
    sections.push(new Paragraph({
      children: [new TextRun({ text: data.association?.name || 'Association', bold: true, size: 36 })],
      alignment: AlignmentType.CENTER,
      spacing: { after: 200 }
    }))
    sections.push(new Paragraph({
      children: [new TextRun({ text: `Rapport Mensuel - ${data.monthLabel}`, bold: true, size: 28 })],
      alignment: AlignmentType.CENTER,
      spacing: { after: 100 }
    }))
    sections.push(new Paragraph({
      children: [new TextRun({ text: `Généré le ${new Date().toLocaleDateString('fr-FR')}`, size: 20, color: '666666' })],
      alignment: AlignmentType.CENTER,
      spacing: { after: 400 }
    }))

    // Overview
    sections.push(new Paragraph({ text: 'Vue d\'ensemble', heading: HeadingLevel.HEADING_1, spacing: { after: 200 } }))
    sections.push(new Paragraph({ children: [new TextRun({ text: `Membres actifs: ${data.members.length}` })], spacing: { after: 80 } }))
    sections.push(new Paragraph({ children: [new TextRun({ text: `Cotisations collectées: ${formatCurrency(data.totalContributions)} (${data.contributions.length} paiements)` })], spacing: { after: 80 } }))
    sections.push(new Paragraph({ children: [new TextRun({ text: `Prêts accordés: ${formatCurrency(data.totalLoansGranted)} (${data.loans.length} prêts)` })], spacing: { after: 80 } }))
    sections.push(new Paragraph({ children: [new TextRun({ text: `Remboursements reçus: ${formatCurrency(data.totalRepayments)}` })], spacing: { after: 80 } }))
    sections.push(new Paragraph({ children: [new TextRun({ text: `Sanctions payées: ${formatCurrency(data.totalSanctions)}` })], spacing: { after: 200 } }))

    // Financial summary
    sections.push(new Paragraph({ text: 'Résumé Financier', heading: HeadingLevel.HEADING_1, spacing: { after: 200 } }))

    const summaryTable = new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        new TableRow({
          children: [
            new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: 'Poste', bold: true })] })], width: { size: 60, type: WidthType.PERCENTAGE } }),
            new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: 'Montant', bold: true })] })], width: { size: 40, type: WidthType.PERCENTAGE } })
          ]
        }),
        new TableRow({
          children: [
            new TableCell({ children: [new Paragraph('Total Entrées')] }),
            new TableCell({ children: [new Paragraph(formatCurrency(data.totalEntrees))] })
          ]
        }),
        new TableRow({
          children: [
            new TableCell({ children: [new Paragraph('Total Sorties')] }),
            new TableCell({ children: [new Paragraph(formatCurrency(data.totalSorties))] })
          ]
        }),
        new TableRow({
          children: [
            new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: 'Solde', bold: true })] })] }),
            new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: formatCurrency(data.totalEntrees - data.totalSorties), bold: true })] })] })
          ]
        })
      ]
    })
    sections.push(new Paragraph({ spacing: { after: 100 } }))

    // Contributions detail
    if (data.contributions.length > 0) {
      const contribParagraphs: Paragraph[] = [
        new Paragraph({ text: 'Détail des Cotisations', heading: HeadingLevel.HEADING_1, spacing: { before: 300, after: 200 } })
      ]
      data.contributions.forEach((c: any) => {
        contribParagraphs.push(new Paragraph({
          children: [new TextRun({ text: `• ${c.user.firstName} ${c.user.lastName}: ${formatCurrency(c.amount)}` })],
          spacing: { after: 60 }
        }))
      })
      sections.push(...contribParagraphs)
    }

    // Loans detail
    if (data.loans.length > 0) {
      const loanParagraphs: Paragraph[] = [
        new Paragraph({ text: 'Prêts Accordés', heading: HeadingLevel.HEADING_1, spacing: { before: 300, after: 200 } })
      ]
      data.loans.forEach((l: any) => {
        loanParagraphs.push(new Paragraph({
          children: [new TextRun({ text: `• ${l.user.firstName} ${l.user.lastName}: ${formatCurrency(l.amount)} - ${l.reason || 'N/A'}` })],
          spacing: { after: 60 }
        }))
      })
      sections.push(...loanParagraphs)
    }

    const docxDoc = new DocxDocument({
      sections: [{
        children: [...sections, summaryTable]
      }]
    })

    const docxBuffer = await Packer.toBuffer(docxDoc)

    // Save report record
    const title = `Rapport Mensuel - ${data.monthLabel}`
    await prisma.report.create({
      data: {
        associationId,
        generatedById: userId,
        title,
        type: reportType,
        format: 'docx',
        period: reportPeriod,
        fileData: docxBuffer,
        parameters: JSON.stringify({ type: reportType, period: reportPeriod })
      }
    })

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')
    res.setHeader('Content-Disposition', `attachment; filename="rapport-${reportPeriod}.docx"`)
    res.send(docxBuffer)
  } catch (error) {
    console.error('Error generating DOCX:', error)
    res.status(500).json({ message: 'Erreur serveur' })
  }
})

// ==========================================
// GET /api/reports
// List generated reports
// ==========================================
router.get('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const associationId = req.user!.associationId

    const reports: any[] = await prisma.report.findMany({
      where: { associationId },
      select: {
        id: true, title: true, type: true, format: true, period: true, createdAt: true,
        generatedBy: { select: { firstName: true, lastName: true } }
      },
      orderBy: { createdAt: 'desc' },
      take: 50
    })

    const result = reports.map((r: any) => ({
      id: r.id,
      title: r.title,
      type: r.type,
      format: r.format,
      period: r.period,
      generatedByName: `${r.generatedBy.firstName} ${r.generatedBy.lastName}`,
      createdAt: r.createdAt
    }))

    res.json(result)
  } catch (error) {
    console.error('Error loading reports:', error)
    res.status(500).json({ message: 'Erreur serveur' })
  }
})

// ==========================================
// GET /api/reports/:id/download
// Download a previously generated report
// ==========================================
router.get('/:id/download', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const id = req.params.id as string
    const report = await prisma.report.findUnique({ where: { id } })

    if (!report || !report.fileData) {
      return res.status(404).json({ message: 'Rapport non trouvé' })
    }

    const contentType = report.format === 'pdf'
      ? 'application/pdf'
      : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    const ext = report.format === 'pdf' ? 'pdf' : 'docx'

    res.setHeader('Content-Type', contentType)
    res.setHeader('Content-Disposition', `attachment; filename="rapport-${report.period || 'export'}.${ext}"`)
    res.send(report.fileData)
  } catch (error) {
    console.error('Error downloading report:', error)
    res.status(500).json({ message: 'Erreur serveur' })
  }
})

// ==========================================
// DELETE /api/reports/:id
// ==========================================
router.delete('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const id = req.params.id as string
    await prisma.report.delete({ where: { id } })
    res.json({ message: 'Rapport supprimé' })
  } catch (error) {
    console.error('Error deleting report:', error)
    res.status(500).json({ message: 'Erreur serveur' })
  }
})

export default router
