# jsPDF Core Layout Consumption Design

## Goal

将当前 `jspdf` 插件从“插件内部独立完成布局计算”切换为“直接消费核心
print 布局结果”，尽可能保证 PDF 导出分页、正文区块位置、表格跨页、
header/footer 挤压关系与核心打印保持一致，同时尽量降低 jsPDF
字体测量、缺字、字符间距等渲染细节对布局结果的反向影响。

## Background

当前 `jspdf` 插件走的是独立链路：

- `readEditorState()`
- `normalizeDocument()`
- `layoutDocument()`
- `renderPdfBase64()`

其中 `layoutDocument()` 会重新完成：

- 正文换行
- 正文分页
- header/footer/main 的 frame 布局
- 表格布局与跨页处理
- 控件边框与部分 block 的定位

核心打印则不是这套逻辑。核心打印的链路是：

- 切换到 `PRINT` 模式
- 使用编辑器原生 `Draw` 完成布局和 canvas 渲染
- 直接导出每页图像用于浏览器打印

因此当前 `jspdf` 导出和核心打印属于两套不同的布局引擎。demo 数据可能看起来
接近，但一旦内容复杂度上升，容易在以下方面发生偏移：

- 页数变化
- 分页点变化
- 表格跨页位置变化
- header/footer 对正文区挤压不一致
- 控件、图片、浮动内容位置漂移

## Non-Goals

本次不做以下事情：

- 不做编辑器核心代码的大规模结构重构
- 不追求一次性消除所有 PDF 渲染细节差异
- 不通过大量精细单测覆盖所有布局场景
- 不要求所有复杂 block 在第一轮都实现纯矢量化

本次优先目标是：

- 插件主链路切到核心布局结果
- 自动化验证保证代码正确与基础业务可运行
- 视觉与效果差异以后续人工验证为主

## Decision

### Core Principle

布局由核心决定，PDF 只负责把核心已经决定好的布局忠实映射到 jsPDF。

### Chosen Approach

选择“全链路消费核心布局结果”的方案，不再让 `jspdf` 插件自己主导正文、
分页、frame 和表格布局计算。

具体来说：

1. 插件导出前强制基于 `PRINT` 模式读取核心布局结果
2. 插件直接读取核心已经计算好的页级和区域级布局信息
3. 插件把这些核心结果转换成 `page model`
4. jsPDF 渲染层只消费 `page model`
5. jsPDF 的字体、字距、缺字等问题只能影响绘制细节，不能再影响分页和块位置

## Design

### 1. Core Layout Snapshot Source

插件内部新增“核心布局快照读取层”，职责是从当前编辑器实例中读取导出所需的
print 布局结果。

此快照层需要读取的信息包括但不限于：

- `pageRowList`
- header 的 `rowList`
- footer 的 `rowList`
- header 额外高度
- footer 额外高度
- 页面尺寸与 page count
- main 区域外边距信息
- badge 状态
- graffiti 数据
- print 图像快照
- iframe 信息

该层不做新的布局计算，只做读取、组装和导出适配。

### 2. Layout Responsibility Transfer

当前 `layoutDocument()` 承担的是“独立 PDF 布局引擎”角色。改造后其职责收缩为：

- 根据核心已生成的页级结果构建 PDF 用 `page model`
- 将核心布局中的文本、图片、表格、控件、装饰信息映射为：
  - `textRuns`
  - `highlightRects`
  - `vectorLines`
  - `links`
  - `rasterBlocks`

也就是说，`layoutDocument()` 从 layout engine 变成 layout adapter。

### 3. Full-Chain Switching Scope

本次全链路切换要求以下部分全部改为以核心结果为准。

#### Main

- 正文换行
- 正文分页
- 表格分页
- 表格单元格文本布局
- 控件在正文中的位置
- 列表、超链接、上下标、装饰线等所在位置

这些内容在插件内不再重新决定布局，只能映射已有核心行、页结果。

#### Header / Footer

