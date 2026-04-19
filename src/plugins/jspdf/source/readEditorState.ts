import type Editor from '../../../editor'
import type { IEditorOption, IEditorResult } from '../../../editor'
import { ControlComponent } from '../../../editor/dataset/enum/Control'
import { EditorMode } from '../../../editor/dataset/enum/Editor'
import { ElementType } from '../../../editor/dataset/enum/Element'
import type { DeepRequired } from '../../../editor/interface/Common'
import type { IElement } from '../../../editor/interface/Element'
import type { IJspdfExportOption } from '../index'
import type { IJspdfBadgeStateSnapshot } from './badgeState'
import { getBadgeStateSnapshot } from './badgeState'

export interface IJspdfSourceState {
  result: IEditorResult
  options: DeepRequired<IEditorOption>
  exportOptions: IJspdfExportOption
  badge: IJspdfBadgeStateSnapshot
  coreLayout: IJspdfCoreLayoutSnapshot | null
}

export interface IJspdfCoreLayoutSnapshot {
  pageRowList: any[]
  headerRowList: any[]
  footerRowList: any[]
  headerExtraHeight: number
  footerExtraHeight: number
  mainOuterHeight: number
  pageCount: number
  iframeInfoList: any[]
}

export async function readEditorPrintPageDataUrlList(
  editor: Editor,
  exportOptions: IJspdfExportOption
) {
  const mode = exportOptions.mode || EditorMode.PRINT
  return editor.command.getImage({
    mode
  })
}

function filterAssistElement(elementList: IElement[]): IElement[] {
  return elementList.filter((element, index) => {
    if (element.type === ElementType.TABLE) {
      element.trList?.forEach(tr => {
        tr.tdList.forEach(td => {
          td.value = filterAssistElement(td.value)
        })
      })
    }

    if (!element.controlId) return true

    if (element.control?.minWidth) {
      if (
        element.controlComponent === ControlComponent.PREFIX ||
        element.controlComponent === ControlComponent.POSTFIX
      ) {
        element.value = ''
        return true
      }
    } else {
      if (
        element.control?.preText &&
        element.controlComponent === ControlComponent.PRE_TEXT
      ) {
        let isExistValue = false
        let start = index + 1
        while (start < elementList.length) {
          const nextElement = elementList[start]
          if (element.controlId !== nextElement.controlId) break
          if (nextElement.controlComponent === ControlComponent.VALUE) {
            isExistValue = true
            break
          }
          start++
        }
        return isExistValue
      }

      if (
        element.control?.postText &&
        element.controlComponent === ControlComponent.POST_TEXT
      ) {
        let isExistValue = false
        let start = index - 1
        while (start >= 0) {
          const preElement = elementList[start]
          if (element.controlId !== preElement.controlId) break
          if (preElement.controlComponent === ControlComponent.VALUE) {
            isExistValue = true
            break
          }
          start--
        }
        return isExistValue
      }
    }

    return (
      element.controlComponent !== ControlComponent.PREFIX &&
      element.controlComponent !== ControlComponent.POSTFIX &&
      element.controlComponent !== ControlComponent.PLACEHOLDER
    )
  })
}

function normalizePrintModeResult(result: IEditorResult): IEditorResult {
  return {
    ...result,
    data: {
      ...result.data,
      header: filterAssistElement(result.data.header || []),
      main: filterAssistElement(result.data.main || []),
      footer: filterAssistElement(result.data.footer || [])
    }
  }
}

export function readEditorState(
  editor: Editor,
  exportOptions: IJspdfExportOption
): IJspdfSourceState {
  const result = editor.command.getValue()
  const mode = exportOptions.mode || EditorMode.PRINT
  const coreLayout =
    mode === EditorMode.PRINT &&
    typeof (editor.command as any).getLayoutSnapshot === 'function'
      ? ((editor.command as any).getLayoutSnapshot() as IJspdfCoreLayoutSnapshot)
      : null

  return {
    result:
      mode === EditorMode.PRINT
        ? normalizePrintModeResult(result)
        : result,
    options: editor.command.getOptions(),
    exportOptions,
    badge: getBadgeStateSnapshot(editor),
    coreLayout
  }
}
