# jsPDF Plugin Design

## Goal

Add a new `jspdf` plugin for `canvas-editor` that exports the current
document as a PDF base64 string through jsPDF while preserving selectable
text and vector quality where practical.

The plugin must reference the editor's existing print and draw behavior to
understand page layout and rendering rules, but it must not reuse the current
browser-print implementation in `src/editor/utils/print.ts`.

## Scope

### In scope

- Add a plugin under `src/plugins/jspdf/`
- Extend `editor.command` with a new async export command
- Return a pure PDF base64 string without a Data URL prefix
- Support configurable font URLs through a `fontFamily -> url` mapping
- Include a built-in default Song font fallback for testing
- Reconstruct PDF output from editor layout and drawing data instead of
  page screenshots
- Output real text instructions for supported text-like content
- Output vector graphics for supported lines, borders, and decorations
- Degrade unsupported or high-complexity elements into raster blocks

### Out of scope for the first version

- Full parity for every editor particle type
- Perfect byte-for-byte visual parity with canvas rendering
- Editable PDF form controls
- Embedded browser/iframe block replay inside the PDF
- Full native export for LaTeX and other complex block renderers

## Supported export behavior

### Exported as real text / vector

- Plain text
- Titles
- Ordered and unordered lists
- Hyperlinks
- Underline
- Strikeout
- Highlight backgrounds
- Table borders
- Table cell text
- Simple separators and other line-like decorations that can be mapped to
  jsPDF vector APIs

### Exported as raster fallbacks

- Image elements
- LaTeX particles
- Complex controls
- Custom block content
- iframe-backed content
- Any element whose exact geometry or semantics cannot be stably mapped to
  jsPDF in the first version

## Design constraints

### Plugin integration

The project plugin system is intentionally lightweight:

- `editor.use(plugin, options)` calls a plugin function with the `Editor`
  instance
- Existing plugins extend behavior by overriding or appending methods on
  `editor.command`

The new plugin will follow the same shape:

- Export `jspdfPlugin(editor, options)`
- Add a new command method, tentatively
  `executeExportPdfBase64(payload?): Promise<string>`

The plugin must not require changes to the editor core plugin framework.

### Export API

The plugin should expose two layers of configuration:

1. Plugin defaults configured at `editor.use(jspdfPlugin, options)`
2. Per-export overrides configured at the command call site

Planned option shape:

- `fonts?: Record<string, string>`
- `defaultFontFamily?: string`
- `pixelRatio?: number`
- `fallbackFontFamily?: string`
- `debug?: boolean`

The first version should keep the public surface small and only expose options
that are actually used by the implementation.

### Return value

The export command returns:

- A pure base64 string for the generated PDF
- No `data:application/pdf;base64,` prefix

## Architecture

The implementation should be split into five logical layers inside the plugin.

### 1. Command extension layer

Responsible for:

- Attaching the new export command to `editor.command`
- Merging plugin defaults with call-time options
- Translating command failures into clear export errors

### 2. Layout extraction layer

Responsible for:

- Reading current page size, page direction, and scale-related options
- Locating stable page/row/element layout data from the editor draw pipeline
- Producing a page-oriented intermediate export model

This layer must be informed by the existing draw and print flow, especially the
same assumptions used to produce print-ready page data, but it should not rely
on page screenshots as the primary export format.

### 3. PDF intermediate model

The plugin should normalize editor output into explicit export objects so that
jsPDF writing does not depend on ad hoc branching scattered across the code.

Suggested export model categories:

- `PdfTextRun`
- `PdfLinkRun`
- `PdfHighlightRect`
- `PdfDecorationLine`
- `PdfVectorLine`
- `PdfTableCell`
- `PdfRasterBlock`

This intermediate model is the boundary between editor layout semantics and
jsPDF drawing instructions.

### 4. Resource layer

Responsible for:

- Loading custom fonts from configured URLs
- Caching fetched font binaries
- Registering fonts with jsPDF
- Falling back to a built-in Song font when custom fonts are absent or fail
- Preparing raster resources for fallback blocks

### 5. jsPDF rendering layer

Responsible for:

- Creating the document with the correct page size and orientation
- Writing text as text, not as images
- Writing borders, lines, and highlights with vector primitives
- Writing fallback blocks as images only where needed
- Returning the final PDF as pure base64

## Data flow

1. The caller runs `editor.use(jspdfPlugin, pluginOptions)`
2. The plugin attaches `executeExportPdfBase64`
3. The caller executes the command with optional overrides
4. The command reads editor options and current layout state
5. The plugin builds a page-based intermediate export model
6. The plugin resolves fonts and registers them with jsPDF
7. The plugin renders each page in order
8. The plugin serializes the final PDF and strips the Data URL prefix if needed
9. The command resolves with a pure base64 string

## Layout extraction strategy

The implementation must study the existing editor rendering pipeline before
writing any export code. The goal is to reuse the editor's layout knowledge,
not to invent a parallel pagination engine from scratch.

