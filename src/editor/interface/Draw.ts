import { ImageDisplay } from '../dataset/enum/Common'
import { EditorMode, EditorZone, PaperDirection } from '../dataset/enum/Editor'
import { IElement, IElementPosition } from './Element'
import { IRow } from './Row'

export interface IDrawOption {
  curIndex?: number
  isSetCursor?: boolean
  isSubmitHistory?: boolean
  isCompute?: boolean
  isLazy?: boolean
  isInit?: boolean
  isSourceHistory?: boolean
  isFirstRender?: boolean
}

export interface IForceUpdateOption {
  isSubmitHistory?: boolean
}

export interface IDrawImagePayload {
  id?: string
  conceptId?: string
  width: number
  height: number
  value: string
  imgDisplay?: ImageDisplay
  extension?: unknown
}

export interface IDrawRowPayload {
  elementList: IElement[]
  positionList: IElementPosition[]
  rowList: IRow[]
  pageNo: number
  startIndex: number
  innerWidth: number
  zone?: EditorZone
  isDrawLineBreak?: boolean
  isDrawWhiteSpace?: boolean
}

export interface IDrawFloatPayload {
  pageNo: number
  imgDisplays: ImageDisplay[]
}

export interface IDrawPagePayload {
  elementList: IElement[]
  positionList: IElementPosition[]
  rowList: IRow[]
  pageNo: number
}

export interface IPainterOption {
  isDblclick: boolean
}

export interface IGetValueOption {
  pageNo?: number
  extraPickAttrs?: Array<keyof IElement>
}

export type IGetOriginValueOption = Omit<IGetValueOption, 'extraPickAttrs'>

export interface IAppendElementListOption {
  isPrepend?: boolean
  isSubmitHistory?: boolean
}

export interface IGetImageOption {
  pixelRatio?: number
  mode?: EditorMode
  snapDomFunction?: (iframe: HTMLIFrameElement) => Promise<string>
}

export interface IComputeRowListPayload {
  innerWidth: number
  elementList: IElement[]
  startX?: number
  startY?: number
  isFromTable?: boolean
  isPagingMode?: boolean
  pageHeight?: number
  mainOuterHeight?: number
  surroundElementList?: IElement[]
}

export interface IPdfExportPageSnapshot {
  readonly pageNo: number
  readonly width: number
  readonly height: number
  readonly rowList: ReadonlyArray<IRow>
  readonly positionList: ReadonlyArray<IElementPosition>
}

export interface IPdfExportStyleSnapshot {
  readonly scale: number
  readonly defaultSize: number
  readonly defaultBasicRowMarginHeight: number
  readonly defaultRowMargin: number
  readonly underlineColor: string
  readonly strikeoutColor: string
  readonly highlightAlpha: number
  readonly highlightMarginHeight: number
}

export interface IPdfExportSnapshot {
  readonly pageDirection: PaperDirection
  readonly pageWidth: number
  readonly pageHeight: number
  readonly pageList: ReadonlyArray<IPdfExportPageSnapshot>
  readonly elementList: ReadonlyArray<IElement>
  readonly styleOptions: IPdfExportStyleSnapshot
  readonly controlHighlights: Readonly<Record<number, string>>
}
