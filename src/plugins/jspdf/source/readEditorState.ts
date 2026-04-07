import type Editor from '../../../editor'
import type { IEditorOption, IEditorResult } from '../../../editor'
import type { DeepRequired } from '../../../editor/interface/Common'
import type { IJspdfExportOption } from '../index'
import type { IJspdfBadgeStateSnapshot } from './badgeState'
import { getBadgeStateSnapshot } from './badgeState'

export interface IJspdfSourceState {
  result: IEditorResult
  options: DeepRequired<IEditorOption>
  exportOptions: IJspdfExportOption
  badge: IJspdfBadgeStateSnapshot
}

export function readEditorState(
  editor: Editor,
  exportOptions: IJspdfExportOption
): IJspdfSourceState {
  return {
    result: editor.command.getValue(),
    options: editor.command.getOptions(),
    exportOptions,
    badge: getBadgeStateSnapshot(editor)
  }
}
