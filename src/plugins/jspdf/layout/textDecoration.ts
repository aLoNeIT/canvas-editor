import type { ITableCellVisualLine } from './tableVisual'
import type { ITextPlacement } from './textPlacement'

const DEFAULT_TEXT_DECORATION_LINE_WIDTH = 1

function resolveCoreUnderlineModelY(placement: ITextPlacement) {
  const lineWidth = DEFAULT_TEXT_DECORATION_LINE_WIDTH
  const baselineShift = placement.baselineShift || 0
  const lineDescent =
    placement.height -
    placement.baselineOffset +
    Math.max(0, -baselineShift)

  // Match the core canvas flow:
  // 1. row-top + row-height - row-margin => baseline + line descent
  // 2. underline render applies + 2 * lineWidth before half-pixel alignment
  return Math.floor(placement.y + lineDescent + 2 * lineWidth)
}

export function createTextDecorationLines(
  placementList: ITextPlacement[]
): ITableCellVisualLine[] {
  return placementList.flatMap(placement => {
    const lineList: ITableCellVisualLine[] = []
    if (placement.underline) {
      const underlineY = resolveCoreUnderlineModelY(placement)
      lineList.push({
        x1: placement.x,
        y1: underlineY,
        x2: placement.x + placement.width,
        y2: underlineY,
        color: placement.color || '#000000',
        width: 1
      })
    }
    if (placement.strikeout) {
      const strikeY = placement.y - placement.size * 0.35
      lineList.push({
        x1: placement.x,
        y1: strikeY,
        x2: placement.x + placement.width,
        y2: strikeY,
        color: placement.color || '#000000',
        width: 1
      })
    }
    return lineList
  })
}
