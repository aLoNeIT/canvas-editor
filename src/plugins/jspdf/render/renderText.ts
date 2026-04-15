import type jsPDF from 'jspdf'
import type { IPageModel } from '../model/layout'
import type { IPdfTextRun } from '../types'
import { resolvePdfFontFamily } from './fontFamily'
import { resolvePdfTextFontStyle } from './fontStyle'
import { PDF_RENDER_STAGE } from './renderStage'

const PDF_TEXT_VERTICAL_OFFSET = 0.5
const PDF_TEXT_VERTICAL_SCALE_Y = 0.97

function resolveTextVerticalOffset(run: IPdfTextRun) {
  if (run.stage === PDF_RENDER_STAGE.HEADER) {
    return 0.5
  }

  return PDF_TEXT_VERTICAL_OFFSET
}

function resolveTextVerticalScaleY(run: IPdfTextRun) {
  if (run.stage === PDF_RENDER_STAGE.HEADER) {
    return 1
  }

  return PDF_TEXT_VERTICAL_SCALE_Y
}

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
  const pdfTextWidth = doc.getTextWidth(run.text)
  const horizontalScale =
    run.width > 0 && pdfTextWidth > 0
      ? run.width / pdfTextWidth
      : undefined
  const textYOffset = resolveTextVerticalOffset(run)
  const textVerticalScaleY = resolveTextVerticalScaleY(run)
  if (typeof doc.setCharSpace === 'function') {
    doc.setCharSpace(run.letterSpacing || 0)
  }
  if (
    textVerticalScaleY !== 1 &&
    !run.rotate &&
    typeof doc.advancedAPI === 'function'
  ) {
    doc.advancedAPI(pdf => {
      pdf.text(run.text, run.x, run.y + textYOffset, {
        angle: pdf.Matrix(1, 0, 0, textVerticalScaleY, 0, 0),
        horizontalScale
      })
    })
  } else {
    doc.text(run.text, run.x, run.y + textYOffset, {
      angle: run.rotate || 0,
      horizontalScale
    })
  }
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
