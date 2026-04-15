import { rasterizeElement } from '../fallback/rasterizeElement'
import { resolveFallback } from '../fallback/resolveFallback'
import type { IDocumentBlockNode, IDocumentModel } from '../model/document'
import type { IPageModel } from '../model/layout'
import { measureLineHeight, measureText } from '../measure/textMeasure'
import { BlockType } from '../../../editor/dataset/enum/Block'
import { ImageDisplay } from '../../../editor/dataset/enum/Common'
import { ElementType } from '../../../editor/dataset/enum/Element'
import { LineNumberType } from '../../../editor/dataset/enum/LineNumber'
import { WatermarkType } from '../../../editor/dataset/enum/Watermark'
import { splitText } from '../../../editor/utils'
import {
  createListMarkerPlacement,
  resolveBlockTextStyle,
  resolveListBlockSemantics,
  type IListBlockSemantics,
  type IResolvedBlockTextStyle
} from './blockSemantics'
import { createBlockTextPlacementResult } from './blockTextPlacement'
import {
  createBackgroundRect,
  createBackgroundImagePlacements,
  createImageWatermarkPlacements,
  createLineNumberPlacements,
  createPageBorderLines,
  createPageNumberPlacement,
  createWatermarkPlacement
} from './framePlacement'
import { getBlockHeight } from './layoutBlock'
import { layoutFrame, type IFrameLayoutResult } from './layoutFrame'
import { layoutInline } from './layoutInline'
import { createLabelPlacement } from './labelPlacement'
import { resolveImageSize } from './imageSize'
import { createSeparatorVectorLine } from './separatorPlacement'
import { getTableColumnWidthList, layoutTable } from './layoutTable'
import { createTableCellTextPlacements } from './tableCellPlacement'
import { createTextDecorationLines } from './textDecoration'
import { paginateTableRows } from './tablePagination'
import { resolveTableRowHeightList } from './tableMetrics'
import { createTableCellVisuals } from './tableVisual'
import { PDF_RENDER_STAGE } from '../render/renderStage'
import type { IStyledTextPlacementLine } from './styledTextRunPlacement'
import { createLatexRasterBlock } from './latex'

const DEFAULT_TAB_WIDTH = 32
const DENSE_CJK_FALLBACK_SOURCE_TYPE = 'text-line-cjk'
const DENSE_CJK_MIN_LENGTH = 20
const DENSE_CJK_MIN_RATIO = 0.6
const DENSE_CJK_FALLBACK_PIXEL_RATIO = 3
const CJK_CHAR_REG = /[\u3400-\u9fff\uf900-\ufaff]/
const ASCII_ALPHA_REG = /[A-Za-z]/
const DIGIT_REG = /[0-9]/
const SHORT_CJK_LINE_MAX_LENGTH = 24
const SHORT_CJK_LINE_MAX_SIZE = 18
const COMPACT_MIXED_LINE_MAX_LENGTH = 48
const rasterSourceImageCache = new Map<string, Promise<HTMLImageElement>>()

interface ITableRowPlacement {
  kind: 'table-row'
  block: IDocumentBlockNode
  height: number
  rowIndex: number
  forceBreakAfter?: boolean
}

interface IBlockPlacement {
  kind: 'block'
  block: IDocumentBlockNode
  height: number
  defaults: IDocumentModel['defaults']
  forceBreakAfter?: boolean
}

interface ITextLinePlacement {
  kind: 'text-line'
  block: IDocumentBlockNode
  line: IStyledTextPlacementLine
  lineIndex: number
  height: number
  textStyle: IResolvedBlockTextStyle
  listSemantic: IListBlockSemantics
  forceBreakAfter?: boolean
}

type IMainPlacement = ITableRowPlacement | IBlockPlacement | ITextLinePlacement

interface IResolvedTextBlockLayout {
  lineList: IStyledTextPlacementLine[]
  height: number
  textStyle: IResolvedBlockTextStyle
  listSemantic: IListBlockSemantics
}

interface IAreaDecorationSegment {
  areaId: string
  top: number
  bottom: number
  backgroundColor?: string
  borderColor?: string
}

interface IControlBorderSegment {
  top: number
  bottom: number
  left: number
  right: number
}

function getTextLineHeight(
  font: string,
  size: number,
  bold?: boolean,
  italic?: boolean
) {
  return measureLineHeight(font, size, bold, italic)
}

function isFloatingImageBlock(block: IDocumentBlockNode) {
  return (
    block.kind === 'image' &&
    Boolean(block.element.imgFloatPosition) &&
    (
      block.element.imgDisplay === ImageDisplay.SURROUND ||
      block.element.imgDisplay === ImageDisplay.FLOAT_TOP ||
      block.element.imgDisplay === ImageDisplay.FLOAT_BOTTOM
    )
  )
}

function getFloatingImagePageNo(block: IDocumentBlockNode) {
  return block.element.imgFloatPosition?.pageNo ?? 0
}

function isSurroundImageBlock(block: IDocumentBlockNode) {
  return (
    isFloatingImageBlock(block) &&
    block.element.imgDisplay === ImageDisplay.SURROUND
  )
}

function createPage(pageNo: number, documentModel: IDocumentModel): IPageModel {
  return {
    pageNo,
    width: documentModel.width,
    height: documentModel.height,
    textRuns: [],
    highlightRects: [],
    links: [],
    vectorLines: [],
    rasterBlocks: [],
    issues: []
  }
}

function loadRasterSourceImage(dataUrl: string) {
  const cached = rasterSourceImageCache.get(dataUrl)
  if (cached) {
    return cached
  }

  const imagePromise = new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () =>
      reject(new Error('Failed to load raster source image'))
    image.src = dataUrl
  })
  rasterSourceImageCache.set(dataUrl, imagePromise)
  return imagePromise
}

async function cropPageRegionDataUrl(
  dataUrl: string,
  crop: {
    x: number
    y: number
    width: number
    height: number
  }
) {
  const image = await loadRasterSourceImage(dataUrl)
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.ceil(crop.width))
  canvas.height = Math.max(1, Math.ceil(crop.height))
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    throw new Error('Fallback crop canvas context is unavailable')
  }

  ctx.drawImage(
    image,
    crop.x,
    crop.y,
    crop.width,
    crop.height,
    0,
    0,
    canvas.width,
    canvas.height
  )

  return canvas.toDataURL('image/png')
}

function resolvePlacementRasterBounds(
  placementList: IStyledTextPlacementLine['placementList'],
  x: number,
  y: number
) {
  const absolutePlacementList = placementList.map(placement => ({
    ...placement,
    x: x + placement.x,
    y: y + placement.y
  }))
  const lineList = createTextDecorationLines(absolutePlacementList)
  const minX = Math.min(...absolutePlacementList.map(placement => placement.x))
  const maxX = Math.max(
    ...absolutePlacementList.map(placement => placement.x + placement.width)
  )
  const top = Math.min(
    ...absolutePlacementList.map(
      placement => placement.y - placement.baselineOffset
    )
  )
  const bottom = Math.max(
    ...absolutePlacementList.map(
      placement => placement.y - placement.baselineOffset + placement.height
    )
  )
  const rasterX = Math.floor(minX)
  const rasterY = Math.floor(top)
  const rasterRight = Math.ceil(maxX)
  const rasterBottom = Math.ceil(bottom)

  return {
    absolutePlacementList,
    lineList,
    x: rasterX,
    y: rasterY,
    width: Math.max(1, rasterRight - rasterX),
    height: Math.max(1, rasterBottom - rasterY)
  }
}

async function createTextWatermarkRasterBlock(payload: {
  pageNo: number
  pageCount: number
  pageWidth: number
  pageHeight: number
  watermark: IDocumentModel['defaults']['watermark']
}) {
  if (
    !payload.watermark.data ||
    payload.watermark.type === WatermarkType.IMAGE
  ) {
    return null
  }

  const measureWidth = createMeasureWidth(
    payload.watermark.font,
    payload.watermark.size
  )
  const placement = createWatermarkPlacement({
    pageNo: payload.pageNo,
    pageCount: payload.pageCount,
    pageWidth: payload.pageWidth,
    pageHeight: payload.pageHeight,
    data: payload.watermark.data,
    numberType: payload.watermark.numberType,
    font: payload.watermark.font,
    size: payload.watermark.size,
    color: payload.watermark.color,
    opacity: payload.watermark.opacity,
    measureWidth
  })

  if (!placement?.text) {
    return null
  }

  const watermark = payload.watermark
  const metric = measureText(
    placement.text,
    watermark.font,
    watermark.size
  )
  if (watermark.repeat) {
    const rasterBlock = await rasterizeElement(
      ctx => {
        ctx.save()
        ctx.globalAlpha = watermark.opacity
        ctx.font = `${watermark.size}px ${watermark.font}`
        ctx.fillStyle = watermark.color

        const temporaryCanvas = document.createElement('canvas')
        const temporaryCtx = temporaryCanvas.getContext('2d')
        if (!temporaryCtx) {
          throw new Error('Watermark pattern canvas context is unavailable')
        }

        const textWidth = metric.width
        const textHeight = metric.ascent + metric.descent
        const diagonalLength = Math.sqrt(
          Math.pow(textWidth, 2) + Math.pow(textHeight, 2)
        )
        const patternWidth = diagonalLength + 2 * watermark.gap[0]
        const patternHeight = diagonalLength + 2 * watermark.gap[1]

        temporaryCanvas.width = Math.max(1, Math.ceil(patternWidth))
        temporaryCanvas.height = Math.max(1, Math.ceil(patternHeight))
        temporaryCtx.translate(patternWidth / 2, patternHeight / 2)
        temporaryCtx.rotate((-45 * Math.PI) / 180)
        temporaryCtx.translate(-patternWidth / 2, -patternHeight / 2)
        temporaryCtx.font = `${watermark.size}px ${watermark.font}`
        temporaryCtx.fillStyle = watermark.color
        temporaryCtx.fillText(
          placement.text,
          (patternWidth - textWidth) / 2,
          (patternHeight - textHeight) / 2 + metric.ascent
        )

        const pattern = ctx.createPattern(temporaryCanvas, 'repeat')
        if (pattern) {
          ctx.fillStyle = pattern
          ctx.fillRect(0, 0, payload.pageWidth, payload.pageHeight)
        }
        ctx.restore()
      },
      payload.pageWidth,
      payload.pageHeight,
      'watermark-text',
      2
    )

    return {
      ...rasterBlock,
      pageNo: payload.pageNo,
      stage: PDF_RENDER_STAGE.BACKGROUND,
      layer: 'background' as const,
      debugLabel: 'text-watermark'
    }
  }

  const textHeight = metric.ascent + metric.descent
  const diagonalLength = Math.sqrt(
    Math.pow(metric.width, 2) + Math.pow(textHeight, 2)
  )
  const rasterSize = Math.max(1, Math.ceil(diagonalLength + 8))
  const rasterBlock = await rasterizeElement(
    ctx => {
      ctx.save()
      ctx.globalAlpha = watermark.opacity
      ctx.font = `${watermark.size}px ${watermark.font}`
      ctx.fillStyle = watermark.color
      ctx.translate(rasterSize / 2, rasterSize / 2)
      ctx.rotate((-45 * Math.PI) / 180)
      ctx.fillText(
        placement.text,
        -metric.width / 2,
        metric.ascent - watermark.size / 2
      )
      ctx.restore()
    },
    rasterSize,
    rasterSize,
    'watermark-text',
    2
  )

  return {
    ...rasterBlock,
    pageNo: payload.pageNo,
    stage: PDF_RENDER_STAGE.BACKGROUND,
    x: (payload.pageWidth - rasterSize) / 2,
    y: (payload.pageHeight - rasterSize) / 2,
    layer: 'background' as const,
    debugLabel: 'text-watermark'
  }
}

