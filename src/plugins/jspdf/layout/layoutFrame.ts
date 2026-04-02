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

  return {
    headerTop: top,
    headerBottom: top + documentModel.header.height,
    footerTop: documentModel.height - bottom - documentModel.footer.height,
    footerBottom: documentModel.height - bottom,
    mainTop: top + documentModel.header.height,
    mainBottom: documentModel.height - bottom - documentModel.footer.height
  }
}
