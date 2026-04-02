export interface IMeasuredTextMetric {
  width: number
  ascent: number
  descent: number
}

let measureCanvas: HTMLCanvasElement | null = null

export function measureText(
  text: string,
  font: string,
  size: number,
  bold?: boolean,
  italic?: boolean
): IMeasuredTextMetric {
  measureCanvas ||= document.createElement('canvas')
  const ctx = measureCanvas.getContext('2d')
  if (!ctx) {
    throw new Error('Canvas text measurement is unavailable')
  }
  ctx.font = `${italic ? 'italic ' : ''}${bold ? 'bold ' : ''}${size}px ${font}`
  const metric = ctx.measureText(text)

  return {
    width: metric.width,
    ascent: metric.actualBoundingBoxAscent || size * 0.8,
    descent: metric.actualBoundingBoxDescent || size * 0.2
  }
}
