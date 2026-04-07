# jsPDF Plugin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a `jspdf` plugin for `canvas-editor` that exports the current document as a pure PDF base64 string with selectable text and vector graphics for supported content.

**Architecture:** Add a new plugin in `src/plugins/jspdf/` that extends `editor.command` with `executeExportPdfBase64()`. Reuse the editor's computed draw layout as the source of truth, convert pages into a PDF-specific intermediate model, then render that model with jsPDF using registered fonts and localized raster fallbacks for unsupported particles.

**Tech Stack:** TypeScript, existing `canvas-editor` draw pipeline, jsPDF, Vite, ESLint, TypeScript compiler

---

### Task 1: Add jsPDF dependency and plugin command types

**Files:**
- Modify: `d:/Work/Project/JavaScript/canvas-editor/package.json`
- Create: `d:/Work/Project/JavaScript/canvas-editor/src/plugins/jspdf/index.ts`

- [ ] **Step 1: Add the dependency entry**

Update `package.json` so the runtime dependencies include jsPDF.

```json
{
  "dependencies": {
    "jspdf": "^2.5.1",
    "prismjs": "^1.27.0"
  }
}
```

- [ ] **Step 2: Install the dependency**

Run: `npm install`
Expected: install completes and `package-lock.json` records `jspdf`

- [ ] **Step 3: Add plugin option and command types**

Create `src/plugins/jspdf/index.ts` with the public plugin-facing types and
command extension shape.

```ts
import Editor, {
  Command,
  EditorMode,
  PaperDirection
} from '../../editor'

export interface IJspdfPluginOption {
  fonts?: Record<string, string>
  defaultFontFamily?: string
  debug?: boolean
}

export interface IJspdfExportOption extends IJspdfPluginOption {
  mode?: EditorMode
  paperDirection?: PaperDirection
}

export type CommandWithJspdf = Command & {
  executeExportPdfBase64(payload?: IJspdfExportOption): Promise<string>
}
```

- [ ] **Step 4: Add the initial plugin entry point**

Use the same extension style as `src/plugins/markdown/index.ts` so the plugin
can attach a new command without changing the core plugin framework.

```ts
export function jspdfPlugin(editor: Editor, options: IJspdfPluginOption = {}) {
  const command = editor.command as CommandWithJspdf

  command.executeExportPdfBase64 = async payload => {
    const finalOption: IJspdfExportOption = {
      ...options,
      ...payload
    }
    const mode = finalOption.mode || EditorMode.PRINT
    if (mode !== EditorMode.PRINT) {
      throw new Error('PDF export currently requires print mode layout')
    }
    return ''
  }
}
```

- [ ] **Step 5: Run type check to verify the new file compiles**

Run: `npm run type:check`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json src/plugins/jspdf/index.ts
git commit -m "feat: add jspdf plugin scaffolding"
```

### Task 2: Expose a stable draw snapshot for PDF export

**Files:**
- Modify: `d:/Work/Project/JavaScript/canvas-editor/src/editor/interface/Draw.ts`
- Modify: `d:/Work/Project/JavaScript/canvas-editor/src/editor/core/draw/Draw.ts`
- Modify: `d:/Work/Project/JavaScript/canvas-editor/src/editor/core/command/CommandAdapt.ts`
- Modify: `d:/Work/Project/JavaScript/canvas-editor/src/editor/core/command/Command.ts`
- Modify: `d:/Work/Project/JavaScript/canvas-editor/src/editor/index.ts`

- [ ] **Step 1: Define snapshot types in the draw interface file**

Extend `src/editor/interface/Draw.ts` with a small export-specific snapshot
type instead of letting the plugin reach through private draw state.

```ts
export interface IPdfExportPageSnapshot {
  pageNo: number
  width: number
  height: number
  rowList: IRow[]
}

