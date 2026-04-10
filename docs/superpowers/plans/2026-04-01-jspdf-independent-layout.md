# jsPDF Independent Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the snapshot-driven jsPDF export with a plugin-owned layout and pagination engine while removing all PDF-specific core interfaces.

**Architecture:** Remove `getPdfExportSnapshot()` and every `IPdfExportSnapshot` dependency from core, then rebuild the `jspdf` plugin around neutral source readers, plugin-owned document and page models, browser-canvas measurement, plugin-owned layout/pagination, localized fallback, and jsPDF rendering. Use `type:check` and app build verification first, then add dev diagnostics hooks, and only introduce Cypress once the export path is stable enough for runtime assertions.

**Tech Stack:** TypeScript, existing editor public APIs, jsPDF, browser canvas/TextMetrics, Vite, Cypress, ESLint, TypeScript compiler

---

### Task 1: Remove Core PDF Interfaces and Add a Neutral Plugin Bootstrap

**Files:**
- Modify: `d:/Work/Project/JavaScript/canvas-editor/src/editor/core/command/Command.ts`
- Modify: `d:/Work/Project/JavaScript/canvas-editor/src/editor/core/command/CommandAdapt.ts`
- Modify: `d:/Work/Project/JavaScript/canvas-editor/src/editor/core/draw/Draw.ts`
- Modify: `d:/Work/Project/JavaScript/canvas-editor/src/editor/index.ts`
- Modify: `d:/Work/Project/JavaScript/canvas-editor/src/editor/interface/Draw.ts`
- Modify: `d:/Work/Project/JavaScript/canvas-editor/src/plugins/jspdf/index.ts`
- Create: `d:/Work/Project/JavaScript/canvas-editor/src/plugins/jspdf/source/readEditorState.ts`
- Create: `d:/Work/Project/JavaScript/canvas-editor/src/plugins/jspdf/model/layout.ts`
- Create: `d:/Work/Project/JavaScript/canvas-editor/src/plugins/jspdf/layout/layoutDocument.ts`
- Delete: `d:/Work/Project/JavaScript/canvas-editor/src/plugins/jspdf/buildSnapshot.ts`

- [ ] **Step 1: Remove the PDF-specific getter from the public command surface**

```ts
// src/editor/core/command/Command.ts
export class Command {
  public getImage: CommandAdapt['getImage']
  public getOptions: CommandAdapt['getOptions']
  public getValue: CommandAdapt['getValue']
  public getValueAsync: CommandAdapt['getValueAsync']
}

// src/editor/core/command/CommandAdapt.ts
export class CommandAdapt {
  public getOptions(): DeepRequired<IEditorOption> {
    return this.options
  }

  public getValue(options?: IGetValueOption): IEditorResult {
    return this.draw.getValue(options)
  }
}
```

- [ ] **Step 2: Remove PDF snapshot types and the draw snapshot method from core**

```ts
// src/editor/interface/Draw.ts
import { ImageDisplay } from '../dataset/enum/Common'
import { EditorMode, EditorZone } from '../dataset/enum/Editor'
import { IElement } from './Element'
import { IRow } from './Row'

// Keep existing draw interfaces only.
// Remove:
// - IPdfExportPageSnapshot
// - IPdfExportStyleSnapshot
// - IPdfExportSnapshot

// src/editor/index.ts
export type {
  IElement,
  IEditorData,
  IEditorOption,
  IEditorResult
}
```

- [ ] **Step 3: Replace the plugin entry with a neutral bootstrap that reads editor state and calls a stub layout**

