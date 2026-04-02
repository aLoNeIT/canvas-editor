import type { ITableCellVisualLine } from './tableVisual'
import type { ITextPlacement } from './textPlacement'

export function createTextDecorationLines(
  placementList: ITextPlacement[]
): ITableCellVisualLine[] {
  return placementList.flatMap(placement => {
    const lineList: ITableCellVisualLine[] = []
    if (placement.underline) {
      lineList.push({
        x1: placement.x,
        y1: placement.y + 2,
        x2: placement.x + placement.width,
        y2: placement.y + 2,
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
