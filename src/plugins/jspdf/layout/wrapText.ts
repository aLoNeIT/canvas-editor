export interface IWrapTextOption {
  text: string
  maxWidth: number
  measureWidth: (text: string) => number
}

export function wrapText(option: IWrapTextOption): string[] {
  const paragraphList = option.text.split('\n')
  const maxWidth = Math.max(1, option.maxWidth)
  const lineList: string[] = []

  paragraphList.forEach(paragraph => {
    if (!paragraph.length) {
      lineList.push('')
      return
    }

    let currentLine = ''

    Array.from(paragraph).forEach(char => {
      const nextLine = `${currentLine}${char}`
      if (!currentLine || option.measureWidth(nextLine) <= maxWidth) {
        currentLine = nextLine
        return
      }

      lineList.push(currentLine)
      currentLine = char
    })

    lineList.push(currentLine)
  })

  return lineList
}
