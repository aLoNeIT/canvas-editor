import type { ITd } from '../../../editor/interface/table/Td.js'
import type { ITableRowFragment } from './layoutTable'
import { createStyledTextRunPlacements } from './styledTextRunPlacement'
import { extractTableCellTextRuns } from './tableCellText'

export interface IMeasureTableRowHeightOption {
  tdList: ITd[]
  minHeight?: number
  baseCellWidth?: number
  columnWidthList?: number[]
  tabWidth?: number
  measureWidth: (
    text: string,
    style?: {
      font: string
      size: number
      bold?: boolean
      italic?: boolean
    }
  ) => number
  lineHeight: number
}

export interface IResolveTableRowHeightListOption {
  rowList: ITableRowFragment[]
  columnWidthList: number[]
  tabWidth?: number
  measureWidth: (
    text: string,
    style?: {
      font: string
      size: number
      bold?: boolean
      italic?: boolean
    }
  ) => number
  lineHeight: number
}

function getTableCellContentHeight(
  td: ITd,
  measureWidth: (
    text: string,
    style?: {
      font: string
      size: number
      bold?: boolean
      italic?: boolean
    }
  ) => number,
  lineHeight: number,
  tabWidth?: number,
  baseCellWidth?: number,
  columnWidthList?: number[]
) {
  const runList = extractTableCellTextRuns(td, {
    lineHeight,
    tabWidth
  })
  if (!runList.length) return 0
  const colspan = Math.max(1, td.colspan || 1)
  const colIndex = td.colIndex || 0
  const measuredWidth = columnWidthList?.length
    ? columnWidthList
      .slice(colIndex, colIndex + colspan)
      .reduce((sum, width) => sum + width, 0)
    : (baseCellWidth || 0) * colspan
  const cellWidth = Math.max(0, measuredWidth - 12)
  return createStyledTextRunPlacements({
    runList,
    x: 0,
    y: 0,
    width: cellWidth,
    measureWidth
  }).contentHeight
}

export function measureTableRowHeight(
  option: IMeasureTableRowHeightOption
) {
  const measuredCellHeight = option.tdList.reduce((maxHeight, td) => {
    return Math.max(
      maxHeight,
      getTableCellContentHeight(
        td,
        option.measureWidth,
        option.lineHeight,
        option.tabWidth,
        option.baseCellWidth,
        option.columnWidthList
      )
    )
  }, 0)

  return Math.max(option.minHeight || 24, measuredCellHeight, 24)
}

export function resolveTableRowHeightList(
  option: IResolveTableRowHeightListOption
) {
  const rowHeightList = option.rowList.map(row => Math.max(row.height, 24))

  option.rowList.forEach((row, rowIndex) => {
    row.tdList.forEach(td => {
      const rowspan = Math.max(1, td.rowspan || 1)
      const contentHeight = getTableCellContentHeight(
        td,
        option.measureWidth,
        option.lineHeight,
        option.tabWidth,
        undefined,
        option.columnWidthList
      )
      if (!contentHeight) return

      if (rowspan === 1) {
        rowHeightList[rowIndex] = Math.max(rowHeightList[rowIndex], contentHeight)
        return
      }

      const spanEndIndex = Math.min(
        option.rowList.length - 1,
        rowIndex + rowspan - 1
      )
      const currentSpanHeight = rowHeightList
        .slice(rowIndex, spanEndIndex + 1)
        .reduce((sum, height) => sum + height, 0)

      if (contentHeight > currentSpanHeight) {
        rowHeightList[spanEndIndex] += contentHeight - currentSpanHeight
      }
    })
  })

  return rowHeightList
}
