# Canvas Editor jsPDF 插件渲染一致性审计报告

**审计日期**: 2026-04-15  
**审计范围**: 核心 Canvas 渲染路径 vs jsPDF 插件渲染路径的逐模块实现细节对比  
**审计目标**: 确保插件输出的样式、布局和核心效果一致，且矢量文字在放大缩小时不失真

---

## 1. 执行摘要

本报告逐模块对比了核心浏览器 Canvas 渲染引擎和 jsPDF 插件独立排版引擎的实现细节。所有结论均来自源码逐行审读，非推测性判断。

| 模块 | 矢量/位图 | 核心一致性 | 风险等级 | 说明 |
|------|-----------|-----------|---------|------|
| 普通文本 | 矢量 | 高 | 低 | jsPDF `doc.text()` 矢量输出，放大不失真 |
| 超链接文本 | 矢量 | 高 | 低 | 同普通文本路径 + link rect |
| 列表 marker | 矢量 | 高 | 低 | 与正文统一处理 |
| 表格线 | 矢量 | **低** | **高** | `line()` 语义与 Canvas `stroke()` + `translate(0.5,0.5)` 有结构性差异 |
| 表格单元格文本 | 矢量 | 中 | 中 | 单元格内 padding 硬编码 6px，核心无此常量 |
| 水印(文字) | **位图** | 中 | 中 | 已改走 raster fallback，pixelRatio=2 |
| 水印(图片) | 位图 | 高 | 低 | 与核心一致，addImage 输出 |
| LaTeX | **位图** | 中 | 中 | SVG→PNG，pixelRatio=1，放大会失真 |
| 普通图片 | 位图 | 高 | 低 | addImage 路径，支持 crop 和旋转 |
| 下划线 | 矢量 | **中低** | 中 | 偏移计算 `y+2` 与核心 `Math.floor(y+2*lineWidth)+0.5` 不一致 |
| 删除线 | 矢量 | **中低** | 中 | 偏移 `y - size*0.35` 与核心 `y+0.5` 语义不同 |
| 页码 | 矢量 | 高 | 低 | 与正文统一的 textRun 路径 |
| 页眉/页脚 | 矢量 | 高 | 低 | 独立 stage 渲染 |
| 页边框 | 矢量 | 高 | 低 | createPageBorderLines 生成 |
| 行号 | 矢量 | 高 | 低 | 与正文统一的 textRun 路径 |
| 签章 | 位图 | 高 | 低 | raster block 路径 |
| 涂鸦 | 矢量 | 高 | 低 | vectorLine 路径 |
| 背景色 | 矢量 | 高 | 低 | highlightRect 路径 |
| 背景图 | 位图 | 高 | 低 | raster block 路径 |
| 浮动图片 | 位图 | 高 | 低 | raster block + stage 分层 |
| 区域装饰 | 矢量 | 高 | 低 | highlightRect + vectorLine |

---

## 2. 渲染路径完整对比

### 2.1 核心渲染链路 (Draw.ts)

**入口**: `Draw.render()` → `_computePageList()` → `_drawPage()`

**绘制顺序** (Draw.ts:2571–2668):
```
_clearPage()
background.render()           // 背景色/背景图
area.render()                 // 区域装饰 (仅非打印模式)
waterMark.render()            // 水印
margin.render()               // 页边距辅助线 (仅非打印模式)
_drawFloat(FLOAT_BOTTOM)      // 衬于文字下方浮动图
control.renderHighlightList() // 控件高亮 (仅非打印模式)
drawRow()                     // 正文元素逐行绘制
header.render()               // 页眉
pageNumber.render()           // 页码
footer.render()               // 页脚
_drawFloat(FLOAT_TOP/SURROUND) // 浮于文字上方浮动图
search.render()               // 搜索高亮 (仅非打印模式)
placeholder.render()          // 空白占位符
lineNumber.render()           // 行号
pageBorder.render()           // 页面边框
badge.render()                // 签章
graffiti.render()             // 涂鸦
```

**正文元素绘制** (Draw.ts:2200–2317) 逐元素分派:
- `ImageParticle.render()` → `ctx.drawImage()`
- `LaTexParticle.render()` → `ctx.drawImage()` (SVG→Image)
- `TableParticle.render()` → `_drawBackgroundColor()` + `_drawBorder()`
- `TextParticle.record()` / `.complete()` → `ctx.fillText()` (批量合并)
- `HyperlinkParticle.render()` → `ctx.fillText()` + 下划线
- 下划线 / 删除线 在元素遍历中实时 record + flush

