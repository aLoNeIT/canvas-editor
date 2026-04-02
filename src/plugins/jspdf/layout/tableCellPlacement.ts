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
  lineHeight?: number
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
    color: option.color,
    bold: option.bold,
    italic: option.italic,
    lineHeight: option.lineHeight
  })
  if (!runList.length) return []

  const { placementList, contentHeight } = createStyledTextRunPlacements({
    runList,
    x: option.x + 6,
    y: option.y,
    width: Math.max(0, option.cellWidth - 12),
    measureWidth: option.measureWidth
  })

  const offsetY = resolveOffsetY(
    option.td.verticalAlign,
    option.rowHeight,
    contentHeight
  )

  return placementList.map(placement => ({
    ...placement,
    y: placement.y + offsetY
  }))
}
