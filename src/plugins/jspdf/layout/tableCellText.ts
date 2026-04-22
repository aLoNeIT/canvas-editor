import type { IElement } from '../../../editor/interface/Element'
import type { ITd } from '../../../editor/interface/table/Td'
import { defaultCheckboxOption } from '../../../editor/dataset/constant/Checkbox'
import { defaultLabelOption } from '../../../editor/dataset/constant/Label'
import { defaultRadioOption } from '../../../editor/dataset/constant/Radio'
import { ImageDisplay } from '../../../editor/dataset/enum/Common'
import { ControlType } from '../../../editor/dataset/enum/Control'
import { ElementType } from '../../../editor/dataset/enum/Element'
import type { IStyledTextRun } from './styledTextRunPlacement'
import { measureLineHeight, measureText } from '../measure/textMeasure'
import { getRowMarginRatio } from './blockSemantics'
import { resolveLatexAsset } from './latex'

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
  rowMargin?: number
  defaultRowMargin?: number
  defaultBasicRowMarginHeight?: number
  baselineShift?: number
  letterSpacing?: number
  tabWidth?: number
  bold?: boolean
  italic?: boolean
  underline?: boolean
  strikeout?: boolean
  color?: string
  highlight?: string
  lineHeight?: number
  controlPlaceholderColor?: string
  controlBracketColor?: string
  controlPrefix?: string
  controlPostfix?: string
  checkboxGap?: number
  radioGap?: number
  linkUrl?: string
  areaId?: string
  areaBackgroundColor?: string
  areaBorderColor?: string
  controlKey?: object
  controlBorder?: boolean
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

const ZERO_WIDTH_CHAR_REG = /[\u200b-\u200d\ufeff]/g
const SYMBOL_FONT_REG = /[\u2200-\u22ff]/

function hasVisibleValue(value?: string | null) {
  return Boolean((value || '').replace(ZERO_WIDTH_CHAR_REG, ''))
}

function hasVisibleElementValue(element: IElement) {
  if (element.type === ElementType.IMAGE) {
    return Boolean(element.value && element.width && element.height)
  }
  return hasVisibleValue(element.value)
}

function hasResolvedControlValue(
  control: NonNullable<IElement['control']>
) {
  if (
    (control.type === ControlType.CHECKBOX ||
      control.type === ControlType.RADIO) &&
    control.code
  ) {
    return control.code
      .split(',')
      .map(code => code.trim())
      .some(Boolean)
  }

  if ((control.value || []).some(hasVisibleElementValue)) {
    return true
  }

  return Boolean(getSelectControlText(control))
}

function isInlineImageElement(element: IElement) {
  return (
    element.type === ElementType.IMAGE &&
    element.imgDisplay !== ImageDisplay.BLOCK &&
    element.imgDisplay !== ImageDisplay.SURROUND &&
    element.imgDisplay !== ImageDisplay.FLOAT_TOP &&
    element.imgDisplay !== ImageDisplay.FLOAT_BOTTOM &&
    Boolean(element.value) &&
    typeof element.width === 'number' &&
    typeof element.height === 'number'
  )
}

function resolveRunFontFamily(
  element: IElement,
  inherited: ITableCellTextFallbackStyle
) {
  const fallbackFont = element.font || inherited.font || 'Song'
  const text = element.value || getSyntheticElementText(element)
  if (!element.font && text && SYMBOL_FONT_REG.test(text)) {
    return 'SimHei'
  }
  return fallbackFont
}