```ts
// src/plugins/jspdf/source/readEditorState.ts
import type Editor, { IEditorResult } from '../../editor'
import type { DeepRequired } from '../../editor/interface/Common'
import type { IEditorOption } from '../../editor'
import type { IJspdfExportOption } from '../index'

export interface IJspdfSourceState {
  result: IEditorResult
  options: DeepRequired<IEditorOption>
  exportOptions: IJspdfExportOption
}

export function readEditorState(
  editor: Editor,
  exportOptions: IJspdfExportOption
): IJspdfSourceState {
  return {
    result: editor.command.getValue(),
    options: editor.command.getOptions(),
    exportOptions
  }
}

// src/plugins/jspdf/model/layout.ts
export interface IPageModel {
  pageNo: number
  width: number
  height: number
  textRuns: Array<{ text: string; x: number; y: number; font: string; size: number }>
  vectorLines: Array<{ x1: number; y1: number; x2: number; y2: number }>
  rasterBlocks: Array<{ x: number; y: number; width: number; height: number; dataUrl: string }>
  diagnostics: string[]
}

// src/plugins/jspdf/layout/layoutDocument.ts
import type { IJspdfSourceState } from '../source/readEditorState'
import type { IPageModel } from '../model/layout'

export async function layoutDocument(
  source: IJspdfSourceState
): Promise<IPageModel[]> {
  return [
    {
      pageNo: 0,
      width: source.options.width,
      height: source.options.height,
      textRuns: [],
      vectorLines: [],
      rasterBlocks: [],
      diagnostics: ['layout:not-implemented']
    }
  ]
}
```

- [ ] **Step 4: Update the plugin command so it no longer imports or references snapshot types**

```ts
// src/plugins/jspdf/index.ts
import Editor, { Command, EditorMode, PaperDirection } from '../../editor'
import { readEditorState } from './source/readEditorState'
import { layoutDocument } from './layout/layoutDocument'
import { renderPdfBase64 } from './renderPdf'

export type CommandWithJspdf = Command & {
  executeExportPdfBase64(payload?: IJspdfExportOption): Promise<string>
}

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
    const source = readEditorState(editor, finalOption)
    const pageModels = await layoutDocument(source)
    return renderPdfBase64(pageModels, finalOption)
  }
}
```

- [ ] **Step 5: Delete the old snapshot converter**

```bash
git rm src/plugins/jspdf/buildSnapshot.ts
```

- [ ] **Step 6: Run type check to verify only neutral plugin bootstrap references remain**

Run: `npm run type:check`
Expected: PASS

- [ ] **Step 7: Run app build to verify the plugin entry still compiles in the browser bundle**

Run: `npm run build`
Expected: PASS

- [ ] **Step 8: Commit the core interface cleanup and neutral bootstrap**

```bash
git add src/editor/core/command/Command.ts src/editor/core/command/CommandAdapt.ts src/editor/core/draw/Draw.ts src/editor/index.ts src/editor/interface/Draw.ts src/plugins/jspdf/index.ts src/plugins/jspdf/source/readEditorState.ts src/plugins/jspdf/model/layout.ts src/plugins/jspdf/layout/layoutDocument.ts
git commit -m "refactor: remove pdf snapshot core interfaces"
```

### Task 2: Define Complete Plugin Document and Measurement Models

**Files:**
- Create: `d:/Work/Project/JavaScript/canvas-editor/src/plugins/jspdf/model/document.ts`
- Create: `d:/Work/Project/JavaScript/canvas-editor/src/plugins/jspdf/normalize/normalizeDocument.ts`
- Create: `d:/Work/Project/JavaScript/canvas-editor/src/plugins/jspdf/normalize/normalizeTable.ts`
- Create: `d:/Work/Project/JavaScript/canvas-editor/src/plugins/jspdf/normalize/normalizeControl.ts`
- Create: `d:/Work/Project/JavaScript/canvas-editor/src/plugins/jspdf/measure/textMeasure.ts`
- Create: `d:/Work/Project/JavaScript/canvas-editor/src/plugins/jspdf/measure/fontRegistry.ts`
- Create: `d:/Work/Project/JavaScript/canvas-editor/src/plugins/jspdf/measure/objectMeasure.ts`
- Modify: `d:/Work/Project/JavaScript/canvas-editor/src/plugins/jspdf/layout/layoutDocument.ts`

- [ ] **Step 1: Define the document-layer types that later layout tasks depend on**

