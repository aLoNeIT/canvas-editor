# jsPDF PDF Export Bugfixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 修复当前 jsPDF 导出中的 4 个已确认问题：空控件占位、`T：39.5℃` 后下标字符缺失、电子签名排版错误、`其他记录` 表格内容上浮。

**Architecture:** 以现有 `jspdf` 插件的 `source -> normalize -> layout -> render` 链路为主，不改核心编辑器数据结构。重点收敛在控件文本提取、行内图片归类、表格单元格高度与垂直偏移算法三个位置，保证 PDF 布局向核心渲染对齐。

**Tech Stack:** TypeScript、Vite、jsPDF、现有调试脚本与 demo 页面。

---

### Task 1: 锁定空控件导出策略

**Files:**
- Modify: `src/plugins/jspdf/layout/tableCellText.ts`
- Check: `src/plugins/jspdf/source/readEditorState.ts`

- [ ] 统一“空控件”判定，空值时不输出 placeholder、prefix/postfix、pre/post 文本，也不输出 `minWidth` 占位。
- [ ] 保持非空控件现有样式提取逻辑，只裁掉空值分支，避免影响已有有值控件。

### Task 2: 修正下标字符与签名的布局数据流

**Files:**
- Modify: `src/plugins/jspdf/normalize/normalizeDocument.ts`
- Modify: `src/plugins/jspdf/layout/layoutDocument.ts`
- Modify: `src/plugins/jspdf/layout/tableCellText.ts`
- Check: `src/mock.ts`

- [ ] 让行内图片不再无条件被当作独立块，至少使签名图像能跟随前后文本参与同一行布局。
- [ ] 排查 `∆` 下标字符的字体/布局链路，确保最终 PDF 文字运行中保留并可见。

### Task 3: 对齐表格单元格内容高度与垂直偏移

**Files:**
- Modify: `src/plugins/jspdf/layout/tableMetrics.ts`
- Modify: `src/plugins/jspdf/layout/tableCellPlacement.ts`
- Check: `src/editor/core/draw/Draw.ts`

- [ ] 把表格文本内容高度计算补齐到与核心一致，纳入 `rowMargin`。
- [ ] 调整单元格内部首行起点和 `verticalAlign` 偏移，修复 `其他记录` 表格内容整体上浮。

### Task 4: 最小验证

**Files:**
- Check: `src/main.ts`
- Check: `scripts/jspdf-layout-runtime-test.ts`

- [ ] 优先使用现有 demo 导出链路和已有调试产物做验证，不新增大批测试。
- [ ] 启动本地服务，保留当前 demo 页面直接打开 Blob PDF 的能力，供人工复核。