### 2.2 插件渲染链路

**入口**: `index.ts` → `readEditorState()` → `normalizeDocument()` → `layoutDocument()` → `renderPdfBase64()`

**渲染顺序** (renderStage.ts):
```
BACKGROUND  (0)   → 背景色/背景图/水印/区域装饰
FLOAT_BOTTOM(20)  → 衬于文字下方浮动图
CONTENT     (30)  → 正文文本/表格/图片/LaTeX/列表/下划线/删除线
HEADER      (40)  → 页眉
PAGE_NUMBER (41)  → 页码
FOOTER      (42)  → 页脚
FLOAT_OVERLAY(50) → 浮于文字上方浮动图
LINE_NUMBER (60)  → 行号
PAGE_BORDER (70)  → 页面边框
BADGE       (80)  → 签章
GRAFFITI    (90)  → 涂鸦
```

同一 stage 内: `highlight → raster → text → vector → link`

**渲染分发** (renderPdf.ts:54–108): 遍历 `collectPageRenderOperations(page)` 排序后的操作列表，按 kind 分发到:
- `highlight` → `doc.setFillColor()` + `doc.rect(x,y,w,h,'F')`
- `raster` → `renderImages()` → `doc.addImage()`
- `text` → `renderTextRun()` → `doc.text()`
- `vector` → `renderVectorLine()` → `doc.line()`
- `link` → `doc.link()`

### 2.3 渲染顺序一致性判定

| 核心顺序 | 插件 stage | 一致性 |
|---------|-----------|--------|
| background | BACKGROUND(0) | ✅ |
| watermark (在 area 之后) | BACKGROUND(0) raster | ✅ 同层 |
| float_bottom | FLOAT_BOTTOM(20) | ✅ |
| 正文元素 | CONTENT(30) | ✅ |
| header | HEADER(40) | ✅ |
| pageNumber | PAGE_NUMBER(41) | ✅ |
| footer | FOOTER(42) | ✅ |
| float_top/surround | FLOAT_OVERLAY(50) | ✅ |
| lineNumber | LINE_NUMBER(60) | ✅ |
| pageBorder | PAGE_BORDER(70) | ✅ |
| badge | BADGE(80) | ✅ |
| graffiti | GRAFFITI(90) | ✅ |

**结论**: 渲染顺序完全对齐，不存在 z-order 差异。

---

## 3. 逐模块深度对比

### 3.1 文本渲染

#### 核心 (TextParticle.ts:166–173)
```typescript
private _render() {
  this.ctx.font = this.curStyle       // 预拼接的 font 字符串
  this.ctx.fillStyle = this.curColor || this.options.defaultColor
  this.ctx.fillText(this.text, this.curX, this.curY)
}
```
- **批量优化**: `record()` 将相同 style/color 的相邻字符合并为一次 `fillText` 调用
- **textBaseline**: Canvas 默认 `alphabetic`
- **坐标**: 核心 Draw.ts:2207 传入 `y + offsetY`，offsetY 是 `ascent` 值 — 即基线位置
- **标点/字宽/字间距**: 单独 `complete()` 避免浏览器排版缩小间距
- **两端对齐**: 逐字 `record()+complete()`

#### 插件 (renderText.ts:27–83)
```typescript
doc.setFont(resolvePdfFontFamily(...))
doc.setFontSize(run.size)
doc.setTextColor(run.color || '#000000')
doc.text(run.text, run.x, run.y + textYOffset, {
  angle: run.rotate || 0,
  horizontalScale  // run.width / pdfTextWidth — 补偿 jsPDF 字宽差异
})
```
- **矢量输出**: `doc.text()` 生成 PDF 文本操作符 `Tj`/`TJ`，**放大缩小不失真**
- **垂直偏移**: `PDF_TEXT_VERTICAL_OFFSET = 0.5`，header 阶段也是 0.5
- **垂直缩放**: `PDF_TEXT_VERTICAL_SCALE_Y = 0.97`（header 阶段为 1），通过 `doc.advancedAPI` + `pdf.Matrix(1,0,0,0.97,0,0)` 实现
- **horizontalScale**: 补偿 jsPDF 内部字体度量与浏览器 Canvas 的宽度差异
- **letterSpacing**: `doc.setCharSpace(run.letterSpacing || 0)`
- **透明度**: `doc.setGState(new GState({ opacity }))`

