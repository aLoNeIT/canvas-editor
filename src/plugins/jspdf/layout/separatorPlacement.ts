import type { IElement } from '../../../editor/interface/Element'
import type { IPdfVectorLine } from '../types'

export interface ICreateSeparatorVectorLineOption {
  element: IElement
  x: number
  y: number
  baseY?: number
}

export function resolveSeparatorVectorLineY(baseY: number, lineWidth: number) {
  return Math.round(baseY) + lineWidth / 2
}

export function createSeparatorVectorLine(
  option: ICreateSeparatorVectorLineOption
): Omit<IPdfVectorLine, 'pageNo'> {
  const width = option.element.width || 0
  const lineWidth = option.element.lineWidth || 1
  const y = typeof option.baseY === 'number'
    ? resolveSeparatorVectorLineY(option.baseY, lineWidth)
    : option.y
  return {
    x1: option.x,
    y1: y,
    x2: option.x + width,
    y2: y,
    color: option.element.color || '#000000',
    width: lineWidth,
    dash: option.element.dashArray
  }
}
