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
  ascent?: number
  descent?: number
  widthOverride?: number
  baselineShift?: number
  rowMargin?: number
  letterSpacing?: number
  bold?: boolean
  italic?: boolean
  underline?: boolean
  strikeout?: boolean
  color?: string
  highlight?: string
  linkUrl?: string
  areaId?: string
  areaBackgroundColor?: string
  areaBorderColor?: string
  controlKey?: object
  controlBorder?: boolean
  inlineImageDataUrl?: string
  inlineImageWidth?: number
  inlineImageHeight?: number
  inlineImageCrop?: ITextPlacementInlineImageCrop
  baselineOffset: number
}

export interface ITextPlacementInlineImageCrop {
  x: number
  y: number
  width: number
  height: number
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
    ascent: option.size * 0.8,
    descent: option.size * 0.2,
    bold: option.bold,
    italic: option.italic,
    color: option.color,
    baselineOffset: option.size
  }))
}
