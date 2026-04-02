import type { IPdfRasterBlock } from '../types'

export async function rasterizeElement(
  draw: (ctx: CanvasRenderingContext2D) => void,
  width: number,
  height: number,
  sourceType: string
): Promise<IPdfRasterBlock> {
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.ceil(width))
  canvas.height = Math.max(1, Math.ceil(height))

  const ctx = canvas.getContext('2d')
  if (!ctx) {
    throw new Error(`Fallback rasterization failed for ${sourceType}`)
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