export interface IPdfExportSnapshot {
  pageDirection: PaperDirection
  pageWidth: number
  pageHeight: number
  pageList: IPdfExportPageSnapshot[]
  elementList: IElement[]
}
```

- [ ] **Step 2: Add a draw getter that packages page and row data**

Implement a focused helper in `Draw.ts` that returns a read-only PDF export
snapshot based on existing `getPageRowList()`, `getOriginalMainElementList()`,
and `getOptions()`.

```ts
public getPdfExportSnapshot(): IPdfExportSnapshot {
  const options = this.getOptions()
  const pageRowList = this.getPageRowList()

  return {
    pageDirection: options.paperDirection,
    pageWidth: options.width,
    pageHeight: options.height,
    elementList: this.getOriginalMainElementList(),
    pageList: pageRowList.map((rowList, pageNo) => ({
      pageNo,
      width: options.width,
      height: options.height,
      rowList
    }))
  }
}
```

- [ ] **Step 3: Bridge the snapshot through the command adapter**

Expose the draw helper through `CommandAdapt.ts`.

```ts
public getPdfExportSnapshot(): IPdfExportSnapshot {
  return this.draw.getPdfExportSnapshot()
}
```

- [ ] **Step 4: Add the getter to `Command.ts`**

Bind the new getter the same way existing getters are exposed.

```ts
public getPdfExportSnapshot: CommandAdapt['getPdfExportSnapshot']

this.getPdfExportSnapshot = adapt.getPdfExportSnapshot.bind(adapt)
```

- [ ] **Step 5: Export the new type from the public editor entry**

Update `src/editor/index.ts` so plugin code can import the snapshot type.

```ts
export type {
  IPdfExportSnapshot,
  IPdfExportPageSnapshot
}
```

- [ ] **Step 6: Run type check**

Run: `npm run type:check`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/editor/interface/Draw.ts src/editor/core/draw/Draw.ts src/editor/core/command/CommandAdapt.ts src/editor/core/command/Command.ts src/editor/index.ts
git commit -m "feat: expose pdf export snapshot"
```

### Task 3: Build the plugin's PDF intermediate model

**Files:**
- Create: `d:/Work/Project/JavaScript/canvas-editor/src/plugins/jspdf/types.ts`
- Create: `d:/Work/Project/JavaScript/canvas-editor/src/plugins/jspdf/buildSnapshot.ts`
- Modify: `d:/Work/Project/JavaScript/canvas-editor/src/plugins/jspdf/index.ts`
- Test: `d:/Work/Project/JavaScript/canvas-editor/src/plugins/jspdf/buildSnapshot.ts`

- [ ] **Step 1: Define normalized PDF model types**

Create `src/plugins/jspdf/types.ts` with narrow structures for supported
content.

```ts
export interface IPdfTextRun {
  pageNo: number
  text: string
  x: number
  y: number
  width: number
  height: number
  font: string
  size: number
  bold?: boolean
  italic?: boolean
  color?: string
  hyperlink?: string
  underline?: boolean
  strikeout?: boolean
  highlight?: string
}

export interface IPdfVectorLine {
  pageNo: number
  x1: number
  y1: number
  x2: number
  y2: number
  color?: string
  width?: number
  dash?: number[]
}

export interface IPdfRasterBlock {
  pageNo: number
  x: number
  y: number
  width: number
  height: number
  dataUrl: string
}

export interface IPdfPageModel {
  pageNo: number
  width: number
  height: number
  textRuns: IPdfTextRun[]
  vectorLines: IPdfVectorLine[]
  rasterBlocks: IPdfRasterBlock[]
}
```

- [ ] **Step 2: Add a first-pass snapshot builder**

Create `src/plugins/jspdf/buildSnapshot.ts` that consumes the new command
getter and maps row elements to text runs.

```ts
import type { IPdfExportSnapshot } from '../../editor'
import type { IPdfPageModel } from './types'

export function buildPdfPageModels(
  snapshot: IPdfExportSnapshot
): IPdfPageModel[] {
  return snapshot.pageList.map(page => ({
    pageNo: page.pageNo,
    width: page.width,
    height: page.height,
    textRuns: page.rowList.flatMap(row =>
      row.elementList.map(el => ({
        pageNo: page.pageNo,
        text: el.value,
        x: el.metrics.width ? el.left || 0 : 0,
        y: row.offsetY || 0,
        width: el.metrics.width,
        height: el.metrics.height,
        font: el.font || 'Song',
        size: el.size || 16,
        bold: el.bold,
        italic: el.italic,
        color: el.color,
        underline: !!el.underline,
        strikeout: !!el.strikeout,
        highlight: el.highlight
      }))
    ),
    vectorLines: [],
    rasterBlocks: []
  }))
}
```

- [ ] **Step 3: Wire the snapshot builder into the plugin**

Update `src/plugins/jspdf/index.ts` so the command can
obtain and validate the snapshot before rendering.

```ts
import { buildPdfPageModels } from './buildSnapshot'

const snapshot = command.getPdfExportSnapshot()
const pageModels = buildPdfPageModels(snapshot)
if (!pageModels.length) {
  throw new Error('PDF export failed: no page models were generated')
}
```

