import { rasterizeElement } from '../fallback/rasterizeElement'
import { resolveFallback } from '../fallback/resolveFallback'
import type { IDocumentBlockNode, IDocumentModel } from '../model/document'
import type { IPageModel } from '../model/layout'
import { measureLineHeight, measureText } from '../measure/textMeasure'
import { BlockType } from '../../../editor/dataset/enum/Block'
import { ZERO } from '../../../editor/dataset/constant/Common'
import { defaultCheckboxOption } from '../../../editor/dataset/constant/Checkbox'
import { defaultRadioOption } from '../../../editor/dataset/constant/Radio'
import { ImageDisplay } from '../../../editor/dataset/enum/Common'
import { ControlComponent } from '../../../editor/dataset/enum/Control'
import { ElementType } from '../../../editor/dataset/enum/Element'
import { LineNumberType } from '../../../editor/dataset/enum/LineNumber'
import { ListStyle, ListType } from '../../../editor/dataset/enum/List'
import { WatermarkType } from '../../../editor/dataset/enum/Watermark'
import { splitText } from '../../../editor/utils'
import type {
  IElement,
  IElementPosition
} from '../../../editor/interface/Element'
import type { IRow, IRowElement } from '../../../editor/interface/Row'
import {
  createListMarkerPlacement,
  getRowMarginRatio,
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
const coreElementSourceIndexMap = new WeakMap<IRowElement, number>()
const coreRowOmittedWidthMap = new WeakMap<IRow, Map<number, number>>()
const CORE_ZERO_WIDTH_CHAR_REG = /[\u200b-\u200d\ufeff]/g
const unorderedCoreListMarkerMap: Partial<Record<ListStyle, string>> = {
  [ListStyle.DISC]: '\u2022',
  [ListStyle.CIRCLE]: '\u25e6',
  [ListStyle.SQUARE]: '\u25aa'
}

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

function isControlBlock(block: IDocumentBlockNode) {
  return (
    block.kind === 'control' ||
    block.element.type === ElementType.CONTROL ||
    block.element.type === ElementType.CHECKBOX ||
    block.element.type === ElementType.RADIO
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
  const areaSource = (() => {
    const areaId = placement.block.element.areaId
    const area = placement.block.element.area
    if (areaId && area && !area.hide) {
      return {
        areaId,
        backgroundColor: area.backgroundColor,
        borderColor: area.borderColor
      }
    }
    if (placement.kind !== 'text-line') {
      return null
    }
    const areaPlacement = placement.line.placementList.find(item =>
      item.areaId &&
      (item.areaBackgroundColor || item.areaBorderColor)
    )
    if (!areaPlacement?.areaId) {
      return null
    }
    return {
      areaId: areaPlacement.areaId,
      backgroundColor: areaPlacement.areaBackgroundColor,
      borderColor: areaPlacement.areaBorderColor
    }
  })()
  if (!areaSource?.areaId) {
    return
  }
  if (!areaSource.backgroundColor && !areaSource.borderColor) {
    return
  }

  const segment = areaSegmentMap.get(areaSource.areaId)
  const bottom = top + height
  if (segment) {
    segment.top = Math.min(segment.top, top)
    segment.bottom = Math.max(segment.bottom, bottom)
    return
  }

  areaSegmentMap.set(areaSource.areaId, {
    areaId: areaSource.areaId,
    top,
    bottom,
    backgroundColor: areaSource.backgroundColor,
    borderColor: areaSource.borderColor
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
    left.linkUrl === right.linkUrl &&
    left.areaId === right.areaId &&
    left.areaBackgroundColor === right.areaBackgroundColor &&
    left.areaBorderColor === right.areaBorderColor &&
    left.controlKey === right.controlKey &&
    left.controlBorder === right.controlBorder &&
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
  const lineTop = y + placement.line.rowMargin
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
    imageBottom - placement.line.rowMargin,
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
  const hasBaselineShift = placementList.some(
    placement => Math.abs(placement.baselineShift || 0) > 0.001
  )
  if (hasBaselineShift) {
    return true
  }

  const cjkCount = charList.filter(char => CJK_CHAR_REG.test(char)).length
  if (!cjkCount) {
    return false
  }

  const maxSize = Math.max(...placementList.map(placement => placement.size))
  const alphaCount = charList.filter(char => ASCII_ALPHA_REG.test(char)).length
  const digitCount = charList.filter(char => DIGIT_REG.test(char)).length
  const otherCount = charList.length - cjkCount - alphaCount - digitCount
  const hasMixedScript =
    alphaCount > 0 ||
    digitCount > 0 ||
    otherCount > 0
  const cjkRatio = cjkCount / charList.length
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
  documentModel: IDocumentModel,
  force = false
) {
  if (documentModel.disableTextRasterFallback && !force) {
    return false
  }

  if (
    !force &&
    !shouldRasterizeDenseCjkTextLine(block, placementList, stage) &&
    !shouldRasterizeContentTextLine(block, placementList, stage)
  ) {
    return false
  }

  const bounds = resolvePlacementRasterBounds(placementList, x, y)

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
  if (documentModel.disableTextRasterFallback) {
    return false
  }

  if (!isStaticHeaderSmallCjkLine(placementList, stage)) {
    return false
  }

  const bounds = resolvePlacementRasterBounds(placementList, x, y)

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
  originX: number,
  textStyle: IResolvedBlockTextStyle,
  lineRowMargin: number,
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
      x: originX,
      y: firstFragment.y + lineRowMargin,
      height: firstFragment.placementList[0]?.height || 0,
      baselineOffset:
        firstFragment.placementList[0]?.baselineOffset || textStyle.size
    })
    if (markerPlacement) {
      appendPlacementTextRuns(page, block, [markerPlacement], 0, 0, stage)
    }
    for (let fragmentIndex = 0; fragmentIndex < fragmentList.length; fragmentIndex++) {
      const fragment = fragmentList[fragmentIndex]
      const contentY = fragment.y + lineRowMargin
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
    return
  }

  for (const fragment of fragmentList) {
    const contentY = fragment.y + lineRowMargin
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

  const rowMargin = placement.line.rowMargin
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
          fragment.y + placement.line.rowMargin + textPlacement.y + measured.descent
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
  controlBorderSegmentMap: Map<object, IControlBorderSegment>,
  placement: IMainPlacement,
  x: number,
  y: number
) {
  if (placement.kind !== 'text-line') return
  if (!placement.line.placementList.length) return

  const bottom = y + placement.height
  const controlPlacementMap =
    new Map<object, ITextLinePlacement['line']['placementList']>()

  placement.line.placementList.forEach(linePlacement => {
    if (!linePlacement.controlKey || !linePlacement.controlBorder) {
      return
    }
    const placementList = controlPlacementMap.get(linePlacement.controlKey)
    if (placementList) {
      placementList.push(linePlacement)
      return
    }
    controlPlacementMap.set(linePlacement.controlKey, [linePlacement])
  })

  if (!controlPlacementMap.size) {
    if (!isControlBlock(placement.block) || !placement.block.element.control?.border) {
      return
    }
    controlPlacementMap.set(placement.block.element, placement.line.placementList)
  }

  controlPlacementMap.forEach((placementList, controlKey) => {
    const left = x + Math.min(...placementList.map(line => line.x))
    const right = x + Math.max(
      ...placementList.map(line => line.x + line.width)
    )
    const segment = controlBorderSegmentMap.get(controlKey)

    if (segment) {
      segment.top = Math.min(segment.top, y)
      segment.bottom = Math.max(segment.bottom, bottom)
      segment.left = Math.min(segment.left, left)
      segment.right = Math.max(segment.right, right)
      return
    }

    controlBorderSegmentMap.set(controlKey, {
      top: y,
      bottom,
      left,
      right
    })
  })
}

function appendControlBorders(
  page: IPageModel,
  controlBorderSegmentMap: Map<object, IControlBorderSegment>,
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
    fallbackRowMargin: textStyle.rowMargin,
    fallbackDefaultRowMargin: documentModel.defaults.defaultRowMargin,
    fallbackDefaultBasicRowMarginHeight:
      documentModel.defaults.defaultBasicRowMarginHeight,
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
        (sum, line) => sum + line.height + line.rowMargin * 2,
        0
      )
    : 0

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

function getTableLayoutWidth(block: IDocumentBlockNode, fallbackWidth: number) {
  if (typeof block.element.width === 'number' && block.element.width > 0) {
    return block.element.width
  }

  const columnWidth = getTableColumnWidthList(block)
    .reduce((sum, currentWidth) => sum + currentWidth, 0)
  return columnWidth || fallbackWidth
}

function getResolvedTableRowHeightList(
  block: IDocumentBlockNode,
  width: number,
  documentModel: IDocumentModel
) {
  const rowList = layoutTable(block)
  const tableWidth = getTableLayoutWidth(block, width)
  const columnWidthList = getTableColumnWidthList(block, tableWidth)
  return resolveTableRowHeightList({
    rowList,
    columnWidthList,
    measureWidth: (value, style) =>
      measureText(
        value,
        style?.font || documentModel.defaults.defaultFont,
        style?.size || documentModel.defaults.defaultSize,
        style?.bold,
        style?.italic
      ).width,
    lineHeight: getTextLineHeight(
      documentModel.defaults.defaultFont,
      documentModel.defaults.defaultSize
    ),
    font: documentModel.defaults.defaultFont,
    size: documentModel.defaults.defaultSize,
    defaultRowMargin: documentModel.defaults.defaultRowMargin,
    defaultBasicRowMarginHeight:
      documentModel.defaults.defaultBasicRowMarginHeight,
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
    fallbackRowMargin: textStyle.rowMargin,
    fallbackDefaultRowMargin: documentModel.defaults.defaultRowMargin,
    fallbackDefaultBasicRowMarginHeight:
      documentModel.defaults.defaultBasicRowMarginHeight,
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
  const contentHeight = lineList.reduce(
    (sum, line) => sum + line.height + line.rowMargin * 2,
    0
  )
  return Math.max(
    block.height || 0,
    getBlockHeight(block),
    contentHeight
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
      ((block.element.type === ElementType.LABEL &&
        block.kind !== 'paragraph') ||
        block.element.type === ElementType.SEPARATOR)
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
          height: line.height + line.rowMargin * 2,
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

  const absolutePlacementList = placementList.map(placement => ({
    ...placement,
    x: x + placement.x,
    y: y + placement.y
  }))

  createTextDecorationLines(absolutePlacementList).forEach(line => {
    page.vectorLines.push({
      pageNo: page.pageNo,
      stage,
      ...line
    })
  })

  const appendInlineImagePlacement = (
    placement: IStyledTextPlacementLine['placementList'][number]
  ) => {
    if (
      !placement.inlineImageDataUrl ||
      !placement.inlineImageWidth ||
      !placement.inlineImageHeight
    ) {
      return false
    }

    page.rasterBlocks.push({
      pageNo: page.pageNo,
      stage,
      x: x + placement.x,
      y: y + placement.y - placement.inlineImageHeight,
      width: placement.inlineImageWidth,
      height: placement.inlineImageHeight,
      dataUrl: placement.inlineImageDataUrl,
      crop: placement.inlineImageCrop,
      sourceType: 'image',
      layer: 'content'
    })
    return true
  }

  placementList.forEach(line => {
    if (appendInlineImagePlacement(line)) {
      return
    }

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

    const highlightColor = line.highlight || block.element.highlight
    if (highlightColor) {
      const rowMargin = line.rowMargin || 0
      const highlightMarginHeight = line.highlightMarginHeight
      const highlightTop =
        typeof highlightMarginHeight === 'number'
          ? y + line.y - line.baselineOffset + rowMargin - highlightMarginHeight
          : y + line.y - line.baselineOffset - rowMargin
      const highlightHeight =
        typeof highlightMarginHeight === 'number'
          ? line.height - 2 * rowMargin + 2 * highlightMarginHeight
          : line.height + rowMargin * 2
      page.highlightRects.push({
        pageNo: page.pageNo,
        stage,
        x: x + line.x,
        y: highlightTop,
        width: line.widthOverride ?? Math.min(measured.width, line.width),
        height: highlightHeight,
        color: highlightColor,
        opacity: line.highlightOpacity ?? 0.6
      })
    }
  })

  const linkPlacementList = placementList.filter(line => line.linkUrl)
  if (linkPlacementList.length) {
    linkPlacementList.forEach(line => {
      page.links.push({
        pageNo: page.pageNo,
        stage,
        x: x + line.x,
        y: y + line.y - line.baselineOffset,
        width: line.width,
        height: line.height,
        url: line.linkUrl!
      })
    })
    return
  }

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

async function appendTableRow(
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

  const tableWidth = getTableLayoutWidth(block, width)
  const columnCount = getTableColumnCount(block)
  const columnWidthList = getTableColumnWidthList(block, tableWidth)
  const rowHeightList = getResolvedTableRowHeightList(
    block,
    tableWidth,
    documentModel
  )
  const rowCount = rowList.length

  for (const td of row.tdList) {
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

    if (td.rowList?.length && td.positionList?.length) {
      // eslint-disable-next-line no-await-in-loop
      await appendCoreRowList(
        page,
        filterCoreRowList(td.rowList),
        td.positionList,
        documentModel,
        new Map(),
        stage
      )
      continue
    }

    const cellLineList = createTableCellTextPlacements({
      td,
      x: cellX,
      y,
      cellWidth,
      rowHeight: cellHeight,
      font: documentModel.defaults.defaultFont,
      size: documentModel.defaults.defaultSize,
      defaultRowMargin: documentModel.defaults.defaultRowMargin,
      defaultBasicRowMarginHeight:
        documentModel.defaults.defaultBasicRowMarginHeight,
      lineHeight: getTextLineHeight(
        documentModel.defaults.defaultFont,
        documentModel.defaults.defaultSize
      ),
      tabWidth: documentModel.defaults.defaultTabWidth ?? DEFAULT_TAB_WIDTH,
      color: '#000000',
      measureWidth: (value, style) =>
        measureText(
          value,
          style?.font || documentModel.defaults.defaultFont,
          style?.size || documentModel.defaults.defaultSize,
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
      if (
        line.inlineImageDataUrl &&
        line.inlineImageWidth &&
        line.inlineImageHeight
      ) {
        page.rasterBlocks.push({
          pageNo: page.pageNo,
          stage,
          x: line.x,
          y: line.y - line.inlineImageHeight,
          width: line.inlineImageWidth,
          height: line.inlineImageHeight,
          dataUrl: line.inlineImageDataUrl,
          crop: line.inlineImageCrop,
          sourceType: 'image',
          layer: 'content'
        })
        return
      }

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

      if (line.highlight) {
        const rowMargin = line.rowMargin || 0
        const highlightTop = line.y - line.baselineOffset - rowMargin
        const highlightHeight = line.height + rowMargin * 2
        page.highlightRects.push({
          pageNo: page.pageNo,
          stage,
          x: line.x,
          y: highlightTop,
          width: line.width,
          height: highlightHeight,
          color: line.highlight,
          opacity: 0.6
        })
      }
    })
  }
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

  const tableWidth = getTableLayoutWidth(block, width)
  const columnWidthList = getTableColumnWidthList(block, tableWidth)
  const rowHeightList = getResolvedTableRowHeightList(
    block,
    tableWidth,
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
      size: documentModel.defaults.defaultSize,
      defaultRowMargin: documentModel.defaults.defaultRowMargin,
      defaultBasicRowMarginHeight:
        documentModel.defaults.defaultBasicRowMarginHeight,
      lineHeight: getTextLineHeight(
        documentModel.defaults.defaultFont,
        documentModel.defaults.defaultSize
      ),
      tabWidth: documentModel.defaults.defaultTabWidth ?? DEFAULT_TAB_WIDTH,
      color: '#000000',
      measureWidth: (value, style) =>
        measureText(
          value,
          style?.font || documentModel.defaults.defaultFont,
          style?.size || documentModel.defaults.defaultSize,
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
    return y + placement.line.rowMargin + placement.line.baselineOffset
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
    await appendTableRow(
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
      x,
      placement.textStyle,
      placement.line.rowMargin,
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
    await appendTableRow(page, placement.block, 0, x, y, width, documentModel)
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

  if (isControlBlock(placement.block)) {
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
  const controlBorderSegmentMap = new Map<object, IControlBorderSegment>()
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
        const lineY = cursorY + line.rowMargin
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

        collectControlBorderSegment(
          controlBorderSegmentMap,
          {
            kind: 'text-line',
            block,
            line,
            lineIndex,
            height: line.height + line.rowMargin * 2,
            textStyle: resolved.textStyle,
            listSemantic: resolved.listSemantic
          },
          x,
          cursorY
        )
        cursorY += line.height + line.rowMargin * 2
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
      for (const row of rowList) {
        // eslint-disable-next-line no-await-in-loop
        await appendTableRow(
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
      }
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
            (sum, line) => sum + line.height + line.rowMargin * 2,
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
  const headerDisabled = documentModel.defaults.header?.disabled ?? false
  const footerDisabled = documentModel.defaults.footer?.disabled ?? false
  const coreLayout = documentModel.coreLayout
  const resolvedHeaderHeight = headerDisabled
    ? 0
    : coreLayout?.headerRowList?.length
      ? Math.max(
          0,
          documentModel.margins[0] - (documentModel.defaults.header?.top ?? 0)
        ) + (coreLayout.headerExtraHeight || 0)
      : measureStaticZoneHeight(
          documentModel,
          documentModel.header.blockList,
          contentWidth
        )
  const resolvedFooterHeight = footerDisabled
    ? 0
    : coreLayout?.footerRowList?.length
      ? Math.max(
          0,
          documentModel.margins[2] - (documentModel.defaults.footer?.bottom ?? 0)
        ) + (coreLayout.footerExtraHeight || 0)
      : measureStaticZoneHeight(
          documentModel,
          documentModel.footer.blockList,
          contentWidth
        )

  return {
    contentWidth,
    documentModel: {
      ...documentModel,
      header: {
        ...documentModel.header,
        height: resolvedHeaderHeight
      },
      footer: {
        ...documentModel.footer,
        height: resolvedFooterHeight
      }
    }
  }
}

function resolveCorePageCount(documentModel: IDocumentModel) {
  const corePageRowList = documentModel.coreLayout?.pageRowList
  return corePageRowList?.length || documentModel.coreLayout?.pageCount || 0
}

function hasCoreLayoutContent(documentModel: IDocumentModel, pageNo: number) {
  const core = documentModel.coreLayout
  if (!core) return false

  return Boolean(
    core.pageRowList?.[pageNo]?.length ||
    core.headerRowList?.length ||
    core.footerRowList?.length
  )
}

function hasRequiredCoreLayout(documentModel: IDocumentModel) {
  return Boolean(documentModel.coreLayout && resolveCorePageCount(documentModel))
}

function isCoreCheckControl(element: IElement) {
  return (
    element.type === ElementType.CHECKBOX ||
    element.controlComponent === ControlComponent.CHECKBOX
  )
}

function isCoreRadioControl(element: IElement) {
  return (
    element.type === ElementType.RADIO ||
    element.controlComponent === ControlComponent.RADIO
  )
}

function hasExportableCoreControlVisual(element: IElement) {
  return (
    isCoreCheckControl(element) ||
    isCoreRadioControl(element) ||
    isCoreFixedUnderlineControlCarrier(element)
  )
}

function isCoreFixedUnderlineControlCarrier(element: IElement) {
  return Boolean(
    element.controlComponent === ControlComponent.POSTFIX &&
    element.control?.minWidth &&
    element.control?.underline
  )
}

function hasCoreRenderableElementContent(element: IElement) {
  return Boolean(
    getCoreElementText(element)
      .replace(CORE_ZERO_WIDTH_CHAR_REG, '')
      .trim()
  )
}

function isExportableCoreElement(element: IElement) {
  if (!element.controlId) return true

  if (
    !hasCoreRenderableElementContent(element) &&
    !hasExportableCoreControlVisual(element)
  ) {
    return false
  }

  return (
    element.controlComponent === ControlComponent.VALUE ||
    element.controlComponent === ControlComponent.CHECKBOX ||
    element.controlComponent === ControlComponent.RADIO ||
    isCoreFixedUnderlineControlCarrier(element)
  )
}

function getCoreElementOccupiedWidth(element: IElement) {
  const rowElement = element as IRowElement
  return (
    (rowElement.metrics?.width || 0) +
    Math.max(0, rowElement.left || 0)
  )
}

function filterCoreElementList<T extends IElement>(elementList: T[]): T[] {
  return elementList.filter(element => {
    if (element.type === ElementType.TABLE) {
      element.trList?.forEach(tr => {
        tr.tdList.forEach(td => {
          td.value = filterCoreElementList(td.value)
        })
      })
    }
    return isExportableCoreElement(element)
  })
}

function filterCoreRowList(rowList: IRow[]) {
  return rowList.map(row => {
    let omittedWidth = 0
    const omittedWidthMap = new Map<number, number>()
    const elementList: IRowElement[] = []

    row.elementList.forEach((element, sourceIndex) => {
      omittedWidthMap.set(sourceIndex, omittedWidth)
      if (element.type === ElementType.TABLE) {
        element.trList?.forEach(tr => {
          tr.tdList.forEach(td => {
            td.value = filterCoreElementList(td.value)
          })
        })
      }

      if (!isExportableCoreElement(element)) {
        omittedWidth += getCoreElementOccupiedWidth(element)
        return
      }
      coreElementSourceIndexMap.set(element, sourceIndex)
      elementList.push(element)
    })

    const filteredRow = {
      ...row,
      elementList
    }
    coreRowOmittedWidthMap.set(filteredRow, omittedWidthMap)
    return filteredRow
  })
}

function createCoreElementBlock(element: IRowElement): IDocumentBlockNode {
  switch (element.type) {
    case ElementType.TABLE:
      return {
        kind: 'table',
        element
      }
    case ElementType.IMAGE:
      return {
        kind: 'image',
        element
      }
    case ElementType.LATEX:
      return {
        kind: 'latex',
        element
      }
    case ElementType.BLOCK:
      return {
        kind: 'block',
        element
      }
    case ElementType.CONTROL:
    case ElementType.CHECKBOX:
    case ElementType.RADIO:
      return {
        kind: 'control',
        element
      }
    default:
      return {
        kind: 'paragraph',
        element
      }
  }
}

function getCoreElementText(element: IElement) {
  if (
    element.hide ||
    element.control?.hide ||
    element.area?.hide ||
    element.type === ElementType.TAB
  ) {
    return ''
  }

  return element.value === ZERO ? '' : element.value || ''
}

function resolveCoreElementRowMargin(
  element: IRowElement,
  documentModel: IDocumentModel
) {
  const size = element.size || documentModel.defaults.defaultSize
  return (
    documentModel.defaults.defaultBasicRowMarginHeight *
    getRowMarginRatio(size) *
    (element.rowMargin ?? documentModel.defaults.defaultRowMargin)
  )
}

function createCoreTextPlacement(
  element: IRowElement,
  row: IRow,
  position: IElementPosition,
  documentModel: IDocumentModel
): IStyledTextPlacementLine['placementList'][number] | null {
  const text = getCoreElementText(element)
  if (!text || !hasCoreRenderableElementContent(element)) return null

  const font = element.font || documentModel.defaults.defaultFont
  const size =
    element.type === ElementType.SUPERSCRIPT ||
    element.type === ElementType.SUBSCRIPT
      ? element.actualSize || element.size || documentModel.defaults.defaultSize
      : element.size || documentModel.defaults.defaultSize
  const metrics = element.metrics
  const baselineOffset = position.ascent
  const rowMargin = resolveCoreElementRowMargin(element, documentModel)
  const verticalOffset =
    element.type === ElementType.SUPERSCRIPT
      ? -metrics.height / 2
      : element.type === ElementType.SUBSCRIPT
        ? metrics.height / 2
        : 0

  return {
    text,
    x: position.coordinate.leftTop[0],
    y: position.coordinate.leftTop[1] + baselineOffset + verticalOffset,
    width: metrics.width,
    widthOverride: metrics.width,
    height: row.height,
    baselineOffset,
    ascent: metrics.boundingBoxAscent,
    descent: metrics.boundingBoxDescent,
    baselineShift: verticalOffset,
    rowMargin,
    font,
    size,
    letterSpacing: element.letterSpacing,
    bold: element.bold,
    italic: element.italic,
    color: element.color || documentModel.defaults.defaultColor,
    highlight: element.highlight,
    highlightMarginHeight: documentModel.defaults.highlightMarginHeight,
    highlightOpacity: documentModel.defaults.highlightAlpha,
    underline: element.underline || element.control?.underline,
    strikeout: element.strikeout,
    linkUrl:
      element.type === ElementType.HYPERLINK
        ? element.url
        : undefined
  }
}

function createCoreEmptyUnderlinePlacement(
  element: IRowElement,
  row: IRow,
  position: IElementPosition,
  documentModel: IDocumentModel
): IStyledTextPlacementLine['placementList'][number] | null {
  const offsetX = Math.max(0, element.left || 0)
  const width = Math.max(
    element.metrics.width + offsetX,
    element.control?.minWidth || 0
  )
  if (!element.control?.underline || !width) return null

  const size = element.size || documentModel.defaults.defaultSize
  const baselineOffset = position.ascent
  const rowMargin = resolveCoreElementRowMargin(element, documentModel)
  return {
    text: ' ',
    x: position.coordinate.leftTop[0] - offsetX,
    y: position.coordinate.leftTop[1] + baselineOffset,
    width,
    widthOverride: width,
    height: row.height,
    baselineOffset,
    ascent: element.metrics.boundingBoxAscent,
    descent: element.metrics.boundingBoxDescent,
    rowMargin,
    font: element.font || documentModel.defaults.defaultFont,
    size,
    color: element.color || documentModel.defaults.defaultColor,
    underline: true
  }
}

function createCoreControlSvgDataUrl(markup: string) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`
}

function appendCoreCheckControl(
  page: IPageModel,
  element: IRowElement,
  x: number,
  baselineY: number,
  stage: number
) {
  const isCheckbox = isCoreCheckControl(element)
  const isRadio = isCoreRadioControl(element)
  if (!isCheckbox && !isRadio) {
    return false
  }

  const option = isCheckbox ? defaultCheckboxOption : defaultRadioOption
  const width = element.metrics.width || option.width + option.gap * 2
  const height = element.metrics.height || option.height
  const lineWidth = option.lineWidth
  const boxWidth = Math.max(1, width - option.gap * 2)
  const boxHeight = height
  const left = option.gap
  const top = lineWidth
  const checked = isCheckbox
    ? Boolean(element.checkbox?.value)
    : Boolean(element.radio?.value)

  const svg = isCheckbox
    ? `
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height + lineWidth * 2}" viewBox="0 0 ${width} ${height + lineWidth * 2}">
  <rect x="${left}" y="${top}" width="${boxWidth}" height="${boxHeight}" fill="${checked ? defaultCheckboxOption.checkFillStyle : defaultCheckboxOption.fillStyle}" stroke="${checked ? defaultCheckboxOption.checkStrokeStyle : defaultCheckboxOption.strokeStyle}" stroke-width="${lineWidth}"/>
  ${checked ? `<path d="M ${left + 2} ${top + boxHeight / 2} L ${left + boxWidth / 2} ${top + boxHeight - 3} L ${left + boxWidth - 2} ${top + 3}" fill="none" stroke="${defaultCheckboxOption.checkMarkColor}" stroke-width="${lineWidth * 2}" stroke-linecap="round" stroke-linejoin="round"/>` : ''}
</svg>`.trim()
    : `
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height + lineWidth * 2}" viewBox="0 0 ${width} ${height + lineWidth * 2}">
  <circle cx="${left + boxWidth / 2}" cy="${top + boxHeight / 2}" r="${boxWidth / 2}" fill="none" stroke="${checked ? defaultRadioOption.fillStyle : defaultRadioOption.strokeStyle}" stroke-width="${lineWidth}"/>
  ${checked ? `<circle cx="${left + boxWidth / 2}" cy="${top + boxHeight / 2}" r="${boxWidth / 3}" fill="${defaultRadioOption.fillStyle}"/>` : ''}
</svg>`.trim()

  page.rasterBlocks.push({
    pageNo: page.pageNo,
    stage,
    x,
    y: baselineY - height,
    width,
    height: height + lineWidth * 2,
    dataUrl: createCoreControlSvgDataUrl(svg),
    sourceType: isCheckbox ? 'checkbox-control' : 'radio-control',
    debugLabel: isCheckbox ? 'core-checkbox' : 'core-radio',
    layer: 'content'
  })

  return true
}

function getCoreListMarkerText(element: IRowElement, row: IRow) {
  const listStyle = element.listStyle ||
    (element.listType === ListType.OL ? ListStyle.DECIMAL : ListStyle.DISC)
  if (element.listType === ListType.OL) {
    return `${(row.listIndex ?? 0) + 1}.`
  }
  if (listStyle === ListStyle.CHECKBOX) {
    return ''
  }
  return unorderedCoreListMarkerMap[listStyle] || unorderedCoreListMarkerMap[
    ListStyle.DISC
  ]!
}

function getCoreListMarkerStyle(
  row: IRow,
  documentModel: IDocumentModel
) {
  const styledElement = documentModel.defaults.listInheritStyle
    ? row.elementList.find(element =>
        element.font || element.size || element.bold || element.italic
      ) || row.elementList[0]
    : null

  return {
    font: styledElement?.font || documentModel.defaults.defaultFont,
    size: styledElement?.size || documentModel.defaults.defaultSize,
    bold: styledElement?.bold,
    italic: styledElement?.italic,
    color: styledElement?.color || documentModel.defaults.defaultColor
  }
}

function appendCoreListMarker(
  page: IPageModel,
  row: IRow,
  position: IElementPosition,
  documentModel: IDocumentModel,
  stage: number
) {
  const startElement = row.elementList[0]
  if (
    !row.isList ||
    !startElement ||
    startElement.value !== ZERO ||
    startElement.listWrap ||
    !startElement.listId ||
    !startElement.listType
  ) {
    return
  }

  const tabWidth = row.elementList.reduce((width, element, index) => {
    if (index === 0) return width
    if (element.type !== ElementType.TAB) return width
    return width + (documentModel.defaults.defaultTabWidth ?? DEFAULT_TAB_WIDTH)
  }, 0)
  const x = position.coordinate.leftTop[0] - (row.offsetX || 0) + tabWidth
  const y = position.coordinate.leftTop[1] + row.ascent

  if (startElement.listStyle === ListStyle.CHECKBOX) {
    appendCoreCheckControl(
      page,
      {
        ...startElement,
        metrics: {
          ...startElement.metrics,
          width: defaultCheckboxOption.width + defaultCheckboxOption.gap * 2,
          height: defaultCheckboxOption.height
        },
        checkbox: {
          value: Boolean(startElement.checkbox?.value)
        }
      },
      x - defaultCheckboxOption.gap,
      y,
      stage
    )
    return
  }

  const text = getCoreListMarkerText(startElement, row)
  if (!text) return

  const style = getCoreListMarkerStyle(row, documentModel)
  page.textRuns.push({
    pageNo: page.pageNo,
    stage,
    text,
    x,
    y,
    width: measureText(text, style.font, style.size).width,
    height: row.height,
    ...style
  })
}

function getCorePosition(
  row: IRow,
  element: IRowElement,
  elementIndex: number,
  positionList: IElementPosition[]
) {
  const sourceIndex = coreElementSourceIndexMap.get(element) ?? elementIndex
  const position = positionList[row.startIndex + sourceIndex]
  const omittedWidth = coreRowOmittedWidthMap.get(row)?.get(sourceIndex) || 0
  if (!position || !omittedWidth) return position

  return {
    ...position,
    left: position.left - omittedWidth,
    coordinate: {
      leftTop: [
        position.coordinate.leftTop[0] - omittedWidth,
        position.coordinate.leftTop[1]
      ],
      leftBottom: [
        position.coordinate.leftBottom[0] - omittedWidth,
        position.coordinate.leftBottom[1]
      ],
      rightTop: [
        position.coordinate.rightTop[0] - omittedWidth,
        position.coordinate.rightTop[1]
      ],
      rightBottom: [
        position.coordinate.rightBottom[0] - omittedWidth,
        position.coordinate.rightBottom[1]
      ]
    }
  }
}

function canRasterizeCoreRowTextElement(element: IRowElement) {
  if (element.controlId || element.control?.border) {
    return false
  }
  return ![
    ElementType.IMAGE,
    ElementType.TABLE,
    ElementType.HYPERLINK,
    ElementType.SEPARATOR,
    ElementType.PAGE_BREAK,
    ElementType.CONTROL,
    ElementType.AREA,
    ElementType.CHECKBOX,
    ElementType.RADIO,
    ElementType.LATEX,
    ElementType.TAB,
    ElementType.BLOCK,
    ElementType.LABEL
  ].includes(element.type!)
}

async function appendCoreRowTextRasterFallback(
  page: IPageModel,
  row: IRow,
  positionList: IElementPosition[],
  documentModel: IDocumentModel,
  stage: number
) {
  const placementList: IStyledTextPlacementLine['placementList'] = []
  const elementSet = new Set<IRowElement>()
  for (let index = 0; index < row.elementList.length; index++) {
    const element = row.elementList[index]
    if (!canRasterizeCoreRowTextElement(element)) continue
    const position = getCorePosition(row, element, index, positionList)
    if (!position) continue
    const placement = createCoreTextPlacement(
      element,
      row,
      position,
      documentModel
    )
    if (!placement) continue
    placementList.push(placement)
    elementSet.add(element)
  }

  if (
    !placementList.some(
      placement => Math.abs(placement.baselineShift || 0) > 0.001
    )
  ) {
    return new Set<IRowElement>()
  }

  const block: IDocumentBlockNode = {
    kind: 'paragraph',
    element: row.elementList[0]
  }
  if (!shouldRasterizeContentTextLine(block, placementList, stage)) {
    return new Set<IRowElement>()
  }

  const fallbackApplied = await appendPlacementTextRasterFallback(
    page,
    block,
    placementList,
    0,
    0,
    stage,
    documentModel,
    true
  )

  return fallbackApplied ? elementSet : new Set<IRowElement>()
}

async function appendCoreRowElement(
  page: IPageModel,
  row: IRow,
  element: IRowElement,
  position: IElementPosition,
  documentModel: IDocumentModel,
  imageNumberMap: Map<IElementPosition['metrics'], number>,
  stage: number
) {
  if (element.hide || element.control?.hide || element.area?.hide) {
    return
  }

  const block = createCoreElementBlock(element)
  const x = position.coordinate.leftTop[0]
  const y = position.coordinate.leftTop[1]
  const renderY = y + position.ascent
  const width = element.metrics.width
  const height = element.metrics.height || row.height

  if (isCoreCheckControl(element) || isCoreRadioControl(element)) {
    appendCoreCheckControl(page, element, x, renderY, stage)
    return
  }

  if (element.type === ElementType.TABLE) {
    let tableY = y
    for (const tableRow of layoutTable(block)) {
      // eslint-disable-next-line no-await-in-loop
      await appendTableRow(
        page,
        block,
        tableRow.rowIndex,
        x,
        tableY,
        width,
        documentModel,
        stage
      )
      tableY += tableRow.height
    }
    return
  }

  if (
    element.type === ElementType.IMAGE ||
    element.type === ElementType.LATEX ||
    element.type === ElementType.BLOCK
  ) {
    await appendImageOrFallback(
      page,
      block,
      x,
      renderY,
      width,
      height,
      stage
    )
    if (element.type === ElementType.IMAGE) {
      const captionPlacement = createImageCaptionPlacement(
        block,
        x,
        renderY,
        width,
        height,
        documentModel,
        imageNumberMap.get(element.metrics)
      )
      if (captionPlacement) {
        page.textRuns.push({
          pageNo: page.pageNo,
          stage,
          ...captionPlacement
        })
      }
    }
    return
  }

  if (element.type === ElementType.LABEL) {
    const label = createLabelPlacement({
      element,
      x,
      y,
      fallbackFont: documentModel.defaults.defaultFont,
      fallbackSize: documentModel.defaults.defaultSize,
      fallbackColor: documentModel.defaults.labelDefaultColor,
      fallbackBackgroundColor:
        documentModel.defaults.labelDefaultBackgroundColor,
      fallbackPadding: documentModel.defaults.labelDefaultPadding,
      measureWidth: createMeasureWidth(
        element.font || documentModel.defaults.defaultFont,
        element.size || documentModel.defaults.defaultSize
      )
    })
    page.highlightRects.push({
      pageNo: page.pageNo,
      stage,
      ...label.backgroundRect
    })
    appendPlacementTextRuns(page, block, [label.textPlacement], 0, 0, stage)
    return
  }

  if (element.type === ElementType.SEPARATOR) {
    const lineWidth = element.lineWidth || 1
    page.vectorLines.push({
      pageNo: page.pageNo,
      stage,
      ...createSeparatorVectorLine({
        element: {
          ...element,
          width: element.width || width
        },
        x,
        y: y + row.height / 2,
        baseY: y + (row.height - lineWidth) / 2
      })
    })
    return
  }

  const textPlacement = createCoreTextPlacement(
    element,
    row,
    position,
    documentModel
  )
  if (textPlacement) {
    appendPlacementTextRuns(page, block, [textPlacement], 0, 0, stage)
    return
  }

  const underlinePlacement = createCoreEmptyUnderlinePlacement(
    element,
    row,
    position,
    documentModel
  )
  if (underlinePlacement) {
    createTextDecorationLines([underlinePlacement]).forEach(line => {
      page.vectorLines.push({
        pageNo: page.pageNo,
        stage,
        ...line
      })
    })
  }
}

async function appendCoreRowList(
  page: IPageModel,
  rowList: IRow[],
  positionList: IElementPosition[],
  documentModel: IDocumentModel,
  imageNumberMap: Map<IElementPosition['metrics'], number>,
  stage: number,
  lineNumberBaselineList?: number[]
) {
  for (const row of rowList) {
    if (!row.elementList.length) continue

    let hasLineNumberBaseline = false
    const startPosition = getCorePosition(
      row,
      row.elementList[0],
      0,
      positionList
    )
    if (startPosition) {
      appendCoreListMarker(page, row, startPosition, documentModel, stage)
    }
    // eslint-disable-next-line no-await-in-loop
    const rasterTextElementSet = await appendCoreRowTextRasterFallback(
      page,
      row,
      positionList,
      documentModel,
      stage
    )
    for (let index = 0; index < row.elementList.length; index++) {
      const position = getCorePosition(
        row,
        row.elementList[index],
        index,
        positionList
      )
      if (!position) continue
      if (
        lineNumberBaselineList &&
        !hasLineNumberBaseline &&
        (
          getCoreElementText(row.elementList[index]) ||
          hasExportableCoreControlVisual(row.elementList[index])
        )
      ) {
        lineNumberBaselineList.push(
          position.coordinate.leftTop[1] + position.ascent
        )
        hasLineNumberBaseline = true
      }
      if (rasterTextElementSet.has(row.elementList[index])) {
        continue
      }
      // eslint-disable-next-line no-await-in-loop
      await appendCoreRowElement(
        page,
        row,
        row.elementList[index],
        position,
        documentModel,
        imageNumberMap,
        stage
      )
    }
  }
}

function createCoreImageNumberMap(documentModel: IDocumentModel) {
  const imageNumberMap = new Map<IElementPosition['metrics'], number>()
  let imageNo = 1
  documentModel.coreLayout?.pageRowList.forEach(rowList => {
    rowList.forEach(row => {
      row.elementList.forEach(element => {
        if (element.type !== ElementType.IMAGE) {
          return
        }
        imageNumberMap.set(element.metrics, imageNo)
        imageNo += 1
      })
    })
  })
  return imageNumberMap
}

async function createCoreLayoutPages(
  documentModel: IDocumentModel,
  pageCount: number
) {
  const frame = layoutFrame(documentModel)
  const core = documentModel.coreLayout!
  const headerDisabled = documentModel.defaults.header?.disabled ?? false
  const footerDisabled = documentModel.defaults.footer?.disabled ?? false
  const lineNumberDisabled =
    documentModel.defaults.lineNumber?.disabled ?? true
  const backgroundImageSize =
    documentModel.defaults.backgroundImage
      ? await resolveImageSize(documentModel.defaults.backgroundImage)
      : null
  const imageNumberMap = createCoreImageNumberMap(documentModel)
  const pageList: IPageModel[] = []
  let continuityLineNo = 1

  for (let pageNo = 0; pageNo < pageCount; pageNo++) {
    const page = createPage(pageNo, documentModel)
    await appendFrameDecorations(
      page,
      documentModel,
      pageCount,
      frame,
      backgroundImageSize
    )
    if (!headerDisabled) {
      await appendCoreRowList(
        page,
        filterCoreRowList(core.headerRowList),
        core.headerPositionList,
        documentModel,
        imageNumberMap,
        PDF_RENDER_STAGE.HEADER
      )
    }
    if (!footerDisabled) {
      await appendCoreRowList(
        page,
        filterCoreRowList(core.footerRowList),
        core.footerPositionList,
        documentModel,
        imageNumberMap,
        PDF_RENDER_STAGE.FOOTER
      )
    }

    const lineNumberBaselineList: number[] = []
    await appendCoreRowList(
      page,
      filterCoreRowList(core.pageRowList[pageNo] || []),
      core.positionList,
      documentModel,
      imageNumberMap,
      PDF_RENDER_STAGE.CONTENT,
      lineNumberBaselineList
    )

    if (!lineNumberDisabled && lineNumberBaselineList.length) {
      createLineNumberPlacements({
        baselineYList: lineNumberBaselineList,
        margins: documentModel.margins,
        right: documentModel.defaults.lineNumber.right,
        font: documentModel.defaults.lineNumber.font,
        size: documentModel.defaults.lineNumber.size,
        color: documentModel.defaults.lineNumber.color,
        type: documentModel.defaults.lineNumber.type,
        startLineNo: continuityLineNo,
        measureWidth: createMeasureWidth(
          documentModel.defaults.lineNumber.font,
          documentModel.defaults.lineNumber.size
        )
      }).forEach(placement => {
        page.textRuns.push({
          pageNo: page.pageNo,
          stage: PDF_RENDER_STAGE.LINE_NUMBER,
          ...placement
        })
      })
      if (
        documentModel.defaults.lineNumber.type ===
        LineNumberType.CONTINUITY
      ) {
        continuityLineNo += lineNumberBaselineList.length
      }
    }

    if (core.iframeInfoList?.[pageNo]?.length) {
      page.issues.push('pending:block-iframe')
    }
    appendGraffiti(page, documentModel)
    if (
      !page.textRuns.length &&
      !page.highlightRects.length &&
      !page.vectorLines.length &&
      !page.rasterBlocks.length &&
      !hasCoreLayoutContent(documentModel, pageNo)
    ) {
      page.issues.push('layout:empty-page')
    }
    pageList.push(page)
  }

  return pageList
}

export async function layoutDocument(
  documentModel: IDocumentModel
): Promise<IPageModel[]> {
  const resolved = resolveDocumentZoneHeights(documentModel)
  const resolvedDocumentModel = resolved.documentModel
  if (!hasRequiredCoreLayout(resolvedDocumentModel)) {
    throw new Error('PDF export requires core print layout snapshot')
  }

  return createCoreLayoutPages(
    resolvedDocumentModel,
    resolveCorePageCount(resolvedDocumentModel)
  )
}

export function collectLayoutDebugSummary(documentModel: IDocumentModel) {
  [
    collectAreaDecorationSegment,
    appendAreaDecorations,
    appendBadges,
    appendFloatingImages,
    getRequiredPageCount,
    resolveMainPlacementLineNumberBaseline,
    appendPlacement,
    appendStaticZone
  ].forEach(() => undefined)
  const resolved = resolveDocumentZoneHeights(documentModel)
  const contentWidth = resolved.contentWidth
  const resolvedDocumentModel = resolved.documentModel
  if (hasRequiredCoreLayout(resolvedDocumentModel)) {
    const pageCount = resolveCorePageCount(resolvedDocumentModel)
    return {
      placementCount: 0,
      blockSummaryList: [],
      pagePlacementSummary: Array.from({ length: pageCount }, (_, pageNo) => ({
        pageNo,
        placementCount: 0,
        consumedHeight: 0,
        cursorYEnd: 0,
        blockIndexList: [],
        placementSummaryList: [],
        blockList: [],
        isCoreLayoutPage: true,
        rowCount: resolvedDocumentModel.coreLayout?.pageRowList[pageNo]?.length || 0
      }))
    }
  }
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
