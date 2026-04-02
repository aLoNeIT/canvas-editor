export function createFontKey(
  font: string,
  size: number,
  bold?: boolean,
  italic?: boolean
) {
  return [font, size, bold ? 'bold' : 'normal', italic ? 'italic' : 'normal']
    .join(':')
}
