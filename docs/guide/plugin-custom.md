# 自定义插件

::: tip
官方维护插件仓库：https://github.com/Hufe921/canvas-editor-plugin
:::

## 开发插件

```javascript
export function myPlugin(editor: Editor, options?: Option) {
  // 1. 修改方法，详见：src/plugins/copy
  editor.command.updateFunction = () => {}

  // 2. 增加方法，详见：src/plugins/markdown
  editor.command.addFunction = () => {}

  // 3. 事件监听、快捷键、右键菜单、重写方法等组合处理
}
```

## 使用插件

```javascript
instance.use(myPlugin, options?: Option)
```

## jsPDF 插件示例

```javascript
import { jspdfPlugin } from '../../src/plugins/jspdf'

instance.use(jspdfPlugin, {
  fonts: {
    SimSun: 'https://example.com/fonts/simsun.ttf'
  }
})
```

### jsPDF 插件说明

- `jspdfPlugin` 自己维护 PDF 导出的文档归一化、分页、排版和渲染流程
- 核心只提供通用只读能力，例如 `getValue()` 和 `getOptions()`
- 核心不提供任何 PDF 专用接口，也不再暴露 `getPdfExportSnapshot`

```javascript
import { jspdfPlugin, type CommandWithJspdf } from '../../src/plugins/jspdf'

instance.use(jspdfPlugin, {
  fonts: {
    SimSun: 'https://example.com/fonts/simsun.ttf'
  }
})

const pdfBase64 = await (instance.command as CommandWithJspdf)
  .executeExportPdfBase64()

const diagnostics = await (instance.command as CommandWithJspdf)
  .executeExportPdfDiagnostics({
    debug: true
  })
```
