# SimSun Font Baseline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unify the demo and default editor font baseline to `SimSun` so browser rendering and jsPDF export use the same expected font before visual comparison.

**Architecture:** Keep the change narrow: lock default editor options and demo runtime wiring to `SimSun`, then verify the baseline with a focused Cypress regression test. Do not change PDF layout logic in this pass; this is a diagnostic baseline reset.

**Tech Stack:** TypeScript, Vite, Cypress, jsPDF

---

### Task 1: Add a failing font-baseline regression test

**Files:**
- Create: `cypress/e2e/jspdf/font-baseline.cy.ts`
- Test: `cypress/e2e/jspdf/font-baseline.cy.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { mergeOption } from '../../../src/editor/utils/option'
import { defaultImgCaptionOption } from '../../../src/editor/dataset/constant/ImgCaption'
import { defaultLineNumberOption } from '../../../src/editor/dataset/constant/LineNumber'
import { defaultPageBreakOption } from '../../../src/editor/dataset/constant/PageBreak'
import { defaultPageNumberOption } from '../../../src/editor/dataset/constant/PageNumber'
import { defaultPlaceholderOption } from '../../../src/editor/dataset/constant/Placeholder'
import { defaultWatermarkOption } from '../../../src/editor/dataset/constant/Watermark'

describe('jspdf SimSun font baseline', () => {
  it('keeps core defaults and demo runtime aligned to SimSun', () => {
    expect(mergeOption().defaultFont).to.equal('SimSun')
    expect(defaultImgCaptionOption.font).to.equal('SimSun')
    expect(defaultLineNumberOption.font).to.equal('SimSun')
    expect(defaultPageBreakOption.font).to.equal('SimSun')
    expect(defaultPageNumberOption.font).to.equal('SimSun')
    expect(defaultPlaceholderOption.font).to.equal('SimSun')
    expect(defaultWatermarkOption.font).to.equal('SimSun')

    cy.visit('http://localhost:8100/canvas-editor/index.html')
    cy.window().then(win => {
      const editor = (win as any).editor
      const debug = (win as any).__jspdfDebug

      expect(editor.options.defaultFont).to.equal('SimSun')
      expect(editor.options.pageNumber.font).to.equal('SimSun')
      expect(editor.options.watermark.font).to.equal('SimSun')
      expect(debug.fontUrls.SimSun).to.be.a('string')
    })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run cypress:run -- --browser chrome --headless --spec cypress/e2e/jspdf/font-baseline.cy.ts`

Expected: FAIL because `mergeOption().defaultFont` and several core constants still resolve to `Microsoft YaHei`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/editor/utils/option.ts
defaultFont: 'SimSun'

// src/editor/dataset/constant/*.ts
font: 'SimSun'
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run cypress:run -- --browser chrome --headless --spec cypress/e2e/jspdf/font-baseline.cy.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add cypress/e2e/jspdf/font-baseline.cy.ts src/editor/utils/option.ts src/editor/dataset/constant/ImgCaption.ts src/editor/dataset/constant/LineNumber.ts src/editor/dataset/constant/PageBreak.ts src/editor/dataset/constant/PageNumber.ts src/editor/dataset/constant/Placeholder.ts src/editor/dataset/constant/Watermark.ts
git commit -m "test: lock SimSun font baseline"
```

### Task 2: Keep the demo and jsPDF runtime explicitly on SimSun

**Files:**
- Modify: `src/main.ts`
- Test: `cypress/e2e/jspdf/font-baseline.cy.ts`

- [ ] **Step 1: Extend the test with runtime assertions if needed**

```ts
cy.window().then(win => {
  const editor = (win as any).editor
  const debug = (win as any).__jspdfDebug

  expect(editor.options.defaultFont).to.equal('SimSun')
  expect(editor.options.pageNumber.font).to.equal('SimSun')
  expect(editor.options.watermark.font).to.equal('SimSun')
  expect(debug.fontUrls.SimSun).to.be.a('string')
})
```

- [ ] **Step 2: Run test to verify it fails if runtime drift exists**

Run: `npm run cypress:run -- --browser chrome --headless --spec cypress/e2e/jspdf/font-baseline.cy.ts`

Expected: FAIL if `src/main.ts` no longer registers or exposes `SimSun` consistently.

- [ ] **Step 3: Write minimal implementation**

```ts
await registerBrowserFont('SimSun', simsunTtfUrl)

instance.use(jspdfPlugin, {
  fonts: {
    SimSun: simsunTtfUrl
  },
  defaultFontFamily: 'SimSun'
})
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run cypress:run -- --browser chrome --headless --spec cypress/e2e/jspdf/font-baseline.cy.ts`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/main.ts cypress/e2e/jspdf/font-baseline.cy.ts
git commit -m "fix: align demo jspdf font baseline"
```

### Task 3: Re-run visual comparison on the unified baseline

**Files:**
- Test: `cypress/e2e/jspdf/pdf-font-style-debug.cy.ts`
- Test: `cypress/e2e/jspdf/visual-export-dump.cy.ts`
- Test: `cypress/e2e/jspdf/bold-text-crop-check.cy.ts`

- [ ] **Step 1: Run font style debug**

Run: `npm run cypress:run -- --browser chrome --headless --spec cypress/e2e/jspdf/pdf-font-style-debug.cy.ts`

Expected: PASS and updated `cypress/artifacts/jspdf-visual/pdf-font-style-debug.json`

- [ ] **Step 2: Run full-page visual dump**

Run: `npm run cypress:run -- --browser chrome --headless --spec cypress/e2e/jspdf/visual-export-dump.cy.ts`

Expected: PASS and updated `cypress/artifacts/jspdf-visual/visual-export-dump.json`

- [ ] **Step 3: Run text-heavy crop comparison**

Run: `npm run cypress:run -- --browser chrome --headless --spec cypress/e2e/jspdf/bold-text-crop-check.cy.ts`

Expected: PASS if the remaining diff is within the current threshold, otherwise fail with fresh evidence for the next debugging round.

- [ ] **Step 4: Summarize remaining gap**

```text
Compare the new avgChannelDiff values against the previous baseline
page 1: 14.36533462231727
page 2: 6.443117085469793
```

- [ ] **Step 5: Commit**

```bash
git add cypress/artifacts/jspdf-visual
git commit -m "chore: refresh jspdf visual baseline"
```
