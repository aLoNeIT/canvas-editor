import type { IJspdfSourceState } from '../source/readEditorState'
import type {
  IDocumentBlockNode,
  IDocumentGraffitiPage,
  IDocumentModel,
  IZoneModel
} from '../model/document'
import { ImageDisplay } from '../../../editor/dataset/enum/Common'
import { ElementType } from '../../../editor/dataset/enum/Element'
import { TitleLevel } from '../../../editor/dataset/enum/Title'
import { resolveLatexAsset } from '../layout/latex'

let syntheticListIdSeed = 0

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

function isVirtualWrapperElement(element: IDocumentBlockNode['element']) {
  return (
    element.type === ElementType.AREA ||
    element.type === ElementType.TITLE ||
    element.type === ElementType.LIST ||
    element.type === ElementType.HYPERLINK ||
    element.type === ElementType.DATE
  )
}

function isFlattenWrapperElement(element: IDocumentBlockNode['element']) {
  return element.type === ElementType.AREA
}

function isHiddenElement(element: IDocumentBlockNode['element']) {
  return Boolean(element.hide || element.control?.hide || element.area?.hide)
}

function mergeWrapperIntoChild(
  wrapper: IDocumentBlockNode['element'],
  child: IDocumentBlockNode['element']
) {
  const {
    type: _type,
    value: _value,
    valueList: _valueList,
    ...inherited
  } = wrapper
  void _type
  void _value
  void _valueList

  return {
    ...inherited,
    ...child
  }
}

function normalizeValueList(
  elementList: IJspdfSourceState['result']['data']['main'],
  defaultHyperlinkColor: string
): IJspdfSourceState['result']['data']['main'] {
  return elementList.flatMap(element => {
    if (isHiddenElement(element)) {
      return []
    }

    const normalizedElement = normalizeElement(
      element,
      defaultHyperlinkColor
    )

    if (!normalizedElement.valueList?.length) {
      return [normalizedElement]
    }

    if (!isVirtualWrapperElement(normalizedElement)) {
      const normalizedChildren = normalizeValueList(
        normalizedElement.valueList,
        defaultHyperlinkColor
      )
      return [
        {
          ...normalizedElement,
          valueList: normalizedChildren
        }
      ]
    }

    if (isFlattenWrapperElement(normalizedElement)) {
      return normalizeValueList(
        normalizedElement.valueList.map(child =>
          mergeWrapperIntoChild(normalizedElement, child)
        ),
        defaultHyperlinkColor
      )
    }

    const normalizedChildren = normalizeValueList(
      normalizedElement.valueList,
      defaultHyperlinkColor
    )
    const trimmedChildren = trimParagraphBoundaryNewlines(normalizedChildren)
    if (!normalizedElement.value && !trimmedChildren.length) {
      return []
    }

    return [
      {
        ...normalizedElement,
        valueList: trimmedChildren
      }
    ]
  })
}

function normalizeElement(
  element: IJspdfSourceState['result']['data']['main'][number],
  defaultHyperlinkColor: string
) {
  if (element.type === ElementType.HYPERLINK) {
    return {
      ...element,
      color: element.color || defaultHyperlinkColor,
      underline: element.underline ?? true
    }
  }

  if (element.type !== ElementType.LATEX) {
    return element
  }

  const asset = resolveLatexAsset(element)
  if (!asset) {
    return element
  }

  return {
    ...element,
    width: element.width || asset.width,
    height: element.height || asset.height,
    laTexSVG: element.laTexSVG || asset.svgDataUrl
  }
}

function createZone(
  key: IZoneModel['key'],
  elementList: IJspdfSourceState['result']['data']['main'],
  defaultHyperlinkColor: string
): IZoneModel {
  const normalizedElementList = normalizeValueList(
    elementList,
    defaultHyperlinkColor
  )
  const blockList = createBlockList(normalizedElementList)

  return {
    key,
    elementList: normalizedElementList,
    blockList,
    height: blockList.length * 24
  }
}

function isStandaloneBlockElement(element: IDocumentBlockNode['element']) {
  return (
    element.type === ElementType.LIST ||
    element.type === ElementType.DATE ||
    element.type === ElementType.TABLE ||
    (element.type === ElementType.IMAGE &&
      (element.imgDisplay === ImageDisplay.BLOCK ||
        element.imgDisplay === ImageDisplay.SURROUND ||
        element.imgDisplay === ImageDisplay.FLOAT_TOP ||
        element.imgDisplay === ImageDisplay.FLOAT_BOTTOM)) ||
    element.type === ElementType.BLOCK ||
    element.type === ElementType.SEPARATOR ||
    element.type === ElementType.PAGE_BREAK
  )
}

