import {
  BackgroundRepeat,
  BackgroundSize
} from '../../../editor/dataset/enum/Background'
import { NumberType } from '../../../editor/dataset/enum/Common'
import { LineNumberType } from '../../../editor/dataset/enum/LineNumber'
import { RowFlex } from '../../../editor/dataset/enum/Row'
import { WatermarkType } from '../../../editor/dataset/enum/Watermark'
import type { IPdfHighlightRect, IPdfTextRun } from '../types'
import type { IPdfRasterBlock } from '../types'
import type { IPdfVectorLine } from '../types'

function convertNumberToChinese(num: number) {
  const chineseNum = [
    '\u96f6',
    '\u4e00',
    '\u4e8c',
    '\u4e09',
    '\u56db',
    '\u4e94',
    '\u516d',
    '\u4e03',
    '\u516b',
    '\u4e5d'
  ]
  const chineseUnit = [
    '',
    '\u5341',
    '\u767e',
    '\u5343',
    '\u4e07'
  ]
  if (!num) return chineseNum[0]
  const digits = String(num).split('').map(Number)
  return digits
    .map((digit, index) => {
      const unitIndex = digits.length - 1 - index
      return `${digit ? chineseNum[digit] : chineseNum[0]}${
        digit && unitIndex < chineseUnit.length ? chineseUnit[unitIndex] : ''
      }`
    })
    .join('')
    .replace(/\u96f6+/g, '\u96f6')
    .replace(/\u96f6(\u4e07|\u5343|\u767e|\u5341)/g, '\u96f6')
    .replace(/\u96f6$/g, '')
    .replace(/^\u4e00\u5341/, '\u5341')
}

function formatNumber(num: number, numberType: NumberType) {
  return numberType === NumberType.CHINESE
    ? convertNumberToChinese(num)
    : `${num}`
}

function replacePagePlaceholders(
  text: string,
  pageNo: number,
  pageCount: number,
  numberType: NumberType
) {
  return text
    .replace(/\{pageNo\}/g, formatNumber(pageNo, numberType))
    .replace(/\{pageCount\}/g, formatNumber(pageCount, numberType))
}

export function createBackgroundRect(option: {
  pageWidth: number
  pageHeight: number
  color: string
}): Omit<IPdfHighlightRect, 'pageNo'> {
  return {
    x: 0,
    y: 0,
    width: option.pageWidth,
    height: option.pageHeight,
    color: option.color,
    opacity: 1
  }
}

export function createPageBorderLines(option: {
  x: number
  y: number
  width: number
  height: number
  color: string
  lineWidth: number
}): Omit<IPdfVectorLine, 'pageNo'>[] {
  const right = option.x + option.width
  const bottom = option.y + option.height

  return [
    {
      x1: option.x,
      y1: option.y,
      x2: right,
      y2: option.y,
      color: option.color,
      width: option.lineWidth
    },
    {
      x1: right,
      y1: option.y,
      x2: right,
      y2: bottom,
      color: option.color,
      width: option.lineWidth
    },
    {
      x1: right,
      y1: bottom,
      x2: option.x,
      y2: bottom,
      color: option.color,
      width: option.lineWidth
    },
    {
      x1: option.x,
      y1: bottom,
      x2: option.x,
      y2: option.y,
      color: option.color,
      width: option.lineWidth
    }
  ]
}

export function createBackgroundImagePlacement(option: {
  pageNo: number
  pageWidth: number
  pageHeight: number
  image: string
  size: BackgroundSize
  applyPageNumbers: number[]
}): Omit<IPdfRasterBlock, 'pageNo'> | null {
  return createBackgroundImagePlacements(option)[0] || null
}

