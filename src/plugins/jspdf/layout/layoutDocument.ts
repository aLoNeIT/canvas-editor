import { rasterizeElement } from '../fallback/rasterizeElement'
import { resolveFallback } from '../fallback/resolveFallback'
import type { IDocumentBlockNode, IDocumentModel } from '../model/document'
import type { IPageModel } from '../model/layout'
import { measureText } from '../measure/textMeasure'
import { BlockType } from '../../../editor/dataset/enum/Block'
import { ElementType } from '../../../editor/dataset/enum/Element'
import { LineNumberType } from '../../../editor/dataset/enum/LineNumber'
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
  createWatermarkPlacement,
  createWatermarkPlacements
} from './framePlacement'
import { getBlockHeight } from './layoutBlock'
import { layoutFrame } from './layoutFrame'
import { layoutInline } from './layoutInline'
import { createLabelPlacement } from './labelPlacement'
import { resolveImageSize } from './imageSize'
import { createSeparatorVectorLine } from './separatorPlacement'
import { getTableColumnWidthList, layoutTable } from './layoutTable'
import { paginateHeights } from './paginate'
import { createTableCellTextPlacements } from './tableCellPlacement'
import { createTextDecorationLines } from './textDecoration'
import { paginateTableRows } from './tablePagination'
import { resolveTableRowHeightList } from './tableMetrics'
import { createTableCellVisuals } from './tableVisual'
import type { IStyledTextPlacementLine } from './styledTextRunPlacement'

interface ITableRowPlacement {
  kind: 'table-row'
  block: IDocumentBlockNode
  height: number
  rowIndex: number
}

interface IBlockPlacement {
  kind: 'block'
  block: IDocumentBlockNode
  height: number
  defaults: IDocumentModel['defaults']
}

interface ITextLinePlacement {
  kind: 'text-line'
  block: IDocumentBlockNode
  line: IStyledTextPlacementLine
  lineIndex: number
  height: number
  textStyle: IResolvedBlockTextStyle
  listSemantic: IListBlockSemantics
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

function getTextLineHeight(size: number) {
  return Math.max(24, size + 8)
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

function appendFrameDecorations(
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
        ...backgroundImagePlacement
      })
    })
  } else {
    page.highlightRects.push({
      pageNo: page.pageNo,
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
        ...imageWatermarkPlacement
      })
    })
  } else {
    const watermarkPlacements = documentModel.defaults.watermark.repeat
      ? createWatermarkPlacements({
          pageNo: page.pageNo,
          pageCount,
          pageWidth: page.width,
          pageHeight: page.height,
          data: documentModel.defaults.watermark.data,
          numberType: documentModel.defaults.watermark.numberType,
          font: documentModel.defaults.watermark.font,
          size: documentModel.defaults.watermark.size,
          color: documentModel.defaults.watermark.color,
          opacity: documentModel.defaults.watermark.opacity,
          repeat: documentModel.defaults.watermark.repeat,
          gap: [
            documentModel.defaults.watermark.gap[0],
            documentModel.defaults.watermark.gap[1]
          ],
          measureWidth: createMeasureWidth(
            documentModel.defaults.watermark.font,
            documentModel.defaults.watermark.size
          )
        })
      : []
    const watermarkPlacement =
      !watermarkPlacements.length
        ? createWatermarkPlacement({
            pageNo: page.pageNo,
            pageCount,
            pageWidth: page.width,
            pageHeight: page.height,
            data: documentModel.defaults.watermark.data,
            numberType: documentModel.defaults.watermark.numberType,
            font: documentModel.defaults.watermark.font,
            size: documentModel.defaults.watermark.size,
            color: documentModel.defaults.watermark.color,
            opacity: documentModel.defaults.watermark.opacity,
            measureWidth: createMeasureWidth(
              documentModel.defaults.watermark.font,
              documentModel.defaults.watermark.size
            )
          })
        : null
    watermarkPlacements.forEach(placement => {
      page.textRuns.push({
        pageNo: page.pageNo,
        ...placement
      })
    })
    if (watermarkPlacement) {
      page.textRuns.push({
        pageNo: page.pageNo,
        ...watermarkPlacement
      })
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
    const height = frame.footerTop - y + paddingBottom * scale

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

function collectAreaDecorationSegment(
  areaSegmentMap: Map<string, IAreaDecorationSegment>,
  placement: IMainPlacement,
  top: number
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
  const bottom = top + placement.height
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
          ...line
        })
      })
    }
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
  documentModel: IDocumentModel
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
  width: number
) {
  const rowList = layoutTable(block)
  const columnWidthList = getTableColumnWidthList(block, width)
  return resolveTableRowHeightList({
    rowList,
    columnWidthList,
    measureWidth: (value, style) =>
      measureText(
        value,
        style?.font || 'Song',
        style?.size || 12,
        style?.bold,
        style?.italic
      ).width,
    lineHeight: getTextLineHeight(12)
  })
}

