import { VerticalAlign } from '../../../editor/dataset/enum/VerticalAlign'
import type { ITd } from '../../../editor/interface/table/Td'
import { createStyledTextRunPlacements } from './styledTextRunPlacement'
import { extractTableCellTextRuns } from './tableCellText'

export interface ICreateTableCellTextPlacementsOption {
  td: ITd
  x: number
  y: number
  cellWidth: number
  rowHeight: number
  font?: string
  size?: number
  rowMargin?: number
  defaultRowMargin?: number
  defaultBasicRowMarginHeight?: number
  lineHeight?: number
  tabWidth?: number
  color?: string
  bold?: boolean
  italic?: boolean
  measureWidth: (
    text: string,
    style?: {
      font: string
      size: number
      bold?: boolean
      italic?: boolean
    }
  ) => number
}

function resolveOffsetY(
  verticalAlign: VerticalAlign | undefined,
  rowHeight: number,
  contentHeight: number
) {
  const remain = Math.max(0, rowHeight - contentHeight)
  if (verticalAlign === VerticalAlign.BOTTOM) {
    return remain
  }
  if (verticalAlign === VerticalAlign.MIDDLE) {
    return Math.floor(remain / 2)
  }
  return 0
}

export function createTableCellTextPlacements(
  option: ICreateTableCellTextPlacementsOption
) {
  const runList = extractTableCellTextRuns(option.td, {
    font: option.font,
    size: option.size,
    rowMargin: option.rowMargin,
    defaultRowMargin: option.defaultRowMargin,
    defaultBasicRowMarginHeight: option.defaultBasicRowMarginHeight,
    color: option.color,
    bold: option.bold,
    italic: option.italic,
    lineHeight: option.lineHeight,
    tabWidth: option.tabWidth
  })
  if (!runList.length) return []

  const { lineList } = createStyledTextRunPlacements({
    runList,
    x: option.x + 6,
    y: option.y,
    width: Math.max(0, option.cellWidth - 12),
    measureWidth: option.measureWidth
  })
  if (!lineList.length) return []

  const contentHeight = lineList.reduce(
    (sum, line) => sum + line.height + line.rowMargin * 2,
    0
  )

  const offsetY = resolveOffsetY(
    option.td.verticalAlign,
    option.rowHeight,
    contentHeight
  )

  let cursorY = option.y + offsetY

  return lineList.flatMap(line => {
    const lineY = cursorY + line.rowMargin
    const placementList = line.placementList.map(placement => ({
      ...placement,
      y: lineY + (placement.y - line.y)
    }))
    cursorY += line.height + line.rowMargin * 2
    return placementList
  })
}
