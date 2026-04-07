import type { IElement } from '../../../editor/interface/Element'
import type { ITd } from '../../../editor/interface/table/Td'
import { ControlType } from '../../../editor/dataset/enum/Control'
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
  letterSpacing?: number
  tabWidth?: number
  bold?: boolean
  italic?: boolean
  underline?: boolean
  strikeout?: boolean
  color?: string
  lineHeight?: number
  controlPlaceholderColor?: string
  controlBracketColor?: string
  controlPrefix?: string
  controlPostfix?: string
  checkboxGap?: number
  radioGap?: number
}

function createSyntheticTextElement(
  value: string,
  style?: Partial<IElement>
): IElement {
  return {
    value,
    ...style
  }
}

function getControlValueStyleElementList(
  control: NonNullable<IElement['control']>
): IElement[] {
  return (control.value || []).flatMap(element =>
    Array.from(element.value || '').map(char => ({
      ...element,
      value: char
    }))
  )
}

function getSelectControlText(
  control: NonNullable<IElement['control']>
): string | null {
  if (control.type !== ControlType.SELECT || !control.code) {
    return null
  }

  const delimiter = control.multiSelectDelimiter || ','
  const valueList = control.code
    .split(',')
    .map(code => control.valueSets?.find(valueSet => valueSet.code === code)?.value)
    .filter((value): value is string => Boolean(value))

  return valueList.join(delimiter) || null
}

function getCheckableControlTextElements(
  control: NonNullable<IElement['control']>,
  inherited?: ITableCellTextFallbackStyle
): IElement[] {
  if (
    (control.type !== ControlType.CHECKBOX &&
      control.type !== ControlType.RADIO) ||
    !Array.isArray(control.valueSets) ||
    !control.valueSets.length
  ) {
    return []
  }

  const selectedCodeList = control.code ? control.code.split(',') : []
  const valueStyleElementList = getControlValueStyleElementList(control)
  let valueStyleIndex = 0
  const gap =
    control.type === ControlType.CHECKBOX
      ? inherited?.checkboxGap || 0
      : inherited?.radioGap || 0
  return control.valueSets.flatMap(valueSet => {
    const isSelected = selectedCodeList.includes(valueSet.code)
    const optionElement: IElement =
      control.type === ControlType.CHECKBOX
        ? {
            type: ElementType.CHECKBOX,
            value: '',
            checkbox: {
              code: valueSet.code,
              value: isSelected
            }
          }
        : {
            type: ElementType.RADIO,
            value: '',
            radio: {
              code: valueSet.code,
              value: isSelected
            }
          }

    const labelElementList = Array.from(valueSet.value).map(char => {
      const valueStyleElement = valueStyleElementList[valueStyleIndex]
      const isLastChar = valueStyleIndex % valueSet.value.length === valueSet.value.length - 1
      valueStyleIndex += 1
      if (!valueStyleElement) {
        return createSyntheticTextElement(char, {
          letterSpacing: isLastChar ? gap : 0
        })
      }
      const { value, ...style } = valueStyleElement
      void value
      return createSyntheticTextElement(char, {
        ...style,
        letterSpacing: isLastChar ? gap : 0
      })
    })

    return [optionElement, ...labelElementList]
  })
}

function getControlTextElements(
  element: IElement,
  inherited?: ITableCellTextFallbackStyle
): IElement[] {
  const control = element.control
  if (!control) return []

  const elementList: IElement[] = []
  const prefix = control.prefix || inherited?.controlPrefix
  const postfix = control.postfix || inherited?.controlPostfix
  if (prefix) {
    elementList.push(
      createSyntheticTextElement(prefix, {
        color: inherited?.controlBracketColor
      })
    )
  }
  if (control.preText) {
    elementList.push(createSyntheticTextElement(control.preText))
  }
  const checkableElementList = getCheckableControlTextElements(control, inherited)
  if (checkableElementList.length) {
    elementList.push(...checkableElementList)
  } else if (control.value?.length) {
    elementList.push(...control.value)
  } else {
    const selectText = getSelectControlText(control)
    if (selectText) {
      elementList.push(createSyntheticTextElement(selectText))
    } else if (control.placeholder) {
      elementList.push(
        createSyntheticTextElement(control.placeholder, {
          color: inherited?.controlPlaceholderColor
        })
      )
    }
  }
  if (control.postText) {
    elementList.push(createSyntheticTextElement(control.postText))
  }
  if (postfix) {
    elementList.push(
      createSyntheticTextElement(postfix, {
        color: inherited?.controlBracketColor
      })
    )
  }

  return elementList
}

function getControlTextFallbackStyle(
  element: IElement,
  style: ITableCellTextFallbackStyle & {
    font: string
    size: number
    color: string
    lineHeight: number
  }
) {
  const control = element.control
  if (!control) {
    return style
  }

  const size = control.size || style.size

  return {
    ...style,
    font: control.font || style.font,
    size,
    bold: control.bold ?? style.bold,
    italic: control.italic ?? style.italic,
    underline: control.underline ?? style.underline,
    strikeout: control.strikeout ?? style.strikeout,
    lineHeight: Math.max(style.lineHeight, size + 8)
  }
}

function getSyntheticElementText(element: IElement) {
  if (element.type === ElementType.TAB) {
    return ' '
  }
  if (element.type === ElementType.CHECKBOX) {
    return element.checkbox?.value ? '\u2611' : '\u2610'
  }
  if (element.type === ElementType.RADIO) {
    return element.radio?.value ? '\u25c9' : '\u25cb'
  }
  return ''
}

function getElementText(element: IElement): string {
  const childElementList =
    element.valueList?.length
      ? element.valueList
      : element.type === ElementType.CONTROL
        ? getControlTextElements(element)
        : []
  const childText = childElementList.map(getElementText).join('')
  return `${element.value || getSyntheticElementText(element)}${childText}`
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
    letterSpacing: element.letterSpacing ?? inherited.letterSpacing,
    color: element.color || inherited.color || '#000000',
    controlPlaceholderColor: inherited.controlPlaceholderColor,
    controlBracketColor: inherited.controlBracketColor,
    controlPrefix: inherited.controlPrefix,
    controlPostfix: inherited.controlPostfix,
    tabWidth: inherited.tabWidth,
    checkboxGap: inherited.checkboxGap,
    radioGap: inherited.radioGap,
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
    if (element.type === ElementType.TAB) {
      runList.push({
        text: ' ',
        widthOverride: style.tabWidth || 0,
        font: style.font,
        size: style.size,
        baselineShift: style.baselineShift,
        letterSpacing: style.letterSpacing,
        bold: style.bold,
        italic: style.italic,
        underline: style.underline,
        strikeout: style.strikeout,
        color: style.color,
        lineHeight: style.lineHeight
      })
      return
    }
    const text = element.value || getSyntheticElementText(element)
    if (text) {
      runList.push({
        text,
        font: style.font,
        size: style.size,
        baselineShift: style.baselineShift,
        letterSpacing: style.letterSpacing,
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
    } else if (element.type === ElementType.CONTROL) {
      const controlElementList = getControlTextElements(element, style)
      if (controlElementList.length) {
        runList.push(
          ...extractElementTextRuns(
            controlElementList,
            getControlTextFallbackStyle(element, style)
          )
        )
      }
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
