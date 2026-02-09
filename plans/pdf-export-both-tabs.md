# PDF Export: E2E and Atomics Sections

**Status**: Draft - Awaiting Review

## Objective

Modify the PDF export so that clicking "Export PDF" produces a single document containing both E2E and Atomics test sections, with a global summary aggregating all tests.

Currently, `exportPDF()` calls `window.print()`, which captures whatever is in the DOM at that moment -- only the active tab's tests. The goal is to temporarily restructure the DOM before printing so the PDF contains:

1. Header (title, timestamp, logo) -- unchanged, page 1
2. Global summary (chart + stat cards reflecting ALL tests, E2E + Atomics combined) -- page 1
3. "E2E Tests" section heading + table of E2E tests -- page 2+
4. "Atomics Tests" section heading + table of Atomics tests -- follows E2E

After `window.print()` completes (or is cancelled), the DOM must be restored to its pre-export state (active tab, filters, summary, chart all back to normal).

### Success Criteria

- The exported PDF contains a global summary (all tests combined) on the first page.
- The PDF contains an "E2E Tests" section with a heading and all E2E test rows.
- The PDF contains an "Atomics Tests" section with a heading and all Atomics test rows.
- Both sections include their own table headers (Status, Name, Desc, Meta, Time, Error, Notes).
- After printing, the on-screen report returns to exactly the state it was in before clicking "Export PDF" (correct tab, correct filters, correct summary/chart).
- The interactive tab behavior is unchanged -- tabs still work normally outside of PDF export.
- No new dependencies are introduced.

### Scope Boundaries

**In scope:**

- Modifying `exportPDF()` in `report.js` to render both sections before `window.print()`
- Adding a section heading style for print (e.g., "E2E Tests", "Atomics Tests")
- Modifying `template.html` to add a second `tests-section` container for the Atomics table
- Adding print CSS rules for the dual-section layout
- Restoring all DOM state after print

**Out of scope:**

- Changes to the Puppeteer-based `pdf-generator.ts` (this plan targets the browser-based `window.print()` flow only)
- Separate per-section summaries (the summary is global only)
- Changing how tabs work interactively
- Adding new filters or sorting

---

## Context

### Current State

The `exportPDF()` function in `report.js` (lines 343-383) does minimal preparation:

1. Marks empty comment fields with a CSS class so they hide in print.
2. Expands all error traces (shows `.error-content`, hides `.error-toggle`).
3. Calls `window.print()`.
4. After a 1-second `setTimeout`, restores error toggles and removes empty-comment classes.

The DOM at print time contains only one `<tbody id="tests-body">` with whatever tests `renderTests()` last put there -- the active tab's tests (possibly filtered). The summary section reflects the active tab's stats, not all tests.

The `@media print` CSS already hides the tab bar, filters, and header actions. It applies `page-break-before: always` to `.tests-section`.

### Desired State

When the user clicks "Export PDF":

1. The summary updates to reflect ALL tests (E2E + Atomics combined).
2. The chart updates to reflect ALL tests.
3. Two separate test table sections appear in the DOM, each with a visible heading.
4. The first section contains all E2E tests; the second contains all Atomics tests.
5. `window.print()` fires, capturing this dual-section layout.
6. After print, everything reverts: summary goes back to the active tab's stats, the chart goes back, the single tests-body is re-rendered with the active tab's (possibly filtered) tests, and the second section is removed or hidden.

### Key Functions Involved

| Function | Role | Modification Needed |
|----------|------|---------------------|
| `exportPDF()` | Orchestrates print | Major rewrite -- the core of this plan |
| `getTabTests()` | Returns tests for active tab | No change, but will be used to get E2E/Atomics subsets directly |
| `renderTests(tests)` | Renders rows into `#tests-body` | No signature change; called multiple times for different targets |
| `updateSummary(tests)` | Updates stat cards | Called with ALL tests for print, then restored |
| `updateChart(tests)` | Updates Chart.js doughnut | Called with ALL tests for print, then restored |

