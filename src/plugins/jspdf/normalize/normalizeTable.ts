import { ElementType } from '../../../editor'

export function isTableElement(element: { type?: string }) {
  return element.type === ElementType.TABLE
}
