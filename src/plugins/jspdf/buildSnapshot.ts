import type { IElement } from '../../editor'
import type { IPdfExportSnapshot } from '../../editor'
import { ElementType, TableBorder, TdBorder, TdSlash, TextDecorationStyle } from '../../editor'
import type { IElementPosition } from '../../editor/interface/Element'
import type { IRow } from '../../editor/interface/Row'
import type { ITd } from '../../editor/interface/table/Td'
import type {
  IPdfPageModel,
  IPdfRasterBlock,
  IPdfVectorLine,
  IRasterizeElementOption
} from './types'

const DEFAULT_TABLE_BORDER_COLOR = '#000000'
type IRenderedRowElement = IRow['elementList'][number]

function getElementLeft(element: IRenderedRowElement | IElement) {
  return 'left' in element ? element.left || 0 : 0
}

function getElementRowMargin(snapshot: IPdfExportSnapshot, element: IElement) {
  const {
    defaultBasicRowMarginHeight,
    defaultRowMargin,
    defaultSize,
    scale
  } = snapshot.styleOptions
  const fontSize = element.size || defaultSize
  let ratio = 1
  if (fontSize < 12) {
    ratio = fontSize / 12
  } else if (fontSize > 30) {
    ratio = 1 + (fontSize - 30) / 30
  }
  return (
    defaultBasicRowMarginHeight *
    ratio *
    (element.rowMargin ?? defaultRowMargin) *
    scale
  )
}

function getUnderlineY(y: number, rowHeight: number, rowMargin: number) {
  return y + rowHeight - rowMargin
}

function getStrikeoutY(
  y: number,
  height: number,
  descent: number,
  scale: number
) {
  return y + descent * scale - height / 2
}

function getDashPattern(style?: TextDecorationStyle) {
  switch (style) {
    case TextDecorationStyle.DASHED:
      return [3, 1]
    case TextDecorationStyle.DOTTED:
      return [1, 1]
    default:
      return undefined
  }
}

function createWavyLines(
  pageNo: number,
  x: number,
  y: number,
  width: number,
  color: string,
  scale: number
) {
  const amplitude = 1.2 * scale
  const frequency = 1 / scale
  const adjustY = y + 2 * amplitude
  const waveLines = []

  for (let offset = 0; offset < width; offset++) {
    const nextOffset = Math.min(offset + 1, width)
    const y1 = adjustY + amplitude * Math.sin(frequency * offset)
    const y2 = adjustY + amplitude * Math.sin(frequency * nextOffset)
    waveLines.push({
      pageNo,
      x1: x + offset,
      y1,
      x2: x + nextOffset,
      y2,
      color,
      width: scale
    })
  }

  return waveLines
}

function createVectorLines(
  pageNo: number,
  element: IElement,
  style: IPdfExportSnapshot['styleOptions'],
  x: number,
  y: number,
  width: number,
  height: number,
  descent: number,
  rowHeight: number,
  rowMargin: number,
  underlineColor: string,
  strikeoutColor: string
) {
  const vectorLines = []
  const decorationStyle = element.textDecoration?.style
  const dash = getDashPattern(decorationStyle)

  if (element.underline) {
    const lineY = getUnderlineY(y - height, rowHeight, rowMargin)
    if (decorationStyle === TextDecorationStyle.WAVY) {
      vectorLines.push(
        ...createWavyLines(pageNo, x, lineY, width, underlineColor, style.scale)
      )
    } else {
      vectorLines.push({
        pageNo,
        x1: x,
        y1: lineY,
        x2: x + width,
        y2: lineY,
        color: underlineColor,
        width: style.scale,
        dash
      })
      if (decorationStyle === TextDecorationStyle.DOUBLE) {
        const spacing = 3 * style.scale
        vectorLines.push({
          pageNo,
          x1: x,
          y1: lineY + spacing,
          x2: x + width,
          y2: lineY + spacing,
          color: underlineColor,
          width: style.scale
        })
      }
    }
  }

  if (element.strikeout) {
    const lineY = getStrikeoutY(y, height, descent, style.scale)
    vectorLines.push({
      pageNo,
      x1: x,
      y1: lineY,
      x2: x + width,
      y2: lineY,
      color: strikeoutColor,
      width: style.scale
    })
  }

  return vectorLines
}

