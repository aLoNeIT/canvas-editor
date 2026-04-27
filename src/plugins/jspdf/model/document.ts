import type { IElement } from '../../../editor'
import type {
  BackgroundRepeat,
  BackgroundSize
} from '../../../editor/dataset/enum/Background'
import type { NumberType } from '../../../editor/dataset/enum/Common'
import type { LineNumberType } from '../../../editor/dataset/enum/LineNumber'
import type { RowFlex } from '../../../editor/dataset/enum/Row'
import type { TitleLevel } from '../../../editor/dataset/enum/Title'
import type { WatermarkType } from '../../../editor/dataset/enum/Watermark'
import type { IAreaBadge, IBadge } from '../../../editor/interface/Badge'
import type { IElementPosition } from '../../../editor/interface/Element'
import type { IRow } from '../../../editor/interface/Row'

export interface IDocumentGraffitiStroke {
  lineWidth: number
  lineColor: string
  points: number[]
}

export interface IDocumentGraffitiPage {
  pageNo: number
  strokes: IDocumentGraffitiStroke[]
}

export interface IDocumentInlineNode {
  kind: 'text'
  text: string
  font: string
  size: number
  bold?: boolean
  italic?: boolean
  letterSpacing?: number
  color?: string
}

export interface IMeasuredInlineNode extends IDocumentInlineNode {
  x: number
  y: number
  width: number
  ascent: number
  descent: number
}

export interface IDocumentBlockNode {
  kind:
    | 'paragraph'
    | 'table'
    | 'image'
    | 'latex'
    | 'control'
    | 'block'
    | 'graffiti'
  element: IElement
  inlineList?: IDocumentInlineNode[]
  width?: number
  height?: number
}

export interface IZoneModel {
  key: 'header' | 'main' | 'footer'
  elementList: IElement[]
  blockList: IDocumentBlockNode[]
  height: number
}

export interface IDocumentLayoutDefaults {
  defaultFont: string
  defaultSize: number
  defaultTabWidth?: number
  defaultColor: string
  defaultRowMargin: number
  defaultBasicRowMarginHeight: number
  highlightAlpha: number
  highlightMarginHeight: number
  header: {
    top: number
    disabled: boolean
  }
  footer: {
    bottom: number
    disabled: boolean
  }
  backgroundColor: string
  backgroundImage: string
  backgroundSize: BackgroundSize
  backgroundRepeat: BackgroundRepeat
  backgroundApplyPageNumbers: number[]
  listInheritStyle: boolean
  labelDefaultColor: string
  labelDefaultBackgroundColor: string
  labelDefaultBorderRadius: number
  labelDefaultPadding: number[]
  imgCaption: {
    color: string
    font: string
    size: number
    top: number
  }
  pageNumber: {
    bottom: number
    size: number
    font: string
    color: string
    rowFlex: RowFlex
    format: string
    numberType: NumberType
    disabled: boolean
    startPageNo: number
    fromPageNo: number
  }
  watermark: {
    data: string
    type: WatermarkType
    width: number
    height: number
    color: string
    opacity: number
    size: number
    font: string
    repeat: boolean
    gap: number[]
    numberType: NumberType
  }
  pageBorder: {
    disabled: boolean
    color: string
    lineWidth: number
    padding: number[]
  }
  lineNumber: {
    disabled: boolean
    size: number
    font: string
    color: string
    right: number
    type: LineNumberType
  }
  checkbox?: {
    gap: number
  }
  radio?: {
    gap: number
  }
  control?: {
    placeholderColor: string
    bracketColor: string
    prefix: string
    postfix: string
    borderWidth: number
    borderColor: string
  }
  graffiti?: {
    defaultLineWidth: number
    defaultLineColor: string
  }
  titleSizeMapping: Record<TitleLevel, number>
}

export interface IDocumentBadgeState {
  top: number
  left: number
  main: IBadge | null
  areas: IAreaBadge[]
}

export interface IDocumentCoreLayoutSnapshot {
  pageRowList: IRow[][]
  headerRowList: IRow[]
  footerRowList: IRow[]
  positionList: IElementPosition[]
  headerPositionList: IElementPosition[]
  footerPositionList: IElementPosition[]
  headerExtraHeight: number
  footerExtraHeight: number
  mainOuterHeight: number
  pageCount: number
  iframeInfoList: unknown[][]
}

export interface IDocumentModel {
  width: number
  height: number
  margins: number[]
  scale: number
  disableTextRasterFallback?: boolean
  coreLayout?: IDocumentCoreLayoutSnapshot | null
  defaults: IDocumentLayoutDefaults
  badge?: IDocumentBadgeState
  header: IZoneModel
  main: IZoneModel
  footer: IZoneModel
  graffiti?: IDocumentGraffitiPage[]
}