- 不再在插件中重新计算 header/footer 自身布局
- 直接消费核心 header/footer 的 `rowList`
- header/footer 对 main 区域的挤压关系，以核心 `extraHeight` 和核心页布局为准

#### Line Number

- 不再从插件自己的文本 placement 反推行号基线
- 基于核心每页真实 row 顺序和基线位置生成行号

#### Badge / Graffiti

- 继续保留插件输出
- 位置锚点改为核心页框、核心区域结果
- 不参与正文布局决策

### 4. Decoration Layers

以下内容允许保留插件侧生成逻辑，但只能作为页面装饰层存在，不能反向参与布局：

- page number
- watermark
- page border
- background
- background image

也就是说，它们可以继续由插件公式生成，但只能依赖核心已经确定的：

- 页大小
- 页数
- frame 边界
- 页面区域位置

### 5. High-Risk Content Strategy

对于以下高风险内容，第一轮不在插件里继续硬算布局：

- iframe / video / browser-native block
- 某些 jsPDF 字体缺字导致宽度异常的文本片段
- 内部依赖 DOM 的复杂 block

这些内容遵循如下原则：

1. 优先使用核心 print 快照裁剪结果
2. 允许保留 raster fallback
3. fallback 只能作为渲染兜底，不能作为分页依据

原则是：

宁可局部退化为位图，也不允许插件再次主导分页和区块位置。

## Expected Outcomes

改造完成后，预期达到以下结果：

- 同一份内容下，核心打印与 PDF 导出的页数一致
- 主体内容分页点一致
- 表格跨页切分点一致
- header/footer 挤压 main 的结果一致
- 内容变化后，不需要再依赖 `measureText` 调整、magic number 或局部修补去追分页

## Risks

### 1. Core Layout Snapshot Detail May Be Insufficient

核心当前暴露的数据可能不足以直接完成某些 PDF 映射，尤其是复杂 block 和部分
页面装饰锚点。

应对方式：

- 优先读取现有核心结果
- 不足部分通过最小补充接口或快照字段解决
- 不回退到插件内部重新做完整布局

### 2. jsPDF Rendering Differences Still Exist

即使布局完全跟随核心，jsPDF 侧仍然可能出现：

- 缺字
- 字距差异
- 字体测量偏差
- 图片和 SVG 处理差异

应对方式：

- 将这些问题限制在渲染层
- 允许局部 fallback
- 不允许这些问题反向影响分页

### 3. Transitional Period May Leave Double Paths

改造过程中可能暂时出现：

- 一部分内容走核心布局适配
- 一部分内容仍走旧的插件布局逻辑

应对方式：

- 优先切 `main`
- 再切 `header/footer/line number`
- 最后处理 `badge/graffiti/fallback`
- 改造结束后不保留新的双轨布局路径

## Verification Strategy

本次验证采用轻量策略，不增加大量细粒度布局断言测试。

自动化验证只要求覆盖：

- `typecheck` 无错误
- `lint` 无错误
- 现有 `jspdf` runtime / 导出命令可执行
- PDF 可正常导出
- 主链路无新的致命异常

人工验证负责：

- 导出效果
- 页数和分页点是否合理
- 页面视觉一致性
- 复杂场景下的结果对比

## Implementation Direction

本次实现按如下方向推进：

1. 保留现有 `jspdf` 插件入口与渲染后端
2. 优先新增核心布局快照读取能力
3. 将 `main` 布局改为消费核心 `pageRowList`
4. 将 `header/footer` 与主区域 frame 改为消费核心结果
5. 调整 `line number` 生成方式，改为绑定核心 row
6. 将 badge/graffiti/fallback 调整到新的页级坐标体系
7. 清理仍然主导正文分页的旧插件布局逻辑

## Acceptance Criteria

本次改造完成的判定标准是：

- 插件不再自行主导正文分页
- 全链路导出基于核心 print 布局结果
- 自动化验证通过：
  - `npm run type:check`
  - `npm run lint`
  - 相关 `jspdf` 运行验证脚本可执行
- 导出 PDF 基础业务正常，不出现新的致命错误
- 后续可通过人工联调验证实际效果
