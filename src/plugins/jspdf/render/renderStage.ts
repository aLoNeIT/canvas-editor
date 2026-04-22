import type { IPageModel } from '../model/layout'
import type {
  IPdfHighlightRect,
  IPdfLinkRect,
  IPdfRasterBlock,
  IPdfTextRun,
  IPdfVectorLine
} from '../types'

export const PDF_RENDER_STAGE = {
  BACKGROUND: 0,
  FLOAT_BOTTOM: 20,
  CONTENT: 30,
  HEADER: 40,
  PAGE_NUMBER: 41,
  FOOTER: 42,
  FLOAT_OVERLAY: 50,
  LINE_NUMBER: 60,
  PAGE_BORDER: 70,
  BADGE: 80,
  GRAFFITI: 90
} as const

export type IPageRenderOperation =
  | {
      stage: number
      kind: 'highlight'
      item: IPdfHighlightRect
    }
  | {
      stage: number
      kind: 'raster'
      item: IPdfRasterBlock
    }
  | {
      stage: number
      kind: 'text'
      item: IPdfTextRun
    }
  | {
      stage: number
      kind: 'vector'
      item: IPdfVectorLine
    }
  | {
      stage: number
      kind: 'link'
      item: IPdfLinkRect
    }

const renderKindOrder: Record<IPageRenderOperation['kind'], number> = {
  highlight: 0,
  raster: 1,
  text: 2,
  vector: 3,
  link: 4
}

function resolveHighlightStage(rect: IPdfHighlightRect) {
  return rect.stage ?? PDF_RENDER_STAGE.CONTENT
}

function resolveRasterStage(raster: IPdfRasterBlock) {
  if (typeof raster.stage === 'number') {
    return raster.stage
  }
  if (raster.layer === 'background') {
    return PDF_RENDER_STAGE.BACKGROUND
  }
  if (raster.layer === 'overlay') {
    return PDF_RENDER_STAGE.FLOAT_OVERLAY
  }
  return PDF_RENDER_STAGE.CONTENT
}

function resolveTextStage(run: IPdfTextRun) {
  return run.stage ?? PDF_RENDER_STAGE.CONTENT
}

function resolveVectorStage(line: IPdfVectorLine) {
  return line.stage ?? PDF_RENDER_STAGE.CONTENT
}

function resolveLinkStage(link: IPdfLinkRect) {
  return link.stage ?? PDF_RENDER_STAGE.CONTENT
}

export function collectPageRenderOperations(
  page: IPageModel
): IPageRenderOperation[] {
  return [
    ...page.highlightRects.map(rect => ({
      stage: resolveHighlightStage(rect),
      kind: 'highlight' as const,
      item: rect
    })),
    ...page.rasterBlocks.map(raster => ({
      stage: resolveRasterStage(raster),
      kind: 'raster' as const,
      item: raster
    })),
    ...page.textRuns.map(run => ({
      stage: resolveTextStage(run),
      kind: 'text' as const,
      item: run
    })),
    ...page.vectorLines.map(line => ({
      stage: resolveVectorStage(line),
      kind: 'vector' as const,
      item: line
    })),
    ...page.links.map(link => ({
      stage: resolveLinkStage(link),
      kind: 'link' as const,
      item: link
    }))
  ].sort((left, right) => {
    if (left.stage !== right.stage) {
      return left.stage - right.stage
    }
    return renderKindOrder[left.kind] - renderKindOrder[right.kind]
  })
}
