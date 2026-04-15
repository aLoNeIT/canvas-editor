import type { IPdfRasterBlock } from '../types'

export async function rasterizeElement(
  draw: (ctx: CanvasRenderingContext2D) => void,
  width: number,
  height: number,
  sourceType: string,
  pixelRatio = 1
): Promise<IPdfRasterBlock> {
  const canvas = document.createElement('canvas')
  const resolvedPixelRatio = Math.max(1, pixelRatio)
  canvas.width = Math.max(1, Math.ceil(width * resolvedPixelRatio))
  canvas.height = Math.max(1, Math.ceil(height * resolvedPixelRatio))

  const ctx = canvas.getContext('2d')
  if (!ctx) {
    throw new Error(`Fallback rasterization failed for ${sourceType}`)
  }

  if (resolvedPixelRatio !== 1) {
    ctx.scale(resolvedPixelRatio, resolvedPixelRatio)
  }

  draw(ctx)

  return {
    pageNo: 0,
    x: 0,
    y: 0,
    width,
    height,
    dataUrl: canvas.toDataURL('image/png'),
    sourceType
  }
}
