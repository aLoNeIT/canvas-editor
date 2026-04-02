import { wrapText } from './wrapText'

export interface ICreateTextPlacementsOption {
  text: string
  x: number
  y: number
  width: number
  font: string
  size: number
  lineHeight: number
  bold?: boolean
  italic?: boolean
  color?: string
  measureWidth: (text: string) => number
}

export interface ITextPlacement {
  text: string
  x: number
  y: number
  width: number
  height: number
  font: string
  size: number
  baselineShift?: number
  bold?: boolean
  italic?: boolean
  underline?: boolean
  strikeout?: boolean
  color?: string
  baselineOffset: number
}

export function createTextPlacements(
  option: ICreateTextPlacementsOption
): ITextPlacement[] {
  const lineList = wrapText({
    text: option.text,
    maxWidth: option.width,
    measureWidth: option.measureWidth
  })

  return lineList.map((line, index) => ({
    text: line || ' ',
    x: option.x,
    y: option.y + option.size + index * option.lineHeight,
    width: option.width,
    height: option.lineHeight,
    font: option.font,
    size: option.size,
    bold: option.bold,
    italic: option.italic,
    color: option.color,
    baselineOffset: option.size
  }))
}
