import type jsPDF from 'jspdf'

export const PDF_FONT_STYLE_LIST = [
  'normal',
  'bold',
  'italic',
  'bolditalic'
] as const

export type TPdfFontStyle = (typeof PDF_FONT_STYLE_LIST)[number]

export type TPdfFontFileMap =
  | string
  | Partial<Record<TPdfFontStyle, string>>

function resolveFilenameForStyle(
  filename: TPdfFontFileMap,
  style: TPdfFontStyle
) {
  if (typeof filename === 'string') {
    return filename
  }

  return (
    filename[style] ||
    (style === 'bolditalic' ? filename.bold : undefined) ||
    (style === 'italic' ? filename.normal : undefined) ||
    filename.normal
  )
}

export function registerPdfFontStyles(
  doc: jsPDF,
  filename: TPdfFontFileMap,
  fontFamily: string
) {
  const fontList = doc.getFontList() as Record<string, string[]>
  const registeredStyleList = fontList[fontFamily] || []

  PDF_FONT_STYLE_LIST.forEach(style => {
    if (registeredStyleList.includes(style)) return
    const resolvedFilename = resolveFilenameForStyle(filename, style)
    if (!resolvedFilename) return
    doc.addFont(resolvedFilename, fontFamily, style)
  })
}
