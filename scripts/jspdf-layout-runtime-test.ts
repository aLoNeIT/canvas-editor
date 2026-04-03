import assert from 'node:assert/strict'
import type { ITd } from '../src/editor/interface/table/Td.js'
import {
  TableBorder,
  TdBorder,
  TdSlash
} from '../src/editor/dataset/enum/table/Table.js'
import { VerticalAlign } from '../src/editor/dataset/enum/VerticalAlign.js'
import { ElementType } from '../src/editor/dataset/enum/Element.js'
import { NumberType } from '../src/editor/dataset/enum/Common.js'
import { LineNumberType } from '../src/editor/dataset/enum/LineNumber.js'
import { RowFlex } from '../src/editor/dataset/enum/Row.js'
import { BlockType } from '../src/editor/dataset/enum/Block.js'
import {
  BackgroundRepeat,
  BackgroundSize
} from '../src/editor/dataset/enum/Background.js'
import { WatermarkType } from '../src/editor/dataset/enum/Watermark.js'
import { createTableCellTextPlacements } from '../src/plugins/jspdf/layout/tableCellPlacement.js'
import { createBlockTextPlacements } from '../src/plugins/jspdf/layout/blockTextPlacement.js'
import { layoutTable } from '../src/plugins/jspdf/layout/layoutTable.js'
import { createTextDecorationLines } from '../src/plugins/jspdf/layout/textDecoration.js'
import {
  createBackgroundRect,
  createBackgroundImagePlacement,
  createBackgroundImagePlacements,
  createImageWatermarkPlacement,
  createImageWatermarkPlacements,
  createLineNumberPlacements,
  createPageNumberPlacement,
  createWatermarkPlacement,
  createWatermarkPlacements
} from '../src/plugins/jspdf/layout/framePlacement.js'
import { createLabelPlacement } from '../src/plugins/jspdf/layout/labelPlacement.js'
import { createTableCellVisuals } from '../src/plugins/jspdf/layout/tableVisual.js'
import { createSeparatorVectorLine } from '../src/plugins/jspdf/layout/separatorPlacement.js'
import { paginateTableRows } from '../src/plugins/jspdf/layout/tablePagination.js'
import {
  measureTableRowHeight,
  resolveTableRowHeightList
} from '../src/plugins/jspdf/layout/tableMetrics.js'
import { layoutDocument } from '../src/plugins/jspdf/layout/layoutDocument.js'
import {
  resolveBlockTextStyle,
  resolveListBlockSemantics
} from '../src/plugins/jspdf/layout/blockSemantics.js'
import { resolvePdfTextFontStyle } from '../src/plugins/jspdf/render/fontStyle.js'
import { createTextPlacements } from '../src/plugins/jspdf/layout/textPlacement.js'
import { wrapText } from '../src/plugins/jspdf/layout/wrapText.js'
import { ListStyle, ListType } from '../src/editor/dataset/enum/List.js'
import { TitleLevel } from '../src/editor/dataset/enum/Title.js'

function createMeasureWidth(unitWidth = 10) {
  return (text: string) => text.length * unitWidth
}

function roundTo3(value: number) {
  return Math.round(value * 1000) / 1000
}

function testWrapsLongTextByWidth() {
  const lineList = wrapText({
    text: 'abcdef',
    maxWidth: 30,
    measureWidth: createMeasureWidth()
  })

  assert.deepEqual(lineList, ['abc', 'def'])
}

function testPreservesExplicitLineBreaks() {
  const lineList = wrapText({
    text: 'ab\ncdef',
    maxWidth: 20,
    measureWidth: createMeasureWidth()
  })

  assert.deepEqual(lineList, ['ab', 'cd', 'ef'])
}

function createTd(text: string, colspan = 1, rowspan = 1): ITd {
  return {
    colspan,
    rowspan,
    value: [
      {
        value: text
      }
    ]
  }
}

function testExpandsTableRowHeightForWrappedCellText() {
  const height = measureTableRowHeight({
    tdList: [createTd('abcdef')],
    minHeight: 24,
    baseCellWidth: 42,
    measureWidth: createMeasureWidth(),
    lineHeight: 20
  })

  assert.equal(height, 48)
}

function testMeasuresRowHeightByActualColumnWidth() {
  const height = measureTableRowHeight({
    tdList: [
      {
        ...createTd('abcd'),
        colIndex: 0
      }
    ],
    minHeight: 24,
    columnWidthList: [30, 90],
    measureWidth: createMeasureWidth(),
    lineHeight: 20
  })

  assert.equal(height, 88)
}

function testMeasuresRowHeightByResolvedCellTextSize() {
  const height = measureTableRowHeight({
    tdList: [
      {
        ...createTd('abcd'),
        value: [
          {
            value: 'abcd',
            size: 20
          }
        ]
      }
    ],
    minHeight: 24,
    baseCellWidth: 30,
    measureWidth: createMeasureWidth(),
    lineHeight: 20
  })

  assert.equal(height, 120)
}

function testDistributesRowspanExtraHeightToSpanTailRow() {
  const rowHeightList = resolveTableRowHeightList({
    rowList: layoutTable({
      kind: 'table',
      element: {
        value: '',
        colgroup: [{ width: 42 }],
        trList: [
          {
            height: 20,
            tdList: [createTd('abcdefg', 1, 2)]
          },
          {
            height: 20,
            tdList: []
          }
        ]
      }
    }),
    columnWidthList: [42],
    measureWidth: createMeasureWidth(),
    lineHeight: 20
  })

  assert.deepEqual(rowHeightList, [24, 44])
}

function testCreatesPerLineTextPlacements() {
  const placementList = createTextPlacements({
    text: 'abcdef',
    x: 10,
    y: 20,
    width: 30,
    font: 'Song',
    size: 12,
    lineHeight: 20,
    measureWidth: createMeasureWidth()
  })

  assert.deepEqual(
    placementList.map(placement => placement.text),
    ['abc', 'def']
  )
  assert.deepEqual(
    placementList.map(placement => placement.y),
    [32, 52]
  )
}

function testCreatesSeparateParagraphPlacementsForMultipleRuns() {
  const placementList = createBlockTextPlacements({
    element: {
      value: '',
      valueList: [
        {
          value: 'ab',
          font: 'KaiTi',
          size: 18,
          color: '#ff0000'
        },
        {
          value: 'cd',
          font: 'Song',
          size: 12,
          color: '#0000ff'
        }
      ]
    },
    x: 10,
    y: 20,
    width: 80,
    fallbackFont: 'Song',
    fallbackSize: 12,
    fallbackColor: '#000000',
    measureWidth: createMeasureWidth()
  })

  assert.deepEqual(
    placementList.map(({ text, x, y, font, size, color }) => ({
      text,
      x,
      y,
      font,
      size,
      color
    })),
    [
      {
        text: 'ab',
        x: 10,
        y: 38,
        font: 'KaiTi',
        size: 18,
        color: '#ff0000'
      },
      {
        text: 'cd',
        x: 30,
        y: 38,
        font: 'Song',
        size: 12,
        color: '#0000ff'
      }
    ]
  )
}

function testResolvesTitleFallbackStyleFromLevel() {
  const style = resolveBlockTextStyle(
    {
      value: 'Title',
      level: TitleLevel.FIRST
    },
    {
      defaultFont: 'Song',
      defaultSize: 12,
      defaultColor: '#000000',
      defaultRowMargin: 1,
      defaultBasicRowMarginHeight: 8,
      backgroundColor: '#ffffff',
      backgroundImage: '',
      backgroundSize: BackgroundSize.COVER,
      backgroundRepeat: BackgroundRepeat.NO_REPEAT,
      backgroundApplyPageNumbers: [],
      listInheritStyle: false,
      labelDefaultColor: '#1976d2',
      labelDefaultBackgroundColor: '#e3f2fd',
      labelDefaultBorderRadius: 4,
      labelDefaultPadding: [4, 4, 4, 4],
      pageNumber: {
        bottom: 60,
        size: 12,
        font: 'Song',
        color: '#000000',
        rowFlex: RowFlex.CENTER,
        format: '{pageNo}',
        numberType: NumberType.ARABIC,
        disabled: false,
        startPageNo: 1,
        fromPageNo: 0
      },
      watermark: {
        data: '',
        type: WatermarkType.TEXT,
        width: 0,
        height: 0,
        color: '#cccccc',
        opacity: 0.3,
        size: 20,
        font: 'Song',
        repeat: false,
        gap: [10, 10],
        numberType: NumberType.ARABIC
      },
      pageBorder: {
        disabled: true,
        color: '#000000',
        lineWidth: 1,
        padding: [0, 5, 0, 5]
      },
      lineNumber: {
        disabled: true,
        size: 12,
        font: 'Microsoft YaHei',
        color: '#000000',
        right: 20,
        type: LineNumberType.CONTINUITY
      },
      titleSizeMapping: {
        [TitleLevel.FIRST]: 26,
        [TitleLevel.SECOND]: 24,
        [TitleLevel.THIRD]: 22,
        [TitleLevel.FOURTH]: 20,
        [TitleLevel.FIFTH]: 18,
        [TitleLevel.SIXTH]: 16
      }
    }
  )

  assert.deepEqual(style, {
    font: 'Song',
    size: 26,
    bold: true,
    italic: undefined,
    color: '#000000',
    lineHeight: 34,
    rowMargin: 8
  })
}

function testResolvesOrderedListPrefixWidthAcrossListGroup() {
  const semanticList = resolveListBlockSemantics(
    Array.from({ length: 12 }, (_, index) => ({
      kind: 'paragraph' as const,
      element: {
        value: `Item ${index + 1}`,
        listId: 'list-1',
        listType: ListType.OL,
        listStyle: ListStyle.DECIMAL
      }
    })),
    {
      defaultFont: 'Song',
      defaultSize: 12,
      listInheritStyle: false,
      orderedListGap: 10,
      unorderedListIndent: 20
    },
    createMeasureWidth()
  )

  assert.equal(semanticList[0].indent, 40)
  assert.equal(semanticList[0].markerText, '1.')
  assert.equal(semanticList[9].markerText, '10.')
}

function testOffsetsParagraphPlacementsByResolvedListIndent() {
  const placementList = createBlockTextPlacements({
    element: {
      value: 'ab'
    },
    x: 10,
    y: 20,
    width: 80,
    indent: 40,
    fallbackFont: 'Song',
    fallbackSize: 12,
    fallbackColor: '#000000',
    measureWidth: createMeasureWidth()
  } as any)

  assert.deepEqual(
    placementList.map(({ text, x, y }) => ({
      text,
      x,
      y
    })),
    [
      {
        text: 'ab',
        x: 50,
        y: 32
      }
    ]
  )
}

function testShrinksAndRaisesSuperscriptRuns() {
  const placementList = createBlockTextPlacements({
    element: {
      value: '',
      valueList: [
        {
          value: 'a',
          size: 12
        },
        {
          value: 'b',
          type: ElementType.SUPERSCRIPT,
          size: 12
        }
      ]
    },
    x: 10,
    y: 20,
    width: 80,
    fallbackFont: 'Song',
    fallbackSize: 12,
    fallbackColor: '#000000',
    measureWidth: createMeasureWidth()
  })

  assert.deepEqual(
    placementList.map(({ text, x, y, size }) => ({
      text,
      x,
      y,
      size
    })),
    [
      {
        text: 'a',
        x: 10,
        y: 32,
        size: 12
      },
      {
        text: 'b',
        x: 20,
        y: 28,
        size: 8
      }
    ]
  )
}

function testShrinksAndLowersSubscriptRuns() {
  const placementList = createBlockTextPlacements({
    element: {
      value: '',
      valueList: [
        {
          value: 'a',
          size: 12
        },
        {
          value: 'b',
          type: ElementType.SUBSCRIPT,
          size: 12
        }
      ]
    },
    x: 10,
    y: 20,
    width: 80,
    fallbackFont: 'Song',
    fallbackSize: 12,
    fallbackColor: '#000000',
    measureWidth: createMeasureWidth()
  })

  assert.deepEqual(
    placementList.map(({ text, x, y, size }) => ({
      text,
      x,
      y,
      size
    })),
    [
      {
        text: 'a',
        x: 10,
        y: 32,
        size: 12
      },
      {
        text: 'b',
        x: 20,
        y: 36,
        size: 8
      }
    ]
  )
}

function testCreatesSeparatorVectorLine() {
  const line = createSeparatorVectorLine({
    element: {
      value: '',
      width: 80,
      lineWidth: 2,
      color: '#ff0000',
      dashArray: [4, 2]
    },
    x: 10,
    y: 20
  })

  assert.deepEqual(line, {
    x1: 10,
    y1: 20,
    x2: 90,
    y2: 20,
    color: '#ff0000',
    width: 2,
    dash: [4, 2]
  })
}

function testCreatesLabelPlacement() {
  const placement = createLabelPlacement({
    element: {
      type: ElementType.LABEL,
      value: 'ab',
      size: 12,
      label: {
        color: '#ffffff',
        backgroundColor: '#ff0000',
        padding: [4, 6, 4, 6]
      }
    },
    x: 10,
    y: 20,
    fallbackFont: 'Song',
    fallbackSize: 12,
    fallbackColor: '#000000',
    fallbackBackgroundColor: '#e3f2fd',
    fallbackPadding: [4, 4, 4, 4],
    measureWidth: createMeasureWidth()
  })

  assert.deepEqual(placement, {
    backgroundRect: {
      x: 10,
      y: 20,
      width: 32,
      height: 20,
      color: '#ff0000',
      opacity: 1
    },
    textPlacement: {
      text: 'ab',
      x: 16,
      y: 36,
      width: 20,
      height: 20,
      font: 'Song',
      size: 12,
      bold: undefined,
      italic: undefined,
      color: '#ffffff',
      baselineOffset: 12
    },
    height: 20
  })
}

function testCreatesBackgroundRect() {
  const rect = createBackgroundRect({
    pageWidth: 200,
    pageHeight: 300,
    color: '#f5f5f5'
  })

  assert.deepEqual(rect, {
    x: 0,
    y: 0,
    width: 200,
    height: 300,
    color: '#f5f5f5',
    opacity: 1
  })
}

