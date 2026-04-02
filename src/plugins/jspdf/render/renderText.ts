import type jsPDF from 'jspdf'
import { resolvePdfFontFamily } from '../font'
import type { IPageModel } from '../model/layout'
import { resolvePdfTextFontStyle } from './fontStyle'

export function renderTextRuns(
  doc: jsPDF,
  page: IPageModel,
  defaultFontFamily: string
) {
  page.textRuns.forEach(run => {
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
    doc.text(run.text, run.x, run.y, {
      angle: run.rotate || 0
    })
    if (
      typeof run.opacity === 'number' &&
      gStateCtor &&
      typeof doc.setGState === 'function'
    ) {
      doc.setGState(new gStateCtor({ opacity: 1 }))
    }
  })
}
