import assert from 'node:assert/strict'
import type { ITd } from '../src/editor/interface/table/Td.js'
import {
  TableBorder,
  TdBorder,
  TdSlash
} from '../src/editor/dataset/enum/table/Table.js'
import { VerticalAlign } from '../src/editor/dataset/enum/VerticalAlign.js'
import { ElementType } from '../src/editor/dataset/enum/Element.js'
import { ImageDisplay, NumberType } from '../src/editor/dataset/enum/Common.js'
import { LineNumberType } from '../src/editor/dataset/enum/LineNumber.js'
import { RowFlex } from '../src/editor/dataset/enum/Row.js'
import { BlockType } from '../src/editor/dataset/enum/Block.js'
import { ControlType } from '../src/editor/dataset/enum/Control.js'
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
import { normalizeDocument } from '../src/plugins/jspdf/normalize/normalizeDocument.js'
import {
  resolveBlockTextStyle,
  resolveListBlockSemantics
} from '../src/plugins/jspdf/layout/blockSemantics.js'
import { resolvePdfTextFontStyle } from '../src/plugins/jspdf/render/fontStyle.js'
import { renderImages } from '../src/plugins/jspdf/render/renderImage.js'
import { partitionRasterBlocksByLayer } from '../src/plugins/jspdf/render/renderImage.js'
import { collectPageRenderOperations } from '../src/plugins/jspdf/render/renderStage.js'
import { renderTextRuns } from '../src/plugins/jspdf/render/renderText.js'
import { createTextPlacements } from '../src/plugins/jspdf/layout/textPlacement.js'
import { wrapText } from '../src/plugins/jspdf/layout/wrapText.js'
import {
  getBadgeStateSnapshot,
  installBadgeStateTracking
} from '../src/plugins/jspdf/source/badgeState.js'
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

