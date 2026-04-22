import type { IPageModel } from '../model/layout'

export function assertNoFallback(pageModels: IPageModel[]) {
  const fallbackBlocks = pageModels.flatMap(page =>
    page.rasterBlocks.map(block => ({
      pageNo: page.pageNo,
      sourceType: block.sourceType || 'unknown'
    }))
  ).filter(block => block.sourceType !== 'image')

  if (!fallbackBlocks.length) return

  const message = fallbackBlocks
    .map(block => `page ${block.pageNo + 1}:${block.sourceType}`)
    .join(', ')

  throw new Error(`PDF export fallback detected: ${message}`)
}
