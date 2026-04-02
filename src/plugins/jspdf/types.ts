export interface IPdfTextRun {
  pageNo: number
  text: string
  x: number
  y: number
  width: number
  height: number
  font: string
  size: number
  opacity?: number
  rotate?: number
  bold?: boolean
  italic?: boolean
  color?: string
}

export interface IPdfHighlightRect {
  pageNo: number
  x: number
  y: number
  width: number
  height: number
  color: string
  opacity: number
}

export interface IPdfLinkRect {
  pageNo: number
  x: number
  y: number
  width: number
  height: number
  url: string
}

export interface IPdfVectorLine {
  pageNo: number
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
  x: number
  y: number
  width: number
  height: number
  dataUrl: string
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
