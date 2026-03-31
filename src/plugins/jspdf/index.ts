import Editor, {
  Command,
  EditorMode,
  IPdfExportSnapshot,
  PaperDirection
} from '../../editor'
import { buildPdfPageModels } from './buildSnapshot'
import { renderPdfBase64 } from './renderPdf'

export interface IJspdfPluginOption {
  fonts?: Record<string, string>
  defaultFontFamily?: string
  debug?: boolean
}

export interface IJspdfExportOption extends IJspdfPluginOption {
  mode?: EditorMode
  paperDirection?: PaperDirection
}

export type CommandWithJspdf = Command & {
  executeExportPdfBase64(payload?: IJspdfExportOption): Promise<string>
  getPdfExportSnapshot(): IPdfExportSnapshot
}

export function jspdfPlugin(editor: Editor, options: IJspdfPluginOption = {}) {
  const command = editor.command as CommandWithJspdf

  command.executeExportPdfBase64 = async payload => {
    const finalOption: IJspdfExportOption = {
      ...options,
      ...payload
    }
    const mode = finalOption.mode || EditorMode.PRINT
    if (mode !== EditorMode.PRINT) {
      throw new Error('PDF export currently requires print mode layout')
    }
    const snapshot = command.getPdfExportSnapshot()
    const pageModels = buildPdfPageModels(snapshot)
    if (!pageModels.length) {
      throw new Error('PDF export failed: no page models were generated')
    }
    if (finalOption.debug) {
      const issues = pageModels.flatMap(page =>
        page.issues.map(issue => `page ${page.pageNo + 1}: ${issue}`)
      )
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
