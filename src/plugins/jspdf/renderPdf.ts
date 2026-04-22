import jsPDF from 'jspdf'
import type { PaperDirection } from '../../editor'
import { bootstrapPdfFonts } from './font'
import type { IFontBootstrapOption } from './font'
import type { IPageModel } from './model/layout'
import { renderImages } from './render/renderImage'
import { collectPageRenderOperations } from './render/renderStage'
import { renderTextRun } from './render/renderText'
import { renderVectorLine } from './render/renderVector'

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

const PDF_POINT_PER_CSS_PIXEL = 72 / 96

function scaleValue(value: number) {
  return value * PDF_POINT_PER_CSS_PIXEL
}

function scaleDashArray(dash: number[] | undefined) {
  return dash?.map(scaleValue)
}

function scalePageModel(page: IPageModel): IPageModel {
  return {
    ...page,
    width: scaleValue(page.width),
    height: scaleValue(page.height),
    highlightRects: page.highlightRects.map(rect => ({
      ...rect,
      x: scaleValue(rect.x),
      y: scaleValue(rect.y),
      width: scaleValue(rect.width),
      height: scaleValue(rect.height)
    })),
    textRuns: page.textRuns.map(run => ({
      ...run,
      x: scaleValue(run.x),
      y: scaleValue(run.y),
      width: scaleValue(run.width),
      height: scaleValue(run.height)
    })),
    vectorLines: page.vectorLines.map(line => ({
      ...line,
      x1: scaleValue(line.x1),
      y1: scaleValue(line.y1),
      x2: scaleValue(line.x2),
      y2: scaleValue(line.y2),
      width: typeof line.width === 'number' ? scaleValue(line.width) : line.width,
      dash: scaleDashArray(line.dash)
    })),
    links: page.links.map(link => ({
      ...link,
      x: scaleValue(link.x),
      y: scaleValue(link.y),
      width: scaleValue(link.width),
      height: scaleValue(link.height)
    })),
    rasterBlocks: page.rasterBlocks.map(raster => ({
      ...raster,
      x: scaleValue(raster.x),
      y: scaleValue(raster.y),
      width: scaleValue(raster.width),
      height: scaleValue(raster.height),
      crop: raster.crop
    }))
  }
}

export async function renderPdfBase64(
  pageModels: IPageModel[],
  options: IRenderPdfOption = {}
) {
  if (!pageModels.length) {
    throw new Error('PDF export failed: no page models were provided')
  }

  const pdfPageModels = pageModels.map(scalePageModel)
  const first = pdfPageModels[0]
  const orientation = resolveOrientation(
    options.paperDirection,
    first.width,
    first.height
  )

  const doc = new jsPDF({
    orientation,
    unit: 'pt',
    format: [first.width, first.height],
    compress: true,
    putOnlyUsedFonts: true
  })

  const { defaultFontFamily } = await bootstrapPdfFonts(doc, options)

  const renderPage = async (page: IPageModel) => {
    if (
      !page.highlightRects.length &&
      !page.textRuns.length &&
      !page.vectorLines.length &&
      !page.links.length &&
      !page.rasterBlocks.length
    ) {
      return
    }

    const operationList = collectPageRenderOperations(page)

    for (const operation of operationList) {
      if (operation.kind === 'highlight') {
        const rect = operation.item
        const gStateCtor = (doc as any).GState
        if (gStateCtor && typeof doc.setGState === 'function') {
          doc.setGState(new gStateCtor({ opacity: rect.opacity }))
        }
        doc.setFillColor(rect.color)
        doc.rect(rect.x, rect.y, rect.width, rect.height, 'F')
        if (typeof doc.setGState === 'function' && gStateCtor) {
          doc.setGState(new gStateCtor({ opacity: 1 }))
        }
        continue
      }

      if (operation.kind === 'raster') {
        // eslint-disable-next-line no-await-in-loop
        await renderImages(doc, [operation.item])
        continue
      }

      if (operation.kind === 'text') {
        renderTextRun(
          doc,
          operation.item,
          defaultFontFamily,
          PDF_POINT_PER_CSS_PIXEL
        )
        continue
      }

      if (operation.kind === 'vector') {
        renderVectorLine(doc, operation.item)
        continue
      }

      doc.link(
        operation.item.x,
        operation.item.y,
        operation.item.width,
        operation.item.height,
        {
          url: operation.item.url
        }
      )
    }
  }

  await renderPage(first)

  for (let i = 1; i < pdfPageModels.length; i++) {
    const page = pdfPageModels[i]
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
