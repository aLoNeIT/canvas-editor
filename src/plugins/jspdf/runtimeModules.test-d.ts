import { assertNoFallback } from './debug/assertNoFallback'
import { resolveFallback } from './fallback/resolveFallback'
import { rasterizeElement } from './fallback/rasterizeElement'
import { layoutTable } from './layout/layoutTable'
import type { IDocumentBlockNode } from './model/document'
import type { IPageModel } from './model/layout'
import { renderImages } from './render/renderImage'
import { renderTextRuns } from './render/renderText'
import { renderVectorLines } from './render/renderVector'

declare const block: IDocumentBlockNode
declare const page: IPageModel
declare const doc: any

layoutTable(block)
assertNoFallback([page])
resolveFallback(page, {
  pageNo: 0,
  x: 0,
  y: 0,
  width: 10,
  height: 10,
  dataUrl: 'data:image/png;base64,AA=='
})
rasterizeElement(() => undefined, 10, 10, 'image')
renderTextRuns(doc, page, 'Song')
renderVectorLines(doc, page)
renderImages(doc, page)
