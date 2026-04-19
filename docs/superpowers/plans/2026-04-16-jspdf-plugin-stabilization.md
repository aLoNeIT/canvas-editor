# jsPDF Plugin Stabilization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stabilize the current `src/plugins/jspdf` implementation so normal PDF export is a plugin-owned layout/render path with no raster fallback, and every unsupported or failed render region is replaced by a visible red `渲染[XXX]失败` placeholder.

**Architecture:** Keep the dual-engine architecture: canvas editor core owns interactive rendering, and the `jspdf` plugin owns export normalization, measurement, pagination, diagnostics, and jsPDF rendering. Remove mandatory core print capture from the normal command path, delete plugin fallback behavior as a rendering strategy, and replace unresolved content with explicit red failure text blocks that preserve layout boxes and make breakpoints obvious in real exports.

**Tech Stack:** TypeScript, existing editor public command APIs, browser canvas `TextMetrics`, jsPDF 2.5.1, Vite, Cypress, existing `scripts/jspdf-layout-runtime-test.ts`.

---

## Current Assessment

The current branch is directionally reasonable because it has moved beyond the old `feature/pdf` single `Pdf` class and now has plugin-owned `source`, `normalize`, `model`, `measure`, `layout`, `fallback`, `render`, and `debug` layers.

The implementation is not yet architecturally clean because `executeExportPdfBase64` and diagnostics always call `editor.command.getImage()` before the plugin layout runs. That captures core print page screenshots even when text fallback is disabled, then stores them on `DocumentModel.printPageDataUrlList`. This contradicts the independent-layout direction and adds a costly side effect to every export.

The current local fallback strategy is also wrong for the new requirement. The plugin must not silently rasterize trouble spots. If rendering fails or an element family is still unsupported, the PDF should show a red failure marker such as `渲染[latex]失败` or `渲染[block-iframe]失败`, with diagnostics recording the same failure source.

The largest maintainability risk is `src/plugins/jspdf/layout/layoutDocument.ts`, which has become a 3000+ line module containing frame layout, text fallback, placement collection, placement rendering, page assembly, diagnostics helpers, table rendering calls, image handling, badges, and graffiti. It should be split without changing behavior first, then improved.

## File Structure Target

- Modify: `src/plugins/jspdf/index.ts`
- Modify: `src/plugins/jspdf/source/readEditorState.ts`
- Modify: `src/plugins/jspdf/model/document.ts`
- Modify: `src/plugins/jspdf/types.ts`
- Modify: `src/plugins/jspdf/debug/collectDiagnostics.ts`
- Modify: `src/plugins/jspdf/debug/assertNoFallback.ts`
- Modify: `src/plugins/jspdf/layout/layoutDocument.ts`
- Create: `src/plugins/jspdf/layout/renderFailurePlaceholder.ts`
- Create: `src/plugins/jspdf/layout/frameDecorations.ts`
- Create: `src/plugins/jspdf/layout/mainPlacement.ts`
- Create: `src/plugins/jspdf/layout/placementRenderer.ts`
- Create: `src/plugins/jspdf/debug/validatePageModel.ts`
- Modify: `scripts/jspdf-layout-runtime-test.ts`
- Add Cypress specs only after the command path is stable.

---

### Task 1: Remove Mandatory Core Print Capture

**Files:**
- Modify: `src/plugins/jspdf/index.ts`
- Modify: `src/plugins/jspdf/source/readEditorState.ts`
- Modify: `src/plugins/jspdf/model/document.ts`
- Modify: `src/plugins/jspdf/normalize/normalizeDocument.ts`
- Test: `scripts/jspdf-layout-runtime-test.ts`

- [ ] **Step 1: Add a failing runtime test proving normal export does not call `getImage`**

Add a focused test near the existing plugin command tests in `scripts/jspdf-layout-runtime-test.ts`:

