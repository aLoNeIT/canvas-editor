# jsPDF Plugin

`src/plugins/jspdf` 提供基于 `jspdf` 的 PDF 导出能力。

当前实现的重点不是在插件侧重新做一套完整打印布局，而是尽量直接消费编辑器核心的打印结果：

- 先读取核心打印页图片 `editor.command.getImage({ mode: PRINT })`
- 再读取核心布局快照 `getLayoutSnapshot()`
- 当核心打印页快照可用时，插件会直接按核心页尺寸生成 PDF 页面

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
- `__printPageDataUrlList` 是插件内部字段，不建议外部传入。

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

### 页面尺寸来自核心布局结果

PDF 的纸张尺寸来自 `pageModel.width` / `pageModel.height`，最终会按 `72 / 96` 从 CSS 像素换算为 jsPDF 的点值。

在核心打印页快照可用的情况下，插件会直接把整页打印结果作为页面背景放进 PDF，因此：

- 页数优先与核心打印结果保持一致
- 页面大小优先与编辑器中的纸张设置保持一致
- 内容变化后的分页差异会明显小于“插件自己单独重排一遍”的方案

### 仍然保留插件自己的归一化与渲染管线

当前导出链路仍然会经过这些阶段：

1. `readEditorPrintPageDataUrlList`
2. `readEditorState`
3. `normalizeDocument`
4. `layoutDocument`
5. `renderPdfBase64`

但在核心打印页快照存在时，`layoutDocument()` 会优先走核心快照页面，而不是重新做主内容分页。

## 字体建议

- 优先使用项目内本地字体资源，不要依赖不稳定的远程字体 URL。
- 如果只传一个字符串，插件会把它当作该字体族的 `normal` 样式。
- 如果 `SimSun.bold` 已注册，插件会自动补一个 `SimHei` 别名，方便粗体命中。

## 排查建议

- 导出报错先看是否误传了非 `PRINT` 模式。
- 中文、粗体、斜体异常先检查 `fonts` 是否完整注册。
- 怀疑布局偏差时，先跑 `executeExportPdfDiagnostics({ debug: true })`。
- 需要看实际接入方式时，参考仓库里的 `src/main.ts` 演示代码。
