import type jsPDF from 'jspdf'

export const PDF_FONT_STYLE_LIST = [
  'normal',
  'bold',
  'italic',
  'bolditalic'
] as const

export function registerPdfFontStyles(
  doc: jsPDF,
  filename: string,
  fontFamily: string
) {
  const fontList = doc.getFontList() as Record<string, string[]>
  const registeredStyleList = fontList[fontFamily] || []

  PDF_FONT_STYLE_LIST.forEach(style => {
    if (registeredStyleList.includes(style)) return
    doc.addFont(filename, fontFamily, style)
  })
}
