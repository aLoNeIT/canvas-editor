import jsPDF from 'jspdf'
import type { PaperDirection } from '../../editor'
import { bootstrapPdfFonts } from './font'
import type { IFontBootstrapOption } from './font'
import { resolvePdfFontFamily } from './font'
import type { IPdfPageModel, IPdfRasterBlock } from './types'

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

function getImageFormat(dataUrl: string): 'PNG' | 'JPEG' | 'WEBP' {
  if (dataUrl.startsWith('data:image/jpeg') || dataUrl.startsWith('data:image/jpg')) {
    return 'JPEG'
  }
  if (dataUrl.startsWith('data:image/webp')) {
    return 'WEBP'
  }
  return 'PNG'
}

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.crossOrigin = 'anonymous'
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error(`Failed to load raster block: ${dataUrl.slice(0, 64)}`))
    image.src = dataUrl
  })
}

async function resolveRasterData(raster: IPdfRasterBlock) {
  if (/^data:image\/(png|jpeg|jpg|webp);base64,/.test(raster.dataUrl)) {
    return {
      dataUrl: raster.dataUrl,
      format: getImageFormat(raster.dataUrl)
    }
  }

  const image = await loadImage(raster.dataUrl)
  const width = Math.max(1, Math.ceil(raster.width))
  const height = Math.max(1, Math.ceil(raster.height))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    throw new Error(`Failed to rasterize ${raster.debugLabel || raster.sourceType || 'image block'}`)
  }
  ctx.drawImage(image, 0, 0, width, height)
  return {
    dataUrl: canvas.toDataURL('image/png'),
    format: 'PNG' as const
  }
}

export async function renderPdfBase64(
  pageModels: IPdfPageModel[],
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

  const renderPage = async (page: IPdfPageModel) => {
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

    page.textRuns.forEach(textRun => {
      doc.setFont(
        resolvePdfFontFamily(doc, textRun.font, defaultFontFamily),
        'normal'
      )
      doc.setFontSize(textRun.size)
      doc.setTextColor(textRun.color || '#000000')
      doc.text(textRun.text, textRun.x, textRun.y)
    })

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

    for (const raster of page.rasterBlocks) {
      const { dataUrl, format } = await resolveRasterData(raster)
      doc.addImage(dataUrl, format, raster.x, raster.y, raster.width, raster.height)
    }

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
