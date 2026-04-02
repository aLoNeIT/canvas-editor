export function paginateHeights(heights: number[], pageHeight: number) {
  const pages: number[][] = [[]]
  let pageNo = 0
  let usedHeight = 0

  heights.forEach((height, index) => {
    if (usedHeight + height > pageHeight && pages[pageNo].length) {
      pageNo++
      pages.push([])
      usedHeight = 0
    }
    pages[pageNo].push(index)
    usedHeight += height
  })

  return pages
}
