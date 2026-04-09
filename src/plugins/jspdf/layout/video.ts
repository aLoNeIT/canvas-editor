import { BlockType } from '../../../editor/dataset/enum/Block'
import type { IElement } from '../../../editor/interface/Element'
import type { IPdfRasterBlock } from '../types'

export function canRenderVideoBlock(element: IElement) {
  return (
    element.block?.type === BlockType.VIDEO &&
    Boolean(element.block.videoBlock?.src)
  )
}

export async function createVideoRasterBlock(payload: {
  pageNo: number
  stage?: number
  x: number
  y: number
  width: number
  height: number
  element: IElement
}): Promise<IPdfRasterBlock> {
  const src = payload.element.block?.videoBlock?.src
  if (!src) {
    throw new Error('Video rasterization failed: missing src')
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
    throw new Error('Video rasterization failed: missing canvas context')
  }

  await new Promise<void>((resolve, reject) => {
    const video = document.createElement('video')
    video.src = src
    video.muted = true
    video.crossOrigin = 'anonymous'
    video.onloadeddata = () => {
      ctx.clearRect(0, 0, width, height)
      ctx.drawImage(video, 0, 0, width, height)
      resolve()
    }
    video.onerror = () => {
      reject(new Error('Video rasterization failed: video load error'))
    }
    const playResult = video.play()
    if (playResult && typeof playResult.then === 'function') {
      playResult.then(() => {
        video.pause()
      }).catch(reject)
    }
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
    debugLabel: 'video'
  }
}