#### 差异详表

| 细节 | 核心 | 插件 | 差异分析 |
|------|------|------|---------|
| 输出格式 | 位图 (Canvas pixel) | **矢量** (PDF text op) | ✅ 插件优于核心 |
| 基线计算 | Canvas `alphabetic` + ascent offset | 布局引擎 `resolveRunBaseline()` + 0.5 偏移 | ⚠️ 0.5pt 偏移是经验值 |
| 垂直缩放 | 无 | Matrix(1,0,0,0.97,0,0) | ⚠️ 0.97 是经验值，可能字体相关 |
| 宽度补偿 | 无（使用浏览器原生布局） | `horizontalScale = run.width / pdfTextWidth` | ✅ 有效补偿字宽差异 |
| 字符间距 | 浏览器原生 | `doc.setCharSpace()` | ✅ 等效 |
| 批量合并 | record+complete 合并相同样式 | styledTextRunPlacement 预合并 | ✅ 逻辑等效 |
| 两端对齐 | 逐字渲染 | segment gap 分配 | ✅ 逻辑等效 |

**风险点**:
1. `PDF_TEXT_VERTICAL_OFFSET=0.5` 和 `PDF_TEXT_VERTICAL_SCALE_Y=0.97` 是硬编码经验值。在不同字体族（如宋体 vs Arial）和不同字号下可能产生 0.5–1.5pt 的基线偏移。
2. `horizontalScale` 依赖 `doc.getTextWidth()` 的准确性。如果 jsPDF 内嵌字体度量表与浏览器字体不一致，缩放后文本可能略宽或略窄。

---

### 3.2 表格线渲染 [高风险]

#### 核心 (TableParticle.ts:104–311)

**外边框绘制** (_drawOuterBorder):
```typescript
const x = Math.round(startX)
const y = Math.round(startY)
ctx.translate(0.5, 0.5)       // 关键：半像素偏移
if (isDrawFullBorder) {
  ctx.rect(x, y, width, height)
} else {
  ctx.moveTo(x, y + height)
  ctx.lineTo(x, y)
  ctx.lineTo(x + width, y)
}
ctx.stroke()
ctx.translate(-0.5, -0.5)
```

**单元格边线绘制** (_drawBorder):
```typescript
// 每个单元格
const x = Math.round(td.x! * scale + startX + width)   // 注意：右上角为参考点
const y = Math.round(td.y! * scale + startY)
ctx.translate(0.5, 0.5)
ctx.beginPath()
// 右边框
ctx.moveTo(x, y)
ctx.lineTo(x, y + height)
// 下边框
ctx.moveTo(x, y + height)
ctx.lineTo(x - width, y + height)
ctx.stroke()
ctx.translate(-0.5, -0.5)
```

**关键语义**: 核心使用 `Math.round()` + `translate(0.5, 0.5)` 组合。这意味着最终描边坐标是 `Math.round(value) + 0.5`，即总是落在像素的中心点。在 Canvas 1px 描边中，这能保证线条恰好占据 1 个物理像素，不会出现半透明模糊。

**坐标参考点**: 单元格使用右上角 `(td.x + td.width, td.y)` 作为参考点绘制右边框和下边框。

#### 插件 (tableVisual.ts + renderVector.ts)

**线条生成** (tableVisual.ts:50–197):
```typescript
// 每个单元格
pushEdge('right', isLastCol)
pushEdge('bottom', isLastRow)

// pushEdge 以单元格左上角为参考
function pushEdge(edge, isExternal) {
  if (edge === 'right') {
    pushLine(lines, {
      x1: option.x + option.width,   // 右上角
      y1: option.y,
      x2: option.x + option.width,   // 右下角
      y2: option.y + option.height
    })
  }
  if (edge === 'bottom') {
    pushLine(lines, {
      x1: option.x + option.width,   // 右下角
      y1: option.y + option.height,
      x2: option.x,                  // 左下角
      y2: option.y + option.height
    })
  }
}
```

**线条渲染** (renderVector.ts:22–49):
```typescript
function renderVectorLine(doc: jsPDF, line: IPdfVectorLine) {
  if (isOddLineWidth(lineWidth)) {
    if (isAxisAligned(line.y1, line.y2)) {           // 水平线
      y1 = y2 = alignOddWidthAxisCoordinate(line.y1)  // Math.round(v) + 0.5
    } else if (isAxisAligned(line.x1, line.x2)) {    // 垂直线
      x1 = x2 = alignOddWidthAxisCoordinate(line.x1)
    }
  }
  doc.line(x1, y1, x2, y2)
}
```

