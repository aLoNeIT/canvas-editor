# PROJECT

## 1. 当前任务目标

本任务的目标是让基于插件机制实现的 jsPDF 导出能力，尽可能逼近项目核心浏览器 Canvas 打印渲染的最终视觉结果，同时满足以下边界：

- 彻底放弃旧的“核心快照驱动 PDF”方案。
- PDF 导出必须由插件自行完成排版、分页、绘制。
- 核心只允许提供极少量通用只读能力，不允许出现 PDF 专用核心接口。
- 修复必须尽量落在“底层渲染机制一致性”层面，而不是只针对当前 demo 做坐标补丁。
- 插件开发中，正常功能禁止回退使用位图方案，哪怕当前向量/文本渲染存在失败、缺失或视觉偏差，也不能用位图兜底替代正常功能输出。
- `rasterBlocks` 仅允许保留天然位图语义或明确非文本/非向量的内容，例如图片、LaTeX 位图资产、明确约定的背景类资源；不能作为正常文本、表头、正文、表格线等功能的回退方案。

当前判断标准不是“导出成功”，而是“导出的真实 PDF 经 pdf.js 渲染后，和核心 Canvas 打印图尽量一致”。

## 2. 核心渲染链路

核心渲染入口是 [Draw.ts](/d:/Work/Project/JavaScript/canvas-editor/src/editor/core/draw/Draw.ts)。

核心链路可以概括为：

1. 编辑器数据和选项进入 `Draw.render(...)`。
2. `Draw` 根据 `pageMode`、页尺寸、边距、页眉页脚、主文区等信息计算分页结果。
3. `Draw._computePageList()` 生成分页后的行结构和页面结构。
4. `Draw` 遍历每一页，将不同层级内容依次绘制到浏览器 Canvas。

核心页面绘制的大致顺序见 [Draw.ts](/d:/Work/Project/JavaScript/canvas-editor/src/editor/core/draw/Draw.ts) `2593` 行附近：

- 背景
- 区域装饰
- 水印
- 页边距辅助
- 页眉
- 页码
- 页脚
- 搜索高亮、占位符、行号、页边框、徽标、涂鸦等
- 正文粒子和富文本装饰在更早的正文绘制阶段完成

核心正文粒子绘制入口在 [Draw.ts](/d:/Work/Project/JavaScript/canvas-editor/src/editor/core/draw/Draw.ts) `2225` 行附近，包含：

- 图片 `imageParticle.render(...)`
- LaTeX `laTexParticle.render(...)`
- 表格 `tableParticle.render(...)`
- 超链接、标签、上下标、分隔线、分页符、checkbox、radio、block 控件等
- 下划线、删除线、高亮、分组、选区等富文本装饰

### 2.1 核心表格渲染细节

表格核心实现见 [TableParticle.ts](/d:/Work/Project/JavaScript/canvas-editor/src/editor/core/draw/particle/table/TableParticle.ts)。

关键细节：

- 单元格背景和边线分别绘制。
- 边线绘制大量使用浏览器 Canvas 的半像素对齐。
- 例如外边框和单元格边线绘制中有 `ctx.translate(0.5, 0.5)`，以避免 1px 线条模糊。
- 这意味着核心表格线的最终落点，不是简单整数坐标，而是“浏览器 Canvas 的描边语义 + 半像素对齐”的叠加结果。

### 2.2 核心水印渲染细节

水印核心实现见 [Watermark.ts](/d:/Work/Project/JavaScript/canvas-editor/src/editor/core/draw/frame/Watermark.ts)。

关键细节：

- 文本水印使用浏览器 Canvas 原生 `fillText`。
- 使用 `globalAlpha` 控制透明度。
- 使用 `rotate(-45deg)` 绘制。
- 重复水印通过临时 Canvas pattern 实现。
- 非重复水印直接在页面中心旋转绘制。

这类“透明 + 旋转 + 大字号”文本在 jsPDF 向量文本路径中与浏览器 Canvas 存在天然差异风险。

## 3. 插件渲染链路

插件入口在 [src/plugins/jspdf/index.ts](/d:/Work/Project/JavaScript/canvas-editor/src/plugins/jspdf/index.ts)。

插件导出链路是：

1. `editor.use(jspdfPlugin, ...)`
2. 调用 `command.executeExportPdfBase64()`
3. 插件读取编辑器只读状态 `readEditorState(...)`
4. 将状态标准化为插件内部文档模型 `normalizeDocument(...)`
5. 用插件内部布局引擎生成 `pageModels`：`layoutDocument(...)`
6. 用 jsPDF 将 `pageModels` 渲染为 PDF：`renderPdfBase64(...)`

