import { RowFlex } from '../../../editor/dataset/enum/Row'
import type { ITextPlacement } from './textPlacement'

export interface IStyledTextRun {
  text: string
  font: string
  size: number
  ascent?: number
  descent?: number
  rowMargin?: number
  widthOverride?: number
  baselineShift?: number
  letterSpacing?: number
  bold?: boolean
  italic?: boolean
  underline?: boolean
  strikeout?: boolean
  color?: string
  highlight?: string
  linkUrl?: string
  areaId?: string
  areaBackgroundColor?: string
  areaBorderColor?: string
  controlKey?: object
  controlBorder?: boolean
  inlineImageDataUrl?: string
  inlineImageWidth?: number
  inlineImageHeight?: number
  inlineImageCrop?: ITextPlacement['inlineImageCrop']
  lineHeight: number
}

export interface ICreateStyledTextRunPlacementsOption {
  runList: IStyledTextRun[]
  x: number
  y: number
  width: number
  rowFlex?: RowFlex
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

export interface IStyledTextRunPlacementResult {
  placementList: ITextPlacement[]
  contentHeight: number
  lineList: IStyledTextPlacementLine[]
}

interface IPlacementSegment extends Omit<IStyledTextRun, 'text' | 'lineHeight'> {
  text: string
  width: number
}

interface IPlacementLine {
  height: number
  baseline: number
  rowMargin: number
  justify?: boolean
  segmentList: IPlacementSegment[]
}

export interface IStyledTextPlacementLine {
  y: number
  height: number
  baselineOffset: number
  rowMargin: number
  placementList: ITextPlacement[]
}

function isSameStyle(
  left: IPlacementSegment,
  right: Omit<IPlacementSegment, 'text' | 'width'>
) {
  return (
    left.font === right.font &&
    left.size === right.size &&
    left.widthOverride === right.widthOverride &&
    left.baselineShift === right.baselineShift &&
    left.letterSpacing === right.letterSpacing &&
    left.bold === right.bold &&
    left.italic === right.italic &&
    left.underline === right.underline &&
    left.strikeout === right.strikeout &&
    left.color === right.color &&
    left.highlight === right.highlight &&
    left.linkUrl === right.linkUrl &&
    left.areaId === right.areaId &&
    left.areaBackgroundColor === right.areaBackgroundColor &&
    left.areaBorderColor === right.areaBorderColor &&
    left.controlKey === right.controlKey &&
    left.controlBorder === right.controlBorder &&
    left.inlineImageDataUrl === right.inlineImageDataUrl &&
    left.inlineImageWidth === right.inlineImageWidth &&
    left.inlineImageHeight === right.inlineImageHeight &&
    left.inlineImageCrop === right.inlineImageCrop
  )
}

function pushSegment(
  line: IPlacementLine,
  token: Omit<IPlacementSegment, 'text' | 'width'>,
  text: string,
  width: number,
  shouldMerge: boolean
) {
  const lastSegment = line.segmentList[line.segmentList.length - 1]
  if (shouldMerge && lastSegment && isSameStyle(lastSegment, token)) {
    lastSegment.text += text
    lastSegment.width += width
    return
  }

  line.segmentList.push({
    ...token,
    text,
    width
  })
}

function createLine() {
  const line: IPlacementLine = {
    height: 0,
    baseline: 0,
    rowMargin: 0,
    segmentList: []
  }
  return line
}

function resolveRunBaseline(run: Pick<IStyledTextRun, 'ascent' | 'size' | 'baselineShift'>) {
  const ascent = run.ascent ?? run.size
  const baselineShift = run.baselineShift || 0
  return ascent + Math.max(0, -baselineShift)
}

function shouldMergeSameStyle(rowFlex?: RowFlex) {
  return rowFlex !== RowFlex.ALIGNMENT && rowFlex !== RowFlex.JUSTIFY
}

function getLineWidth(line: IPlacementLine) {
  return line.segmentList.reduce((sum, segment) => sum + segment.width, 0)
}

function getJustifyGap(
  line: IPlacementLine,
  option: Pick<ICreateStyledTextRunPlacementsOption, 'width'>
) {
  if (!line.justify || line.segmentList.length < 2) {
    return 0
  }
  const remainingWidth = Math.max(0, option.width - getLineWidth(line))
  return remainingWidth / (line.segmentList.length - 1)
}

function getLineOffsetX(
  line: IPlacementLine,
  option: Pick<ICreateStyledTextRunPlacementsOption, 'width' | 'rowFlex'>
) {
  if (line.justify) {
    return 0
  }

  const remainingWidth = Math.max(0, option.width - getLineWidth(line))

  if (option.rowFlex === RowFlex.CENTER) {
    return remainingWidth / 2
  }
  if (option.rowFlex === RowFlex.RIGHT) {
    return remainingWidth
  }

  return 0
}

function flushLine(
  lineList: IPlacementLine[],
  currentLine: IPlacementLine,
  fallbackRun?: IStyledTextRun,
  justify?: boolean
) {
  if (!currentLine.segmentList.length && fallbackRun) {
    currentLine.segmentList.push({
      text: ' ',
      width: 0,
      font: fallbackRun.font,
      size: fallbackRun.size,
      ascent: fallbackRun.ascent,
      descent: fallbackRun.descent,
      rowMargin: fallbackRun.rowMargin,
      bold: fallbackRun.bold,
      italic: fallbackRun.italic,
      underline: fallbackRun.underline,
      strikeout: fallbackRun.strikeout,
      color: fallbackRun.color,
      highlight: fallbackRun.highlight,
      linkUrl: fallbackRun.linkUrl,
      areaId: fallbackRun.areaId,
      areaBackgroundColor: fallbackRun.areaBackgroundColor,
      areaBorderColor: fallbackRun.areaBorderColor,
      controlKey: fallbackRun.controlKey,
      controlBorder: fallbackRun.controlBorder,
      inlineImageDataUrl: fallbackRun.inlineImageDataUrl,
      inlineImageWidth: fallbackRun.inlineImageWidth,
      inlineImageHeight: fallbackRun.inlineImageHeight,
      inlineImageCrop: fallbackRun.inlineImageCrop
    })
    currentLine.height = fallbackRun.lineHeight
    currentLine.baseline = resolveRunBaseline(fallbackRun)
    currentLine.rowMargin = fallbackRun.rowMargin || 0
  }

  if (currentLine.segmentList.length) {
    currentLine.justify = justify
    lineList.push(currentLine)
  }
}

export function createStyledTextRunPlacements(
  option: ICreateStyledTextRunPlacementsOption
): IStyledTextRunPlacementResult {
  const visibleRunList = option.runList.filter(run => run.text)
  if (!visibleRunList.length) {
    return {
      placementList: [] as ITextPlacement[],
      contentHeight: 0,
      lineList: []
    }
  }

  const lineList: IPlacementLine[] = []
  let currentLine = createLine()
  let currentWidth = 0
  const shouldMerge = shouldMergeSameStyle(option.rowFlex)

  visibleRunList.forEach(run => {
    for (const char of run.text) {
      if (char === '\n') {
        flushLine(
          lineList,
          currentLine,
          run,
          option.rowFlex === RowFlex.JUSTIFY
        )
        currentLine = createLine()
        currentWidth = 0
        continue
      }

      const charWidth = option.measureWidth(char, {
        font: run.font,
        size: run.size,
        bold: run.bold,
        italic: run.italic
      }) + (run.letterSpacing || 0)
      const resolvedCharWidth = run.widthOverride ?? charWidth

      if (
        currentLine.segmentList.length &&
        currentWidth + resolvedCharWidth > option.width
      ) {
        flushLine(
          lineList,
          currentLine,
          run,
          option.rowFlex === RowFlex.JUSTIFY ||
            option.rowFlex === RowFlex.ALIGNMENT
        )
        currentLine = createLine()
        currentWidth = 0
      }

      pushSegment(
        currentLine,
        {
          font: run.font,
          size: run.size,
          ascent: run.ascent,
          descent: run.descent,
          rowMargin: run.rowMargin,
          widthOverride: run.widthOverride,
          baselineShift: run.baselineShift,
          letterSpacing: run.letterSpacing,
          bold: run.bold,
          italic: run.italic,
          underline: run.underline,
          strikeout: run.strikeout,
          color: run.color,
          highlight: run.highlight,
          linkUrl: run.linkUrl,
          areaId: run.areaId,
          areaBackgroundColor: run.areaBackgroundColor,
          areaBorderColor: run.areaBorderColor,
          controlKey: run.controlKey,
          controlBorder: run.controlBorder,
          inlineImageDataUrl: run.inlineImageDataUrl,
          inlineImageWidth: run.inlineImageWidth,
          inlineImageHeight: run.inlineImageHeight,
          inlineImageCrop: run.inlineImageCrop
        },
        char,
        resolvedCharWidth,
        shouldMerge
      )
      currentWidth += resolvedCharWidth
      currentLine.height = Math.max(currentLine.height, run.lineHeight)
      currentLine.baseline = Math.max(
        currentLine.baseline,
        resolveRunBaseline(run)
      )
      currentLine.rowMargin = Math.max(
        currentLine.rowMargin,
        run.rowMargin || 0
      )
    }
  })

  flushLine(
    lineList,
    currentLine,
    visibleRunList[visibleRunList.length - 1],
    option.rowFlex === RowFlex.JUSTIFY
  )

  const placementList: ITextPlacement[] = []
  const styledLineList: IStyledTextPlacementLine[] = []
  let cursorY = option.y
  lineList.forEach(line => {
    const justifyGap = getJustifyGap(line, option)
    let cursorX = option.x + getLineOffsetX(line, option)
    const linePlacementList: ITextPlacement[] = []
    line.segmentList.forEach((segment, index) => {
      const placementWidth =
        segment.width +
        (index < line.segmentList.length - 1 ? justifyGap : 0)
      const placement: ITextPlacement = {
        text: segment.text,
        x: cursorX,
        y: cursorY + line.baseline + (segment.baselineShift || 0),
        width: placementWidth,
        height: line.height,
        font: segment.font,
        size: segment.size,
        ascent: segment.ascent,
        descent: segment.descent,
        widthOverride: segment.widthOverride,
        baselineShift: segment.baselineShift,
        rowMargin: line.rowMargin,
        letterSpacing: segment.letterSpacing,
        bold: segment.bold,
        italic: segment.italic,
        underline: segment.underline,
        strikeout: segment.strikeout,
        color: segment.color,
        highlight: segment.highlight,
        linkUrl: segment.linkUrl,
        areaId: segment.areaId,
        areaBackgroundColor: segment.areaBackgroundColor,
        areaBorderColor: segment.areaBorderColor,
        controlKey: segment.controlKey,
        controlBorder: segment.controlBorder,
        inlineImageDataUrl: segment.inlineImageDataUrl,
        inlineImageWidth: segment.inlineImageWidth,
        inlineImageHeight: segment.inlineImageHeight,
        inlineImageCrop: segment.inlineImageCrop,
        baselineOffset: line.baseline
      }
      placementList.push(placement)
      linePlacementList.push(placement)
      cursorX += placementWidth
    })
    styledLineList.push({
      y: cursorY,
      height: line.height,
      baselineOffset: line.baseline,
      rowMargin: line.rowMargin,
      placementList: linePlacementList
    })
    cursorY += line.height
  })

  return {
    placementList,
    contentHeight: lineList.reduce((sum, line) => sum + line.height, 0),
    lineList: styledLineList
  }
}