function testCreatesBackgroundImagePlacementForMatchingPage() {
  const placement = createBackgroundImagePlacement({
    pageNo: 1,
    pageWidth: 200,
    pageHeight: 300,
    image: 'data:image/png;base64,abc',
    size: BackgroundSize.COVER,
    applyPageNumbers: [1]
  })

  assert.deepEqual(placement, {
    x: 0,
    y: 0,
    width: 200,
    height: 300,
    dataUrl: 'data:image/png;base64,abc',
    sourceType: 'background-image'
  })
}

function testSkipsBackgroundImageWhenPageDoesNotMatch() {
  const placement = createBackgroundImagePlacement({
    pageNo: 0,
    pageWidth: 200,
    pageHeight: 300,
    image: 'data:image/png;base64,abc',
    size: BackgroundSize.COVER,
    applyPageNumbers: [1]
  })

  assert.equal(placement, null)
}

function testCreatesRepeatedContainBackgroundImagePlacements() {
  const placements = createBackgroundImagePlacements({
    pageNo: 0,
    pageWidth: 100,
    pageHeight: 80,
    image: 'data:image/png;base64,abc',
    imageWidth: 40,
    imageHeight: 20,
    size: BackgroundSize.CONTAIN,
    repeat: BackgroundRepeat.REPEAT_X,
    applyPageNumbers: []
  })

  assert.deepEqual(placements, [
    {
      x: 0,
      y: 0,
      width: 40,
      height: 20,
      dataUrl: 'data:image/png;base64,abc',
      sourceType: 'background-image'
    },
    {
      x: 40,
      y: 0,
      width: 40,
      height: 20,
      dataUrl: 'data:image/png;base64,abc',
      sourceType: 'background-image'
    },
    {
      x: 80,
      y: 0,
      width: 40,
      height: 20,
      dataUrl: 'data:image/png;base64,abc',
      sourceType: 'background-image'
    }
  ])
}

async function testLayoutDocumentUsesIntrinsicBackgroundImageSize() {
  const imageData = 'data:image/png;base64,intrinsic-background'
  const previousImage = globalThis.Image

  class MockImage {
    width = 40
    height = 20
    naturalWidth = 40
    naturalHeight = 20
    onload: null | (() => void) = null
    onerror: null | (() => void) = null

    setAttribute(...args: [string, string]) {
      void args
      return undefined
    }

    set src(_value: string) {
      this.onload?.()
    }
  }

  const runtimeGlobal = globalThis as any
  runtimeGlobal.Image = MockImage

  try {
    const pageList = await layoutDocument({
      width: 100,
      height: 80,
      margins: [0, 0, 0, 0],
      scale: 1,
      defaults: {
        defaultFont: 'Song',
        defaultSize: 12,
        defaultColor: '#000000',
        defaultRowMargin: 1,
        defaultBasicRowMarginHeight: 8,
        backgroundColor: '#ffffff',
        backgroundImage: imageData,
        backgroundSize: BackgroundSize.CONTAIN,
        backgroundRepeat: BackgroundRepeat.REPEAT_X,
        backgroundApplyPageNumbers: [],
        listInheritStyle: false,
        labelDefaultColor: '#1976d2',
        labelDefaultBackgroundColor: '#e3f2fd',
        labelDefaultBorderRadius: 4,
        labelDefaultPadding: [4, 4, 4, 4],
        pageNumber: {
          bottom: 60,
          size: 12,
          font: 'Song',
          color: '#000000',
          rowFlex: RowFlex.CENTER,
          format: '{pageNo}',
          numberType: NumberType.ARABIC,
          disabled: true,
          startPageNo: 1,
          fromPageNo: 0
        },
        watermark: {
          data: '',
          type: WatermarkType.TEXT,
          width: 0,
          height: 0,
          color: '#cccccc',
          opacity: 0.3,
          size: 20,
          font: 'Song',
          repeat: false,
          gap: [10, 10],
          numberType: NumberType.ARABIC
        },
        pageBorder: {
          disabled: true,
          color: '#000000',
          lineWidth: 1,
          padding: [0, 5, 0, 5]
        },
        lineNumber: {
          disabled: true,
          size: 12,
          font: 'Microsoft YaHei',
          color: '#000000',
          right: 20,
          type: LineNumberType.CONTINUITY
        },
        titleSizeMapping: {
          [TitleLevel.FIRST]: 26,
          [TitleLevel.SECOND]: 24,
          [TitleLevel.THIRD]: 22,
          [TitleLevel.FOURTH]: 20,
          [TitleLevel.FIFTH]: 18,
          [TitleLevel.SIXTH]: 16
        }
      },
      header: {
        key: 'header',
        elementList: [],
        blockList: [],
        height: 0
      },
      main: {
        key: 'main',
        elementList: [],
        blockList: [],
        height: 0
      },
      footer: {
        key: 'footer',
        elementList: [],
        blockList: [],
        height: 0
      }
    })

    assert.deepEqual(
      pageList[0].rasterBlocks.map(
        ({ x, y, width, height, dataUrl, sourceType }) => ({
          x,
          y,
          width,
          height,
          dataUrl,
          sourceType
        })
      ),
      [
        {
          x: 0,
          y: 0,
          width: 40,
          height: 20,
          dataUrl: imageData,
          sourceType: 'background-image'
        },
        {
          x: 40,
          y: 0,
          width: 40,
          height: 20,
          dataUrl: imageData,
          sourceType: 'background-image'
        },
        {
          x: 80,
          y: 0,
          width: 40,
          height: 20,
          dataUrl: imageData,
          sourceType: 'background-image'
        }
      ]
    )
  } finally {
    runtimeGlobal.Image = previousImage
  }
}

async function testLayoutDocumentAppendsPageBorderLines() {
  const pageList = await layoutDocument({
    width: 200,
    height: 300,
    margins: [20, 30, 40, 50],
    scale: 1,
    defaults: {
      defaultFont: 'Song',
      defaultSize: 12,
      defaultColor: '#000000',
      defaultRowMargin: 1,
      defaultBasicRowMarginHeight: 8,
      backgroundColor: '#ffffff',
      backgroundImage: '',
      backgroundSize: BackgroundSize.COVER,
      backgroundRepeat: BackgroundRepeat.NO_REPEAT,
      backgroundApplyPageNumbers: [],
      listInheritStyle: false,
      labelDefaultColor: '#1976d2',
      labelDefaultBackgroundColor: '#e3f2fd',
      labelDefaultBorderRadius: 4,
      labelDefaultPadding: [4, 4, 4, 4],
      pageNumber: {
        bottom: 60,
        size: 12,
        font: 'Song',
        color: '#000000',
        rowFlex: RowFlex.CENTER,
        format: '{pageNo}',
        numberType: NumberType.ARABIC,
        disabled: true,
        startPageNo: 1,
        fromPageNo: 0
      },
      watermark: {
        data: '',
        type: WatermarkType.TEXT,
        width: 0,
        height: 0,
        color: '#cccccc',
        opacity: 0.3,
        size: 20,
        font: 'Song',
        repeat: false,
        gap: [10, 10],
        numberType: NumberType.ARABIC
      },
      pageBorder: {
        disabled: false,
        color: '#123456',
        lineWidth: 2,
        padding: [5, 6, 7, 8]
      },
      lineNumber: {
        disabled: true,
        size: 12,
        font: 'Microsoft YaHei',
        color: '#000000',
        right: 20,
        type: LineNumberType.CONTINUITY
      },
      titleSizeMapping: {
        [TitleLevel.FIRST]: 26,
        [TitleLevel.SECOND]: 24,
        [TitleLevel.THIRD]: 22,
        [TitleLevel.FOURTH]: 20,
        [TitleLevel.FIFTH]: 18,
        [TitleLevel.SIXTH]: 16
      }
    },
    header: {
      key: 'header',
      elementList: [],
      blockList: [],
      height: 12
    },
    main: {
      key: 'main',
      elementList: [],
      blockList: [],
      height: 0
    },
    footer: {
      key: 'footer',
      elementList: [],
      blockList: [],
      height: 18
    }
  } as any)

  assert.deepEqual(
    pageList[0].vectorLines.map(({ x1, y1, x2, y2, color, width }) => ({
      x1,
      y1,
      x2,
      y2,
      color,
      width
    })),
    [
      {
        x1: 42,
        y1: 27,
        x2: 176,
        y2: 27,
        color: '#123456',
        width: 2
      },
      {
        x1: 176,
        y1: 27,
        x2: 176,
        y2: 249,
        color: '#123456',
        width: 2
      },
      {
        x1: 176,
        y1: 249,
        x2: 42,
        y2: 249,
        color: '#123456',
        width: 2
      },
      {
        x1: 42,
        y1: 249,
        x2: 42,
        y2: 27,
        color: '#123456',
        width: 2
      }
    ]
  )
}

async function testLayoutDocumentFallsBackForEmptyControl() {
  const previousDocument = globalThis.document
  const runtimeGlobal = globalThis as any

  const ctx = {
    fillStyle: '#000000',
    strokeStyle: '#000000',
    font: '',
    measureText(text: string) {
      return {
        width: text.length * 10,
        actualBoundingBoxAscent: 12,
        actualBoundingBoxDescent: 8
      }
    },
    fillRect() {
      return undefined
    },
    strokeRect() {
      return undefined
    },
    fillText() {
      return undefined
    }
  }

  runtimeGlobal.document = {
    createElement(tagName: string) {
      if (tagName !== 'canvas') {
        throw new Error(`Unexpected tag: ${tagName}`)
      }
      return {
        width: 0,
        height: 0,
        getContext(type: string) {
          if (type !== '2d') return null
          return ctx
        },
        toDataURL() {
          return 'data:image/png;base64,control-fallback'
        }
      }
    }
  }

  try {
    const pageList = await layoutDocument({
      width: 100,
      height: 80,
      margins: [0, 0, 0, 0],
      scale: 1,
      defaults: {
        defaultFont: 'Song',
        defaultSize: 12,
        defaultColor: '#000000',
        defaultRowMargin: 1,
        defaultBasicRowMarginHeight: 8,
        backgroundColor: '#ffffff',
        backgroundImage: '',
        backgroundSize: BackgroundSize.COVER,
        backgroundRepeat: BackgroundRepeat.NO_REPEAT,
        backgroundApplyPageNumbers: [],
        listInheritStyle: false,
        labelDefaultColor: '#1976d2',
        labelDefaultBackgroundColor: '#e3f2fd',
        labelDefaultBorderRadius: 4,
        labelDefaultPadding: [4, 4, 4, 4],
        pageNumber: {
          bottom: 60,
          size: 12,
          font: 'Song',
          color: '#000000',
          rowFlex: RowFlex.CENTER,
          format: '{pageNo}',
          numberType: NumberType.ARABIC,
          disabled: true,
          startPageNo: 1,
          fromPageNo: 0
        },
        watermark: {
          data: '',
          type: WatermarkType.TEXT,
          width: 0,
          height: 0,
          color: '#cccccc',
          opacity: 0.3,
          size: 20,
          font: 'Song',
          repeat: false,
          gap: [10, 10],
          numberType: NumberType.ARABIC
        },
        pageBorder: {
          disabled: true,
          color: '#000000',
          lineWidth: 1,
          padding: [0, 5, 0, 5]
        },
        lineNumber: {
          disabled: true,
          size: 12,
          font: 'Microsoft YaHei',
          color: '#000000',
          right: 20,
          type: LineNumberType.CONTINUITY
        },
        titleSizeMapping: {
          [TitleLevel.FIRST]: 26,
          [TitleLevel.SECOND]: 24,
          [TitleLevel.THIRD]: 22,
          [TitleLevel.FOURTH]: 20,
          [TitleLevel.FIFTH]: 18,
          [TitleLevel.SIXTH]: 16
        }
      },
      header: {
        key: 'header',
        elementList: [],
        blockList: [],
        height: 0
      },
      main: {
        key: 'main',
        elementList: [],
        blockList: [
          {
            kind: 'control',
            element: {
              type: ElementType.CONTROL,
              value: '',
              control: {
                type: 'text',
                value: null
              }
            }
          }
        ],
        height: 0
      },
      footer: {
        key: 'footer',
        elementList: [],
        blockList: [],
        height: 0
      }
    } as any)

    assert.deepEqual(
      pageList[0].rasterBlocks.map(
        ({ x, y, width, height, dataUrl, sourceType }) => ({
          x,
          y,
          width,
          height,
          dataUrl,
          sourceType
        })
      ),
      [
        {
          x: 0,
          y: 0,
          width: 100,
          height: 40,
          dataUrl: 'data:image/png;base64,control-fallback',
          sourceType: 'control'
        }
      ]
    )
    assert.deepEqual(pageList[0].issues, ['fallback:control'])
  } finally {
    runtimeGlobal.document = previousDocument
  }
}