#### 关键差异分析

| 细节 | 核心 | 插件 | 差异 |
|------|------|------|------|
| 半像素策略 | `translate(0.5,0.5)` 全局偏移 | 逐线 `Math.round(v)+0.5` | **语义不同** |
| 坐标来源 | `Math.round(td.x*scale+startX)` → +0.5 | `option.x` (浮点)→ +0.5 | ⚠️ 缺少 `Math.round()` 步骤 |
| 描边 API | Canvas `stroke()` — 线条沿路径中心展开 | jsPDF `line()` — 同样沿中心展开 | API 语义一致 |
| PDF 渲染器差异 | 浏览器 Canvas 原生 | pdf.js / Adobe Reader | **渲染器行为不同** |
| borderExternalWidth | 右下边框可使用不同线宽 | pushEdge 的 isExternal 控制 | ✅ 逻辑已实现 |
| 斜线 (TdSlash) | `ctx.moveTo/lineTo/stroke` | `pushLine` forward/back slash | ✅ 逻辑一致 |

**根本原因**: 核心的坐标经过 `Math.round()` 整数化后再 `+0.5`，确保线条中心落在像素边界的精确中点。插件的 `option.x` / `option.y` 来自 `layoutTable.ts` 的 `sum(columnWidthList, ...)` 计算，是浮点数。`alignOddWidthAxisCoordinate` 虽然做了 `Math.round(value)+0.5`，但 `Math.round()` 对浮点误差敏感 — 例如 `value=100.499999` 会被 round 到 100 而非 101。

**建议**:
1. **方案A (最快生效)**: 在 `tableVisual.ts` 中的 `pushEdge` 对坐标做 `Math.round()` 整数化后再传给 `pushLine`，模拟核心的 `Math.round(td.x*scale+startX)` 行为。
2. **方案B (最可靠)**: 对表格区域做局部 raster fallback，复用已有的 `rasterizeElement` 基础设施，使用核心的表格绘制逻辑生成与 Canvas 完全一致的位图。
3. **方案C (需验证)**: 检查 jsPDF line 是否支持 `lineCapStyle`/`lineJoinStyle` 配置。Canvas 默认 `lineCap='butt'`，PDF 默认也是 butt，但部分 PDF viewer 的实际渲染可能不同。

---

### 3.3 下划线与删除线

#### 核心

**下划线** (Underline.ts:78–105):
```typescript
const adjustY = Math.floor(y + 2 * ctx.lineWidth) + 0.5
ctx.moveTo(x, adjustY)
ctx.lineTo(x + width, adjustY)
ctx.stroke()
```
- `lineWidth = scale`
- Y 坐标 = `Math.floor(元素行底 - rowMargin + 2*scale) + 0.5`
- 支持 WAVY / DOUBLE / DASHED / DOTTED 样式

**删除线** (Strikeout.ts:13–28):
```typescript
const adjustY = y + 0.5    // y = 元素区域中部附近
ctx.moveTo(x, adjustY)
ctx.lineTo(x + width, adjustY)
ctx.stroke()
```

#### 插件 (textDecoration.ts:4–32)

```typescript
// 下划线
lineList.push({
  x1: placement.x,
  y1: placement.y + 2,           // 硬编码 +2
  x2: placement.x + placement.width,
  y2: placement.y + 2
})

// 删除线
const strikeY = placement.y - placement.size * 0.35
lineList.push({
  x1: placement.x,
  y1: strikeY,
  x2: placement.x + placement.width,
  y2: strikeY
})
```

#### 差异详表

| 细节 | 核心 | 插件 | 差异 |
|------|------|------|------|
| 下划线Y | `Math.floor(行底-rowMargin + 2*scale)+0.5` | `baseline + 2` | ⚠️ 缺少 `Math.floor+0.5` 对齐 |
| 删除线Y | `行中部 + 0.5` | `baseline - size*0.35` | ⚠️ 计算方式不同 |
| 下划线样式 | WAVY/DOUBLE/DASHED/DOTTED | 仅实线 | ❌ 缺少装饰样式支持 |
| 线宽 | `scale` (通常为1) | 硬编码 `width: 1` | 当 scale≠1 时不一致 |