```ts
async function testJspdfPluginDoesNotCapturePrintImagesByDefault() {
  const harness = createJspdfPluginHarness({
    pageModels: [{
      pageNo: 0,
      width: 794,
      height: 1123,
      textRuns: [{
        pageNo: 0,
        text: 'hello',
        x: 10,
        y: 20,
        width: 30,
        height: 12,
        font: 'SimSun',
        size: 12,
        color: '#000000'
      }],
      highlightRects: [],
      links: [],
      vectorLines: [],
      rasterBlocks: [],
      issues: []
    }],
    renderPdfResult: 'QUJDRA=='
  })

  let getImageCalled = false
  harness.editor.command.getImage = async () => {
    getImageCalled = true
    throw new Error('getImage must not be called by default')
  }

  harness.jspdfPlugin(harness.editor as any)
  const result = await (harness.editor.command as any).executeExportPdfBase64()

  assert.strictEqual(result, 'QUJDRA==')
  assert.strictEqual(getImageCalled, false)
}
```

Register the test in the script `main()` near the other jsPDF plugin tests:

```ts
await testJspdfPluginDoesNotCapturePrintImagesByDefault()
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `npx tsx scripts/jspdf-layout-runtime-test.ts`

Expected: FAIL with `getImage must not be called by default`.

- [ ] **Step 3: Remove public fallback-related export options**

In `src/plugins/jspdf/index.ts`, simplify the plugin options:

```ts
export interface IJspdfPluginOption {
  fonts?: Record<string, string>
  defaultFontFamily?: string
  debug?: boolean
}

export interface IJspdfExportOption extends IJspdfPluginOption {
  mode?: EditorMode
  paperDirection?: PaperDirection
}
```

Delete any public `disableTextRasterFallback`, `textRasterFallback`, or `__printPageDataUrlList` properties from the export option surface.

- [ ] **Step 4: Stop fetching print images in command entrypoints**

In `src/plugins/jspdf/index.ts`, replace both command implementations with the direct flow:

```ts
command.executeExportPdfDiagnostics = async payload => {
  const finalOption: IJspdfExportOption = {
    ...options,
    ...payload,
    mode: payload?.mode || EditorMode.PRINT
  }
  const source = readEditorState(editor, finalOption)
  const documentModel = normalizeDocument(source)
  const pageModels = await layoutDocument(documentModel)
  return collectDiagnostics(pageModels)
}

command.executeExportPdfBase64 = async payload => {
  const finalOption: IJspdfExportOption = {
    ...options,
    ...payload,
    mode: payload?.mode || EditorMode.PRINT
  }
  if (finalOption.mode !== EditorMode.PRINT) {
    throw new Error('PDF export currently requires print mode layout')
  }

  const source = readEditorState(editor, finalOption)
  const documentModel = normalizeDocument(source)
  const pageModels = await layoutDocument(documentModel)
  const diagnostics = collectDiagnostics(pageModels)
  validatePageModels(pageModels)

  if (finalOption.debug && diagnostics.unsupportedElements.length) {
    throw new Error(
      `PDF export debug: unsupported elements: ${
        diagnostics.unsupportedElements.join('; ')
      }`
    )
  }

  return renderPdfBase64(pageModels, finalOption)
}
```

- [ ] **Step 5: Simplify `readEditorState`**

In `src/plugins/jspdf/source/readEditorState.ts`, remove the print-page-image reader from the export path and reduce the source model to neutral editor state:

```ts
export interface IJspdfSourceState {
  result: IEditorResult
  options: DeepRequired<IEditorOption>
  exportOptions: IJspdfExportOption
  badge: IJspdfBadgeStateSnapshot
}

