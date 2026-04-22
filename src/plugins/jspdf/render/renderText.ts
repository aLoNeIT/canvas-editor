import type jsPDF from 'jspdf'
import type { IPageModel } from '../model/layout'
import type { IPdfTextRun } from '../types'
import { resolvePdfFontFamily } from './fontFamily'
import { resolvePdfTextFontStyle } from './fontStyle'

export function renderTextRun(
  doc: jsPDF,
  run: IPdfTextRun,
  defaultFontFamily: string,
  metricsScale = 1
) {
  const gStateCtor = (doc as any).GState
  if (
    typeof run.opacity === 'number' &&
    gStateCtor &&
    typeof doc.setGState === 'function'
  ) {
    doc.setGState(new gStateCtor({ opacity: run.opacity }))
  }
  doc.setFont(
    resolvePdfFontFamily(doc, run.font, defaultFontFamily),
    resolvePdfTextFontStyle(run)
  )
  doc.setFontSize(run.size * metricsScale)
  doc.setTextColor(run.color || '#000000')
  const pdfTextWidth = doc.getTextWidth(run.text)
  const letterSpacing = (run.letterSpacing || 0) * metricsScale
  const spacingWidth = letterSpacing * run.text.length
  const effectiveRunWidth = Math.max(0, run.width - spacingWidth)
  const horizontalScale =
    effectiveRunWidth > 0 && pdfTextWidth > 0
      ? effectiveRunWidth / pdfTextWidth
      : undefined
  if (typeof doc.setCharSpace === 'function') {
    doc.setCharSpace(letterSpacing)
  }
  doc.text(run.text, run.x, run.y, {
    angle: run.rotate || 0,
    horizontalScale
  })
  if (typeof doc.setCharSpace === 'function' && run.letterSpacing) {
    doc.setCharSpace(0)
  }
  if (
    typeof run.opacity === 'number' &&
    gStateCtor &&
    typeof doc.setGState === 'function'
  ) {
    doc.setGState(new gStateCtor({ opacity: 1 }))
  }
}

export function renderTextRuns(
  doc: jsPDF,
  page: IPageModel,
  defaultFontFamily: string,
  metricsScale = 1
) {
  page.textRuns.forEach(run => {
    renderTextRun(doc, run, defaultFontFamily, metricsScale)
  })
}