async function testLayoutDocumentRendersControlPlaceholder() {
  const previousDocument = globalThis.document
  const runtimeGlobal = globalThis as any

  const ctx = {
    fillStyle: '#000000',
    strokeStyle: '#000000',
    font: '',
    measureText(text: string) {
      return {
        width: text.length * 10,
        actualBoundingBoxAscent: 12,
        actualBoundingBoxDescent: 8
      }
    },
    fillRect() {
      return undefined
    },
    strokeRect() {
      return undefined
    },
    fillText() {
      return undefined
    }
  }

  runtimeGlobal.document = {
    createElement(tagName: string) {
      if (tagName !== 'canvas') {
        throw new Error(`Unexpected tag: ${tagName}`)
      }
      return {
        width: 0,
        height: 0,
        getContext(type: string) {
          if (type !== '2d') return null
          return ctx
        },
        toDataURL() {
          return 'data:image/png;base64,unexpected-control-placeholder-fallback'
        }
      }
    }
  }

  try {
    const pageList = await layoutDocument({
      width: 120,
      height: 80,
      margins: [0, 0, 0, 0],
      scale: 1,
      defaults: {
        defaultFont: 'Song',
        defaultSize: 12,
        defaultColor: '#000000',
        defaultRowMargin: 1,
        defaultBasicRowMarginHeight: 8,
        backgroundColor: '#ffffff',
        backgroundImage: '',
        backgroundSize: BackgroundSize.COVER,
        backgroundRepeat: BackgroundRepeat.NO_REPEAT,
        backgroundApplyPageNumbers: [],
        listInheritStyle: false,
        labelDefaultColor: '#1976d2',
        labelDefaultBackgroundColor: '#e3f2fd',
        labelDefaultBorderRadius: 4,
        labelDefaultPadding: [4, 4, 4, 4],
        pageNumber: {
          bottom: 60,
          size: 12,
          font: 'Song',
          color: '#000000',
          rowFlex: RowFlex.CENTER,
          format: '{pageNo}',
          numberType: NumberType.ARABIC,
          disabled: true,
          startPageNo: 1,
          fromPageNo: 0
        },
        watermark: {
          data: '',
          type: WatermarkType.TEXT,
          width: 0,
          height: 0,
          color: '#cccccc',
          opacity: 0.3,
          size: 20,
          font: 'Song',
          repeat: false,
          gap: [10, 10],
          numberType: NumberType.ARABIC
        },
        pageBorder: {
          disabled: true,
          color: '#000000',
          lineWidth: 1,
          padding: [0, 5, 0, 5]
        },
        lineNumber: {
          disabled: true,
          size: 12,
          font: 'Microsoft YaHei',
          color: '#000000',
          right: 20,
          type: LineNumberType.CONTINUITY
        },
        control: {
          placeholderColor: '#9c9b9b',
          bracketColor: '#000000',
          borderWidth: 1,
          borderColor: '#000000'
        },
        titleSizeMapping: {
          [TitleLevel.FIRST]: 26,
          [TitleLevel.SECOND]: 24,
          [TitleLevel.THIRD]: 22,
          [TitleLevel.FOURTH]: 20,
          [TitleLevel.FIFTH]: 18,
          [TitleLevel.SIXTH]: 16
        }
      },
      header: {
        key: 'header',
        elementList: [],
        blockList: [],
        height: 0
      },
      main: {
        key: 'main',
        elementList: [],
        blockList: [
          {
            kind: 'control',
            element: {
              type: ElementType.CONTROL,
              value: '',
              control: {
                type: 'text',
                value: null,
                placeholder: '请输入'
              }
            }
          }
        ],
        height: 0
      },
      footer: {
        key: 'footer',
        elementList: [],
        blockList: [],
        height: 0
      }
    } as any)

    assert.deepEqual(
      pageList[0].textRuns.map(({ text, x, y, width, height, color }) => ({
        text,
        x,
        y,
        width,
        height,
        color
      })),
      [
        {
          text: '请输入',
          x: 0,
          y: 20,
          width: 30,
          height: 20,
          color: '#9c9b9b'
        }
      ]
    )
    assert.deepEqual(pageList[0].issues, [])
  } finally {
    runtimeGlobal.document = previousDocument
  }
}

async function testLayoutDocumentRendersDefaultControlPrefixAndPostfix() {
  const previousDocument = globalThis.document
  const runtimeGlobal = globalThis as any

  const ctx = {
    fillStyle: '#000000',
    strokeStyle: '#000000',
    font: '',
    measureText(text: string) {
      return {
        width: text.length * 10,
        actualBoundingBoxAscent: 12,
        actualBoundingBoxDescent: 8
      }
    },
    fillRect() {
      return undefined
    },
    strokeRect() {
      return undefined
    },
    fillText() {
      return undefined
    }
  }

  runtimeGlobal.document = {
    createElement(tagName: string) {
      if (tagName !== 'canvas') {
        throw new Error(`Unexpected tag: ${tagName}`)
      }
      return {
        width: 0,
        height: 0,
        getContext(type: string) {
          if (type !== '2d') return null
          return ctx
        },
        toDataURL() {
          return 'data:image/png;base64,unexpected-control-bracket-fallback'
        }
      }
    }
  }

  try {
    const pageList = await layoutDocument({
      width: 120,
      height: 80,
      margins: [0, 0, 0, 0],
      scale: 1,
      defaults: {
        defaultFont: 'Song',
        defaultSize: 12,
        defaultColor: '#000000',
        defaultRowMargin: 1,
        defaultBasicRowMarginHeight: 8,
        backgroundColor: '#ffffff',
        backgroundImage: '',
        backgroundSize: BackgroundSize.COVER,
        backgroundRepeat: BackgroundRepeat.NO_REPEAT,
        backgroundApplyPageNumbers: [],
        listInheritStyle: false,
        labelDefaultColor: '#1976d2',
        labelDefaultBackgroundColor: '#e3f2fd',
        labelDefaultBorderRadius: 4,
        labelDefaultPadding: [4, 4, 4, 4],
        pageNumber: {
          bottom: 60,
          size: 12,
          font: 'Song',
          color: '#000000',
          rowFlex: RowFlex.CENTER,
          format: '{pageNo}',
          numberType: NumberType.ARABIC,
          disabled: true,
          startPageNo: 1,
          fromPageNo: 0
        },
        watermark: {
          data: '',
          type: WatermarkType.TEXT,
          width: 0,
          height: 0,
          color: '#cccccc',
          opacity: 0.3,
          size: 20,
          font: 'Song',
          repeat: false,
          gap: [10, 10],
          numberType: NumberType.ARABIC
        },
        pageBorder: {
          disabled: true,
          color: '#000000',
          lineWidth: 1,
          padding: [0, 5, 0, 5]
        },
        lineNumber: {
          disabled: true,
          size: 12,
          font: 'Microsoft YaHei',
          color: '#000000',
          right: 20,
          type: LineNumberType.CONTINUITY
        },
        control: {
          placeholderColor: '#9c9b9b',
          bracketColor: '#ff0000',
          prefix: '{',
          postfix: '}',
          borderWidth: 1,
          borderColor: '#000000'
        },
        titleSizeMapping: {
          [TitleLevel.FIRST]: 26,
          [TitleLevel.SECOND]: 24,
          [TitleLevel.THIRD]: 22,
          [TitleLevel.FOURTH]: 20,
          [TitleLevel.FIFTH]: 18,
          [TitleLevel.SIXTH]: 16
        }
      },
      header: {
        key: 'header',
        elementList: [],
        blockList: [],
        height: 0
      },
      main: {
        key: 'main',
        elementList: [],
        blockList: [
          {
            kind: 'control',
            element: {
              type: ElementType.CONTROL,
              value: '',
              control: {
                type: 'text',
                value: [
                  {
                    value: 'abc'
                  }
                ]
              }
            }
          }
        ],
        height: 0
      },
      footer: {
        key: 'footer',
        elementList: [],
        blockList: [],
        height: 0
      }
    } as any)

    assert.deepEqual(
      pageList[0].textRuns.map(({ text, x, y, width, height, color }) => ({
        text,
        x,
        y,
        width,
        height,
        color
      })),
      [
        {
          text: '{',
          x: 0,
          y: 20,
          width: 10,
          height: 20,
          color: '#ff0000'
        },
        {
          text: 'abc',
          x: 10,
          y: 20,
          width: 30,
          height: 20,
          color: '#000000'
        },
        {
          text: '}',
          x: 40,
          y: 20,
          width: 10,
          height: 20,
          color: '#ff0000'
        }
      ]
    )
    assert.deepEqual(pageList[0].issues, [])
  } finally {
    runtimeGlobal.document = previousDocument
  }
}

async function testLayoutDocumentFallsBackForHeaderControl() {
  const previousDocument = globalThis.document
  const runtimeGlobal = globalThis as any

  const ctx = {
    fillStyle: '#000000',
    strokeStyle: '#000000',
    font: '',
    measureText(text: string) {
      return {
        width: text.length * 10,
        actualBoundingBoxAscent: 12,
        actualBoundingBoxDescent: 8
      }
    },
    fillRect() {
      return undefined
    },
    strokeRect() {
      return undefined
    },
    fillText() {
      return undefined
    }
  }

  runtimeGlobal.document = {
    createElement(tagName: string) {
      if (tagName !== 'canvas') {
        throw new Error(`Unexpected tag: ${tagName}`)
      }
      return {
        width: 0,
        height: 0,
        getContext(type: string) {
          if (type !== '2d') return null
          return ctx
        },
        toDataURL() {
          return 'data:image/png;base64,header-control-fallback'
        }
      }
    }
  }

  try {
    const pageList = await layoutDocument({
      width: 100,
      height: 80,
      margins: [0, 0, 0, 0],
      scale: 1,
      defaults: {
        defaultFont: 'Song',
        defaultSize: 12,
        defaultColor: '#000000',
        defaultRowMargin: 1,
        defaultBasicRowMarginHeight: 8,
        backgroundColor: '#ffffff',
        backgroundImage: '',
        backgroundSize: BackgroundSize.COVER,
        backgroundRepeat: BackgroundRepeat.NO_REPEAT,
        backgroundApplyPageNumbers: [],
        listInheritStyle: false,
        labelDefaultColor: '#1976d2',
        labelDefaultBackgroundColor: '#e3f2fd',
        labelDefaultBorderRadius: 4,
        labelDefaultPadding: [4, 4, 4, 4],
        pageNumber: {
          bottom: 60,
          size: 12,
          font: 'Song',
          color: '#000000',
          rowFlex: RowFlex.CENTER,
          format: '{pageNo}',
          numberType: NumberType.ARABIC,
          disabled: true,
          startPageNo: 1,
          fromPageNo: 0
        },
        watermark: {
          data: '',
          type: WatermarkType.TEXT,
          width: 0,
          height: 0,
          color: '#cccccc',
          opacity: 0.3,
          size: 20,
          font: 'Song',
          repeat: false,
          gap: [10, 10],
          numberType: NumberType.ARABIC
        },
        pageBorder: {
          disabled: true,
          color: '#000000',
          lineWidth: 1,
          padding: [0, 5, 0, 5]
        },
        lineNumber: {
          disabled: true,
          size: 12,
          font: 'Microsoft YaHei',
          color: '#000000',
          right: 20,
          type: LineNumberType.CONTINUITY
        },
        titleSizeMapping: {
          [TitleLevel.FIRST]: 26,
          [TitleLevel.SECOND]: 24,
          [TitleLevel.THIRD]: 22,
          [TitleLevel.FOURTH]: 20,
          [TitleLevel.FIFTH]: 18,
          [TitleLevel.SIXTH]: 16
        }
      },
      header: {
        key: 'header',
        elementList: [],
        blockList: [
          {
            kind: 'control',
            element: {
              type: ElementType.CONTROL,
              value: '',
              control: {
                type: 'text',
                value: null
              }
            }
          }
        ],
        height: 0
      },
      main: {
        key: 'main',
        elementList: [],
        blockList: [],
        height: 0
      },
      footer: {
        key: 'footer',
        elementList: [],
        blockList: [],
        height: 0
      }
    } as any)

    assert.deepEqual(
      pageList[0].rasterBlocks.map(
        ({ x, y, width, height, dataUrl, sourceType }) => ({
          x,
          y,
          width,
          height,
          dataUrl,
          sourceType
        })
      ),
      [
        {
          x: 0,
          y: 0,
          width: 100,
          height: 40,
          dataUrl: 'data:image/png;base64,header-control-fallback',
          sourceType: 'control'
        }
      ]
    )
    assert.deepEqual(pageList[0].issues, ['fallback:control'])
  } finally {
    runtimeGlobal.document = previousDocument
  }
}

async function testLayoutDocumentRendersStandaloneCheckboxAndRadio() {
  const previousDocument = globalThis.document
  const runtimeGlobal = globalThis as any

  const ctx = {
    fillStyle: '#000000',
    strokeStyle: '#000000',
    font: '',
    measureText(text: string) {
      return {
        width: text.length * 10,
        actualBoundingBoxAscent: 12,
        actualBoundingBoxDescent: 8
      }
    },
    fillRect() {
      return undefined
    },
    strokeRect() {
      return undefined
    },
    fillText() {
      return undefined
    }
  }

  runtimeGlobal.document = {
    createElement(tagName: string) {
      if (tagName !== 'canvas') {
        throw new Error(`Unexpected tag: ${tagName}`)
      }
      return {
        width: 0,
        height: 0,
        getContext(type: string) {
          if (type !== '2d') return null
          return ctx
        },
        toDataURL() {
          return 'data:image/png;base64,unexpected-control-fallback'
        }
      }
    }
  }

  try {
    const pageList = await layoutDocument({
      width: 100,
      height: 120,
      margins: [0, 0, 0, 0],
      scale: 1,
      defaults: {
        defaultFont: 'Song',
        defaultSize: 12,
        defaultColor: '#000000',
        defaultRowMargin: 1,
        defaultBasicRowMarginHeight: 8,
        backgroundColor: '#ffffff',
        backgroundImage: '',
        backgroundSize: BackgroundSize.COVER,
        backgroundRepeat: BackgroundRepeat.NO_REPEAT,
        backgroundApplyPageNumbers: [],
        listInheritStyle: false,
        labelDefaultColor: '#1976d2',
        labelDefaultBackgroundColor: '#e3f2fd',
        labelDefaultBorderRadius: 4,
        labelDefaultPadding: [4, 4, 4, 4],
        pageNumber: {
          bottom: 60,
          size: 12,
          font: 'Song',
          color: '#000000',
          rowFlex: RowFlex.CENTER,
          format: '{pageNo}',
          numberType: NumberType.ARABIC,
          disabled: true,
          startPageNo: 1,
          fromPageNo: 0
        },
        watermark: {
          data: '',
          type: WatermarkType.TEXT,
          width: 0,
          height: 0,
          color: '#cccccc',
          opacity: 0.3,
          size: 20,
          font: 'Song',
          repeat: false,
          gap: [10, 10],
          numberType: NumberType.ARABIC
        },
        pageBorder: {
          disabled: true,
          color: '#000000',
          lineWidth: 1,
          padding: [0, 5, 0, 5]
        },
        lineNumber: {
          disabled: true,
          size: 12,
          font: 'Microsoft YaHei',
          color: '#000000',
          right: 20,
          type: LineNumberType.CONTINUITY
        },
        titleSizeMapping: {
          [TitleLevel.FIRST]: 26,
          [TitleLevel.SECOND]: 24,
          [TitleLevel.THIRD]: 22,
          [TitleLevel.FOURTH]: 20,
          [TitleLevel.FIFTH]: 18,
          [TitleLevel.SIXTH]: 16
        }
      },
      header: {
        key: 'header',
        elementList: [],
        blockList: [],
        height: 0
      },
      main: {
        key: 'main',
        elementList: [],
        blockList: [
          {
            kind: 'control',
            element: {
              type: ElementType.CHECKBOX,
              value: '',
              checkbox: {
                value: true
              }
            }
          },
          {
            kind: 'control',
            element: {
              type: ElementType.RADIO,
              value: '',
              radio: {
                value: false
              }
            }
          }
        ],
        height: 0
      },
      footer: {
        key: 'footer',
        elementList: [],
        blockList: [],
        height: 0
      }
    } as any)

    assert.deepEqual(
      pageList[0].textRuns.map(({ text, x, y, width, height }) => ({
        text,
        x,
        y,
        width,
        height
      })),
      [
        {
          text: '☑',
          x: 0,
          y: 20,
          width: 10,
          height: 20
        },
        {
          text: '○',
          x: 0,
          y: 60,
          width: 10,
          height: 20
        }
      ]
    )
    assert.deepEqual(pageList[0].issues, [])
  } finally {
    runtimeGlobal.document = previousDocument
  }
}

