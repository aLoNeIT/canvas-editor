import type jsPDF from 'jspdf'
import type { IPageModel } from '../model/layout'
import type { IPdfTextRun } from '../types'
import { resolvePdfFontFamily } from './fontFamily'
import { resolvePdfTextFontStyle } from './fontStyle'

export function renderTextRun(
  doc: jsPDF,
  run: IPdfTextRun,
  defaultFontFamily: string
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
  doc.setFontSize(run.size)
  doc.setTextColor(run.color || '#000000')
  if (typeof doc.setCharSpace === 'function') {
    doc.setCharSpace(run.letterSpacing || 0)
  }
  doc.text(run.text, run.x, run.y, {
    angle: run.rotate || 0
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
  defaultFontFamily: string
) {
  page.textRuns.forEach(run => {
    renderTextRun(doc, run, defaultFontFamily)
  })
}
