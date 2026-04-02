import type { IElement } from '../../../editor/interface/Element'
import type { IPdfVectorLine } from '../types'

export interface ICreateSeparatorVectorLineOption {
  element: IElement
  x: number
  y: number
}

export function createSeparatorVectorLine(
  option: ICreateSeparatorVectorLineOption
): Omit<IPdfVectorLine, 'pageNo'> {
  const width = option.element.width || 0
  return {
    x1: option.x,
    y1: option.y,
    x2: option.x + width,
    y2: option.y,
    color: option.element.color || '#000000',
    width: option.element.lineWidth || 1,
    dash: option.element.dashArray
  }
}