对应文件：

- 状态读取：[readEditorState.ts](/d:/Work/Project/JavaScript/canvas-editor/src/plugins/jspdf/source/readEditorState.ts)
- 标准化：[normalizeDocument.ts](/d:/Work/Project/JavaScript/canvas-editor/src/plugins/jspdf/normalize/normalizeDocument.ts)
- 布局：[layoutDocument.ts](/d:/Work/Project/JavaScript/canvas-editor/src/plugins/jspdf/layout/layoutDocument.ts)
- PDF 渲染：[renderPdf.ts](/d:/Work/Project/JavaScript/canvas-editor/src/plugins/jspdf/renderPdf.ts)

### 3.1 插件内部页面模型

插件页面模型定义见 [types.ts](/d:/Work/Project/JavaScript/canvas-editor/src/plugins/jspdf/types.ts)。

页面由以下操作组成：

- `textRuns`
- `highlightRects`
- `vectorLines`
- `rasterBlocks`
- `links`

渲染顺序由 [renderStage.ts](/d:/Work/Project/JavaScript/canvas-editor/src/plugins/jspdf/render/renderStage.ts) 控制：

- `highlight`
- `raster`
- `text`
- `vector`
- `link`

同一 stage 内的顺序固定，不依赖核心 Draw。

### 3.2 插件布局细节

插件布局主文件是 [layoutDocument.ts](/d:/Work/Project/JavaScript/canvas-editor/src/plugins/jspdf/layout/layoutDocument.ts)。

核心职责：

- 构建页级 frame 装饰
- 布局 header / footer / main
- 生成表格线、页边框、页码、行号、separator 等向量对象
- 生成文本放置对象
- 正常功能优先走文本/向量/结构化布局路径，禁止把渲染失败内容回退为位图输出

### 3.3 插件绘制细节

PDF 输出主入口见 [renderPdf.ts](/d:/Work/Project/JavaScript/canvas-editor/src/plugins/jspdf/renderPdf.ts)。

其中：

- 文本由 [renderText.ts](/d:/Work/Project/JavaScript/canvas-editor/src/plugins/jspdf/render/renderText.ts) 输出
- 向量线由 [renderVector.ts](/d:/Work/Project/JavaScript/canvas-editor/src/plugins/jspdf/render/renderVector.ts) 输出
- 位图块由 [renderImage.ts](/d:/Work/Project/JavaScript/canvas-editor/src/plugins/jspdf/render/renderImage.ts) 输出

### 3.4 插件 fallback 机制

插件 fallback 相关文件：

- [rasterizeElement.ts](/d:/Work/Project/JavaScript/canvas-editor/src/plugins/jspdf/fallback/rasterizeElement.ts)
- [resolveFallback.ts](/d:/Work/Project/JavaScript/canvas-editor/src/plugins/jspdf/fallback/resolveFallback.ts)

当前允许保留的位图策略包括：

- 对 `latex` 生成独立 raster block
- 对背景类资源生成独立 raster block

明确禁止的策略包括：

- 对正文文本、表头文本、页眉页脚文本回退为 raster block
- 对表格线、分隔线、页边框等向量对象回退为 raster block
- 因“当前不好对齐 Canvas”就将正常功能整体截图或局部截图后嵌入 PDF

## 4. 当前执行到什么程度

### 4.1 已经完成的方向

1. 已经完成从“核心快照导出 PDF”向“插件独立排版引擎”的迁移主线。
2. 已经补齐插件侧大量页面模型、布局、渲染、诊断能力。
3. header 区域当前和核心已经比较接近。
4. 正文、表头、页眉页脚等正常功能已经明确禁止使用位图 fallback 兜底，后续修复必须继续落在文本、向量和布局计算路径本身。
5. LaTeX 已经支持导出，当前走 raster block。
6. iframe / video 已明确记录为暂缓项。
7. 已建立比较完整的视觉诊断体系，可以针对局部热点做溯源和消融分析。

### 4.2 当前总体指标

最新视觉指标见 [dom-meta.json](/d:/Work/Project/JavaScript/canvas-editor/cypress/artifacts/jspdf-visual/dom-meta.json)：