```ts
// src/plugins/jspdf/model/document.ts
import type { IElement } from '../../editor'

export interface IDocumentInlineNode {
  kind: 'text'
  text: string
  font: string
  size: number
  bold?: boolean
  italic?: boolean
  color?: string
}

export interface IMeasuredInlineNode extends IDocumentInlineNode {
  x: number
  y: number
  width: number
  ascent: number
  descent: number
}

export interface IDocumentBlockNode {
  kind: 'paragraph' | 'table' | 'image' | 'latex' | 'control' | 'block' | 'graffiti'
  element: IElement
  inlineList?: IDocumentInlineNode[]
  width?: number
  height?: number
}

export interface IZoneModel {
  key: 'header' | 'main' | 'footer'
  elementList: IElement[]
  blockList: IDocumentBlockNode[]
  height: number
}

export interface IDocumentModel {
  width: number
  height: number
  margins: number[]
  scale: number
  header: IZoneModel
  main: IZoneModel
  footer: IZoneModel
}
```

- [ ] **Step 2: Normalize editor data into explicit header/main/footer zone models**

```ts
// src/plugins/jspdf/normalize/normalizeDocument.ts
import type { IJspdfSourceState } from '../source/readEditorState'
import type { IDocumentBlockNode, IDocumentModel, IZoneModel } from '../model/document'

function createZone(
  key: 'header' | 'main' | 'footer',
  elementList: IJspdfSourceState['result']['data']['main']
): IZoneModel {
  const blockList: IDocumentBlockNode[] = elementList.map(element => ({
    kind: element.type === 'table' ? 'table' : 'paragraph',
    element
  }))

  return {
    key,
    elementList,
    blockList,
    height: 0
  }
}

export function normalizeDocument(source: IJspdfSourceState): IDocumentModel {
  const data = source.result.data
  return {
    width: source.options.width,
    height: source.options.height,
    margins: [...source.options.margins],
    scale: source.options.scale,
    header: createZone('header', data.header || []),
    main: createZone('main', data.main || []),
    footer: createZone('footer', data.footer || [])
  }
}
```

- [ ] **Step 3: Add browser-canvas text measurement helpers**

```ts
// src/plugins/jspdf/measure/textMeasure.ts
export interface IMeasuredTextMetric {
  width: number
  ascent: number
  descent: number
}

let measureCanvas: HTMLCanvasElement | null = null

export function measureText(
  text: string,
  font: string,
  size: number,
  bold?: boolean,
  italic?: boolean
): IMeasuredTextMetric {
  measureCanvas ||= document.createElement('canvas')
  const ctx = measureCanvas.getContext('2d')
  if (!ctx) {
    throw new Error('Canvas text measurement is unavailable')
  }
  ctx.font = `${italic ? 'italic ' : ''}${bold ? 'bold ' : ''}${size}px ${font}`
  const metric = ctx.measureText(text)
  return {
    width: metric.width,
    ascent: metric.actualBoundingBoxAscent || size * 0.8,
    descent: metric.actualBoundingBoxDescent || size * 0.2
  }
}
```

- [ ] **Step 4: Add table and control normalization helpers referenced by later layout tasks**

```ts
// src/plugins/jspdf/normalize/normalizeTable.ts
import { ElementType } from '../../editor'

export function isTableElement(element: { type?: string }) {
  return element.type === ElementType.TABLE
}

// src/plugins/jspdf/normalize/normalizeControl.ts
import { ElementType } from '../../editor'

export function isControlElement(element: { type?: string }) {
  return (
    element.type === ElementType.CONTROL ||
    element.type === ElementType.CHECKBOX ||
    element.type === ElementType.RADIO
  )
}
```

- [ ] **Step 5: Update the layout stub to accept a normalized document instead of raw source**

```ts
// src/plugins/jspdf/layout/layoutDocument.ts
import type { IDocumentModel } from '../model/document'
import type { IPageModel } from '../model/layout'

export async function layoutDocument(
  documentModel: IDocumentModel
): Promise<IPageModel[]> {
  return [
    {
      pageNo: 0,
      width: documentModel.width,
      height: documentModel.height,
      textRuns: [],
      vectorLines: [],
      rasterBlocks: [],
      diagnostics: ['layout:not-implemented']
    }
  ]
}
```

