export interface IPdfTextRun {
  pageNo: number
  stage?: number
  text: string
  x: number
  y: number
  width: number
  height: number
  font: string
  size: number
  letterSpacing?: number
  opacity?: number
  rotate?: number
  bold?: boolean
  italic?: boolean
  color?: string
}

export interface IPdfHighlightRect {
  pageNo: number
  stage?: number
  x: number
  y: number
  width: number
  height: number
  color: string
  opacity: number
}

export interface IPdfLinkRect {
  pageNo: number
  stage?: number
  x: number
  y: number
  width: number
  height: number
  url: string
}

export interface IPdfVectorLine {
  pageNo: number
  stage?: number
  x1: number
  y1: number
  x2: number
  y2: number
  color?: string
  width?: number
  dash?: number[]
}

export interface IPdfRasterBlock {
  pageNo: number
  stage?: number
  x: number
  y: number
  width: number
  height: number
  dataUrl: string
  layer?: 'background' | 'content' | 'overlay'
  crop?: {
    x: number
    y: number
    width: number
    height: number
  }
  opacity?: number
  rotate?: number
  sourceType?: string
  debugLabel?: string
}

export interface IRasterizeElementOption {
  pageNo: number
  x: number
  y: number
  width: number
  height: number
  dataUrl: string
  sourceType?: string
  debugLabel?: string
}

export interface IPdfPageModel {
  pageNo: number
  width: number
  height: number
  textRuns: IPdfTextRun[]
  highlightRects: IPdfHighlightRect[]
  links: IPdfLinkRect[]
  vectorLines: IPdfVectorLine[]
  rasterBlocks: IPdfRasterBlock[]
  issues: string[]
}
