export interface IPaginateEntry {
  height: number
  forceBreakAfter?: boolean
}

export function paginateHeights(
  entries: Array<number | IPaginateEntry>,
  pageHeight: number
) {
  const pages: number[][] = [[]]
  let pageNo = 0
  let usedHeight = 0

  entries.forEach((entry, index) => {
    const option = typeof entry === 'number' ? { height: entry } : entry

    if (usedHeight + option.height > pageHeight && pages[pageNo].length) {
      pageNo++
      pages.push([])
      usedHeight = 0
    }
    pages[pageNo].push(index)
    usedHeight += option.height

    if (option.forceBreakAfter && index < entries.length - 1) {
      pageNo++
      pages.push([])
      usedHeight = 0
    }
  })

  return pages
}
