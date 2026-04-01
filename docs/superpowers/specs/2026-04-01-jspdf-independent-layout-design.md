# jsPDF Independent Layout Plugin Design

## Goal

Replace the current snapshot-driven jsPDF export approach with a plugin-owned
layout and pagination engine that reproduces the editor's visual output as
closely as possible while keeping PDF-specific behavior out of the editor core.

The plugin must own:

- document normalization
- text measurement
- inline and block layout
- pagination
- PDF rendering
- localized raster fallback handling

The editor core must not expose any PDF-specific interfaces, commands, or data
structures.

## Confirmed Product Constraints

The design is based on these confirmed constraints:

- Completely abandon the current PDF snapshot-driven architecture
- Build an independent layout engine inside the `jspdf` plugin
- Prioritize visual consistency with the existing canvas renderer
- Allow only minimal core changes
- Allow only general-purpose read-only core accessors
- Do not add any PDF-specific core API, type, or command
- Use browser canvas and `TextMetrics` as the text measurement baseline
- Target near-full content coverage in the first version
- For complex content, prefer native layout and native rendering first
- Allow raster fallback only for the smallest local region that cannot be
  reproduced reliably
- Never rasterize a whole page because of a local unsupported feature

## Non-Goals

The first version does not guarantee:

- byte-for-byte parity with canvas output
- zero fallback in every document
- editable PDF controls
- elimination of all browser-environment assumptions
- a reusable core layout refactor for non-PDF consumers

## Why the Current Direction Must Be Replaced

The current `5d30670` implementation introduces PDF-specific core concepts such
as `getPdfExportSnapshot()` and `IPdfExportSnapshot`, then lets the plugin
consume core-owned pagination data. That approach conflicts with the target
architecture for three reasons:

1. It leaks PDF semantics into the editor core.
2. It makes the plugin dependent on private or semi-private draw internals.
3. It prevents the plugin from being the owner of pagination and layout rules.

Under the approved direction, the plugin is no longer a PDF serializer over
core layout output. It becomes a separate renderer that shares only public,
general-purpose editor data.

## Architecture Overview

The final architecture is a dual-engine model:

- The existing editor core continues to own interactive canvas editing and
  canvas rendering.
- The `jspdf` plugin owns a second, export-only layout engine.
- Both engines consume the same document semantics and editor options.
- The plugin does not read page caches, row caches, position caches, or any
  PDF-specific core snapshot.

### High-Level Flow

1. Caller installs `jspdfPlugin(editor, pluginOptions)`
2. Caller executes `executeExportPdfBase64(exportOptions?)`
3. Plugin reads general editor state through non-PDF public accessors
4. Plugin normalizes document data into its own internal model
5. Plugin measures text and objects using browser canvas primitives
6. Plugin performs its own layout and pagination
7. Plugin resolves localized raster fallback only where necessary
8. Plugin renders the resulting page model with jsPDF
9. Plugin returns a pure PDF base64 string

## Allowed Core Changes

Core changes are intentionally constrained.

Allowed:

- exposing existing general-purpose read-only data that the plugin cannot
  currently access through stable public APIs
- exposing existing configuration or document state through neutral naming
- exposing already-existing data in a read-only form

Not allowed:

- any `Pdf`, `PDF`, `ExportPdf`, or `jspdf` naming in core APIs
- exposing draw page lists, row lists, cached positions, or any renderer-owned
  pagination internals
- changing core architecture to revolve around the plugin
- extracting or refactoring large layout subsystems in the first phase

### Acceptable Examples

- a general getter for full editor data, if one does not already exist
- a general getter for merged editor options relevant to layout
- a general getter for non-PDF frame configuration

### Unacceptable Examples

- `getPdfExportSnapshot()`
- `IPdfExportSnapshot`
- `executeExportPdfBase64()` behavior implemented partly in core
- any core method that returns precomputed pagination for PDF export

## Plugin Responsibilities

The plugin owns all export-specific behavior:

- layout ownership
- pagination ownership
- fallback ownership
- PDF rendering ownership
- diagnostics ownership

The plugin must not depend on the canvas renderer's computed page output.

## Internal Plugin Modules

