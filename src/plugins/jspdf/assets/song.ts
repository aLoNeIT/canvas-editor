const songFontModuleMap = import.meta.globEager(
  '../../../assets/fonts/simsun.ttf'
) as Record<string, { default: string }>

export const SONG_TTF_URL =
  songFontModuleMap['../../../assets/fonts/simsun.ttf']?.default || ''