**建议**:
1. 下划线应增加 `Math.floor()+0.5` 半像素对齐
2. 删除线应参考核心的 `y+0.5` 策略，而非 `size*0.35` 估算
3. 补充 WAVY/DOUBLE/DASHED/DOTTED 下划线样式支持

---

### 3.4 水印渲染

#### 核心 (Watermark.ts:19–103)

**非重复水印**:
```typescript
ctx.globalAlpha = opacity
ctx.font = `${size * scale}px ${font}`
ctx.fillStyle = color
ctx.translate(width/2, height/2)              // 页面中心
ctx.rotate((-45 * Math.PI) / 180)
ctx.fillText(text, -measureText.width/2,
  measureText.actualBoundingBoxAscent - (size*scale)/2)
```

**重复水印**: 创建临时 Canvas → pattern → `ctx.fillRect(0,0,width,height)`

#### 插件 (layoutDocument.ts:245–379)

当前**两种路径都走 raster fallback**:

**非重复**: `rasterizeElement()` 生成 `rasterSize x rasterSize` 的 PNG，居中放置:
```typescript
const rasterBlock = await rasterizeElement(ctx => {
  ctx.globalAlpha = watermark.opacity
  ctx.font = `${watermark.size}px ${watermark.font}`
  ctx.fillStyle = watermark.color
  ctx.translate(rasterSize/2, rasterSize/2)
  ctx.rotate((-45 * Math.PI) / 180)
  ctx.fillText(placement.text, -metric.width/2, metric.ascent - watermark.size/2)
}, rasterSize, rasterSize, 'watermark-text', 2)
```

**重复**: 整页 raster，`pixelRatio=2`:
```typescript
rasterizeElement(ctx => {
  // 复制核心的 pattern 逻辑
  const pattern = ctx.createPattern(temporaryCanvas, 'repeat')
  ctx.fillStyle = pattern
  ctx.fillRect(0, 0, payload.pageWidth, payload.pageHeight)
}, payload.pageWidth, payload.pageHeight, 'watermark-text', 2)
```

#### 差异分析

| 细节 | 核心 | 插件 | 差异 |
|------|------|------|------|
| 输出格式 | Canvas 原生 fillText (位图) | **raster fallback** (PNG) | ⚠️ 都是位图，但插件经历 Canvas→PNG→PDF 多一层转换 |
| 重复水印尺寸 | 页面尺寸 | 页面尺寸 × pixelRatio=2 | ✅ 插件 2x 像素比 |
| 非重复水印 | 直接绘制到页面 Canvas | 包围盒 raster block | ✅ 插件已缩小到包围盒 |
| 核心 scale | `size * scale` | 仅 `size`（无 scale） | ⚠️ 当 scale≠1 时字号不一致 |
| ascent 计算 | `measureText.actualBoundingBoxAscent` | `metric.ascent` (可能是 `size*0.8` fallback) | ⚠️ ascent 来源不同 |

**水印 raster 的合理性**: 鉴于水印的核心实现本身也是位图 (`ctx.fillText`)，插件走 raster 路径**不会导致矢量退化** — 核心本身就不是矢量。关键是确保 raster 的像素比足够高，以及 Canvas→PNG 转换的色彩保真度。

**建议**:
1. 非重复水印的包围盒 raster 策略是合理的，保持当前方案
2. 重复水印的整页 raster 在 `pixelRatio=2` 下文件大小可控，但可以考虑分块 raster 以减小内存峰值
3. 注意 `scale` 参数的一致性 — 核心使用 `size * scale`，插件可能遗漏

---

### 3.5 LaTeX 渲染

#### 核心 (LaTexParticle.ts:10–39)
```typescript
// 继承自 ImageParticle
const width = element.width! * scale
const height = element.height! * scale
const img = new Image()
img.src = element.laTexSVG!  // SVG data URL
ctx.drawImage(img, x, y, width, height)
```

#### 插件 (latex.ts:31–77)
```typescript
const canvas = document.createElement('canvas')
canvas.width = Math.max(1, Math.ceil(asset.width))    // 无 pixelRatio
canvas.height = Math.max(1, Math.ceil(asset.height))
ctx.drawImage(image, 0, 0, canvas.width, canvas.height)
return {
  dataUrl: canvas.toDataURL('image/png'),
  sourceType: 'image',
  layer: 'content'
}
```

#### 差异分析