export function readEditorState(
  editor: Editor,
  exportOptions: IJspdfExportOption
): IJspdfSourceState {
  const result = editor.command.getValue()
  const mode = exportOptions.mode || EditorMode.PRINT

  return {
    result:
      mode === EditorMode.PRINT
        ? normalizePrintModeResult(result)
        : result,
    options: editor.command.getOptions(),
    exportOptions,
    badge: getBadgeStateSnapshot(editor)
  }
}
```

Delete or stop using `readEditorPrintPageDataUrlList()`.

- [ ] **Step 6: Remove print image storage from the document model**

In `src/plugins/jspdf/model/document.ts`, remove:

```ts
printPageDataUrlList?: string[]
```

In `src/plugins/jspdf/normalize/normalizeDocument.ts`, remove:

```ts
printPageDataUrlList: source.printPageDataUrlList,
```

- [ ] **Step 7: Run the runtime test again**

Run: `npx tsx scripts/jspdf-layout-runtime-test.ts`

Expected: PASS for `testJspdfPluginDoesNotCapturePrintImagesByDefault`.

- [ ] **Step 8: Commit**

```bash
git add src/plugins/jspdf/index.ts src/plugins/jspdf/source/readEditorState.ts src/plugins/jspdf/model/document.ts src/plugins/jspdf/normalize/normalizeDocument.ts scripts/jspdf-layout-runtime-test.ts
git commit -m "fix: remove jspdf print capture dependency"
```

---

### Task 2: Replace Fallback With Explicit Failure Placeholders

**Files:**
- Create: `src/plugins/jspdf/layout/renderFailurePlaceholder.ts`
- Modify: `src/plugins/jspdf/layout/layoutDocument.ts`
- Modify: `src/plugins/jspdf/types.ts`
- Modify: `src/plugins/jspdf/debug/collectDiagnostics.ts`
- Modify: `src/plugins/jspdf/debug/assertNoFallback.ts`
- Test: `scripts/jspdf-layout-runtime-test.ts`

- [ ] **Step 1: Add a failing runtime test for unresolved content placeholders**

Add this test to `scripts/jspdf-layout-runtime-test.ts`:

```ts
async function testUnsupportedBlockUsesRedFailurePlaceholder() {
  const page = {
    pageNo: 0,
    width: 794,
    height: 1123,
    textRuns: [],
    highlightRects: [],
    links: [],
    vectorLines: [],
    rasterBlocks: [],
    issues: []
  }

  const block = {
    kind: 'block',
    element: {
      type: 'block',
      block: {
        type: 'iframe'
      }
    }
  }

  const { appendFailurePlaceholder } = await import(
    '../src/plugins/jspdf/layout/renderFailurePlaceholder.js'
  )

  appendFailurePlaceholder(page as any, {
    sourceType: 'block-iframe',
    x: 24,
    y: 48,
    width: 120,
    height: 40
  })

  assert.strictEqual(page.textRuns.length, 1)
  assert.strictEqual(page.textRuns[0].text, '渲染[block-iframe]失败')
  assert.strictEqual(page.textRuns[0].color, '#ff0000')
  assert.ok(page.issues.includes('unsupported:block-iframe'))
}
```

Register the test in `main()`:

```ts
await testUnsupportedBlockUsesRedFailurePlaceholder()
```

- [ ] **Step 2: Run the test and confirm it fails**

Run: `npx tsx scripts/jspdf-layout-runtime-test.ts`

Expected: FAIL because the helper does not exist yet.

- [ ] **Step 3: Create a shared failure placeholder helper**

Create `src/plugins/jspdf/layout/renderFailurePlaceholder.ts`:

```ts
import type { IPageModel } from '../model/layout'
import { PDF_RENDER_STAGE } from '../render/renderStage'

export interface IFailurePlaceholderOption {
  sourceType: string
  x: number
  y: number
  width: number
  height: number
  stage?: number
}

function createFailureText(sourceType: string) {
  return `渲染[${sourceType}]失败`
}

export function appendFailurePlaceholder(
  page: IPageModel,
  option: IFailurePlaceholderOption
) {
  const text = createFailureText(option.sourceType)
  const stage = option.stage ?? PDF_RENDER_STAGE.CONTENT
  const boxHeight = Math.max(14, option.height)
  const fontSize = Math.max(12, Math.min(16, Math.floor(boxHeight * 0.5)))
  const baselineY = option.y + Math.min(boxHeight - 4, fontSize + 2)

  page.textRuns.push({
    pageNo: page.pageNo,
    stage,
    text,
    x: option.x,
    y: baselineY,
    width: Math.max(option.width, text.length * fontSize),
    height: fontSize,
    font: 'SimSun',
    size: fontSize,
    color: '#ff0000'
  })

  page.issues.push(`unsupported:${option.sourceType}`)
}
```

- [ ] **Step 4: Remove fallback semantics from diagnostics**

In `src/plugins/jspdf/debug/assertNoFallback.ts`, replace the implementation with a no-op guard that only checks raster image blocks remain image-only:

```ts
import type { IPageModel } from '../model/layout'

