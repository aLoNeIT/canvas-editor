import type jsPDF from 'jspdf'
import type { IPageModel } from '../model/layout'
import type { IPdfRasterBlock } from '../types'

function getImageFormat(dataUrl: string): 'PNG' | 'JPEG' | 'WEBP' {
  if (
    dataUrl.startsWith('data:image/jpeg') ||
    dataUrl.startsWith('data:image/jpg')
  ) {
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
    image.onerror = () => {
      reject(
        new Error(`Failed to load raster block: ${dataUrl.slice(0, 64)}`)
      )
    }
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
    throw new Error(
      `Failed to rasterize ${raster.debugLabel || raster.sourceType || 'image block'}`
    )
  }

  ctx.drawImage(image, 0, 0, width, height)

  return {
    dataUrl: canvas.toDataURL('image/png'),
    format: 'PNG' as const
  }
}

export async function renderImages(doc: jsPDF, page: IPageModel) {
  for (const raster of page.rasterBlocks) {
    const { dataUrl, format } = await resolveRasterData(raster)
    const gStateCtor = (doc as any).GState
    if (
      typeof raster.opacity === 'number' &&
      gStateCtor &&
      typeof doc.setGState === 'function'
    ) {
      doc.setGState(new gStateCtor({ opacity: raster.opacity }))
    }
    doc.addImage(
      dataUrl,
      format,
      raster.x,
      raster.y,
      raster.width,
      raster.height,
      undefined,
      undefined,
      raster.rotate || 0
    )
    if (
      typeof raster.opacity === 'number' &&
      gStateCtor &&
      typeof doc.setGState === 'function'
    ) {
      doc.setGState(new gStateCtor({ opacity: 1 }))
    }
  }
}
