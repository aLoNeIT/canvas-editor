import type { IDocumentModel } from '../model/document'

export interface IFrameLayoutResult {
  headerTop: number
  headerBottom: number
  footerTop: number
  footerBottom: number
  mainTop: number
  mainBottom: number
}

export function layoutFrame(documentModel: IDocumentModel): IFrameLayoutResult {
  const [top, , bottom] = documentModel.margins
  const scale = documentModel.scale || 1
  const headerDisabled = documentModel.defaults.header?.disabled ?? false
  const headerOffsetTop = documentModel.defaults.header?.top ?? 0
  const footerDisabled = documentModel.defaults.footer?.disabled ?? false
  const footerOffsetBottom = documentModel.defaults.footer?.bottom ?? 0
  const headerTop = headerDisabled
    ? 0
    : Math.floor(headerOffsetTop * scale)
  const headerHeight = headerDisabled
    ? 0
    : documentModel.header.height
  const footerBottomOffset = footerDisabled
    ? 0
    : Math.floor(footerOffsetBottom * scale)
  const footerHeight = footerDisabled
    ? 0
    : documentModel.footer.height
  const headerExtraHeight = Math.max(0, headerTop + headerHeight - top)
  const footerExtraHeight = Math.max(
    0,
    footerBottomOffset + footerHeight - bottom
  )

  return {
    headerTop,
    headerBottom: headerTop + headerHeight,
    footerTop: documentModel.height - footerBottomOffset - footerHeight,
    footerBottom: documentModel.height - footerBottomOffset,
    mainTop: top + headerExtraHeight,
    mainBottom: documentModel.height - bottom - footerExtraHeight
  }
}