async function testLayoutDocumentRendersCheckboxAndRadioControlOptions() {
  const previousDocument = globalThis.document
  const runtimeGlobal = globalThis as any

  const ctx = {
    fillStyle: '#000000',
    strokeStyle: '#000000',
    font: '',
    measureText(text: string) {
      return {
        width: text.length * 10,
        actualBoundingBoxAscent: 12,
        actualBoundingBoxDescent: 8
      }
    },
    fillRect() {
      return undefined
    },
    strokeRect() {
      return undefined
    },
    fillText() {
      return undefined
    }
  }

  runtimeGlobal.document = {
    createElement(tagName: string) {
      if (tagName !== 'canvas') {
        throw new Error(`Unexpected tag: ${tagName}`)
      }
      return {
        width: 0,
        height: 0,
        getContext(type: string) {
          if (type !== '2d') return null
          return ctx
        },
        toDataURL() {
          return 'data:image/png;base64,unexpected-control-options-fallback'
        }
      }
    }
  }

  try {
    const pageList = await layoutDocument({
      width: 120,
      height: 120,
      margins: [0, 0, 0, 0],
      scale: 1,
      defaults: {
        defaultFont: 'Song',
        defaultSize: 12,
        defaultColor: '#000000',
        defaultRowMargin: 1,
        defaultBasicRowMarginHeight: 8,
        backgroundColor: '#ffffff',
        backgroundImage: '',
        backgroundSize: BackgroundSize.COVER,
        backgroundRepeat: BackgroundRepeat.NO_REPEAT,
        backgroundApplyPageNumbers: [],
        listInheritStyle: false,
        labelDefaultColor: '#1976d2',
        labelDefaultBackgroundColor: '#e3f2fd',
        labelDefaultBorderRadius: 4,
        labelDefaultPadding: [4, 4, 4, 4],
        pageNumber: {
          bottom: 60,
          size: 12,
          font: 'Song',
          color: '#000000',
          rowFlex: RowFlex.CENTER,
          format: '{pageNo}',
          numberType: NumberType.ARABIC,
          disabled: true,
          startPageNo: 1,
          fromPageNo: 0
        },
        watermark: {
          data: '',
          type: WatermarkType.TEXT,
          width: 0,
          height: 0,
          color: '#cccccc',
          opacity: 0.3,
          size: 20,
          font: 'Song',
          repeat: false,
          gap: [10, 10],
          numberType: NumberType.ARABIC
        },
        pageBorder: {
          disabled: true,
          color: '#000000',
          lineWidth: 1,
          padding: [0, 5, 0, 5]
        },
        lineNumber: {
          disabled: true,
          size: 12,
          font: 'Microsoft YaHei',
          color: '#000000',
          right: 20,
          type: LineNumberType.CONTINUITY
        },
        titleSizeMapping: {
          [TitleLevel.FIRST]: 26,
          [TitleLevel.SECOND]: 24,
          [TitleLevel.THIRD]: 22,
          [TitleLevel.FOURTH]: 20,
          [TitleLevel.FIFTH]: 18,
          [TitleLevel.SIXTH]: 16
        }
      },
      header: {
        key: 'header',
        elementList: [],
        blockList: [],
        height: 0
      },
      main: {
        key: 'main',
        elementList: [],
        blockList: [
          {
            kind: 'control',
            element: {
              type: ElementType.CONTROL,
              value: '',
              control: {
                type: 'checkbox',
                code: 'a',
                valueSets: [
                  {
                    code: 'a',
                    value: 'A'
                  },
                  {
                    code: 'b',
                    value: 'B'
                  }
                ],
                value: null
              }
            }
          },
          {
            kind: 'control',
            element: {
              type: ElementType.CONTROL,
              value: '',
              control: {
                type: 'radio',
                code: 'b',
                valueSets: [
                  {
                    code: 'a',
                    value: 'X'
                  },
                  {
                    code: 'b',
                    value: 'Y'
                  }
                ],
                value: null
              }
            }
          }
        ],
        height: 0
      },
      footer: {
        key: 'footer',
        elementList: [],
        blockList: [],
        height: 0
      }
    } as any)

    assert.deepEqual(
      pageList[0].textRuns.map(({ text, x, y, width, height }) => ({
        text,
        x,
        y,
        width,
        height
      })),
      [
        {
          text: '☑',
          x: 0,
          y: 20,
          width: 10,
          height: 20
        },
        {
          text: 'A',
          x: 10,
          y: 20,
          width: 15,
          height: 20
        },
        {
          text: '☐',
          x: 25,
          y: 20,
          width: 10,
          height: 20
        },
        {
          text: 'B',
          x: 35,
          y: 20,
          width: 15,
          height: 20
        },
        {
          text: '○',
          x: 0,
          y: 60,
          width: 10,
          height: 20
        },
        {
          text: 'X',
          x: 10,
          y: 60,
          width: 15,
          height: 20
        },
        {
          text: '◉',
          x: 25,
          y: 60,
          width: 10,
          height: 20
        },
        {
          text: 'Y',
          x: 35,
          y: 60,
          width: 15,
          height: 20
        }
      ]
    )
    assert.deepEqual(pageList[0].issues, [])
  } finally {
    runtimeGlobal.document = previousDocument
  }
}

async function testLayoutDocumentInheritsCheckboxControlOptionLabelStyles() {
  const previousDocument = globalThis.document
  const runtimeGlobal = globalThis as any

  const ctx = {
    fillStyle: '#000000',
    strokeStyle: '#000000',
    font: '',
    measureText(text: string) {
      return {
        width: text.length * 10,
        actualBoundingBoxAscent: 12,
        actualBoundingBoxDescent: 8
      }
    },
    fillRect() {
      return undefined
    },
    strokeRect() {
      return undefined
    },
    fillText() {
      return undefined
    }
  }

  runtimeGlobal.document = {
    createElement(tagName: string) {
      if (tagName !== 'canvas') {
        throw new Error(`Unexpected tag: ${tagName}`)
      }
      return {
        width: 0,
        height: 0,
        getContext(type: string) {
          if (type !== '2d') return null
          return ctx
        },
        toDataURL() {
          return 'data:image/png;base64,unexpected-checkbox-option-style-fallback'
        }
      }
    }
  }

  try {
    const pageList = await layoutDocument({
      width: 120,
      height: 80,
      margins: [0, 0, 0, 0],
      scale: 1,
      defaults: {
        defaultFont: 'Song',
        defaultSize: 12,
        defaultColor: '#000000',
        defaultRowMargin: 1,
        defaultBasicRowMarginHeight: 8,
        backgroundColor: '#ffffff',
        backgroundImage: '',
        backgroundSize: BackgroundSize.COVER,
        backgroundRepeat: BackgroundRepeat.NO_REPEAT,
        backgroundApplyPageNumbers: [],
        listInheritStyle: false,
        labelDefaultColor: '#1976d2',
        labelDefaultBackgroundColor: '#e3f2fd',
        labelDefaultBorderRadius: 4,
        labelDefaultPadding: [4, 4, 4, 4],
        pageNumber: {
          bottom: 60,
          size: 12,
          font: 'Song',
          color: '#000000',
          rowFlex: RowFlex.CENTER,
          format: '{pageNo}',
          numberType: NumberType.ARABIC,
          disabled: true,
          startPageNo: 1,
          fromPageNo: 0
        },
        watermark: {
          data: '',
          type: WatermarkType.TEXT,
          width: 0,
          height: 0,
          color: '#cccccc',
          opacity: 0.3,
          size: 20,
          font: 'Song',
          repeat: false,
          gap: [10, 10],
          numberType: NumberType.ARABIC
        },
        pageBorder: {
          disabled: true,
          color: '#000000',
          lineWidth: 1,
          padding: [0, 5, 0, 5]
        },
        lineNumber: {
          disabled: true,
          size: 12,
          font: 'Microsoft YaHei',
          color: '#000000',
          right: 20,
          type: LineNumberType.CONTINUITY
        },
        titleSizeMapping: {
          [TitleLevel.FIRST]: 26,
          [TitleLevel.SECOND]: 24,
          [TitleLevel.THIRD]: 22,
          [TitleLevel.FOURTH]: 20,
          [TitleLevel.FIFTH]: 18,
          [TitleLevel.SIXTH]: 16
        }
      },
      header: {
        key: 'header',
        elementList: [],
        blockList: [],
        height: 0
      },
      main: {
        key: 'main',
        elementList: [],
        blockList: [
          {
            kind: 'control',
            element: {
              type: ElementType.CONTROL,
              value: '',
              control: {
                type: 'checkbox',
                code: 'a',
                valueSets: [
                  {
                    code: 'a',
                    value: 'A'
                  },
                  {
                    code: 'b',
                    value: 'B'
                  }
                ],
                value: [
                  {
                    value: 'AB',
                    font: 'KaiTi',
                    size: 16,
                    color: '#ff0000',
                    bold: true
                  }
                ]
              }
            }
          }
        ],
        height: 0
      },
      footer: {
        key: 'footer',
        elementList: [],
        blockList: [],
        height: 0
      }
    } as any)

    assert.deepEqual(
      pageList[0].textRuns.map(
        ({ text, x, y, width, height, font, size, color, bold }) => ({
          text,
          x,
          y,
          width,
          height,
          font,
          size,
          color,
          bold
        })
      ),
      [
        {
          text: '☑',
          x: 0,
          y: 24,
          width: 10,
          height: 20,
          font: 'Song',
          size: 12,
          color: '#000000',
          bold: false
        },
        {
          text: 'A',
          x: 10,
          y: 24,
          width: 15,
          height: 20,
          font: 'KaiTi',
          size: 16,
          color: '#ff0000',
          bold: true
        },
        {
          text: '☐',
          x: 25,
          y: 24,
          width: 10,
          height: 20,
          font: 'Song',
          size: 12,
          color: '#000000',
          bold: false
        },
        {
          text: 'B',
          x: 35,
          y: 24,
          width: 15,
          height: 20,
          font: 'KaiTi',
          size: 16,
          color: '#ff0000',
          bold: true
        }
      ]
    )
    assert.deepEqual(pageList[0].issues, [])
  } finally {
    runtimeGlobal.document = previousDocument
  }
}

async function testLayoutDocumentAppliesCheckboxControlOptionGapSpacing() {
  const previousDocument = globalThis.document
  const runtimeGlobal = globalThis as any

  const ctx = {
    fillStyle: '#000000',
    strokeStyle: '#000000',
    font: '',
    measureText(text: string) {
      return {
        width: text.length * 10,
        actualBoundingBoxAscent: 12,
        actualBoundingBoxDescent: 8
      }
    },
    fillRect() {
      return undefined
    },
    strokeRect() {
      return undefined
    },
    fillText() {
      return undefined
    }
  }

  runtimeGlobal.document = {
    createElement(tagName: string) {
      if (tagName !== 'canvas') {
        throw new Error(`Unexpected tag: ${tagName}`)
      }
      return {
        width: 0,
        height: 0,
        getContext(type: string) {
          if (type !== '2d') return null
          return ctx
        },
        toDataURL() {
          return 'data:image/png;base64,unexpected-checkbox-gap-fallback'
        }
      }
    }
  }

  try {
    const pageList = await layoutDocument({
      width: 120,
      height: 80,
      margins: [0, 0, 0, 0],
      scale: 1,
      defaults: {
        defaultFont: 'Song',
        defaultSize: 12,
        defaultColor: '#000000',
        defaultRowMargin: 1,
        defaultBasicRowMarginHeight: 8,
        backgroundColor: '#ffffff',
        backgroundImage: '',
        backgroundSize: BackgroundSize.COVER,
        backgroundRepeat: BackgroundRepeat.NO_REPEAT,
        backgroundApplyPageNumbers: [],
        listInheritStyle: false,
        labelDefaultColor: '#1976d2',
        labelDefaultBackgroundColor: '#e3f2fd',
        labelDefaultBorderRadius: 4,
        labelDefaultPadding: [4, 4, 4, 4],
        pageNumber: {
          bottom: 60,
          size: 12,
          font: 'Song',
          color: '#000000',
          rowFlex: RowFlex.CENTER,
          format: '{pageNo}',
          numberType: NumberType.ARABIC,
          disabled: true,
          startPageNo: 1,
          fromPageNo: 0
        },
        watermark: {
          data: '',
          type: WatermarkType.TEXT,
          width: 0,
          height: 0,
          color: '#cccccc',
          opacity: 0.3,
          size: 20,
          font: 'Song',
          repeat: false,
          gap: [10, 10],
          numberType: NumberType.ARABIC
        },
        pageBorder: {
          disabled: true,
          color: '#000000',
          lineWidth: 1,
          padding: [0, 5, 0, 5]
        },
        lineNumber: {
          disabled: true,
          size: 12,
          font: 'Microsoft YaHei',
          color: '#000000',
          right: 20,
          type: LineNumberType.CONTINUITY
        },
        titleSizeMapping: {
          [TitleLevel.FIRST]: 26,
          [TitleLevel.SECOND]: 24,
          [TitleLevel.THIRD]: 22,
          [TitleLevel.FOURTH]: 20,
          [TitleLevel.FIFTH]: 18,
          [TitleLevel.SIXTH]: 16
        }
      },
      header: {
        key: 'header',
        elementList: [],
        blockList: [],
        height: 0
      },
      main: {
        key: 'main',
        elementList: [],
        blockList: [
          {
            kind: 'control',
            element: {
              type: ElementType.CONTROL,
              value: '',
              control: {
                type: 'checkbox',
                code: 'a',
                valueSets: [
                  {
                    code: 'a',
                    value: 'A'
                  },
                  {
                    code: 'b',
                    value: 'B'
                  }
                ],
                value: null
              }
            }
          }
        ],
        height: 0
      },
      footer: {
        key: 'footer',
        elementList: [],
        blockList: [],
        height: 0
      }
    } as any)

    assert.deepEqual(
      pageList[0].textRuns.map(({ text, x, y, width, height }) => ({
        text,
        x,
        y,
        width,
        height
      })),
      [
        {
          text: '☑',
          x: 0,
          y: 20,
          width: 10,
          height: 20
        },
        {
          text: 'A',
          x: 10,
          y: 20,
          width: 15,
          height: 20
        },
        {
          text: '☐',
          x: 25,
          y: 20,
          width: 10,
          height: 20
        },
        {
          text: 'B',
          x: 35,
          y: 20,
          width: 15,
          height: 20
        }
      ]
    )
    assert.deepEqual(pageList[0].issues, [])
  } finally {
    runtimeGlobal.document = previousDocument
  }
}