function resolveControlValueElements(
  control: NonNullable<IElement['control']>,
  _inherited?: ITableCellTextFallbackStyle
) {
  if (!hasResolvedControlValue(control)) {
    return {
      valueElementList: [],
      hasResolvedValue: false
    }
  }

  const checkableElementList = getCheckableControlTextElements(
    control,
    _inherited
  )
  if (checkableElementList.length) {
    return {
      valueElementList: checkableElementList,
      hasResolvedValue: true
    }
  }

  if (control.value?.length) {
    return {
      valueElementList: control.value,
      hasResolvedValue: true
    }
  }

  const selectText = getSelectControlText(control)
  if (selectText) {
    return {
      valueElementList: [createSyntheticTextElement(selectText)],
      hasResolvedValue: true
    }
  }

  return {
    valueElementList: [],
    hasResolvedValue: false
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
  if (!selectedCodeList.length) {
    return []
  }
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

  const { valueElementList, hasResolvedValue } = resolveControlValueElements(
    control,
    inherited
  )
  if (!hasResolvedValue || !valueElementList.length) {
    return []
  }

  const elementList: IElement[] = []
  if (hasResolvedValue && control.preText) {
    elementList.push(createSyntheticTextElement(control.preText))
  }
  elementList.push(...valueElementList)
  if (hasResolvedValue && control.postText) {
    elementList.push(createSyntheticTextElement(control.postText))
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
    rowMargin?: number
  }
) {
  const control = element.control
  if (!control) {
    return style
  }

  const size = control.size || style.size
  const font = control.font || style.font
  const bold = control.bold ?? style.bold
  const italic = control.italic ?? style.italic

  return {
    ...style,
    font,
    size,
    bold,
    italic,
    rowMargin: style.rowMargin,
    underline: control.underline ?? style.underline,
    strikeout: control.strikeout ?? style.strikeout,
    lineHeight: Math.max(
      style.lineHeight,
      measureLineHeight(font, size, bold, italic)
    )
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

function escapeSvgText(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function createSvgDataUrl(markup: string) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`
}

function createCanvasDataUrl(
  width: number,
  height: number,
  draw: (ctx: CanvasRenderingContext2D, scale: number) => void,
  pixelRatio = 2
) {
  if (typeof document === 'undefined') {
    return null
  }

  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.ceil(width * pixelRatio))
  canvas.height = Math.max(1, Math.ceil(height * pixelRatio))
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    return null
  }

  ctx.scale(pixelRatio, pixelRatio)
  draw(ctx, pixelRatio)
  return canvas.toDataURL('image/png')
}

function createCanvasFont(
  font: string,
  size: number,
  bold?: boolean,
  italic?: boolean
) {
  return `${italic ? 'italic ' : ''}${bold ? 'bold ' : ''}${size}px ${font}`
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
) {
  ctx.beginPath()
  ctx.moveTo(x + radius, y)
  ctx.lineTo(x + width - radius, y)
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius)
  ctx.lineTo(x + width, y + height - radius)
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height)
  ctx.lineTo(x + radius, y + height)
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius)
  ctx.lineTo(x, y + radius)
  ctx.quadraticCurveTo(x, y, x + radius, y)
  ctx.closePath()
}

function getElementText(element: IElement): string {
  if (element.type === ElementType.IMAGE) {
    return ''
  }
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
  const resolvedRowMargin =
    typeof inherited.defaultBasicRowMarginHeight === 'number'
      ? inherited.defaultBasicRowMarginHeight *
        getRowMarginRatio(size) *
        (element.rowMargin ?? inherited.defaultRowMargin ?? 1)
      : inherited.rowMargin
  const font = resolveRunFontFamily(element, inherited)
  const metric = measureText(
    element.value || getSyntheticElementText(element) || '\u4e2d',
    font,
    size,
    element.bold ?? inherited.bold,
    element.italic ?? inherited.italic
  )
  const style: ITableCellTextFallbackStyle & {
    font: string
    size: number
    color: string
    lineHeight: number
    ascent: number
    descent: number
  } = {
    font,
    size,
    rowMargin: resolvedRowMargin,
    defaultRowMargin: inherited.defaultRowMargin,
    defaultBasicRowMarginHeight: inherited.defaultBasicRowMarginHeight,
    baselineShift,
    ascent: metric.ascent,
    descent: metric.descent,
    bold: element.bold ?? inherited.bold,
    italic: element.italic ?? inherited.italic,
    underline: element.underline ?? inherited.underline,
    strikeout: element.strikeout ?? inherited.strikeout,
    letterSpacing: element.letterSpacing ?? inherited.letterSpacing,
    color: element.color || inherited.color || '#000000',
    highlight: element.highlight ?? inherited.highlight,
    linkUrl:
      element.type === ElementType.HYPERLINK
        ? element.url || inherited.linkUrl
        : inherited.linkUrl,
    areaId: element.areaId || inherited.areaId,
    areaBackgroundColor:
      element.area?.backgroundColor || inherited.areaBackgroundColor,
    areaBorderColor:
      element.area?.borderColor || inherited.areaBorderColor,
    controlKey:
      element.type === ElementType.CONTROL ? element : inherited.controlKey,
    controlBorder:
      element.type === ElementType.CONTROL
        ? Boolean(element.control?.border)
        : inherited.controlBorder,
    controlPlaceholderColor: inherited.controlPlaceholderColor,
    controlBracketColor: inherited.controlBracketColor,
    controlPrefix: inherited.controlPrefix,
    controlPostfix: inherited.controlPostfix,
    tabWidth: inherited.tabWidth,
    checkboxGap: inherited.checkboxGap,
    radioGap: inherited.radioGap,
    lineHeight: Math.max(inherited.lineHeight || 0, (() => {
      const intrinsicLineHeight = measureLineHeight(
        font,
        size,
        element.bold ?? inherited.bold,
        element.italic ?? inherited.italic
      )
      if (
        element.type === ElementType.SUPERSCRIPT ||
        element.type === ElementType.SUBSCRIPT
      ) {
        return intrinsicLineHeight + size / 2
      }
      return intrinsicLineHeight
    })())
  }
  return style
}

function createFailureTextRun(
  issue: string,
  element: IElement,
  inherited: ITableCellTextFallbackStyle
): IStyledTextRun {
  const failureText = `渲染[${issue}]失败`
  const style = createRunStyle(
    createSyntheticTextElement(failureText, {
      font: element.font,
      size: element.size,
      color: '#ff0000'
    }),
    inherited
  )

  return {
    text: failureText,
    font: style.font,
    size: style.size,
    ascent: style.ascent,
    descent: style.descent,
    rowMargin: style.rowMargin,
    baselineShift: style.baselineShift,
    letterSpacing: style.letterSpacing,
    bold: style.bold,
    italic: style.italic,
    underline: style.underline,
    strikeout: style.strikeout,
    color: style.color,
    highlight: style.highlight,
    linkUrl: style.linkUrl,
    areaId: style.areaId,
    areaBackgroundColor: style.areaBackgroundColor,
    areaBorderColor: style.areaBorderColor,
    controlKey: style.controlKey,
    controlBorder: style.controlBorder,
    lineHeight: style.lineHeight
  }
}

function resolveInlineRunRowMargin(
  element: IElement,
  inherited: ITableCellTextFallbackStyle
) {
  const baseSize = element.size || inherited.size || 12
  return typeof inherited.defaultBasicRowMarginHeight === 'number'
    ? inherited.defaultBasicRowMarginHeight *
      getRowMarginRatio(baseSize) *
      (element.rowMargin ?? inherited.defaultRowMargin ?? 1)
    : inherited.rowMargin
}

function createInlineRasterRun(
  element: IElement,
  inherited: ITableCellTextFallbackStyle,
  payload: {
    dataUrl: string
    width: number
    height: number
    crop?: IElement['imgCrop']
  }
): IStyledTextRun {
  const baseSize = element.size || inherited.size || 12
  const rowMargin = resolveInlineRunRowMargin(element, inherited)

  return {
    text: '\u200c',
    font: inherited.font || 'Song',
    size: payload.height || baseSize,
    ascent: payload.height,
    descent: 0,
    rowMargin,
    widthOverride: payload.width,
    color: inherited.color || '#000000',
    highlight: element.highlight ?? inherited.highlight,
    inlineImageDataUrl: payload.dataUrl,
    inlineImageWidth: payload.width,
    inlineImageHeight: payload.height,
    inlineImageCrop: payload.crop,
    lineHeight: payload.height || baseSize
  }
}

function createInlineImageRun(
  element: IElement,
  inherited: ITableCellTextFallbackStyle
): IStyledTextRun {
  return createInlineRasterRun(element, inherited, {
    dataUrl: element.value!,
    width: element.width!,
    height: element.height!,
    crop: element.imgCrop
  })
}

function createInlineLatexRun(
  element: IElement,
  inherited: ITableCellTextFallbackStyle
) {
  const asset = resolveLatexAsset(element)
  if (!asset?.svgDataUrl) {
    return createFailureTextRun('LATEX', element, inherited)
  }

  return createInlineRasterRun(element, inherited, {
    dataUrl: asset.svgDataUrl,
    width: asset.width,
    height: asset.height
  })
}

function createInlineLabelRun(
  element: IElement,
  inherited: ITableCellTextFallbackStyle
) {
  const text = element.value || ''
  if (!text.trim()) {
    return null
  }

  const font = element.font || inherited.font || 'Song'
  const size = element.size || inherited.size || 12
  const bold = element.bold ?? inherited.bold
  const italic = element.italic ?? inherited.italic
  const color =
    element.label?.color || defaultLabelOption.defaultColor
  const backgroundColor =
    element.label?.backgroundColor ||
    defaultLabelOption.defaultBackgroundColor
  const borderRadius =
    element.label?.borderRadius ||
    defaultLabelOption.defaultBorderRadius
  const padding =
    element.label?.padding || defaultLabelOption.defaultPadding
  const metric = measureText(text, font, size, bold, italic)
  const textWidth = metric.width
  const width = textWidth + padding[1] + padding[3]
  const height = size + padding[0] + padding[2]
  const fontWeight = bold ? 'bold' : 'normal'
  const fontStyle = italic ? 'italic' : 'normal'
  const ascent = padding[0] + metric.ascent
  const baselineShift = height - ascent
  const canvasDataUrl = createCanvasDataUrl(
    width,
    height,
    ctx => {
      ctx.save()
      ctx.font = createCanvasFont(font, size, bold, italic)
      ctx.fillStyle = backgroundColor
      drawRoundedRect(ctx, 0, 0, width, height, borderRadius)
      ctx.fill()
      ctx.fillStyle = color
      ctx.textBaseline = 'alphabetic'
      ctx.fillText(text, padding[3], padding[0] + metric.ascent)
      ctx.restore()
    },
    3
  )
  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="${width}" height="${height}" rx="${borderRadius}" ry="${borderRadius}" fill="${backgroundColor}" />
  <text x="${padding[3]}" y="${padding[0] + metric.ascent}" fill="${color}" font-family="${escapeSvgText(font)}" font-size="${size}" font-style="${fontStyle}" font-weight="${fontWeight}">${escapeSvgText(text)}</text>
</svg>`.trim()

  return {
    text: '\u200c',
    font,
    size,
    ascent,
    descent: Math.max(0, height - ascent),
    rowMargin: resolveInlineRunRowMargin(element, inherited),
    baselineShift,
    widthOverride: width,
    color,
    highlight: element.highlight ?? inherited.highlight,
    linkUrl: inherited.linkUrl,
    areaId: element.areaId || inherited.areaId,
    areaBackgroundColor:
      element.area?.backgroundColor || inherited.areaBackgroundColor,
    areaBorderColor:
      element.area?.borderColor || inherited.areaBorderColor,
    controlKey: inherited.controlKey,
    controlBorder: inherited.controlBorder,
    inlineImageDataUrl: canvasDataUrl || createSvgDataUrl(svg),
    inlineImageWidth: width,
    inlineImageHeight: height,
    lineHeight: Math.max(inherited.lineHeight || 0, height)
  }
}

function createInlineSymbolRun(
  element: IElement,
  inherited: ITableCellTextFallbackStyle
) {
  const text = element.value || getSyntheticElementText(element)
  if (!text || !SYMBOL_FONT_REG.test(text)) {
    return null
  }

  const style = createRunStyle(element, inherited)
  const width = measureText(
    text,
    style.font,
    style.size,
    style.bold,
    style.italic
  ).width
  const height = Math.max(
    style.size,
    Math.ceil((style.ascent || 0) + (style.descent || 0))
  )
  const fontWeight = style.bold ? 'bold' : 'normal'
  const fontStyle = style.italic ? 'italic' : 'normal'
  const baseline = Math.max(style.size, height - 1)
  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <text x="0" y="${baseline}" fill="${style.color}" font-family="${escapeSvgText(style.font)}" font-size="${style.size}" font-style="${fontStyle}" font-weight="${fontWeight}">${escapeSvgText(text)}</text>
</svg>`.trim()

  return {
    text: '\u200c',
    font: style.font,
    size: style.size,
    ascent: height,
    descent: 0,
    rowMargin: style.rowMargin,
    baselineShift: style.baselineShift,
    widthOverride: width,
    color: style.color,
    highlight: style.highlight,
    linkUrl: style.linkUrl,
    areaId: style.areaId,
    areaBackgroundColor: style.areaBackgroundColor,
    areaBorderColor: style.areaBorderColor,
    controlKey: style.controlKey,
    controlBorder: style.controlBorder,
    inlineImageDataUrl: createSvgDataUrl(svg),
    inlineImageWidth: width,
    inlineImageHeight: height,
    lineHeight: style.lineHeight
  }
}

function createInlineCheckControlRun(
  element: IElement,
  inherited: ITableCellTextFallbackStyle
) {
  const isCheckbox = element.type === ElementType.CHECKBOX
  const isRadio = element.type === ElementType.RADIO
  if (!isCheckbox && !isRadio) {
    return null
  }

  const style = createRunStyle(element, inherited)
  const option = isCheckbox ? defaultCheckboxOption : defaultRadioOption
  const width = option.width + option.gap * 2
  const height = option.height
  const imageHeight = option.height + Math.ceil(option.lineWidth * 2)
  const baselineShift = imageHeight - height
  const dataUrl =
    createCanvasDataUrl(width, imageHeight, ctx => {
      const left = Math.round(option.gap)
      const top = Math.round(option.lineWidth)
      const boxWidth = option.width
      const boxHeight = option.height

      ctx.save()
      ctx.beginPath()
      ctx.translate(0.5, 0.5)

      if (isCheckbox) {
        if (element.checkbox?.value) {
          ctx.fillStyle = defaultCheckboxOption.checkFillStyle
          ctx.fillRect(left, top, boxWidth, boxHeight)
          ctx.beginPath()
          ctx.lineWidth = defaultCheckboxOption.lineWidth
          ctx.strokeStyle = defaultCheckboxOption.checkStrokeStyle
          ctx.rect(left, top, boxWidth, boxHeight)
          ctx.stroke()
          ctx.beginPath()
          ctx.strokeStyle = defaultCheckboxOption.checkMarkColor
          ctx.lineWidth = defaultCheckboxOption.lineWidth * 2
          ctx.lineCap = 'round'
          ctx.lineJoin = 'round'
          ctx.moveTo(left + 2, top + boxHeight / 2)
          ctx.lineTo(left + boxWidth / 2, top + boxHeight - 3)
          ctx.lineTo(left + boxWidth - 2, top + 3)
          ctx.stroke()
        } else {
          ctx.fillStyle = defaultCheckboxOption.fillStyle
          ctx.fillRect(left, top, boxWidth, boxHeight)
          ctx.beginPath()
          ctx.lineWidth = defaultCheckboxOption.lineWidth
          ctx.strokeStyle = defaultCheckboxOption.strokeStyle
          ctx.rect(left, top, boxWidth, boxHeight)
          ctx.stroke()
        }
      } else {
        ctx.beginPath()
        ctx.lineWidth = defaultRadioOption.lineWidth
        ctx.strokeStyle = element.radio?.value
          ? defaultRadioOption.fillStyle
          : defaultRadioOption.strokeStyle
        ctx.arc(
          left + boxWidth / 2,
          top + boxHeight / 2,
          boxWidth / 2,
          0,
          Math.PI * 2
        )
        ctx.stroke()
        if (element.radio?.value) {
          ctx.beginPath()
          ctx.fillStyle = defaultRadioOption.fillStyle
          ctx.arc(
            left + boxWidth / 2,
            top + boxHeight / 2,
            boxWidth / 3,
            0,
            Math.PI * 2
          )
          ctx.fill()
        }
      }

      ctx.closePath()
      ctx.restore()
    }) ||
    createSvgDataUrl('<svg xmlns="http://www.w3.org/2000/svg"></svg>')

  return {
    text: '\u200c',
    font: style.font,
    size: style.size,
    ascent: height,
    descent: imageHeight - height,
    rowMargin: style.rowMargin,
    baselineShift,
    widthOverride: width,
    color: style.color,
    highlight: style.highlight,
    linkUrl: style.linkUrl,
    areaId: style.areaId,
    areaBackgroundColor: style.areaBackgroundColor,
    areaBorderColor: style.areaBorderColor,
    controlKey: style.controlKey,
    controlBorder: style.controlBorder,
    inlineImageDataUrl: dataUrl,
    inlineImageWidth: width,
    inlineImageHeight: imageHeight,
    lineHeight: Math.max(style.lineHeight, imageHeight)
  }
}

export function extractElementTextRuns(
  elementList: IElement[],
  inherited: ITableCellTextFallbackStyle = {}
) {
  const runList: IStyledTextRun[] = []
  elementList.forEach(element => {
    const checkControlRun = createInlineCheckControlRun(element, inherited)
    if (checkControlRun) {
      runList.push(checkControlRun)
      return
    }
    const symbolRun = createInlineSymbolRun(element, inherited)
    if (symbolRun) {
      runList.push(symbolRun)
      return
    }
    if (isInlineImageElement(element)) {
      runList.push(createInlineImageRun(element, inherited))
      return
    }
    if (element.type === ElementType.LATEX) {
      runList.push(createInlineLatexRun(element, inherited))
      return
    }
    if (element.type === ElementType.LABEL) {
      const labelRun = createInlineLabelRun(element, inherited)
      if (labelRun) {
        runList.push(labelRun)
      }
      return
    }

    const style = createRunStyle(element, inherited)
    if (element.type === ElementType.TAB) {
      runList.push({
        text: ' ',
        widthOverride: style.tabWidth || 0,
        font: style.font,
        size: style.size,
        ascent: style.ascent,
        descent: style.descent,
        rowMargin: style.rowMargin,
        baselineShift: style.baselineShift,
        letterSpacing: style.letterSpacing,
        bold: style.bold,
        italic: style.italic,
        underline: style.underline,
        strikeout: style.strikeout,
        color: style.color,
        highlight: style.highlight,
        linkUrl: style.linkUrl,
        areaId: style.areaId,
        areaBackgroundColor: style.areaBackgroundColor,
        areaBorderColor: style.areaBorderColor,
        controlKey: style.controlKey,
        controlBorder: style.controlBorder,
        lineHeight: style.lineHeight
      })
      return
    }

    const text = element.value || getSyntheticElementText(element)
    if (text) {
      runList.push({
        text,
        widthOverride: element.width,
        font: style.font,
        size: style.size,
        ascent: style.ascent,
        descent: style.descent,
        rowMargin: style.rowMargin,
        baselineShift: style.baselineShift,
        letterSpacing: style.letterSpacing,
        bold: style.bold,
        italic: style.italic,
        underline: style.underline,
        strikeout: style.strikeout,
        color: style.color,
        highlight: style.highlight,
        linkUrl: style.linkUrl,
        areaId: style.areaId,
        areaBackgroundColor: style.areaBackgroundColor,
        areaBorderColor: style.areaBorderColor,
        controlKey: style.controlKey,
        controlBorder: style.controlBorder,
        lineHeight: style.lineHeight
      })
    }
    if (element.valueList?.length) {
      runList.push(
        ...extractElementTextRuns(
          element.valueList,
          element.type === ElementType.TITLE
            ? {
                ...style,
                lineHeight: undefined
              }
            : style
        )
      )
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
    lineHeight: Math.max(
      fallback.lineHeight || 0,
      measureLineHeight(
        firstRun?.font || fallback.font || 'Song',
        size,
        firstRun?.bold ?? fallback.bold,
        firstRun?.italic ?? fallback.italic
      )
    )
  }
}
