import { BlockType } from '../../../editor/dataset/enum/Block'
import type { IElement } from '../../../editor/interface/Element'
import type { IPdfRasterBlock } from '../types'

function createIframeSvgDataUrl(srcdoc: string, width: number, height: number) {
  const htmlContent = /<(html|body)\b/i.test(srcdoc)
    ? srcdoc
    : `<div xmlns="http://www.w3.org/1999/xhtml" style="width:100%;height:100%;">${srcdoc}</div>`

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
      <foreignObject width="100%" height="100%">
        ${htmlContent}
      </foreignObject>
    </svg>
  `.trim()

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

export function canRenderIframeBlock(element: IElement) {
  return (
    element.block?.type === BlockType.IFRAME &&
    Boolean(element.block.iframeBlock?.srcdoc)
  )
}

export async function createIframeRasterBlock(payload: {
  pageNo: number
  stage?: number
  x: number
  y: number
  width: number
  height: number
  element: IElement
}): Promise<IPdfRasterBlock> {
  const srcdoc = payload.element.block?.iframeBlock?.srcdoc
  if (!srcdoc) {
    throw new Error('Iframe rasterization failed: missing srcdoc')
  }

  const width = Math.max(1, Math.ceil(payload.element.width || payload.width))
  const height = Math.max(
    1,
    Math.ceil(payload.element.height || payload.height)
  )
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height

  const ctx = canvas.getContext('2d')
  if (!ctx) {
    throw new Error('Iframe rasterization failed: missing canvas context')
  }

  await new Promise<void>((resolve, reject) => {
    const image = new Image()
    image.onload = () => {
      ctx.clearRect(0, 0, width, height)
      ctx.drawImage(image, 0, 0, width, height)
      resolve()
    }
    image.onerror = () => {
      reject(new Error('Iframe rasterization failed: image decode error'))
    }
    image.src = createIframeSvgDataUrl(srcdoc, width, height)
  })

  return {
    pageNo: payload.pageNo,
    stage: payload.stage,
    x: payload.x,
    y: payload.y,
    width,
    height,
    dataUrl: canvas.toDataURL('image/png'),
    sourceType: 'image',
    layer: 'content',
    debugLabel: 'iframe'
  }
}
