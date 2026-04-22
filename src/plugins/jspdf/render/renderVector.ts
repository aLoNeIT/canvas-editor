import type jsPDF from 'jspdf'
import type { IPageModel } from '../model/layout'
import type { IPdfVectorLine } from '../types'

function isOddLineWidth(width: number) {
  return Math.round(width) % 2 === 1
}

function isAxisAligned(valueA: number, valueB: number) {
  return Math.abs(valueA - valueB) < 0.001
}

function alignOddWidthAxisCoordinate(value: number) {
  const rounded = Math.round(value)
  const aligned = rounded + 0.5
  if (Math.abs(value - aligned) < 0.001) {
    return value
  }
  return aligned
}

export function renderVectorLine(doc: jsPDF, line: IPdfVectorLine) {
  const lineWidth = line.width || 1
  let x1 = line.x1
  let y1 = line.y1
  let x2 = line.x2
  let y2 = line.y2

  if (isOddLineWidth(lineWidth)) {
    if (isAxisAligned(line.y1, line.y2)) {
      const alignedY = alignOddWidthAxisCoordinate(line.y1)
      y1 = alignedY
      y2 = alignedY
    } else if (isAxisAligned(line.x1, line.x2)) {
      const alignedX = alignOddWidthAxisCoordinate(line.x1)
      x1 = alignedX
      x2 = alignedX
    }
  }

  doc.setDrawColor(line.color || '#000000')
  doc.setLineWidth(lineWidth)
  if (line.dash?.length) {
    doc.setLineDashPattern(line.dash, 0)
  } else {
    doc.setLineDashPattern([], 0)
  }
  doc.line(x1, y1, x2, y2)
}

export function renderVectorLines(doc: jsPDF, page: IPageModel) {
  page.vectorLines.forEach(line => {
    renderVectorLine(doc, line)
  })
}