async function appendFrameDecorations(
  page: IPageModel,
  documentModel: IDocumentModel,
  pageCount: number,
  frame: {
    headerTop: number
    headerBottom: number
    footerTop: number
    footerBottom: number
    mainTop: number
    mainBottom: number
  },
  backgroundImageSize?: {
    width: number
    height: number
  } | null
) {
  const backgroundImagePlacements = createBackgroundImagePlacements({
    pageNo: page.pageNo,
    pageWidth: page.width,
    pageHeight: page.height,
    image: documentModel.defaults.backgroundImage,
    imageWidth: backgroundImageSize?.width,
    imageHeight: backgroundImageSize?.height,
    size: documentModel.defaults.backgroundSize,
    repeat: documentModel.defaults.backgroundRepeat,
    applyPageNumbers: documentModel.defaults.backgroundApplyPageNumbers
  })
  if (backgroundImagePlacements.length) {
    backgroundImagePlacements.forEach(backgroundImagePlacement => {
      page.rasterBlocks.push({
        pageNo: page.pageNo,
        ...backgroundImagePlacement,
        layer: 'background'
      })
    })
  } else {
    page.highlightRects.push({
      pageNo: page.pageNo,
      stage: PDF_RENDER_STAGE.BACKGROUND,
      ...createBackgroundRect({
        pageWidth: page.width,
        pageHeight: page.height,
        color: documentModel.defaults.backgroundColor
      })
    })
  }

  const imageWatermarkPlacements = createImageWatermarkPlacements({
    pageWidth: page.width,
    pageHeight: page.height,
    data: documentModel.defaults.watermark.data,
    type: documentModel.defaults.watermark.type,
    width: documentModel.defaults.watermark.width,
    height: documentModel.defaults.watermark.height,
    opacity: documentModel.defaults.watermark.opacity,
    repeat: documentModel.defaults.watermark.repeat,
    gap: [
      documentModel.defaults.watermark.gap[0],
      documentModel.defaults.watermark.gap[1]
    ]
  })
  if (imageWatermarkPlacements.length) {
    imageWatermarkPlacements.forEach(imageWatermarkPlacement => {
      page.rasterBlocks.push({
        pageNo: page.pageNo,
        ...imageWatermarkPlacement,
        layer: 'background'
      })
    })
  } else {
    const watermarkRasterBlock = await createTextWatermarkRasterBlock({
      pageNo: page.pageNo,
      pageCount,
      pageWidth: page.width,
      pageHeight: page.height,
      watermark: documentModel.defaults.watermark
    })
    if (watermarkRasterBlock) {
      page.rasterBlocks.push(watermarkRasterBlock)
    }
  }

  if (!documentModel.defaults.pageNumber.disabled) {
    const pageNumberPlacement = createPageNumberPlacement({
      pageNo: page.pageNo,
      pageCount,
      pageWidth: page.width,
      pageHeight: page.height,
      margins: documentModel.margins,
      bottom: documentModel.defaults.pageNumber.bottom,
      format: documentModel.defaults.pageNumber.format,
      numberType: documentModel.defaults.pageNumber.numberType,
      rowFlex: documentModel.defaults.pageNumber.rowFlex,
      font: documentModel.defaults.pageNumber.font,
      size: documentModel.defaults.pageNumber.size,
      color: documentModel.defaults.pageNumber.color,
      startPageNo: documentModel.defaults.pageNumber.startPageNo,
      fromPageNo: documentModel.defaults.pageNumber.fromPageNo,
      measureWidth: createMeasureWidth(
        documentModel.defaults.pageNumber.font,
        documentModel.defaults.pageNumber.size
      )
    })
    if (pageNumberPlacement) {
      page.textRuns.push({
        pageNo: page.pageNo,
        stage: PDF_RENDER_STAGE.PAGE_NUMBER,
        ...pageNumberPlacement
      })
    }
  }

  if (!documentModel.defaults.pageBorder.disabled) {
    const [paddingTop, paddingRight, paddingBottom, paddingLeft] =
      documentModel.defaults.pageBorder.padding
    const scale = documentModel.scale || 1
    const x = documentModel.margins[3] - paddingLeft * scale
    const y = frame.mainTop - paddingTop * scale
    const width =
      page.width - documentModel.margins[1] - documentModel.margins[3] +
      (paddingLeft + paddingRight) * scale
    const height = frame.mainBottom - y + paddingBottom * scale

    createPageBorderLines({
      x,
      y,
      width,
      height,
      color: documentModel.defaults.pageBorder.color,
      lineWidth: documentModel.defaults.pageBorder.lineWidth * scale
    }).forEach(line => {
      page.vectorLines.push({
        pageNo: page.pageNo,
        stage: PDF_RENDER_STAGE.PAGE_BORDER,
        ...line
      })
    })
  }
}

function createMeasureWidth(
  fallbackFont: string,
  fallbackSize: number
) {
  return (
    value: string,
    style?: {
      font: string
      size: number
      bold?: boolean
      italic?: boolean
    }
  ) =>
    measureText(
      value,
      style?.font || fallbackFont,
      style?.size || fallbackSize,
      style?.bold,
      style?.italic
    ).width
}

function truncateTextToWidth(
  text: string,
  maxWidth: number,
  measureWidth: (value: string) => number
) {
  if (!text || measureWidth(text) <= maxWidth) {
    return text
  }

  const ellipsis = '...'
  if (measureWidth(ellipsis) >= maxWidth) {
    return ellipsis
  }

  let left = 0
  let right = text.length
  while (left < right) {
    const middle = Math.ceil((left + right) / 2)
    const truncated = `${text.slice(0, middle)}${ellipsis}`
    if (measureWidth(truncated) <= maxWidth) {
      left = middle
    } else {
      right = middle - 1
    }
  }

  return `${text.slice(0, left)}${ellipsis}`
}

function createImageCaptionPlacement(
  block: IDocumentBlockNode,
  x: number,
  y: number,
  width: number,
  imageHeight: number,
  documentModel: IDocumentModel,
  imageNo?: number
) {
  const caption = block.element.imgCaption
  if (!caption?.value) {
    return null
  }

  const font = caption.font || documentModel.defaults.imgCaption.font
  const size = caption.size || documentModel.defaults.imgCaption.size
  const color = caption.color || documentModel.defaults.imgCaption.color
  const top = caption.top ?? documentModel.defaults.imgCaption.top
  const rawText =
    typeof imageNo === 'number'
      ? caption.value.replace(/\{imageNo\}/g, String(imageNo))
      : caption.value
  const measureWidth = createMeasureWidth(font, size)
  const text = truncateTextToWidth(rawText, width, measureWidth)
  const textWidth = measureWidth(text)

  return {
    text,
    x: x + Math.max(0, (width - textWidth) / 2),
    y: y + imageHeight + top + size,
    width: textWidth,
    height: size,
    font,
    size,
    color
  }
}

function getImageBlockHeight(
  block: IDocumentBlockNode,
  documentModel: IDocumentModel
) {
  const imageHeight = block.element.height || block.height || 120
  if (!block.element.imgCaption?.value) {
    return imageHeight
  }

  const captionSize =
    block.element.imgCaption.size || documentModel.defaults.imgCaption.size
  const captionTop =
    block.element.imgCaption.top ?? documentModel.defaults.imgCaption.top

  return imageHeight + captionTop + captionSize
}

function collectAreaDecorationSegment(
  areaSegmentMap: Map<string, IAreaDecorationSegment>,
  placement: IMainPlacement,
  top: number,
  height = placement.height
) {
  const areaId = placement.block.element.areaId
  const area = placement.block.element.area
  if (!areaId || !area || area.hide) {
    return
  }
  if (!area.backgroundColor && !area.borderColor) {
    return
  }

  const segment = areaSegmentMap.get(areaId)
  const bottom = top + height
  if (segment) {
    segment.top = Math.min(segment.top, top)
    segment.bottom = Math.max(segment.bottom, bottom)
    return
  }

  areaSegmentMap.set(areaId, {
    areaId,
    top,
    bottom,
    backgroundColor: area.backgroundColor,
    borderColor: area.borderColor
  })
}

function appendAreaDecorations(
  page: IPageModel,
  areaSegmentMap: Map<string, IAreaDecorationSegment>,
  contentX: number,
  contentWidth: number
) {
  areaSegmentMap.forEach(segment => {
    const height = Math.max(0, segment.bottom - segment.top)
    if (segment.backgroundColor) {
      page.highlightRects.push({
        pageNo: page.pageNo,
        stage: PDF_RENDER_STAGE.BACKGROUND,
        x: contentX,
        y: segment.top,
        width: contentWidth,
        height,
        color: segment.backgroundColor,
        opacity: 1
      })
    }
    if (segment.borderColor) {
      createPageBorderLines({
        x: contentX,
        y: segment.top,
        width: contentWidth,
        height,
        color: segment.borderColor,
        lineWidth: 1
      }).forEach(line => {
        page.vectorLines.push({
          pageNo: page.pageNo,
          stage: PDF_RENDER_STAGE.BACKGROUND,
          ...line
        })
      })
    }
  })
}

function appendBadges(
  page: IPageModel,
  documentModel: IDocumentModel,
  areaSegmentMap: Map<string, IAreaDecorationSegment>,
  mainTop: number
) {
  if (!documentModel.badge) {
    return
  }

  const scale = documentModel.scale || 1
  const defaultTop = documentModel.badge.top
  const defaultLeft = documentModel.badge.left

  if (page.pageNo === 0 && documentModel.badge.main) {
    const badge = documentModel.badge.main
    page.rasterBlocks.push({
      pageNo: page.pageNo,
      stage: PDF_RENDER_STAGE.BADGE,
      x: (badge.left ?? defaultLeft) * scale,
      y: (badge.top ?? defaultTop) * scale + mainTop,
      width: badge.width * scale,
      height: badge.height * scale,
      dataUrl: badge.value,
      sourceType: 'badge',
      layer: 'overlay',
      debugLabel: 'badge:main'
    })
  }

  documentModel.badge.areas.forEach(areaBadge => {
    const segment = areaSegmentMap.get(areaBadge.areaId)
    if (!segment) {
      return
    }

    const badge = areaBadge.badge
    page.rasterBlocks.push({
      pageNo: page.pageNo,
      stage: PDF_RENDER_STAGE.BADGE,
      x: (badge.left ?? defaultLeft) * scale,
      y: (badge.top ?? defaultTop) * scale + segment.top,
      width: badge.width * scale,
      height: badge.height * scale,
      dataUrl: badge.value,
      sourceType: 'badge',
      layer: 'overlay',
      debugLabel: `badge:${areaBadge.areaId}`
    })
  })
}

function appendGraffiti(page: IPageModel, documentModel: IDocumentModel) {
  const scale = documentModel.scale || 1
  const graffitiPage = (documentModel.graffiti || []).find(
    item => item.pageNo === page.pageNo
  )
  if (!graffitiPage) return

  graffitiPage.strokes.forEach(stroke => {
    const lineColor =
      stroke.lineColor || documentModel.defaults.graffiti?.defaultLineColor
    const lineWidth =
      stroke.lineWidth || documentModel.defaults.graffiti?.defaultLineWidth || 1
    for (let index = 0; index + 3 < stroke.points.length; index += 2) {
      page.vectorLines.push({
        pageNo: page.pageNo,
        stage: PDF_RENDER_STAGE.GRAFFITI,
        x1: stroke.points[index] * scale,
        y1: stroke.points[index + 1] * scale,
        x2: stroke.points[index + 2] * scale,
        y2: stroke.points[index + 3] * scale,
        color: lineColor,
        width: lineWidth * scale
      })
    }
  })
}