function findPagePosition(
  page: IPdfExportSnapshot['pageList'][number],
  index: number
) {
  return page.positionList.find(item => item.index === index)
}

function createRasterBlock(option: IRasterizeElementOption): IPdfRasterBlock {
  return {
    pageNo: option.pageNo,
    x: option.x,
    y: option.y,
    width: option.width,
    height: option.height,
    dataUrl: option.dataUrl,
    sourceType: option.sourceType,
    debugLabel: option.debugLabel
  }
}

function createElementRasterBlock(
  pageNo: number,
  element: IElement,
  position: IElementPosition
): IPdfRasterBlock | null {
  if (!element.width || !element.height) return null
  const x = position.coordinate.leftTop[0]
  const y = position.coordinate.leftTop[1]
  const width = element.width
  const height = element.height

  if (element.type === ElementType.IMAGE && element.value) {
    return createRasterBlock({
      pageNo,
      x,
      y,
      width,
      height,
      dataUrl: element.value,
      sourceType: 'image',
      debugLabel: `image:${element.id || element.conceptId || 'anonymous'}`
    })
  }

  if (element.type === ElementType.LATEX && element.laTexSVG) {
    return createRasterBlock({
      pageNo,
      x,
      y,
      width,
      height,
      dataUrl: element.laTexSVG,
      sourceType: 'latex',
      debugLabel: `latex:${element.id || element.conceptId || 'anonymous'}`
    })
  }

  return null
}

function getMissingRasterIssue(element: IElement) {
  switch (element.type) {
    case ElementType.IMAGE:
      return 'Image fallback is missing a usable source'
    case ElementType.LATEX:
      return 'LaTeX fallback is missing a usable SVG source'
    case ElementType.BLOCK:
      return 'Block element has no localized raster fallback source'
    case ElementType.CHECKBOX:
    case ElementType.RADIO:
    case ElementType.CONTROL:
      return `Control element is not yet mapped to PDF vectors: ${element.type}`
    default:
      return `Unsupported element fallback is not implemented: ${element.type}`
  }
}

function appendElementTextRun(
  target: Pick<
    IPdfPageModel,
    'textRuns' | 'highlightRects' | 'links' | 'vectorLines'
  >,
  snapshot: IPdfExportSnapshot,
  pageNo: number,
  element: IRenderedRowElement | IElement,
  position: IElementPosition,
  rowHeight: number
) {
  if (!element.value) return
  target.textRuns.push({
    pageNo,
    text: element.value,
    x: position.coordinate.leftTop[0],
    y: position.coordinate.leftTop[1] + position.ascent,
    width: position.metrics.width,
    height: position.metrics.height,
    font: element.font || 'Song',
    size: element.size || snapshot.styleOptions.defaultSize,
    bold: element.bold,
    italic: element.italic,
    color: element.color
  })

  const highlight = element.highlight
  if (highlight) {
    const rowMargin = getElementRowMargin(snapshot, element)
    const left = getElementLeft(element)
    target.highlightRects.push({
      pageNo,
      x: position.coordinate.leftTop[0] - left,
      y:
        position.coordinate.leftTop[1] +
        rowMargin -
        snapshot.styleOptions.highlightMarginHeight,
      width: position.metrics.width + left,
      height:
        rowHeight -
        2 * rowMargin +
        2 * snapshot.styleOptions.highlightMarginHeight,
      color: highlight,
      opacity: snapshot.styleOptions.highlightAlpha
    })
  }

  if (element.url) {
    target.links.push({
      pageNo,
      x: position.coordinate.leftTop[0],
      y: position.coordinate.leftTop[1],
      width: position.metrics.width,
      height: position.lineHeight,
      url: element.url
    })
  }

  if (element.underline || element.strikeout || element.control?.underline) {
    const rowMargin = getElementRowMargin(snapshot, element)
    const underlineColor = element.control?.underline
      ? snapshot.styleOptions.underlineColor
      : element.color || snapshot.styleOptions.underlineColor
    target.vectorLines.push(
      ...createVectorLines(
        pageNo,
        {
          ...element,
          underline: !!(element.underline || element.control?.underline)
        },
        snapshot.styleOptions,
        position.coordinate.leftTop[0] - getElementLeft(element),
        position.coordinate.leftTop[1] + position.ascent,
        position.metrics.width + getElementLeft(element),
        position.metrics.height,
        position.metrics.boundingBoxDescent,
        rowHeight,
        rowMargin,
        underlineColor,
        snapshot.styleOptions.strikeoutColor
      )
    )
  }
}

