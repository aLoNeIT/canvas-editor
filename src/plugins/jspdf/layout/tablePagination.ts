export interface ITablePaginationRow {
  rowIndex: number
  height: number
  tdList: Array<{
    rowspan?: number
  }>
  pagingRepeat?: boolean
}

export interface ITablePageRowFragment extends ITablePaginationRow {
  repeatHeader?: boolean
}

function getRepeatHeaderList(rowList: ITablePaginationRow[]) {
  const repeatHeaderList: ITablePaginationRow[] = []
  for (const row of rowList) {
    if (!row.pagingRepeat) break
    repeatHeaderList.push(row)
  }
  return repeatHeaderList
}

function getRowSpanEndIndex(row: ITablePaginationRow, rowIndex: number) {
  return row.tdList.reduce((maxIndex, td) => {
    const rowspan = Math.max(1, td.rowspan || 1)
    return Math.max(maxIndex, rowIndex + rowspan - 1)
  }, rowIndex)
}

function sumRowHeights(
  rowList: ITablePaginationRow[],
  startIndex: number,
  endIndex: number
) {
  return rowList
    .slice(startIndex, endIndex + 1)
    .reduce((sum, row) => sum + row.height, 0)
}

export function paginateTableRows(
  rowList: ITablePaginationRow[],
  pageHeight: number
): ITablePageRowFragment[][] {
  const repeatHeaderList = getRepeatHeaderList(rowList)
  const repeatHeaderHeight = repeatHeaderList.reduce(
    (sum, row) => sum + row.height,
    0
  )
  const rowSpanEndIndexList = rowList.map(getRowSpanEndIndex)
  const spanBlockHeightList = rowSpanEndIndexList.map((endIndex, rowIndex) =>
    sumRowHeights(rowList, rowIndex, endIndex)
  )
  const repeatHeaderSpanEndIndex = repeatHeaderList.reduce(
    (maxIndex, _, rowIndex) => Math.max(maxIndex, rowSpanEndIndexList[rowIndex]),
    -1
  )

  const pageList: ITablePageRowFragment[][] = []
  let currentPage: ITablePageRowFragment[] = []
  let usedHeight = 0
  let activeSpanEndIndex = -1

  rowList.forEach((row, rowIndex) => {
    const isCoveredByActiveSpan = rowIndex <= activeSpanEndIndex
    const requiredHeight = isCoveredByActiveSpan
      ? row.height
      : spanBlockHeightList[rowIndex]
    const needBreak =
      !isCoveredByActiveSpan &&
      usedHeight + requiredHeight > pageHeight &&
      currentPage.length > 0

    if (needBreak) {
      pageList.push(currentPage)
      currentPage = []
      usedHeight = 0
      activeSpanEndIndex = -1

      if (repeatHeaderList.length) {
        repeatHeaderList.forEach(headerRow => {
          currentPage.push({
            ...headerRow,
            repeatHeader: true
          })
        })
        usedHeight += repeatHeaderHeight
        activeSpanEndIndex = repeatHeaderSpanEndIndex
      }
    }

    const isOriginalRepeatHeader = rowIndex < repeatHeaderList.length
    if (pageList.length || !isOriginalRepeatHeader || currentPage.length === 0) {
      currentPage.push(row)
      usedHeight += row.height
      activeSpanEndIndex = Math.max(
        activeSpanEndIndex,
        rowSpanEndIndexList[rowIndex]
      )
    }
  })

  if (currentPage.length) {
    pageList.push(currentPage)
  }

  return pageList
}