export function assertNoFallback(pageModels: IPageModel[]) {
  const unexpectedRaster = pageModels.flatMap(page =>
    page.rasterBlocks.filter(block => block.sourceType !== 'image')
  )

  if (!unexpectedRaster.length) return

  throw new Error('PDF export fallback detected: non-image raster block found')
}
```

This keeps images legal while forbidding new non-image raster fallback regressions.

- [ ] **Step 5: Change diagnostics from fallback-centered to unsupported-centered**

In `src/plugins/jspdf/debug/collectDiagnostics.ts`, use:

```ts
import type { IPageModel } from '../model/layout'

export interface IJspdfDiagnostics {
  pageCount: number
  rasterImageBlocks: IPageModel['rasterBlocks']
  layoutWarnings: string[]
  unsupportedElements: string[]
  emptyPages: number[]
}

export function collectDiagnostics(pageModels: IPageModel[]): IJspdfDiagnostics {
  return {
    pageCount: pageModels.length,
    rasterImageBlocks: pageModels.flatMap(page => page.rasterBlocks),
    layoutWarnings: pageModels.flatMap(page => page.issues),
    unsupportedElements: pageModels.flatMap(page =>
      page.issues.filter(issue => issue.startsWith('unsupported:'))
    ),
    emptyPages: pageModels
      .filter(page =>
        !page.textRuns.length &&
        !page.highlightRects.length &&
        !page.vectorLines.length &&
        !page.rasterBlocks.length
      )
      .map(page => page.pageNo)
  }
}
```

- [ ] **Step 6: Replace raster fallback calls in layout**

In `src/plugins/jspdf/layout/layoutDocument.ts`, remove text raster fallback branches and replace every unresolved path with `appendFailurePlaceholder(...)`.

For the old text fallback branches at the previous `appendPlacementTextRasterFallback` call sites, replace the body with:

```ts
appendFailurePlaceholder(page, {
  sourceType: 'text-line',
  x: bounds.x,
  y: bounds.y,
  width: bounds.width,
  height: bounds.height,
  stage
})
return true
```

For unresolved block and unsupported content in `appendImageOrFallback`, replace the previous raster placeholder logic with:

```ts
const unsupportedType =
  block.kind === 'latex'
    ? 'latex'
    : block.kind === 'block' && block.element.block?.type === BlockType.IFRAME
      ? 'block-iframe'
      : block.kind === 'block' && block.element.block?.type === BlockType.VIDEO
        ? 'block-video'
        : block.kind

appendFailurePlaceholder(page, {
  sourceType: unsupportedType,
  x,
  y,
  width,
  height,
  stage
})
return
```

- [ ] **Step 7: Restrict raster blocks to true image content**

In `src/plugins/jspdf/layout/layoutDocument.ts`, keep `page.rasterBlocks.push(...)` only for:

```ts
if (block.kind === 'image' && isImageSource) {
  page.rasterBlocks.push({
    pageNo: page.pageNo,
    stage,
    x,
    y,
    width: block.element.width || width,
    height: block.element.height || height,
    dataUrl: value,
    crop: block.element.imgCrop,
    sourceType: 'image',
    layer: 'content'
  })
  return
}
```

Everything else unresolved must become a text placeholder, not a raster block.

- [ ] **Step 8: Run tests**

Run: `npx tsx scripts/jspdf-layout-runtime-test.ts`

Expected: PASS.

Run: `npm run type:check`

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/plugins/jspdf/layout/renderFailurePlaceholder.ts src/plugins/jspdf/layout/layoutDocument.ts src/plugins/jspdf/debug/collectDiagnostics.ts src/plugins/jspdf/debug/assertNoFallback.ts scripts/jspdf-layout-runtime-test.ts
git commit -m "feat: replace jspdf fallback with failure placeholders"
```

---

### Task 3: Split the Layout Orchestrator Without Changing Behavior

**Files:**
- Create: `src/plugins/jspdf/layout/frameDecorations.ts`
- Create: `src/plugins/jspdf/layout/mainPlacement.ts`
- Create: `src/plugins/jspdf/layout/placementRenderer.ts`
- Modify: `src/plugins/jspdf/layout/layoutDocument.ts`
- Test: `scripts/jspdf-layout-runtime-test.ts`

- [ ] **Step 1: Move frame decoration code**

