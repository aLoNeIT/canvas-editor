import type { IPageModel } from '../model/layout'

export function collectDiagnostics(pageModels: IPageModel[]) {
  return {
    pageCount: pageModels.length,
    fallbackBlocks: pageModels.flatMap(page => page.rasterBlocks),
    layoutWarnings: pageModels.flatMap(page => page.issues)
  }
}
