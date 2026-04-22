import type jsPDF from 'jspdf'

function getAvailableFontFamilySet(doc: jsPDF) {
  const fontList = doc.getFontList()
  return new Set(
    Object.keys(fontList).map(fontFamily => fontFamily.toLowerCase())
  )
}

export function resolvePdfFontFamily(
  doc: jsPDF,
  fontFamily?: string,
  fallbackFontFamily = 'helvetica'
) {
  const availableFonts = getAvailableFontFamilySet(doc)
  const candidate = fontFamily?.trim().toLowerCase()
  if (candidate && availableFonts.has(candidate)) {
    return fontFamily!
  }
  return fallbackFontFamily
}