The plugin should be reorganized into narrowly scoped modules.

### 1. Source Layer

Suggested files:

- `src/plugins/jspdf/source/readEditorState.ts`

Responsibilities:

- read general editor data and options
- read plugin options
- resolve export-time overrides
- produce a neutral input payload for normalization

This layer is the only place allowed to touch editor public APIs.

### 2. Model Layer

Suggested files:

- `src/plugins/jspdf/model/document.ts`
- `src/plugins/jspdf/model/layout.ts`

Responsibilities:

- define plugin-owned semantic document types
- define measured inline and block types
- define page output structures consumed by jsPDF rendering

Suggested plugin structures:

- `DocumentModel`
- `ZoneModel`
- `BlockModel`
- `InlineModel`
- `MeasuredInline`
- `MeasuredBlock`
- `PageModel`
- `FallbackBlock`
- `LayoutDiagnostic`

### 3. Normalize Layer

Suggested files:

- `src/plugins/jspdf/normalize/normalizeDocument.ts`
- `src/plugins/jspdf/normalize/normalizeTable.ts`
- `src/plugins/jspdf/normalize/normalizeControl.ts`

Responsibilities:

- normalize `header`, `main`, and `footer`
- apply default values and style compensation rules
- normalize title, list, hyperlink, separator, table, image, date, label,
  control, area, block, LaTeX, graffiti, watermark, and frame content
- isolate plugin layout from raw editor object shape differences

The output of normalization becomes the canonical plugin document.

### 4. Measure Layer

Suggested files:

- `src/plugins/jspdf/measure/textMeasure.ts`
- `src/plugins/jspdf/measure/fontRegistry.ts`
- `src/plugins/jspdf/measure/objectMeasure.ts`

Responsibilities:

- use browser canvas and `TextMetrics` as the primary measurement source
- compute text width, ascent, descent, line-height-compatible metrics
- compute decoration positions
- measure list prefixes, title offsets, superscript/subscript shifts
- produce stable metrics for layout

This layer does not paginate.

### 5. Layout Layer

Suggested files:

- `src/plugins/jspdf/layout/layoutInline.ts`
- `src/plugins/jspdf/layout/layoutBlock.ts`
- `src/plugins/jspdf/layout/layoutTable.ts`
- `src/plugins/jspdf/layout/layoutFrame.ts`
- `src/plugins/jspdf/layout/paginate.ts`

Responsibilities:

- perform line breaking
- perform block stacking
- lay out header and footer independently from main content
- place backgrounds, page borders, watermarks, page numbers, and line numbers
- paginate main content into pages
- split tables and large blocks across pages where needed
- maintain stable coordinates for later PDF rendering

This layer is the main fidelity boundary.

### 6. Fallback Layer

Suggested files:

- `src/plugins/jspdf/fallback/resolveFallback.ts`
- `src/plugins/jspdf/fallback/rasterizeElement.ts`

Responsibilities:

- identify the smallest unsupported render region
- rasterize only that region
- preserve native page flow and native neighboring content
- record fallback diagnostics

Fallback is a local repair mechanism, not a layout strategy.

### 7. Render Layer

Suggested files:

- `src/plugins/jspdf/render/renderPdf.ts`
- `src/plugins/jspdf/render/renderText.ts`
- `src/plugins/jspdf/render/renderVector.ts`
- `src/plugins/jspdf/render/renderImage.ts`

Responsibilities:

- create the jsPDF document
- render text as text
- render lines, borders, backgrounds, and simple shapes as vectors
- render images and fallback regions at resolved coordinates
- serialize pure base64 output

### 8. Debug Layer

Suggested files:

- `src/plugins/jspdf/debug/collectDiagnostics.ts`
- `src/plugins/jspdf/debug/assertNoFallback.ts`

Responsibilities:

- track unsupported constructs
- track font substitutions
- track fallback use
- surface strict failures when `debug` is enabled

## Data Flow

The plugin must use the following data flow.

### Step 1: Read Editor State

The plugin reads only neutral editor state:

- document content
- page geometry
- margins
- frame-related options
- scale-related options needed to reproduce visual sizing
- plugin font and debug options