Expected reading targets include:

- `src/editor/core/draw/Draw.ts`
- Page and row layout structures used by the draw pipeline
- Text particle rendering modules
- Table rendering modules
- Decoration rendering modules
- Existing print mode behavior in `CommandAdapt.print` and `Draw.getDataURL`

The first implementation should prefer reading already-computed layout output
from draw state. Only if necessary should the code add narrowly scoped helper
methods to expose stable geometry required by the plugin.

The implementation should avoid broad invasive changes in the editor core.

## Coordinate and page model

The plugin must preserve document pagination and paper geometry:

- Respect page width and height from editor options
- Respect paper direction
- Respect the editor's print-oriented layout assumptions where relevant
- Use consistent unit conversion between canvas/editor coordinates and jsPDF
  coordinates

If jsPDF uses different default units, the plugin should define a single,
central conversion path and avoid repeated implicit conversions.

## Text export requirements

For text-like content, the plugin should:

- Export actual text content so it remains selectable in PDF readers
- Preserve font family, size, weight, color, and decoration where supported
- Preserve hyperlinks as clickable links where possible
- Preserve title and list semantics through layout and style mapping

The first version may approximate some fine-grained canvas text behavior
provided it keeps text selectable and visually stable.

## Vector export requirements

For vector-compatible content, the plugin should:

- Render borders and separator lines using jsPDF vector APIs
- Render underline and strikeout using line primitives
- Render text highlights as filled rectangles
- Render table cell borders and backgrounds with vector primitives when
  available

This ensures zooming does not blur simple line and decoration content.

## Raster fallback strategy

Unsupported content must fail soft, not hard.

For unsupported elements:

- Convert the minimal required region into an image block
- Position the image block precisely on the target page
- Keep raster fallback local to the unsupported content instead of degrading
  the whole page

If element-local raster extraction is too difficult in the first version, the
fallback may temporarily use larger bounded regions, but the design target is
localized fallback.

## Font strategy

The plugin must support custom font configuration because PDF text output is
only useful if glyph rendering is correct.

### Configuration behavior

- Accept `fonts: Record<string, string>`
- Keys are editor font family names
- Values are network font URLs

### Fallback behavior

- Include a built-in Song font alias for testing
- Use the built-in Song font when the configured font is missing
- Use the built-in Song font when the configured font fails to load or parse

### Operational behavior

- Fonts should be fetched lazily and cached
- Registration with jsPDF should happen once per font/style combination
- Export should remain successful even if some configured fonts fail

## Error handling

The plugin must fail clearly when export cannot proceed:

- Invalid editor state should produce a descriptive error
- Font loading failures should fall back when possible
- Unsupported hard failures in jsPDF should surface context about the page
  and element type being exported

The plugin should not silently return malformed or empty PDF output.

## Testing strategy

### Automated verification

At minimum:

- `npm run lint`
- `npm run type:check`

If feasible within the repository's current testing patterns, add focused tests
for:

- Command type extension
- Option merging
- Base64 return normalization
- Font fallback behavior

### Manual verification

Prepare a local usage path that:

- Mounts the editor
- Installs the `jspdf` plugin
- Calls the export command
- Confirms the output begins with a valid PDF payload when base64-decoded
- Confirms selected supported text remains selectable in a PDF viewer
- Confirms vector borders and decorations stay crisp when zoomed

## Risks and mitigation

### Risk: layout data is not exposed cleanly

Mitigation:

- Add focused helper accessors near existing draw/layout code only where
  necessary
- Avoid broad refactors during the first implementation

### Risk: canvas text layout and PDF text metrics differ

Mitigation:

- Start with the most stable text cases first
- Keep a clear fallback path for complex segments
- Centralize coordinate and width calculations

### Risk: unsupported particles expand scope too quickly

Mitigation:

- Enforce the agreed first-version support matrix
- Degrade unsupported content to localized raster blocks

### Risk: font loading is brittle across environments

Mitigation:

- Cache downloads
- Make failure explicit in debug mode
- Always keep the built-in Song fallback available

## Implementation sequence

1. Inspect draw/layout internals needed for export
2. Finalize plugin command and option types
3. Add jsPDF dependency
4. Build the intermediate PDF export model
5. Implement font loading and fallback
6. Implement text export
7. Implement vector decorations and table borders
8. Implement raster fallback for unsupported content
9. Return pure PDF base64
10. Run lint and type checks

## Acceptance criteria

The first version is complete when all of the following are true:

- A new `jspdf` plugin can be installed through `editor.use`
- The plugin adds a command that returns a pure PDF base64 string
- Supported text content exports as selectable text
- Supported lines, highlights, and table borders export as vector graphics
- Unsupported complex content degrades without aborting the export
- Font URL mapping is supported
- Built-in Song fallback works without custom font configuration
- The code passes lint and TypeScript checks