async function testLayoutDocumentRendersTextControlValue() {
  const previousDocument = globalThis.document
  const runtimeGlobal = globalThis as any

  const ctx = {
    fillStyle: '#000000',
    strokeStyle: '#000000',
    font: '',
    measureText(text: string) {
      return {
        width: text.length * 10,
        actualBoundingBoxAscent: 12,
        actualBoundingBoxDescent: 8
      }
    },
    fillRect() {
      return undefined
    },
    strokeRect() {
      return undefined
    },
    fillText() {
      return undefined
    }
  }

  runtimeGlobal.document = {
    createElement(tagName: string) {
      if (tagName !== 'canvas') {
        throw new Error(`Unexpected tag: ${tagName}`)
      }
      return {
        width: 0,
        height: 0,
        getContext(type: string) {
          if (type !== '2d') return null
          return ctx
        },
        toDataURL() {
          return 'data:image/png;base64,unexpected-text-control-fallback'
        }
      }
    }
  }

  try {
    const pageList = await layoutDocument({
      width: 100,
      height: 80,
      margins: [0, 0, 0, 0],
      scale: 1,
      defaults: {
        defaultFont: 'Song',
        defaultSize: 12,
        defaultColor: '#000000',
        defaultRowMargin: 1,
        defaultBasicRowMarginHeight: 8,
        backgroundColor: '#ffffff',
        backgroundImage: '',
        backgroundSize: BackgroundSize.COVER,
        backgroundRepeat: BackgroundRepeat.NO_REPEAT,
        backgroundApplyPageNumbers: [],
        listInheritStyle: false,
        labelDefaultColor: '#1976d2',
        labelDefaultBackgroundColor: '#e3f2fd',
        labelDefaultBorderRadius: 4,
        labelDefaultPadding: [4, 4, 4, 4],
        pageNumber: {
          bottom: 60,
          size: 12,
          font: 'Song',
          color: '#000000',
          rowFlex: RowFlex.CENTER,
          format: '{pageNo}',
          numberType: NumberType.ARABIC,
          disabled: true,
          startPageNo: 1,
          fromPageNo: 0
        },
        watermark: {
          data: '',
          type: WatermarkType.TEXT,
          width: 0,
          height: 0,
          color: '#cccccc',
          opacity: 0.3,
          size: 20,
          font: 'Song',
          repeat: false,
          gap: [10, 10],
          numberType: NumberType.ARABIC
        },
        pageBorder: {
          disabled: true,
          color: '#000000',
          lineWidth: 1,
          padding: [0, 5, 0, 5]
        },
        lineNumber: {
          disabled: true,
          size: 12,
          font: 'Microsoft YaHei',
          color: '#000000',
          right: 20,
          type: LineNumberType.CONTINUITY
        },
        titleSizeMapping: {
          [TitleLevel.FIRST]: 26,
          [TitleLevel.SECOND]: 24,
          [TitleLevel.THIRD]: 22,
          [TitleLevel.FOURTH]: 20,
          [TitleLevel.FIFTH]: 18,
          [TitleLevel.SIXTH]: 16
        }
      },
      header: {
        key: 'header',
        elementList: [],
        blockList: [],
        height: 0
      },
      main: {
        key: 'main',
        elementList: [],
        blockList: [
          {
            kind: 'control',
            element: {
              type: ElementType.CONTROL,
              value: '',
              control: {
                type: 'text',
                value: [
                  {
                    value: 'abc'
                  }
                ]
              }
            }
          }
        ],
        height: 0
      },
      footer: {
        key: 'footer',
        elementList: [],
        blockList: [],
        height: 0
      }
    } as any)

    assert.deepEqual(
      pageList[0].textRuns.map(({ text, x, y, width, height }) => ({
        text,
        x,
        y,
        width,
        height
      })),
      [
        {
          text: 'abc',
          x: 0,
          y: 20,
          width: 30,
          height: 20
        }
      ]
    )
    assert.deepEqual(pageList[0].issues, [])
  } finally {
    runtimeGlobal.document = previousDocument
  }
}

async function testLayoutDocumentResolvesSelectControlTextFromValueSets() {
  const previousDocument = globalThis.document
  const runtimeGlobal = globalThis as any

  const ctx = {
    fillStyle: '#000000',
    strokeStyle: '#000000',
    font: '',
    measureText(text: string) {
      return {
        width: text.length * 10,
        actualBoundingBoxAscent: 12,
        actualBoundingBoxDescent: 8
      }
    },
    fillRect() {
      return undefined
    },
    strokeRect() {
      return undefined
    },
    fillText() {
      return undefined
    }
  }

  runtimeGlobal.document = {
    createElement(tagName: string) {
      if (tagName !== 'canvas') {
        throw new Error(`Unexpected tag: ${tagName}`)
      }
      return {
        width: 0,
        height: 0,
        getContext(type: string) {
          if (type !== '2d') return null
          return ctx
        },
        toDataURL() {
          return 'data:image/png;base64,unexpected-select-control-fallback'
        }
      }
    }
  }

  try {
    const pageList = await layoutDocument({
      width: 120,
      height: 80,
      margins: [0, 0, 0, 0],
      scale: 1,
      defaults: {
        defaultFont: 'Song',
        defaultSize: 12,
        defaultColor: '#000000',
        defaultRowMargin: 1,
        defaultBasicRowMarginHeight: 8,
        backgroundColor: '#ffffff',
        backgroundImage: '',
        backgroundSize: BackgroundSize.COVER,
        backgroundRepeat: BackgroundRepeat.NO_REPEAT,
        backgroundApplyPageNumbers: [],
        listInheritStyle: false,
        labelDefaultColor: '#1976d2',
        labelDefaultBackgroundColor: '#e3f2fd',
        labelDefaultBorderRadius: 4,
        labelDefaultPadding: [4, 4, 4, 4],
        pageNumber: {
          bottom: 60,
          size: 12,
          font: 'Song',
          color: '#000000',
          rowFlex: RowFlex.CENTER,
          format: '{pageNo}',
          numberType: NumberType.ARABIC,
          disabled: true,
          startPageNo: 1,
          fromPageNo: 0
        },
        watermark: {
          data: '',
          type: WatermarkType.TEXT,
          width: 0,
          height: 0,
          color: '#cccccc',
          opacity: 0.3,
          size: 20,
          font: 'Song',
          repeat: false,
          gap: [10, 10],
          numberType: NumberType.ARABIC
        },
        pageBorder: {
          disabled: true,
          color: '#000000',
          lineWidth: 1,
          padding: [0, 5, 0, 5]
        },
        lineNumber: {
          disabled: true,
          size: 12,
          font: 'Microsoft YaHei',
          color: '#000000',
          right: 20,
          type: LineNumberType.CONTINUITY
        },
        control: {
          placeholderColor: '#9c9b9b',
          bracketColor: '#000000',
          prefix: '',
          postfix: '',
          borderWidth: 1,
          borderColor: '#000000'
        },
        titleSizeMapping: {
          [TitleLevel.FIRST]: 26,
          [TitleLevel.SECOND]: 24,
          [TitleLevel.THIRD]: 22,
          [TitleLevel.FOURTH]: 20,
          [TitleLevel.FIFTH]: 18,
          [TitleLevel.SIXTH]: 16
        }
      },
      header: {
        key: 'header',
        elementList: [],
        blockList: [],
        height: 0
      },
      main: {
        key: 'main',
        elementList: [],
        blockList: [
          {
            kind: 'control',
            element: {
              type: ElementType.CONTROL,
              value: '',
              control: {
                type: 'select',
                code: 'a,b',
                valueSets: [
                  {
                    code: 'a',
                    value: 'Alpha'
                  },
                  {
                    code: 'b',
                    value: 'Beta'
                  }
                ],
                value: null
              }
            }
          }
        ],
        height: 0
      },
      footer: {
        key: 'footer',
        elementList: [],
        blockList: [],
        height: 0
      }
    } as any)

    assert.deepEqual(
      pageList[0].textRuns.map(({ text, x, y, width, height }) => ({
        text,
        x,
        y,
        width,
        height
      })),
      [
        {
          text: 'Alpha,Beta',
          x: 0,
          y: 20,
          width: 100,
          height: 20
        }
      ]
    )
    assert.deepEqual(pageList[0].issues, [])
  } finally {
    runtimeGlobal.document = previousDocument
  }
}

async function testLayoutDocumentInheritsTextControlStyles() {
  const previousDocument = globalThis.document
  const runtimeGlobal = globalThis as any

  const ctx = {
    fillStyle: '#000000',
    strokeStyle: '#000000',
    font: '',
    measureText(text: string) {
      return {
        width: text.length * 10,
        actualBoundingBoxAscent: 12,
        actualBoundingBoxDescent: 8
      }
    },
    fillRect() {
      return undefined
    },
    strokeRect() {
      return undefined
    },
    fillText() {
      return undefined
    }
  }

  runtimeGlobal.document = {
    createElement(tagName: string) {
      if (tagName !== 'canvas') {
        throw new Error(`Unexpected tag: ${tagName}`)
      }
      return {
        width: 0,
        height: 0,
        getContext(type: string) {
          if (type !== '2d') return null
          return ctx
        },
        toDataURL() {
          return 'data:image/png;base64,unexpected-text-control-style-fallback'
        }
      }
    }
  }

  try {
    const pageList = await layoutDocument({
      width: 100,
      height: 80,
      margins: [0, 0, 0, 0],
      scale: 1,
      defaults: {
        defaultFont: 'Song',
        defaultSize: 12,
        defaultColor: '#000000',
        defaultRowMargin: 1,
        defaultBasicRowMarginHeight: 8,
        backgroundColor: '#ffffff',
        backgroundImage: '',
        backgroundSize: BackgroundSize.COVER,
        backgroundRepeat: BackgroundRepeat.NO_REPEAT,
        backgroundApplyPageNumbers: [],
        listInheritStyle: false,
        labelDefaultColor: '#1976d2',
        labelDefaultBackgroundColor: '#e3f2fd',
        labelDefaultBorderRadius: 4,
        labelDefaultPadding: [4, 4, 4, 4],
        pageNumber: {
          bottom: 60,
          size: 12,
          font: 'Song',
          color: '#000000',
          rowFlex: RowFlex.CENTER,
          format: '{pageNo}',
          numberType: NumberType.ARABIC,
          disabled: true,
          startPageNo: 1,
          fromPageNo: 0
        },
        watermark: {
          data: '',
          type: WatermarkType.TEXT,
          width: 0,
          height: 0,
          color: '#cccccc',
          opacity: 0.3,
          size: 20,
          font: 'Song',
          repeat: false,
          gap: [10, 10],
          numberType: NumberType.ARABIC
        },
        pageBorder: {
          disabled: true,
          color: '#000000',
          lineWidth: 1,
          padding: [0, 5, 0, 5]
        },
        lineNumber: {
          disabled: true,
          size: 12,
          font: 'Microsoft YaHei',
          color: '#000000',
          right: 20,
          type: LineNumberType.CONTINUITY
        },
        titleSizeMapping: {
          [TitleLevel.FIRST]: 26,
          [TitleLevel.SECOND]: 24,
          [TitleLevel.THIRD]: 22,
          [TitleLevel.FOURTH]: 20,
          [TitleLevel.FIFTH]: 18,
          [TitleLevel.SIXTH]: 16
        }
      },
      header: {
        key: 'header',
        elementList: [],
        blockList: [],
        height: 0
      },
      main: {
        key: 'main',
        elementList: [],
        blockList: [
          {
            kind: 'control',
            element: {
              type: ElementType.CONTROL,
              value: '',
              control: {
                type: 'text',
                font: 'KaiTi',
                size: 16,
                bold: true,
                italic: true,
                underline: true,
                strikeout: true,
                value: [
                  {
                    value: 'abc'
                  }
                ]
              }
            }
          }
        ],
        height: 0
      },
      footer: {
        key: 'footer',
        elementList: [],
        blockList: [],
        height: 0
      }
    } as any)

    assert.deepEqual(
      pageList[0].textRuns.map(
        ({ text, x, y, width, height, font, size, bold, italic }) => ({
          text,
          x,
          y,
          width,
          height,
          font,
          size,
          bold,
          italic
        })
      ),
      [
        {
          text: 'abc',
          x: 0,
          y: 24,
          width: 30,
          height: 20,
          font: 'KaiTi',
          size: 16,
          bold: true,
          italic: true
        }
      ]
    )
    assert.deepEqual(
      pageList[0].vectorLines.map(({ x1, y1, x2, y2, color, width }) => ({
        x1,
        y1,
        x2,
        y2,
        color,
        width
      })),
      [
        {
          x1: 0,
          y1: 26,
          x2: 30,
          y2: 26,
          color: '#000000',
          width: 1
        },
        {
          x1: 0,
          y1: 18.4,
          x2: 30,
          y2: 18.4,
          color: '#000000',
          width: 1
        }
      ]
    )
    assert.deepEqual(pageList[0].issues, [])
  } finally {
    runtimeGlobal.document = previousDocument
  }
}

