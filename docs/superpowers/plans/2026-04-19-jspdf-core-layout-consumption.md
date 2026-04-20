# jsPDF Core Layout Consumption Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 `jspdf` 插件优先消费核心 print 布局结果，而不是在插件内部重新主导正文分页与区域布局。

**Architecture:** 在 `source` 层增加核心布局快照读取能力，把核心 `pageRowList`、header/footer `rowList`、extra height、badge、graffiti、print page image 等结果收进统一 source model。随后收缩 `layoutDocument()` 的职责，让它从独立布局引擎变成核心布局结果到 PDF page model 的适配器，并保留 jsPDF 渲染层不变。

**Tech Stack:** TypeScript、现有 editor 核心 draw/command 能力、`src/plugins/jspdf/`、`scripts/jspdf-layout-runtime-test.ts`

---

### Task 1: 暴露核心布局快照读取入口

**Files:**
- Modify: `src/editor/core/command/Command.ts`
- Modify: `src/editor/core/command/CommandAdapt.ts`
- Modify: `src/plugins/jspdf/source/readEditorState.ts`
- Test: `scripts/jspdf-layout-runtime-test.ts`

- [ ] **Step 1: 在命令层增加核心布局快照读取测试**

在 `scripts/jspdf-layout-runtime-test.ts` 的插件命令 harness 相关测试附近，新增一个失败用例，要求 `readEditorState()` 返回的 source 中包含核心布局快照字段。

测试意图：

```ts
async function testReadEditorStateIncludesCoreLayoutSnapshot() {
  const source = readEditorState(
    {
      command: {
        getValue() {
          return {
            data: { header: [], main: [], footer: [], graffiti: [] },
            options: {}
          }
        },
        getOptions() {
          return {
            width: 794,
            height: 1123,
            margins: [100, 120, 100, 120]
          }
        },
        getLayoutSnapshot() {
          return {
            pageRowList: [[{ rowIndex: 0 }]],
            headerRowList: [{ rowIndex: 0 }],
            footerRowList: [{ rowIndex: 0 }],
            headerExtraHeight: 18,
            footerExtraHeight: 22,
            mainOuterHeight: 240,
            pageCount: 1,
            iframeInfoList: []
          }
        }
      }
    } as any,
    {
      mode: EditorMode.PRINT
    } as any
  )

  assert.deepEqual(source.coreLayout, {
    pageRowList: [[{ rowIndex: 0 }]],
    headerRowList: [{ rowIndex: 0 }],
    footerRowList: [{ rowIndex: 0 }],
    headerExtraHeight: 18,
    footerExtraHeight: 22,
    mainOuterHeight: 240,
    pageCount: 1,
    iframeInfoList: []
  })
}
```

- [ ] **Step 2: 运行脚本，确认新测试先失败**

Run: `npx tsx scripts/jspdf-layout-runtime-test.ts`

Expected: FAIL，原因是 `getLayoutSnapshot` 或 `source.coreLayout` 尚不存在。

- [ ] **Step 3: 在命令层补充布局快照接口**

在 `src/editor/core/command/Command.ts` 增加公开方法字段：

```ts
public getLayoutSnapshot: CommandAdapt['getLayoutSnapshot']
```

在构造函数绑定：

```ts
this.getLayoutSnapshot = adapt.getLayoutSnapshot.bind(adapt)
```

在 `src/editor/core/command/CommandAdapt.ts` 新增：

```ts
public getLayoutSnapshot() {
  const header = this.draw.getHeader()
  const footer = this.draw.getFooter()

  return {
    pageRowList: this.draw.getPageRowList(),
    headerRowList: header.getRowList(),
    footerRowList: footer.getRowList(),
    headerExtraHeight: header.getExtraHeight(),
    footerExtraHeight: footer.getExtraHeight(),
    mainOuterHeight: this.draw.getMainOuterHeight(),
    pageCount: this.draw.getPageCount(),
    iframeInfoList: this.draw.getBlockParticle().pickIframeInfo()
  }
}
```

在 `src/plugins/jspdf/source/readEditorState.ts` 增加 source 类型与读取逻辑：

```ts
export interface IJspdfCoreLayoutSnapshot {
  pageRowList: any[]
  headerRowList: any[]
  footerRowList: any[]
  headerExtraHeight: number
  footerExtraHeight: number
  mainOuterHeight: number
  pageCount: number
  iframeInfoList: any[]
}
```

并在 `IJspdfSourceState` 中新增：

```ts
coreLayout: IJspdfCoreLayoutSnapshot | null
```

在返回值里注入：

