import { ElementType } from '../../../editor'

export function isControlElement(element: { type?: string }) {
  return (
    element.type === ElementType.CONTROL ||
    element.type === ElementType.CHECKBOX ||
    element.type === ElementType.RADIO
  )
}