function createParagraphBlock(
  inlineElementList: IJspdfSourceState['result']['data']['main']
): IDocumentBlockNode | null {
  const trimmedInlineElementList = trimParagraphBoundaryNewlines(inlineElementList)
  if (!trimmedInlineElementList.length) {
    return null
  }

  if (trimmedInlineElementList.length === 1) {
    return {
      kind: 'paragraph',
      element: trimmedInlineElementList[0]
    }
  }

  const paragraphProps = resolveParagraphProps(trimmedInlineElementList)

  return {
    kind: 'paragraph',
    element: {
      value: '',
      valueList: trimmedInlineElementList,
      ...paragraphProps
    }
  }
}

function resolveParagraphProps(
  inlineElementList: IJspdfSourceState['result']['data']['main']
) {
  const [firstElement] = inlineElementList
  if (!firstElement) {
    return {}
  }

  const hasSameRowFlex = inlineElementList.every(
    element => element.rowFlex === firstElement.rowFlex
  )
  const hasSameRowMargin = inlineElementList.every(
    element => element.rowMargin === firstElement.rowMargin
  )

  return {
    ...(hasSameRowFlex && firstElement.rowFlex
      ? { rowFlex: firstElement.rowFlex }
      : {}),
    ...(hasSameRowMargin && typeof firstElement.rowMargin === 'number'
      ? { rowMargin: firstElement.rowMargin }
      : {})
  }
}

function isTextParagraphElement(
  element: IJspdfSourceState['result']['data']['main'][number]
) {
  return (
    !element.type ||
    element.type === ElementType.TEXT ||
    element.type === ElementType.SUBSCRIPT ||
    element.type === ElementType.SUPERSCRIPT
  )
}

function trimLeadingNewlines(
  elementList: IJspdfSourceState['result']['data']['main']
) {
  const trimmedElementList = [...elementList]

  while (trimmedElementList.length) {
    const firstElement = trimmedElementList[0]
    if (!isTextParagraphElement(firstElement)) {
      break
    }
    const nextValue = (firstElement.value || '').replace(/^\n+/, '')
    if (nextValue === (firstElement.value || '')) {
      break
    }
    if (!nextValue && !firstElement.valueList?.length) {
      trimmedElementList.shift()
      continue
    }
    trimmedElementList[0] = {
      ...firstElement,
      value: nextValue
    }
    break
  }

  return trimmedElementList
}

function trimTrailingNewlines(
  elementList: IJspdfSourceState['result']['data']['main']
) {
  const trimmedElementList = [...elementList]

  while (trimmedElementList.length) {
    const lastIndex = trimmedElementList.length - 1
    const lastElement = trimmedElementList[lastIndex]
    if (!isTextParagraphElement(lastElement)) {
      break
    }
    const nextValue = (lastElement.value || '').replace(/\n+$/, '')
    if (nextValue === (lastElement.value || '')) {
      break
    }
    if (!nextValue && !lastElement.valueList?.length) {
      trimmedElementList.pop()
      continue
    }
    trimmedElementList[lastIndex] = {
      ...lastElement,
      value: nextValue
    }
    break
  }

  return trimmedElementList
}

function trimParagraphBoundaryNewlines(
  inlineElementList: IJspdfSourceState['result']['data']['main']
) {
  return trimTrailingNewlines(trimLeadingNewlines(inlineElementList))
}

function createBlockList(
  normalizedElementList: IJspdfSourceState['result']['data']['main']
) {
  const blockList: IDocumentBlockNode[] = []
  let inlineElementList: IJspdfSourceState['result']['data']['main'] = []

  const flushInlineElementList = () => {
    if (!inlineElementList.length) return
    const paragraphBlock = createParagraphBlock(inlineElementList)
    if (paragraphBlock) {
      blockList.push(paragraphBlock)
    }
    inlineElementList = []
  }

  normalizedElementList.forEach(element => {
    if (element.type === ElementType.LIST && element.valueList?.length) {
      flushInlineElementList()
      blockList.push(...createListItemBlocks(element))
      return
    }

    if (element.listId && element.listType) {
      flushInlineElementList()
      const paragraphBlock = createParagraphBlock([element])
      if (paragraphBlock) {
        blockList.push(paragraphBlock)
      }
      return
    }

    if (isStandaloneBlockElement(element)) {
      flushInlineElementList()
      blockList.push({
        kind: getBlockKind(element),
        element
      })
      return
    }

    inlineElementList.push(element)
  })

  flushInlineElementList()

  return blockList
}

function createSyntheticListId() {
  syntheticListIdSeed += 1
  return `__jspdf_list_${syntheticListIdSeed}`
}

function splitListItemValue(value: string) {
  return value
    .split('\n')
    .map(item => item.replace(/\r/g, ''))
    .filter(item => item.length > 0)
}