function getBlockLayoutHeight(
  block: IDocumentBlockNode,
  width: number,
  documentModel: IDocumentModel
) {
  if (block.kind === 'table') {
    const rows = layoutTable(block)
    if (!rows.length) return 24
    return getResolvedTableRowHeightList(block, width)
      .reduce((sum, rowHeight) => sum + rowHeight, 0)
  }

  if (block.kind === 'image') {
    return block.element.height || block.height || 120
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
    const rowMargin = resolveBlockTextStyle(
      block.element,
      documentModel.defaults
    ).rowMargin
    return rowMargin * 2 + (block.element.lineWidth || 1)
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
    const rowHeightList = getResolvedTableRowHeightList(block, width)
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
  y: number
) {
  if (!placementList.length) return

  createTextDecorationLines(placementList).forEach(line => {
    page.vectorLines.push({
      pageNo: page.pageNo,
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
      text: line.text,
      x: x + line.x,
      y: y + line.y,
      width: Math.min(measured.width, line.width),
      height: measured.ascent + measured.descent,
      font: line.font,
      size: line.size,
      bold: line.bold,
      italic: line.italic,
      color: line.color
    })

    if (block.element.highlight) {
      page.highlightRects.push({
        pageNo: page.pageNo,
        x: x + line.x,
        y: y + line.y - measured.ascent,
        width: Math.min(measured.width, line.width),
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
        x: x + line.x,
        y: y + line.y - line.baselineOffset,
        width: line.width,
        height: line.height,
        url: block.element.url!
      })
    })
  }
}

function appendResolvedTextLine(
  page: IPageModel,
  block: IDocumentBlockNode,
  line: IStyledTextPlacementLine,
  textStyle: IResolvedBlockTextStyle,
  listSemantic: IListBlockSemantics,
  x: number,
  y: number,
  lineIndex: number
) {
  const lineY = y + textStyle.rowMargin
  if (lineIndex === 0) {
    const markerPlacement = createListMarkerPlacement({
      semantic: listSemantic,
      x: 0,
      y: 0,
      height: line.height,
      baselineOffset: line.baselineOffset
    })
    if (markerPlacement) {
      appendPlacementTextRuns(page, block, [markerPlacement], x, lineY)
    }
  }
  appendPlacementTextRuns(page, block, line.placementList, x, lineY)
}

function appendTableRow(
  page: IPageModel,
  block: IDocumentBlockNode,
  rowIndex: number,
  x: number,
  y: number,
  width: number
) {
  const rowList = layoutTable(block)
  const row = rowList[rowIndex]
  if (!row) return

  const columnCount = getTableColumnCount(block)
  const columnWidthList = getTableColumnWidthList(block, width)
  const rowHeightList = getResolvedTableRowHeightList(block, width)
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
        ...line
      })
    })

    const cellLineList = createTableCellTextPlacements({
      td,
      x: cellX,
      y,
      cellWidth,
      rowHeight: cellHeight,
      font: 'Song',
      size: 12,
      lineHeight: getTextLineHeight(12),
      color: '#000000',
      measureWidth: (value, style) =>
        measureText(
          value,
          style?.font || 'Song',
          style?.size || 12,
          style?.bold,
          style?.italic
        ).width
    })

    createTextDecorationLines(cellLineList).forEach(line => {
      page.vectorLines.push({
        pageNo: page.pageNo,
        ...line
      })
    })

    cellLineList.forEach(line => {
      page.textRuns.push({
        pageNo: page.pageNo,
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
  width: number
) {
  const rowList = layoutTable(block)
  const row = rowList[rowIndex]
  if (!row) return null

  const columnWidthList = getTableColumnWidthList(block, width)
  const rowHeightList = getResolvedTableRowHeightList(block, width)
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
      font: 'Song',
      size: 12,
      lineHeight: getTextLineHeight(12),
      color: '#000000',
      measureWidth: (value, style) =>
        measureText(
          value,
          style?.font || 'Song',
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
  width: number
) {
  if (placement.kind === 'text-line') {
    return y + placement.textStyle.rowMargin + placement.line.baselineOffset
  }

  if (placement.kind === 'table-row') {
    return getTableRowBaseline(placement.block, placement.rowIndex, x, y, width)
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
  height: number
) {
  const pendingIssue =
    block.kind === 'latex'
      ? 'pending:latex'
      : block.kind === 'block' &&
          block.element.block?.type === BlockType.IFRAME
        ? 'pending:block-iframe'
        : block.kind === 'block' &&
            block.element.block?.type === BlockType.VIDEO
          ? 'pending:block-video'
          : null
  if (pendingIssue && !page.issues.includes(pendingIssue)) {
    page.issues.push(pendingIssue)
  }

  const value = block.element.value || ''
  const isImageSource = /^(data:image\/|https?:\/\/|blob:)/.test(value)

  if (block.kind === 'image' && isImageSource) {
    page.rasterBlocks.push({
      pageNo: page.pageNo,
      x,
      y,
      width: block.element.width || width,
      height: block.element.height || height,
      dataUrl: value,
      sourceType: 'image'
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
  width: number
) {
  if (placement.kind === 'table-row') {
    appendTableRow(page, placement.block, placement.rowIndex, x, y, width)
    return
  }

  if (placement.kind === 'text-line') {
    appendResolvedTextLine(
      page,
      placement.block,
      placement.line,
      placement.textStyle,
      placement.listSemantic,
      x,
      y,
      placement.lineIndex
    )
    return
  }

  if (placement.block.kind === 'table') {
    appendTableRow(page, placement.block, 0, x, y, width)
    return
  }

  if (placement.block.element.type === ElementType.SEPARATOR) {
    page.vectorLines.push({
      pageNo: page.pageNo,
      ...createSeparatorVectorLine({
        element: {
          ...placement.block.element,
          width: placement.block.element.width || width
        },
        x,
        y: y + placement.height / 2
      })
    })
    return
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
    return
  }

  if (placement.block.kind === 'image') {
    await appendImageOrFallback(
      page,
      placement.block,
      x,
      y,
      Math.min(width, placement.block.element.width || width),
      placement.block.element.height || placement.height
    )
    return
  }

  if (placement.block.kind === 'control') {
    await appendImageOrFallback(page, placement.block, x, y, width, placement.height)
    return
  }

  await appendImageOrFallback(page, placement.block, x, y, width, placement.height)
}

async function appendStaticZone(
  page: IPageModel,
  documentModel: IDocumentModel,
  blockList: IDocumentBlockNode[],
  x: number,
  startY: number,
  width: number
) {
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
          ...label.backgroundRect
        })
        appendPlacementTextRuns(page, block, [label.textPlacement], 0, 0)
        cursorY += label.height
        continue
      }

      if (block.element.type === ElementType.SEPARATOR) {
        const rowMargin = resolveBlockTextStyle(
          block.element,
          documentModel.defaults
        ).rowMargin
        page.vectorLines.push({
          pageNo: page.pageNo,
          ...createSeparatorVectorLine({
            element: {
              ...block.element,
              width: block.element.width || width
            },
            x,
            y: cursorY + rowMargin + (block.element.lineWidth || 1) / 2
          })
        })
        cursorY += rowMargin * 2 + (block.element.lineWidth || 1)
        continue
      }

      const resolved = createResolvedTextLayout(
        block,
        width,
        documentModel,
        listSemanticMap.get(block)
      )
      resolved.lineList.forEach((line, lineIndex) => {
        appendResolvedTextLine(
          page,
          block,
          line,
          resolved.textStyle,
          resolved.listSemantic,
          x,
          cursorY,
          lineIndex
        )
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
      })
      if (!resolved.lineList.length) {
        if (block.kind === 'control') {
          // eslint-disable-next-line no-await-in-loop
          await appendImageOrFallback(
            page,
            block,
            x,
            cursorY,
            width,
            resolved.height
          )
        }
        cursorY += resolved.height
      }
      continue
    }

    if (block.kind === 'table') {
      const rowList = layoutTable(block)
      const rowHeightList = getResolvedTableRowHeightList(block, width)
      rowList.forEach(row => {
        appendTableRow(page, block, row.rowIndex, x, cursorY, width)
        cursorY += rowHeightList[row.rowIndex] || 24
      })
      continue
    }

    if (block.kind === 'image') {
      page.rasterBlocks.push({
        pageNo: page.pageNo,
        x,
        y: cursorY,
        width: Math.min(width, block.element.width || width),
        height: block.element.height || 120,
        dataUrl: block.element.value || '',
        sourceType: 'image'
      })
      cursorY += block.element.height || 120
      continue
    }

    cursorY += getBlockLayoutHeight(block, width, documentModel)
  }

  appendControlBorders(page, controlBorderSegmentMap, documentModel)
}

export async function layoutDocument(
  documentModel: IDocumentModel
): Promise<IPageModel[]> {
  const frame = layoutFrame(documentModel)
  const contentWidth =
    documentModel.width - documentModel.margins[1] - documentModel.margins[3]
  const mainPageHeight = Math.max(1, frame.mainBottom - frame.mainTop)
  const placements = collectMainPlacements(
    documentModel.main.blockList,
    contentWidth,
    mainPageHeight,
    documentModel
  )
  const placementIndexes = paginateHeights(
    placements.map(placement => placement.height),
    mainPageHeight
  )

  const pageCount = Math.max(1, placementIndexes.length)
  const pageList: IPageModel[] = []
  const backgroundImageSize =
    documentModel.defaults.backgroundImage
      ? await resolveImageSize(documentModel.defaults.backgroundImage)
      : null
  let continuityLineNo = 1

  for (let pageNo = 0; pageNo < pageCount; pageNo++) {
    const page = createPage(pageNo, documentModel)
    appendFrameDecorations(
      page,
      documentModel,
      pageCount,
      frame,
      backgroundImageSize
    )
    await appendStaticZone(
      page,
      documentModel,
      documentModel.header.blockList,
      documentModel.margins[3],
      frame.headerTop,
      contentWidth
    )
    await appendStaticZone(
      page,
      documentModel,
      documentModel.footer.blockList,
      documentModel.margins[3],
      frame.footerTop,
      contentWidth
    )

    let cursorY = frame.mainTop
    const lineNumberBaselineList: number[] = []
    const areaSegmentMap = new Map<string, IAreaDecorationSegment>()
    const controlBorderSegmentMap = new Map<IDocumentBlockNode, IControlBorderSegment>()
    const indexes = placementIndexes[pageNo] || []
    for (const index of indexes) {
      const placement = placements[index]
      if (!placement) continue
      // eslint-disable-next-line no-await-in-loop
      await appendPlacement(
        page,
        placement,
        documentModel.margins[3],
        cursorY,
        contentWidth
      )
      collectAreaDecorationSegment(areaSegmentMap, placement, cursorY)
      collectControlBorderSegment(
        controlBorderSegmentMap,
        placement,
        documentModel.margins[3],
        cursorY
      )
      const baselineY = resolveMainPlacementLineNumberBaseline(
        placement,
        documentModel.margins[3],
        cursorY,
        contentWidth
      )
      if (typeof baselineY === 'number') {
        lineNumberBaselineList.push(baselineY)
      }
      cursorY += placement.height
    }

    appendAreaDecorations(
      page,
      areaSegmentMap,
      documentModel.margins[3],
      contentWidth
    )
    appendControlBorders(page, controlBorderSegmentMap, documentModel)
    appendGraffiti(page, documentModel)

    if (
      !documentModel.defaults.lineNumber.disabled &&
      lineNumberBaselineList.length
    ) {
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
          ...placement
        })
      })
      if (documentModel.defaults.lineNumber.type === LineNumberType.CONTINUITY) {
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