---

## Approach

### Strategy: DOM Mutation Before Print, Full Restore After

The approach is to keep the existing single-table architecture for interactive use, and only create the dual-section DOM structure transiently during the print flow. This avoids changing how tabs, filters, and rendering work during normal interaction.

Concretely, `exportPDF()` will:

1. **Snapshot current state** -- capture `activeTab`, current filter values, and the current `#tests-body` innerHTML.
2. **Compute test subsets** -- get E2E tests and Atomics tests by filtering `REPORT_DATA.tests` directly (bypassing tab state).
3. **Update summary to global** -- call `updateSummary(REPORT_DATA.tests)` and `updateChart(REPORT_DATA.tests)`.
4. **Render E2E tests** into the existing `#tests-body`.
5. **Show the print-only Atomics section** -- a second `<section>` in the HTML (hidden by default, shown only during print) gets its own `<tbody>` populated with Atomics test rows.
6. **Expand errors, hide empty comments** -- same as current logic, but applied to both sections.
7. **Call `window.print()`**.
8. **Restore** -- revert summary/chart to the saved tab's stats, re-render the saved tab's tests, hide the Atomics print section, restore filters.

### Key Design Decisions

1. **Second tests-section in template.html rather than JS-only DOM creation**: Adding a hidden `#print-atomics-section` in the template keeps the table structure (with `<thead>`) consistent and avoids complex DOM construction in JS. It is hidden with `display: none` by default and shown only during `exportPDF()`.

2. **Section headings via a dedicated element**: Each section gets an `<h2>` element (e.g., class `section-heading`) that is `display: none` normally but `display: block` in the print media query. The existing tests-section gets a heading too (for "E2E Tests"). This way headings only appear in the PDF, never on screen.

3. **Rendering into a second tbody**: The `renderTests()` function currently targets `#tests-body` by hardcoded ID. Rather than refactoring `renderTests()` to accept a target parameter (which touches more code), `exportPDF()` will directly set `innerHTML` on the second tbody using the same row-generation logic. Alternatively, a small helper `renderTestsInto(target, tests)` can be extracted to avoid duplicating the row template. This is an implementation detail for the agent to decide.

4. **Restore via re-rendering rather than DOM snapshot**: Rather than saving/restoring raw innerHTML (which would lose event listeners on comment fields), the restore step will call `renderTests(getTabTests())` to re-render from data. This is how tab switching already works, so it is a proven pattern.

5. **Chart restore**: After print, call `updateChart(getTabTests())` and `updateSummary(getTabTests())` to return the chart and summary to the active tab's values.

6. **Print CSS page breaks**: The print-only Atomics section should get `page-break-before: always` so it starts on a new page, matching the existing `page-break-before: always` on `.tests-section`.

---

## Implementation Steps

### Step 1: Add print-only section headings to template.html

**File**: `src/html/template.html`

Add an `<h2 class="section-heading">` element inside (or just before) the existing `.tests-section` with the text "E2E Tests". This heading is hidden on screen and only visible in print.

Add a second `<section>` after the existing `.tests-section` for the Atomics print table:

```
<section class="tests-section print-only" id="print-atomics-section">
  <h2 class="section-heading">Atomics Tests</h2>
  <table class="tests-table">
    <thead>
      <tr>
        <th class="col-status">Status</th>
        <th class="col-name">Name</th>
        <th class="col-description">Desc</th>
        <th class="col-metadata">Meta</th>
        <th class="col-duration">Time</th>
        <th class="col-error">Error</th>
        <th class="col-comment">Notes</th>
      </tr>
    </thead>
    <tbody id="print-atomics-body"></tbody>
  </table>
</section>
```

This section has `class="print-only"` so it is hidden during normal use.

**Complexity**: Simple
**Dependencies**: None

---

### Step 2: Add CSS for section headings and print-only sections

