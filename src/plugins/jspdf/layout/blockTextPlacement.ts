import type { IElement } from '../../../editor/interface/Element'
import { RowFlex } from '../../../editor/dataset/enum/Row'
import type { ITextPlacement } from './textPlacement'
import {
  createStyledTextRunPlacements,
  type IStyledTextPlacementLine
} from './styledTextRunPlacement'
import { extractElementTextRuns } from './tableCellText'

export interface ICreateBlockTextPlacementsOption {
  element: IElement
  x: number
  y: number
  width: number
  indent?: number
  fallbackFont?: string
  fallbackSize?: number
  fallbackColor?: string
  fallbackBold?: boolean
  fallbackItalic?: boolean
  fallbackLineHeight?: number
  fallbackRowMargin?: number
  fallbackDefaultRowMargin?: number
  fallbackDefaultBasicRowMarginHeight?: number
  fallbackTabWidth?: number
  fallbackControlPlaceholderColor?: string
  fallbackControlBracketColor?: string
  fallbackControlPrefix?: string
  fallbackControlPostfix?: string
  fallbackCheckboxGap?: number
  fallbackRadioGap?: number
  measureWidth: (
    text: string,
    style?: {
      font: string
      size: number
      bold?: boolean
      italic?: boolean
    }
  ) => number
}

export interface IBlockTextPlacementResult {
  placementList: ITextPlacement[]
  contentHeight: number
  lineList: IStyledTextPlacementLine[]
}

export function createBlockTextPlacementResult(
  option: ICreateBlockTextPlacementsOption
): IBlockTextPlacementResult {
  const runList = extractElementTextRuns([option.element], {
    font: option.fallbackFont,
    size: option.fallbackSize,
    color: option.fallbackColor,
    bold: option.fallbackBold,
    italic: option.fallbackItalic,
    lineHeight: option.fallbackLineHeight,
    rowMargin: option.fallbackRowMargin,
    defaultRowMargin: option.fallbackDefaultRowMargin,
    defaultBasicRowMarginHeight: option.fallbackDefaultBasicRowMarginHeight,
    tabWidth: option.fallbackTabWidth,
    controlPlaceholderColor: option.fallbackControlPlaceholderColor,
    controlBracketColor: option.fallbackControlBracketColor,
    controlPrefix: option.fallbackControlPrefix,
    controlPostfix: option.fallbackControlPostfix,
    checkboxGap: option.fallbackCheckboxGap,
    radioGap: option.fallbackRadioGap
  })
  if (!runList.length) {
    return {
      placementList: [],
      contentHeight: 0,
      lineList: []
    }
  }

  return createStyledTextRunPlacements({
    runList,
    x: option.x + (option.indent || 0),
    y: option.y,
    width: Math.max(1, option.width - (option.indent || 0)),
    rowFlex:
      option.element.rowFlex === RowFlex.CENTER ||
      option.element.rowFlex === RowFlex.RIGHT ||
      option.element.rowFlex === RowFlex.ALIGNMENT ||
      option.element.rowFlex === RowFlex.JUSTIFY
        ? option.element.rowFlex
        : undefined,
    measureWidth: option.measureWidth
  })
}

export function createBlockTextPlacements(
  option: ICreateBlockTextPlacementsOption
) {
  return createBlockTextPlacementResult(option).placementList
}
