import type { IElement } from '../../../editor'
import type {
  BackgroundRepeat,
  BackgroundSize
} from '../../../editor/dataset/enum/Background'
import type { NumberType } from '../../../editor/dataset/enum/Common'
import type { RowFlex } from '../../../editor/dataset/enum/Row'
import type { TitleLevel } from '../../../editor/dataset/enum/Title'
import type { WatermarkType } from '../../../editor/dataset/enum/Watermark'

export interface IDocumentInlineNode {
  kind: 'text'
  text: string
  font: string
  size: number
  bold?: boolean
  italic?: boolean
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
  defaultColor: string
  defaultRowMargin: number
  defaultBasicRowMarginHeight: number
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
  titleSizeMapping: Record<TitleLevel, number>
}

export interface IDocumentModel {
  width: number
  height: number
  margins: number[]
  scale: number
  defaults: IDocumentLayoutDefaults
  header: IZoneModel
  main: IZoneModel
  footer: IZoneModel
}