- [ ] **Step 6: Update the plugin entry to normalize before layout**

```ts
// src/plugins/jspdf/index.ts
import { normalizeDocument } from './normalize/normalizeDocument'

const source = readEditorState(editor, finalOption)
const documentModel = normalizeDocument(source)
const pageModels = await layoutDocument(documentModel)
```

- [ ] **Step 7: Run lint and type check to verify all later layout type dependencies are now defined**

Run: `npm run lint`
Expected: PASS

Run: `npm run type:check`
Expected: PASS

- [ ] **Step 8: Commit the model and normalization foundation**

```bash
git add src/plugins/jspdf/model/document.ts src/plugins/jspdf/normalize/normalizeDocument.ts src/plugins/jspdf/normalize/normalizeTable.ts src/plugins/jspdf/normalize/normalizeControl.ts src/plugins/jspdf/measure/textMeasure.ts src/plugins/jspdf/measure/fontRegistry.ts src/plugins/jspdf/measure/objectMeasure.ts src/plugins/jspdf/layout/layoutDocument.ts src/plugins/jspdf/index.ts
git commit -m "feat: add jspdf document and measurement models"
```

### Task 3: Implement Text, Frame, and Pagination Layout Plus Dev Diagnostics Hooks

**Files:**
- Create: `d:/Work/Project/JavaScript/canvas-editor/src/plugins/jspdf/layout/layoutInline.ts`
- Create: `d:/Work/Project/JavaScript/canvas-editor/src/plugins/jspdf/layout/layoutBlock.ts`
- Create: `d:/Work/Project/JavaScript/canvas-editor/src/plugins/jspdf/layout/layoutFrame.ts`
- Create: `d:/Work/Project/JavaScript/canvas-editor/src/plugins/jspdf/layout/paginate.ts`
- Create: `d:/Work/Project/JavaScript/canvas-editor/src/plugins/jspdf/debug/collectDiagnostics.ts`
- Modify: `d:/Work/Project/JavaScript/canvas-editor/src/plugins/jspdf/index.ts`
- Modify: `d:/Work/Project/JavaScript/canvas-editor/src/plugins/jspdf/layout/layoutDocument.ts`
- Modify: `d:/Work/Project/JavaScript/canvas-editor/src/main.ts`

- [ ] **Step 1: Implement inline text layout using the measured text metrics**

```ts
// src/plugins/jspdf/layout/layoutInline.ts
import type { IDocumentInlineNode, IMeasuredInlineNode } from '../model/document'
import { measureText } from '../measure/textMeasure'

export function layoutInline(
  node: IDocumentInlineNode,
  x: number,
  y: number
): IMeasuredInlineNode {
  const metric = measureText(node.text, node.font, node.size, node.bold, node.italic)
  return {
    ...node,
    x,
    y,
    width: metric.width,
    ascent: metric.ascent,
    descent: metric.descent
  }
}
```

- [ ] **Step 2: Implement frame geometry from margins and normalized zone heights**

```ts
// src/plugins/jspdf/layout/layoutFrame.ts
import type { IDocumentModel } from '../model/document'

export interface IFrameLayoutResult {
  headerTop: number
  headerBottom: number
  footerTop: number
  footerBottom: number
  mainTop: number
  mainBottom: number
}

export function layoutFrame(documentModel: IDocumentModel): IFrameLayoutResult {
  const [top, , bottom] = documentModel.margins
  return {
    headerTop: top,
    headerBottom: top + documentModel.header.height,
    footerTop: documentModel.height - bottom - documentModel.footer.height,
    footerBottom: documentModel.height - bottom,
    mainTop: top + documentModel.header.height,
    mainBottom: documentModel.height - bottom - documentModel.footer.height
  }
}
```

- [ ] **Step 3: Add a page paginator that works from available main-flow height**