async function testLayoutDocumentAppendsTextControlBorder() {
  const previousDocument = globalThis.document
  const runtimeGlobal = globalThis as any

  const ctx = {
    fillStyle: '#000000',
    strokeStyle: '#000000',
    font: '',
    measureText(text: string) {
      return {
        width: text.length * 10,
        actualBoundingBoxAscent: 12,
        actualBoundingBoxDescent: 8
      }
    },
    fillRect() {
      return undefined
    },
    strokeRect() {
      return undefined
    },
    fillText() {
      return undefined
    }
  }

  runtimeGlobal.document = {
    createElement(tagName: string) {
      if (tagName !== 'canvas') {
        throw new Error(`Unexpected tag: ${tagName}`)
      }
      return {
        width: 0,
        height: 0,
        getContext(type: string) {
          if (type !== '2d') return null
          return ctx
        },
        toDataURL() {
          return 'data:image/png;base64,unexpected-text-control-border-fallback'
        }
      }
    }
  }

  try {
    const pageList = await layoutDocument({
      width: 100,
      height: 80,
      margins: [0, 0, 0, 0],
      scale: 1,
      defaults: {
        defaultFont: 'Song',
        defaultSize: 12,
        defaultColor: '#000000',
        defaultRowMargin: 1,
        defaultBasicRowMarginHeight: 8,
        backgroundColor: '#ffffff',
        backgroundImage: '',
        backgroundSize: BackgroundSize.COVER,
        backgroundRepeat: BackgroundRepeat.NO_REPEAT,
        backgroundApplyPageNumbers: [],
        listInheritStyle: false,
        labelDefaultColor: '#1976d2',
        labelDefaultBackgroundColor: '#e3f2fd',
        labelDefaultBorderRadius: 4,
        labelDefaultPadding: [4, 4, 4, 4],
        pageNumber: {
          bottom: 60,
          size: 12,
          font: 'Song',
          color: '#000000',
          rowFlex: RowFlex.CENTER,
          format: '{pageNo}',
          numberType: NumberType.ARABIC,
          disabled: true,
          startPageNo: 1,
          fromPageNo: 0
        },
        watermark: {
          data: '',
          type: WatermarkType.TEXT,
          width: 0,
          height: 0,
          color: '#cccccc',
          opacity: 0.3,
          size: 20,
          font: 'Song',
          repeat: false,
          gap: [10, 10],
          numberType: NumberType.ARABIC
        },
        pageBorder: {
          disabled: true,
          color: '#000000',
          lineWidth: 1,
          padding: [0, 5, 0, 5]
        },
        lineNumber: {
          disabled: true,
          size: 12,
          font: 'Microsoft YaHei',
          color: '#000000',
          right: 20,
          type: LineNumberType.CONTINUITY
        },
        control: {
          borderWidth: 2,
          borderColor: '#123456'
        },
        titleSizeMapping: {
          [TitleLevel.FIRST]: 26,
          [TitleLevel.SECOND]: 24,
          [TitleLevel.THIRD]: 22,
          [TitleLevel.FOURTH]: 20,
          [TitleLevel.FIFTH]: 18,
          [TitleLevel.SIXTH]: 16
        }
      },
      header: {
        key: 'header',
        elementList: [],
        blockList: [],
        height: 0
      },
      main: {
        key: 'main',
        elementList: [],
        blockList: [
          {
            kind: 'control',
            element: {
              type: ElementType.CONTROL,
              value: '',
              control: {
                type: 'text',
                border: true,
                value: [
                  {
                    value: 'abc'
                  }
                ]
              }
            }
          }
        ],
        height: 0
      },
      footer: {
        key: 'footer',
        elementList: [],
        blockList: [],
        height: 0
      }
    } as any)

    assert.deepEqual(
      pageList[0].vectorLines.map(({ x1, y1, x2, y2, color, width }) => ({
        x1,
        y1,
        x2,
        y2,
        color,
        width
      })),
      [
        {
          x1: 0,
          y1: 0,
          x2: 30,
          y2: 0,
          color: '#123456',
          width: 2
        },
        {
          x1: 30,
          y1: 0,
          x2: 30,
          y2: 40,
          color: '#123456',
          width: 2
        },
        {
          x1: 30,
          y1: 40,
          x2: 0,
          y2: 40,
          color: '#123456',
          width: 2
        },
        {
          x1: 0,
          y1: 40,
          x2: 0,
          y2: 0,
          color: '#123456',
          width: 2
        }
      ]
    )
    assert.deepEqual(pageList[0].issues, [])
  } finally {
    runtimeGlobal.document = previousDocument
  }
}

async function testLayoutDocumentMarksLatexAsPending() {
  const previousDocument = globalThis.document
  const runtimeGlobal = globalThis as any

  const ctx = {
    fillStyle: '#000000',
    strokeStyle: '#000000',
    font: '',
    measureText(text: string) {
      return {
        width: text.length * 10,
        actualBoundingBoxAscent: 12,
        actualBoundingBoxDescent: 8
      }
    },
    fillRect() {
      return undefined
    },
    strokeRect() {
      return undefined
    },
    fillText() {
      return undefined
    }
  }

  runtimeGlobal.document = {
    createElement(tagName: string) {
      if (tagName !== 'canvas') {
        throw new Error(`Unexpected tag: ${tagName}`)
      }
      return {
        width: 0,
        height: 0,
        getContext(type: string) {
          if (type !== '2d') return null
          return ctx
        },
        toDataURL() {
          return 'data:image/png;base64,latex-fallback'
        }
      }
    }
  }

  try {
    const pageList = await layoutDocument({
      width: 100,
      height: 80,
      margins: [0, 0, 0, 0],
      scale: 1,
      defaults: {
        defaultFont: 'Song',
        defaultSize: 12,
        defaultColor: '#000000',
        defaultRowMargin: 1,
        defaultBasicRowMarginHeight: 8,
        backgroundColor: '#ffffff',
        backgroundImage: '',
        backgroundSize: BackgroundSize.COVER,
        backgroundRepeat: BackgroundRepeat.NO_REPEAT,
        backgroundApplyPageNumbers: [],
        listInheritStyle: false,
        labelDefaultColor: '#1976d2',
        labelDefaultBackgroundColor: '#e3f2fd',
        labelDefaultBorderRadius: 4,
        labelDefaultPadding: [4, 4, 4, 4],
        pageNumber: {
          bottom: 60,
          size: 12,
          font: 'Song',
          color: '#000000',
          rowFlex: RowFlex.CENTER,
          format: '{pageNo}',
          numberType: NumberType.ARABIC,
          disabled: true,
          startPageNo: 1,
          fromPageNo: 0
        },
        watermark: {
          data: '',
          type: WatermarkType.TEXT,
          width: 0,
          height: 0,
          color: '#cccccc',
          opacity: 0.3,
          size: 20,
          font: 'Song',
          repeat: false,
          gap: [10, 10],
          numberType: NumberType.ARABIC
        },
        pageBorder: {
          disabled: true,
          color: '#000000',
          lineWidth: 1,
          padding: [0, 5, 0, 5]
        },
        lineNumber: {
          disabled: true,
          size: 12,
          font: 'Microsoft YaHei',
          color: '#000000',
          right: 20,
          type: LineNumberType.CONTINUITY
        },
        titleSizeMapping: {
          [TitleLevel.FIRST]: 26,
          [TitleLevel.SECOND]: 24,
          [TitleLevel.THIRD]: 22,
          [TitleLevel.FOURTH]: 20,
          [TitleLevel.FIFTH]: 18,
          [TitleLevel.SIXTH]: 16
        }
      },
      header: {
        key: 'header',
        elementList: [],
        blockList: [],
        height: 0
      },
      main: {
        key: 'main',
        elementList: [],
        blockList: [
          {
            kind: 'latex',
            element: {
              type: ElementType.LATEX,
              value: 'x^2',
              laTexSVG: '<svg></svg>'
            }
          }
        ],
        height: 0
      },
      footer: {
        key: 'footer',
        elementList: [],
        blockList: [],
        height: 0
      }
    } as any)

    assert.deepEqual(pageList[0].issues, ['pending:latex', 'fallback:latex'])
  } finally {
    runtimeGlobal.document = previousDocument
  }
}

async function testLayoutDocumentMarksBlockIframeAndVideoAsPending() {
  const previousDocument = globalThis.document
  const runtimeGlobal = globalThis as any

  const ctx = {
    fillStyle: '#000000',
    strokeStyle: '#000000',
    font: '',
    measureText(text: string) {
      return {
        width: text.length * 10,
        actualBoundingBoxAscent: 12,
        actualBoundingBoxDescent: 8
      }
    },
    fillRect() {
      return undefined
    },
    strokeRect() {
      return undefined
    },
    fillText() {
      return undefined
    }
  }

  runtimeGlobal.document = {
    createElement(tagName: string) {
      if (tagName !== 'canvas') {
        throw new Error(`Unexpected tag: ${tagName}`)
      }
      return {
        width: 0,
        height: 0,
        getContext(type: string) {
          if (type !== '2d') return null
          return ctx
        },
        toDataURL() {
          return 'data:image/png;base64,block-fallback'
        }
      }
    }
  }

  try {
    const pageList = await layoutDocument({
      width: 100,
      height: 120,
      margins: [0, 0, 0, 0],
      scale: 1,
      defaults: {
        defaultFont: 'Song',
        defaultSize: 12,
        defaultColor: '#000000',
        defaultRowMargin: 1,
        defaultBasicRowMarginHeight: 8,
        backgroundColor: '#ffffff',
        backgroundImage: '',
        backgroundSize: BackgroundSize.COVER,
        backgroundRepeat: BackgroundRepeat.NO_REPEAT,
        backgroundApplyPageNumbers: [],
        listInheritStyle: false,
        labelDefaultColor: '#1976d2',
        labelDefaultBackgroundColor: '#e3f2fd',
        labelDefaultBorderRadius: 4,
        labelDefaultPadding: [4, 4, 4, 4],
        pageNumber: {
          bottom: 60,
          size: 12,
          font: 'Song',
          color: '#000000',
          rowFlex: RowFlex.CENTER,
          format: '{pageNo}',
          numberType: NumberType.ARABIC,
          disabled: true,
          startPageNo: 1,
          fromPageNo: 0
        },
        watermark: {
          data: '',
          type: WatermarkType.TEXT,
          width: 0,
          height: 0,
          color: '#cccccc',
          opacity: 0.3,
          size: 20,
          font: 'Song',
          repeat: false,
          gap: [10, 10],
          numberType: NumberType.ARABIC
        },
        pageBorder: {
          disabled: true,
          color: '#000000',
          lineWidth: 1,
          padding: [0, 5, 0, 5]
        },
        lineNumber: {
          disabled: true,
          size: 12,
          font: 'Microsoft YaHei',
          color: '#000000',
          right: 20,
          type: LineNumberType.CONTINUITY
        },
        titleSizeMapping: {
          [TitleLevel.FIRST]: 26,
          [TitleLevel.SECOND]: 24,
          [TitleLevel.THIRD]: 22,
          [TitleLevel.FOURTH]: 20,
          [TitleLevel.FIFTH]: 18,
          [TitleLevel.SIXTH]: 16
        }
      },
      header: {
        key: 'header',
        elementList: [],
        blockList: [],
        height: 0
      },
      main: {
        key: 'main',
        elementList: [],
        blockList: [
          {
            kind: 'block',
            element: {
              type: ElementType.BLOCK,
              value: '',
              block: {
                type: BlockType.IFRAME,
                iframeBlock: {
                  src: 'https://example.com'
                }
              }
            }
          },
          {
            kind: 'block',
            element: {
              type: ElementType.BLOCK,
              value: '',
              block: {
                type: BlockType.VIDEO,
                videoBlock: {
                  src: 'https://example.com/video.mp4'
                }
              }
            }
          }
        ],
        height: 0
      },
      footer: {
        key: 'footer',
        elementList: [],
        blockList: [],
        height: 0
      }
    } as any)

    assert.deepEqual(pageList[0].issues, [
      'pending:block-iframe',
      'fallback:block',
      'pending:block-video',
      'fallback:block'
    ])
  } finally {
    runtimeGlobal.document = previousDocument
  }
}