function appendTopLevelRows(
  pageModel: IPdfPageModel,
  snapshot: IPdfExportSnapshot,
  page: IPdfExportSnapshot['pageList'][number]
) {
  page.rowList.forEach(row => {
    row.elementList.forEach((el, index) => {
      const elementIndex = row.startIndex + index
      const position = findPagePosition(page, elementIndex)
      if (!position) return
      const highlight = el.highlight || snapshot.controlHighlights[elementIndex]

      if (
        el.value &&
        el.type !== ElementType.TABLE &&
        el.type !== ElementType.IMAGE &&
        el.type !== ElementType.LATEX &&
        el.type !== ElementType.BLOCK &&
        el.type !== ElementType.CHECKBOX &&
        el.type !== ElementType.RADIO &&
        el.type !== ElementType.CONTROL
      ) {
        appendElementTextRun(
          pageModel,
          snapshot,
          page.pageNo,
          highlight ? { ...el, highlight } : el,
          position,
          row.height
        )
      }

      if (el.type === ElementType.SEPARATOR) {
        pageModel.vectorLines.push({
          pageNo: page.pageNo,
          x1: position.coordinate.leftTop[0],
          y1: position.coordinate.leftTop[1],
          x2: position.coordinate.leftTop[0] + (el.width || 0),
          y2: position.coordinate.leftTop[1],
          color: el.color,
          width: el.lineWidth || 1,
          dash: el.dashArray
        })
      }

      if (
        el.type === ElementType.IMAGE ||
        el.type === ElementType.LATEX ||
        el.type === ElementType.BLOCK
      ) {
        const rasterBlock = createElementRasterBlock(page.pageNo, el, position)
        if (rasterBlock) {
          pageModel.rasterBlocks.push(rasterBlock)
        } else {
          pageModel.issues.push(getMissingRasterIssue(el))
        }
      }
    })
  })
}

function appendTableBorder(
  target: IPdfVectorLine[],
  pageNo: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  color: string,
  width: number,
  dash?: number[]
) {
  target.push({
    pageNo,
    x1,
    y1,
    x2,
    y2,
    color,
    width,
    dash
  })
}

