import type { ITextPlacement } from './textPlacement'

export interface IStyledTextRun {
  text: string
  font: string
  size: number
  baselineShift?: number
  bold?: boolean
  italic?: boolean
  underline?: boolean
  strikeout?: boolean
  color?: string
  lineHeight: number
}

export interface ICreateStyledTextRunPlacementsOption {
  runList: IStyledTextRun[]
  x: number
  y: number
  width: number
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
  segmentList: IPlacementSegment[]
}

export interface IStyledTextPlacementLine {
  y: number
  height: number
  baselineOffset: number
  placementList: ITextPlacement[]
}

function isSameStyle(
  left: IPlacementSegment,
  right: Omit<IPlacementSegment, 'text' | 'width'>
) {
  return (
    left.font === right.font &&
    left.size === right.size &&
    left.baselineShift === right.baselineShift &&
    left.bold === right.bold &&
    left.italic === right.italic &&
    left.underline === right.underline &&
    left.strikeout === right.strikeout &&
    left.color === right.color
  )
}

function pushSegment(
  line: IPlacementLine,
  token: Omit<IPlacementSegment, 'text' | 'width'>,
  text: string,
  width: number
) {
  const lastSegment = line.segmentList[line.segmentList.length - 1]
  if (lastSegment && isSameStyle(lastSegment, token)) {
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
    segmentList: []
  }
  return line
}

function flushLine(
  lineList: IPlacementLine[],
  currentLine: IPlacementLine,
  fallbackRun?: IStyledTextRun
) {
  if (!currentLine.segmentList.length && fallbackRun) {
    currentLine.segmentList.push({
      text: ' ',
      width: 0,
      font: fallbackRun.font,
      size: fallbackRun.size,
      bold: fallbackRun.bold,
      italic: fallbackRun.italic,
      underline: fallbackRun.underline,
      strikeout: fallbackRun.strikeout,
      color: fallbackRun.color
    })
    currentLine.height = fallbackRun.lineHeight
    currentLine.baseline = fallbackRun.size
  }

  if (currentLine.segmentList.length) {
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

  visibleRunList.forEach(run => {
    for (const char of run.text) {
      if (char === '\n') {
        flushLine(lineList, currentLine, run)
        currentLine = createLine()
        currentWidth = 0
        continue
      }

      const charWidth = option.measureWidth(char, {
        font: run.font,
        size: run.size,
        bold: run.bold,
        italic: run.italic
      })

      if (
        currentLine.segmentList.length &&
        currentWidth + charWidth > option.width
      ) {
        flushLine(lineList, currentLine, run)
        currentLine = createLine()
        currentWidth = 0
      }

      pushSegment(
        currentLine,
        {
          font: run.font,
          size: run.size,
          baselineShift: run.baselineShift,
          bold: run.bold,
          italic: run.italic,
          underline: run.underline,
          strikeout: run.strikeout,
          color: run.color
        },
        char,
        charWidth
      )
      currentWidth += charWidth
      currentLine.height = Math.max(currentLine.height, run.lineHeight)
      currentLine.baseline = Math.max(currentLine.baseline, run.size)
    }
  })

  flushLine(lineList, currentLine, visibleRunList[visibleRunList.length - 1])

  const placementList: ITextPlacement[] = []
  const styledLineList: IStyledTextPlacementLine[] = []
  let cursorY = option.y
  lineList.forEach(line => {
    let cursorX = option.x
    const linePlacementList: ITextPlacement[] = []
    line.segmentList.forEach(segment => {
      const placement: ITextPlacement = {
        text: segment.text,
        x: cursorX,
        y: cursorY + line.baseline + (segment.baselineShift || 0),
        width: segment.width,
        height: line.height,
        font: segment.font,
        size: segment.size,
        baselineShift: segment.baselineShift,
        bold: segment.bold,
        italic: segment.italic,
        underline: segment.underline,
        strikeout: segment.strikeout,
        color: segment.color,
        baselineOffset: line.baseline
      }
      placementList.push(placement)
      linePlacementList.push(placement)
      cursorX += segment.width
    })
    styledLineList.push({
      y: cursorY,
      height: line.height,
      baselineOffset: line.baseline,
      placementList: linePlacementList
    })
    cursorY += line.height
  })

  return {
    placementList,
    contentHeight: lineList.reduce((sum, line) => sum + line.height, 0) + 8,
    lineList: styledLineList
  }
}