function appendFloatingImages(
  page: IPageModel,
  blockList: IDocumentBlockNode[],
  documentModel: IDocumentModel,
  imageNumberMap: Map<IDocumentBlockNode, number>,
  zoneKey: 'header' | 'main' | 'footer'
) {
  blockList.forEach(block => {
    if (!isFloatingImageBlock(block)) {
      return
    }
    if (
      zoneKey === 'main' &&
      getFloatingImagePageNo(block) !== page.pageNo
    ) {
      return
    }

    const x = block.element.imgFloatPosition!.x
    const y = block.element.imgFloatPosition!.y
    const width = block.element.width || 0
    const height = block.element.height || 0
    if (!width || !height) {
      return
    }

    page.rasterBlocks.push({
      pageNo: page.pageNo,
      stage:
        block.element.imgDisplay === ImageDisplay.FLOAT_BOTTOM
          ? PDF_RENDER_STAGE.FLOAT_BOTTOM
          : PDF_RENDER_STAGE.FLOAT_OVERLAY,
      x,
      y,
      width,
      height,
      dataUrl: block.element.value || '',
      crop: block.element.imgCrop,
      sourceType: 'image',
      layer:
        block.element.imgDisplay === ImageDisplay.FLOAT_TOP ||
        block.element.imgDisplay === ImageDisplay.SURROUND
          ? 'overlay'
          : 'content'
    })

    const captionPlacement = createImageCaptionPlacement(
      block,
      x,
      y,
      width,
      height,
      documentModel,
      imageNumberMap.get(block)
    )
    if (captionPlacement) {
      page.textRuns.push({
        pageNo: page.pageNo,
        stage:
          block.element.imgDisplay === ImageDisplay.FLOAT_BOTTOM
            ? PDF_RENDER_STAGE.FLOAT_BOTTOM
            : PDF_RENDER_STAGE.FLOAT_OVERLAY,
        ...captionPlacement
      })
    }
  })
}

function getStyledTextLineWidth(line: IStyledTextPlacementLine) {
  return line.placementList.reduce((maxWidth, placement) => {
    const right =
      placement.x + (placement.widthOverride ?? placement.width)
    return Math.max(maxWidth, right)
  }, 0)
}

function intersectsRect(
  left: {
    x: number
    y: number
    width: number
    height: number
  },
  right: {
    x: number
    y: number
    width: number
    height: number
  }
) {
  const leftRight = left.x + left.width
  const leftBottom = left.y + left.height
  const rightRight = right.x + right.width
  const rightBottom = right.y + right.height

  if (
    left.x > rightRight ||
    leftRight < right.x ||
    left.y > rightBottom ||
    leftBottom < right.y
  ) {
    return false
  }

  return true
}

function getActiveSurroundRectList(
  pageNo: number,
  lineTop: number,
  lineBottom: number,
  blockList: IDocumentBlockNode[]
) {
  return blockList
    .filter(block => {
      if (!isSurroundImageBlock(block)) {
        return false
      }
      if (getFloatingImagePageNo(block) !== pageNo) {
        return false
      }
      const imageTop = block.element.imgFloatPosition!.y
      const imageBottom = imageTop + (block.element.height || 0)
      return lineBottom > imageTop && lineTop < imageBottom
    })
    .map(block => ({
      x: block.element.imgFloatPosition!.x,
      y: block.element.imgFloatPosition!.y,
      width: block.element.width || 0,
      height: block.element.height || 0
    }))
}

function splitPlacementToChars(
  placement: IStyledTextPlacementLine['placementList'][number]
) {
  const charList = splitText(placement.text)
  if (charList.length <= 1) {
    return [placement]
  }

  let cursorX = placement.x
  return charList.map(char => {
    const width =
      measureText(
        char,
        placement.font,
        placement.size,
        placement.bold,
        placement.italic
      ).width + (placement.letterSpacing || 0)

    const charPlacement = {
      ...placement,
      text: char,
      x: cursorX,
      width
    }
    cursorX += width
    return charPlacement
  })
}

function canMergePlacement(
  left: IStyledTextPlacementLine['placementList'][number],
  right: IStyledTextPlacementLine['placementList'][number]
) {
  return (
    left.y === right.y &&
    left.height === right.height &&
    left.font === right.font &&
    left.size === right.size &&
    left.widthOverride === right.widthOverride &&
    left.baselineShift === right.baselineShift &&
    left.letterSpacing === right.letterSpacing &&
    left.bold === right.bold &&
    left.italic === right.italic &&
    left.underline === right.underline &&
    left.strikeout === right.strikeout &&
    left.color === right.color &&
    left.baselineOffset === right.baselineOffset &&
    Math.abs(left.x + left.width - right.x) < 0.001
  )
}

function mergePlacementChars(
  placementList: IStyledTextPlacementLine['placementList']
) {
  return placementList.reduce<IStyledTextPlacementLine['placementList']>(
    (merged, placement) => {
      const previous = merged[merged.length - 1]
      if (previous && canMergePlacement(previous, placement)) {
        previous.text += placement.text
        previous.width += placement.width
        return merged
      }

      merged.push({ ...placement })
      return merged
    },
    []
  )
}

function groupPlacementFragments(
  placementList: IStyledTextPlacementLine['placementList']
) {
  const fragmentGroupList: IStyledTextPlacementLine['placementList'][] = []

  placementList.forEach(placementItem => {
    const currentGroup = fragmentGroupList[fragmentGroupList.length - 1]
    const previous = currentGroup?.[currentGroup.length - 1]
    if (
      currentGroup &&
      previous &&
      Math.abs(previous.x + previous.width - placementItem.x) < 0.001
    ) {
      currentGroup.push(placementItem)
      return
    }

    fragmentGroupList.push([placementItem])
  })

  return fragmentGroupList
}

function createWrappedTextLineFragments(
  placementList: IStyledTextPlacementLine['placementList'],
  x: number,
  y: number,
  width: number,
  lineHeight: number
): IResolvedSurroundTextLineFragment[] {
  const lineList: IStyledTextPlacementLine['placementList'][] = [[]]
  let lineIndex = 0
  let cursorX = 0

  placementList.forEach(placementItem => {
    if (
      lineList[lineIndex].length &&
      cursorX + placementItem.width > width
    ) {
      lineIndex += 1
      lineList.push([])
      cursorX = 0
    }

    lineList[lineIndex].push({
      ...placementItem,
      x: cursorX
    })
    cursorX += placementItem.width
  })

  return lineList
    .filter(line => line.length)
    .map((line, index) => ({
      x,
      y: y + index * lineHeight,
      placementList: mergePlacementChars(line)
    }))
}

function resolveOverflowFragmentContinuations(
  pageNo: number,
  placement: ITextLinePlacement,
  fragment: IResolvedSurroundTextLineFragment,
  width: number,
  blockList: IDocumentBlockNode[]
): IResolvedSurroundTextLineFragment[] {
  const fragmentPlacement: ITextLinePlacement = {
    ...placement,
    line: {
      ...placement.line,
      placementList: fragment.placementList.map(item => ({ ...item }))
    },
    height: placement.height,
    lineIndex: placement.lineIndex + 1
  }

  const resolvedFragmentList = tryResolveSingleLineSurroundSplit(
    pageNo,
    fragmentPlacement,
    fragment.x,
    fragment.y,
    width,
    blockList
  )

  return resolvedFragmentList ?? [fragment]
}

function tryResolveSingleLineSurroundSplit(
  pageNo: number,
  placement: ITextLinePlacement,
  x: number,
  y: number,
  width: number,
  blockList: IDocumentBlockNode[]
): IResolvedSurroundTextLineFragment[] | null {
  const lineTop = y + placement.textStyle.rowMargin
  const lineBottom = lineTop + placement.line.height
  const surroundRectList = getActiveSurroundRectList(
    pageNo,
    lineTop,
    lineBottom,
    blockList
  )
  if (!surroundRectList.length) {
    return null
  }

  const contentRight = x + width
  const charPlacementList = placement.line.placementList.flatMap(splitPlacementToChars)
  const shiftedPlacementList = charPlacementList.map(item => ({ ...item }))
  const lineStartOffset = charPlacementList.length
    ? Math.min(...charPlacementList.map(item => item.x))
    : 0
  let cursorX = x + lineStartOffset
  let hasShifted = false
  let overflowIndex = -1

  for (let index = 0; index < shiftedPlacementList.length; index++) {
    const charPlacement = shiftedPlacementList[index]
    let targetX = cursorX

    for (const surroundRect of surroundRectList) {
      if (
        intersectsRect(
          {
            x: targetX,
            y: lineTop,
            width: charPlacement.width,
            height: placement.line.height
          },
          surroundRect
        )
      ) {
        targetX = Math.max(targetX, surroundRect.x + surroundRect.width)
      }
    }

    if (targetX + charPlacement.width > contentRight) {
      overflowIndex = index
      break
    }

    hasShifted ||= targetX !== cursorX
    charPlacement.x = targetX - x
    cursorX = targetX + charPlacement.width
  }

  if (!hasShifted) {
    return null
  }

  const fittedPlacementList =
    overflowIndex === -1
      ? shiftedPlacementList
      : shiftedPlacementList.slice(0, overflowIndex)
  const mergedPlacementList = mergePlacementChars(fittedPlacementList)
  const fragmentGroupList = groupPlacementFragments(mergedPlacementList)
  const resolvedFragmentList = fragmentGroupList.map(group => {
    const offsetX = group[0]?.x || 0
    return {
      x: x + offsetX,
      y,
      placementList: group.map(item => ({
        ...item,
        x: item.x - offsetX
      }))
    }
  })

  if (overflowIndex === -1) {
    return resolvedFragmentList
  }

  if (!resolvedFragmentList.length) {
    return null
  }

  const overflowPlacementList = charPlacementList
    .slice(overflowIndex)
    .map(item => ({ ...item }))
  const imageBottom = Math.max(
    ...surroundRectList.map(rect => rect.y + rect.height)
  )
  const overflowFragmentList = createWrappedTextLineFragments(
    overflowPlacementList,
    x + lineStartOffset,
    imageBottom - placement.textStyle.rowMargin,
    width,
    placement.line.height
  )

  const continuationFragments = overflowFragmentList.flatMap(fragment =>
    resolveOverflowFragmentContinuations(
      pageNo,
      placement,
      fragment,
      width,
      blockList
    )
  )

  return [
    ...resolvedFragmentList,
    ...continuationFragments
  ]
}

function shouldRasterizeDenseCjkTextLine(
  block: IDocumentBlockNode,
  placementList: IStyledTextPlacementLine['placementList'],
  stage: number
) {
  const isContentStage = stage === PDF_RENDER_STAGE.CONTENT
  const isHeaderSmallCjkLine = (
    stage === PDF_RENDER_STAGE.HEADER &&
    placementList.length > 0 &&
    placementList.every(placement => {
      const text = placement.text.replace(/\s/g, '')
      if (!text) return false
      const cjkCount = [...text].filter(char => CJK_CHAR_REG.test(char)).length
      return (
        cjkCount / text.length >= DENSE_CJK_MIN_RATIO &&
        placement.size <= 18
      )
    })
  )

  if (!isContentStage && !isHeaderSmallCjkLine) return false
  if (block.kind !== 'paragraph') return false
  if (block.element.type === ElementType.HYPERLINK) return false

  const text = placementList
    .map(placement => placement.text)
    .join('')
    .replace(/\s/g, '')

  if (!isHeaderSmallCjkLine && text.length < DENSE_CJK_MIN_LENGTH) return false

  const cjkCount = [...text].filter(char => CJK_CHAR_REG.test(char)).length
  return cjkCount / text.length >= DENSE_CJK_MIN_RATIO
}

