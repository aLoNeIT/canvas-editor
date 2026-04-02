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
import { RowFlex } from '../src/editor/dataset/enum/Row.js'
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
  createPageNumberPlacement,
  createWatermarkPlacement
} from '../src/plugins/jspdf/layout/framePlacement.js'
import { createLabelPlacement } from '../src/plugins/jspdf/layout/labelPlacement.js'
import { createTableCellVisuals } from '../src/plugins/jspdf/layout/tableVisual.js'
import { createSeparatorVectorLine } from '../src/plugins/jspdf/layout/separatorPlacement.js'
import { paginateTableRows } from '../src/plugins/jspdf/layout/tablePagination.js'
import {
  measureTableRowHeight,
  resolveTableRowHeightList
} from '../src/plugins/jspdf/layout/tableMetrics.js'
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

  assert.deepEqual(placements, [
    {
      x: 0,
      y: 0,
      width: 40,
      height: 20,
      dataUrl: 'data:image/png;base64,abc',
      sourceType: 'watermark-image',
      opacity: 0.3,
      rotate: -45
    },
    {
      x: 50,
      y: 0,
      width: 40,
      height: 20,
      dataUrl: 'data:image/png;base64,abc',
      sourceType: 'watermark-image',
      opacity: 0.3,
      rotate: -45
    },
    {
      x: 100,
      y: 0,
      width: 40,
      height: 20,
      dataUrl: 'data:image/png;base64,abc',
      sourceType: 'watermark-image',
      opacity: 0.3,
      rotate: -45
    },
    {
      x: 150,
      y: 0,
      width: 40,
      height: 20,
      dataUrl: 'data:image/png;base64,abc',
      sourceType: 'watermark-image',
      opacity: 0.3,
      rotate: -45
    },
    {
      x: 0,
      y: 40,
      width: 40,
      height: 20,
      dataUrl: 'data:image/png;base64,abc',
      sourceType: 'watermark-image',
      opacity: 0.3,
      rotate: -45
    },
    {
      x: 50,
      y: 40,
      width: 40,
      height: 20,
      dataUrl: 'data:image/png;base64,abc',
      sourceType: 'watermark-image',
      opacity: 0.3,
      rotate: -45
    },
    {
      x: 100,
      y: 40,
      width: 40,
      height: 20,
      dataUrl: 'data:image/png;base64,abc',
      sourceType: 'watermark-image',
      opacity: 0.3,
      rotate: -45
    },
    {
      x: 150,
      y: 40,
      width: 40,
      height: 20,
      dataUrl: 'data:image/png;base64,abc',
      sourceType: 'watermark-image',
      opacity: 0.3,
      rotate: -45
    },
    {
      x: 0,
      y: 80,
      width: 40,
      height: 20,
      dataUrl: 'data:image/png;base64,abc',
      sourceType: 'watermark-image',
      opacity: 0.3,
      rotate: -45
    },
    {
      x: 50,
      y: 80,
      width: 40,
      height: 20,
      dataUrl: 'data:image/png;base64,abc',
      sourceType: 'watermark-image',
      opacity: 0.3,
      rotate: -45
    },
    {
      x: 100,
      y: 80,
      width: 40,
      height: 20,
      dataUrl: 'data:image/png;base64,abc',
      sourceType: 'watermark-image',
      opacity: 0.3,
      rotate: -45
    },
    {
      x: 150,
      y: 80,
      width: 40,
      height: 20,
      dataUrl: 'data:image/png;base64,abc',
      sourceType: 'watermark-image',
      opacity: 0.3,
      rotate: -45
    },
    {
      x: 0,
      y: 120,
      width: 40,
      height: 20,
      dataUrl: 'data:image/png;base64,abc',
      sourceType: 'watermark-image',
      opacity: 0.3,
      rotate: -45
    },
    {
      x: 50,
      y: 120,
      width: 40,
      height: 20,
      dataUrl: 'data:image/png;base64,abc',
      sourceType: 'watermark-image',
      opacity: 0.3,
      rotate: -45
    },
    {
      x: 100,
      y: 120,
      width: 40,
      height: 20,
      dataUrl: 'data:image/png;base64,abc',
      sourceType: 'watermark-image',
      opacity: 0.3,
      rotate: -45
    },
    {
      x: 150,
      y: 120,
      width: 40,
      height: 20,
      dataUrl: 'data:image/png;base64,abc',
      sourceType: 'watermark-image',
      opacity: 0.3,
      rotate: -45
    }
  ])
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

function run() {
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
  testCreatesCenteredPageNumberPlacement()
  testCreatesWatermarkPlacementWithFormattedPageNumber()
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

run()