export function createBackgroundImagePlacements(option: {
  pageNo: number
  pageWidth: number
  pageHeight: number
  image: string
  imageWidth?: number
  imageHeight?: number
  size: BackgroundSize
  repeat?: BackgroundRepeat
  applyPageNumbers: number[]
}): Omit<IPdfRasterBlock, 'pageNo'>[] {
  if (!option.image) {
    return []
  }
  if (
    option.applyPageNumbers.length &&
    !option.applyPageNumbers.includes(option.pageNo)
  ) {
    return []
  }

  if (option.size === BackgroundSize.COVER) {
    return [
      {
        x: 0,
        y: 0,
        width: option.pageWidth,
        height: option.pageHeight,
        dataUrl: option.image,
        sourceType: 'background-image'
      }
    ]
  }

  const tileWidth = option.imageWidth || option.pageWidth
  const tileHeight = option.imageHeight || option.pageHeight
  const repeat = option.repeat || BackgroundRepeat.NO_REPEAT
  const repeatX =
    repeat === BackgroundRepeat.REPEAT || repeat === BackgroundRepeat.REPEAT_X
  const repeatY =
    repeat === BackgroundRepeat.REPEAT || repeat === BackgroundRepeat.REPEAT_Y
  const xCount = repeatX ? Math.ceil(option.pageWidth / tileWidth) : 1
  const yCount = repeatY ? Math.ceil(option.pageHeight / tileHeight) : 1
  const placementList: Omit<IPdfRasterBlock, 'pageNo'>[] = []

  for (let x = 0; x < xCount; x++) {
    for (let y = 0; y < yCount; y++) {
      placementList.push({
        x: x * tileWidth,
        y: y * tileHeight,
        width: tileWidth,
        height: tileHeight,
        dataUrl: option.image,
        sourceType: 'background-image'
      })
    }
  }

  return placementList
}

export function createPageNumberPlacement(option: {
  pageNo: number
  pageCount: number
  pageWidth: number
  pageHeight: number
  margins: number[]
  bottom: number
  format: string
  numberType: NumberType
  rowFlex: RowFlex
  font: string
  size: number
  color: string
  startPageNo: number
  fromPageNo: number
  measureWidth: (text: string) => number
}): Omit<IPdfTextRun, 'pageNo'> | null {
  if (option.pageNo < option.fromPageNo) {
    return null
  }

  const text = replacePagePlaceholders(
    option.format,
    option.pageNo + option.startPageNo - option.fromPageNo,
    option.pageCount - option.fromPageNo,
    option.numberType
  )
  const textWidth = option.measureWidth(text)
  let x = option.margins[3]
  if (option.rowFlex === RowFlex.CENTER) {
    x = (option.pageWidth - textWidth) / 2
  } else if (option.rowFlex === RowFlex.RIGHT) {
    x = option.pageWidth - textWidth - option.margins[1]
  }

  return {
    text,
    x,
    y: option.pageHeight - option.bottom,
    width: textWidth,
    height: option.size + 8,
    font: option.font,
    size: option.size,
    color: option.color
  }
}

export function createLineNumberPlacements(option: {
  baselineYList: number[]
  margins: number[]
  right: number
  font: string
  size: number
  color: string
  type: LineNumberType
  startLineNo: number
  measureWidth: (text: string) => number
}): Omit<IPdfTextRun, 'pageNo'>[] {
  return option.baselineYList.map((baselineY, index) => {
    const seq =
      option.type === LineNumberType.PAGE
        ? index + 1
        : option.startLineNo + index
    const text = `${seq}`
    const width = option.measureWidth(text)

    return {
      text,
      x: option.margins[3] - width - option.right,
      y: baselineY,
      width,
      height: option.size + 8,
      font: option.font,
      size: option.size,
      color: option.color
    }
  })
}

export function createWatermarkPlacement(option: {
  pageNo: number
  pageCount: number
  pageWidth: number
  pageHeight: number
  data: string
  numberType: NumberType
  font: string
  size: number
  color: string
  opacity: number
  measureWidth: (text: string) => number
}): Omit<IPdfTextRun, 'pageNo'> | null {
  return createWatermarkPlacements({
    ...option,
    repeat: false,
    gap: [0, 0]
  })[0] || null
}