```ts
coreLayout:
  typeof (editor.command as any).getLayoutSnapshot === 'function'
    ? (editor.command as any).getLayoutSnapshot()
    : null
```

- [ ] **Step 4: 重新运行脚本，确认测试通过**

Run: `npx tsx scripts/jspdf-layout-runtime-test.ts`

Expected: PASS，包括新加的 `testReadEditorStateIncludesCoreLayoutSnapshot`。

- [ ] **Step 5: Commit**

```bash
git add src/editor/core/command/Command.ts src/editor/core/command/CommandAdapt.ts src/plugins/jspdf/source/readEditorState.ts scripts/jspdf-layout-runtime-test.ts
git commit -m "feat: expose core layout snapshot for jspdf"
```

### Task 2: 让插件入口优先消费核心布局快照

**Files:**
- Modify: `src/plugins/jspdf/index.ts`
- Modify: `src/plugins/jspdf/model/document.ts`
- Modify: `src/plugins/jspdf/normalize/normalizeDocument.ts`
- Test: `scripts/jspdf-layout-runtime-test.ts`

- [ ] **Step 1: 为插件命令入口补 failing test**

在 `scripts/jspdf-layout-runtime-test.ts` 的 `createJspdfPluginCommandHarness()` 相关测试里，增加一条用例，要求插件命令执行时把 `coreLayout` 传进 `normalizeDocument()`。

测试意图：

```ts
async function testJspdfPluginPassesCoreLayoutToNormalizeDocument() {
  const harness = createJspdfPluginCommandHarness({
    source: {
      result: { data: { header: [], main: [], footer: [], graffiti: [] } },
      options: { width: 794, height: 1123, margins: [100, 120, 100, 120] },
      exportOptions: { mode: EditorMode.PRINT },
      badge: { main: null, areas: [] },
      coreLayout: {
        pageRowList: [[{ rowIndex: 0 }]],
        headerRowList: [],
        footerRowList: [],
        headerExtraHeight: 0,
        footerExtraHeight: 0,
        mainOuterHeight: 200,
        pageCount: 1,
        iframeInfoList: []
      }
    },
    pageModels: [createJspdfPageModel({ pageNo: 0 })]
  })

  try {
    harness.jspdfPlugin(harness.editor as any)
    await (harness.editor.command as any).executeExportPdfBase64()
    assert.equal(
      (harness.callList[2].payload as any).coreLayout.pageCount,
      1
    )
  } finally {
    harness.restore()
  }
}
```

- [ ] **Step 2: 运行脚本，确认新测试先失败**

Run: `npx tsx scripts/jspdf-layout-runtime-test.ts`

Expected: FAIL，原因是当前 `IJspdfSourceState` / `normalizeDocument()` 尚未稳定接收并保留 `coreLayout`。

- [ ] **Step 3: 在文档模型中保存核心布局快照**

在 `src/plugins/jspdf/model/document.ts` 增加：

```ts
export interface IDocumentCoreLayoutSnapshot {
  pageRowList: any[]
  headerRowList: any[]
  footerRowList: any[]
  headerExtraHeight: number
  footerExtraHeight: number
  mainOuterHeight: number
  pageCount: number
  iframeInfoList: any[]
}
```

在 `IDocumentModel` 中新增：

```ts
coreLayout?: IDocumentCoreLayoutSnapshot | null
```

在 `src/plugins/jspdf/normalize/normalizeDocument.ts` 中把 `source.coreLayout` 原样写入：

```ts
coreLayout: source.coreLayout
  ? {
      ...source.coreLayout
    }
  : null,
```

这里不做二次布局，只做快照透传。

- [ ] **Step 4: 重新运行脚本，确认通过**

Run: `npx tsx scripts/jspdf-layout-runtime-test.ts`

Expected: PASS，包括新加的插件命令入口测试。

- [ ] **Step 5: Commit**

```bash
git add src/plugins/jspdf/index.ts src/plugins/jspdf/model/document.ts src/plugins/jspdf/normalize/normalizeDocument.ts scripts/jspdf-layout-runtime-test.ts
git commit -m "feat: carry core layout snapshot into jspdf document model"
```

### Task 3: 将 `layoutDocument()` 从独立分页切到核心页结果适配

**Files:**
- Modify: `src/plugins/jspdf/layout/layoutDocument.ts`
- Check: `src/editor/core/draw/Draw.ts`
- Test: `scripts/jspdf-layout-runtime-test.ts`

- [ ] **Step 1: 增加 failing test，要求优先使用核心页数**