Create `src/plugins/jspdf/layout/frameDecorations.ts` and move these functions from `layoutDocument.ts`:

```ts
export async function appendFrameDecorations(
  page: IPageModel,
  documentModel: IDocumentModel,
  pageCount: number,
  frame: IFrameLayoutResult,
  backgroundImageSize: Awaited<ReturnType<typeof resolveImageSize>> | null
) {
  // Move existing body unchanged, except unresolved frame assets now use
  // appendFailurePlaceholder instead of raster fallback.
}
```

- [ ] **Step 2: Move main placement collection**

Create `src/plugins/jspdf/layout/mainPlacement.ts` and move placement interfaces plus:

```ts
export type IMainPlacement =
  | ITableRowPlacement
  | IBlockPlacement
  | ITextLinePlacement

export function collectMainPlacements(
  blockList: IDocumentBlockNode[],
  width: number,
  pageHeight: number,
  documentModel: IDocumentModel
): IMainPlacement[] {
  // Move existing body unchanged.
}

export function paginateMainPlacements(
  placements: IMainPlacement[],
  frame: IFrameLayoutResult,
  documentModel: IDocumentModel,
  contentWidth: number
): number[][] {
  // Move existing body unchanged.
}
```

- [ ] **Step 3: Move placement rendering**

Create `src/plugins/jspdf/layout/placementRenderer.ts` and move:

```ts
export interface IAppendPlacementResult {
  renderX: number
  renderY: number
  consumedHeight: number
}

export async function appendPlacement(
  page: IPageModel,
  placement: IMainPlacement,
  x: number,
  y: number,
  width: number,
  documentModel: IDocumentModel,
  imageNumberMap: Map<IDocumentBlockNode, number>
): Promise<IAppendPlacementResult> {
  // Move existing body unchanged except unresolved content uses
  // appendFailurePlaceholder.
}
```

- [ ] **Step 4: Leave `layoutDocument.ts` as an orchestrator**

After the split, `layoutDocument.ts` should primarily contain:

```ts
export async function layoutDocument(
  documentModel: IDocumentModel
): Promise<IPageModel[]> {
  const resolved = resolveDocumentZoneHeights(documentModel)
  const contentWidth = resolved.contentWidth
  const resolvedDocumentModel = resolved.documentModel
  const frame = layoutFrame(resolvedDocumentModel)
  const mainPageHeight = Math.max(1, frame.mainBottom - frame.mainTop)
  const placements = collectMainPlacements(
    resolvedDocumentModel.main.blockList,
    contentWidth,
    mainPageHeight,
    resolvedDocumentModel
  )
  const placementIndexes = paginateMainPlacements(
    placements,
    frame,
    resolvedDocumentModel,
    contentWidth
  )

  // Existing page loop remains here and calls imported helpers.
}
```

- [ ] **Step 5: Run tests**

Run: `npx tsx scripts/jspdf-layout-runtime-test.ts`

Expected: PASS.

Run: `npm run type:check`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/plugins/jspdf/layout/layoutDocument.ts src/plugins/jspdf/layout/frameDecorations.ts src/plugins/jspdf/layout/mainPlacement.ts src/plugins/jspdf/layout/placementRenderer.ts scripts/jspdf-layout-runtime-test.ts
git commit -m "refactor: split jspdf layout orchestration"
```

---

### Task 4: Strengthen Diagnostics and Debug Strictness

**Files:**
- Modify: `src/plugins/jspdf/debug/collectDiagnostics.ts`
- Create: `src/plugins/jspdf/debug/validatePageModel.ts`
- Modify: `src/plugins/jspdf/index.ts`
- Test: `scripts/jspdf-layout-runtime-test.ts`

- [ ] **Step 1: Add page model validation**

Create `src/plugins/jspdf/debug/validatePageModel.ts`:

```ts
import type { IPageModel } from '../model/layout'