function appendTableVectors(
  pageModel: IPdfPageModel,
  pageNo: number,
  table: IElement,
  tableX: number,
  tableY: number
) {
  const trList = table.trList
  const colgroup = table.colgroup
  if (!trList?.length || !colgroup?.length) return
  const borderType = table.borderType || TableBorder.ALL
  const borderColor = table.borderColor || DEFAULT_TABLE_BORDER_COLOR
  const borderWidth = table.borderWidth || 1
  const outerWidth = table.borderExternalWidth || borderWidth
  const dash = borderType === TableBorder.DASH ? [3, 3] : undefined
  const tableWidth = table.width || 0
  const tableHeight = table.height || 0

  if (borderType !== TableBorder.EMPTY && borderType !== TableBorder.INTERNAL) {
    appendTableBorder(
      pageModel.vectorLines,
      pageNo,
      tableX,
      tableY,
      tableX + tableWidth,
      tableY,
      borderColor,
      outerWidth,
      dash
    )
    appendTableBorder(
      pageModel.vectorLines,
      pageNo,
      tableX,
      tableY,
      tableX,
      tableY + tableHeight,
      borderColor,
      outerWidth,
      dash
    )
    if (borderType === TableBorder.EXTERNAL) {
      appendTableBorder(
        pageModel.vectorLines,
        pageNo,
        tableX + tableWidth,
        tableY,
        tableX + tableWidth,
        tableY + tableHeight,
        borderColor,
        outerWidth,
        dash
      )
      appendTableBorder(
        pageModel.vectorLines,
        pageNo,
        tableX,
        tableY + tableHeight,
        tableX + tableWidth,
        tableY + tableHeight,
        borderColor,
        outerWidth,
        dash
      )
    }
  }

  trList.forEach(tr => {
    tr.tdList.forEach(td => {
      if (td.backgroundColor && td.width && td.height && td.x != null && td.y != null) {
        pageModel.highlightRects.push({
          pageNo,
          x: tableX + td.x,
          y: tableY + td.y,
          width: td.width,
          height: td.height,
          color: td.backgroundColor,
          opacity: 1
        })
      }

      if (td.slashTypes?.includes(TdSlash.FORWARD) && td.width && td.height) {
        appendTableBorder(
          pageModel.vectorLines,
          pageNo,
          tableX + td.x!,
          tableY + td.y! + td.height,
          tableX + td.x! + td.width,
          tableY + td.y!,
          borderColor,
          borderWidth,
          dash
        )
      }

      if (td.slashTypes?.includes(TdSlash.BACK) && td.width && td.height) {
        appendTableBorder(
          pageModel.vectorLines,
          pageNo,
          tableX + td.x!,
          tableY + td.y!,
          tableX + td.x! + td.width,
          tableY + td.y! + td.height,
          borderColor,
          borderWidth,
          dash
        )
      }

      const shouldDrawInternal =
        borderType !== TableBorder.EMPTY &&
        borderType !== TableBorder.EXTERNAL
      const shouldDrawRight =
        shouldDrawInternal &&
        (borderType !== TableBorder.INTERNAL ||
          td.colIndex! + td.colspan < colgroup.length)
      const shouldDrawBottom =
        shouldDrawInternal &&
        (borderType !== TableBorder.INTERNAL ||
          td.rowIndex! + td.rowspan < trList.length)

      if (td.borderTypes?.includes(TdBorder.TOP)) {
        appendTableBorder(
          pageModel.vectorLines,
          pageNo,
          tableX + td.x!,
          tableY + td.y!,
          tableX + td.x! + td.width!,
          tableY + td.y!,
          borderColor,
          borderWidth,
          dash
        )
      }
      if (td.borderTypes?.includes(TdBorder.LEFT)) {
        appendTableBorder(
          pageModel.vectorLines,
          pageNo,
          tableX + td.x!,
          tableY + td.y!,
          tableX + td.x!,
          tableY + td.y! + td.height!,
          borderColor,
          borderWidth,
          dash
        )
      }
      if (td.borderTypes?.includes(TdBorder.RIGHT)) {
        appendTableBorder(
          pageModel.vectorLines,
          pageNo,
          tableX + td.x! + td.width!,
          tableY + td.y!,
          tableX + td.x! + td.width!,
          tableY + td.y! + td.height!,
          borderColor,
          borderWidth,
          dash
        )
      }
      if (td.borderTypes?.includes(TdBorder.BOTTOM)) {
        appendTableBorder(
          pageModel.vectorLines,
          pageNo,
          tableX + td.x!,
          tableY + td.y! + td.height!,
          tableX + td.x! + td.width!,
          tableY + td.y! + td.height!,
          borderColor,
          borderWidth,
          dash
        )
      }

      if (shouldDrawRight) {
        const rightX = tableX + td.x! + td.width!
        const width =
          td.colIndex! + td.colspan === colgroup.length ? outerWidth : borderWidth
        appendTableBorder(
          pageModel.vectorLines,
          pageNo,
          rightX,
          tableY + td.y!,
          rightX,
          tableY + td.y! + td.height!,
          borderColor,
          width,
          dash
        )
      }

      if (shouldDrawBottom) {
        const bottomY = tableY + td.y! + td.height!
        const width =
          td.rowIndex! + td.rowspan === trList.length ? outerWidth : borderWidth
        appendTableBorder(
          pageModel.vectorLines,
          pageNo,
          tableX + td.x!,
          bottomY,
          tableX + td.x! + td.width!,
          bottomY,
          borderColor,
          width,
          dash
        )
      }
    })
  })
}