function shouldRasterizeContentTextLine(
  block: IDocumentBlockNode,
  placementList: IStyledTextPlacementLine['placementList'],
  stage: number
) {
  if (stage !== PDF_RENDER_STAGE.CONTENT) {
    return false
  }
  if (block.kind !== 'paragraph') {
    return false
  }
  if (block.element.type === ElementType.HYPERLINK) {
    return false
  }

  const text = placementList
    .map(placement => placement.text)
    .join('')
    .replace(/\s/g, '')
  if (!text) {
    return false
  }

  const charList = [...text]
  const cjkCount = charList.filter(char => CJK_CHAR_REG.test(char)).length
  if (!cjkCount) {
    return false
  }

  const cjkRatio = cjkCount / charList.length
  const maxSize = Math.max(...placementList.map(placement => placement.size))
  const alphaCount = charList.filter(char => ASCII_ALPHA_REG.test(char)).length
  const digitCount = charList.filter(char => DIGIT_REG.test(char)).length
  const otherCount = charList.length - cjkCount - alphaCount - digitCount
  const hasMixedScript =
    alphaCount > 0 ||
    digitCount > 0 ||
    otherCount > 0
  const hasBaselineShift = placementList.some(
    placement => Math.abs(placement.baselineShift || 0) > 0.001
  )
  const isShortSmallCjkLine =
    charList.length <= SHORT_CJK_LINE_MAX_LENGTH &&
    maxSize <= SHORT_CJK_LINE_MAX_SIZE &&
    cjkRatio >= 0.45
  const isCompactMixedMetricsLine =
    charList.length <= COMPACT_MIXED_LINE_MAX_LENGTH &&
    maxSize <= SHORT_CJK_LINE_MAX_SIZE &&
    digitCount > 0 &&
    alphaCount > 0 &&
    otherCount > 0
  const isShortSymbolHeavyLine =
    charList.length <= SHORT_CJK_LINE_MAX_LENGTH &&
    maxSize <= SHORT_CJK_LINE_MAX_SIZE &&
    otherCount >= 2 &&
    (cjkCount > 0 || digitCount > 0)

  if (shouldRasterizeDenseCjkTextLine(block, placementList, stage)) {
    return true
  }

  if (hasBaselineShift) {
    return true
  }

  if (isShortSmallCjkLine) {
    return true
  }

  if (isCompactMixedMetricsLine || isShortSymbolHeavyLine) {
    return true
  }

  return hasMixedScript && cjkRatio >= 0.2
}

function createMarkerAwarePlacementList(
  placementList: IStyledTextPlacementLine['placementList'],
  markerPlacement?: IStyledTextPlacementLine['placementList'][number] | null
) {
  if (!markerPlacement) {
    return placementList
  }

  return [
    { ...markerPlacement },
    ...placementList.map(placement => ({ ...placement }))
  ]
}

function isStaticHeaderSmallCjkLine(
  placementList: IStyledTextPlacementLine['placementList'],
  stage: number
) {
  return (
    stage === PDF_RENDER_STAGE.HEADER &&
    placementList.length > 0 &&
    placementList.every(placement => {
      const text = placement.text.replace(/\s/g, '')
      if (!text) return false
      const cjkCount = [...text].filter(char => CJK_CHAR_REG.test(char)).length
      return (
        cjkCount / text.length >= DENSE_CJK_MIN_RATIO &&
        placement.size <= 18
      )
    })
  )
}

async function appendPlacementTextRasterFallback(
  page: IPageModel,
  block: IDocumentBlockNode,
  placementList: IStyledTextPlacementLine['placementList'],
  x: number,
  y: number,
  stage: number,
  documentModel: IDocumentModel
) {
  if (
    !shouldRasterizeDenseCjkTextLine(block, placementList, stage) &&
    !shouldRasterizeContentTextLine(block, placementList, stage)
  ) {
    return false
  }

  const bounds = resolvePlacementRasterBounds(placementList, x, y)

  const printPageDataUrl = documentModel.printPageDataUrlList?.[page.pageNo]
  if (printPageDataUrl) {
    const dataUrl = await cropPageRegionDataUrl(printPageDataUrl, {
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height
    })

    resolveFallback(page, {
      pageNo: page.pageNo,
      stage,
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
      dataUrl,
      sourceType: DENSE_CJK_FALLBACK_SOURCE_TYPE,
      layer: 'content'
    })

    return true
  }

  const fallback = await rasterizeElement(
    ctx => {
      ctx.textBaseline = 'alphabetic'
      ctx.direction = 'ltr'
      ;(ctx as any).letterSpacing = '0px'
      ;(ctx as any).wordSpacing = '0px'

      if (block.element.highlight) {
        ctx.save()
        ctx.globalAlpha = 0.35
        ctx.fillStyle = block.element.highlight
        bounds.absolutePlacementList.forEach(placement => {
          ctx.fillRect(
            placement.x - bounds.x,
            placement.y - placement.baselineOffset - bounds.y,
            placement.width,
            placement.height
          )
        })
        ctx.restore()
      }

      bounds.absolutePlacementList.forEach(placement => {
        ctx.save()
        ctx.font = `${placement.italic ? 'italic ' : ''}${placement.bold ? 'bold ' : ''}${placement.size}px ${placement.font}`
        ctx.fillStyle = placement.color || '#000000'
        ;(ctx as any).letterSpacing = `${placement.letterSpacing || 0}px`
        ctx.fillText(
          placement.text,
          placement.x - bounds.x,
          placement.y - bounds.y
        )
        ctx.restore()
      })

      bounds.lineList.forEach(line => {
        ctx.save()
        ctx.strokeStyle = line.color || '#000000'
        ctx.lineWidth = line.width || 1
        if (line.dash?.length) {
          ctx.setLineDash(line.dash)
        }
        ctx.beginPath()
        ctx.moveTo(line.x1 - bounds.x, line.y1 - bounds.y)
        ctx.lineTo(line.x2 - bounds.x, line.y2 - bounds.y)
        ctx.stroke()
        ctx.restore()
      })
    },
    bounds.width,
    bounds.height,
    DENSE_CJK_FALLBACK_SOURCE_TYPE,
    DENSE_CJK_FALLBACK_PIXEL_RATIO
  )

  resolveFallback(page, {
    ...fallback,
    pageNo: page.pageNo,
    stage,
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    layer: 'content'
  })

  return true
}

async function appendStaticZoneTextRasterFallback(
  page: IPageModel,
  block: IDocumentBlockNode,
  placementList: IStyledTextPlacementLine['placementList'],
  x: number,
  y: number,
  stage: number,
  documentModel: IDocumentModel
) {
  if (!isStaticHeaderSmallCjkLine(placementList, stage)) {
    return false
  }

  const bounds = resolvePlacementRasterBounds(placementList, x, y)

  const printPageDataUrl = documentModel.printPageDataUrlList?.[page.pageNo]
  if (printPageDataUrl) {
    const dataUrl = await cropPageRegionDataUrl(printPageDataUrl, {
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height
    })

    resolveFallback(page, {
      pageNo: page.pageNo,
      stage,
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
      dataUrl,
      sourceType: DENSE_CJK_FALLBACK_SOURCE_TYPE,
      layer: 'content'
    })

    return true
  }

  const fallback = await rasterizeElement(
    ctx => {
      ctx.textBaseline = 'alphabetic'
      ctx.direction = 'ltr'
      ;(ctx as any).letterSpacing = '0px'
      ;(ctx as any).wordSpacing = '0px'

      if (block.element.highlight) {
        ctx.save()
        ctx.globalAlpha = 0.35
        ctx.fillStyle = block.element.highlight
        bounds.absolutePlacementList.forEach(placement => {
          ctx.fillRect(
            placement.x - bounds.x,
            placement.y - placement.baselineOffset - bounds.y,
            placement.width,
            placement.height
          )
        })
        ctx.restore()
      }

      bounds.absolutePlacementList.forEach(placement => {
        ctx.save()
        ctx.font = `${placement.italic ? 'italic ' : ''}${placement.bold ? 'bold ' : ''}${placement.size}px ${placement.font}`
        ctx.fillStyle = placement.color || '#000000'
        ;(ctx as any).letterSpacing = `${placement.letterSpacing || 0}px`
        ctx.fillText(
          placement.text,
          placement.x - bounds.x,
          placement.y - bounds.y
        )
        ctx.restore()
      })

      bounds.lineList.forEach(line => {
        ctx.save()
        ctx.strokeStyle = line.color || '#000000'
        ctx.lineWidth = line.width || 1
        if (line.dash?.length) {
          ctx.setLineDash(line.dash)
        }
        ctx.beginPath()
        ctx.moveTo(line.x1 - bounds.x, line.y1 - bounds.y)
        ctx.lineTo(line.x2 - bounds.x, line.y2 - bounds.y)
        ctx.stroke()
        ctx.restore()
      })
    },
    bounds.width,
    bounds.height,
    DENSE_CJK_FALLBACK_SOURCE_TYPE,
    DENSE_CJK_FALLBACK_PIXEL_RATIO
  )

  resolveFallback(page, {
    ...fallback,
    pageNo: page.pageNo,
    stage,
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    layer: 'content'
  })

  return true
}

async function appendResolvedTextLineFragments(
  page: IPageModel,
  block: IDocumentBlockNode,
  fragmentList: IResolvedSurroundTextLineFragment[],
  textStyle: IResolvedBlockTextStyle,
  listSemantic: IListBlockSemantics,
  lineIndex: number,
  documentModel: IDocumentModel,
  stage: number = PDF_RENDER_STAGE.CONTENT
) {
  const firstFragment = fragmentList[0]
  if (!firstFragment) {
    return
  }

  if (lineIndex === 0) {
    const markerPlacement = createListMarkerPlacement({
      semantic: listSemantic,
      x: 0,
      y: 0,
      height: firstFragment.placementList[0]?.height || 0,
      baselineOffset:
        firstFragment.placementList[0]?.baselineOffset || textStyle.size
    })
    for (let fragmentIndex = 0; fragmentIndex < fragmentList.length; fragmentIndex++) {
      const fragment = fragmentList[fragmentIndex]
      const contentY = fragment.y + textStyle.rowMargin
      const renderPlacementList = createMarkerAwarePlacementList(
        fragment.placementList,
        fragmentIndex === 0 ? markerPlacement : null
      )
      const fallbackApplied = await appendPlacementTextRasterFallback(
        page,
        block,
        renderPlacementList,
        fragment.x,
        contentY,
        stage,
        documentModel
      )
      if (fallbackApplied) {
        continue
      }
      appendPlacementTextRuns(
        page,
        block,
        renderPlacementList,
        fragment.x,
        contentY,
        stage
      )
    }
    return
  }

  for (const fragment of fragmentList) {
    const contentY = fragment.y + textStyle.rowMargin
    const fallbackApplied = await appendPlacementTextRasterFallback(
      page,
      block,
      fragment.placementList,
      fragment.x,
      contentY,
      stage,
      documentModel
    )
    if (fallbackApplied) {
      continue
    }
    appendPlacementTextRuns(
      page,
      block,
      fragment.placementList,
      fragment.x,
      contentY,
      stage
    )
  }
}

