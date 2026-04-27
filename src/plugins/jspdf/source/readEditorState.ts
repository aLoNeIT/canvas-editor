import type Editor from '../../../editor'
import type { IEditorOption, IEditorResult } from '../../../editor'
import { ControlComponent } from '../../../editor/dataset/enum/Control'
import { EditorMode } from '../../../editor/dataset/enum/Editor'
import { ElementType } from '../../../editor/dataset/enum/Element'
import type { DeepRequired } from '../../../editor/interface/Common'
import type {
  IElement,
  IElementPosition
} from '../../../editor/interface/Element'
import type { IRow } from '../../../editor/interface/Row'
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
  pageRowList: IRow[][]
  headerRowList: IRow[]
  footerRowList: IRow[]
  positionList: IElementPosition[]
  headerPositionList: IElementPosition[]
  footerPositionList: IElementPosition[]
  headerExtraHeight: number
  footerExtraHeight: number
  mainOuterHeight: number
  pageCount: number
  iframeInfoList: unknown[][]
}

function isExportableControlElement(element: IElement) {
  if (!element.controlId) return true

  return (
    element.controlComponent === ControlComponent.VALUE ||
    element.controlComponent === ControlComponent.CHECKBOX ||
    element.controlComponent === ControlComponent.RADIO ||
    (
      element.controlComponent === ControlComponent.POSTFIX &&
      element.control?.minWidth &&
      element.control?.underline
    )
  )
}

function filterAssistElement(elementList: IElement[]): IElement[] {
  return elementList.filter(element => {
    if (element.type === ElementType.TABLE) {
      element.trList?.forEach(tr => {
        tr.tdList.forEach(td => {
          td.value = filterAssistElement(td.value)
        })
      })
    }

    return isExportableControlElement(element)
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
