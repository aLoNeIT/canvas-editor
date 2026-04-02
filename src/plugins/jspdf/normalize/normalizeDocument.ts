import type { IJspdfSourceState } from '../source/readEditorState'
import type {
  IDocumentBlockNode,
  IDocumentModel,
  IZoneModel
} from '../model/document'
import { TitleLevel } from '../../../editor/dataset/enum/Title'

function getBlockKind(element: IDocumentBlockNode['element']): IDocumentBlockNode['kind'] {
  switch (element.type) {
    case 'table':
      return 'table'
    case 'image':
      return 'image'
    case 'latex':
      return 'latex'
    case 'control':
    case 'checkbox':
    case 'radio':
      return 'control'
    case 'block':
      return 'block'
    default:
      return 'paragraph'
  }
}

function createZone(
  key: IZoneModel['key'],
  elementList: IJspdfSourceState['result']['data']['main']
): IZoneModel {
  const blockList: IDocumentBlockNode[] = elementList.map(element => ({
    kind: getBlockKind(element),
    element
  }))

  return {
    key,
    elementList,
    blockList,
    height: blockList.length * 24
  }
}

export function normalizeDocument(source: IJspdfSourceState): IDocumentModel {
  const data = source.result.data

  return {
    width: source.options.width,
    height: source.options.height,
    margins: [...source.options.margins],
    scale: source.options.scale,
    defaults: {
      defaultFont: source.options.defaultFont,
      defaultSize: source.options.defaultSize,
      defaultColor: source.options.defaultColor,
      defaultRowMargin: source.options.defaultRowMargin,
      defaultBasicRowMarginHeight: source.options.defaultBasicRowMarginHeight,
      backgroundColor: source.options.background.color,
      backgroundImage: source.options.background.image,
      backgroundSize: source.options.background.size,
      backgroundRepeat: source.options.background.repeat,
      backgroundApplyPageNumbers: [...source.options.background.applyPageNumbers],
      listInheritStyle: source.options.list.inheritStyle,
      labelDefaultColor: source.options.label.defaultColor,
      labelDefaultBackgroundColor:
        source.options.label.defaultBackgroundColor,
      labelDefaultBorderRadius: source.options.label.defaultBorderRadius,
      labelDefaultPadding: [...source.options.label.defaultPadding],
      pageNumber: {
        bottom: source.options.pageNumber.bottom,
        size: source.options.pageNumber.size,
        font: source.options.pageNumber.font,
        color: source.options.pageNumber.color,
        rowFlex: source.options.pageNumber.rowFlex,
        format: source.options.pageNumber.format,
        numberType: source.options.pageNumber.numberType,
        disabled: source.options.pageNumber.disabled,
        startPageNo: source.options.pageNumber.startPageNo,
        fromPageNo: source.options.pageNumber.fromPageNo
      },
      watermark: {
        data: source.options.watermark.data,
        type: source.options.watermark.type,
        width: source.options.watermark.width,
        height: source.options.watermark.height,
        color: source.options.watermark.color,
        opacity: source.options.watermark.opacity,
        size: source.options.watermark.size,
        font: source.options.watermark.font,
        repeat: source.options.watermark.repeat,
        gap: [...source.options.watermark.gap],
        numberType: source.options.watermark.numberType
      },
      titleSizeMapping: {
        [TitleLevel.FIRST]: source.options.title.defaultFirstSize,
        [TitleLevel.SECOND]: source.options.title.defaultSecondSize,
        [TitleLevel.THIRD]: source.options.title.defaultThirdSize,
        [TitleLevel.FOURTH]: source.options.title.defaultFourthSize,
        [TitleLevel.FIFTH]: source.options.title.defaultFifthSize,
        [TitleLevel.SIXTH]: source.options.title.defaultSixthSize
      }
    },
    header: createZone('header', data.header || []),
    main: createZone('main', data.main || []),
    footer: createZone('footer', data.footer || [])
  }
}
