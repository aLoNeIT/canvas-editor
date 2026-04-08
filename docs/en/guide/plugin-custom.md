# Custom Plugin

::: tip
Official plugin: https://github.com/Hufe921/canvas-editor-plugin
:::

## Write a Plugin

```javascript
export function myPlugin(editor: Editor, options?: Option) {
  // 1. update，see more：src/plugins/copy
  editor.command.updateFunction = () => {}

  // 2. add，see more：src/plugins/markdown
  editor.command.addFunction = () => {}

  // 3. listener, eventbus, shortcut, contextmenu, override...
}
```

## Use Plugin

```javascript
instance.use(myPlugin, options?: Option)
```

## jsPDF Plugin Example

```javascript
import { jspdfPlugin } from '../../src/plugins/jspdf'
import simsunTtfUrl from '../../src/assets/fonts/simsun.ttf'

instance.use(jspdfPlugin, {
  fonts: {
    SimSun: simsunTtfUrl
  }
})
```

### jsPDF Plugin Notes

- `jspdfPlugin` owns an independent layout engine for document normalization, pagination, layout, and PDF rendering
- The editor core only exposes neutral read-only capabilities such as `getValue()` and `getOptions()`
- The core no longer exposes any PDF-specific API and does not provide `getPdfExportSnapshot`
- Register fonts from local assets (for example `src/assets/fonts/simsun.ttf`) instead of remote font URLs

```javascript
import { jspdfPlugin, type CommandWithJspdf } from '../../src/plugins/jspdf'
import simsunTtfUrl from '../../src/assets/fonts/simsun.ttf'

instance.use(jspdfPlugin, {
  fonts: {
    SimSun: simsunTtfUrl
  }
})

const pdfBase64 = await (instance.command as CommandWithJspdf)
  .executeExportPdfBase64()

const diagnostics = await (instance.command as CommandWithJspdf)
  .executeExportPdfDiagnostics({
    debug: true
  })

console.log(diagnostics.pageCount)
console.log(diagnostics.layoutWarnings)
console.log(diagnostics.fallbackBlocks)
```