在 `scripts/jspdf-layout-runtime-test.ts` 增加一条 runtime 用例，构造 `documentModel.coreLayout.pageRowList` 为两页，同时 `main.blockList` 为空，验证 `layoutDocument()` 输出两页而不是自己推导一页。

测试意图：

```ts
async function testLayoutDocumentUsesCoreLayoutPageCountWhenAvailable() {
  const pageList = await layoutDocument({
    width: 794,
    height: 1123,
    margins: [100, 120, 100, 120],
    scale: 1,
    defaults: {
      defaultFont: 'Arial',
      defaultSize: 16,
      defaultColor: '#000000',
      defaultRowMargin: 1,
      defaultBasicRowMarginHeight: 4,
      header: { top: 0, disabled: true },
      footer: { bottom: 0, disabled: true },
      backgroundColor: '#ffffff',
      backgroundImage: '',
      backgroundSize: BackgroundSize.CONTAIN,
      backgroundRepeat: BackgroundRepeat.NO_REPEAT,
      backgroundApplyPageNumbers: [],
      listInheritStyle: true,
      labelDefaultColor: '#000',
      labelDefaultBackgroundColor: '#fff',
      labelDefaultBorderRadius: 0,
      labelDefaultPadding: [0, 0, 0, 0],
      imgCaption: { color: '#000', font: 'Arial', size: 12, top: 0 },
      pageNumber: {
        bottom: 0,
        size: 12,
        font: 'Arial',
        color: '#000',
        rowFlex: RowFlex.LEFT,
        format: '{pageNo}',
        numberType: NumberType.ARABIC,
        disabled: true,
        startPageNo: 1,
        fromPageNo: 0
      },
      watermark: {
        data: '',
        type: WatermarkType.TEXT,
        width: 0,
        height: 0,
        color: '#000',
        opacity: 1,
        size: 12,
        font: 'Arial',
        repeat: false,
        gap: [0, 0],
        numberType: NumberType.ARABIC
      },
      pageBorder: { disabled: true, color: '#000', lineWidth: 1, padding: [0, 0, 0, 0] },
      lineNumber: { disabled: true, size: 12, font: 'Arial', color: '#000', right: 0, type: LineNumberType.PAGE },
      titleSizeMapping: {} as any
    },
    header: { key: 'header', elementList: [], blockList: [], height: 0 },
    main: { key: 'main', elementList: [], blockList: [], height: 0 },
    footer: { key: 'footer', elementList: [], blockList: [], height: 0 },
    coreLayout: {
      pageRowList: [[{ rowIndex: 0 }], [{ rowIndex: 1 }]],
      headerRowList: [],
      footerRowList: [],
      headerExtraHeight: 0,
      footerExtraHeight: 0,
      mainOuterHeight: 200,
      pageCount: 2,
      iframeInfoList: []
    }
  } as any)

  assert.equal(pageList.length, 2)
}
```

- [ ] **Step 2: 运行脚本，确认测试先失败**

Run: `npx tsx scripts/jspdf-layout-runtime-test.ts`

Expected: FAIL，当前 `layoutDocument()` 仍以插件自身 `collectMainPlacements()/paginateMainPlacements()` 为主。

- [ ] **Step 3: 在 `layoutDocument()` 中引入核心优先页策略**

在 `src/plugins/jspdf/layout/layoutDocument.ts` 中：

1. 新增辅助函数，优先从 `documentModel.coreLayout` 读取页数：

```ts
function resolveCorePageCount(documentModel: IDocumentModel) {
  const corePageRowList = documentModel.coreLayout?.pageRowList
  return corePageRowList?.length || documentModel.coreLayout?.pageCount || 0
}
```

2. 在 `layoutDocument()` 中改写 page count 选择逻辑：

```ts
  const corePageCount = resolveCorePageCount(resolvedDocumentModel)
  const computedPageCount = getRequiredPageCount(
    resolvedDocumentModel,
    placementIndexes.length
  )
  const pageCount = Math.max(corePageCount, computedPageCount || 0, 1)
```

3. 当 `coreLayout.pageRowList` 存在时，视其为主页框来源，不再让空主文档被压缩成单页。

这一阶段先完成“页数和 frame 跟核心走”，正文细粒度行映射下一任务再落。

- [ ] **Step 4: 重新运行脚本，确认通过**

Run: `npx tsx scripts/jspdf-layout-runtime-test.ts`

Expected: PASS，包括新增的核心页数优先测试。

- [ ] **Step 5: Commit**

```bash
git add src/plugins/jspdf/layout/layoutDocument.ts scripts/jspdf-layout-runtime-test.ts
git commit -m "feat: prefer core page count in jspdf layout"
```