**File**: `src/html/styles.css`

Add screen styles:

- `.section-heading` -- `display: none;` (never shown on screen).
- `.print-only` -- `display: none;` (hidden during normal interaction).

Add print styles (inside existing `@media print` block):

- `.section-heading` -- `display: block; font-size: 16px; font-weight: 600; margin-bottom: 8px; padding: 8px 0;` (visible in print with appropriate styling).
- `.print-only` -- When it also has a `.print-active` class: `display: block !important;` (shown during print). Without `.print-active`, it remains hidden even in print -- this way the Atomics section only appears when `exportPDF()` explicitly activates it.
- `#print-atomics-section` -- `page-break-before: always;` (starts on a new page in the PDF).

**Complexity**: Simple
**Dependencies**: Step 1 (elements must exist)

---

### Step 3: Extract a reusable row-rendering helper

**File**: `src/html/report.js`

Extract the test-row HTML generation from `renderTests()` into a helper function, e.g. `buildTestRowsHTML(tests)`, that returns the HTML string for an array of tests (the same `.map(...).join('')` logic currently in `renderTests()`).

Refactor `renderTests()` to use this helper:

```
function renderTests(tests) {
  const tbody = document.getElementById('tests-body');
  if (!tbody) return;
  tbody.innerHTML = buildTestRowsHTML(tests);
  // re-attach comment listeners...
}
```

This allows `exportPDF()` to call `buildTestRowsHTML(atomicsTests)` and set the second tbody's innerHTML without duplicating the row template.

**Complexity**: Simple
**Dependencies**: None (pure refactor, no behavioral change)

---

### Step 4: Rewrite exportPDF() for dual-section rendering

**File**: `src/html/report.js`

Replace the current `exportPDF()` with a new implementation following this sequence:

**Before print (setup):**

1. Save current state:
   - `const savedTab = activeTab;`
   - Save current filter input values (search, status, severity, epic).
   - Save current `#tests-body` innerHTML is NOT needed because we will re-render from data on restore.

2. Compute test subsets:
   - `const allTests = REPORT_DATA.tests;`
   - `const e2eTests = allTests.filter(t => (t.metadata.suite || '').toUpperCase() !== 'ATOMICS');`
   - `const atomicsTests = allTests.filter(t => (t.metadata.suite || '').toUpperCase() === 'ATOMICS');`

3. Update summary and chart to global (all tests):
   - `updateSummary(allTests);`
   - `updateChart(allTests);`

4. Render E2E tests into the primary table:
   - `document.getElementById('tests-body').innerHTML = buildTestRowsHTML(e2eTests);`

5. Render Atomics tests into the print-only table:
   - `document.getElementById('print-atomics-body').innerHTML = buildTestRowsHTML(atomicsTests);`

6. Show the print-only Atomics section:
   - `document.getElementById('print-atomics-section').classList.add('print-active');`

7. Show the "E2E Tests" section heading:
   - The heading is always present in the DOM but only visible via print CSS, so no JS toggle needed.

8. Expand all errors and hide empty comments (both tables):
   - Apply the existing error-expand logic to both `#tests-body` and `#print-atomics-body`.
   - Mark empty comment fields with `empty-comment` class in both tbodies.

9. Call `window.print();`

**After print (restore):**

10. Use `setTimeout` (matching current pattern) to restore:
    - `activeTab = savedTab;`
    - Re-render active tab's tests: `renderTests(getTabTests());`
    - Restore summary and chart: `updateSummary(getTabTests()); updateChart(getTabTests());`
    - Clear the print-only Atomics tbody: `document.getElementById('print-atomics-body').innerHTML = '';`
    - Hide the print-only section: `document.getElementById('print-atomics-section').classList.remove('print-active');`
    - Restore error toggles (same as current logic).
    - Remove `empty-comment` classes.
    - Restore filter input values to their saved state.