| 细节 | 核心 | 插件 | 差异 |
|------|------|------|------|
| 中间格式 | SVG → Image → Canvas drawImage | SVG → Image → Canvas → PNG → addImage | ⚠️ 多一层 PNG 转换 |
| 尺寸 | `width * scale`, `height * scale` | `Math.ceil(width)`, `Math.ceil(height)` | ⚠️ 缺少 scale 乘数 |
| pixelRatio | N/A (浏览器 Canvas DPI) | **1** (默认) | ❌ 放大时会失真 |
| SVG 矢量性 | SVG 被 Canvas 栅格化为屏幕 DPI | SVG 被 Canvas 栅格化为 1:1 | ❌ 损失了 SVG 矢量优势 |

**这是一个实际的矢量性问题**: LaTeX 的 SVG 原始数据是矢量的，核心将其渲染到屏幕 Canvas 时受益于浏览器的 DPI 缩放。但插件以 `pixelRatio=1` 栅格化到 Canvas 再转 PNG，在高分辨率屏幕或 PDF 放大时**会出现明显模糊**。

**建议**:
1. **方案A (最佳)**: 将 SVG 字符串直接嵌入 PDF。jsPDF 的 `svg` 插件或手动将 SVG path 转换为 PDF path 操作符，可保持完全矢量。
2. **方案B (快速)**: `pixelRatio` 提升到 3 或 4，`canvas.width = Math.ceil(asset.width * pixelRatio)`，与 CJK fallback 的 `DENSE_CJK_FALLBACK_PIXEL_RATIO=3` 对齐。

---

### 3.6 表格单元格文本

#### 核心

表格内文本由核心的通用 `drawRow()` 递归处理，对单元格内容使用与主文完全相同的排版流程。

#### 插件 (tableCellPlacement.ts:45–77)
```typescript
const { placementList, contentHeight } = createStyledTextRunPlacements({
  runList,
  x: option.x + 6,                          // 硬编码 6px 左 padding
  y: option.y,
  width: Math.max(0, option.cellWidth - 12), // 硬编码 12px 总 padding
  measureWidth: option.measureWidth
})
```

**差异**: 核心表格单元格内容的排版使用 `Draw` 的完整行计算流程，padding 由表格选项或默认值控制。插件**硬编码了 6px 左/右 padding**，如果核心使用不同的 padding 值，会导致单元格内文本位置偏移。

**建议**: 从 `documentModel` 中读取表格内边距配置，而非硬编码。

---

### 3.7 文本布局引擎

#### 核心

核心的行排版在 `Draw.computeRowList()` 中完成:
- 逐元素遍历，累加宽度
- 超过内宽时换行
- 使用 Canvas `measureText()` 获取精确宽度
- 行高由 `fontBoundingBoxAscent + fontBoundingBoxDescent` 决定

#### 插件 (styledTextRunPlacement.ts:184–319)

- 逐字符遍历 run list
- 逐字符测量宽度
- 超过 `option.width` 时换行
- 行高取所有 run 的 `lineHeight` 最大值
- baseline 取所有 run 的 `resolveRunBaseline()` 最大值

**差异分析**:
- 核心使用 `fontBoundingBox*` (font-level 度量)，插件使用 `actualBoundingBox*` (text-level 度量)
- `measureLineHeight` (textMeasure.ts:9-17) 用 `'中'` 字测量 `ascent+descent`，这与核心的 `fontBoundingBox` 不完全等价
- 核心有 word-wrap 逻辑 (`measureWord()`)，插件是纯字符级别换行

**建议**: 在测量逻辑中增加 `fontBoundingBox` 的使用，或对齐 `measureLineHeight` 的基准字符与核心一致。

---

### 3.8 CJK 文本 Fallback 机制

插件对"密集 CJK 文本行"实施了智能 raster fallback (layoutDocument.ts:1191–1300):

**触发条件** (`shouldRasterizeDenseCjkTextLine` + `shouldRasterizeContentTextLine`):
- 段落类型 (非超链接)
- CJK 字符占比 ≥ 60% 且长度 ≥ 20
- 或 header 中小字号 CJK (≤18px, 占比≥60%)
- 或混合脚本 (有字母、数字、其他字符混合且 CJK≥20%)
- 或短小 CJK 行 (≤24字符, ≤18px, CJK≥45%)
- 或有 baselineShift 的行

**Fallback 流程**:
1. 优先使用核心打印截图 (`printPageDataUrlList`) 裁剪对应区域
2. 否则使用 `rasterizeElement()` 在临时 Canvas 上重绘，`pixelRatio=3`
3. 重绘时包含 highlight 背景和 text decoration lines