### Task 4: 收缩正文与静态区布局职责，改为核心结果优先

**Files:**
- Modify: `src/plugins/jspdf/layout/layoutDocument.ts`
- Modify: `src/plugins/jspdf/source/readEditorState.ts`
- Test: `scripts/jspdf-layout-runtime-test.ts`

- [ ] **Step 1: 为 layout adapter 行为补 failing test**

在 `scripts/jspdf-layout-runtime-test.ts` 新增一条适配层测试，验证当 `coreLayout` 存在时，`layoutDocument()` 不会因为 `header/footer/main` 的 block 数据为空而直接产出空页 warning。

测试意图：

```ts
async function testLayoutDocumentDoesNotMarkCoreDrivenPageAsEmptyTooEarly() {
  const pageList = await layoutDocument({
    width: 794,
    height: 1123,
    margins: [100, 120, 100, 120],
    scale: 1,
    defaults: createDefaultDocumentDefaults(),
    header: { key: 'header', elementList: [], blockList: [], height: 0 },
    main: { key: 'main', elementList: [], blockList: [], height: 0 },
    footer: { key: 'footer', elementList: [], blockList: [], height: 0 },
    coreLayout: {
      pageRowList: [[{ rowIndex: 0 }]],
      headerRowList: [{ rowIndex: 0 }],
      footerRowList: [{ rowIndex: 0 }],
      headerExtraHeight: 24,
      footerExtraHeight: 18,
      mainOuterHeight: 240,
      pageCount: 1,
      iframeInfoList: []
    }
  } as any)

  assert.equal(pageList[0].issues.includes('layout:empty-page'), false)
}
```

- [ ] **Step 2: 运行脚本，确认测试先失败**

Run: `npx tsx scripts/jspdf-layout-runtime-test.ts`

Expected: FAIL，当前空 blockList 容易直接触发 `layout:empty-page`。

- [ ] **Step 3: 调整 `layoutDocument()`，让核心驱动页作为有效页**

在 `src/plugins/jspdf/layout/layoutDocument.ts` 中：

1. 新增判断：

```ts
function hasCoreLayoutContent(documentModel: IDocumentModel, pageNo: number) {
  const core = documentModel.coreLayout
  if (!core) return false
  return Boolean(
    core.pageRowList?.[pageNo]?.length ||
    (pageNo === 0 && core.headerRowList?.length) ||
    (pageNo === 0 && core.footerRowList?.length)
  )
}
```

2. 在追加 `layout:empty-page` 前排除核心驱动页：

```ts
    if (
      !page.textRuns.length &&
      !page.highlightRects.length &&
      !page.vectorLines.length &&
      !page.rasterBlocks.length &&
      !hasCoreLayoutContent(resolvedDocumentModel, pageNo)
    ) {
      page.issues.push('layout:empty-page')
    }
```

3. 在 `readEditorState()` 中确保 `coreLayout` 只在 `PRINT` 模式下读取，避免非 print 调用带入不稳定快照。

- [ ] **Step 4: 重新运行脚本，确认通过**

Run: `npx tsx scripts/jspdf-layout-runtime-test.ts`

Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add src/plugins/jspdf/layout/layoutDocument.ts src/plugins/jspdf/source/readEditorState.ts scripts/jspdf-layout-runtime-test.ts
git commit -m "fix: treat core-driven jspdf pages as non-empty"
```

### Task 5: 轻量验证并准备人工联调

**Files:**
- Check: `src/plugins/jspdf/`
- Check: `scripts/jspdf-layout-runtime-test.ts`

- [ ] **Step 1: 运行 runtime 验证脚本**

Run: `npx tsx scripts/jspdf-layout-runtime-test.ts`

Expected: PASS。

- [ ] **Step 2: 运行类型检查**

Run: `npm run type:check`

Expected: PASS。

- [ ] **Step 3: 运行 lint 并记录基线状态**

Run: `npm run lint`

Expected: 当前仓库可能仍然因为 `eslint .` 的基线配置问题失败；若仍报 “all of the files matching the glob pattern '.' are ignored”，记录为既有问题，不在本次计划内额外扩展修复。

- [ ] **Step 4: 记录人工联调关注点**

人工验证重点：

- 同内容下 print 与 PDF 的页数是否一致
- header/footer 是否挤压正文一致
- 表格跨页位置是否明显漂移
- 控件、图片、行号、badge、graffiti 是否出现新的致命异常

- [ ] **Step 5: Commit**

```bash
git add src/plugins/jspdf src/editor/core/command scripts/jspdf-layout-runtime-test.ts
git commit -m "feat: switch jspdf toward core layout consumption"
```