async function testLayoutDocumentAppendsAreaDecorations() {
  const previousDocument = globalThis.document
  const runtimeGlobal = globalThis as any

  runtimeGlobal.document = {
    createElement(tagName: string) {
      if (tagName !== 'canvas') {
        throw new Error(`Unexpected tag: ${tagName}`)
      }
      return {
        getContext(type: string) {
          if (type !== '2d') return null
          return {
            font: '',
            measureText(text: string) {
              return {
                width: text.length * 10,
                actualBoundingBoxAscent: 12,
                actualBoundingBoxDescent: 8
              }
            }
          }
        }
      }
    }
  }

  try {
  const pageList = await layoutDocument({
    width: 100,
    height: 80,
    margins: [0, 10, 0, 10],
    scale: 1,
    defaults: {
      defaultFont: 'Song',
      defaultSize: 12,
      defaultColor: '#000000',
      defaultRowMargin: 1,
      defaultBasicRowMarginHeight: 8,
      backgroundColor: '#ffffff',
      backgroundImage: '',
      backgroundSize: BackgroundSize.COVER,
      backgroundRepeat: BackgroundRepeat.NO_REPEAT,
      backgroundApplyPageNumbers: [],
      listInheritStyle: false,
      labelDefaultColor: '#1976d2',
      labelDefaultBackgroundColor: '#e3f2fd',
      labelDefaultBorderRadius: 4,
      labelDefaultPadding: [4, 4, 4, 4],
      pageNumber: {
        bottom: 60,
        size: 12,
        font: 'Song',
        color: '#000000',
        rowFlex: RowFlex.CENTER,
        format: '{pageNo}',
        numberType: NumberType.ARABIC,
        disabled: true,
        startPageNo: 1,
        fromPageNo: 0
      },
      watermark: {
        data: '',
        type: WatermarkType.TEXT,
        width: 0,
        height: 0,
        color: '#cccccc',
        opacity: 0.3,
        size: 20,
        font: 'Song',
        repeat: false,
        gap: [10, 10],
        numberType: NumberType.ARABIC
      },
      pageBorder: {
        disabled: true,
        color: '#000000',
        lineWidth: 1,
        padding: [0, 5, 0, 5]
      },
      lineNumber: {
        disabled: true,
        size: 12,
        font: 'Microsoft YaHei',
        color: '#000000',
        right: 20,
        type: LineNumberType.CONTINUITY
      },
      titleSizeMapping: {
        [TitleLevel.FIRST]: 26,
        [TitleLevel.SECOND]: 24,
        [TitleLevel.THIRD]: 22,
        [TitleLevel.FOURTH]: 20,
        [TitleLevel.FIFTH]: 18,
        [TitleLevel.SIXTH]: 16
      }
    },
    header: {
      key: 'header',
      elementList: [],
      blockList: [],
      height: 0
    },
    main: {
      key: 'main',
      elementList: [],
      blockList: [
        {
          kind: 'paragraph',
          element: {
            value: 'ab',
            areaId: 'area-1',
            area: {
              backgroundColor: '#ffeeaa',
              borderColor: '#cc8800'
            }
          }
        },
        {
          kind: 'paragraph',
          element: {
            value: 'cd',
            areaId: 'area-1',
            area: {
              backgroundColor: '#ffeeaa',
              borderColor: '#cc8800'
            }
          }
        }
      ],
      height: 0
    },
    footer: {
      key: 'footer',
      elementList: [],
      blockList: [],
      height: 0
    }
  } as any)

  assert.deepEqual(pageList[0].highlightRects[1], {
    pageNo: 0,
    x: 10,
    y: 0,
    width: 80,
    height: 80,
    color: '#ffeeaa',
    opacity: 1
  })
  assert.deepEqual(
    pageList[0].vectorLines.map(({ x1, y1, x2, y2, color, width }) => ({
      x1,
      y1,
      x2,
      y2,
      color,
      width
    })),
    [
      {
        x1: 10,
        y1: 0,
        x2: 90,
        y2: 0,
        color: '#cc8800',
        width: 1
      },
      {
        x1: 90,
        y1: 0,
        x2: 90,
        y2: 80,
        color: '#cc8800',
        width: 1
      },
      {
        x1: 90,
        y1: 80,
        x2: 10,
        y2: 80,
        color: '#cc8800',
        width: 1
      },
      {
        x1: 10,
        y1: 80,
        x2: 10,
        y2: 0,
        color: '#cc8800',
        width: 1
      }
    ]
  )
  } finally {
    runtimeGlobal.document = previousDocument
  }
}

async function testLayoutDocumentAppendsGraffitiStrokes() {
  const pageList = await layoutDocument({
    width: 100,
    height: 80,
    margins: [0, 0, 0, 0],
    scale: 1,
    defaults: {
      defaultFont: 'Song',
      defaultSize: 12,
      defaultColor: '#000000',
      defaultRowMargin: 1,
      defaultBasicRowMarginHeight: 8,
      backgroundColor: '#ffffff',
      backgroundImage: '',
      backgroundSize: BackgroundSize.COVER,
      backgroundRepeat: BackgroundRepeat.NO_REPEAT,
      backgroundApplyPageNumbers: [],
      listInheritStyle: false,
      labelDefaultColor: '#1976d2',
      labelDefaultBackgroundColor: '#e3f2fd',
      labelDefaultBorderRadius: 4,
      labelDefaultPadding: [4, 4, 4, 4],
      pageNumber: {
        bottom: 60,
        size: 12,
        font: 'Song',
        color: '#000000',
        rowFlex: RowFlex.CENTER,
        format: '{pageNo}',
        numberType: NumberType.ARABIC,
        disabled: true,
        startPageNo: 1,
        fromPageNo: 0
      },
      watermark: {
        data: '',
        type: WatermarkType.TEXT,
        width: 0,
        height: 0,
        color: '#cccccc',
        opacity: 0.3,
        size: 20,
        font: 'Song',
        repeat: false,
        gap: [10, 10],
        numberType: NumberType.ARABIC
      },
      pageBorder: {
        disabled: true,
        color: '#000000',
        lineWidth: 1,
        padding: [0, 5, 0, 5]
      },
      lineNumber: {
        disabled: true,
        size: 12,
        font: 'Microsoft YaHei',
        color: '#000000',
        right: 20,
        type: LineNumberType.CONTINUITY
      },
      graffiti: {
        defaultLineWidth: 2,
        defaultLineColor: '#112233'
      },
      titleSizeMapping: {
        [TitleLevel.FIRST]: 26,
        [TitleLevel.SECOND]: 24,
        [TitleLevel.THIRD]: 22,
        [TitleLevel.FOURTH]: 20,
        [TitleLevel.FIFTH]: 18,
        [TitleLevel.SIXTH]: 16
      }
    },
    header: {
      key: 'header',
      elementList: [],
      blockList: [],
      height: 0
    },
    main: {
      key: 'main',
      elementList: [],
      blockList: [],
      height: 0
    },
    footer: {
      key: 'footer',
      elementList: [],
      blockList: [],
      height: 0
    },
    graffiti: [
      {
        pageNo: 0,
        strokes: [
          {
            points: [10, 20, 30, 40, 50, 60]
          }
        ]
      }
    ]
  } as any)

  assert.deepEqual(
    pageList[0].vectorLines.map(({ x1, y1, x2, y2, color, width }) => ({
      x1,
      y1,
      x2,
      y2,
      color,
      width
    })),
    [
      {
        x1: 10,
        y1: 20,
        x2: 30,
        y2: 40,
        color: '#112233',
        width: 2
      },
      {
        x1: 30,
        y1: 40,
        x2: 50,
        y2: 60,
        color: '#112233',
        width: 2
      }
    ]
  )
  assert.deepEqual(pageList[0].issues, [])
}

function testCreatesCenteredPageNumberPlacement() {
  const placement = createPageNumberPlacement({
    pageNo: 1,
    pageCount: 12,
    pageWidth: 200,
    pageHeight: 300,
    margins: [20, 30, 20, 30],
    bottom: 40,
    format: 'Page {pageNo}/{pageCount}',
    numberType: NumberType.ARABIC,
    rowFlex: RowFlex.CENTER,
    font: 'Song',
    size: 12,
    color: '#000000',
    startPageNo: 1,
    fromPageNo: 0,
    measureWidth: createMeasureWidth()
  })

  assert.deepEqual(placement, {
    text: 'Page 2/12',
    x: 55,
    y: 260,
    width: 90,
    height: 20,
    font: 'Song',
    size: 12,
    color: '#000000'
  })
}

function testCreatesContinuityLineNumberPlacements() {
  const placements = createLineNumberPlacements({
    baselineYList: [40, 60],
    margins: [20, 30, 20, 50],
    right: 10,
    font: 'Song',
    size: 12,
    color: '#ff0000',
    type: LineNumberType.CONTINUITY,
    startLineNo: 5,
    measureWidth: createMeasureWidth()
  })

  assert.deepEqual(placements, [
    {
      text: '5',
      x: 30,
      y: 40,
      width: 10,
      height: 20,
      font: 'Song',
      size: 12,
      color: '#ff0000'
    },
    {
      text: '6',
      x: 30,
      y: 60,
      width: 10,
      height: 20,
      font: 'Song',
      size: 12,
      color: '#ff0000'
    }
  ])
}

function testCreatesPageScopedLineNumberPlacements() {
  const placements = createLineNumberPlacements({
    baselineYList: [40, 60],
    margins: [20, 30, 20, 50],
    right: 10,
    font: 'Song',
    size: 12,
    color: '#ff0000',
    type: LineNumberType.PAGE,
    startLineNo: 99,
    measureWidth: createMeasureWidth()
  })

  assert.deepEqual(
    placements.map(({ text, x, y }) => ({
      text,
      x,
      y
    })),
    [
      {
        text: '1',
        x: 30,
        y: 40
      },
      {
        text: '2',
        x: 30,
        y: 60
      }
    ]
  )
}

function testCreatesWatermarkPlacementWithFormattedPageNumber() {
  const placement = createWatermarkPlacement({
    pageNo: 1,
    pageCount: 12,
    pageWidth: 200,
    pageHeight: 300,
    data: 'CONFIDENTIAL {pageNo}',
    numberType: NumberType.ARABIC,
    font: 'Song',
    size: 20,
    color: '#cccccc',
    opacity: 0.3,
    measureWidth: createMeasureWidth()
  })

  assert.deepEqual(placement, {
    text: 'CONFIDENTIAL 2',
    x: 30,
    y: 150,
    width: 140,
    height: 28,
    font: 'Song',
    size: 20,
    color: '#cccccc',
    opacity: 0.3,
    rotate: -45
  })
}

function testCreatesRepeatedTextWatermarkPlacements() {
  const placements = createWatermarkPlacements({
    pageNo: 1,
    pageCount: 12,
    pageWidth: 100,
    pageHeight: 150,
    data: 'AB {pageNo}',
    numberType: NumberType.ARABIC,
    font: 'Song',
    size: 12,
    color: '#cccccc',
    opacity: 0.3,
    repeat: true,
    gap: [10, 20],
    measureWidth: createMeasureWidth()
  })

  assert.deepEqual(
    placements.map(({ text, x, y, width, height, rotate }) => ({
      text,
      x: roundTo3(x),
      y: roundTo3(y),
      width,
      height,
      rotate
    })),
    [
      {
        text: 'AB 2',
        x: 12.361,
        y: 42.361,
        width: 40,
        height: 20,
        rotate: -45
      },
      {
        text: 'AB 2',
        x: 77.082,
        y: 42.361,
        width: 40,
        height: 20,
        rotate: -45
      },
      {
        text: 'AB 2',
        x: 12.361,
        y: 127.082,
        width: 40,
        height: 20,
        rotate: -45
      },
      {
        text: 'AB 2',
        x: 77.082,
        y: 127.082,
        width: 40,
        height: 20,
        rotate: -45
      }
    ]
  )
}

function testCreatesImageWatermarkPlacement() {
  const placement = createImageWatermarkPlacement({
    pageWidth: 200,
    pageHeight: 300,
    data: 'data:image/png;base64,abc',
    type: WatermarkType.IMAGE,
    width: 60,
    height: 40
  })

  assert.deepEqual(placement, {
    x: 70,
    y: 130,
    width: 60,
    height: 40,
    dataUrl: 'data:image/png;base64,abc',
    sourceType: 'watermark-image',
    opacity: 0.3,
    rotate: -45
  })
}

function testCreatesRepeatedImageWatermarkPlacements() {
  const placements = createImageWatermarkPlacements({
    pageWidth: 200,
    pageHeight: 150,
    data: 'data:image/png;base64,abc',
    type: WatermarkType.IMAGE,
    width: 40,
    height: 20,
    opacity: 0.3,
    repeat: true,
    gap: [10, 20]
  })

  assert.deepEqual(
    placements.map(({ x, y, width, height }) => ({
      x: roundTo3(x),
      y: roundTo3(y),
      width,
      height
    })),
    [
      {
        x: 12.361,
        y: 32.361,
        width: 40,
        height: 20
      },
      {
        x: 77.082,
        y: 32.361,
        width: 40,
        height: 20
      },
      {
        x: 141.803,
        y: 32.361,
        width: 40,
        height: 20
      },
      {
        x: 12.361,
        y: 117.082,
        width: 40,
        height: 20
      },
      {
        x: 77.082,
        y: 117.082,
        width: 40,
        height: 20
      },
      {
        x: 141.803,
        y: 117.082,
        width: 40,
        height: 20
      }
    ]
  )
}

function testPreservesParagraphRunDecorationFlags() {
  const placementList = createBlockTextPlacements({
    element: {
      value: '',
      valueList: [
        {
          value: 'ab',
          underline: true
        },
        {
          value: 'cd',
          strikeout: true
        }
      ]
    },
    x: 10,
    y: 20,
    width: 80,
    fallbackFont: 'Song',
    fallbackSize: 12,
    fallbackColor: '#000000',
    measureWidth: createMeasureWidth()
  })

  assert.deepEqual(
    placementList.map(({ text, underline, strikeout }) => ({
      text,
      underline,
      strikeout
    })),
    [
      {
        text: 'ab',
        underline: true,
        strikeout: undefined
      },
      {
        text: 'cd',
        underline: undefined,
        strikeout: true
      }
    ]
  )
}

function testCreatesDecorationLinesFromPlacements() {
  const lineList = createTextDecorationLines([
    {
      text: 'ab',
      x: 10,
      y: 20,
      width: 20,
      height: 20,
      font: 'Song',
      size: 12,
      color: '#ff0000',
      underline: true,
      baselineOffset: 12
    },
    {
      text: 'cd',
      x: 40,
      y: 20,
      width: 20,
      height: 20,
      font: 'Song',
      size: 12,
      color: '#0000ff',
      strikeout: true,
      baselineOffset: 12
    }
  ])

  assert.deepEqual(
    lineList.map(({ x1, y1, x2, y2, color }) => ({
      x1,
      y1,
      x2,
      y2,
      color
    })),
    [
      {
        x1: 10,
        y1: 22,
        x2: 30,
        y2: 22,
        color: '#ff0000'
      },
      {
        x1: 40,
        y1: 15.8,
        x2: 60,
        y2: 15.8,
        color: '#0000ff'
      }
    ]
  )
}

