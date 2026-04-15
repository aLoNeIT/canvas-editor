import Editor, {
  Command,
  EditorMode,
  PaperDirection
} from '../../editor'
import { layoutDocument } from './layout/layoutDocument'
import { assertNoFallback } from './debug/assertNoFallback'
import { collectDiagnostics } from './debug/collectDiagnostics'
import { normalizeDocument } from './normalize/normalizeDocument'
import { renderPdfBase64 } from './renderPdf'
import { installBadgeStateTracking } from './source/badgeState'
import {
  readEditorPrintPageDataUrlList,
  readEditorState
} from './source/readEditorState'

export interface IJspdfPluginOption {
  fonts?: Record<string, string>
  defaultFontFamily?: string
  debug?: boolean
}

export interface IJspdfExportOption extends IJspdfPluginOption {
  mode?: EditorMode
  paperDirection?: PaperDirection
  __printPageDataUrlList?: string[]
}

export type CommandWithJspdf = Command & {
  executeExportPdfBase64(payload?: IJspdfExportOption): Promise<string>
  executeExportPdfDiagnostics(
    payload?: IJspdfExportOption
  ): Promise<ReturnType<typeof collectDiagnostics>>
}

export function jspdfPlugin(editor: Editor, options: IJspdfPluginOption = {}) {
  const command = editor.command as CommandWithJspdf
  installBadgeStateTracking(editor)

  command.executeExportPdfDiagnostics = async payload => {
    const printPageDataUrlList = await readEditorPrintPageDataUrlList(
      editor,
      payload || {}
    )
    const finalOption: IJspdfExportOption = {
      ...options,
      ...payload,
      mode: payload?.mode || EditorMode.PRINT,
      __printPageDataUrlList: printPageDataUrlList
    }
    const source = readEditorState(editor, finalOption)
    const documentModel = normalizeDocument(source)
    const pageModels = await layoutDocument(documentModel)
    return collectDiagnostics(pageModels)
  }

  command.executeExportPdfBase64 = async payload => {
    const printPageDataUrlList = await readEditorPrintPageDataUrlList(
      editor,
      payload || {}
    )
    const finalOption: IJspdfExportOption = {
      ...options,
      ...payload,
      mode: payload?.mode || EditorMode.PRINT,
      __printPageDataUrlList: printPageDataUrlList
    }
    const mode = finalOption.mode
    if (mode !== EditorMode.PRINT) {
      throw new Error('PDF export currently requires print mode layout')
    }
    const source = readEditorState(editor, finalOption)
    const documentModel = normalizeDocument(source)
    const pageModels = await layoutDocument(documentModel)
    const diagnostics = collectDiagnostics(pageModels)
    if (!pageModels.length) {
      throw new Error('PDF export failed: no page models were generated')
    }
    if (finalOption.debug) {
      assertNoFallback(pageModels)
      const issues = diagnostics.layoutWarnings
      if (issues.length) {
        throw new Error(`PDF export debug: ${issues.join('; ')}`)
      }
      const emptyPage = pageModels.find(
        page =>
          !page.textRuns.length &&
          !page.highlightRects.length &&
          !page.vectorLines.length &&
          !page.rasterBlocks.length
      )
      if (emptyPage) {
        throw new Error(
          `PDF export debug: page ${emptyPage.pageNo + 1} produced no output`
        )
      }
    }
    return renderPdfBase64(pageModels, finalOption)
  }
}