function resolveSurroundTextLinePlacement(
  pageNo: number,
  placement: ITextLinePlacement,
  x: number,
  y: number,
  width: number,
  blockList: IDocumentBlockNode[]
) : IResolvedSurroundTextLinePlacement {
  const splitFragmentList = tryResolveSingleLineSurroundSplit(
    pageNo,
    placement,
    x,
    y,
    width,
    blockList
  )
  if (splitFragmentList) {
    const lastFragment = splitFragmentList[splitFragmentList.length - 1]
    return {
      x: splitFragmentList[0].x,
      y: splitFragmentList[0].y,
      consumedHeight:
        placement.height + (lastFragment?.y || y) - y,
      fragmentList: splitFragmentList
    }
  }

  const rowMargin = placement.textStyle.rowMargin
  const contentRight = x + width
  let renderX = x
  let renderY = y
  let extraHeight = 0

  while (true) {
    const lineTop = renderY + rowMargin
    const lineBottom = lineTop + placement.line.height
    const lineWidth = getStyledTextLineWidth(placement.line)
    let nextX = x
    let nextY = renderY

    for (const block of blockList) {
      if (!isSurroundImageBlock(block)) {
        continue
      }
      if (getFloatingImagePageNo(block) !== pageNo) {
        continue
      }

      const imageTop = block.element.imgFloatPosition!.y
      const imageRight =
        block.element.imgFloatPosition!.x + (block.element.width || 0)
      const imageBottom = imageTop + (block.element.height || 0)
      const intersectsY = lineBottom > imageTop && lineTop < imageBottom
      if (!intersectsY) {
        continue
      }

      if (imageRight + lineWidth <= contentRight) {
        nextX = Math.max(nextX, imageRight)
        continue
      }

      nextY = Math.max(nextY, imageBottom - rowMargin)
    }

    if (nextY > renderY) {
      extraHeight += nextY - renderY
      renderY = nextY
      renderX = x
      continue
    }

    renderX = nextX
    break
  }

  return {
    x: renderX,
    y: renderY,
    consumedHeight: placement.height + extraHeight,
    fragmentList: [
      {
        x: renderX,
        y: renderY,
        placementList: placement.line.placementList
      }
    ]
  }
}

interface IAppendPlacementResult {
  renderX: number
  renderY: number
  consumedHeight: number
}

interface IResolvedSurroundTextLineFragment {
  x: number
  y: number
  placementList: IStyledTextPlacementLine['placementList']
}

interface IResolvedSurroundTextLinePlacement {
  x: number
  y: number
  consumedHeight: number
  fragmentList: IResolvedSurroundTextLineFragment[]
}

function getRequiredPageCount(
  documentModel: IDocumentModel,
  flowPageCount: number
) {
  const floatingImagePageCount = documentModel.main.blockList.reduce(
    (maxPageCount, block) => {
      if (!isFloatingImageBlock(block)) {
        return maxPageCount
      }
      return Math.max(maxPageCount, getFloatingImagePageNo(block) + 1)
    },
    0
  )
  const graffitiPageCount = (documentModel.graffiti || []).reduce(
    (maxPageCount, page) => Math.max(maxPageCount, page.pageNo + 1),
    0
  )

  return Math.max(flowPageCount, floatingImagePageCount, graffitiPageCount, 1)
}

function measurePlacementConsumedHeight(
  pageNo: number,
  placement: IMainPlacement,
  x: number,
  y: number,
  width: number,
  documentModel: IDocumentModel
) {
  if (placement.kind !== 'text-line') {
    return {
      consumedHeight: placement.height,
      renderBottom: y + placement.height
    }
  }

  const resolved = resolveSurroundTextLinePlacement(
    pageNo,
    placement,
    x,
    y,
    width,
    documentModel.main.blockList
  )

  const renderBottom = resolved.fragmentList.reduce((bottom, fragment) => {
    const fragmentBottom = fragment.placementList.reduce(
      (maxBottom, textPlacement) => {
        const measured = measureText(
          textPlacement.text,
          textPlacement.font,
          textPlacement.size,
          textPlacement.bold,
          textPlacement.italic
        )

        return Math.max(
          maxBottom,
          fragment.y + textPlacement.y + measured.descent
        )
      },
      fragment.y
    )

    return Math.max(bottom, fragmentBottom)
  }, y)

  return {
    consumedHeight: resolved.consumedHeight,
    renderBottom
  }
}

function paginateMainPlacements(
  placements: IMainPlacement[],
  frame: IFrameLayoutResult,
  documentModel: IDocumentModel,
  contentWidth: number
) {
  const pageIndexes: number[][] = [[]]
  let pageNo = 0
  let cursorY = frame.mainTop
  const x = documentModel.margins[3]
  const pageBottom = frame.mainBottom

  placements.forEach((placement, index) => {
    let measurement = measurePlacementConsumedHeight(
      pageNo,
      placement,
      x,
      cursorY,
      contentWidth,
      documentModel
    )

    if (
      measurement.renderBottom > pageBottom &&
      pageIndexes[pageNo].length
    ) {
      pageNo += 1
      pageIndexes[pageNo] = []
      cursorY = frame.mainTop
      measurement = measurePlacementConsumedHeight(
        pageNo,
        placement,
        x,
        cursorY,
        contentWidth,
        documentModel
      )
    }

    pageIndexes[pageNo].push(index)
    cursorY += measurement.consumedHeight

    if (placement.forceBreakAfter && index < placements.length - 1) {
      pageNo += 1
      pageIndexes[pageNo] = []
      cursorY = frame.mainTop
    }
  })

  return pageIndexes
}

function collectControlBorderSegment(
  controlBorderSegmentMap: Map<IDocumentBlockNode, IControlBorderSegment>,
  placement: IMainPlacement,
  x: number,
  y: number
) {
  if (placement.kind !== 'text-line') return
  if (placement.block.kind !== 'control') return
  if (!placement.block.element.control?.border) return
  if (!placement.line.placementList.length) return

  const left = x + Math.min(
    ...placement.line.placementList.map(line => line.x)
  )
  const right = x + Math.max(
    ...placement.line.placementList.map(line => line.x + line.width)
  )
  const segment = controlBorderSegmentMap.get(placement.block)
  const bottom = y + placement.height

  if (segment) {
    segment.top = Math.min(segment.top, y)
    segment.bottom = Math.max(segment.bottom, bottom)
    segment.left = Math.min(segment.left, left)
    segment.right = Math.max(segment.right, right)
    return
  }

  controlBorderSegmentMap.set(placement.block, {
    top: y,
    bottom,
    left,
    right
  })
}

function appendControlBorders(
  page: IPageModel,
  controlBorderSegmentMap: Map<IDocumentBlockNode, IControlBorderSegment>,
  documentModel: IDocumentModel,
  stage: number = PDF_RENDER_STAGE.CONTENT
) {
  const borderWidth = documentModel.defaults.control?.borderWidth || 1
  const borderColor = documentModel.defaults.control?.borderColor || '#000000'

  controlBorderSegmentMap.forEach(segment => {
    createPageBorderLines({
      x: segment.left,
      y: segment.top,
      width: Math.max(0, segment.right - segment.left),
      height: Math.max(0, segment.bottom - segment.top),
      color: borderColor,
      lineWidth: borderWidth
    }).forEach(line => {
      page.vectorLines.push({
        pageNo: page.pageNo,
        stage,
        ...line
      })
    })
  })
}

function createZoneListSemanticMap(
  blockList: IDocumentBlockNode[],
  documentModel: IDocumentModel
) {
  const semanticList = resolveListBlockSemantics(
    blockList,
    {
      defaultFont: documentModel.defaults.defaultFont,
      defaultSize: documentModel.defaults.defaultSize,
      defaultColor: documentModel.defaults.defaultColor,
      listInheritStyle: documentModel.defaults.listInheritStyle
    },
    createMeasureWidth(
      documentModel.defaults.defaultFont,
      documentModel.defaults.defaultSize
    )
  )

  return new Map(
    blockList.map((block, index) => [block, semanticList[index]])
  )
}

function createResolvedTextLayout(
  block: IDocumentBlockNode,
  width: number,
  documentModel: IDocumentModel,
  listSemantic?: IListBlockSemantics
): IResolvedTextBlockLayout {
  const textStyle = resolveBlockTextStyle(block.element, documentModel.defaults)
  const semantic = listSemantic || {
    indent: 0,
    markerWidth: 0,
    markerX: 0,
    font: documentModel.defaults.defaultFont,
    size: documentModel.defaults.defaultSize,
    color: documentModel.defaults.defaultColor
  }
  const result = createBlockTextPlacementResult({
    element: block.element,
    x: 0,
    y: 0,
    width,
    indent: semantic.indent,
    fallbackFont: textStyle.font,
    fallbackSize: textStyle.size,
    fallbackColor: textStyle.color,
    fallbackBold: textStyle.bold,
    fallbackItalic: textStyle.italic,
    fallbackLineHeight: textStyle.lineHeight,
    fallbackTabWidth:
      documentModel.defaults.defaultTabWidth ?? DEFAULT_TAB_WIDTH,
    fallbackControlPlaceholderColor:
      documentModel.defaults.control?.placeholderColor,
    fallbackControlBracketColor: documentModel.defaults.control?.bracketColor,
    fallbackControlPrefix: documentModel.defaults.control?.prefix,
    fallbackControlPostfix: documentModel.defaults.control?.postfix,
    fallbackCheckboxGap: documentModel.defaults.checkbox?.gap || 5,
    fallbackRadioGap: documentModel.defaults.radio?.gap || 5,
    measureWidth: createMeasureWidth(textStyle.font, textStyle.size)
  })
  const lineList = result.lineList.map(line => ({
    ...line,
    y: 0,
    placementList: line.placementList.map(placement => ({
      ...placement,
      y: placement.y - line.y
    }))
  }))
  const height = lineList.length
    ? lineList.reduce(
        (sum, line) => sum + line.height + textStyle.rowMargin * 2,
        0
      )
    : textStyle.lineHeight + textStyle.rowMargin * 2

  return {
    lineList,
    height,
    textStyle,
    listSemantic: semantic
  }
}

function getTableColumnCount(block: IDocumentBlockNode) {
  return Math.max(getTableColumnWidthList(block).length, 1)
}

function getResolvedTableRowHeightList(
  block: IDocumentBlockNode,
  width: number,
  documentModel: IDocumentModel
) {
  const rowList = layoutTable(block)
  const columnWidthList = getTableColumnWidthList(block, width)
  return resolveTableRowHeightList({
    rowList,
    columnWidthList,
    measureWidth: (value, style) =>
      measureText(
        value,
        style?.font || documentModel.defaults.defaultFont,
        style?.size || 12,
        style?.bold,
        style?.italic
      ).width,
    lineHeight: getTextLineHeight(documentModel.defaults.defaultFont, 12),
    font: documentModel.defaults.defaultFont,
    size: 12,
    tabWidth: documentModel.defaults.defaultTabWidth ?? DEFAULT_TAB_WIDTH
  })
}

function getBlockLayoutHeight(
  block: IDocumentBlockNode,
  width: number,
  documentModel: IDocumentModel
) {
  if (block.element.type === ElementType.PAGE_BREAK) {
    return 0
  }

  if (block.kind === 'table') {
    const rows = layoutTable(block)
    if (!rows.length) return 24
    return getResolvedTableRowHeightList(block, width, documentModel)
      .reduce((sum, rowHeight) => sum + rowHeight, 0)
  }

  if (block.kind === 'image') {
    if (isFloatingImageBlock(block)) {
      return 0
    }
    return getImageBlockHeight(block, documentModel)
  }

  if (block.element.type === ElementType.LABEL) {
    return createLabelPlacement({
      element: block.element,
      x: 0,
      y: 0,
      fallbackFont: documentModel.defaults.defaultFont,
      fallbackSize: documentModel.defaults.defaultSize,
      fallbackColor: documentModel.defaults.labelDefaultColor,
      fallbackBackgroundColor:
        documentModel.defaults.labelDefaultBackgroundColor,
      fallbackPadding: documentModel.defaults.labelDefaultPadding,
      measureWidth: createMeasureWidth(
        block.element.font || documentModel.defaults.defaultFont,
        block.element.size || documentModel.defaults.defaultSize
      )
    }).height
  }

  if (block.element.type === ElementType.SEPARATOR) {
    return block.element.lineWidth || 1
  }

  const textStyle = resolveBlockTextStyle(block.element, documentModel.defaults)
  const lineList = createBlockTextPlacementResult({
    element: block.element,
    x: 0,
    y: 0,
    width,
    fallbackFont: textStyle.font,
    fallbackSize: textStyle.size,
    fallbackColor: textStyle.color,
    fallbackBold: textStyle.bold,
    fallbackItalic: textStyle.italic,
    fallbackLineHeight: textStyle.lineHeight,
    fallbackTabWidth:
      documentModel.defaults.defaultTabWidth ?? DEFAULT_TAB_WIDTH,
    fallbackControlPlaceholderColor:
      documentModel.defaults.control?.placeholderColor,
    fallbackControlBracketColor: documentModel.defaults.control?.bracketColor,
    fallbackControlPrefix: documentModel.defaults.control?.prefix,
    fallbackControlPostfix: documentModel.defaults.control?.postfix,
    fallbackCheckboxGap: documentModel.defaults.checkbox?.gap || 5,
    fallbackRadioGap: documentModel.defaults.radio?.gap || 5,
    measureWidth: createMeasureWidth(textStyle.font, textStyle.size)
  }).lineList
  return Math.max(
    block.height || 0,
    getBlockHeight(block),
    lineList.reduce(
      (sum, line) => sum + line.height + textStyle.rowMargin * 2,
      0
    ) ||
      textStyle.lineHeight + textStyle.rowMargin * 2
  )
}

