import { ListStyle, ListType } from '../../../editor/dataset/enum/List'
import type { IElement } from '../../../editor/interface/Element'
import type {
  IDocumentBlockNode,
  IDocumentLayoutDefaults
} from '../model/document'
import type { ITextPlacement } from './textPlacement'
import { measureLineHeight } from '../measure/textMeasure'

const ORDERED_LIST_GAP = 10
const UNORDERED_LIST_INDENT = 20

const unorderedListMarkerMap: Partial<Record<ListStyle, string>> = {
  [ListStyle.DISC]: '\u2022',
  [ListStyle.CIRCLE]: '\u25e6',
  [ListStyle.SQUARE]: '\u25aa'
}

export interface IResolvedBlockTextStyle {
  font: string
  size: number
  bold?: boolean
  italic?: boolean
  color: string
  lineHeight: number
  rowMargin: number
}

export interface IListBlockSemantics {
  indent: number
  markerText?: string
  markerWidth: number
  markerX: number
  font: string
  size: number
  bold?: boolean
  italic?: boolean
  color: string
}

interface IListMeasureDefaults {
  defaultFont: string
  defaultSize: number
  defaultColor?: string
  listInheritStyle: boolean
  orderedListGap?: number
  unorderedListIndent?: number
}

interface IListMarkerStyle {
  font: string
  size: number
  bold?: boolean
  italic?: boolean
  color: string
}

function getResolvedTitleSize(
  element: IElement,
  defaults: IDocumentLayoutDefaults
) {
  if (element.size) return element.size
  if (element.level) {
    return defaults.titleSizeMapping[element.level] || defaults.defaultSize
  }
  return defaults.defaultSize
}

function getRowMarginRatio(fontSize: number) {
  if (fontSize < 12) {
    return fontSize / 12
  }
  if (fontSize > 30) {
    return 1 + (fontSize - 30) / 30
  }
  return 1
}

function getListMarkerStyle(
  element: IElement,
  defaults: IListMeasureDefaults
): IListMarkerStyle {
  if (!defaults.listInheritStyle) {
    return {
      font: defaults.defaultFont,
      size: defaults.defaultSize,
      color: defaults.defaultColor || '#000000'
    }
  }

  return {
    font: element.font || defaults.defaultFont,
    size: element.size || defaults.defaultSize,
    bold: element.bold,
    italic: element.italic,
    color: element.color || defaults.defaultColor || '#000000'
  }
}

function getListMarkerText(element: IElement, index: number) {
  const listType = element.listType
  const listStyle = element.listStyle ||
    (listType === ListType.OL ? ListStyle.DECIMAL : ListStyle.DISC)

  if (listType === ListType.OL) {
    return `${index + 1}.`
  }

  if (listStyle === ListStyle.CHECKBOX) {
    return element.checkbox?.value ? '\u2611' : '\u2610'
  }

  return unorderedListMarkerMap[listStyle] || unorderedListMarkerMap[ListStyle.DISC]!
}

function getOrderedListIndent(
  group: IDocumentBlockNode[],
  defaults: IListMeasureDefaults,
  measureWidth: (
    text: string,
    style?: {
      font: string
      size: number
      bold?: boolean
      italic?: boolean
    }
  ) => number
) {
  const maxDigits = String(group.length).length
  const style = getListMarkerStyle(group[0].element, defaults)
  const width = measureWidth(`${'0'.repeat(maxDigits)}.`, style)
  return width + (defaults.orderedListGap ?? ORDERED_LIST_GAP)
}

function getListIndent(
  group: IDocumentBlockNode[],
  defaults: IListMeasureDefaults,
  measureWidth: (
    text: string,
    style?: {
      font: string
      size: number
      bold?: boolean
      italic?: boolean
    }
  ) => number
) {
  const element = group[0]?.element
  if (!element?.listId || !element.listType) {
    return 0
  }

  const listStyle = element.listStyle ||
    (element.listType === ListType.OL ? ListStyle.DECIMAL : ListStyle.DISC)
  if (element.listType === ListType.OL && listStyle === ListStyle.DECIMAL) {
    return getOrderedListIndent(group, defaults, measureWidth)
  }

  if (listStyle === ListStyle.CHECKBOX) {
    const style = getListMarkerStyle(element, defaults)
    return Math.max(
      measureWidth('\u2610', style) + (defaults.orderedListGap ?? ORDERED_LIST_GAP),
      defaults.unorderedListIndent ?? UNORDERED_LIST_INDENT
    )
  }

  return defaults.unorderedListIndent ?? UNORDERED_LIST_INDENT
}

export function resolveBlockTextStyle(
  element: IElement,
  defaults: IDocumentLayoutDefaults
): IResolvedBlockTextStyle {
  const size = getResolvedTitleSize(element, defaults)
  return {
    font: element.font || defaults.defaultFont,
    size,
    bold: element.bold ?? Boolean(element.level),
    italic: element.italic,
    color: element.color || defaults.defaultColor,
    lineHeight: measureLineHeight(
      element.font || defaults.defaultFont,
      size,
      element.bold ?? Boolean(element.level),
      element.italic
    ),
    rowMargin:
      defaults.defaultBasicRowMarginHeight *
      getRowMarginRatio(size) *
      (element.rowMargin ?? defaults.defaultRowMargin)
  }
}

export function resolveListBlockSemantics(
  blockList: Pick<IDocumentBlockNode, 'kind' | 'element'>[],
  defaults: IListMeasureDefaults,
  measureWidth: (
    text: string,
    style?: {
      font: string
      size: number
      bold?: boolean
      italic?: boolean
    }
  ) => number
): IListBlockSemantics[] {
  const semanticList = blockList.map<IListBlockSemantics>(() => ({
    indent: 0,
    markerWidth: 0,
    markerX: 0,
    font: defaults.defaultFont,
    size: defaults.defaultSize,
    color: defaults.defaultColor || '#000000'
  }))

  let index = 0
  while (index < blockList.length) {
    const block = blockList[index]
    const listId = block.element.listId
    const listType = block.element.listType
    if (!listId || !listType) {
      index += 1
      continue
    }

    let end = index + 1
    while (end < blockList.length && blockList[end].element.listId === listId) {
      end += 1
    }

    const group = blockList.slice(index, end)
    const indent = getListIndent(group, defaults, measureWidth)
    group.forEach((groupBlock, groupIndex) => {
      const markerText = getListMarkerText(groupBlock.element, groupIndex)
      const style = getListMarkerStyle(groupBlock.element, defaults)
      const markerWidth = markerText ? measureWidth(markerText, style) : 0
      semanticList[index + groupIndex] = {
        indent,
        markerText,
        markerWidth,
        markerX: Math.max(
          0,
          indent - (defaults.orderedListGap ?? ORDERED_LIST_GAP) - markerWidth
        ),
        ...style
      }
    })

    index = end
  }

  return semanticList
}

export interface ICreateListMarkerPlacementOption {
  semantic: IListBlockSemantics
  x: number
  y: number
  height: number
  baselineOffset: number
}

export function createListMarkerPlacement(
  option: ICreateListMarkerPlacementOption
): ITextPlacement | null {
  if (!option.semantic.markerText) {
    return null
  }

  return {
    text: option.semantic.markerText,
    x: option.x + option.semantic.markerX,
    y: option.y + option.baselineOffset,
    width: option.semantic.markerWidth,
    height: option.height,
    font: option.semantic.font,
    size: option.semantic.size,
    bold: option.semantic.bold,
    italic: option.semantic.italic,
    color: option.semantic.color,
    baselineOffset: option.baselineOffset
  }
}
