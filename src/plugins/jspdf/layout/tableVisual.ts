import {
  TableBorder,
  TdBorder,
  TdSlash
} from '../../../editor/dataset/enum/table/Table'
import type { ITd } from '../../../editor/interface/table/Td'

export interface ITableCellVisualLine {
  x1: number
  y1: number
  x2: number
  y2: number
  color?: string
  width?: number
  dash?: number[]
}

export interface ITableCellBackgroundRect {
  x: number
  y: number
  width: number
  height: number
  color: string
  opacity: number
}

export interface ICreateTableCellVisualsOption {
  td: ITd
  x: number
  y: number
  width: number
  height: number
  rowIndex: number
  colIndex: number
  rowCount: number
  colCount: number
  tableBorderType?: TableBorder
  borderColor?: string
  borderWidth?: number
  borderExternalWidth?: number
}

function pushLine(
  lineList: ITableCellVisualLine[],
  line: ITableCellVisualLine
) {
  lineList.push(line)
}

export function createTableCellVisuals(
  option: ICreateTableCellVisualsOption
) {
  const lines: ITableCellVisualLine[] = []
  const backgroundRects: ITableCellBackgroundRect[] = []
  const rowspan = Math.max(1, option.td.rowspan || 1)
  const colspan = Math.max(1, option.td.colspan || 1)
  const isFirstRow = option.rowIndex === 0
  const isLastRow = option.rowIndex + rowspan >= option.rowCount
  const isFirstCol = option.colIndex === 0
  const isLastCol = option.colIndex + colspan >= option.colCount
  const borderColor = option.borderColor || '#000000'
  const borderWidth = option.borderWidth || 1
  const dash =
    option.tableBorderType === TableBorder.DASH ? [3, 3] : undefined

  if (option.td.backgroundColor) {
    backgroundRects.push({
      x: option.x,
      y: option.y,
      width: option.width,
      height: option.height,
      color: option.td.backgroundColor,
      opacity: 1
    })
  }

  if (option.td.slashTypes?.includes(TdSlash.FORWARD)) {
    pushLine(lines, {
      x1: option.x,
      y1: option.y + option.height,
      x2: option.x + option.width,
      y2: option.y,
      color: borderColor,
      width: borderWidth,
      dash
    })
  }

  if (option.td.slashTypes?.includes(TdSlash.BACK)) {
    pushLine(lines, {
      x1: option.x,
      y1: option.y,
      x2: option.x + option.width,
      y2: option.y + option.height,
      color: borderColor,
      width: borderWidth,
      dash
    })
  }

  const pushEdge = (
    edge: 'top' | 'right' | 'bottom' | 'left',
    isExternal = false
  ) => {
    const width = isExternal && option.borderExternalWidth
      ? option.borderExternalWidth
      : borderWidth

    if (edge === 'top') {
      pushLine(lines, {
        x1: option.x,
        y1: option.y,
        x2: option.x + option.width,
        y2: option.y,
        color: borderColor,
        width,
        dash
      })
      return
    }
    if (edge === 'right') {
      pushLine(lines, {
        x1: option.x + option.width,
        y1: option.y,
        x2: option.x + option.width,
        y2: option.y + option.height,
        color: borderColor,
        width,
        dash
      })
      return
    }
    if (edge === 'bottom') {
      pushLine(lines, {
        x1: option.x + option.width,
        y1: option.y + option.height,
        x2: option.x,
        y2: option.y + option.height,
        color: borderColor,
        width,
        dash
      })
      return
    }
    pushLine(lines, {
      x1: option.x,
      y1: option.y,
      x2: option.x,
      y2: option.y + option.height,
      color: borderColor,
      width,
      dash
    })
  }

  if (option.td.borderTypes?.includes(TdBorder.TOP)) pushEdge('top')
  if (option.td.borderTypes?.includes(TdBorder.RIGHT)) pushEdge('right')
  if (option.td.borderTypes?.includes(TdBorder.BOTTOM)) pushEdge('bottom')
  if (option.td.borderTypes?.includes(TdBorder.LEFT)) pushEdge('left')

  if (option.tableBorderType === TableBorder.EMPTY) {
    return {
      backgroundRects,
      lines
    }
  }

  if (option.tableBorderType === TableBorder.EXTERNAL) {
    if (isFirstRow) pushEdge('top', true)
    if (isFirstCol) pushEdge('left', true)
    if (isLastCol) pushEdge('right', true)
    if (isLastRow) pushEdge('bottom', true)
    return {
      backgroundRects,
      lines
    }
  }

  if (option.tableBorderType === TableBorder.INTERNAL) {
    if (!isLastCol) pushEdge('right')
    if (!isLastRow) pushEdge('bottom')
    return {
      backgroundRects,
      lines
    }
  }

  if (isFirstRow) pushEdge('top', true)
  if (isFirstCol) pushEdge('left', true)
  pushEdge('right', isLastCol)
  pushEdge('bottom', isLastRow)

  return {
    backgroundRects,
    lines
  }
}