function createListItemBlocks(
  listElement: IJspdfSourceState['result']['data']['main'][number]
) {
  const listId = listElement.listId || createSyntheticListId()
  const blockList: IDocumentBlockNode[] = []

  listElement.valueList?.forEach(listItem => {
    const mergedListItem = mergeWrapperIntoChild(listElement, listItem)
    const splitValueList =
      !mergedListItem.valueList?.length && mergedListItem.value
        ? splitListItemValue(mergedListItem.value)
        : []

    if (splitValueList.length) {
      splitValueList.forEach(itemValue => {
        blockList.push(...createBlockList([{
          ...mergedListItem,
          value: itemValue,
          listId,
          listType: listElement.listType,
          listStyle: listElement.listStyle
        }]))
      })
      return
    }

    blockList.push(...createBlockList([{
      ...mergedListItem,
      listId,
      listType: listElement.listType,
      listStyle: listElement.listStyle
    }]))
  })

  return blockList
}

function createGraffitiList(source: IJspdfSourceState): IDocumentGraffitiPage[] {
  const defaultLineWidth = source.options.graffiti.defaultLineWidth
  const defaultLineColor = source.options.graffiti.defaultLineColor

  return (source.result.data.graffiti || []).map(page => ({
    pageNo: page.pageNo,
    strokes: (page.strokes || []).map(stroke => ({
      lineWidth: stroke.lineWidth || defaultLineWidth,
      lineColor: stroke.lineColor || defaultLineColor,
      points: [...stroke.points]
    }))
  }))
}

export function normalizeDocument(source: IJspdfSourceState): IDocumentModel {
  syntheticListIdSeed = 0
  const data = source.result.data
  const badge = source.badge || {
    main: null,
    areas: []
  }
  const exportOptions = source.exportOptions || {}

  return {
    width: source.options.width,
    height: source.options.height,
    margins: [...source.options.margins],
    scale: source.options.scale,
    printPageDataUrlList: exportOptions.__printPageDataUrlList,
    disableTextRasterFallback: exportOptions.disableTextRasterFallback ?? true,
    badge: {
      top: source.options.badge.top,
      left: source.options.badge.left,
      main: badge.main
        ? {
            ...badge.main
          }
        : null,
      areas: badge.areas.map(areaBadge => ({
        areaId: areaBadge.areaId,
        badge: {
          ...areaBadge.badge
        }
      }))
    },
    defaults: {
      defaultFont: source.options.defaultFont,
      defaultSize: source.options.defaultSize,
      defaultTabWidth: source.options.defaultTabWidth,
      defaultColor: source.options.defaultColor,
      defaultRowMargin: source.options.defaultRowMargin,
      defaultBasicRowMarginHeight: source.options.defaultBasicRowMarginHeight,
      header: {
        top: source.options.header.top,
        disabled: source.options.header.disabled
      },
      footer: {
        bottom: source.options.footer.bottom,
        disabled: source.options.footer.disabled
      },
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
      imgCaption: {
        color: source.options.imgCaption.color,
        font: source.options.imgCaption.font,
        size: source.options.imgCaption.size,
        top: source.options.imgCaption.top
      },
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
      pageBorder: {
        disabled: source.options.pageBorder.disabled,
        color: source.options.pageBorder.color,
        lineWidth: source.options.pageBorder.lineWidth,
        padding: [...source.options.pageBorder.padding]
      },
      lineNumber: {
        disabled: source.options.lineNumber.disabled,
        size: source.options.lineNumber.size,
        font: source.options.lineNumber.font,
        color: source.options.lineNumber.color,
        right: source.options.lineNumber.right,
        type: source.options.lineNumber.type
      },
      checkbox: {
        gap: source.options.checkbox.gap
      },
      radio: {
        gap: source.options.radio.gap
      },
      control: {
        placeholderColor: source.options.control.placeholderColor,
        bracketColor: source.options.control.bracketColor,
        prefix: source.options.control.prefix,
        postfix: source.options.control.postfix,
        borderWidth: source.options.control.borderWidth,
        borderColor: source.options.control.borderColor
      },
      graffiti: {
        defaultLineWidth: source.options.graffiti.defaultLineWidth,
        defaultLineColor: source.options.graffiti.defaultLineColor
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
    header: createZone(
      'header',
      data.header || [],
      source.options.defaultHyperlinkColor
    ),
    main: createZone(
      'main',
      data.main || [],
      source.options.defaultHyperlinkColor
    ),
    footer: createZone(
      'footer',
      data.footer || [],
      source.options.defaultHyperlinkColor
    ),
    graffiti: createGraffitiList(source)
  }
}