function collectMainPlacements(
  blockList: IDocumentBlockNode[],
  width: number,
  pageHeight: number,
  documentModel: IDocumentModel
): IMainPlacement[] {
  const listSemanticMap = createZoneListSemanticMap(blockList, documentModel)
  return blockList.reduce<IMainPlacement[]>((placementList, block) => {
    if (block.element.type === ElementType.PAGE_BREAK) {
      placementList.push({
        kind: 'block',
        block,
        height: 0,
        defaults: documentModel.defaults,
        forceBreakAfter: true
      })
      return placementList
    }

    if (
      block.element.type === ElementType.LABEL ||
      block.element.type === ElementType.SEPARATOR
    ) {
      placementList.push({
        kind: 'block',
        block,
        height: getBlockLayoutHeight(block, width, documentModel),
        defaults: documentModel.defaults
      })
      return placementList
    }

    if (
      block.kind === 'paragraph' ||
      block.kind === 'control'
    ) {
      const resolved = createResolvedTextLayout(
        block,
        width,
        documentModel,
        listSemanticMap.get(block)
      )
      const lineList = resolved.lineList
      if (!lineList.length) {
        placementList.push({
          kind: 'block',
          block,
          height: resolved.height,
          defaults: documentModel.defaults
        })
        return placementList
      }

      lineList.forEach((line, lineIndex) => {
        placementList.push({
          kind: 'text-line',
          block,
          line,
          lineIndex,
          height: line.height + resolved.textStyle.rowMargin * 2,
          textStyle: resolved.textStyle,
          listSemantic: resolved.listSemantic
        })
      })
      return placementList
    }

    if (block.kind !== 'table') {
      placementList.push({
        kind: 'block',
        block,
        height: getBlockLayoutHeight(block, width, documentModel),
        defaults: documentModel.defaults
      })
      return placementList
    }

    const rows = layoutTable(block)
    const rowHeightList = getResolvedTableRowHeightList(
      block,
      width,
      documentModel
    )
    if (!rows.length) {
      placementList.push({
        kind: 'block',
        block,
        height: 24,
        defaults: documentModel.defaults
      })
      return placementList
    }

    paginateTableRows(
      rows.map(row => ({
        ...row,
        height: rowHeightList[row.rowIndex] || 24
      })),
      pageHeight
    ).forEach(pageRows => {
      pageRows.forEach(row => {
        placementList.push({
          kind: 'table-row',
          block,
          height: row.height,
          rowIndex: row.rowIndex
        })
      })
    })
    return placementList
  }, [])
}

function appendPlacementTextRuns(
  page: IPageModel,
  block: IDocumentBlockNode,
  placementList: IStyledTextPlacementLine['placementList'],
  x: number,
  y: number,
  stage: number = PDF_RENDER_STAGE.CONTENT
) {
  if (!placementList.length) return

  createTextDecorationLines(placementList).forEach(line => {
    page.vectorLines.push({
      pageNo: page.pageNo,
      stage,
      x1: x + line.x1,
      y1: y + line.y1,
      x2: x + line.x2,
      y2: y + line.y2,
      color: line.color,
      width: line.width,
      dash: line.dash
    })
  })

  placementList.forEach(line => {
    const measured = layoutInline(
      {
        kind: 'text',
        text: line.text,
        font: line.font,
        size: line.size,
        letterSpacing: line.letterSpacing,
        bold: line.bold,
        italic: line.italic,
        color: line.color
      },
      x + line.x,
      y + line.y
    )

    page.textRuns.push({
      pageNo: page.pageNo,
      stage,
      text: line.text,
      x: x + line.x,
      y: y + line.y,
      width: line.widthOverride ?? Math.min(measured.width, line.width),
      height: measured.ascent + measured.descent,
      font: line.font,
      size: line.size,
      letterSpacing: line.letterSpacing,
      bold: line.bold,
      italic: line.italic,
      color: line.color
    })

    if (block.element.highlight) {
      page.highlightRects.push({
        pageNo: page.pageNo,
        stage,
        x: x + line.x,
        y: y + line.y - measured.ascent,
        width: line.widthOverride ?? Math.min(measured.width, line.width),
        height: measured.ascent + measured.descent,
        color: block.element.highlight,
        opacity: 0.35
      })
    }
  })

  if (block.element.type === 'hyperlink' && block.element.url) {
    placementList.forEach(line => {
      page.links.push({
        pageNo: page.pageNo,
        stage,
        x: x + line.x,
        y: y + line.y - line.baselineOffset,
        width: line.width,
        height: line.height,
        url: block.element.url!
      })
    })
  }
}

function appendTableRow(
  page: IPageModel,
  block: IDocumentBlockNode,
  rowIndex: number,
  x: number,
  y: number,
  width: number,
  documentModel: IDocumentModel,
  stage: number = PDF_RENDER_STAGE.CONTENT
) {
  const rowList = layoutTable(block)
  const row = rowList[rowIndex]
  if (!row) return

  const columnCount = getTableColumnCount(block)
  const columnWidthList = getTableColumnWidthList(block, width)
  const rowHeightList = getResolvedTableRowHeightList(
    block,
    width,
    documentModel
  )
  const rowCount = rowList.length

  row.tdList.forEach(td => {
    const colspan = Math.max(1, td.colspan || 1)
    const rowspan = Math.max(1, td.rowspan || 1)
    const colIndex = td.colIndex || 0
    const cellX = x + columnWidthList
      .slice(0, colIndex)
      .reduce((sum, cellWidth) => sum + cellWidth, 0)
    const cellWidth = columnWidthList
      .slice(colIndex, colIndex + colspan)
      .reduce((sum, cellWidth) => sum + cellWidth, 0)
    const cellHeight = rowHeightList
      .slice(rowIndex, rowIndex + rowspan)
      .reduce((sum, currentHeight) => sum + currentHeight, 0)

    const visuals = createTableCellVisuals({
      td,
      x: cellX,
      y,
      width: cellWidth,
      height: cellHeight,
      rowIndex,
      colIndex,
      rowCount,
      colCount: columnCount,
      tableBorderType: block.element.borderType,
      borderColor: block.element.borderColor,
      borderWidth: block.element.borderWidth,
      borderExternalWidth: block.element.borderExternalWidth
    })

    visuals.backgroundRects.forEach(rect => {
      page.highlightRects.push({
        pageNo: page.pageNo,
        stage,
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
        color: rect.color,
        opacity: rect.opacity
      })
    })

    visuals.lines.forEach(line => {
      page.vectorLines.push({
        pageNo: page.pageNo,
        stage,
        ...line
      })
    })

    const cellLineList = createTableCellTextPlacements({
      td,
      x: cellX,
      y,
      cellWidth,
      rowHeight: cellHeight,
      font: documentModel.defaults.defaultFont,
      size: 12,
      lineHeight: getTextLineHeight(documentModel.defaults.defaultFont, 12),
      tabWidth: documentModel.defaults.defaultTabWidth ?? DEFAULT_TAB_WIDTH,
      color: '#000000',
      measureWidth: (value, style) =>
        measureText(
          value,
          style?.font || documentModel.defaults.defaultFont,
          style?.size || 12,
          style?.bold,
          style?.italic
        ).width
    })

    createTextDecorationLines(cellLineList).forEach(line => {
      page.vectorLines.push({
        pageNo: page.pageNo,
        stage,
        ...line
      })
    })

    cellLineList.forEach(line => {
      page.textRuns.push({
        pageNo: page.pageNo,
        stage,
        text: line.text,
        x: line.x,
        y: line.y,
        width: line.width,
        height: line.height,
        font: line.font,
        size: line.size,
        bold: line.bold,
        italic: line.italic,
        color: line.color
      })
    })
  })
}

function getTableRowBaseline(
  block: IDocumentBlockNode,
  rowIndex: number,
  x: number,
  y: number,
  width: number,
  documentModel: IDocumentModel
) {
  const rowList = layoutTable(block)
  const row = rowList[rowIndex]
  if (!row) return null

  const columnWidthList = getTableColumnWidthList(block, width)
  const rowHeightList = getResolvedTableRowHeightList(
    block,
    width,
    documentModel
  )

  const baselineList: number[] = []

  row.tdList.forEach(td => {
    const colspan = Math.max(1, td.colspan || 1)
    const rowspan = Math.max(1, td.rowspan || 1)
    const colIndex = td.colIndex || 0
    const cellX = x + columnWidthList
      .slice(0, colIndex)
      .reduce((sum, cellWidth) => sum + cellWidth, 0)
    const cellWidth = columnWidthList
      .slice(colIndex, colIndex + colspan)
      .reduce((sum, cellWidth) => sum + cellWidth, 0)
    const cellHeight = rowHeightList
      .slice(rowIndex, rowIndex + rowspan)
      .reduce((sum, currentHeight) => sum + currentHeight, 0)

    createTableCellTextPlacements({
      td,
      x: cellX,
      y,
      cellWidth,
      rowHeight: cellHeight,
      font: documentModel.defaults.defaultFont,
      size: 12,
      lineHeight: getTextLineHeight(documentModel.defaults.defaultFont, 12),
      tabWidth: documentModel.defaults.defaultTabWidth ?? DEFAULT_TAB_WIDTH,
      color: '#000000',
      measureWidth: (value, style) =>
        measureText(
          value,
          style?.font || documentModel.defaults.defaultFont,
          style?.size || 12,
          style?.bold,
          style?.italic
        ).width
    }).forEach(line => {
      baselineList.push(line.y)
    })
  })

  return baselineList.length ? Math.min(...baselineList) : null
}

function resolveMainPlacementLineNumberBaseline(
  placement: IMainPlacement,
  x: number,
  y: number,
  width: number,
  documentModel: IDocumentModel
) {
  if (placement.kind === 'text-line') {
    return y + placement.textStyle.rowMargin + placement.line.baselineOffset
  }

  if (placement.kind === 'table-row') {
    return getTableRowBaseline(
      placement.block,
      placement.rowIndex,
      x,
      y,
      width,
      documentModel
    )
  }

  if (placement.block.element.type === ElementType.LABEL) {
    return createLabelPlacement({
      element: placement.block.element,
      x,
      y,
      fallbackFont: placement.defaults.defaultFont,
      fallbackSize: placement.defaults.defaultSize,
      fallbackColor: placement.defaults.labelDefaultColor,
      fallbackBackgroundColor:
        placement.defaults.labelDefaultBackgroundColor,
      fallbackPadding: placement.defaults.labelDefaultPadding,
      measureWidth: createMeasureWidth(
        placement.block.element.font || placement.defaults.defaultFont,
        placement.block.element.size || placement.defaults.defaultSize
      )
    }).textPlacement.y
  }

  return null
}