function createRuntimeSourceOptions() {
  return {
    width: 120,
    height: 100,
    margins: [0, 10, 0, 10],
    scale: 1,
    defaultFont: 'Song',
    defaultSize: 12,
    defaultTabWidth: 32,
    defaultColor: '#000000',
    defaultRowMargin: 1,
    defaultBasicRowMarginHeight: 8,
    background: {
      color: '#ffffff',
      image: '',
      size: BackgroundSize.COVER,
      repeat: BackgroundRepeat.NO_REPEAT,
      applyPageNumbers: []
    },
    list: {
      inheritStyle: false
    },
    label: {
      defaultColor: '#1976d2',
      defaultBackgroundColor: '#e3f2fd',
      defaultBorderRadius: 4,
      defaultPadding: [4, 4, 4, 4]
    },
    imgCaption: {
      color: '#666666',
      font: 'Microsoft YaHei',
      size: 12,
      top: 5
    },
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
    badge: {
      top: 0,
      left: 5
    },
    checkbox: {
      gap: 5
    },
    radio: {
      gap: 5
    },
    control: {
      placeholderColor: '#999999',
      bracketColor: '#666666',
      prefix: '[',
      postfix: ']',
      borderWidth: 1,
      borderColor: '#409eff'
    },
    graffiti: {
      defaultLineWidth: 2,
      defaultLineColor: '#112233'
    },
    title: {
      defaultFirstSize: 26,
      defaultSecondSize: 24,
      defaultThirdSize: 22,
      defaultFourthSize: 20,
      defaultFifthSize: 18,
      defaultSixthSize: 16
    }
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

function testNormalizeDocumentSkipsHiddenElements() {
  const documentModel = normalizeDocument({
    result: {
      data: {
        header: [],
        main: [
          {
            value: 'a'
          },
          {
            value: 'b',
            hide: true
          },
          {
            type: ElementType.CONTROL,
            value: '',
            control: {
              type: ControlType.TEXT,
              value: [
                {
                  value: 'c'
                }
              ],
              hide: true
            }
          },
          {
            type: ElementType.AREA,
            value: '',
            area: {
              hide: true
            },
            valueList: [
              {
                value: 'd'
              }
            ]
          },
          {
            type: ElementType.TITLE,
            value: '',
            level: TitleLevel.FIRST,
            valueList: [
              {
                value: 'e',
                hide: true
              },
              {
                value: 'f'
              }
            ]
          }
        ],
        footer: [],
        graffiti: []
      }
    },
    options: createRuntimeSourceOptions()
  } as any)

  assert.deepEqual(
    documentModel.main.blockList.map(block => ({
      type: block.element.type,
      value: block.element.value,
      childText: (block.element.valueList || []).map(element => element.value).join('')
    })),
    [
      {
        type: undefined,
        value: 'a',
        childText: ''
      },
      {
        type: ElementType.TITLE,
        value: '',
        childText: 'f'
      }
    ]
  )
}

function testTracksBadgeStateViaWrappedCommands() {
  const mainCallList: unknown[] = []
  const areaCallList: unknown[] = []
  const editor = {
    command: {
      executeSetMainBadge(payload: unknown) {
        mainCallList.push(payload)
      },
      executeSetAreaBadge(payload: unknown) {
        areaCallList.push(payload)
      }
    }
  }
  const mainBadge = {
    width: 40,
    height: 20,
    value: 'data:image/png;base64,main'
  }
  const areaBadgeList = [
    {
      areaId: 'area-1',
      badge: {
        left: 8,
        top: 6,
        width: 30,
        height: 12,
        value: 'data:image/png;base64,area'
      }
    }
  ]

  installBadgeStateTracking(editor as any)
  editor.command.executeSetMainBadge(mainBadge)
  editor.command.executeSetAreaBadge(areaBadgeList)

  assert.deepEqual(mainCallList, [mainBadge])
  assert.deepEqual(areaCallList, [areaBadgeList])
  assert.deepEqual(getBadgeStateSnapshot(editor as any), {
    main: mainBadge,
    areas: areaBadgeList
  })
}

function testNormalizeDocumentCopiesBadgeState() {
  const documentModel = normalizeDocument({
    result: {
      data: {
        header: [],
        main: [],
        footer: [],
        graffiti: []
      }
    },
    options: createRuntimeSourceOptions(),
    badge: {
      main: {
        width: 40,
        height: 20,
        value: 'data:image/png;base64,main'
      },
      areas: [
        {
          areaId: 'area-1',
          badge: {
            left: 8,
            top: 6,
            width: 30,
            height: 12,
            value: 'data:image/png;base64,area'
          }
        }
      ]
    }
  } as any)

  assert.deepEqual(documentModel.badge, {
    top: 0,
    left: 5,
    main: {
      width: 40,
      height: 20,
      value: 'data:image/png;base64,main'
    },
    areas: [
      {
        areaId: 'area-1',
        badge: {
          left: 8,
          top: 6,
          width: 30,
          height: 12,
          value: 'data:image/png;base64,area'
        }
      }
    ]
  })
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
      imgCaption: {
        color: '#666666',
        font: 'Microsoft YaHei',
        size: 12,
        top: 5
      },
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

function testCentersParagraphPlacementsByRowFlex() {
  const placementList = createBlockTextPlacements({
    element: {
      value: 'ab',
      rowFlex: RowFlex.CENTER
    },
    x: 10,
    y: 20,
    width: 80,
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
        x: 40,
        y: 32
      }
    ]
  )
}

function testRightAlignsParagraphPlacementsByRowFlex() {
  const placementList = createBlockTextPlacements({
    element: {
      value: 'ab',
      rowFlex: RowFlex.RIGHT
    },
    x: 10,
    y: 20,
    width: 80,
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
        x: 70,
        y: 32
      }
    ]
  )
}

function testJustifiesParagraphPlacementsByRowFlex() {
  const placementList = createBlockTextPlacements({
    element: {
      value: 'ab',
      rowFlex: RowFlex.JUSTIFY
    },
    x: 10,
    y: 20,
    width: 80,
    fallbackFont: 'Song',
    fallbackSize: 12,
    fallbackColor: '#000000',
    measureWidth: createMeasureWidth()
  } as any)

  assert.deepEqual(
    placementList.map(({ text, x, y, width }) => ({
      text,
      x,
      y,
      width
    })),
    [
      {
        text: 'a',
        x: 10,
        y: 32,
        width: 70
      },
      {
        text: 'b',
        x: 80,
        y: 32,
        width: 10
      }
    ]
  )
}

function testAlignsWrappedParagraphPlacementsByRowFlex() {
  const placementList = createBlockTextPlacements({
    element: {
      value: 'abc',
      rowFlex: RowFlex.ALIGNMENT
    },
    x: 10,
    y: 20,
    width: 25,
    fallbackFont: 'Song',
    fallbackSize: 12,
    fallbackColor: '#000000',
    measureWidth: createMeasureWidth()
  } as any)

  assert.deepEqual(
    placementList.map(({ text, x, y, width }) => ({
      text,
      x,
      y,
      width
    })),
    [
      {
        text: 'a',
        x: 10,
        y: 32,
        width: 15
      },
      {
        text: 'b',
        x: 25,
        y: 32,
        width: 10
      },
      {
        text: 'c',
        x: 10,
        y: 52,
        width: 10
      }
    ]
  )
}

function testReservesTabWidthInParagraphPlacements() {
  const placementList = createBlockTextPlacements({
    element: {
      value: '',
      valueList: [
        {
          value: 'a'
        },
        {
          type: ElementType.TAB,
          value: ''
        },
        {
          value: 'b'
        }
      ]
    },
    x: 10,
    y: 20,
    width: 120,
    fallbackFont: 'Song',
    fallbackSize: 12,
    fallbackColor: '#000000',
    fallbackTabWidth: 40,
    measureWidth: createMeasureWidth()
  } as any)

  assert.deepEqual(
    placementList.map(({ text, x, y, width }) => ({
      text,
      x,
      y,
      width
    })),
    [
      {
        text: 'a',
        x: 10,
        y: 32,
        width: 10
      },
      {
        text: ' ',
        x: 20,
        y: 32,
        width: 40
      },
      {
        text: 'b',
        x: 60,
        y: 32,
        width: 10
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
        imgCaption: {
          color: '#666666',
          font: 'Microsoft YaHei',
          size: 12,
          top: 5
        },
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

    assert.deepEqual(pageList[0].rasterBlocks, [])
    assert.deepEqual(pageList[0].issues, [])
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

    assert.deepEqual(pageList[0].rasterBlocks, [])
    assert.deepEqual(pageList[0].issues, [])
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
    stage: 0,
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

async function testLayoutDocumentAppendsMainAndAreaBadges() {
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
    badge: {
      top: 4,
      left: 6,
      main: {
        width: 20,
        height: 10,
        value: 'data:image/png;base64,main'
      },
      areas: [
        {
          areaId: 'area-1',
          badge: {
            top: 3,
            left: 8,
            width: 12,
            height: 6,
            value: 'data:image/png;base64,area'
          }
        }
      ]
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
              backgroundColor: '#ffeeaa'
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
      ({ x, y, width, height, dataUrl, sourceType, debugLabel }) => ({
        x,
        y,
        width,
        height,
        dataUrl,
        sourceType,
        debugLabel
      })
    ),
    [
      {
        x: 6,
        y: 4,
        width: 20,
        height: 10,
        dataUrl: 'data:image/png;base64,main',
        sourceType: 'badge',
        debugLabel: 'badge:main'
      },
      {
        x: 8,
        y: 3,
        width: 12,
        height: 6,
        dataUrl: 'data:image/png;base64,area',
        sourceType: 'badge',
        debugLabel: 'badge:area-1'
      }
    ]
  )
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

async function testLayoutDocumentBreaksPageOnPageBreakElement() {
  const previousDocument = globalThis.document
  const runtimeGlobal = globalThis as any

  runtimeGlobal.document = {
    createElement(tagName: string) {
      if (tagName !== 'canvas') {
        throw new Error(`Unexpected tag: ${tagName}`)
      }

      return {
        toDataURL() {
          return 'data:image/png;base64,page-break-fallback'
        },
        getContext() {
          return {
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
        }
      }
    }
  }

  try {
    const pageList = await layoutDocument({
      width: 100,
      height: 90,
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
            kind: 'paragraph',
            element: {
              value: 'a'
            }
          },
          {
            kind: 'paragraph',
            element: {
              type: ElementType.PAGE_BREAK,
              value: ''
            }
          },
          {
            kind: 'paragraph',
            element: {
              value: 'b'
            }
          },
          {
            kind: 'paragraph',
            element: {
              value: 'c'
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

    assert.equal(pageList.length, 2)
    assert.deepEqual(
      pageList.map(page => page.textRuns.map(run => run.text)),
      [['a'], ['b', 'c']]
    )
    assert.deepEqual(
      pageList.map(page => page.rasterBlocks),
      [[], []]
    )
    assert.deepEqual(
      pageList.map(page => page.issues),
      [[], []]
    )
  } finally {
    runtimeGlobal.document = previousDocument
  }
}

async function testLayoutDocumentRendersTableInsideAreaWrapper() {
  const previousDocument = globalThis.document
  const runtimeGlobal = globalThis as any

  runtimeGlobal.document = {
    createElement(tagName: string) {
      if (tagName !== 'canvas') {
        throw new Error(`Unexpected tag: ${tagName}`)
      }

      return {
        toDataURL() {
          return 'data:image/png;base64,area-wrapper-fallback'
        },
        getContext() {
          return {
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
        }
      }
    }
  }

  try {
    const pageList = await layoutDocument(
      normalizeDocument({
        result: {
          data: {
            header: [],
            main: [
              {
                type: ElementType.AREA,
                value: '',
                areaId: 'area-1',
                area: {
                  backgroundColor: '#ffeeaa',
                  borderColor: '#cc8800'
                },
                valueList: [
                  {
                    type: ElementType.TABLE,
                    value: '',
                    colgroup: [{ width: 80 }],
                    trList: [
                      {
                        height: 24,
                        tdList: [createTd('ab')]
                      }
                    ]
                  }
                ]
              }
            ],
            footer: [],
            graffiti: []
          }
        },
        options: createRuntimeSourceOptions()
      } as any)
    )

    assert.deepEqual(pageList[0].textRuns.map(run => run.text), ['ab'])
    assert.equal(
      pageList[0].highlightRects.some(rect => rect.color === '#ffeeaa'),
      true
    )
    assert.deepEqual(pageList[0].rasterBlocks, [])
    assert.deepEqual(pageList[0].issues, [])
  } finally {
    runtimeGlobal.document = previousDocument
  }
}

async function testLayoutDocumentRendersImageCaptionAndReservesHeight() {
  const previousDocument = globalThis.document
  const runtimeGlobal = globalThis as any

  runtimeGlobal.document = {
    createElement(tagName: string) {
      if (tagName !== 'canvas') {
        throw new Error(`Unexpected tag: ${tagName}`)
      }

      return {
        getContext() {
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
    const pageList = await layoutDocument(
      normalizeDocument({
        result: {
          data: {
            header: [],
            main: [
              {
                type: ElementType.IMAGE,
                value: 'data:image/png;base64,abc',
                width: 100,
                height: 40,
                imgCaption: {
                  value: 'Fig {imageNo}',
                  top: 6,
                  size: 10,
                  font: 'Song',
                  color: '#ff0000'
                }
              },
              {
                value: 'a'
              }
            ],
            footer: [],
            graffiti: []
          }
        },
        options: createRuntimeSourceOptions()
      } as any)
    )

    assert.deepEqual(
      pageList[0].rasterBlocks.map(({ x, y, width, height, sourceType }) => ({
        x,
        y,
        width,
        height,
        sourceType
      })),
      [
        {
          x: 10,
          y: 0,
          width: 100,
          height: 40,
          sourceType: 'image'
        }
      ]
    )
    assert.deepEqual(
      pageList[0].textRuns.map(({ text, x, y, font, size, color }) => ({
        text,
        x,
        y,
        font,
        size,
        color
      })),
      [
        {
          text: 'Fig 1',
          x: 35,
          y: 56,
          font: 'Song',
          size: 10,
          color: '#ff0000'
        },
        {
          text: 'a',
          x: 10,
          y: 76,
          font: 'Song',
          size: 12,
          color: '#000000'
        }
      ]
    )
  } finally {
    runtimeGlobal.document = previousDocument
  }
}

async function testLayoutDocumentRendersTitleWrapperWithMappedSize() {
  const previousDocument = globalThis.document
  const runtimeGlobal = globalThis as any

  runtimeGlobal.document = {
    createElement(tagName: string) {
      if (tagName !== 'canvas') {
        throw new Error(`Unexpected tag: ${tagName}`)
      }

      return {
        getContext() {
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
    const pageList = await layoutDocument(
      normalizeDocument({
        result: {
          data: {
            header: [],
            main: [
              {
                type: ElementType.TITLE,
                value: '',
                level: TitleLevel.FIRST,
                titleId: 'title-1',
                valueList: [
                  {
                    value: 'ab'
                  }
                ]
              }
            ],
            footer: [],
            graffiti: []
          }
        },
        options: createRuntimeSourceOptions()
      } as any)
    )

    assert.deepEqual(
      pageList[0].textRuns.map(({ text, size, bold }) => ({
        text,
        size,
        bold
      })),
      [
        {
          text: 'ab',
          size: 26,
          bold: true
        }
      ]
    )
  } finally {
    runtimeGlobal.document = previousDocument
  }
}

async function testLayoutDocumentKeepsTitleWrapperInlineChildrenInOneBlock() {
  const previousDocument = globalThis.document
  const runtimeGlobal = globalThis as any

  runtimeGlobal.document = {
    createElement(tagName: string) {
      if (tagName !== 'canvas') {
        throw new Error(`Unexpected tag: ${tagName}`)
      }

      return {
        getContext() {
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
    const pageList = await layoutDocument(
      normalizeDocument({
        result: {
          data: {
            header: [],
            main: [
              {
                type: ElementType.TITLE,
                value: '',
                level: TitleLevel.FIRST,
                titleId: 'title-2',
                valueList: [
                  {
                    value: 'a'
                  },
                  {
                    value: 'b'
                  }
                ]
              }
            ],
            footer: [],
            graffiti: []
          }
        },
        options: createRuntimeSourceOptions()
      } as any)
    )

    assert.deepEqual(
      pageList[0].textRuns.map(({ text, y, size, bold }) => ({
        text,
        y,
        size,
        bold
      })),
      [
        {
          text: 'ab',
          y: 34,
          size: 26,
          bold: true
        }
      ]
    )
  } finally {
    runtimeGlobal.document = previousDocument
  }
}

async function testLayoutDocumentRendersHyperlinkWrapperLinks() {
  const previousDocument = globalThis.document
  const runtimeGlobal = globalThis as any

  runtimeGlobal.document = {
    createElement(tagName: string) {
      if (tagName !== 'canvas') {
        throw new Error(`Unexpected tag: ${tagName}`)
      }

      return {
        getContext() {
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
    const pageList = await layoutDocument(
      normalizeDocument({
        result: {
          data: {
            header: [],
            main: [
              {
                type: ElementType.HYPERLINK,
                value: '',
                url: 'https://example.com',
                valueList: [
                  {
                    value: 'ab'
                  }
                ]
              }
            ],
            footer: [],
            graffiti: []
          }
        },
        options: createRuntimeSourceOptions()
      } as any)
    )

    assert.deepEqual(pageList[0].textRuns.map(run => run.text), ['ab'])
    assert.deepEqual(
      pageList[0].links.map(({ x, y, width, height, url }) => ({
        x,
        y,
        width,
        height,
        url
      })),
      [
        {
          x: 10,
          y: 8,
          width: 20,
          height: 24,
          url: 'https://example.com'
        }
      ]
    )
  } finally {
    runtimeGlobal.document = previousDocument
  }
}

async function testLayoutDocumentSplitsHyperlinkLinksAroundSurroundImage() {
  const previousDocument = globalThis.document
  const runtimeGlobal = globalThis as any

  runtimeGlobal.document = {
    createElement(tagName: string) {
      if (tagName !== 'canvas') {
        throw new Error(`Unexpected tag: ${tagName}`)
      }

      return {
        getContext() {
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
    const pageList = await layoutDocument(
      normalizeDocument({
        result: {
          data: {
            header: [],
            main: [
              {
                type: ElementType.IMAGE,
                value: 'data:image/png;base64,hyperlink-surround-split',
                width: 20,
                height: 24,
                imgDisplay: ImageDisplay.SURROUND,
                imgFloatPosition: {
                  pageNo: 0,
                  x: 35,
                  y: 8
                }
              },
              {
                type: ElementType.HYPERLINK,
                value: '',
                url: 'https://example.com/split',
                valueList: [
                  {
                    value: 'abcdefg'
                  }
                ]
              }
            ],
            footer: [],
            graffiti: []
          }
        },
        options: createRuntimeSourceOptions()
      } as any)
    )

    assert.deepEqual(
      pageList[0].textRuns.map(({ text, x, y }) => ({
        text,
        x,
        y
      })),
      [
        {
          text: 'ab',
          x: 10,
          y: 20
        },
        {
          text: 'cdefg',
          x: 55,
          y: 20
        }
      ]
    )
    assert.deepEqual(
      pageList[0].links.map(({ x, y, width, height, url }) => ({
        x,
        y,
        width,
        height,
        url
      })),
      [
        {
          x: 10,
          y: 8,
          width: 20,
          height: 24,
          url: 'https://example.com/split'
        },
        {
          x: 55,
          y: 8,
          width: 50,
          height: 24,
          url: 'https://example.com/split'
        }
      ]
    )
  } finally {
    runtimeGlobal.document = previousDocument
  }
}

async function testLayoutDocumentPlacesFloatingImageOutsideMainFlow() {
  const previousDocument = globalThis.document
  const runtimeGlobal = globalThis as any

  runtimeGlobal.document = {
    createElement(tagName: string) {
      if (tagName !== 'canvas') {
        throw new Error(`Unexpected tag: ${tagName}`)
      }

      return {
        getContext() {
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
    const pageList = await layoutDocument(
      normalizeDocument({
        result: {
          data: {
            header: [],
            main: [
              {
                value: 'a'
              },
              {
                type: ElementType.IMAGE,
                value: 'data:image/png;base64,float-image',
                width: 40,
                height: 20,
                imgDisplay: ImageDisplay.FLOAT_TOP,
                imgFloatPosition: {
                  pageNo: 0,
                  x: 30,
                  y: 25
                }
              },
              {
                value: 'b'
              }
            ],
            footer: [],
            graffiti: []
          }
        },
        options: createRuntimeSourceOptions()
      } as any)
    )

    assert.deepEqual(
      pageList[0].textRuns.map(({ text, x, y }) => ({
        text,
        x,
        y
      })),
      [
        {
          text: 'a',
          x: 10,
          y: 20
        },
        {
          text: 'b',
          x: 10,
          y: 60
        }
      ]
    )
    assert.deepEqual(
      pageList[0].rasterBlocks.map(({ x, y, width, height, sourceType }) => ({
        x,
        y,
        width,
        height,
        sourceType
      })),
      [
        {
          x: 30,
          y: 25,
          width: 40,
          height: 20,
          sourceType: 'image'
        }
      ]
    )
  } finally {
    runtimeGlobal.document = previousDocument
  }
}

async function testLayoutDocumentExtendsPageCountForLaterFloatingImage() {
  const previousDocument = globalThis.document
  const runtimeGlobal = globalThis as any

  runtimeGlobal.document = {
    createElement(tagName: string) {
      if (tagName !== 'canvas') {
        throw new Error(`Unexpected tag: ${tagName}`)
      }

      return {
        getContext() {
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
    const pageList = await layoutDocument(
      normalizeDocument({
        result: {
          data: {
            header: [],
            main: [
              {
                value: 'a'
              },
              {
                type: ElementType.IMAGE,
                value: 'data:image/png;base64,float-image-page-2',
                width: 40,
                height: 20,
                imgDisplay: ImageDisplay.FLOAT_TOP,
                imgFloatPosition: {
                  pageNo: 1,
                  x: 25,
                  y: 15
                }
              }
            ],
            footer: [],
            graffiti: []
          }
        },
        options: createRuntimeSourceOptions()
      } as any)
    )

    assert.equal(pageList.length, 2)
    assert.deepEqual(pageList[0].textRuns.map(run => run.text), ['a'])
    assert.deepEqual(pageList[0].rasterBlocks, [])
    assert.deepEqual(
      pageList[1].rasterBlocks.map(({ x, y, width, height, sourceType }) => ({
        x,
        y,
        width,
        height,
        sourceType
      })),
      [
        {
          x: 25,
          y: 15,
          width: 40,
          height: 20,
          sourceType: 'image'
        }
      ]
    )
  } finally {
    runtimeGlobal.document = previousDocument
  }
}

async function testLayoutDocumentWrapsTextAroundSurroundImage() {
  const previousDocument = globalThis.document
  const runtimeGlobal = globalThis as any

  runtimeGlobal.document = {
    createElement(tagName: string) {
      if (tagName !== 'canvas') {
        throw new Error(`Unexpected tag: ${tagName}`)
      }

      return {
        getContext() {
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
    const pageList = await layoutDocument(
      normalizeDocument({
        result: {
          data: {
            header: [],
            main: [
              {
                value: 'a'
              },
              {
                type: ElementType.IMAGE,
                value: 'data:image/png;base64,surround-image',
                width: 40,
                height: 20,
                imgDisplay: ImageDisplay.SURROUND,
                imgFloatPosition: {
                  pageNo: 0,
                  x: 30,
                  y: 45
                }
              },
              {
                value: 'b'
              }
            ],
            footer: [],
            graffiti: []
          }
        },
        options: createRuntimeSourceOptions()
      } as any)
    )

    assert.deepEqual(
      pageList[0].textRuns.map(({ text, x, y }) => ({
        text,
        x,
        y
      })),
      [
        {
          text: 'a',
          x: 10,
          y: 20
        },
        {
          text: 'b',
          x: 70,
          y: 60
        }
      ]
    )
  } finally {
    runtimeGlobal.document = previousDocument
  }
}

async function testLayoutDocumentContinuesSurroundSplitWhenRightSideIsNarrow() {
  const previousDocument = globalThis.document
  const runtimeGlobal = globalThis as any

  runtimeGlobal.document = {
    createElement(tagName: string) {
      if (tagName !== 'canvas') {
        throw new Error(`Unexpected tag: ${tagName}`)
      }

      return {
        getContext() {
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
    const pageList = await layoutDocument(
      normalizeDocument({
        result: {
          data: {
            header: [],
            main: [
              {
                type: ElementType.IMAGE,
                value: 'data:image/png;base64,surround-image-wide',
                width: 55,
                height: 24,
                imgDisplay: ImageDisplay.SURROUND,
                imgFloatPosition: {
                  pageNo: 0,
                  x: 30,
                  y: 8
                }
              },
              {
                value: 'abcdef'
              },
              {
                value: 'gh'
              }
            ],
            footer: [],
            graffiti: []
          }
        },
        options: createRuntimeSourceOptions()
      } as any)
    )

    assert.deepEqual(
      pageList[0].textRuns.map(({ text, x, y }) => ({
        text,
        x,
        y
      })),
      [
        {
          text: 'a',
          x: 10,
          y: 20
        },
        {
          text: 'bc',
          x: 85,
          y: 20
        },
        {
          text: 'def',
          x: 10,
          y: 44
        },
        {
          text: 'gh',
          x: 10,
          y: 84
        }
      ]
    )
  } finally {
    runtimeGlobal.document = previousDocument
  }
}

async function testLayoutDocumentSplitsTextLineAroundSurroundImage() {
  const previousDocument = globalThis.document
  const runtimeGlobal = globalThis as any

  runtimeGlobal.document = {
    createElement(tagName: string) {
      if (tagName !== 'canvas') {
        throw new Error(`Unexpected tag: ${tagName}`)
      }

      return {
        getContext() {
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
    const pageList = await layoutDocument(
      normalizeDocument({
        result: {
          data: {
            header: [],
            main: [
              {
                type: ElementType.IMAGE,
                value: 'data:image/png;base64,surround-inline-split',
                width: 20,
                height: 24,
                imgDisplay: ImageDisplay.SURROUND,
                imgFloatPosition: {
                  pageNo: 0,
                  x: 35,
                  y: 8
                }
              },
              {
                value: 'abcdefg'
              }
            ],
            footer: [],
            graffiti: []
          }
        },
        options: createRuntimeSourceOptions()
      } as any)
    )

    assert.deepEqual(
      pageList[0].textRuns.map(({ text, x, y }) => ({
        text,
        x,
        y
      })),
      [
        {
          text: 'ab',
          x: 10,
          y: 20
        },
        {
          text: 'cdefg',
          x: 55,
          y: 20
        }
      ]
    )
  } finally {
    runtimeGlobal.document = previousDocument
  }
}

async function testLayoutDocumentContinuesSurroundSplitRemainderBelowImage() {
  const previousDocument = globalThis.document
  const runtimeGlobal = globalThis as any

  runtimeGlobal.document = {
    createElement(tagName: string) {
      if (tagName !== 'canvas') {
        throw new Error(`Unexpected tag: ${tagName}`)
      }

      return {
        getContext() {
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
    const pageList = await layoutDocument(
      normalizeDocument({
        result: {
          data: {
            header: [],
            main: [
              {
                type: ElementType.IMAGE,
                value: 'data:image/png;base64,surround-inline-continue',
                width: 30,
                height: 24,
                imgDisplay: ImageDisplay.SURROUND,
                imgFloatPosition: {
                  pageNo: 0,
                  x: 35,
                  y: 8
                }
              },
              {
                value: 'abcdefgh'
              }
            ],
            footer: [],
            graffiti: []
          }
        },
        options: createRuntimeSourceOptions()
      } as any)
    )

    assert.deepEqual(
      pageList[0].textRuns.map(({ text, x, y }) => ({
        text,
        x,
        y
      })),
      [
        {
          text: 'ab',
          x: 10,
          y: 20
        },
        {
          text: 'cdef',
          x: 65,
          y: 20
        },
        {
          text: 'gh',
          x: 10,
          y: 44
        }
      ]
    )
  } finally {
    runtimeGlobal.document = previousDocument
  }
}

async function testLayoutDocumentSplitsListItemAroundSurroundImage() {
  const previousDocument = globalThis.document
  const runtimeGlobal = globalThis as any

  runtimeGlobal.document = {
    createElement(tagName: string) {
      if (tagName !== 'canvas') {
        throw new Error(`Unexpected tag: ${tagName}`)
      }

      return {
        getContext() {
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
    const pageList = await layoutDocument(
      normalizeDocument({
        result: {
          data: {
            header: [],
            main: [
              {
                type: ElementType.IMAGE,
                value: 'data:image/png;base64,surround-list-split',
                width: 20,
                height: 24,
                imgDisplay: ImageDisplay.SURROUND,
                imgFloatPosition: {
                  pageNo: 0,
                  x: 45,
                  y: 8
                }
              },
              {
                value: 'abcdefg',
                listId: 'list-1',
                listType: ListType.UL,
                listStyle: ListStyle.DISC
              }
            ],
            footer: [],
            graffiti: []
          }
        },
        options: createRuntimeSourceOptions()
      } as any)
    )

    assert.deepEqual(
      pageList[0].textRuns.map(({ text, x, y }) => ({
        text,
        x,
        y
      })),
      [
        {
          text: '•',
          x: 10,
          y: 20
        },
        {
          text: 'a',
          x: 30,
          y: 20
        },
        {
          text: 'bcde',
          x: 65,
          y: 20
        },
        {
          text: 'fg',
          x: 30,
          y: 44
        }
      ]
    )
  } finally {
    runtimeGlobal.document = previousDocument
  }
}

async function testLayoutDocumentContinuesSurroundSplitAcrossStackedImages() {
  const previousDocument = globalThis.document
  const runtimeGlobal = globalThis as any

  runtimeGlobal.document = {
    createElement(tagName: string) {
      if (tagName !== 'canvas') {
        throw new Error(`Unexpected tag: ${tagName}`)
      }

      return {
        getContext() {
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
    const pageList = await layoutDocument(
      normalizeDocument({
        result: {
          data: {
            header: [],
            main: [
              {
                type: ElementType.IMAGE,
                value: 'data:image/png;base64,surround-stacked-top',
                width: 30,
                height: 24,
                imgDisplay: ImageDisplay.SURROUND,
                imgFloatPosition: {
                  pageNo: 0,
                  x: 35,
                  y: 8
                }
              },
              {
                type: ElementType.IMAGE,
                value: 'data:image/png;base64,surround-stacked-bottom',
                width: 30,
                height: 24,
                imgDisplay: ImageDisplay.SURROUND,
                imgFloatPosition: {
                  pageNo: 0,
                  x: 35,
                  y: 32
                }
              },
              {
                value: 'abcdefghijkl'
              }
            ],
            footer: [],
            graffiti: []
          }
        },
        options: createRuntimeSourceOptions()
      } as any)
    )

    assert.deepEqual(
      pageList[0].textRuns.map(({ text, x, y }) => ({
        text,
        x,
        y
      })),
      [
        {
          text: 'ab',
          x: 10,
          y: 20
        },
        {
          text: 'cdef',
          x: 65,
          y: 20
        },
        {
          text: 'gh',
          x: 10,
          y: 44
        },
        {
          text: 'ij',
          x: 65,
          y: 44
        },
        {
          text: 'kl',
          x: 10,
          y: 84
        }
      ]
    )
  } finally {
    runtimeGlobal.document = previousDocument
  }
}

async function testLayoutDocumentSplitsTextAcrossTwoSurroundImages() {
  const previousDocument = globalThis.document
  const runtimeGlobal = globalThis as any

  runtimeGlobal.document = {
    createElement(tagName: string) {
      if (tagName !== 'canvas') {
        throw new Error(`Unexpected tag: ${tagName}`)
      }

      return {
        getContext() {
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
    const pageList = await layoutDocument(
      normalizeDocument({
        result: {
          data: {
            header: [],
            main: [
              {
                type: ElementType.IMAGE,
                value: 'data:image/png;base64,surround-same-line-left',
                width: 20,
                height: 24,
                imgDisplay: ImageDisplay.SURROUND,
                imgFloatPosition: {
                  pageNo: 0,
                  x: 25,
                  y: 8
                }
              },
              {
                type: ElementType.IMAGE,
                value: 'data:image/png;base64,surround-same-line-right',
                width: 20,
                height: 24,
                imgDisplay: ImageDisplay.SURROUND,
                imgFloatPosition: {
                  pageNo: 0,
                  x: 65,
                  y: 8
                }
              },
              {
                value: 'abcd'
              }
            ],
            footer: [],
            graffiti: []
          }
        },
        options: createRuntimeSourceOptions()
      } as any)
    )

    assert.deepEqual(
      pageList[0].textRuns.map(({ text, x, y }) => ({
        text,
        x,
        y
      })),
      [
        {
          text: 'a',
          x: 10,
          y: 20
        },
        {
          text: 'b',
          x: 45,
          y: 20
        },
        {
          text: 'cd',
          x: 85,
          y: 20
        }
      ]
    )
  } finally {
    runtimeGlobal.document = previousDocument
  }
}

async function testLayoutDocumentRepeatsHeaderAndFooterFloatingImages() {
  const previousDocument = globalThis.document
  const runtimeGlobal = globalThis as any

  runtimeGlobal.document = {
    createElement(tagName: string) {
      if (tagName !== 'canvas') {
        throw new Error(`Unexpected tag: ${tagName}`)
      }

      return {
        getContext() {
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
    const pageList = await layoutDocument(
      normalizeDocument({
        result: {
          data: {
            header: [
              {
                type: ElementType.IMAGE,
                value: 'data:image/png;base64,header-float',
                width: 24,
                height: 12,
                imgDisplay: ImageDisplay.FLOAT_TOP,
                imgFloatPosition: {
                  pageNo: 0,
                  x: 5,
                  y: 6
                }
              }
            ],
            main: [
              {
                value: 'a'
              },
              {
                type: ElementType.PAGE_BREAK,
                value: ''
              },
              {
                value: 'b'
              }
            ],
            footer: [
              {
                type: ElementType.IMAGE,
                value: 'data:image/png;base64,footer-float',
                width: 30,
                height: 10,
                imgDisplay: ImageDisplay.FLOAT_BOTTOM,
                imgFloatPosition: {
                  pageNo: 0,
                  x: 12,
                  y: 90
                }
              }
            ],
            graffiti: []
          }
        },
        options: createRuntimeSourceOptions()
      } as any)
    )

    assert.equal(pageList.length, 2)
    assert.deepEqual(
      pageList.map(page =>
        page.rasterBlocks.map(
          ({ dataUrl, x, y, width, height, layer, sourceType }) => ({
            dataUrl,
            x,
            y,
            width,
            height,
            layer,
            sourceType
          })
        )
      ),
      [
        [
          {
            dataUrl: 'data:image/png;base64,header-float',
            x: 5,
            y: 6,
            width: 24,
            height: 12,
            layer: 'overlay',
            sourceType: 'image'
          },
          {
            dataUrl: 'data:image/png;base64,footer-float',
            x: 12,
            y: 90,
            width: 30,
            height: 10,
            layer: 'content',
            sourceType: 'image'
          }
        ],
        [
          {
            dataUrl: 'data:image/png;base64,header-float',
            x: 5,
            y: 6,
            width: 24,
            height: 12,
            layer: 'overlay',
            sourceType: 'image'
          },
          {
            dataUrl: 'data:image/png;base64,footer-float',
            x: 12,
            y: 90,
            width: 30,
            height: 10,
            layer: 'content',
            sourceType: 'image'
          }
        ]
      ]
    )
  } finally {
    runtimeGlobal.document = previousDocument
  }
}

async function testLayoutDocumentAssignsCoreDrawStages() {
  const previousDocument = globalThis.document
  const runtimeGlobal = globalThis as any

  runtimeGlobal.document = {
    createElement(tagName: string) {
      if (tagName !== 'canvas') {
        throw new Error(`Unexpected tag: ${tagName}`)
      }

      return {
        getContext() {
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
      height: 120,
      margins: [0, 0, 0, 0],
      scale: 1,
      defaults: {
        ...createRuntimeSourceOptions(),
        pageBorder: {
          disabled: false,
          color: '#aa0000',
          lineWidth: 1,
          padding: [0, 0, 0, 0]
        },
        lineNumber: {
          disabled: false,
          size: 12,
          font: 'Song',
          color: '#333333',
          right: 10,
          type: LineNumberType.CONTINUITY
        }
      } as any,
      badge: {
        top: 0,
        left: 4,
        main: {
          width: 12,
          height: 8,
          value: 'data:image/png;base64,badge'
        },
        areas: []
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
              value: 'a'
            }
          },
          {
            kind: 'image',
            element: {
              type: ElementType.IMAGE,
              value: 'data:image/png;base64,float-top',
              width: 20,
              height: 10,
              imgDisplay: ImageDisplay.FLOAT_TOP,
              imgFloatPosition: {
                pageNo: 0,
                x: 30,
                y: 10
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
      },
      graffiti: [
        {
          pageNo: 0,
          strokes: [
            {
              lineWidth: 2,
              lineColor: '#00bb00',
              points: [1, 2, 20, 30]
            }
          ]
        }
      ]
    } as any)

    const page = pageList[0]
    const floatTop = page.rasterBlocks.find(
      block => block.dataUrl === 'data:image/png;base64,float-top'
    ) as any
    const badge = page.rasterBlocks.find(
      block => block.dataUrl === 'data:image/png;base64,badge'
    ) as any
    const lineNumber = page.textRuns.find(run => run.text === '1') as any
    const pageBorder = page.vectorLines.find(
      line => line.color === '#aa0000'
    ) as any
    const graffiti = page.vectorLines.find(
      line => line.color === '#00bb00'
    ) as any

    assert.equal(floatTop.stage, 50)
    assert.equal(lineNumber.stage, 60)
    assert.equal(pageBorder.stage, 70)
    assert.equal(badge.stage, 80)
    assert.equal(graffiti.stage, 90)
  } finally {
    runtimeGlobal.document = previousDocument
  }
}

async function testLayoutDocumentAssignsHeaderFooterAndPageNumberStages() {
  const previousDocument = globalThis.document
  const runtimeGlobal = globalThis as any

  runtimeGlobal.document = {
    createElement(tagName: string) {
      if (tagName !== 'canvas') {
        throw new Error(`Unexpected tag: ${tagName}`)
      }

      return {
        getContext() {
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
    const option = createRuntimeSourceOptions()
    const pageList = await layoutDocument(
      normalizeDocument({
        result: {
          data: {
            header: [
              {
                value: 'H'
              }
            ],
            main: [
              {
                value: 'M'
              }
            ],
            footer: [
              {
                value: 'F'
              }
            ],
            graffiti: []
          }
        },
        options: {
          ...option,
          pageNumber: {
            ...option.pageNumber,
            disabled: false,
            format: '{pageNo}'
          }
        }
      } as any)
    )

    const page = pageList[0]
    const mainRun = page.textRuns.find(run => run.text === 'M') as any
    const headerRun = page.textRuns.find(run => run.text === 'H') as any
    const footerRun = page.textRuns.find(run => run.text === 'F') as any
    const pageNoRun = page.textRuns.find(run => run.text === '1') as any

    assert.equal(mainRun.stage, 30)
    assert.equal(headerRun.stage, 40)
    assert.equal(pageNoRun.stage, 41)
    assert.equal(footerRun.stage, 42)
  } finally {
    runtimeGlobal.document = previousDocument
  }
}

async function testLayoutDocumentAssignsStaticZoneBlockStages() {
  const previousDocument = globalThis.document
  const runtimeGlobal = globalThis as any

  runtimeGlobal.document = {
    createElement(tagName: string) {
      if (tagName !== 'canvas') {
        throw new Error(`Unexpected tag: ${tagName}`)
      }

      return {
        getContext() {
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
    const pageList = await layoutDocument(
      normalizeDocument({
        result: {
          data: {
            header: [
              {
                type: ElementType.TABLE,
                value: '',
                borderType: TableBorder.ALL,
                borderColor: '#123456',
                borderWidth: 1,
                colgroup: [{ width: 40 }],
                trList: [
                  {
                    height: 20,
                    tdList: [createTd('HT')]
                  }
                ]
              }
            ],
            main: [
              {
                value: 'M'
              }
            ],
            footer: [
              {
                type: ElementType.IMAGE,
                value: 'data:image/png;base64,footer-image',
                width: 24,
                height: 12
              }
            ],
            graffiti: []
          }
        },
        options: createRuntimeSourceOptions()
      } as any)
    )

    const page = pageList[0]
    const headerTableText = page.textRuns.find(run => run.text === 'HT') as any
    const headerTableLine = page.vectorLines.find(
      line => line.color === '#123456'
    ) as any
    const footerImage = page.rasterBlocks.find(
      block => block.dataUrl === 'data:image/png;base64,footer-image'
    ) as any

    assert.equal(headerTableText.stage, 40)
    assert.equal(headerTableLine.stage, 40)
    assert.equal(footerImage.stage, 42)
  } finally {
    runtimeGlobal.document = previousDocument
  }
}

async function testLayoutDocumentAssignsStaticZoneControlBorderStage() {
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
          return 'data:image/png;base64,unexpected-static-zone-control-border-fallback'
        }
      }
    }
  }

  try {
    const pageList = await layoutDocument(
      normalizeDocument({
        result: {
          data: {
            header: [
              {
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
            ],
            main: [
              {
                value: 'M'
              }
            ],
            footer: [],
            graffiti: []
          }
        },
        options: {
          ...createRuntimeSourceOptions(),
          control: {
            borderWidth: 2,
            borderColor: '#123456'
          }
        }
      } as any)
    )

    const page = pageList[0]
    const borderLine = page.vectorLines.find(
      line => line.color === '#123456' && line.width === 2
    ) as any

    assert.ok(borderLine)
    assert.equal(borderLine.stage, 40)
  } finally {
    runtimeGlobal.document = previousDocument
  }
}

async function testLayoutDocumentMarksStaticZoneLatexAsPending() {
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
          return 'data:image/png;base64,static-zone-latex-fallback'
        }
      }
    }
  }

  try {
    const pageList = await layoutDocument(
      normalizeDocument({
        result: {
          data: {
            header: [
              {
                type: ElementType.LATEX,
                value: 'x^2',
                laTexSVG: '<svg></svg>'
              }
            ],
            main: [
              {
                value: 'M'
              }
            ],
            footer: [],
            graffiti: []
          }
        },
        options: createRuntimeSourceOptions()
      } as any)
    )

    assert.deepEqual(pageList[0].issues, ['pending:latex', 'fallback:latex'])
    assert.equal(pageList[0].rasterBlocks[0]?.stage, 40)
    assert.equal(
      pageList[0].rasterBlocks[0]?.dataUrl,
      'data:image/png;base64,static-zone-latex-fallback'
    )
  } finally {
    runtimeGlobal.document = previousDocument
  }
}

function testPartitionsRasterBlocksByLayer() {
  const result = partitionRasterBlocksByLayer([
    {
      pageNo: 0,
      x: 0,
      y: 0,
      width: 10,
      height: 10,
      dataUrl: 'background',
      layer: 'background'
    },
    {
      pageNo: 0,
      x: 0,
      y: 0,
      width: 10,
      height: 10,
      dataUrl: 'content'
    },
    {
      pageNo: 0,
      x: 0,
      y: 0,
      width: 10,
      height: 10,
      dataUrl: 'overlay',
      layer: 'overlay'
    }
  ])

  assert.deepEqual(
    result.background.map((item: { dataUrl: string }) => item.dataUrl),
    ['background']
  )
  assert.deepEqual(
    result.content.map((item: { dataUrl: string }) => item.dataUrl),
    ['content']
  )
  assert.deepEqual(
    result.overlay.map((item: { dataUrl: string }) => item.dataUrl),
    ['overlay']
  )
}

function testCollectsPageRenderOperationsByStageOrder() {
  const operationList = collectPageRenderOperations({
    pageNo: 0,
    width: 100,
    height: 100,
    textRuns: [
      {
        pageNo: 0,
        text: 'content',
        x: 0,
        y: 0,
        width: 10,
        height: 10,
        font: 'Song',
        size: 12,
        stage: 30
      },
      {
        pageNo: 0,
        text: 'header',
        x: 0,
        y: 0,
        width: 10,
        height: 10,
        font: 'Song',
        size: 12,
        stage: 40
      },
      {
        pageNo: 0,
        text: 'page-number',
        x: 0,
        y: 0,
        width: 10,
        height: 10,
        font: 'Song',
        size: 12,
        stage: 41
      },
      {
        pageNo: 0,
        text: 'footer',
        x: 0,
        y: 0,
        width: 10,
        height: 10,
        font: 'Song',
        size: 12,
        stage: 42
      },
      {
        pageNo: 0,
        text: 'lineNo',
        x: 0,
        y: 0,
        width: 10,
        height: 10,
        font: 'Song',
        size: 12,
        stage: 60
      }
    ],
    highlightRects: [],
    links: [],
    vectorLines: [
      {
        pageNo: 0,
        x1: 0,
        y1: 0,
        x2: 10,
        y2: 10,
        color: '#aa0000',
        stage: 70
      },
      {
        pageNo: 0,
        x1: 0,
        y1: 0,
        x2: 10,
        y2: 10,
        color: '#00bb00',
        stage: 90
      }
    ],
    rasterBlocks: [
      {
        pageNo: 0,
        x: 0,
        y: 0,
        width: 10,
        height: 10,
        dataUrl: 'content-image',
        stage: 20
      },
      {
        pageNo: 0,
        x: 0,
        y: 0,
        width: 10,
        height: 10,
        dataUrl: 'float-top-image',
        stage: 50
      },
      {
        pageNo: 0,
        x: 0,
        y: 0,
        width: 10,
        height: 10,
        dataUrl: 'badge-image',
        stage: 80
      }
    ],
    issues: []
  } as any)

  assert.deepEqual(
    operationList.map(operation => `${operation.stage}:${operation.kind}`),
    [
      '20:raster',
      '30:text',
      '40:text',
      '41:text',
      '42:text',
      '50:raster',
      '60:text',
      '70:vector',
      '80:raster',
      '90:vector'
    ]
  )
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

function testRenderTextRunsAppliesLetterSpacingCharSpace() {
  const charSpaceList: number[] = []
  const textCallList: Array<{
    text: string
    x: number
    y: number
  }> = []
  const doc = {
    getFontList() {
      return {
        Song: ['normal']
      }
    },
    setFont() {
      return this
    },
    setFontSize() {
      return this
    },
    setTextColor() {
      return this
    },
    setCharSpace(value: number) {
      charSpaceList.push(value)
      return this
    },
    text(text: string, x: number, y: number) {
      textCallList.push({
        text,
        x,
        y
      })
      return this
    }
  }

  renderTextRuns(
    doc as any,
    {
      pageNo: 0,
      width: 100,
      height: 100,
      textRuns: [
        {
          pageNo: 0,
          text: 'ab',
          x: 10,
          y: 20,
          width: 30,
          height: 20,
          font: 'Song',
          size: 12,
          color: '#000000',
          letterSpacing: 5
        }
      ],
      highlightRects: [],
      links: [],
      vectorLines: [],
      rasterBlocks: [],
      issues: []
    },
    'Song'
  )

  assert.deepEqual(charSpaceList, [5, 0])
  assert.deepEqual(textCallList, [
    {
      text: 'ab',
      x: 10,
      y: 20
    }
  ])
}

async function testRenderImagesAppliesCropBeforeAddingImage() {
  const previousImage = globalThis.Image
  const previousDocument = globalThis.document
  const runtimeGlobal = globalThis as any
  const drawImageCallList: unknown[][] = []
  const addImageCallList: unknown[][] = []

  class MockImage {
    crossOrigin = ''
    onload: null | (() => void) = null
    onerror: null | (() => void) = null

    set src(_value: string) {
      this.onload?.()
    }
  }

  runtimeGlobal.Image = MockImage
  runtimeGlobal.document = {
    createElement(tagName: string) {
      if (tagName !== 'canvas') {
        throw new Error(`Unexpected tag: ${tagName}`)
      }

      return {
        width: 0,
        height: 0,
        toDataURL() {
          return 'data:image/png;base64,cropped'
        },
        getContext() {
          return {
            drawImage(...args: unknown[]) {
              drawImageCallList.push(args)
            }
          }
        }
      }
    }
  }

  try {
    await renderImages(
      {
        addImage(...args: unknown[]) {
          addImageCallList.push(args)
        }
      } as any,
      [
        {
          pageNo: 0,
          x: 10,
          y: 20,
          width: 60,
          height: 40,
          dataUrl: 'data:image/png;base64,abc',
          sourceType: 'image',
          crop: {
            x: 5,
            y: 6,
            width: 20,
            height: 10
          }
        }
      ]
    )

    assert.deepEqual(
      drawImageCallList.map(args => args.slice(1)),
      [[5, 6, 20, 10, 0, 0, 60, 40]]
    )
    assert.deepEqual(addImageCallList, [
      ['data:image/png;base64,cropped', 'PNG', 10, 20, 60, 40, undefined, undefined, 0]
    ])
  } finally {
    runtimeGlobal.Image = previousImage
    runtimeGlobal.document = previousDocument
  }
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
  testNormalizeDocumentSkipsHiddenElements()
  testTracksBadgeStateViaWrappedCommands()
  testNormalizeDocumentCopiesBadgeState()
  testCreatesPerLineTextPlacements()
  testResolvesTitleFallbackStyleFromLevel()
  testResolvesOrderedListPrefixWidthAcrossListGroup()
  testOffsetsParagraphPlacementsByResolvedListIndent()
  testCentersParagraphPlacementsByRowFlex()
  testRightAlignsParagraphPlacementsByRowFlex()
  testJustifiesParagraphPlacementsByRowFlex()
  testAlignsWrappedParagraphPlacementsByRowFlex()
  testReservesTabWidthInParagraphPlacements()
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
  await testLayoutDocumentAppendsMainAndAreaBadges()
  await testLayoutDocumentAppendsGraffitiStrokes()
  await testLayoutDocumentBreaksPageOnPageBreakElement()
  await testLayoutDocumentRendersTableInsideAreaWrapper()
  await testLayoutDocumentRendersImageCaptionAndReservesHeight()
  await testLayoutDocumentRendersTitleWrapperWithMappedSize()
  await testLayoutDocumentKeepsTitleWrapperInlineChildrenInOneBlock()
  await testLayoutDocumentRendersHyperlinkWrapperLinks()
  await testLayoutDocumentSplitsHyperlinkLinksAroundSurroundImage()
  await testLayoutDocumentPlacesFloatingImageOutsideMainFlow()
  await testLayoutDocumentExtendsPageCountForLaterFloatingImage()
  await testLayoutDocumentWrapsTextAroundSurroundImage()
  await testLayoutDocumentContinuesSurroundSplitWhenRightSideIsNarrow()
  await testLayoutDocumentSplitsTextLineAroundSurroundImage()
  await testLayoutDocumentContinuesSurroundSplitRemainderBelowImage()
  await testLayoutDocumentSplitsListItemAroundSurroundImage()
  await testLayoutDocumentContinuesSurroundSplitAcrossStackedImages()
  await testLayoutDocumentSplitsTextAcrossTwoSurroundImages()
  await testLayoutDocumentRepeatsHeaderAndFooterFloatingImages()
  await testLayoutDocumentAssignsCoreDrawStages()
  await testLayoutDocumentAssignsHeaderFooterAndPageNumberStages()
  await testLayoutDocumentAssignsStaticZoneBlockStages()
  await testLayoutDocumentAssignsStaticZoneControlBorderStage()
  await testLayoutDocumentMarksStaticZoneLatexAsPending()
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
  testPartitionsRasterBlocksByLayer()
  testCollectsPageRenderOperationsByStageOrder()
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
  testRenderTextRunsAppliesLetterSpacingCharSpace()
  await testRenderImagesAppliesCropBeforeAddingImage()
}

run().catch(error => {
  console.error(error)
  process.exit(1)
})