**评估**: 这是一个合理的策略。jsPDF 的字体子集化和 CJK glyph 渲染与浏览器存在差异，raster fallback 在 `pixelRatio=3` 下质量足够。但 fallback 区域的坐标需要精确 — `resolvePlacementRasterBounds` 使用 `Math.floor/ceil` 做整数化，可能导致 ±1px 的边界差异。

---

### 3.9 浮动图片与环绕排版

#### 核心

核心在 `_drawFloat()` 中处理浮动图片，环绕排版在 `computeRowList()` 中通过 `pickSurroundElementList()` + 行宽调整实现。

#### 插件 (layoutDocument.ts:854–1189)

- `getActiveSurroundRectList()` 获取当前行范围内的环绕图片矩形
- `tryResolveSingleLineSurroundSplit()` 逐字符检查与环绕图片的碰撞
- 碰撞时将字符向右推移，超出行宽时溢出到图片下方
- `resolveOverflowFragmentContinuations()` 递归处理溢出部分

**评估**: 插件的环绕排版是独立实现的，逻辑完整。与核心的主要差异在于核心是行级调整，插件是字符级调整。可能导致换行位置不同。

---

## 4. 字体系统

#### 插件字体解析 (fontFamily.ts:10–21)

```typescript
export function resolvePdfFontFamily(doc, fontFamily, fallbackFontFamily = 'helvetica') {
  const candidate = fontFamily?.trim().toLowerCase()
  if (candidate && availableFonts.has(candidate)) {
    return fontFamily!
  }
  return fallbackFontFamily
}
```

- 如果请求的字体不在 jsPDF 已注册字体中，回退到 `helvetica`
- `bootstrapPdfFonts()` 负责加载自定义字体

**风险**: 如果核心使用的中文字体（如"微软雅黑"、"宋体"）未在 jsPDF 中注册，所有中文文本将回退到 helvetica，导致字形完全不同。这是 CJK fallback 必要性的根本原因之一。

---

## 5. 矢量性总结

以下列出 PDF 输出中各元素的矢量/位图属性及放大行为:

| 元素类型 | 输出格式 | 放大行为 | 改进方向 |
|---------|---------|---------|---------|
| 普通文本 | **矢量** (PDF Tj/TJ) | ✅ 不失真 | — |
| 超链接文本 | **矢量** | ✅ 不失真 | — |
| 列表 marker | **矢量** | ✅ 不失真 | — |
| 页码 | **矢量** | ✅ 不失真 | — |
| 行号 | **矢量** | ✅ 不失真 | — |
| 表格线 | **矢量** (PDF line) | ✅ 不失真 | 需解决坐标精度 |
| 页边框 | **矢量** | ✅ 不失真 | — |
| 下划线/删除线 | **矢量** (PDF line) | ✅ 不失真 | 需补充装饰样式 |
| 涂鸦线 | **矢量** | ✅ 不失真 | — |
| 高亮背景 | **矢量** (PDF rect) | ✅ 不失真 | — |
| 密集 CJK 文本 | **位图** (fallback) | ❌ 放大失真 | 提升 pixelRatio 或改进字体 |
| LaTeX | **位图** (PNG) | ❌ 放大失真 | 嵌入 SVG 或提高 pixelRatio |
| 文字水印 | **位图** (fallback) | ⚠️ 轻微失真 | pixelRatio=2 已缓解 |
| 普通图片 | **位图** (原始数据) | 取决于源图分辨率 | — |
| 签章 | **位图** | 取决于源图分辨率 | — |

---

## 6. 发现的具体 Bug 和不一致

### BUG-1: 表格线坐标缺少 Math.round() [高]

**位置**: `tableVisual.ts` `pushEdge()` 和 `createTableCellVisuals()`  
**问题**: 核心在 `_drawBorder` 中对坐标做 `Math.round(td.x * scale + startX)`，插件直接使用 `option.x` (来自 `layoutTable.ts` 的浮点累加)。在 `renderVector.ts` 的 `alignOddWidthAxisCoordinate` 中虽然做了 `Math.round(value)+0.5`，但浮点累加误差可能导致 round 方向不同。  
**修复**: 在 `tableVisual.ts` 的坐标生成阶段就对 `option.x`, `option.y`, `option.width`, `option.height` 做 `Math.round()` 整数化。

### BUG-2: LaTeX pixelRatio=1 [中]

