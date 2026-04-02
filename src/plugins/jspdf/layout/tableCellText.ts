import type { IElement } from '../../../editor/interface/Element'
import type { ITd } from '../../../editor/interface/table/Td'
import { ElementType } from '../../../editor/dataset/enum/Element'
import type { IStyledTextRun } from './styledTextRunPlacement'

export interface IResolvedTableCellTextStyle {
  text: string
  font: string
  size: number
  bold?: boolean
  italic?: boolean
  underline?: boolean
  strikeout?: boolean
  color: string
  lineHeight: number
}

export interface ITableCellTextFallbackStyle {
  font?: string
  size?: number
  baselineShift?: number
  bold?: boolean
  italic?: boolean
  underline?: boolean
  strikeout?: boolean
  color?: string
  lineHeight?: number
}

function getElementText(element: IElement): string {
  const childText = (element.valueList || []).map(getElementText).join('')
  return `${element.value || ''}${childText}`
}

function createRunStyle(
  element: IElement,
  inherited: ITableCellTextFallbackStyle
) {
  const inheritedSize = inherited.size || 12
  const baseSize = element.size || inheritedSize
  const isSuperOrSub =
    element.type === ElementType.SUPERSCRIPT ||
    element.type === ElementType.SUBSCRIPT
  const size = isSuperOrSub
    ? element.actualSize || Math.ceil(baseSize * 0.6)
    : baseSize
  const baselineShift =
    element.type === ElementType.SUPERSCRIPT
      ? -size / 2
      : element.type === ElementType.SUBSCRIPT
        ? size / 2
        : undefined
  const style: ITableCellTextFallbackStyle & {
    font: string
    size: number
    color: string
    lineHeight: number
  } = {
    font: element.font || inherited.font || 'Song',
    size,
    baselineShift,
    bold: element.bold ?? inherited.bold,
    italic: element.italic ?? inherited.italic,
    underline: element.underline ?? inherited.underline,
    strikeout: element.strikeout ?? inherited.strikeout,
    color: element.color || inherited.color || '#000000',
    lineHeight: Math.max(
      baseSize + 8,
      inherited.lineHeight || 0,
      size + 8
    )
  }
  return style
}

export function extractElementTextRuns(
  elementList: IElement[],
  inherited: ITableCellTextFallbackStyle = {}
) {
  const runList: IStyledTextRun[] = []
  elementList.forEach(element => {
    const style = createRunStyle(element, inherited)
    if (element.value) {
      runList.push({
        text: element.value,
        font: style.font,
        size: style.size,
        baselineShift: style.baselineShift,
        bold: style.bold,
        italic: style.italic,
        underline: style.underline,
        strikeout: style.strikeout,
        color: style.color,
        lineHeight: style.lineHeight
      })
    }
    if (element.valueList?.length) {
      runList.push(...extractElementTextRuns(element.valueList, style))
    }
  })
  return runList
}

export function extractTableCellTextRuns(
  td: ITd,
  fallback: ITableCellTextFallbackStyle = {}
) {
  return extractElementTextRuns(td.value || [], fallback)
}

export function resolveTableCellTextStyle(
  td: ITd,
  fallback: ITableCellTextFallbackStyle = {}
): IResolvedTableCellTextStyle {
  const runList = extractTableCellTextRuns(td, fallback)
  const firstRun = runList[0]
  const text = (td.value || []).map(getElementText).join('').trim()
  const size = firstRun?.size || fallback.size || 12

  return {
    text,
    font: firstRun?.font || fallback.font || 'Song',
    size,
    bold: firstRun?.bold ?? fallback.bold,
    italic: firstRun?.italic ?? fallback.italic,
    underline: firstRun?.underline ?? fallback.underline,
    strikeout: firstRun?.strikeout ?? fallback.strikeout,
    color: firstRun?.color || fallback.color || '#000000',
    lineHeight: Math.max(fallback.lineHeight || 0, size + 8)
  }
}