```ts
// src/plugins/jspdf/layout/paginate.ts
export function paginateHeights(heights: number[], pageHeight: number) {
  const pages: number[][] = [[]]
  let pageNo = 0
  let used = 0

  heights.forEach((height, index) => {
    if (used + height > pageHeight && pages[pageNo].length) {
      pageNo++
      pages.push([])
      used = 0
    }
    pages[pageNo].push(index)
    used += height
  })

  return pages
}
```

- [ ] **Step 4: Add plugin-owned diagnostics collection and a plugin diagnostics command**

```ts
// src/plugins/jspdf/debug/collectDiagnostics.ts
import type { IPageModel } from '../model/layout'

export function collectDiagnostics(pageModels: IPageModel[]) {
  return {
    pageCount: pageModels.length,
    fallbackBlocks: pageModels.flatMap(page => page.rasterBlocks),
    layoutWarnings: pageModels.flatMap(page => page.diagnostics)
  }
}

// src/plugins/jspdf/index.ts
export type CommandWithJspdf = Command & {
  executeExportPdfBase64(payload?: IJspdfExportOption): Promise<string>
  executeExportPdfDiagnostics(payload?: IJspdfExportOption): Promise<ReturnType<typeof collectDiagnostics>>
}
```

- [ ] **Step 5: Expose stable dev hooks for PDF export and diagnostics**

```ts
// src/main.ts
if (import.meta.env.DEV) {
  Reflect.set(window, '__exportPdfBase64', () =>
    (instance.command as CommandWithJspdf).executeExportPdfBase64()
  )
  Reflect.set(window, '__exportPdfDiagnostics', () =>
    (instance.command as CommandWithJspdf).executeExportPdfDiagnostics()
  )
}
```

- [ ] **Step 6: Run type check to verify the plugin can now produce page models and diagnostics without Cypress**

Run: `npm run type:check`
Expected: PASS

- [ ] **Step 7: Run app build to verify the dev hooks and layout modules compile together**

Run: `npm run build`
Expected: PASS

- [ ] **Step 8: Commit the initial layout engine and diagnostics hook**

```bash
git add src/plugins/jspdf/layout/layoutInline.ts src/plugins/jspdf/layout/layoutBlock.ts src/plugins/jspdf/layout/layoutFrame.ts src/plugins/jspdf/layout/paginate.ts src/plugins/jspdf/debug/collectDiagnostics.ts src/plugins/jspdf/index.ts src/plugins/jspdf/layout/layoutDocument.ts src/main.ts
git commit -m "feat: add jspdf layout diagnostics and dev hooks"
```

### Task 4: Implement Table Layout, Localized Fallback, and jsPDF Rendering

**Files:**
- Create: `d:/Work/Project/JavaScript/canvas-editor/src/plugins/jspdf/layout/layoutTable.ts`
- Create: `d:/Work/Project/JavaScript/canvas-editor/src/plugins/jspdf/fallback/rasterizeElement.ts`
- Create: `d:/Work/Project/JavaScript/canvas-editor/src/plugins/jspdf/fallback/resolveFallback.ts`
- Create: `d:/Work/Project/JavaScript/canvas-editor/src/plugins/jspdf/debug/assertNoFallback.ts`
- Create: `d:/Work/Project/JavaScript/canvas-editor/src/plugins/jspdf/render/renderText.ts`
- Create: `d:/Work/Project/JavaScript/canvas-editor/src/plugins/jspdf/render/renderVector.ts`
- Create: `d:/Work/Project/JavaScript/canvas-editor/src/plugins/jspdf/render/renderImage.ts`
- Modify: `d:/Work/Project/JavaScript/canvas-editor/src/plugins/jspdf/renderPdf.ts`
- Modify: `d:/Work/Project/JavaScript/canvas-editor/src/plugins/jspdf/font.ts`
- Modify: `d:/Work/Project/JavaScript/canvas-editor/src/plugins/jspdf/layout/layoutDocument.ts`
- Create: `d:/Work/Project/JavaScript/canvas-editor/cypress/e2e/jspdf/export.cy.ts`