async function appendImageOrFallback(
  page: IPageModel,
  block: IDocumentBlockNode,
  x: number,
  y: number,
  width: number,
  height: number,
  stage: number = PDF_RENDER_STAGE.CONTENT
) {
  const pendingIssue =
    block.kind === 'block' &&
      block.element.block?.type === BlockType.IFRAME
        ? 'pending:block-iframe'
        : block.kind === 'block' &&
            block.element.block?.type === BlockType.VIDEO
          ? 'pending:block-video'
          : null
  if (pendingIssue && !page.issues.includes(pendingIssue)) {
    page.issues.push(pendingIssue)
  }

  if (block.kind === 'latex') {
    page.rasterBlocks.push(
      await createLatexRasterBlock({
        pageNo: page.pageNo,
        stage,
        x,
        y,
        element: block.element
      })
    )
    return
  }

  const value = block.element.value || ''
  const isImageSource = /^(data:image\/|https?:\/\/|blob:)/.test(value)

  if (block.kind === 'image' && isImageSource) {
    page.rasterBlocks.push({
      pageNo: page.pageNo,
      stage,
      x,
      y,
      width: block.element.width || width,
      height: block.element.height || height,
      dataUrl: value,
      crop: block.element.imgCrop,
      sourceType: 'image',
      layer: 'content'
    })
    return
  }

  const fallback = await rasterizeElement(ctx => {
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, width, height)
    ctx.strokeStyle = '#c0c4cc'
    ctx.strokeRect(0.5, 0.5, Math.max(0, width - 1), Math.max(0, height - 1))
    ctx.fillStyle = '#606266'
    ctx.font = '12px sans-serif'
    ctx.fillText(block.kind, 8, Math.min(height - 8, 20))
  }, width, height, block.kind)

  resolveFallback(page, {
    ...fallback,
    pageNo: page.pageNo,
    stage,
    x,
    y,
    width,
    height
  })
}

async function appendPlacement(
  page: IPageModel,
  placement: IMainPlacement,
  x: number,
  y: number,
  width: number,
  documentModel: IDocumentModel,
  imageNumberMap: Map<IDocumentBlockNode, number>
): Promise<IAppendPlacementResult> {
  if (placement.kind === 'table-row') {
    appendTableRow(
      page,
      placement.block,
      placement.rowIndex,
      x,
      y,
      width,
      documentModel
    )
    return {
      renderX: x,
      renderY: y,
      consumedHeight: placement.height
    }
  }

  if (placement.block.element.type === ElementType.PAGE_BREAK) {
    return {
      renderX: x,
      renderY: y,
      consumedHeight: placement.height
    }
  }

  if (placement.kind === 'text-line') {
    const surroundPlacement = resolveSurroundTextLinePlacement(
      page.pageNo,
      placement,
      x,
      y,
      width,
      documentModel.main.blockList
    )
    await appendResolvedTextLineFragments(
      page,
      placement.block,
      surroundPlacement.fragmentList,
      placement.textStyle,
      placement.listSemantic,
      placement.lineIndex,
      documentModel
    )
    return {
      renderX: surroundPlacement.x,
      renderY: surroundPlacement.y,
      consumedHeight: surroundPlacement.consumedHeight
    }
  }

  if (placement.block.kind === 'table') {
    appendTableRow(page, placement.block, 0, x, y, width, documentModel)
    return {
      renderX: x,
      renderY: y,
      consumedHeight: placement.height
    }
  }

  if (placement.block.element.type === ElementType.SEPARATOR) {
    const lineWidth = placement.block.element.lineWidth || 1
    const baseY = y + (placement.height - lineWidth) / 2
    page.vectorLines.push({
      pageNo: page.pageNo,
      ...createSeparatorVectorLine({
        element: {
          ...placement.block.element,
          width: placement.block.element.width || width
        },
        x,
        y: y + placement.height / 2,
        baseY
      })
    })
    return {
      renderX: x,
      renderY: y,
      consumedHeight: placement.height
    }
  }

  if (placement.block.element.type === ElementType.LABEL) {
    const label = createLabelPlacement({
      element: placement.block.element,
      x,
      y,
      fallbackFont: placement.defaults.defaultFont,
      fallbackSize: placement.defaults.defaultSize,
      fallbackColor: placement.defaults.labelDefaultColor,
      fallbackBackgroundColor:
        placement.defaults.labelDefaultBackgroundColor,
      fallbackPadding: placement.defaults.labelDefaultPadding,
      measureWidth: createMeasureWidth(
        placement.block.element.font || placement.defaults.defaultFont,
        placement.block.element.size || placement.defaults.defaultSize
      )
    })
    page.highlightRects.push({
      pageNo: page.pageNo,
      ...label.backgroundRect
    })
    appendPlacementTextRuns(page, placement.block, [label.textPlacement], 0, 0)
    return {
      renderX: x,
      renderY: y,
      consumedHeight: placement.height
    }
  }

  if (placement.block.kind === 'image') {
    if (isFloatingImageBlock(placement.block)) {
      return {
        renderX: x,
        renderY: y,
        consumedHeight: placement.height
      }
    }
    const imageWidth = Math.min(width, placement.block.element.width || width)
    const imageHeight = placement.block.element.height || placement.height
    await appendImageOrFallback(
      page,
      placement.block,
      x,
      y,
      imageWidth,
      imageHeight
    )
    const captionPlacement = createImageCaptionPlacement(
      placement.block,
      x,
      y,
      imageWidth,
      imageHeight,
      documentModel,
      imageNumberMap.get(placement.block)
    )
    if (captionPlacement) {
      page.textRuns.push({
        pageNo: page.pageNo,
        ...captionPlacement
      })
    }
    return {
      renderX: x,
      renderY: y,
      consumedHeight: placement.height
    }
  }

  if (placement.block.kind === 'control') {
    return {
      renderX: x,
      renderY: y,
      consumedHeight: placement.height
    }
  }

  await appendImageOrFallback(page, placement.block, x, y, width, placement.height)
  return {
    renderX: x,
    renderY: y,
    consumedHeight: placement.height
  }
}

async function appendStaticZone(
  page: IPageModel,
  documentModel: IDocumentModel,
  zoneKey: 'header' | 'footer',
  blockList: IDocumentBlockNode[],
  x: number,
  startY: number,
  width: number,
  imageNumberMap: Map<IDocumentBlockNode, number>
) {
  const stage =
    zoneKey === 'header'
      ? PDF_RENDER_STAGE.HEADER
      : PDF_RENDER_STAGE.FOOTER
  const listSemanticMap = createZoneListSemanticMap(blockList, documentModel)
  const controlBorderSegmentMap = new Map<IDocumentBlockNode, IControlBorderSegment>()
  let cursorY = startY
  for (const block of blockList) {
    if (block.kind === 'paragraph' || block.kind === 'control') {
      if (block.element.type === ElementType.LABEL) {
        const label = createLabelPlacement({
          element: block.element,
          x,
          y: cursorY,
          fallbackFont: documentModel.defaults.defaultFont,
          fallbackSize: documentModel.defaults.defaultSize,
          fallbackColor: documentModel.defaults.labelDefaultColor,
          fallbackBackgroundColor:
            documentModel.defaults.labelDefaultBackgroundColor,
          fallbackPadding: documentModel.defaults.labelDefaultPadding,
          measureWidth: createMeasureWidth(
            block.element.font || documentModel.defaults.defaultFont,
            block.element.size || documentModel.defaults.defaultSize
          )
        })
        page.highlightRects.push({
          pageNo: page.pageNo,
          stage,
          ...label.backgroundRect
        })
        appendPlacementTextRuns(page, block, [label.textPlacement], 0, 0, stage)
        cursorY += label.height
        continue
      }

      if (block.element.type === ElementType.SEPARATOR) {
        const lineWidth = block.element.lineWidth || 1
        page.vectorLines.push({
          pageNo: page.pageNo,
          stage,
          ...createSeparatorVectorLine({
            element: {
              ...block.element,
              width: block.element.width || width
            },
            x,
            y: cursorY + lineWidth / 2,
            baseY: cursorY
          })
        })
        cursorY += lineWidth
        continue
      }

      if (block.element.type === ElementType.PAGE_BREAK) {
        continue
      }

      const resolved = createResolvedTextLayout(
        block,
        width,
        documentModel,
        listSemanticMap.get(block)
      )
      for (let lineIndex = 0; lineIndex < resolved.lineList.length; lineIndex++) {
        const line = resolved.lineList[lineIndex]
        const lineY = cursorY + resolved.textStyle.rowMargin
        const markerPlacement = lineIndex === 0
          ? createListMarkerPlacement({
              semantic: resolved.listSemantic,
              x: 0,
              y: 0,
              height: line.height,
              baselineOffset: line.baselineOffset
            })
          : null
        const renderPlacementList = createMarkerAwarePlacementList(
          line.placementList,
          markerPlacement
        )

        const fallbackApplied = await appendStaticZoneTextRasterFallback(
          page,
          block,
          renderPlacementList,
          x,
          lineY,
          stage,
          documentModel
        )
        if (!fallbackApplied) {
          appendPlacementTextRuns(
            page,
            block,
            renderPlacementList,
            x,
            lineY,
            stage
          )
        }

        if (block.kind === 'control' && block.element.control?.border) {
          const left = x + Math.min(...line.placementList.map(item => item.x))
          const right = x + Math.max(
            ...line.placementList.map(item => item.x + item.width)
          )
          const segment = controlBorderSegmentMap.get(block)
          const bottom = cursorY + line.height + resolved.textStyle.rowMargin * 2
          if (segment) {
            segment.top = Math.min(segment.top, cursorY)
            segment.bottom = Math.max(segment.bottom, bottom)
            segment.left = Math.min(segment.left, left)
            segment.right = Math.max(segment.right, right)
          } else if (line.placementList.length) {
            controlBorderSegmentMap.set(block, {
              top: cursorY,
              bottom,
              left,
              right
            })
          }
        }
        cursorY += line.height + resolved.textStyle.rowMargin * 2
      }
      if (!resolved.lineList.length) {
        cursorY += resolved.height
      }
      continue
    }

    if (block.kind === 'table') {
      const rowList = layoutTable(block)
      const rowHeightList = getResolvedTableRowHeightList(
        block,
        width,
        documentModel
      )
      rowList.forEach(row => {
        appendTableRow(
          page,
          block,
          row.rowIndex,
          x,
          cursorY,
          width,
          documentModel,
          stage
        )
        cursorY += rowHeightList[row.rowIndex] || 24
      })
      continue
    }

    if (block.kind === 'image') {
      if (isFloatingImageBlock(block)) {
        continue
      }
      const imageWidth = Math.min(width, block.element.width || width)
      const imageHeight = block.element.height || 120
      await appendImageOrFallback(
        page,
        block,
        x,
        cursorY,
        imageWidth,
        imageHeight,
        stage
      )
      const captionPlacement = createImageCaptionPlacement(
        block,
        x,
        cursorY,
        imageWidth,
        imageHeight,
        documentModel,
        imageNumberMap.get(block)
      )
      if (captionPlacement) {
        page.textRuns.push({
          pageNo: page.pageNo,
          stage,
          ...captionPlacement
        })
      }
      cursorY += getImageBlockHeight(block, documentModel)
      continue
    }

    await appendImageOrFallback(
      page,
      block,
      x,
      cursorY,
      width,
      getBlockLayoutHeight(block, width, documentModel),
      stage
    )
    cursorY += getBlockLayoutHeight(block, width, documentModel)
  }

  appendControlBorders(page, controlBorderSegmentMap, documentModel, stage)
}

