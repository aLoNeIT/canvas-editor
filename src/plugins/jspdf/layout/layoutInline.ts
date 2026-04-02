import type {
  IDocumentInlineNode,
  IMeasuredInlineNode
} from '../model/document'
import { measureText } from '../measure/textMeasure'

export function layoutInline(
  node: IDocumentInlineNode,
  x: number,
  y: number
): IMeasuredInlineNode {
  const metric = measureText(node.text, node.font, node.size, node.bold, node.italic)

  return {
    ...node,
    x,
    y,
    width: metric.width,
    ascent: metric.ascent,
    descent: metric.descent
  }
}