function appendTableCellContent(
  pageModel: IPdfPageModel,
  snapshot: IPdfExportSnapshot,
  pageNo: number,
  td: ITd
) {
  const rowList = td.rowList || []
  const positionList = td.positionList || []
  const pagePositions = positionList.filter(position => position.pageNo === pageNo)
  const elementByIndex = new Map<number, IElement>()

  rowList.forEach(row => {
    row.elementList.forEach((element, index) => {
      elementByIndex.set(row.startIndex + index, element)
    })
  })

  pagePositions.forEach(position => {
    const element = elementByIndex.get(position.index)
    if (!element) return

    const row = rowList[position.rowIndex]
    const rowHeight = row?.height || position.lineHeight

    if (
      element.type === ElementType.IMAGE ||
      element.type === ElementType.LATEX ||
      element.type === ElementType.BLOCK
    ) {
      const rasterBlock = createElementRasterBlock(pageNo, element, position)
      if (rasterBlock) {
        pageModel.rasterBlocks.push(rasterBlock)
      } else {
        pageModel.issues.push(getMissingRasterIssue(element))
      }
      return
    }

    if (
      element.type === ElementType.CHECKBOX ||
      element.type === ElementType.RADIO ||
      element.type === ElementType.CONTROL
    ) {
      pageModel.issues.push(getMissingRasterIssue(element))
      return
    }

    if (element.type === ElementType.SEPARATOR) {
      pageModel.vectorLines.push({
        pageNo,
        x1: position.coordinate.leftTop[0],
        y1: position.coordinate.leftTop[1],
        x2: position.coordinate.leftTop[0] + (element.width || 0),
        y2: position.coordinate.leftTop[1],
        color: element.color,
        width: element.lineWidth || 1,
        dash: element.dashArray
      })
      return
    }

    appendElementTextRun(
      pageModel,
      snapshot,
      pageNo,
      element,
      position,
      rowHeight
    )
  })
}

function appendTables(
  pageModel: IPdfPageModel,
  snapshot: IPdfExportSnapshot,
  page: IPdfExportSnapshot['pageList'][number]
) {
  snapshot.elementList.forEach((element, index) => {
    if (element.type !== ElementType.TABLE) return
    const position = findPagePosition(page, index)
    if (!position) return

    const tableX = position.coordinate.leftTop[0]
    const tableY = position.coordinate.leftTop[1]

    appendTableVectors(pageModel, page.pageNo, element, tableX, tableY)
    element.trList?.forEach(tr => {
      tr.tdList.forEach(td => appendTableCellContent(pageModel, snapshot, page.pageNo, td))
    })
  })
}

function dedupeIssues(issues: string[]) {
  return Array.from(new Set(issues))
}

export function buildPdfPageModels(
  snapshot: IPdfExportSnapshot
): IPdfPageModel[] {
  return snapshot.pageList.map(page => {
    const pageModel: IPdfPageModel = {
      pageNo: page.pageNo,
      width: page.width,
      height: page.height,
      textRuns: [],
      highlightRects: [],
      links: [],
      vectorLines: [],
      rasterBlocks: [],
      issues: []
    }

    appendTopLevelRows(pageModel, snapshot, page)
    appendTables(pageModel, snapshot, page)

    pageModel.issues = dedupeIssues(pageModel.issues)
    return pageModel
  })
}