function measureStaticZoneHeight(
  documentModel: IDocumentModel,
  blockList: IDocumentBlockNode[],
  width: number
) {
  const listSemanticMap = createZoneListSemanticMap(blockList, documentModel)
  let totalHeight = 0

  blockList.forEach(block => {
    if (block.kind === 'paragraph' || block.kind === 'control') {
      if (block.element.type === ElementType.LABEL) {
        totalHeight += createLabelPlacement({
          element: block.element,
          x: 0,
          y: 0,
          fallbackFont: documentModel.defaults.defaultFont,
          fallbackSize: documentModel.defaults.defaultSize,
          fallbackColor: documentModel.defaults.labelDefaultColor,
          fallbackBackgroundColor:
            documentModel.defaults.labelDefaultBackgroundColor,
          fallbackPadding: documentModel.defaults.labelDefaultPadding,
          measureWidth: createMeasureWidth(
            block.element.font || documentModel.defaults.defaultFont,
            block.element.size || documentModel.defaults.defaultSize
          )
        }).height
        return
      }

      if (block.element.type === ElementType.SEPARATOR) {
        totalHeight += block.element.lineWidth || 1
        return
      }

      if (block.element.type === ElementType.PAGE_BREAK) {
        return
      }

      const resolved = createResolvedTextLayout(
        block,
        width,
        documentModel,
        listSemanticMap.get(block)
      )
      totalHeight += resolved.lineList.length
        ? resolved.lineList.reduce(
            (sum, line) => sum + line.height + resolved.textStyle.rowMargin * 2,
            0
          )
        : resolved.height
      return
    }

    if (block.kind === 'table') {
      totalHeight += getResolvedTableRowHeightList(
        block,
        width,
        documentModel
      ).reduce((sum, rowHeight) => sum + rowHeight, 0)
      return
    }

    if (block.kind === 'image') {
      if (!isFloatingImageBlock(block)) {
        totalHeight += getImageBlockHeight(block, documentModel)
      }
      return
    }

    totalHeight += getBlockLayoutHeight(block, width, documentModel)
  })

  return totalHeight
}

function resolveDocumentZoneHeights(documentModel: IDocumentModel) {
  const contentWidth =
    documentModel.width - documentModel.margins[1] - documentModel.margins[3]

  return {
    contentWidth,
    documentModel: {
      ...documentModel,
      header: {
        ...documentModel.header,
        height: documentModel.defaults.header.disabled
          ? 0
          : measureStaticZoneHeight(
              documentModel,
              documentModel.header.blockList,
              contentWidth
            )
      },
      footer: {
        ...documentModel.footer,
        height: documentModel.defaults.footer.disabled
          ? 0
          : measureStaticZoneHeight(
              documentModel,
              documentModel.footer.blockList,
              contentWidth
            )
      }
    }
  }
}

export async function layoutDocument(
  documentModel: IDocumentModel
): Promise<IPageModel[]> {
  const resolved = resolveDocumentZoneHeights(documentModel)
  const contentWidth = resolved.contentWidth
  const resolvedDocumentModel = resolved.documentModel
  const frame = layoutFrame(resolvedDocumentModel)
  const mainPageHeight = Math.max(1, frame.mainBottom - frame.mainTop)
  const placements = collectMainPlacements(
    resolvedDocumentModel.main.blockList,
    contentWidth,
    mainPageHeight,
    resolvedDocumentModel
  )
  const placementIndexes = paginateMainPlacements(
    placements,
    frame,
    resolvedDocumentModel,
    contentWidth
  )

  const pageCount = getRequiredPageCount(
    resolvedDocumentModel,
    placementIndexes.length
  )
  const pageList: IPageModel[] = []
  const imageNumberMap = new Map<IDocumentBlockNode, number>()
  let imageNo = 1
  resolvedDocumentModel.main.blockList.forEach(block => {
    if (block.kind !== 'image') {
      return
    }

    imageNumberMap.set(block, imageNo)
    imageNo += 1
  })
  const backgroundImageSize =
    resolvedDocumentModel.defaults.backgroundImage
      ? await resolveImageSize(resolvedDocumentModel.defaults.backgroundImage)
      : null
  let continuityLineNo = 1

  for (let pageNo = 0; pageNo < pageCount; pageNo++) {
    const page = createPage(pageNo, resolvedDocumentModel)
    appendFrameDecorations(
      page,
      resolvedDocumentModel,
      pageCount,
      frame,
      backgroundImageSize
    )
    if (!resolvedDocumentModel.defaults.header.disabled) {
      await appendStaticZone(
        page,
        resolvedDocumentModel,
        'header',
        resolvedDocumentModel.header.blockList,
        resolvedDocumentModel.margins[3],
        frame.headerTop,
        contentWidth,
        imageNumberMap
      )
    }
    if (!resolvedDocumentModel.defaults.footer.disabled) {
      await appendStaticZone(
        page,
        resolvedDocumentModel,
        'footer',
        resolvedDocumentModel.footer.blockList,
        resolvedDocumentModel.margins[3],
        frame.footerTop,
        contentWidth,
        imageNumberMap
      )
    }

    let cursorY = frame.mainTop
    const lineNumberBaselineList: number[] = []
    const areaSegmentMap = new Map<string, IAreaDecorationSegment>()
    const controlBorderSegmentMap = new Map<IDocumentBlockNode, IControlBorderSegment>()
    const indexes = placementIndexes[pageNo] || []
    for (const index of indexes) {
      const placement = placements[index]
      if (!placement) continue
      // eslint-disable-next-line no-await-in-loop
      const placementResult = await appendPlacement(
        page,
        placement,
        resolvedDocumentModel.margins[3],
        cursorY,
        contentWidth,
        resolvedDocumentModel,
        imageNumberMap
      )
      collectAreaDecorationSegment(
        areaSegmentMap,
        placement,
        cursorY,
        placementResult.consumedHeight
      )
      collectControlBorderSegment(
        controlBorderSegmentMap,
        placement,
        placementResult.renderX,
        placementResult.renderY
      )
      const baselineY = resolveMainPlacementLineNumberBaseline(
        placement,
        placementResult.renderX,
        placementResult.renderY,
        contentWidth,
        resolvedDocumentModel
      )
      if (typeof baselineY === 'number') {
        lineNumberBaselineList.push(baselineY)
      }
      cursorY += placementResult.consumedHeight
    }

    appendAreaDecorations(
      page,
      areaSegmentMap,
      resolvedDocumentModel.margins[3],
      contentWidth
    )
    appendControlBorders(page, controlBorderSegmentMap, resolvedDocumentModel)
    if (!resolvedDocumentModel.defaults.header.disabled) {
      appendFloatingImages(
        page,
        resolvedDocumentModel.header.blockList,
        resolvedDocumentModel,
        imageNumberMap,
        'header'
      )
    }
    appendFloatingImages(
      page,
      resolvedDocumentModel.main.blockList,
      resolvedDocumentModel,
      imageNumberMap,
      'main'
    )
    if (!resolvedDocumentModel.defaults.footer.disabled) {
      appendFloatingImages(
        page,
        resolvedDocumentModel.footer.blockList,
        resolvedDocumentModel,
        imageNumberMap,
        'footer'
      )
    }
    appendBadges(page, resolvedDocumentModel, areaSegmentMap, frame.mainTop)
    appendGraffiti(page, resolvedDocumentModel)

    if (
      !resolvedDocumentModel.defaults.lineNumber.disabled &&
      lineNumberBaselineList.length
    ) {
      createLineNumberPlacements({
        baselineYList: lineNumberBaselineList,
        margins: resolvedDocumentModel.margins,
        right: resolvedDocumentModel.defaults.lineNumber.right,
        font: resolvedDocumentModel.defaults.lineNumber.font,
        size: resolvedDocumentModel.defaults.lineNumber.size,
        color: resolvedDocumentModel.defaults.lineNumber.color,
        type: resolvedDocumentModel.defaults.lineNumber.type,
        startLineNo: continuityLineNo,
        measureWidth: createMeasureWidth(
          resolvedDocumentModel.defaults.lineNumber.font,
          resolvedDocumentModel.defaults.lineNumber.size
        )
      }).forEach(placement => {
        page.textRuns.push({
          pageNo: page.pageNo,
          stage: PDF_RENDER_STAGE.LINE_NUMBER,
          ...placement
        })
      })
      if (
        resolvedDocumentModel.defaults.lineNumber.type ===
        LineNumberType.CONTINUITY
      ) {
        continuityLineNo += lineNumberBaselineList.length
      }
    }

    if (
      !page.textRuns.length &&
      !page.highlightRects.length &&
      !page.vectorLines.length &&
      !page.rasterBlocks.length
    ) {
      page.issues.push('layout:empty-page')
    }

    pageList.push(page)
  }

  return pageList
}

export function collectLayoutDebugSummary(documentModel: IDocumentModel) {
  const resolved = resolveDocumentZoneHeights(documentModel)
  const contentWidth = resolved.contentWidth
  const resolvedDocumentModel = resolved.documentModel
  const frame = layoutFrame(resolvedDocumentModel)
  const mainPageHeight = Math.max(1, frame.mainBottom - frame.mainTop)
  const placements = collectMainPlacements(
    resolvedDocumentModel.main.blockList,
    contentWidth,
    mainPageHeight,
    resolvedDocumentModel
  )
  const placementIndexes = paginateMainPlacements(
    placements,
    frame,
    resolvedDocumentModel,
    contentWidth
  )
  const blockSummaryList = resolvedDocumentModel.main.blockList.map(
    (block, index) => {
      const blockPlacementList = placements.filter(
        placement => placement.block === block
      )
      return {
        index,
        kind: block.kind,
        type: block.element.type || 'text',
        textPreview: (
          block.element.value ||
          (block.element.valueList || []).map(item => item.value || '').join('')
        ).slice(0, 60),
        placementCount: blockPlacementList.length,
        consumedHeight: blockPlacementList.reduce(
          (sum, placement) => sum + placement.height,
          0
        )
      }
    }
  )

  return {
    placementCount: placements.length,
    blockSummaryList,
    pagePlacementSummary: placementIndexes.map((indexes, pageNo) => {
      let cursorY = frame.mainTop
      const blockIndexList = Array.from(new Set(indexes.map(index =>
        resolvedDocumentModel.main.blockList.indexOf(placements[index].block)
      ))).filter(index => index >= 0)
      const placementSummaryList = indexes.map(index => {
        const placement = placements[index]
        const blockIndex =
          resolvedDocumentModel.main.blockList.indexOf(placement.block)
        const placementSummary = {
          index,
          kind: placement.kind,
          blockIndex,
          height: placement.height,
          cursorYBefore: cursorY,
          cursorYAfter: cursorY + placement.height
        }
        cursorY += placement.height
        return placementSummary
      })

      return {
        pageNo,
        placementCount: indexes.length,
        consumedHeight: placementSummaryList.reduce(
          (sum, placement) => sum + placement.height,
          0
        ),
        cursorYEnd: cursorY,
        blockIndexList,
        placementSummaryList,
        blockList: blockIndexList.map(index => {
          const block = resolvedDocumentModel.main.blockList[index]
          return {
            index,
            kind: block.kind,
            type: block.element.type || 'text',
            textPreview: (
              block.element.value ||
              (block.element.valueList || []).map(item => item.value || '').join('')
            ).slice(0, 60),
            placementCount: placementSummaryList.filter(placement =>
              placement.blockIndex === index
            ).length,
            consumedHeight: placementSummaryList
              .filter(placement => placement.blockIndex === index)
              .reduce((sum, placement) => sum + placement.height, 0)
          }
        })
      }
    })
  }
}
