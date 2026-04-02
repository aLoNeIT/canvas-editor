import type { IElement } from '../../../editor/interface/Element'
import type { IPdfHighlightRect } from '../types'
import type { ITextPlacement } from './textPlacement'

export interface ICreateLabelPlacementOption {
  element: IElement
  x: number
  y: number
  fallbackFont: string
  fallbackSize: number
  fallbackColor: string
  fallbackBackgroundColor: string
  fallbackPadding: number[]
  measureWidth: (text: string) => number
}

export interface ILabelPlacementResult {
  backgroundRect: Omit<IPdfHighlightRect, 'pageNo'>
  textPlacement: ITextPlacement
  height: number
}

export function createLabelPlacement(
  option: ICreateLabelPlacementOption
): ILabelPlacementResult {
  const font = option.element.font || option.fallbackFont
  const size = option.element.size || option.fallbackSize
  const color =
    option.element.label?.color || option.fallbackColor
  const backgroundColor =
    option.element.label?.backgroundColor || option.fallbackBackgroundColor
  const padding = option.element.label?.padding || option.fallbackPadding
  const text = option.element.value || ''
  const textWidth = option.measureWidth(text)
  const width = textWidth + padding[1] + padding[3]
  const height = Math.max(size + padding[0] + padding[2], size + 8)

  return {
    backgroundRect: {
      x: option.x,
      y: option.y,
      width,
      height,
      color: backgroundColor,
      opacity: 1
    },
    textPlacement: {
      text,
      x: option.x + padding[3],
      y: option.y + padding[0] + size,
      width: textWidth,
      height,
      font,
      size,
      bold: option.element.bold,
      italic: option.element.italic,
      color,
      baselineOffset: size
    },
    height
  }
}
