export interface IMeasuredTextMetric {
  width: number
  ascent: number
  descent: number
}

let measureCanvas: HTMLCanvasElement | null = null
let measureCanvasDocument: Document | null = null

function createFallbackMetric(text: string, size: number): IMeasuredTextMetric {
  return {
    width: text.length * size,
    ascent: size * 0.8,
    descent: size * 0.2
  }
}

function getMeasureContext() {
  if (typeof document === 'undefined') {
    return null
  }
  if (!measureCanvas || measureCanvasDocument !== document) {
    measureCanvas = document.createElement('canvas')
    measureCanvasDocument = document
  }
  return measureCanvas.getContext('2d')
}

export function measureLineHeight(
  font: string,
  size: number,
  bold?: boolean,
  italic?: boolean
) {
  const metric = measureText('\u4e2d', font, size, bold, italic)
  return Math.max(1, metric.ascent + metric.descent)
}

export function measureText(
  text: string,
  font: string,
  size: number,
  bold?: boolean,
  italic?: boolean
): IMeasuredTextMetric {
  const ctx = getMeasureContext()
  if (!ctx) {
    return createFallbackMetric(text, size)
  }
  ctx.font = `${italic ? 'italic ' : ''}${bold ? 'bold ' : ''}${size}px ${font}`
  const metric = ctx.measureText(text)

  return {
    width: metric.width,
    ascent: metric.actualBoundingBoxAscent || size * 0.8,
    descent: metric.actualBoundingBoxDescent || size * 0.2
  }
}