export function validatePageModels(pageModels: IPageModel[]) {
  if (!pageModels.length) {
    throw new Error('PDF export failed: no page models were generated')
  }

  pageModels.forEach(page => {
    if (page.width <= 0 || page.height <= 0) {
      throw new Error(
        `PDF export failed: page ${page.pageNo + 1} has invalid geometry`
      )
    }
  })
}
```

- [ ] **Step 2: Make debug mode fail on unsupported placeholders**

In `src/plugins/jspdf/index.ts`, after collecting diagnostics, use:

```ts
if (finalOption.debug) {
  assertNoFallback(pageModels)
  if (diagnostics.unsupportedElements.length) {
    throw new Error(
      `PDF export debug: unsupported elements: ${
        diagnostics.unsupportedElements.join('; ')
      }`
    )
  }
  if (diagnostics.layoutWarnings.length) {
    throw new Error(
      `PDF export debug: ${diagnostics.layoutWarnings.join('; ')}`
    )
  }
  if (diagnostics.emptyPages.length) {
    throw new Error(
      `PDF export debug: empty page ${
        diagnostics.emptyPages.map(pageNo => pageNo + 1).join(', ')
      }`
    )
  }
}
```

- [ ] **Step 3: Add runtime tests**

Add this test to `scripts/jspdf-layout-runtime-test.ts`:

```ts
function testCollectDiagnosticsReportsUnsupportedElements() {
  const diagnostics = collectDiagnostics([{
    pageNo: 0,
    width: 100,
    height: 100,
    textRuns: [],
    highlightRects: [],
    links: [],
    vectorLines: [],
    rasterBlocks: [],
    issues: ['unsupported:block-iframe']
  }])

  assert.deepStrictEqual(diagnostics.unsupportedElements, [
    'unsupported:block-iframe'
  ])
}
```

Register in `main()`:

```ts
testCollectDiagnosticsReportsUnsupportedElements()
```

- [ ] **Step 4: Run tests**

Run: `npx tsx scripts/jspdf-layout-runtime-test.ts`

Expected: PASS.

Run: `npm run type:check`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/plugins/jspdf/debug src/plugins/jspdf/index.ts scripts/jspdf-layout-runtime-test.ts
git commit -m "feat: tighten jspdf unsupported diagnostics"
```

---

### Task 5: Clean Demo Debug Coupling

**Files:**
- Modify: `src/main.ts`
- Create: `src/plugins/jspdf/debug/devHooks.ts`
- Test: `npm run type:check`

- [ ] **Step 1: Extract dev-only hooks**

Create `src/plugins/jspdf/debug/devHooks.ts`:

```ts
import Editor, { EditorMode } from '../../../editor'
import type { CommandWithJspdf, IJspdfExportOption } from '../index'
import { layoutDocument } from '../layout/layoutDocument'
import { layoutFrame } from '../layout/layoutFrame'
import { normalizeDocument } from '../normalize/normalizeDocument'
import { renderPdfBase64 } from '../renderPdf'
import { readEditorState } from '../source/readEditorState'

export function installJspdfDevHooks(
  target: Window,
  editor: Editor,
  defaultPdfExportOption: IJspdfExportOption
) {
  const exportPdfBase64 = async () =>
    (editor.command as CommandWithJspdf).executeExportPdfBase64(
      defaultPdfExportOption
    )

  Reflect.set(target, '__exportPdfBase64', exportPdfBase64)
  Reflect.set(target, '__exportPdfDiagnostics', () =>
    (editor.command as CommandWithJspdf).executeExportPdfDiagnostics(
      defaultPdfExportOption
    )
  )
  Reflect.set(target, '__debugPdfLayout', async () => {
    const source = readEditorState(editor, {
      mode: EditorMode.PRINT,
      ...defaultPdfExportOption
    })
    const documentModel = normalizeDocument(source)
    const pageModels = await layoutDocument(documentModel)
    return {
      frame: layoutFrame(documentModel),
      pageModels
    }
  })
  Reflect.set(target, '__renderPdfFromPageModels', (pageModels: any[]) =>
    renderPdfBase64(pageModels, defaultPdfExportOption)
  )
}
```

- [ ] **Step 2: Replace inline hook setup in `src/main.ts`**

In `src/main.ts`, import:

```ts
import { installJspdfDevHooks } from './plugins/jspdf/debug/devHooks'
```

Replace the large `if (import.meta.env.DEV)` hook block with:

```ts
if (import.meta.env.DEV) {
  Reflect.set(window, '__editorInstance', instance)
  installJspdfDevHooks(window, instance, defaultPdfExportOption)
}
```