- [ ] **Step 4: Run type check**

Run: `npm run type:check`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/plugins/jspdf/index.ts src/plugins/jspdf/types.ts src/plugins/jspdf/buildSnapshot.ts
git commit -m "feat: add jspdf export snapshot model"
```

### Task 4: Implement font loading and jsPDF bootstrapping

**Files:**
- Create: `d:/Work/Project/JavaScript/canvas-editor/src/plugins/jspdf/font.ts`
- Create: `d:/Work/Project/JavaScript/canvas-editor/src/plugins/jspdf/assets/song.ts`
- Create: `d:/Work/Project/JavaScript/canvas-editor/src/plugins/jspdf/renderPdf.ts`
- Modify: `d:/Work/Project/JavaScript/canvas-editor/src/plugins/jspdf/index.ts`

- [ ] **Step 1: Add the font resolver module**

Create `src/plugins/jspdf/font.ts` to encapsulate custom font URL loading,
base64 conversion, caching, and Song fallback registration.

```ts
import { jsPDF } from 'jspdf'

const fontCache = new Map<string, string>()

export async function loadFontBase64(url: string): Promise<string> {
  if (fontCache.has(url)) {
    return fontCache.get(url)!
  }
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Failed to load font: ${url}`)
  }
  const buffer = await response.arrayBuffer()
  const base64 = btoa(
    new Uint8Array(buffer).reduce(
      (text, byte) => text + String.fromCharCode(byte),
      ''
    )
  )
  fontCache.set(url, base64)
  return base64
}

export async function registerFont(
  doc: jsPDF,
  family: string,
  url: string,
  filename: string
) {
  const base64 = await loadFontBase64(url)
  doc.addFileToVFS(filename, base64)
  doc.addFont(filename, family, 'normal')
}
```

- [ ] **Step 2: Add a built-in Song fallback asset**

Create `src/plugins/jspdf/assets/song.ts` and store the base64-encoded Song TTF
there so the fallback is explicit and versioned in the repo.

```ts
export const BUILTIN_SONG_TTF_BASE64 =
  'AAEAAAALAIAAAwAwT1MvMpe...'
```

Then import that constant into `src/plugins/jspdf/font.ts` and register it when
custom fonts are missing or fail.

```ts
import { BUILTIN_SONG_TTF_BASE64 } from './assets/song'

export const BUILTIN_SONG_FAMILY = 'Song'

export function registerBuiltinSong(doc: jsPDF) {
  const filename = 'song.ttf'
  doc.addFileToVFS(filename, BUILTIN_SONG_TTF_BASE64)
  doc.addFont(filename, BUILTIN_SONG_FAMILY, 'normal')
}
```

- [ ] **Step 3: Add jsPDF document creation and serialization**

Create `src/plugins/jspdf/renderPdf.ts` with a renderer that creates the PDF
document and returns pure base64.

```ts
import { jsPDF } from 'jspdf'
import type { IPdfPageModel } from './types'
import { BUILTIN_SONG_FAMILY, registerBuiltinSong } from './font'

export async function renderPdfBase64(
  pageModels: IPdfPageModel[]
): Promise<string> {
  const firstPage = pageModels[0]
  const doc = new jsPDF({
    unit: 'px',
    format: [firstPage.width, firstPage.height]
  })

  registerBuiltinSong(doc)
  doc.setFont(BUILTIN_SONG_FAMILY)

  const dataUri = doc.output('datauristring')
  return dataUri.replace(/^data:application\/pdf;filename=generated\.pdf;base64,/, '')
}
```

- [ ] **Step 4: Hook the renderer into the plugin command**

Replace the temporary empty-string return in `src/plugins/jspdf/index.ts`.

```ts
import { renderPdfBase64 } from './renderPdf'

return renderPdfBase64(pageModels)
```

- [ ] **Step 5: Run type check**

Run: `npm run type:check`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/plugins/jspdf/index.ts src/plugins/jspdf/font.ts src/plugins/jspdf/renderPdf.ts
git commit -m "feat: add jspdf font and renderer bootstrap"
```

### Task 5: Render selectable text, links, highlights, and decoration lines

**Files:**
- Modify: `d:/Work/Project/JavaScript/canvas-editor/src/plugins/jspdf/buildSnapshot.ts`
- Modify: `d:/Work/Project/JavaScript/canvas-editor/src/plugins/jspdf/types.ts`
- Modify: `d:/Work/Project/JavaScript/canvas-editor/src/plugins/jspdf/renderPdf.ts`

- [ ] **Step 1: Split decoration and hyperlink data out of the text run**

Refine the PDF model to keep text, highlight rectangles, and decoration lines
explicit.

```ts
export interface IPdfHighlightRect {
  pageNo: number
  x: number
  y: number
  width: number
  height: number
  color: string
}

export interface IPdfLinkRect {
  pageNo: number
  x: number
  y: number
  width: number
  height: number
  url: string
}
```

- [ ] **Step 2: Emit text highlights and decoration lines from the snapshot builder**

Update `buildSnapshot.ts` so supported row elements produce both text runs and
their related vectors.

```ts
const highlightRects = page.rowList.flatMap(row =>
  row.elementList
    .filter(el => !!el.highlight)
    .map(el => ({
      pageNo: page.pageNo,
      x: el.left || 0,
      y: row.offsetY || 0,
      width: el.metrics.width,
      height: row.height,
      color: el.highlight!
    }))
)
```

- [ ] **Step 3: Render actual text with jsPDF text APIs**

Update `renderPdf.ts` to emit supported text content as text rather than
images.

```ts
for (const textRun of pageModel.textRuns) {
  doc.setFont(textRun.font)
  doc.setFontSize(textRun.size)
  doc.setTextColor(textRun.color || '#000000')
  doc.text(textRun.text, textRun.x, textRun.y + textRun.height)
}
```

- [ ] **Step 4: Render highlights, links, underline, and strikeout vectors**

Use jsPDF fill and line APIs for supported decorations.

```ts
for (const rect of pageModel.highlightRects) {
  doc.setFillColor(rect.color)
  doc.rect(rect.x, rect.y, rect.width, rect.height, 'F')
}

for (const line of pageModel.vectorLines) {
  doc.setDrawColor(line.color || '#000000')
  doc.setLineWidth(line.width || 1)
  doc.line(line.x1, line.y1, line.x2, line.y2)
}

for (const link of pageModel.links) {
  doc.link(link.x, link.y, link.width, link.height, {
    url: link.url
  })
}
```

- [ ] **Step 5: Run lint and type check**

Run: `npm run lint`
Expected: PASS

Run: `npm run type:check`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/plugins/jspdf/buildSnapshot.ts src/plugins/jspdf/types.ts src/plugins/jspdf/renderPdf.ts
git commit -m "feat: render jspdf text and decorations"
```

### Task 6: Add table vectors and raster fallbacks for unsupported elements

**Files:**
- Modify: `d:/Work/Project/JavaScript/canvas-editor/src/plugins/jspdf/buildSnapshot.ts`
- Modify: `d:/Work/Project/JavaScript/canvas-editor/src/plugins/jspdf/renderPdf.ts`
- Modify: `d:/Work/Project/JavaScript/canvas-editor/src/plugins/jspdf/index.ts`

- [ ] **Step 1: Detect supported table geometry**

Update the snapshot builder to emit vector lines for supported table borders
and text runs for table cell text when row/cell geometry is available.

```ts
function appendTableVectors(pageModel: IPdfPageModel, tableRect: {
  pageNo: number
  x: number
  y: number
  width: number
  height: number
}) {
  pageModel.vectorLines.push(
    {
      pageNo: tableRect.pageNo,
      x1: tableRect.x,
      y1: tableRect.y,
      x2: tableRect.x + tableRect.width,
      y2: tableRect.y
    },
    {
      pageNo: tableRect.pageNo,
      x1: tableRect.x,
      y1: tableRect.y + tableRect.height,
      x2: tableRect.x + tableRect.width,
      y2: tableRect.y + tableRect.height
    }
  )
}
```

- [ ] **Step 2: Add a localized raster fallback contract**

When an element type cannot be represented with text or vector output, record a
bounded raster block instead of failing the whole export.

```ts
export interface IRasterizeElementOption {
  pageNo: number
  x: number
  y: number
  width: number
  height: number
}
```

- [ ] **Step 3: Implement raster block rendering**

Render raster blocks only for the unsupported regions.

```ts
for (const raster of pageModel.rasterBlocks) {
  doc.addImage(raster.dataUrl, 'PNG', raster.x, raster.y, raster.width, raster.height)
}
```

- [ ] **Step 4: Add explicit debug errors for missing fallback data**

In `src/plugins/jspdf/index.ts`, make unsupported elements fail clearly in
debug mode and degrade silently otherwise.

```ts
if (finalOption.debug && pageModels.some(page => !page.textRuns.length && !page.rasterBlocks.length)) {
  throw new Error('PDF export debug: a page produced neither text nor raster output')
}
```

- [ ] **Step 5: Run lint and type check**

Run: `npm run lint`
Expected: PASS

Run: `npm run type:check`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/plugins/jspdf/buildSnapshot.ts src/plugins/jspdf/renderPdf.ts src/plugins/jspdf/index.ts
git commit -m "feat: add jspdf table and raster fallbacks"
```

### Task 7: Add a manual verification hook and document plugin usage

**Files:**
- Modify: `d:/Work/Project/JavaScript/canvas-editor/src/main.ts`
- Modify: `d:/Work/Project/JavaScript/canvas-editor/docs/guide/plugin-custom.md`
- Modify: `d:/Work/Project/JavaScript/canvas-editor/docs/guide/command-execute.md`
- Modify: `d:/Work/Project/JavaScript/canvas-editor/docs/en/guide/plugin-custom.md`

- [ ] **Step 1: Install the plugin in the local demo entry**

Use the app entry to create a manual verification path.

```ts
import { jspdfPlugin } from './plugins/jspdf'
import simsunTtfUrl from './assets/fonts/simsun.ttf'

instance.use(jspdfPlugin, {
  fonts: {
    SimSun: simsunTtfUrl
  }
})
```

- [ ] **Step 2: Add a local export trigger for manual testing**

Create a small invocation path that logs the payload size and verifies the
decoded signature starts with `%PDF`.

```ts
const pdfBase64 = await (instance.command as CommandWithJspdf)
  .executeExportPdfBase64()

const pdfHeader = atob(pdfBase64).slice(0, 4)
console.log('pdf header', pdfHeader)
console.log('pdf base64 length', pdfBase64.length)
```

- [ ] **Step 3: Document plugin installation**

Update the custom plugin guide with the new plugin usage example.

```md
import { jspdfPlugin } from '../src/plugins/jspdf'
import simsunTtfUrl from '../src/assets/fonts/simsun.ttf'

instance.use(jspdfPlugin, {
  fonts: {
    SimSun: simsunTtfUrl
  }
})
```

- [ ] **Step 4: Document the new command**

Add an `executeExportPdfBase64` section to `docs/guide/command-execute.md`.

```md
import simsunTtfUrl from './src/assets/fonts/simsun.ttf'

## executeExportPdfBase64

instance.command.executeExportPdfBase64({
  fonts: {
    SimSun: simsunTtfUrl
  }
})
```

- [ ] **Step 5: Run lint and type check**

Run: `npm run lint`
Expected: PASS

Run: `npm run type:check`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/main.ts docs/guide/plugin-custom.md docs/guide/command-execute.md docs/en/guide/plugin-custom.md
git commit -m "docs: add jspdf plugin usage"
```

### Task 8: Final verification and cleanup

**Files:**
- Modify: `d:/Work/Project/JavaScript/canvas-editor/src/plugins/jspdf/index.ts`
- Modify: `d:/Work/Project/JavaScript/canvas-editor/src/plugins/jspdf/buildSnapshot.ts`
- Modify: `d:/Work/Project/JavaScript/canvas-editor/src/plugins/jspdf/renderPdf.ts`

- [ ] **Step 1: Run the complete verification suite**

Run: `npm run lint`
Expected: PASS

Run: `npm run type:check`
Expected: PASS

- [ ] **Step 2: Verify the local PDF export manually**

Run the local demo, trigger the export path, and confirm:

```text
pdf header %PDF
```

Expected:
- The export promise resolves
- The decoded payload starts with `%PDF`
- Supported text is selectable in a PDF viewer
- Borders and lines remain crisp when zoomed

- [ ] **Step 3: Remove temporary debug logging if it was only for manual verification**

Clean the local verification hook down to the smallest useful example.

```ts
if (import.meta.env.DEV) {
  window.__exportPdfBase64 = () =>
    (instance.command as CommandWithJspdf).executeExportPdfBase64()
}
```

- [ ] **Step 4: Commit**

```bash
git add src/plugins/jspdf/index.ts src/plugins/jspdf/buildSnapshot.ts src/plugins/jspdf/renderPdf.ts src/main.ts
git commit -m "feat: finalize jspdf pdf export plugin"
```