It must not read:

- computed page row lists
- computed position lists
- draw-owned caches
- PDF-specific snapshots

### Step 2: Normalize Document

Normalization converts editor input into stable plugin structures:

- unify header, main, and footer zones
- flatten and normalize inline styles
- normalize complex elements into layout-friendly structures
- preserve semantic identity needed for diagnostics and fallback targeting

### Step 3: Measure Content

Measurement uses browser canvas:

- text width
- ascent/descent
- baseline offsets
- decoration placement
- object box metrics

The measurement policy must be deterministic for a given font set and option
set.

### Step 4: Perform Layout

Layout order:

1. compute page frame geometry
2. lay out header
3. lay out footer
4. compute main flow available area
5. lay out inline and block content
6. paginate
7. assign page-local coordinates

### Step 5: Resolve Fallback

For elements that cannot be rendered natively:

- preserve their measured box
- preserve their page placement
- rasterize only the unresolved local region
- store fallback blocks on the page model

### Step 6: Render PDF

The render layer consumes only plugin page models and emits:

- jsPDF text
- jsPDF vector instructions
- image placements
- links
- final serialized base64

## Coverage Requirements

The first version targets near-full visual coverage.

### Must Be Natively Laid Out and Natively Rendered

- plain text
- titles
- ordered and unordered lists
- hyperlinks
- superscript and subscript
- labels
- dates
- separators
- table structure
- table borders
- table backgrounds
- table text
- header
- footer
- page number
- page border
- background color
- background image
- watermark
- images

These features define the core fidelity target and cannot be delegated to
whole-element screenshotting except where explicitly noted below.

### Must Be Natively Laid Out, May Use Localized Raster Rendering

- LaTeX
- custom block content
- complex controls
- complex area-internal content

Requirements:

- the plugin must still measure and place these elements natively
- fallback may cover only the unresolved visual region
- neighboring text and page structure must remain native

### Must Be Included in the First Version, with Stricter Local Fallback Rules

- graffiti
- iframe-backed block content
- highly custom composite controls

Requirements:

- native page participation is mandatory
- the fallback region must be bounded to the concrete element region
- page-level rasterization is forbidden

## Element-Level Strategy

### Text-Like Content

For text, title, list, hyperlink, label, date, superscript, and subscript:

- preserve selectable text in PDF
- use measured glyph geometry from browser canvas
- preserve color, decoration, and link regions
- support style variants needed for visually matching canvas output

### Tables

The table system must support:

- cell text
- cell background
- border styles
- slash lines
- row and column spanning
- cross-page splitting where the core renderer visually allows it

The plugin must own table pagination instead of relying on precomputed row
positions from core.

### Frame Content

The plugin must lay out and render:

- header
- footer
- page number
- page border
- background
- watermark
- line number, if required by the active option set

Current omissions in the snapshot-driven implementation are not acceptable in
the new architecture.

### Controls, Areas, and Blocks

Controls, areas, and blocks require special treatment:

- treat their box model and page participation as native layout concerns
- attempt native rendering for stable visual parts
- isolate unresolved rendering into local fallback
- never let a control or block force whole-page degradation

### Graffiti

Graffiti must participate in page-local coordinates. If the existing vector
representation can be replayed safely, use native vector rendering. Otherwise,
fallback is limited to the graffiti region only.

## Font Strategy

The plugin uses two distinct font concerns:

1. browser measurement fonts
2. jsPDF output fonts

These must be kept aligned as closely as possible.

Requirements:

- support configured font-family to URL mapping
- register fonts with jsPDF
- use the same configured family during browser-side measurement
- maintain a deterministic fallback chain
- record font substitutions in diagnostics

The built-in Song fallback can remain in the plugin, but only as a plugin
resource. No font fallback behavior should move into core.

## Error Handling

Errors are divided into three classes.

### Fatal Errors

Export must stop when:

- required editor state cannot be read
- page geometry is invalid
- required font measurement path is unavailable
- layout enters an invalid or non-terminating state
- final page models are empty or structurally broken

### Recoverable Errors

Export may continue when:

- a specific complex element cannot be rendered natively
- a local asset cannot be converted to the preferred native form
- a stable local fallback can be produced