- [ ] **Step 3: Run type check**

Run: `npm run type:check`

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/main.ts src/plugins/jspdf/debug/devHooks.ts
git commit -m "refactor: move jspdf dev hooks out of demo entry"
```

---

### Task 6: Add Acceptance-Level Verification

**Files:**
- Create: `cypress/e2e/jspdf/export-command.cy.ts`
- Create: `cypress/e2e/jspdf/unsupported-placeholder.cy.ts`
- Modify: `scripts/jspdf-layout-runtime-test.ts`

- [ ] **Step 1: Add command smoke spec**

Create `cypress/e2e/jspdf/export-command.cy.ts`:

```ts
describe('jspdf export command', () => {
  it('exports a pure base64 PDF without data URI prefix', () => {
    cy.visit('/')
    cy.window().then(async win => {
      const base64 = await (win as any).__exportPdfBase64()
      expect(base64.startsWith('data:')).to.equal(false)
      expect(atob(base64).slice(0, 4)).to.equal('%PDF')
    })
  })

  it('does not expose the legacy PDF snapshot command', () => {
    cy.visit('/')
    cy.window().then(win => {
      const editor = (win as any).editor
      expect(editor.command.getPdfExportSnapshot).to.equal(undefined)
    })
  })
})
```

- [ ] **Step 2: Add unsupported placeholder diagnostics spec**

Create `cypress/e2e/jspdf/unsupported-placeholder.cy.ts`:

```ts
describe('jspdf unsupported placeholder', () => {
  it('reports unsupported elements instead of creating hidden fallback blocks', () => {
    cy.visit('/')
    cy.window().then(async win => {
      const diagnostics = await (win as any).__exportPdfDiagnostics()
      const nonImageRaster = diagnostics.rasterImageBlocks.filter(
        (block: any) => block.sourceType !== 'image'
      )
      expect(nonImageRaster).to.have.length(0)
    })
  })
})
```

- [ ] **Step 3: Run Cypress specs**

Run: `npm run cypress:run -- --browser chrome --headless --spec cypress/e2e/jspdf/export-command.cy.ts`

Expected: PASS.

Run: `npm run cypress:run -- --browser chrome --headless --spec cypress/e2e/jspdf/unsupported-placeholder.cy.ts`

Expected: PASS. If the sample document still contains unsupported content, it should surface via diagnostics and visible PDF text, not via non-image raster blocks.

- [ ] **Step 4: Commit**

```bash
git add cypress/e2e/jspdf/export-command.cy.ts cypress/e2e/jspdf/unsupported-placeholder.cy.ts scripts/jspdf-layout-runtime-test.ts
git commit -m "test: add jspdf unsupported placeholder checks"
```

---

### Task 7: Final Verification

**Files:**
- Verify all changed files.

- [ ] **Step 1: Run runtime tests**

Run: `npx tsx scripts/jspdf-layout-runtime-test.ts`

Expected: PASS.

- [ ] **Step 2: Run lint**

Run: `npm run lint`

Expected: PASS.

- [ ] **Step 3: Run type check**

Run: `npm run type:check`

Expected: PASS.

- [ ] **Step 4: Run targeted Cypress**

Run: `npm run cypress:run -- --browser chrome --headless --spec cypress/e2e/jspdf/export-command.cy.ts,cypress/e2e/jspdf/unsupported-placeholder.cy.ts`

Expected: PASS.

- [ ] **Step 5: Commit verification fixes if needed**

If verification required fixes:

```bash
git add src/plugins/jspdf src/main.ts scripts/jspdf-layout-runtime-test.ts cypress/e2e/jspdf
git commit -m "fix: stabilize jspdf unsupported placeholder export"
```

If no fixes were needed, do not create an empty commit.

---

## Self-Review

- Spec coverage: The plan now matches the new user constraint exactly: plugin-level fallback is forbidden, failures must render visible red placeholder text, and unsupported paths must be diagnosable.
- Placeholder scan: No task depends on vague follow-up work. Each task names concrete files, snippets, commands, and expected outcomes.
- Type consistency: The revised plan removes public fallback policy types entirely and consistently uses `unsupported:*` issue markers plus `appendFailurePlaceholder(...)` for unresolved render paths.