**Complexity**: Moderate
**Dependencies**: Steps 1, 2, 3

---

### Step 5: Handle edge case -- empty sections

**File**: `src/html/report.js`

Within the `exportPDF()` function, after computing `e2eTests` and `atomicsTests`, handle:

- If `e2eTests` is empty: still render the E2E section heading and table, but the table body will just be empty. Optionally render a "No E2E tests" row.
- If `atomicsTests` is empty: do NOT activate the print-only Atomics section (skip step 6 of the export flow). This avoids a blank page in the PDF.

This keeps the PDF clean -- if a report only has E2E tests, the Atomics section simply does not appear.

**Complexity**: Simple
**Dependencies**: Step 4

---

### Step 6: Verify and adjust print CSS for dual sections

**File**: `src/html/styles.css`

Review the existing `@media print` rules and ensure:

- The `page-break-before: always` on `.tests-section` applies to both the E2E section and the Atomics section, so each starts on a new page after the summary.
- The `.section-heading` is styled appropriately for print (readable font size, some spacing).
- Error traces inside `#print-atomics-body` get the same print styles as the main table (the existing selectors like `.error-content pre` and `.error-cell pre` should already apply since they are class-based, not ID-based).
- Comment fields in the print-only section also get the existing print comment styles.

**Complexity**: Simple
**Dependencies**: Steps 2, 4

---

### Step 7: Manual testing and verification

No file changes -- this is a verification step.

Execute `npm run build` and generate a report with tests that have both `E2E` and `ATOMICS` suite metadata. Open the HTML report and:

1. Verify interactive tabs still work normally (switch tabs, check summary updates, check filters).
2. Click "Export PDF" from the E2E tab:
   - Verify the print preview shows: header, global summary, "E2E Tests" section, "Atomics Tests" section.
   - Verify the summary stats are the sum of all tests (not just one tab).
   - Verify each section has its own heading.
   - Verify error traces are expanded in both sections.
   - Verify empty comments are hidden in both sections.
3. Cancel the print dialog and verify the report restored correctly:
   - The active tab should still be E2E.
   - Summary and chart should reflect E2E-only stats.
   - Filters should be in their pre-export state.
   - The Atomics print section should be invisible.
4. Repeat from the Atomics tab -- after export and cancel, the Atomics tab should still be active with correct stats.
5. Test with filters applied before export -- verify filters are restored after print.
6. Test with a report that has only E2E tests (no Atomics) -- verify the Atomics section does not appear in print.
7. Test with a report that has only Atomics tests (no E2E) -- verify the E2E section heading still appears (with an empty table), and the Atomics section appears.

**Complexity**: Moderate (manual effort, not code complexity)
**Dependencies**: Steps 1-6

---

## Dependencies

### Libraries / Frameworks

- **Chart.js (already loaded via CDN)**: The `chart.update('none')` API is used to update the chart for global stats before print and restore it after. No version change needed.
- **No new dependencies**.

### Prerequisites

- The tab system (from the previous `add-e2e-atomics-tabs.md` plan) must already be implemented and working. This is confirmed by the current codebase.
- Tests in `REPORT_DATA.tests` must have `metadata.suite` populated for correct classification. Tests without this field default to E2E (existing behavior).

### Configuration Changes

- None. This is a purely client-side change to the HTML/CSS/JS assets.

---

## Testing Strategy

### Manual Testing

See Step 7 above for a detailed manual test checklist.

### Key Scenarios

| Scenario | Expected PDF Output |
|----------|---------------------|
| Report with both E2E and Atomics tests | Summary (all tests), E2E section, Atomics section |
| Report with only E2E tests | Summary (E2E only), E2E section, no Atomics section |
| Report with only Atomics tests | Summary (Atomics only), E2E section (empty or skipped), Atomics section |
| Export with filters applied | PDF shows ALL tests (unfiltered) in both sections; filters restored after |
| Export from E2E tab, cancel print | Returns to E2E tab, correct stats |
| Export from Atomics tab, cancel print | Returns to Atomics tab, correct stats |
| Tests with errors in both sections | Errors expanded in both E2E and Atomics tables |
| Tests with comments in both sections | Non-empty comments visible in both sections; empty comments hidden |