These cases must generate diagnostics.

### Debug-Strict Errors

When `debug` is enabled, the plugin should fail on:

- any fallback usage
- any unsupported feature path
- any suspicious overflow or clipping
- any font substitution
- any page that produces incomplete output

This turns diagnostics into hard failures for development.

## Diagnostics

The plugin should maintain structured diagnostics during export.

Suggested categories:

- `unsupportedElements`
- `fallbackBlocks`
- `layoutWarnings`
- `fontSubstitutions`
- `assetWarnings`

Production callers may continue receiving only the PDF base64 string, but the
plugin should expose debug hooks or development logging for diagnosis.

## Verification Strategy

Export verification must go beyond confirming the PDF file header.

### 1. Structural Verification

- PDF opens successfully
- page count matches expectation
- page size and orientation match editor configuration
- header, footer, and page numbers appear on expected pages

### 2. Content Verification

- text content is present and selectable
- tables render with correct borders and backgrounds
- images render at correct size and position
- frame content is present
- complex elements occupy the correct layout region

### 3. Visual Verification

Use screenshot comparison between:

- canvas-rendered pages
- rendered PDF pages

Primary comparison targets:

- line breaks
- page breaks
- header and footer alignment
- page number placement
- table pagination
- control and block placement
- watermark and background placement

### 4. Fallback Verification

- every fallback instance must be recorded
- fallback area must stay local to the originating element
- no fallback may silently enlarge to page scope

## Required Verification Documents and Fixtures

The verification set should include documents covering:

- multi-page long-form text
- header and footer
- page numbers
- background color and background image
- watermark
- page border
- large cross-page tables
- mixed text and images
- LaTeX
- custom blocks
- controls
- areas
- graffiti
- mixed Chinese and Latin text
- bold, italic, superscript, and subscript

## Migration from the Current Implementation

Migration should happen in controlled steps.

### Remove or Replace

The following current-direction concepts must be removed or replaced:

- plugin dependence on core-owned page snapshots
- PDF-specific draw snapshot types
- PDF-specific command bindings in core
- snapshot-to-page-model conversion built on core pagination caches

### Keep and Adapt

The following may remain, but only after being retargeted to plugin-owned page
models:

- font bootstrap logic
- jsPDF document creation and serialization
- vector rendering helpers
- image insertion helpers
- debug option handling

### Transitional Expectation

During migration there may be a temporary period where:

- the existing snapshot path still exists behind the scenes
- the new plugin-owned layout path is built in parallel

However, the end state must remove PDF-specific core interfaces entirely.

## Risks

### Risk: Visual Drift from Core Renderer

The plugin is building a second layout engine, so drift is the primary risk.

Mitigation:

- use browser canvas measurement
- compare output against canvas-rendered fixtures
- keep diagnostics for layout mismatches
- prioritize correctness of page structure before decorative parity

### Risk: Scope Expansion from Near-Full Coverage

Near-full coverage creates pressure to absorb too many edge cases at once.

Mitigation:

- keep module boundaries strict
- treat fallback as local repair, not blanket simplification
- verify each major element family independently

### Risk: Hidden Dependence on Core Internals

It will be tempting to reuse computed core pagination for speed.

Mitigation:

- forbid PDF-specific core APIs
- forbid plugin reads of draw caches and renderer internals
- keep all layout ownership in plugin modules

## Acceptance Criteria

The design is successful when all of the following are true:

- no PDF-specific API remains in core
- the plugin owns pagination and page geometry derivation
- the plugin reads only neutral public editor state
- common and frame content render natively in PDF
- complex content uses only local fallback when necessary
- no whole-page raster fallback occurs
- visual comparison across the verification fixture set is acceptable
- debug mode surfaces fallback and unsupported-path issues clearly

## Implementation Direction Summary

This work is not an incremental extension of the current snapshot approach.
It is an architectural replacement:

- move PDF layout ownership into the plugin
- keep core APIs neutral and minimal
- rebuild pagination inside the plugin
- preserve visual fidelity through browser-canvas measurement
- reserve raster fallback for the smallest unresolved local regions only