- page 1 `avgChannelDiff = 4.737705169297666`
- page 1 `pctAbove30 = 0.022488341995060907`
- page 2 `avgChannelDiff = 3.2055326644698106`
- page 2 `pctAbove30 = 0.01513578014987742`

这说明总体结果已经明显优于早期阶段，但仍然存在局部高差异热点。

## 5. 当前已知的关键诊断结论

### 5.1 page 1

page 1 主要热点曾经集中在正文 fallback 行区域，但这些结论只作为历史诊断背景，不再代表当前允许继续沿用该策略：

- 当前这些热点大多同时覆盖了背景水印 raster block 和历史上的正文 raster block。
- 早先针对正文 fallback block 的专项诊断，仅可用于定位当时问题来源，不能再作为保留正文位图方案的依据。
- 当前应将此类热点重新解释为“文本/布局链路仍需修复”，而不是“继续使用正文 fallback”。

### 5.2 page 2

page 2 已通过组件消融明确了主因分布：

结果文件见 [page2-hotspot-component-ablation.json](/d:/Work/Project/JavaScript/canvas-editor/cypress/artifacts/jspdf-visual/page2-hotspot-component-ablation.json)。

结论：

- 表格热点主要由 `vectorLines` 贡献。
- 去掉表格线后，热点明显下降。
- 去掉单元格里的数字编号文本后，下降很有限。
- 说明当前 page 2 的主差异不是普通文本，而是表格/列表边线机制。

### 5.3 水印贡献

结果文件见 [page2-watermark-ablation-diagnostic.json](/d:/Work/Project/JavaScript/canvas-editor/cypress/artifacts/jspdf-visual/page2-watermark-ablation-diagnostic.json)。

结论：

- `page2-top-text` 这一类热点，水印贡献明显。
- `table-left-lines` 和 `latex-neighbor` 两类热点，去掉水印后差异基本不变。
- 说明 page 2 的表格热点和 latex 邻域热点，主因不是水印。

## 6. 当前已落地的关键改动

### 6.1 正文文本链路修复约束

在 [layoutDocument.ts](/d:/Work/Project/JavaScript/canvas-editor/src/plugins/jspdf/layout/layoutDocument.ts) 中：

- 正文文本、表头文本、页眉页脚文本必须保持真实文本输出，不允许再引入 raster fallback。
- ordered-list marker 与正文首行的统一处理，必须继续落在 placement、换行、字体度量和布局计算路径上。
- 任何缺字、错位、换行异常，都应修复文本与布局逻辑本身，不能改为截图或局部位图。

### 6.2 背景文本水印 raster 化

在 [layoutDocument.ts](/d:/Work/Project/JavaScript/canvas-editor/src/plugins/jspdf/layout/layoutDocument.ts) 中：

- 背景文本水印不再走 jsPDF 向量文本。
- 当前改为插件内 raster block。
- 非重复水印已从“整页 raster”收缩为“水印自身包围盒 raster”。

### 6.3 向量线对齐尝试

在 [renderVector.ts](/d:/Work/Project/JavaScript/canvas-editor/src/plugins/jspdf/render/renderVector.ts) 中：

- 针对奇数线宽的水平/垂直线，做了半像素对齐尝试。

目前结论是：

- 该调整没有显著解决 page 2 表格热点。
- 说明 page 2 线条问题不只是简单的半像素偏移。

## 7. 当前未解决的任务清单

### 7.1 高优先级

1. page 2 表格/列表线条渲染仍与核心有显著差异。
   - 已知主因是 `vectorLines`
   - 尚未找到真正等价于浏览器 Canvas 的 jsPDF 线条绘制策略

2. 背景文本水印虽然已 raster 化，但仍参与 page 1 / page 2 某些热点叠加。
   - 需要继续验证其边界、采样与核心是否完全一致

3. `latex` 邻域热点仍存在。
   - 已知与 `latex` raster block 有重叠
   - 尚未完成针对 `latex` 图块的独立采样/缩放一致性修复

### 7.2 中优先级

4. page 1 当前热点需要继续拆分“文本/布局链路问题本身”与“背景水印叠加”的贡献。

5. 需要继续完善局部诊断，尤其是：
   - 单个 raster block 的 source / pdf 对比，仅用于图片、LaTeX、背景类资源
   - 表格线与浏览器 Canvas 描边规则的针对性实验

### 7.3 暂缓项

6. block iframe
7. video

这两项已经明确记录为暂不实现，不应混入当前一致性审计结论。

## 8. 现有审计与诊断文件清单

建议优先阅读这些文件：

