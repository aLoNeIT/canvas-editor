import type Editor from '../../../editor'
import type { IEditorOption, IEditorResult } from '../../../editor'
import type { DeepRequired } from '../../../editor/interface/Common'
import type { IJspdfExportOption } from '../index'

export interface IJspdfSourceState {
  result: IEditorResult
  options: DeepRequired<IEditorOption>
  exportOptions: IJspdfExportOption
}

export function readEditorState(
  editor: Editor,
  exportOptions: IJspdfExportOption
): IJspdfSourceState {
  return {
    result: editor.command.getValue(),
    options: editor.command.getOptions(),
    exportOptions
  }
}
