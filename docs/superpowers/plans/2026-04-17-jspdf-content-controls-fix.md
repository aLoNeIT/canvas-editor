# jsPDF Content Controls Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make jspdf content-area controls render consistently with core print rendering for empty controls and fixed-width signature lines.

**Architecture:** Keep the current plugin-owned layout pipeline and repair the control text generation path instead of adding special screenshot fallback. Empty `TEXT` / `SELECT` / `NUMBER` controls should generate visible placeholder or bracket text through the same text-run path, while `minWidth + underline` signature controls should emit a fixed-width invisible text run so underline and width survive layout.

**Tech Stack:** TypeScript, existing jspdf layout pipeline, `scripts/jspdf-layout-runtime-test.ts`, Cypress diagnostics.

---

### Task 1: Lock Failing Behavior With Runtime Tests

**Files:**
- Modify: `scripts/jspdf-layout-runtime-test.ts`

- [ ] **Step 1: Add a failing test for empty text control placeholder rendering**

- [ ] **Step 2: Add a failing test for empty select control bracket + placeholder rendering**

- [ ] **Step 3: Add a failing test for empty number control bracket + placeholder rendering**

- [ ] **Step 4: Add a failing test for minWidth underline signature rendering**

- [ ] **Step 5: Run targeted runtime checks and confirm the new tests fail for the expected reasons**

### Task 2: Repair Empty Control Text Generation

**Files:**
- Modify: `src/plugins/jspdf/layout/tableCellText.ts`
- Modify: `scripts/jspdf-layout-runtime-test.ts`

- [ ] **Step 1: Update control text generation so empty `TEXT` / `SELECT` / `NUMBER` controls emit placeholder text when present**

- [ ] **Step 2: Preserve prefix and postfix output for empty controls when placeholder text exists**

- [ ] **Step 3: Keep checkbox/radio and valued controls on the existing path**

- [ ] **Step 4: Re-run runtime checks and confirm placeholder-related tests pass**

### Task 3: Repair Fixed-Width Signature Rendering

**Files:**
- Modify: `src/plugins/jspdf/layout/tableCellText.ts`
- Modify: `scripts/jspdf-layout-runtime-test.ts`

- [ ] **Step 1: Make empty `minWidth` text controls emit a width-preserving synthetic run**

- [ ] **Step 2: Ensure underline decoration can attach to that synthetic run without adding visible text**

- [ ] **Step 3: Re-run runtime checks and confirm signature-line tests pass**

### Task 4: Verify End To End

**Files:**
- Modify: `cypress/e2e/jspdf/control-overlay.cy.js` if region anchors need updating after the fix

- [ ] **Step 1: Run `npm run type:check`**

- [ ] **Step 2: Run focused Cypress control diagnostics**

- [ ] **Step 3: Re-read generated control diagnostics and confirm previously missing controls now exist in plugin page models**

---

Plan complete and saved to `docs/superpowers/plans/2026-04-17-jspdf-content-controls-fix.md`. I’m proceeding inline in this session.
