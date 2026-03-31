import type jsPDF from 'jspdf'
import { SONG_TTF_URL } from './assets/song'

export interface IFontBootstrapOption {
  fonts?: Record<string, string>
  defaultFontFamily?: string
  debug?: boolean
}

const urlToBase64Cache = new Map<string, Promise<string>>()

function warn(debug: boolean | undefined, message: string, error?: unknown) {
  if (!debug) return
  if (error) {
    // eslint-disable-next-line no-console
    console.warn(message, error)
    return
  }
  // eslint-disable-next-line no-console
  console.warn(message)
}

function toVfsFilename(fontFamily: string) {
  const safe = fontFamily.trim().replace(/[^\w.-]+/g, '_')
  return `${safe || 'font'}.ttf`
}

function arrayBufferToBase64(buffer: ArrayBuffer) {
  const g = globalThis as any
  const bytes = new Uint8Array(buffer)

  if (g?.Buffer) {
    return g.Buffer.from(bytes).toString('base64')
  }

  if (typeof g?.btoa !== 'function') {
    throw new Error('Base64 encoding is not available in this environment')
  }

  const chunkSize = 0x8000
  let binary = ''
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize)
    let chunkBinary = ''
    for (let j = 0; j < chunk.length; j++) {
      chunkBinary += String.fromCharCode(chunk[j])
    }
    binary += chunkBinary
  }
  return g.btoa(binary)
}

async function loadUrlAsBase64(url: string) {
  const cached = urlToBase64Cache.get(url)
  if (cached) return cached

  const promise = (async () => {
    const res = await fetch(url)
    if (!res.ok) {
      throw new Error(`Failed to fetch font: ${res.status} ${res.statusText}`)
    }
    const buf = await res.arrayBuffer()
    return arrayBufferToBase64(buf)
  })()

  urlToBase64Cache.set(url, promise)
  return promise
}

async function registerSongFallback(doc: jsPDF, debug?: boolean) {
  const marker = '__canvasEditorSongFontRegistered'
  if ((doc as any)[marker]) return

  try {
    if (!SONG_TTF_URL) return
    const filename = 'Song.ttf'
    if (!doc.existsFileInVFS(filename)) {
      const base64 = await loadUrlAsBase64(SONG_TTF_URL)
      doc.addFileToVFS(filename, base64)
    }
    doc.addFont(filename, 'Song', 'normal')
    ;(doc as any)[marker] = true
  } catch (e) {
    warn(debug, 'Failed to register Song fallback font', e)
  }
}

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

async function registerFontFromUrl(
  doc: jsPDF,
  fontFamily: string,
  url: string,
  debug?: boolean
) {
  try {
    const base64 = await loadUrlAsBase64(url)
    const filename = toVfsFilename(fontFamily)
    if (!doc.existsFileInVFS(filename)) {
      doc.addFileToVFS(filename, base64)
    }
    doc.addFont(filename, fontFamily, 'normal')
  } catch (e) {
    warn(debug, `Failed to register font '${fontFamily}' from URL`, e)
  }
}

export async function bootstrapPdfFonts(
  doc: jsPDF,
  options: IFontBootstrapOption = {}
) {
  await registerSongFallback(doc, options.debug)

  const fonts = options.fonts || {}
  for (const [fontFamily, url] of Object.entries(fonts)) {
    if (!fontFamily || !url) continue
    // eslint-disable-next-line no-await-in-loop
    await registerFontFromUrl(doc, fontFamily, url, options.debug)
  }

  const defaultFontFamily = options.defaultFontFamily || 'Song'
  const resolvedDefaultFontFamily = resolvePdfFontFamily(
    doc,
    defaultFontFamily
  )
  try {
    doc.setFont(resolvedDefaultFontFamily)
  } catch (e) {
    warn(
      options.debug,
      `Failed to set default PDF font to '${resolvedDefaultFontFamily}'`,
      e
    )
  }

  return {
    defaultFontFamily: resolvedDefaultFontFamily
  }
}
