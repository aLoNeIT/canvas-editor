import type { ITd } from '../../../editor/interface/table/Td'
import type { IDocumentBlockNode } from '../model/document'

export interface ITableLayoutCell extends ITd {
  rowIndex: number
  colIndex: number
  x: number
  y: number
  width: number
  height: number
  trIndex: number
  tdIndex: number
}

export interface ITableRowFragment {
  rowIndex: number
  height: number
  tdList: ITableLayoutCell[]
  pagingRepeat?: boolean
}

function getTableRowHeight(row: NonNullable<IDocumentBlockNode['element']['trList']>[number]) {
  return row.height || row.minHeight || 24
}

function getFallbackColumnCount(trList: NonNullable<IDocumentBlockNode['element']['trList']>) {
  return Math.max(
    ...trList.map(tr =>
      (tr.tdList || []).reduce((sum, td) => sum + Math.max(1, td.colspan || 1), 0)
    ),
    1
  )
}

function sum(list: number[], end: number, start = 0) {
  return list.slice(start, end).reduce((total, value) => total + value, 0)
}

export function getTableColumnWidthList(
  block: IDocumentBlockNode,
  tableWidth?: number
) {
  const trList = block.element.trList || []
  const sourceWidthList = block.element.colgroup?.length
    ? block.element.colgroup.map(col => col.width)
    : Array.from(
      { length: getFallbackColumnCount(trList) },
      () => 1
    )

  if (!tableWidth) {
    return sourceWidthList
  }

  const totalWidth = sourceWidthList.reduce((total, width) => total + width, 0)
  if (!totalWidth) {
    return Array.from({ length: sourceWidthList.length || 1 }, () => tableWidth)
  }

  return sourceWidthList.map(width => tableWidth * width / totalWidth)
}

export function layoutTable(block: IDocumentBlockNode): ITableRowFragment[] {
  const trList = block.element.trList || []
  const rowHeightList = trList.map(getTableRowHeight)
  const rowOffsetList = rowHeightList.map((_, rowIndex) =>
    sum(rowHeightList, rowIndex)
  )
  const columnWidthList = getTableColumnWidthList(block)
  const spanEndRowByCol: number[] = []

  return trList.map((tr, rowIndex) => ({
    rowIndex,
    height: rowHeightList[rowIndex],
    tdList: (tr.tdList || []).map((td, tdIndex) => {
      const colspan = Math.max(1, td.colspan || 1)
      const rowspan = Math.max(1, td.rowspan || 1)
      let colIndex = td.colIndex

      if (typeof colIndex !== 'number') {
        colIndex = tdIndex
        while ((spanEndRowByCol[colIndex] || 0) > rowIndex) {
          colIndex++
        }
      }

      const x = sum(columnWidthList, colIndex)
      const width = sum(columnWidthList, colIndex + colspan, colIndex)
      const height = sum(rowHeightList, rowIndex + rowspan, rowIndex)

      for (let col = colIndex; col < colIndex + colspan; col++) {
        spanEndRowByCol[col] = Math.max(spanEndRowByCol[col] || 0, rowIndex + rowspan)
      }

      return {
        ...td,
        rowIndex,
        colIndex,
        x,
        y: rowOffsetList[rowIndex] || 0,
        width,
        height,
        trIndex: rowIndex,
        tdIndex
      }
    }),
    pagingRepeat: tr.pagingRepeat
  }))
}
