# jsPDF Plugin

`src/plugins/jspdf` 提供基于 `jspdf` 的 PDF 导出能力。

当前实现的重点不是在插件侧重新做一套完整打印布局，而是直接消费编辑器核心的打印布局结果：

- 读取核心布局快照 `getLayoutSnapshot()`
- 使用核心 `pageRowList` / position 列表决定分页、行位置和页眉页脚位置
- 插件自己用 jsPDF 绘制文本、线条和文档内图片，不再读取核心整页图片导出

这条链路的目标是尽量让 PDF 结果与核心打印结果保持一致，降低内容变化后反复调版的成本。

## 安装与注册

```ts
import Editor from '../../editor'
import { jspdfPlugin, type CommandWithJspdf } from './index'
import simsunTtfUrl from '../../assets/fonts/simsun.ttf'
import simheiTtfUrl from '../../assets/fonts/simhei.ttf'

const editor = new Editor(container, options)

editor.use(jspdfPlugin, {
  fonts: {
    SimSun: {
      normal: simsunTtfUrl,
      bold: simheiTtfUrl
    }
  },
  defaultFontFamily: 'SimSun'
})

const pdfBase64 = await (editor.command as CommandWithJspdf)
  .executeExportPdfBase64()
```

## 插件注入的命令

注册后，插件会向 `editor.command` 注入两个方法：

- `executeExportPdfBase64(payload?)`
  返回不带 Data URI 前缀的 PDF Base64 字符串。
- `executeExportPdfDiagnostics(payload?)`
  返回导出诊断信息，用于查看页数、布局告警和 fallback 信息。

## 可用选项

`jspdfPlugin(editor, options)` 与导出时的 `payload` 都支持以下字段：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `fonts` | `Record<string, string \| Partial<{ normal; bold; italic; bolditalic }>>` | 注册 PDF 字体。值通常是通过打包器导入后的字体 URL。 |
| `defaultFontFamily` | `string` | 默认字体族。未传时会回退到内置的 `Song`。 |
| `debug` | `boolean` | 打开后会输出字体注册告警，并把布局告警、空页、fallback 等问题尽早转成异常。 |
| `disableTextRasterFallback` | `boolean` | 是否禁用文本栅格 fallback。默认 `true`。 |
| `mode` | `EditorMode` | 目前导出只支持 `EditorMode.PRINT`。 |
| `paperDirection` | `PaperDirection` | 指定 PDF 方向。未传时按页面宽高自动判断。 |

说明：

- `mode` 默认就是 `EditorMode.PRINT`，传其他模式会直接抛错。
- 导出依赖核心 `getLayoutSnapshot()`，缺少核心布局快照时会直接报错。

## 推荐用法

### 1. 正常导出

```ts
const pdfBase64 = await (editor.command as CommandWithJspdf)
  .executeExportPdfBase64({
    disableTextRasterFallback: true
  })
```

### 2. 导出前做诊断

```ts
const diagnostics = await (editor.command as CommandWithJspdf)
  .executeExportPdfDiagnostics({
    debug: true
  })

console.log(diagnostics.pageCount)
console.log(diagnostics.layoutWarnings)
console.log(diagnostics.fallbackBlocks)
```

## 关键约束

### 只支持 PRINT 导出

`executeExportPdfBase64()` 内部会强制校验 `mode === EditorMode.PRINT`。如果你传入其他模式，会收到：

```txt
PDF export currently requires print mode layout
```

### 页面尺寸和排版来自核心布局结果

PDF 的纸张尺寸来自 `pageModel.width` / `pageModel.height`，最终会按 `72 / 96` 从 CSS 像素换算为 jsPDF 的点值。

插件会消费核心布局快照生成 PDF 页面，因此：

- 页数优先与核心打印结果保持一致
- 行位置、页眉页脚高度优先与核心布局保持一致
- 页面大小优先与编辑器中的纸张设置保持一致
- 不会把核心 canvas 整页图片作为 PDF 页面背景

### 仍然保留插件自己的归一化与渲染管线

当前导出链路仍然会经过这些阶段：

1. `readEditorState`
2. `normalizeDocument`
3. `layoutDocument`
4. `renderPdfBase64`

`layoutDocument()` 会基于核心布局快照生成 page model，而不是重新做主内容分页。

## 字体建议

- 优先使用项目内本地字体资源，不要依赖不稳定的远程字体 URL。
- 如果只传一个字符串，插件会把它当作该字体族的 `normal` 样式。
- 如果 `SimSun.bold` 已注册，插件会自动补一个 `SimHei` 别名，方便粗体命中。

## 排查建议

- 导出报错先看是否误传了非 `PRINT` 模式。
- 中文、粗体、斜体异常先检查 `fonts` 是否完整注册。
- 怀疑布局偏差时，先跑 `executeExportPdfDiagnostics({ debug: true })`。
- 需要看实际接入方式时，参考仓库里的 `src/main.ts` 演示代码。
