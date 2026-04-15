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
  const headerTop = documentModel.defaults.header.disabled
    ? 0
    : Math.floor(documentModel.defaults.header.top * scale)
  const headerHeight = documentModel.defaults.header.disabled
    ? 0
    : documentModel.header.height
  const footerBottomOffset = documentModel.defaults.footer.disabled
    ? 0
    : Math.floor(documentModel.defaults.footer.bottom * scale)
  const footerHeight = documentModel.defaults.footer.disabled
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
