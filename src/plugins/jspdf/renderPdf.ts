import jsPDF from 'jspdf'
import type { PaperDirection } from '../../editor'
import { bootstrapPdfFonts } from './font'
import type { IFontBootstrapOption } from './font'
import type { IPageModel } from './model/layout'
import { renderImages } from './render/renderImage'
import { renderTextRuns } from './render/renderText'
import { renderVectorLines } from './render/renderVector'

export interface IRenderPdfOption extends IFontBootstrapOption {
  paperDirection?: PaperDirection
}

function resolveOrientation(
  paperDirection: PaperDirection | undefined,
  width: number,
  height: number
): 'portrait' | 'landscape' {
  if (paperDirection === 'horizontal') return 'landscape'
  if (paperDirection === 'vertical') return 'portrait'
  return width >= height ? 'landscape' : 'portrait'
}

function stripPdfDataUriPrefix(dataUri: string) {
  const index = dataUri.indexOf('base64,')
  if (index < 0) return dataUri
  return dataUri.slice(index + 'base64,'.length)
}

export async function renderPdfBase64(
  pageModels: IPageModel[],
  options: IRenderPdfOption = {}
) {
  if (!pageModels.length) {
    throw new Error('PDF export failed: no page models were provided')
  }

  const first = pageModels[0]
  const orientation = resolveOrientation(
    options.paperDirection,
    first.width,
    first.height
  )

  const doc = new jsPDF({
    orientation,
    unit: 'pt',
    format: [first.width, first.height]
  })

  const { defaultFontFamily } = await bootstrapPdfFonts(doc, options)

  const renderPage = async (page: IPageModel) => {
    page.highlightRects.forEach(rect => {
      const gStateCtor = (doc as any).GState
      if (gStateCtor && typeof doc.setGState === 'function') {
        doc.setGState(new gStateCtor({ opacity: rect.opacity }))
      }
      doc.setFillColor(rect.color)
      doc.rect(rect.x, rect.y, rect.width, rect.height, 'F')
      if (typeof doc.setGState === 'function' && gStateCtor) {
        doc.setGState(new gStateCtor({ opacity: 1 }))
      }
    })

    renderTextRuns(doc, page, defaultFontFamily)
    renderVectorLines(doc, page)
    await renderImages(doc, page)

    page.links.forEach(link => {
      doc.link(link.x, link.y, link.width, link.height, {
        url: link.url
      })
    })
  }

  await renderPage(first)

  for (let i = 1; i < pageModels.length; i++) {
    const page = pageModels[i]
    const pageOrientation = resolveOrientation(
      options.paperDirection,
      page.width,
      page.height
    )
    doc.addPage([page.width, page.height], pageOrientation)
    await renderPage(page)
  }

  const dataUri = doc.output('datauristring')
  return stripPdfDataUriPrefix(dataUri)
}
