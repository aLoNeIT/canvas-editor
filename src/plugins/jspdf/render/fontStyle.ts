export function resolvePdfTextFontStyle(option: {
  bold?: boolean
  italic?: boolean
}) {
  if (option.bold && option.italic) {
    return 'bolditalic'
  }
  if (option.bold) {
    return 'bold'
  }
  if (option.italic) {
    return 'italic'
  }
  return 'normal'
}