- [layoutDocument.ts](/d:/Work/Project/JavaScript/canvas-editor/src/plugins/jspdf/layout/layoutDocument.ts)
- [renderPdf.ts](/d:/Work/Project/JavaScript/canvas-editor/src/plugins/jspdf/renderPdf.ts)
- [renderText.ts](/d:/Work/Project/JavaScript/canvas-editor/src/plugins/jspdf/render/renderText.ts)
- [renderVector.ts](/d:/Work/Project/JavaScript/canvas-editor/src/plugins/jspdf/render/renderVector.ts)
- [renderImage.ts](/d:/Work/Project/JavaScript/canvas-editor/src/plugins/jspdf/render/renderImage.ts)
- [Draw.ts](/d:/Work/Project/JavaScript/canvas-editor/src/editor/core/draw/Draw.ts)
- [TableParticle.ts](/d:/Work/Project/JavaScript/canvas-editor/src/editor/core/draw/particle/table/TableParticle.ts)
- [Watermark.ts](/d:/Work/Project/JavaScript/canvas-editor/src/editor/core/draw/frame/Watermark.ts)

诊断产物：

- [dom-meta.json](/d:/Work/Project/JavaScript/canvas-editor/cypress/artifacts/jspdf-visual/dom-meta.json)
- [diff-hotspots.json](/d:/Work/Project/JavaScript/canvas-editor/cypress/artifacts/jspdf-visual/diff-hotspots.json)
- [hotspot-page-model-diagnostic.json](/d:/Work/Project/JavaScript/canvas-editor/cypress/artifacts/jspdf-visual/hotspot-page-model-diagnostic.json)
- [page2-watermark-ablation-diagnostic.json](/d:/Work/Project/JavaScript/canvas-editor/cypress/artifacts/jspdf-visual/page2-watermark-ablation-diagnostic.json)
- [page2-hotspot-component-ablation.json](/d:/Work/Project/JavaScript/canvas-editor/cypress/artifacts/jspdf-visual/page2-hotspot-component-ablation.json)

诊断用例：

- [visual-export-check.cy.ts](/d:/Work/Project/JavaScript/canvas-editor/cypress/e2e/jspdf/visual-export-check.cy.ts)
- [visual-export-dump.cy.ts](/d:/Work/Project/JavaScript/canvas-editor/cypress/e2e/jspdf/visual-export-dump.cy.ts)
- [hotspot-page-model-diagnostic.cy.ts](/d:/Work/Project/JavaScript/canvas-editor/cypress/e2e/jspdf/hotspot-page-model-diagnostic.cy.ts)
- [page2-watermark-ablation-diagnostic.cy.ts](/d:/Work/Project/JavaScript/canvas-editor/cypress/e2e/jspdf/page2-watermark-ablation-diagnostic.cy.ts)
- [page2-hotspot-component-ablation.cy.ts](/d:/Work/Project/JavaScript/canvas-editor/cypress/e2e/jspdf/page2-hotspot-component-ablation.cy.ts)

## 9. 建议其他模型重点审计的问题

建议其他模型重点分析以下问题：

1. jsPDF 的 `line()` 语义与浏览器 Canvas `stroke()` 在 1px 表格线上的差异，是否需要更深层的模拟，而不是简单坐标偏移。
2. 表格线如何继续逼近浏览器 Canvas 描边结果，同时保持向量输出。
3. `latex` 图块与普通图片图块在 addImage / pdf.js 渲染链路中，是否存在统一的采样误差。
4. 当前背景文本水印 raster 化是否还有进一步缩小包围盒或提高像素比的空间。
5. page 1 热点中“背景水印 + 文本链路问题”叠加是否需要重新分层或重排操作顺序。

## 10. 当前状态总结

当前项目已经不再是“PDF 插件能不能跑起来”的阶段，而是“插件独立排版引擎与核心浏览器 Canvas 的剩余视觉差异收敛”阶段。

目前可以明确下结论：

- 插件独立导出链路已成立。
- 大部分正文内容已经能稳定导出。
- header 和大段正文的主要偏差已经被明显压低。
- 现在剩下的是若干局部高差异点，最核心的是 page 2 的表格线机制，以及 `latex` 邻域问题。

从审计角度看，当前最值得投入分析的不是“总体架构是否正确”，而是：

- jsPDF 向量线如何复现浏览器 Canvas 表格描边
- 文本、表格线、页眉页脚等正常功能如何在不使用位图兜底的前提下继续收敛视觉差异
