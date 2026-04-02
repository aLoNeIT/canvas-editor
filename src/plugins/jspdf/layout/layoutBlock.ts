import type { IDocumentBlockNode } from '../model/document'

export function getBlockHeight(block: IDocumentBlockNode) {
  if (block.height) return block.height
  if (block.kind === 'paragraph') return 24
  return 32
}
