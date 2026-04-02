import type { IPageModel } from '../model/layout'

export function resolveFallback(
  page: IPageModel,
  fallback: IPageModel['rasterBlocks'][number]
) {
  page.rasterBlocks.push(fallback)
  page.issues.push(`fallback:${fallback.sourceType || 'unknown'}`)
}