### Edge Cases

- **Comment field event listeners**: After restore, comment fields in the primary table must have their `change`/`input` listeners re-attached. This happens automatically because `renderTests()` re-attaches them. The print-only Atomics table does not need listeners (it is cleared after print).
- **Chart animation during restore**: Use `chart.update('none')` to avoid visible animation flicker when restoring the chart to tab-scoped data.
- **`window.print()` timing**: The `setTimeout` for restore uses a 1-second delay (matching current behavior). If the browser's print dialog blocks the JS thread (which `window.print()` does in most browsers), the restore code runs after the dialog closes. The `setTimeout` is a safety net for edge cases.

---

## Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| DOM restore fails, leaving report in print layout | Low | High | The restore logic follows the same pattern as `switchTab()` (re-render from data, update summary/chart). This is a proven code path. Add a try/catch around the print flow to ensure restore runs even if an error occurs. |
| Print-only section inherits unexpected styles | Low | Medium | The print-only section uses the same `.tests-section` and `.tests-table` classes as the primary table, so it inherits all existing print styles automatically. |
| `window.print()` called before DOM mutations are painted | Low | High | Browser rendering is synchronous for DOM mutations before `window.print()`. No `requestAnimationFrame` or flush needed. However, if issues arise, wrap `window.print()` in a `requestAnimationFrame` callback. |
| Filters not properly restored after print | Medium | Medium | Save filter values explicitly before print and restore them after. The current code does not save/restore filters (it did not need to), so this is new logic that must be tested. |
| Large test count causes slow print rendering | Low | Low | Both tables are rendered from in-memory data (no network calls). Even with 500+ tests, DOM manipulation should complete in under 100ms. |
| Chart shows global data briefly on screen before print dialog opens | Low | Low | The print dialog typically opens fast enough that users will not notice the summary flicker. If it is noticeable, a CSS class could temporarily overlay the summary area, but this is likely unnecessary. |

---

## Open Questions

1. **Should the "E2E Tests" heading appear even when there are no Atomics tests?**
   - If the report has only E2E tests, showing an "E2E Tests" heading is redundant since there is no Atomics section to distinguish from.
   - Recommendation: Only show section headings when BOTH sections have tests. If only one type exists, omit headings entirely and render as a single section (matching current single-tab PDF behavior).

2. **Should filters be cleared for the PDF export, or should the PDF respect active filters?**
   - Current plan: PDF shows ALL tests (unfiltered) in both sections, regardless of what filters were active.
   - Alternative: PDF shows only filtered tests within each section.
   - Recommendation: Show all tests. The PDF is meant to be a complete record. Filters are a screen-only convenience.

3. **Should the `afterprint` event be used instead of `setTimeout` for restore?**
   - Browsers support `window.addEventListener('afterprint', ...)` which fires reliably after the print dialog closes.
   - This would be more robust than a 1-second `setTimeout`.
   - Recommendation: Use `afterprint` event if browser support is acceptable (it is supported in all modern browsers). Fall back to `setTimeout` only if needed for compatibility.

---

## Files to Modify

| File | Type of Change |
|------|----------------|
| `src/html/template.html` | Add section heading to existing tests-section; add print-only Atomics section with table |
| `src/html/styles.css` | Add `.section-heading`, `.print-only`, `.print-active` styles; add print-specific rules |
| `src/html/report.js` | Extract `buildTestRowsHTML()`; rewrite `exportPDF()` with dual-section rendering and state restore |

No changes needed to:

- `src/types/index.ts`
- `src/reporter/craft-reporter.ts`
- `src/pdf/pdf-generator.ts`
- `src/index.ts`
