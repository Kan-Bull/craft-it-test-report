# Add E2E / Atomics Tabs to Craft Test Report

**Status**: Draft - Awaiting Review

## Objective

Add a tab bar above the test results list that separates tests into two groups -- "E2E" and "Atomics" -- based on the existing `subSuite` metadata field. The summary section (doughnut chart and stat cards) must update dynamically to reflect only the tests visible in the active tab. All existing filter controls (search, status, severity, epic) must continue to work, scoped to the active tab.

### Success Criteria

- Two tabs ("E2E" and "Atomics") render between the summary section and the filters section.
- "E2E" tab is selected by default on page load.
- Tests with `metadata.subSuite === 'E2E'` appear under the E2E tab; tests with `metadata.subSuite === 'ATOMICS'` appear under the Atomics tab.
- Switching tabs recalculates the summary stats (Total, Passed, Failed, Skipped, Duration) and updates the Chart.js doughnut chart.
- Existing filters (search, status, severity, epic) apply only within the currently active tab's test set.
- The epic filter dropdown repopulates to show only epics present in the active tab.
- Print/PDF export continues to work correctly (prints the active tab's view).
- No changes to the TypeScript data model or the reporter class are required.
- The visual design is consistent with the existing card-based, rounded-corner aesthetic.

### Scope Boundaries

**In scope:**
- Tab bar UI component (HTML + CSS)
- Tab switching logic (JS)
- Dynamic summary/chart recalculation per tab
- Filter scoping to active tab
- Print/PDF compatibility for active tab

**Out of scope:**
- Data model changes (subSuite already exists)
- Reporter-side changes (test classification already happens)
- New filter types or sorting features
- URL hash-based tab persistence
- Animated tab transitions

---

## Context

### Current State

The Craft Test Report generates a single-file HTML report from Playwright test results. All tests are rendered in one flat table with filters for search, status, severity, and epic. The `subSuite` metadata field already exists on `TestMetadata` and is populated by the reporter from Playwright annotations (`{ type: 'subSuite', description: 'E2E' }`), but the UI does not use it for grouping.

The client-side JS (`report.js`) uses a simple architecture:
- `REPORT_DATA` is a global JSON object injected at build time.
- `init()` calls `renderSummary()`, `initChart()`, `populateEpicFilter()`, and `renderTests()` sequentially.
- `filterTests()` reads filter inputs, filters `REPORT_DATA.tests`, and calls `renderTests()` with the filtered array.
- The summary stats and chart are set once during `init()` and never update when filters change.

### Desired State

The report splits tests into two tabbed views. The summary section becomes dynamic -- it reflects the stats for the active tab (and, by extension, any applied filters). Switching tabs feels instant because all data is already in memory; no network requests are needed.

### Related Systems

| Component | File | Role |
|-----------|------|------|
| HTML template | `src/html/template.html` | Structure with injection placeholders |
| Client JS | `src/html/report.js` | All runtime behavior (render, filter, chart) |
| CSS | `src/html/styles.css` | All styling including print and responsive |
| Reporter | `src/reporter/craft-reporter.ts` | Populates `subSuite` from annotations |
| PDF generator | `src/pdf/pdf-generator.ts` | Puppeteer-based PDF from HTML |
| Types | `src/types/index.ts` | `TestMetadata.subSuite` already defined |

### Constraints

1. **Single-file HTML**: All CSS and JS are inlined into the template at build time. No external dependencies can be added (Chart.js CDN is the only exception and is already present).
2. **No build step for client code**: `report.js` is plain ES5/ES6 running in the browser IIFE. No TypeScript, no bundler.
3. **Chart.js integration**: The doughnut chart must be updated in-place using the Chart.js `update()` API rather than destroyed and recreated.
4. **Print fidelity**: The `@media print` styles and the `exportPDF()` function must continue to produce correct output. The tab bar itself should be hidden in print, but the active tab's content should print.
5. **No data model changes**: The `ReportData` and `TestMetadata` interfaces remain unchanged. Tab classification is purely a client-side concern.

---

## Approach

### High-Level Strategy

Introduce a thin "active tab" state layer into the existing client JS. The tab determines a **base test set** (a subset of `REPORT_DATA.tests` filtered by `subSuite`). All downstream operations -- summary stats, chart data, epic filter population, and test rendering -- operate on this base set rather than the full `REPORT_DATA.tests` array.

### Key Design Decisions

1. **Tab state as a module-level variable**: Add a `let activeTab = 'E2E';` variable alongside the existing `currentComments` and `chart` state variables. This keeps the architecture consistent with the existing pattern.

2. **Helper function `getTabTests()`**: A single function that returns `REPORT_DATA.tests.filter(t => matchesTab(t, activeTab))`. All consumers call this instead of referencing `REPORT_DATA.tests` directly.

3. **`updateSummary(tests)` replaces static `renderSummary()`**: The current `renderSummary()` reads from `REPORT_DATA` top-level stats (which are pre-computed totals). The new `updateSummary(tests)` will compute stats from whatever test array is passed in. This makes the summary reactive to both tab changes and filter changes.

4. **Chart.js `update()` for reactivity**: Rather than destroying and recreating the chart on each tab switch, update `chart.data.datasets[0].data` and call `chart.update()`. This is the Chart.js-recommended approach and avoids canvas element issues.

5. **Epic filter repopulation on tab switch**: When the tab changes, the epic dropdown must be cleared and repopulated with only the epics present in the active tab's tests. The selected epic filter should reset to "All Epics" on tab switch to avoid showing zero results.

6. **Tab bar placement**: Positioned between the summary section and the filters section in the HTML. This keeps the summary visible above the tabs (since it updates to reflect tab content) and puts tabs close to the content they control.

7. **CSS-only active state**: The active tab gets a bottom border and color change. No JS animations or transitions to keep it simple.

### Architectural Pattern

```
Tab Switch
    |
    v
activeTab = 'E2E' | 'ATOMICS'
    |
    v
getTabTests() -> filtered by subSuite
    |
    +---> updateSummary(tabTests) -> stat cards + chart
    +---> populateEpicFilter(tabTests) -> epic dropdown
    +---> filterTests() -> applies search/status/severity/epic to tabTests -> renderTests()
```

---

## Implementation Steps

### Step 1: Add tab bar HTML to template

**File**: `src/html/template.html`

Insert a new `<section class="tab-bar">` element between the closing `</section>` of the summary and the opening `<section class="filters">`. The section contains two `<button>` elements with a shared class `tab-btn` and a `data-tab` attribute (`E2E` and `ATOMICS`). The E2E button gets an additional `active` class by default.

**Complexity**: Simple
**Dependencies**: None

---

### Step 2: Add tab bar CSS styles

**File**: `src/html/styles.css`

Add styles for:
- `.tab-bar`: Container with flex layout, bottom border, margin/padding matching existing card spacing. Background white, rounded corners on top, shadow consistent with other cards.
- `.tab-btn`: Clean button style -- no background, no border except bottom. Font size/weight matching the filter labels. Padding for a comfortable click target. Cursor pointer.
- `.tab-btn.active`: Highlight with `var(--color-primary)` bottom border (2-3px) and matching text color.
- `.tab-btn:hover` (non-active): Subtle background highlight.
- `@media print` rule: Hide `.tab-bar` entirely (tabs are a navigation concern, not a content concern).
- `@media (max-width: 768px)`: Ensure tab buttons don't wrap awkwardly on small screens. Full-width tabs if needed.

**Complexity**: Simple
**Dependencies**: Step 1 (HTML must exist for styles to apply)

---

### Step 3: Introduce tab state and `getTabTests()` helper

**File**: `src/html/report.js`

At the top of the IIFE, alongside `let currentComments = {};` and `let chart = null;`, add:
- `let activeTab = 'E2E';`

Add a helper function:
- `getTabTests()` - Returns `REPORT_DATA.tests.filter(t => ...)` based on `activeTab`. For `'E2E'`, match tests where `metadata.subSuite` is `'E2E'` (case-insensitive comparison). For `'ATOMICS'`, match tests where `metadata.subSuite` is `'ATOMICS'` (case-insensitive comparison).

**Complexity**: Simple
**Dependencies**: None (pure logic, no DOM interaction)

---

### Step 4: Refactor `renderSummary()` into `updateSummary(tests)`

**File**: `src/html/report.js`

Replace the existing `renderSummary()` function with `updateSummary(tests)` that:
1. Accepts an array of test objects as input.
2. Computes `total`, `passed`, `failed`, `skipped`, and `duration` from the input array (rather than from `REPORT_DATA` top-level fields).
3. Updates the same DOM elements (`#total-count`, `#passed-count`, `#failed-count`, `#skipped-count`, `#duration-value`).
4. Still sets the timestamp from `REPORT_DATA.timestamp` (this is report-level, not tab-level).

The key change: `failed` count must include both `'failed'` and `'timedOut'` statuses (matching the reporter's logic in `craft-reporter.ts` line 179). `duration` is the sum of individual test durations for the tab's tests.

**Complexity**: Simple
**Dependencies**: Step 3 (`getTabTests()` to supply the test array)

---

### Step 5: Make the chart reactive with `updateChart(tests)`

**File**: `src/html/report.js`

Add a new function `updateChart(tests)` that:
1. Computes `passed`, `failed`, `skipped` counts from the input array.
2. Updates `chart.data.datasets[0].data = [passed, failed, skipped]`.
3. Calls `chart.update()`.

Modify `initChart()` to accept a `tests` parameter and use it for the initial dataset instead of `REPORT_DATA` top-level fields. This way `initChart()` and `updateChart()` share consistent counting logic.

**Complexity**: Simple
**Dependencies**: Step 3 (needs tab-scoped test array)

---

### Step 6: Refactor `populateEpicFilter()` to accept a test array

**File**: `src/html/report.js`

Modify `populateEpicFilter()` to accept a `tests` parameter:
1. Clear all options except the first ("All Epics").
2. Collect unique epics from the provided `tests` array.
3. Populate the dropdown.
4. Reset the dropdown value to `'all'`.

This function will be called on initial load with the E2E tab's tests, and again each time the tab switches.

**Complexity**: Simple
**Dependencies**: Step 3

---

### Step 7: Refactor `filterTests()` to use tab-scoped base set

**File**: `src/html/report.js`

Modify `filterTests()` so that instead of filtering `REPORT_DATA.tests`, it filters `getTabTests()`. The rest of the function (search, status, severity, epic matching) remains unchanged.

Additionally, after filtering, call `updateSummary(filtered)` and `updateChart(filtered)` so the summary section reflects the filtered view within the tab. (Note: this is a design decision -- see Open Questions for whether summary should reflect filtered or unfiltered tab data.)

**Complexity**: Simple
**Dependencies**: Steps 3, 4, 5

---

### Step 8: Implement tab switching logic

**File**: `src/html/report.js`

In `setupEventListeners()`, add click handlers for both tab buttons:
1. Query all `.tab-btn` elements.
2. On click, set `activeTab` to the button's `data-tab` attribute.
3. Update the `active` class: remove from all tab buttons, add to clicked button.
4. Reset all filter inputs to default values (search cleared, dropdowns to "all").
5. Call the refresh sequence:
   - `const tabTests = getTabTests();`
   - `updateSummary(tabTests);`
   - `updateChart(tabTests);`
   - `populateEpicFilter(tabTests);`
   - `renderTests(tabTests);`

**Complexity**: Simple
**Dependencies**: Steps 1-7 (all previous steps)

---

### Step 9: Update `init()` to use tab-aware flow

**File**: `src/html/report.js`

Modify `init()` to:
1. Set timestamp (report-level, not tab-level).
2. Get initial tab tests: `const tabTests = getTabTests();`
3. Call `updateSummary(tabTests)` (instead of `renderSummary()`).
4. Call `initChart(tabTests)` (instead of `initChart()`).
5. Call `populateEpicFilter(tabTests)` (instead of `populateEpicFilter()`).
6. Call `renderTests(tabTests)` (instead of `renderTests(REPORT_DATA.tests)`).
7. Call `setupEventListeners()` (unchanged).

**Complexity**: Simple
**Dependencies**: Steps 3-8

---

### Step 10: Handle edge case -- tests with no subSuite

**File**: `src/html/report.js`

Decide how to handle tests where `metadata.subSuite` is undefined, null, or a value other than 'E2E' or 'ATOMICS'. Options:

- **Option A (Recommended)**: Show unclassified tests in both tabs with a visual indicator. This ensures no tests are silently hidden.
- **Option B**: Show unclassified tests only in the E2E tab (default tab).
- **Option C**: Add a third "Other" tab if unclassified tests exist.

The `getTabTests()` function should implement whichever option is chosen. See Open Questions.

**Complexity**: Simple
**Dependencies**: Step 3 (logic lives in `getTabTests()`)

---

### Step 11: Update print styles for tab compatibility

**File**: `src/html/styles.css`

Add print rules:
- `.tab-bar { display: none !important; }` -- Tabs are interactive navigation and should not appear in print.
- Ensure the tests currently rendered in the DOM (i.e., the active tab's filtered tests) are what gets printed. Since `renderTests()` replaces the `<tbody>` content, this should work automatically -- print captures the current DOM state.

**File**: `src/html/report.js`

In `exportPDF()`, ensure that the current tab's tests are the ones expanded for error traces. No additional changes should be needed since `exportPDF()` operates on the DOM as-is.

**Complexity**: Simple
**Dependencies**: Steps 2, 8

---

### Step 12: Verify PDF generator compatibility

**File**: `src/pdf/pdf-generator.ts` (read-only verification, no changes expected)

Confirm that the Puppeteer-based PDF generator:
- Waits for `DOMContentLoaded` (which triggers `init()`, which will render the E2E tab by default).
- The generated PDF will show the E2E tab's data by default, which is acceptable.
- No changes needed to `pdf-generator.ts` unless we want to explicitly set a tab before PDF generation.

**Complexity**: Simple (verification only)
**Dependencies**: Steps 9, 11

---

## Dependencies

### Libraries / Frameworks

- **Chart.js (already loaded)**: Used for the doughnut chart. The `chart.update()` API is needed for reactive updates. No version change required -- Chart.js 4.4.1 (already in the CDN link) fully supports this.
- **No new dependencies**: This feature is entirely implemented in the existing HTML/CSS/JS files.

### Prerequisites

- The `subSuite` metadata field must already be populated by the reporter for the tabs to show meaningful groupings. This is already the case based on the current `craft-reporter.ts` implementation.
- Test suites must use Playwright annotations like `{ type: 'subSuite', description: 'E2E' }` or `{ type: 'subSuite', description: 'ATOMICS' }` for tests to be classified.

### Configuration Changes

- None required. The tab behavior is automatic based on the existing `subSuite` field.

---

## Testing Strategy

### Manual Testing

1. **Basic tab rendering**: Open a generated report and verify two tabs appear ("E2E" and "Atomics"). E2E should be selected by default.
2. **Tab switching**: Click "Atomics" tab. Verify:
   - The test table updates to show only ATOMICS tests.
   - The summary stats update (Total, Passed, Failed, Skipped, Duration all recalculate).
   - The doughnut chart updates to reflect ATOMICS-only data.
   - The epic filter dropdown updates to show only ATOMICS epics.
3. **Filter within tab**: While on the Atomics tab, apply a status filter (e.g., "Failed"). Verify only failed ATOMICS tests appear.
4. **Tab switch resets filters**: Switch from Atomics back to E2E. Verify all filters are reset to defaults and E2E tests display in full.
5. **Search within tab**: Type a search term. Verify it only searches within the active tab's tests.
6. **Print/PDF export**:
   - Click "Export PDF" while on the E2E tab. Verify the PDF contains only E2E data.
   - Verify the tab bar does not appear in the printed output.
   - Verify the summary stats in the PDF match the active tab.
7. **Empty tab**: If all tests are E2E (no ATOMICS tests), switch to the Atomics tab. Verify the table shows an appropriate empty state and stats show zeros.
8. **Responsive behavior**: Resize browser to mobile width. Verify tabs remain usable and don't break the layout.

### Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| All tests are E2E, none are ATOMICS | Atomics tab shows empty state, stats are all zero, chart is empty |
| All tests are ATOMICS, none are E2E | E2E tab (default) shows empty state; Atomics tab has all data |
| Tests with no `subSuite` set | Behavior depends on chosen option from Step 10 |
| Tests with unexpected `subSuite` value (e.g., "REGRESSION") | Same handling as no `subSuite` |
| `subSuite` with inconsistent casing (e.g., "e2e", "Atomics") | Case-insensitive comparison in `getTabTests()` handles this |
| Very large test count (500+ tests) | Tab switching should remain instant since all data is in-memory |
| Chart with all zeros (empty tab) | Chart.js handles all-zero data gracefully (shows empty doughnut) |
| Comments entered on E2E tab should persist when switching to Atomics and back | `currentComments` object is independent of tabs |

### Automated Testing Candidates

While the project does not currently have client-side unit tests for `report.js`, these functions would be good candidates for future unit testing:
- `getTabTests()` -- correct filtering by subSuite
- `updateSummary()` -- correct stat computation from test array
- Tab switch handler -- correct state transitions

---

## Risks and Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Chart.js `update()` causes visual glitch (flash, incorrect animation) | Low | Low | Use `chart.update('none')` to disable animation on tab switch for instant update |
| Tests without `subSuite` are silently hidden from both tabs | Medium | High | Explicitly handle the undefined/null case in `getTabTests()` -- default to including in E2E tab or both tabs |
| Epic filter shows stale epics after tab switch | Low | Medium | Always clear and repopulate epic dropdown on tab switch; reset selection to "All Epics" |
| PDF generator renders wrong tab (or no data) | Low | Medium | PDF generator waits for `DOMContentLoaded`, which triggers `init()` and renders E2E tab by default -- this is the expected behavior |
| Comment data lost on tab switch | Low | High | Comments are stored in `currentComments` object keyed by `testId`, which is independent of tab state. Verify that `handleCommentChange` still fires before tab switch destroys textareas |
| `subSuite` comparison fails due to casing inconsistency | Medium | Medium | Use `.toUpperCase()` comparison in `getTabTests()` |
| Print shows both tabs' content instead of active tab only | Low | Medium | Only the active tab's tests are in the DOM at print time (since `renderTests()` replaces tbody content). Verify with manual test. |
| Refactoring `filterTests()` breaks existing filter behavior | Low | High | The change is minimal -- only the source array changes from `REPORT_DATA.tests` to `getTabTests()`. All filter logic stays identical. Test each filter type after the change. |

---

## Open Questions

1. **How should tests with no `subSuite` or an unrecognized `subSuite` value be handled?**
   - Option A: Include in both tabs (ensures nothing is hidden)
   - Option B: Include only in E2E tab (default tab, path of least surprise)
   - Option C: Add a third "Other" or "Uncategorized" tab
   - Recommendation: Option B, since E2E is the default and most users will expect all tests visible from the default view

2. **Should the summary stats reflect the tab's full test set, or the currently filtered (search + dropdowns) subset?**
   - Option A: Summary always shows the full tab stats (filters only affect the table). This is how the current report works -- summary is static.
   - Option B: Summary updates to reflect the filtered subset. This gives more dynamic feedback.
   - Recommendation: Option A for initial implementation to minimize behavioral changes. Can add Option B later.

3. **Should the `subSuite` comparison be strictly `'E2E'` and `'ATOMICS'`, or should it be configurable?**
   - The current implementation hardcodes these two values. If other subSuite values are expected in the future, a more generic tab system might be warranted.
   - Recommendation: Hardcode for now. If more subSuite values emerge, refactor to dynamic tabs in a separate effort.

4. **Should tab state persist in the URL hash (e.g., `#atomics`)?**
   - This would allow sharing links directly to a specific tab.
   - Recommendation: Out of scope for initial implementation. Can be added trivially later by reading `window.location.hash` on init and setting `activeTab` accordingly.

5. **Should the active tab label show a test count badge (e.g., "E2E (42)" / "Atomics (18)")?**
   - This gives users immediate visibility into the distribution without switching tabs.
   - Recommendation: Nice to have. Can be implemented easily by updating tab button text in the tab switch handler. Include in implementation if effort is minimal.

---

## Files to Modify

| File | Type of Change |
|------|----------------|
| `src/html/template.html` | Add tab bar HTML section |
| `src/html/styles.css` | Add tab bar styles + print rule |
| `src/html/report.js` | Add tab state, refactor summary/chart/filter functions, add tab switch handler |

No changes needed to:
- `src/types/index.ts`
- `src/reporter/craft-reporter.ts`
- `src/pdf/pdf-generator.ts`
- `src/index.ts`