**位置**: `latex.ts:43-45`  
**问题**: `canvas.width = Math.ceil(asset.width)` 无 pixelRatio 系数，1:1 栅格化导致放大失真。  
**修复**: 引入 `pixelRatio` 参数 (建议 3)，调整 canvas 尺寸和 drawImage 缩放。

### BUG-3: 下划线样式缺失 [中]

**位置**: `textDecoration.ts:4-32`  
**问题**: 仅生成实线下划线，核心支持 WAVY/DOUBLE/DASHED/DOTTED。  
**修复**: 补充对应的线条样式生成逻辑。

### BUG-4: 下划线 Y 坐标对齐不一致 [中]

**位置**: `textDecoration.ts:11`  
**问题**: 插件使用 `placement.y + 2`，核心使用 `Math.floor(y + 2*scale) + 0.5`。  
**修复**: 对齐核心的半像素策略。

### BUG-5: 删除线 Y 坐标计算方式不同 [低]

**位置**: `textDecoration.ts:20`  
**问题**: 插件使用 `placement.y - size*0.35` 估算行中部，核心通过 `recordFillInfo` 传入精确位置。  
**影响**: 不同字体 ascent/descent 比例下可能偏移 1-2px。

### BUG-6: 表格单元格 padding 硬编码 [低]

**位置**: `tableCellPlacement.ts:60-63`  
**问题**: `x: option.x + 6`, `width: option.cellWidth - 12` 硬编码 6px。  
**修复**: 从表格配置中读取 cell padding。

### BUG-7: 水印缺少 scale 系数 [低]

**位置**: `layoutDocument.ts:288-315`  
**问题**: 核心水印字号为 `size * scale`，插件使用 `watermark.size` 无 scale。当编辑器 `scale ≠ 1` 时字号不一致。  
**修复**: 在 raster 绘制中应用 `watermark.size * documentModel.scale`。

---

## 7. 建议优先级

### P0 — 当前最大视觉偏差

1. **BUG-1**: 表格线坐标 Math.round() 对齐
   - 预期收益: 直接消除 page2 表格热点的主因
   - 工作量: 小 (tableVisual.ts 修改)

### P1 — 矢量性保障

2. **BUG-2**: LaTeX pixelRatio 提升
   - 预期收益: LaTeX 公式在放大时不失真
   - 工作量: 小

3. **BUG-3**: 下划线装饰样式补齐
   - 预期收益: 与核心功能对齐
   - 工作量: 中

### P2 — 细节对齐

4. **BUG-4/5**: 下划线和删除线 Y 坐标对齐
5. **BUG-6**: 表格单元格 padding
6. **BUG-7**: 水印 scale

### P3 — 长期改进

7. LaTeX SVG 直接嵌入 PDF (完全矢量化)
8. 统一文本测量逻辑 (fontBoundingBox vs actualBoundingBox)
9. 减少 CJK fallback 范围 (改进 jsPDF 中文字体支持)

---

## 8. 结论

插件的独立排版引擎架构设计合理，已覆盖核心渲染链路的绝大部分模块。**普通文本、列表、页码、行号、页边框、涂鸦等元素已实现矢量输出**，满足放大缩小不失真的要求。

当前的主要差距集中在:
1. **表格线坐标精度** — 这是可通过小改动修复的 bug，而非架构缺陷
2. **LaTeX 栅格化精度** — pixelRatio 不足，修复简单
3. **下划线装饰样式缺失** — 功能缺口，需补充实现
4. **CJK 文本 fallback** — 这是架构层面的合理妥协，短期内无法完全消除

从"导出的 PDF 经 pdf.js 渲染后与核心 Canvas 打印图一致"的标准看，当前最值得投入的是 P0 的表格线修复和 P1 的 LaTeX pixelRatio 提升。

---

**审计人**: Claude Opus 4.6 (Anthropic)  
**审计方法**: 核心渲染路径与插件渲染路径逐模块源码审读对比  
**审计覆盖**: TextParticle / TableParticle / Watermark / LaTexParticle / ImageParticle / Underline / Strikeout / renderText / renderVector / renderImage / renderStage / layoutDocument / layoutTable / layoutFrame / tableVisual / tableCellPlacement / textDecoration / styledTextRunPlacement / blockSemantics / textMeasure / rasterizeElement / resolveFallback / framePlacement / latex / normalizeDocument / readEditorState / renderPdf / fontFamily / Draw._drawPage
