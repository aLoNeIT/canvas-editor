import { ElementType } from '../../../editor/dataset/enum/Element'
import type { IElement } from '../../../editor/interface/Element'
import { convertLatexToSvg } from '../../../editor/utils/latex'
import type { IPdfRasterBlock } from '../types'

interface IResolvedLatexAsset {
  width: number
  height: number
  svgDataUrl: string
}

export function resolveLatexAsset(
  element: IElement
): IResolvedLatexAsset | null {
  if (element.type !== ElementType.LATEX) {
    return null
  }

  const resolved =
    element.laTexSVG && element.width && element.height
      ? null
      : convertLatexToSvg(element.value || '')

  return {
    width: element.width || resolved?.width || 1,
    height: element.height || resolved?.height || 1,
    svgDataUrl: element.laTexSVG || resolved?.svg || ''
  }
}

export async function createLatexRasterBlock(payload: {
  pageNo: number
  stage?: number
  x: number
  y: number
  element: IElement
}): Promise<IPdfRasterBlock> {
  const asset = resolveLatexAsset(payload.element)
  if (!asset?.svgDataUrl) {
    throw new Error('Latex rasterization failed: missing svg data')
  }

  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.ceil(asset.width))
  canvas.height = Math.max(1, Math.ceil(asset.height))

  const ctx = canvas.getContext('2d')
  if (!ctx) {
    throw new Error('Latex rasterization failed: missing canvas context')
  }

  await new Promise<void>((resolve, reject) => {
    const image = new Image()
    image.onload = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height)
      resolve()
    }
    image.onerror = () => {
      reject(new Error('Latex rasterization failed: image decode error'))
    }
    image.src = asset.svgDataUrl
  })

  return {
    pageNo: payload.pageNo,
    stage: payload.stage,
    x: payload.x,
    y: payload.y,
    width: asset.width,
    height: asset.height,
    dataUrl: canvas.toDataURL('image/png'),
    sourceType: 'image',
    layer: 'content',
    debugLabel: 'latex'
  }
}