- [ ] **Step 1: Implement table fragments so the document model can paginate tables explicitly**

```ts
// src/plugins/jspdf/layout/layoutTable.ts
import type { IDocumentBlockNode } from '../model/document'

export function layoutTable(block: IDocumentBlockNode) {
  const trList = block.element.trList || []
  return trList.map((tr, rowIndex) => ({
    rowIndex,
    height: tr.height || 24,
    tdList: tr.tdList
  }))
}
```

- [ ] **Step 2: Implement localized raster fallback helpers for complex blocks**

```ts
// src/plugins/jspdf/fallback/rasterizeElement.ts
export async function rasterizeElement(
  draw: (ctx: CanvasRenderingContext2D) => void,
  width: number,
  height: number,
  sourceType: string
) {
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.ceil(width))
  canvas.height = Math.max(1, Math.ceil(height))
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    throw new Error(`Fallback rasterization failed for ${sourceType}`)
  }
  draw(ctx)
  return {
    x: 0,
    y: 0,
    width,
    height,
    dataUrl: canvas.toDataURL('image/png'),
    sourceType
  }
}

// src/plugins/jspdf/fallback/resolveFallback.ts
import type { IPageModel } from '../model/layout'

export function resolveFallback(page: IPageModel, fallback: IPageModel['rasterBlocks'][number]) {
  page.rasterBlocks.push(fallback)
  page.diagnostics.push(`fallback:${fallback.sourceType || 'unknown'}`)
}
```

- [ ] **Step 3: Split rendering by text, vector, and image responsibilities**

```ts
// src/plugins/jspdf/render/renderText.ts
import type jsPDF from 'jspdf'
import type { IPageModel } from '../model/layout'
import { resolvePdfFontFamily } from '../font'

export function renderTextRuns(doc: jsPDF, page: IPageModel, defaultFontFamily: string) {
  page.textRuns.forEach(run => {
    doc.setFont(resolvePdfFontFamily(doc, run.font, defaultFontFamily), 'normal')
    doc.setFontSize(run.size)
    doc.setTextColor(run.color || '#000000')
    doc.text(run.text, run.x, run.y)
  })
}
```

- [ ] **Step 4: Update the jsPDF renderer to consume only plugin-owned page models**

```ts
// src/plugins/jspdf/renderPdf.ts
import jsPDF from 'jspdf'
import { bootstrapPdfFonts } from './font'
import { renderTextRuns } from './render/renderText'

export async function renderPdfBase64(pageModels: IPageModel[], options: IRenderPdfOption = {}) {
  const first = pageModels[0]
  const doc = new jsPDF({
    orientation: first.width >= first.height ? 'landscape' : 'portrait',
    unit: 'pt',
    format: [first.width, first.height]
  })
  const { defaultFontFamily } = await bootstrapPdfFonts(doc, options)
  pageModels.forEach((page, index) => {
    if (index) doc.addPage([page.width, page.height], page.width >= page.height ? 'landscape' : 'portrait')
    renderTextRuns(doc, page, defaultFontFamily)
  })
  return doc.output('datauristring').replace(/^data:application\/pdf;filename=generated\.pdf;base64,/, '')
}
```

- [ ] **Step 5: Add stable Cypress assertions that do not depend on PDF binary containing plain text**

```ts
// cypress/e2e/jspdf/export.cy.ts
describe('jspdf export', () => {
  beforeEach(() => {
    cy.visit('http://localhost:8100/canvas-editor/')
  })

  it('does not expose getPdfExportSnapshot on command', () => {
    cy.window().then(win => {
      const editor = (win as any).editor
      expect(editor.command.getPdfExportSnapshot).to.equal(undefined)
    })
  })

  it('exposes export and diagnostics hooks', () => {
    cy.window().then(win => {
      expect((win as any).__exportPdfBase64).to.be.a('function')
      expect((win as any).__exportPdfDiagnostics).to.be.a('function')
    })
  })

  it('returns a diagnostics object with page count and warnings', () => {
    cy.window().then(async win => {
      const diagnostics = await (win as any).__exportPdfDiagnostics()
      expect(diagnostics.pageCount).to.be.greaterThan(0)
      expect(diagnostics.layoutWarnings).to.be.an('array')
    })
  })

  it('returns a PDF base64 string with a valid header', () => {
    cy.window().then(async win => {
      const pdfBase64 = await (win as any).__exportPdfBase64()
      const header = win.atob(pdfBase64).slice(0, 4)
      expect(header).to.equal('%PDF')
    })
  })
})
```

