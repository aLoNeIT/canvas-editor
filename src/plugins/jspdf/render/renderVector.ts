import type jsPDF from 'jspdf'
import type { IPageModel } from '../model/layout'

export function renderVectorLines(doc: jsPDF, page: IPageModel) {
  page.vectorLines.forEach(line => {
    doc.setDrawColor(line.color || '#000000')
    doc.setLineWidth(line.width || 1)
    if (line.dash?.length) {
      doc.setLineDashPattern(line.dash, 0)
    } else {
      doc.setLineDashPattern([], 0)
    }
    doc.line(line.x1, line.y1, line.x2, line.y2)
  })
}
