import type { IJspdfSourceState } from './source/readEditorState'
import { normalizeDocument } from './normalize/normalizeDocument'
import type { IDocumentModel } from './model/document'

declare const source: IJspdfSourceState

const documentModel: IDocumentModel = normalizeDocument(source)

documentModel.header.key
documentModel.main.blockList
documentModel.footer.elementList