export function createWatermarkPlacements(option: {
  pageNo: number
  pageCount: number
  pageWidth: number
  pageHeight: number
  data: string
  numberType: NumberType
  font: string
  size: number
  color: string
  opacity: number
  repeat: boolean
  gap: [number, number]
  measureWidth: (text: string) => number
}): Omit<IPdfTextRun, 'pageNo'>[] {
  if (!option.data) {
    return []
  }

  const text = replacePagePlaceholders(
    option.data,
    option.pageNo + 1,
    option.pageCount,
    option.numberType
  )
  const width = option.measureWidth(text)
  const height = option.size + 8

  if (!option.repeat) {
    return [
      {
        text,
        x: (option.pageWidth - width) / 2,
        y: option.pageHeight / 2,
        width,
        height,
        font: option.font,
        size: option.size,
        color: option.color,
        opacity: option.opacity,
        rotate: -45
      }
    ]
  }

  const diagonalLength = Math.sqrt(Math.pow(width, 2) + Math.pow(height, 2))
  const patternWidth = diagonalLength + 2 * option.gap[0]
  const patternHeight = diagonalLength + 2 * option.gap[1]
  const offsetX = (patternWidth - width) / 2
  const baselineY = patternHeight / 2
  const xCount = Math.ceil(option.pageWidth / patternWidth)
  const yCount = Math.ceil(option.pageHeight / patternHeight)
  const placementList: Omit<IPdfTextRun, 'pageNo'>[] = []

  for (let y = 0; y < yCount; y++) {
    for (let x = 0; x < xCount; x++) {
      const placementX = x * patternWidth + offsetX
      const placementY = y * patternHeight + baselineY
      if (
        placementX >= option.pageWidth ||
        placementY >= option.pageHeight
      ) {
        continue
      }
      placementList.push({
        text,
        x: placementX,
        y: placementY,
        width,
        height,
        font: option.font,
        size: option.size,
        color: option.color,
        opacity: option.opacity,
        rotate: -45
      })
    }
  }

  return placementList
}

export function createImageWatermarkPlacement(option: {
  pageWidth: number
  pageHeight: number
  data: string
  type: WatermarkType
  width: number
  height: number
  opacity?: number
}): Omit<IPdfRasterBlock, 'pageNo'> | null {
  return createImageWatermarkPlacements({
    ...option,
    repeat: false,
    gap: [0, 0]
  })[0] || null
}

export function createImageWatermarkPlacements(option: {
  pageWidth: number
  pageHeight: number
  data: string
  type: WatermarkType
  width: number
  height: number
  opacity?: number
  repeat: boolean
  gap: [number, number]
}): Omit<IPdfRasterBlock, 'pageNo'>[] {
  if (!option.data || option.type !== WatermarkType.IMAGE) {
    return []
  }

  if (!option.repeat) {
    return [
      {
        x: (option.pageWidth - option.width) / 2,
        y: (option.pageHeight - option.height) / 2,
        width: option.width,
        height: option.height,
        dataUrl: option.data,
        sourceType: 'watermark-image',
        opacity: option.opacity ?? 0.3,
        rotate: -45
      }
    ]
  }

  const diagonalLength = Math.sqrt(
    Math.pow(option.width, 2) + Math.pow(option.height, 2)
  )
  const patternWidth = diagonalLength + 2 * option.gap[0]
  const patternHeight = diagonalLength + 2 * option.gap[1]
  const offsetX = (patternWidth - option.width) / 2
  const offsetY = (patternHeight - option.height) / 2
  const xCount = Math.ceil(option.pageWidth / patternWidth)
  const yCount = Math.ceil(option.pageHeight / patternHeight)
  const placementList: Omit<IPdfRasterBlock, 'pageNo'>[] = []

  for (let y = 0; y < yCount; y++) {
    for (let x = 0; x < xCount; x++) {
      const placementX = x * patternWidth + offsetX
      const placementY = y * patternHeight + offsetY
      if (
        placementX >= option.pageWidth ||
        placementY >= option.pageHeight
      ) {
        continue
      }
      placementList.push({
        x: placementX,
        y: placementY,
        width: option.width,
        height: option.height,
        dataUrl: option.data,
        sourceType: 'watermark-image',
        opacity: option.opacity ?? 0.3,
        rotate: -45
      })
    }
  }

  return placementList
}
