import {
  BackgroundRepeat,
  BackgroundSize
} from '../../../editor/dataset/enum/Background'
import { NumberType } from '../../../editor/dataset/enum/Common'
import { RowFlex } from '../../../editor/dataset/enum/Row'
import { WatermarkType } from '../../../editor/dataset/enum/Watermark'
import type { IPdfHighlightRect, IPdfTextRun } from '../types'
import type { IPdfRasterBlock } from '../types'

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
  if (!option.data) {
    return null
  }

  const text = replacePagePlaceholders(
    option.data,
    option.pageNo + 1,
    option.pageCount,
    option.numberType
  )
  const width = option.measureWidth(text)

  return {
    text,
    x: (option.pageWidth - width) / 2,
    y: option.pageHeight / 2,
    width,
    height: option.size + 8,
    font: option.font,
    size: option.size,
    color: option.color,
    opacity: option.opacity,
    rotate: -45
  }
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

  const stepX = option.width + option.gap[0]
  const stepY = option.height + option.gap[1]
  const xCount = Math.ceil(option.pageWidth / stepX)
  const yCount = Math.ceil(option.pageHeight / stepY)
  const placementList: Omit<IPdfRasterBlock, 'pageNo'>[] = []

  for (let y = 0; y < yCount; y++) {
    for (let x = 0; x < xCount; x++) {
      placementList.push({
        x: x * stepX,
        y: y * stepY,
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