- [ ] **Step 6: Run lint, type check, and the new export Cypress spec**

Run: `npm run lint`
Expected: PASS

Run: `npm run type:check`
Expected: PASS

Run: `npx cypress run --spec cypress/e2e/jspdf/export.cy.ts`
Expected: PASS

- [ ] **Step 7: Commit the renderer, fallback, and export runtime verification**

```bash
git add src/plugins/jspdf/layout/layoutTable.ts src/plugins/jspdf/fallback/rasterizeElement.ts src/plugins/jspdf/fallback/resolveFallback.ts src/plugins/jspdf/debug/assertNoFallback.ts src/plugins/jspdf/render/renderText.ts src/plugins/jspdf/render/renderVector.ts src/plugins/jspdf/render/renderImage.ts src/plugins/jspdf/renderPdf.ts src/plugins/jspdf/font.ts src/plugins/jspdf/layout/layoutDocument.ts cypress/e2e/jspdf/export.cy.ts
git commit -m "feat: implement jspdf layout renderer and fallback"
```

### Task 5: Update Docs and Run Final Verification

**Files:**
- Modify: `d:/Work/Project/JavaScript/canvas-editor/src/main.ts`
- Modify: `d:/Work/Project/JavaScript/canvas-editor/docs/guide/command-execute.md`
- Modify: `d:/Work/Project/JavaScript/canvas-editor/docs/guide/plugin-custom.md`
- Modify: `d:/Work/Project/JavaScript/canvas-editor/docs/en/guide/plugin-custom.md`
- Modify: `d:/Work/Project/JavaScript/canvas-editor/cypress/e2e/jspdf/export.cy.ts`

- [ ] **Step 1: Update docs so they describe the plugin-owned layout engine instead of a core snapshot**

````md
## executeExportPdfBase64

功能：基于 `jspdf` 插件内独立排版引擎导出 PDF Base64

```javascript
import simsunTtfUrl from '../../src/assets/fonts/simsun.ttf'

instance.use(jspdfPlugin, {
  fonts: {
    SimSun: simsunTtfUrl
  }
})

const pdfBase64 = await (instance.command as CommandWithJspdf)
  .executeExportPdfBase64()
```
````

- [ ] **Step 2: Update the Cypress export spec with a diagnostics strict-mode case**

```ts
it('returns diagnostics in debug mode without touching core pdf snapshot APIs', () => {
  cy.window().then(async win => {
    const editor = (win as any).editor
    expect(editor.command.getPdfExportSnapshot).to.equal(undefined)
    const diagnostics = await (editor.command as any).executeExportPdfDiagnostics({
      debug: true
    })
    expect(diagnostics).to.have.property('pageCount')
  })
})
```

- [ ] **Step 3: Run the full verification set**

Run: `npm run lint`
Expected: PASS

Run: `npm run type:check`
Expected: PASS

Run: `npm run build`
Expected: PASS

Run: `npx cypress run --spec cypress/e2e/jspdf/export.cy.ts`
Expected: PASS

Run: `npx cypress run --spec cypress/e2e/menus/table.cy.ts`
Expected: PASS

Run: `npx cypress run --spec cypress/e2e/menus/watermark.cy.ts`
Expected: PASS

- [ ] **Step 4: Commit the docs and final verification updates**

```bash
git add src/main.ts docs/guide/command-execute.md docs/guide/plugin-custom.md docs/en/guide/plugin-custom.md cypress/e2e/jspdf/export.cy.ts
git commit -m "docs: update jspdf plugin export workflow"
```