function testInheritsTableCellTextStyleFromCellElement() {
  const placementList = createTableCellTextPlacements({
    td: {
      colspan: 1,
      rowspan: 1,
      value: [
        {
          value: 'ab',
          font: 'KaiTi',
          size: 18,
          bold: true,
          italic: true,
          color: '#ff0000'
        }
      ]
    },
    x: 10,
    y: 20,
    cellWidth: 60,
    rowHeight: 40,
    font: 'Song',
    size: 12,
    lineHeight: 20,
    color: '#000000',
    measureWidth: createMeasureWidth()
  })

  assert.deepEqual(
    placementList.map(({ font, size, bold, italic, color }) => ({
      font,
      size,
      bold,
      italic,
      color
    })),
    [
      {
        font: 'KaiTi',
        size: 18,
        bold: true,
        italic: true,
        color: '#ff0000'
      }
    ]
  )
}

function testCreatesSeparateTableCellPlacementsForMultipleRuns() {
  const placementList = createTableCellTextPlacements({
    td: {
      colspan: 1,
      rowspan: 1,
      value: [
        {
          value: 'ab',
          font: 'KaiTi',
          size: 18,
          color: '#ff0000'
        },
        {
          value: 'cd',
          font: 'Song',
          size: 12,
          color: '#0000ff'
        }
      ]
    },
    x: 10,
    y: 20,
    cellWidth: 80,
    rowHeight: 40,
    font: 'Song',
    size: 12,
    lineHeight: 20,
    color: '#000000',
    measureWidth: createMeasureWidth()
  })

  assert.deepEqual(
    placementList.map(({ text, x, y, font, size, color }) => ({
      text,
      x,
      y,
      font,
      size,
      color
    })),
    [
      {
        text: 'ab',
        x: 16,
        y: 38,
        font: 'KaiTi',
        size: 18,
        color: '#ff0000'
      },
      {
        text: 'cd',
        x: 36,
        y: 38,
        font: 'Song',
        size: 12,
        color: '#0000ff'
      }
    ]
  )
}

function testResolvesPdfBoldItalicFontStyle() {
  assert.equal(
    resolvePdfTextFontStyle({
      bold: true,
      italic: true
    }),
    'bolditalic'
  )
}

function testCentersCellTextVertically() {
  const placementList = createTableCellTextPlacements({
    td: {
      ...createTd('abcdef'),
      verticalAlign: VerticalAlign.MIDDLE
    },
    x: 10,
    y: 20,
    cellWidth: 42,
    rowHeight: 80,
    font: 'Song',
    size: 12,
    lineHeight: 20,
    measureWidth: createMeasureWidth()
  })

  assert.deepEqual(
    placementList.map(placement => placement.y),
    [48, 68]
  )
}

function testBottomAlignsCellText() {
  const placementList = createTableCellTextPlacements({
    td: {
      ...createTd('abcdef'),
      verticalAlign: VerticalAlign.BOTTOM
    },
    x: 10,
    y: 20,
    cellWidth: 42,
    rowHeight: 80,
    font: 'Song',
    size: 12,
    lineHeight: 20,
    measureWidth: createMeasureWidth()
  })

  assert.deepEqual(
    placementList.map(placement => placement.y),
    [64, 84]
  )
}

function testRepeatsTableHeaderRowsAcrossPages() {
  const pageList = paginateTableRows(
    [
      {
        rowIndex: 0,
        height: 20,
        tdList: [],
        pagingRepeat: true
      },
      {
        rowIndex: 1,
        height: 20,
        tdList: []
      },
      {
        rowIndex: 2,
        height: 20,
        tdList: []
      }
    ],
    40
  )

  assert.deepEqual(
    pageList.map(page => page.map(row => row.rowIndex)),
    [
      [0, 1],
      [0, 2]
    ]
  )
}

function testKeepsRowspanGroupOnSamePage() {
  const pageList = paginateTableRows(
    [
      {
        rowIndex: 0,
        height: 20,
        tdList: [createTd('a')]
      },
      {
        rowIndex: 1,
        height: 20,
        tdList: [createTd('b', 1, 2)]
      },
      {
        rowIndex: 2,
        height: 20,
        tdList: [createTd('c')]
      }
    ],
    45
  )

  assert.deepEqual(
    pageList.map(page => page.map(row => row.rowIndex)),
    [
      [0],
      [1, 2]
    ]
  )
}

function testRepeatsHeaderWithoutBreakingRowspanGroup() {
  const pageList = paginateTableRows(
    [
      {
        rowIndex: 0,
        height: 5,
        tdList: [createTd('header')],
        pagingRepeat: true
      },
      {
        rowIndex: 1,
        height: 10,
        tdList: [createTd('lead')]
      },
      {
        rowIndex: 2,
        height: 15,
        tdList: [createTd('b', 1, 2)]
      },
      {
        rowIndex: 3,
        height: 15,
        tdList: [createTd('c')]
      }
    ],
    36
  )

  assert.deepEqual(
    pageList.map(page => page.map(row => row.rowIndex)),
    [
      [0, 1],
      [0, 2, 3]
    ]
  )
}

function testCreatesTableCellBackgroundRect() {
  const visuals = createTableCellVisuals({
    td: {
      ...createTd('a'),
      backgroundColor: '#ff0000'
    },
    x: 10,
    y: 20,
    width: 40,
    height: 30,
    rowIndex: 0,
    colIndex: 0,
    rowCount: 1,
    colCount: 1
  })

  assert.deepEqual(visuals.backgroundRects, [
    {
      x: 10,
      y: 20,
      width: 40,
      height: 30,
      color: '#ff0000',
      opacity: 1
    }
  ])
}

function testDrawsExternalTableBordersOnly() {
  const visuals = createTableCellVisuals({
    td: createTd('a'),
    x: 10,
    y: 20,
    width: 40,
    height: 30,
    rowIndex: 0,
    colIndex: 0,
    rowCount: 2,
    colCount: 2,
    tableBorderType: TableBorder.EXTERNAL
  })

  assert.deepEqual(
    visuals.lines.map(line => [line.x1, line.y1, line.x2, line.y2]),
    [
      [10, 20, 50, 20],
      [10, 20, 10, 50]
    ]
  )
}

function testDrawsExternalRightBorderForColspanCell() {
  const visuals = createTableCellVisuals({
    td: createTd('a', 2),
    x: 10,
    y: 20,
    width: 80,
    height: 30,
    rowIndex: 0,
    colIndex: 0,
    rowCount: 2,
    colCount: 2,
    tableBorderType: TableBorder.EXTERNAL
  })

  assert.deepEqual(
    visuals.lines.map(line => [line.x1, line.y1, line.x2, line.y2]),
    [
      [10, 20, 90, 20],
      [10, 20, 10, 50],
      [90, 20, 90, 50]
    ]
  )
}

function testDrawsExternalBottomBorderForRowspanCell() {
  const visuals = createTableCellVisuals({
    td: createTd('a', 1, 2),
    x: 10,
    y: 20,
    width: 40,
    height: 60,
    rowIndex: 0,
    colIndex: 0,
    rowCount: 2,
    colCount: 2,
    tableBorderType: TableBorder.EXTERNAL
  })

  assert.deepEqual(
    visuals.lines.map(line => [line.x1, line.y1, line.x2, line.y2]),
    [
      [10, 20, 50, 20],
      [10, 20, 10, 80],
      [50, 80, 10, 80]
    ]
  )
}

function testSkipsEmptyTableBorders() {
  const visuals = createTableCellVisuals({
    td: createTd('a'),
    x: 10,
    y: 20,
    width: 40,
    height: 30,
    rowIndex: 0,
    colIndex: 0,
    rowCount: 1,
    colCount: 1,
    tableBorderType: TableBorder.EMPTY
  })

  assert.equal(visuals.lines.length, 0)
}

function testDrawsExplicitTdBorders() {
  const visuals = createTableCellVisuals({
    td: {
      ...createTd('a'),
      borderTypes: [TdBorder.TOP, TdBorder.LEFT]
    },
    x: 10,
    y: 20,
    width: 40,
    height: 30,
    rowIndex: 0,
    colIndex: 0,
    rowCount: 1,
    colCount: 1,
    tableBorderType: TableBorder.EMPTY
  })

  assert.deepEqual(
    visuals.lines.map(line => [line.x1, line.y1, line.x2, line.y2]),
    [
      [10, 20, 50, 20],
      [10, 20, 10, 50]
    ]
  )
}

function testDrawsTdSlashLines() {
  const visuals = createTableCellVisuals({
    td: {
      ...createTd('a'),
      slashTypes: [TdSlash.FORWARD, TdSlash.BACK]
    },
    x: 10,
    y: 20,
    width: 40,
    height: 30,
    rowIndex: 0,
    colIndex: 0,
    rowCount: 1,
    colCount: 1,
    tableBorderType: TableBorder.EMPTY
  })

  assert.deepEqual(
    visuals.lines.map(line => [line.x1, line.y1, line.x2, line.y2]),
    [
      [10, 50, 50, 20],
      [10, 20, 50, 50]
    ]
  )
}

function testLayoutTableAssignsColumnIndexAfterLeadingRowspan() {
  const rowList = layoutTable({
    kind: 'table',
    element: {
      value: '',
      colgroup: [{ width: 40 }, { width: 50 }],
      trList: [
        {
          height: 20,
          tdList: [createTd('a', 1, 2), createTd('b')]
        },
        {
          height: 30,
          tdList: [createTd('c')]
        }
      ]
    }
  })

  assert.equal(rowList[1].tdList[0].colIndex, 1)
}

function testLayoutTableComputesSpanGeometry() {
  const rowList = layoutTable({
    kind: 'table',
    element: {
      value: '',
      colgroup: [{ width: 40 }, { width: 50 }, { width: 60 }],
      trList: [
        {
          height: 20,
          tdList: [createTd('a', 2, 2), createTd('b')]
        },
        {
          height: 30,
          tdList: [createTd('c')]
        }
      ]
    }
  })

  assert.deepEqual(
    rowList[0].tdList[0],
    {
      ...createTd('a', 2, 2),
      rowIndex: 0,
      colIndex: 0,
      x: 0,
      y: 0,
      width: 90,
      height: 50,
      trIndex: 0,
      tdIndex: 0
    }
  )
}

async function run() {
  testWrapsLongTextByWidth()
  testPreservesExplicitLineBreaks()
  testExpandsTableRowHeightForWrappedCellText()
  testMeasuresRowHeightByActualColumnWidth()
  testMeasuresRowHeightByResolvedCellTextSize()
  testDistributesRowspanExtraHeightToSpanTailRow()
  testCreatesPerLineTextPlacements()
  testResolvesTitleFallbackStyleFromLevel()
  testResolvesOrderedListPrefixWidthAcrossListGroup()
  testOffsetsParagraphPlacementsByResolvedListIndent()
  testShrinksAndRaisesSuperscriptRuns()
  testShrinksAndLowersSubscriptRuns()
  testCreatesSeparatorVectorLine()
  testCreatesLabelPlacement()
  testCreatesBackgroundRect()
  testCreatesBackgroundImagePlacementForMatchingPage()
  testSkipsBackgroundImageWhenPageDoesNotMatch()
  testCreatesRepeatedContainBackgroundImagePlacements()
  await testLayoutDocumentUsesIntrinsicBackgroundImageSize()
  await testLayoutDocumentAppendsPageBorderLines()
  await testLayoutDocumentFallsBackForEmptyControl()
  await testLayoutDocumentRendersControlPlaceholder()
  await testLayoutDocumentRendersDefaultControlPrefixAndPostfix()
  await testLayoutDocumentFallsBackForHeaderControl()
  await testLayoutDocumentRendersStandaloneCheckboxAndRadio()
  await testLayoutDocumentRendersCheckboxAndRadioControlOptions()
  await testLayoutDocumentInheritsCheckboxControlOptionLabelStyles()
  await testLayoutDocumentAppliesCheckboxControlOptionGapSpacing()
  await testLayoutDocumentRendersTextControlValue()
  await testLayoutDocumentResolvesSelectControlTextFromValueSets()
  await testLayoutDocumentInheritsTextControlStyles()
  await testLayoutDocumentAppendsTextControlBorder()
  await testLayoutDocumentMarksLatexAsPending()
  await testLayoutDocumentMarksBlockIframeAndVideoAsPending()
  await testLayoutDocumentAppendsAreaDecorations()
  await testLayoutDocumentAppendsGraffitiStrokes()
  testCreatesCenteredPageNumberPlacement()
  testCreatesContinuityLineNumberPlacements()
  testCreatesPageScopedLineNumberPlacements()
  testCreatesWatermarkPlacementWithFormattedPageNumber()
  testCreatesRepeatedTextWatermarkPlacements()
  testCreatesImageWatermarkPlacement()
  testCreatesRepeatedImageWatermarkPlacements()
  testCreatesSeparateParagraphPlacementsForMultipleRuns()
  testPreservesParagraphRunDecorationFlags()
  testCreatesDecorationLinesFromPlacements()
  testInheritsTableCellTextStyleFromCellElement()
  testCreatesSeparateTableCellPlacementsForMultipleRuns()
  testCentersCellTextVertically()
  testBottomAlignsCellText()
  testRepeatsTableHeaderRowsAcrossPages()
  testKeepsRowspanGroupOnSamePage()
  testRepeatsHeaderWithoutBreakingRowspanGroup()
  testCreatesTableCellBackgroundRect()
  testDrawsExternalTableBordersOnly()
  testDrawsExternalRightBorderForColspanCell()
  testDrawsExternalBottomBorderForRowspanCell()
  testSkipsEmptyTableBorders()
  testDrawsExplicitTdBorders()
  testDrawsTdSlashLines()
  testLayoutTableAssignsColumnIndexAfterLeadingRowspan()
  testLayoutTableComputesSpanGeometry()
  testResolvesPdfBoldItalicFontStyle()
}

run().catch(error => {
  console.error(error)
  process.exit(1)
})
