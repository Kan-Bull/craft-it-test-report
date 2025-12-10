# Craft Test Report - Implementation Plan

## Overview

Custom Playwright reporter that generates a static HTML test report with:
- Test results table (ID, name, description, status, error trace)
- Editable comment fields per test (for error interpretation)
- Pass/fail ratio chart
- Programmatic PDF export (CI/CD ready)
- Native Playwright annotation-based metadata (epic, feature, suite, tags, severity, owner)

## Project Structure

```
craft-test-report/
├── package.json
├── tsconfig.json
├── src/
│   ├── reporter/
│   │   └── craft-reporter.ts      # Custom Playwright reporter
│   ├── html/
│   │   ├── template.html          # Report template
│   │   ├── styles.css             # Styling (print-friendly)
│   │   └── report.js              # Client-side interactivity
│   ├── pdf/
│   │   └── pdf-generator.ts       # Puppeteer PDF generation
│   ├── types/
│   │   └── index.ts               # TypeScript interfaces
│   └── index.ts                   # CLI entry point
└── example/
    └── example.spec.ts            # Example test with metadata
```

## Tech Stack

| Technology | Purpose |
|------------|---------|
| TypeScript | Type safety, Playwright ecosystem alignment |
| Playwright Reporter API | Native test data capture |
| Puppeteer | Headless PDF generation (renders charts correctly) |
| Chart.js (CDN) | Pass/fail donut chart |
| Vanilla JS/CSS | No build step, standalone HTML |

## Test Annotation Syntax (Native Playwright)

Replacing allure-playwright with native annotations:

```typescript
import { test, expect } from '@playwright/test';

test.describe('LCPD : GUP Final PD surfaced on Summary', () => {
  test('Validates that GUP Final PD is correctly calculated', {
    annotation: [
      { type: 'epic', description: 'Workflow' },
      { type: 'feature', description: 'GUP in Summary' },
      { type: 'parentSuite', description: 'E2E-Scenarios' },
      { type: 'suite', description: 'LCPD Scorecard' },
      { type: 'subSuite', description: 'UI' },
      { type: 'tag', description: 'GUP' },
      { type: 'tag', description: 'Summary' },
      { type: 'tag', description: 'ui' },
      { type: 'severity', description: 'blocker' },
      { type: 'owner', description: 'Quentin' },
      { type: 'description', description: 'Verifies GUP Final PD calculation and display' },
    ],
  }, async ({ browser }) => {
    // Test implementation
  });
});
```

## Key Components

### 1. Custom Reporter (`craft-reporter.ts`)

Implements Playwright's `Reporter` interface:

```typescript
interface Reporter {
  onBegin(config: FullConfig, suite: Suite): void;
  onTestEnd(test: TestCase, result: TestResult): void;
  onEnd(result: FullResult): Promise<void>;
}
```

**Responsibilities:**
- Capture test data: testId, name, status, duration, errors
- Extract metadata from `test.annotations` array
- Build suite hierarchy from `test.titlePath()`
- Load existing `comments.json` if present
- Generate `report.html` with embedded data

### 2. HTML Report (`template.html`)

**Layout:**
```
┌─────────────────────────────────────────────────────┐
│  Craft Test Report              [Save] [Export PDF] │
├─────────────────────────────────────────────────────┤
│  ┌──────────┐   Passed: 45  Failed: 3  Skipped: 2  │
│  │  Chart   │   Total: 50   Duration: 2m 34s       │
│  └──────────┘                                       │
├─────────────────────────────────────────────────────┤
│  [Search...________]  [Status: All ▼]  [Epic ▼]    │
├─────────────────────────────────────────────────────┤
│  ID │ Name │ Description │ Status │ Error │ Comment │
│  ───┼──────┼─────────────┼────────┼───────┼─────────│
│  ...│ ...  │ ...         │ PASS   │  -    │ [____]  │
│  ...│ ...  │ ...         │ FAIL   │ trace │ [____]  │
└─────────────────────────────────────────────────────┘
```

**Features:**
- Donut chart for pass/fail/skip ratio
- Sortable, filterable test table
- Expandable error traces
- Inline editable comment textarea per test
- Print-optimized CSS

### 3. PDF Generator (`pdf-generator.ts`)

```typescript
async function generatePDF(htmlPath: string, outputPath: string): Promise<void> {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto(`file://${htmlPath}`, { waitUntil: 'networkidle0' });

  // Wait for Chart.js to render
  await page.waitForFunction(() => {
    const canvas = document.querySelector('#chart');
    return canvas?.getContext('2d');
  });
  await page.waitForTimeout(500); // Chart animation

  await page.pdf({
    path: outputPath,
    format: 'A4',
    printBackground: true,
    margin: { top: '20mm', bottom: '20mm', left: '15mm', right: '15mm' }
  });

  await browser.close();
}
```

### 4. Comment Persistence

**Storage format (`comments.json`):**
```json
{
  "test-id-abc123": "Known flaky test - AUTH-456 race condition",
  "test-id-def456": "Expected failure - feature not deployed yet"
}
```

**Workflow:**
1. Run tests → reporter generates report + loads existing comments
2. Open HTML → add/edit comments
3. Click "Save Comments" → downloads `comments.json`
4. Re-run tests → comments preserved
5. Export PDF → comments included

## Implementation Phases

### Phase 1: Project Setup
- Initialize npm project with TypeScript
- Install: `puppeteer`, `commander`
- Configure `tsconfig.json` (ES modules, strict)
- Create directory structure

### Phase 2: Types & Interfaces
```typescript
// src/types/index.ts
interface TestMetadata {
  epic?: string;
  feature?: string;
  story?: string;
  suite?: string;
  subSuite?: string;
  parentSuite?: string;
  tags?: string[];
  severity?: 'blocker' | 'critical' | 'normal' | 'minor' | 'trivial';
  owner?: string;
  description?: string;
  parameters?: Record<string, string>;
}

interface TestEntry {
  testId: string;
  name: string;
  fullTitle: string;
  status: 'passed' | 'failed' | 'timedOut' | 'skipped';
  duration: number;
  errorTrace?: string;
  metadata: TestMetadata;
  filePath: string;
}

interface ReportData {
  timestamp: string;
  totalTests: number;
  passed: number;
  failed: number;
  skipped: number;
  duration: number;
  tests: TestEntry[];
  comments: Record<string, string>;
}
```

### Phase 3: Custom Reporter
- Implement Reporter interface
- Extract metadata from `test.annotations`
- Format error stack traces
- Generate HTML with embedded JSON data
- Auto-load `comments.json`

### Phase 4: HTML Template & Styling
- Semantic HTML structure
- Chart.js donut chart integration
- Test table with status badges
- Comment textareas
- Print-friendly CSS (`@media print`)

### Phase 5: Client-Side JavaScript
- Chart initialization
- Table rendering from embedded data
- Filter/search functionality
- Comment save (JSON download)
- PDF export trigger

### Phase 6: PDF Generation
- Puppeteer-based generator
- Chart render wait logic
- CLI command: `npx craft-report pdf <input> -o <output>`

### Phase 7: CLI & Packaging
- Commander-based CLI
- `pdf` command
- `merge-comments` command
- npm package configuration

## Files to Create

| File | Lines (est.) | Purpose |
|------|--------------|---------|
| `package.json` | 40 | Dependencies, scripts, bin |
| `tsconfig.json` | 20 | TypeScript configuration |
| `src/types/index.ts` | 50 | TypeScript interfaces |
| `src/reporter/craft-reporter.ts` | 200 | Main reporter logic |
| `src/html/template.html` | 100 | Report HTML structure |
| `src/html/styles.css` | 150 | Report styling |
| `src/html/report.js` | 150 | Client-side interactivity |
| `src/pdf/pdf-generator.ts` | 80 | PDF generation |
| `src/index.ts` | 60 | CLI entry point |
| `example/example.spec.ts` | 40 | Example test file |

## Usage

### Playwright Config
```typescript
// playwright.config.ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
  reporter: [
    ['list'],
    ['./node_modules/craft-test-report/dist/reporter/craft-reporter.js', {
      outputDir: 'test-report',
      open: false
    }]
  ]
});
```

### CLI Commands
```bash
# Generate PDF from report
npx craft-report pdf ./test-report/report.html -o report.pdf

# Merge comments into report
npx craft-report merge-comments ./test-report/data.json ./comments.json
```

### CI/CD Integration
```yaml
# GitHub Actions
- name: Run E2E Tests
  run: npx playwright test

- name: Generate PDF Report
  run: npx craft-report pdf ./test-report/report.html -o report.pdf

- name: Upload Report
  uses: actions/upload-artifact@v4
  with:
    name: test-report
    path: report.pdf
```

## Migration from allure-playwright

Replace this:
```typescript
// OLD: allure-playwright
await epic('Workflow');
await feature('GUP in Summary');
await severity('blocker');
await owner('Quentin');
await tags('GUP', 'Summary');
```

With this:
```typescript
// NEW: Native Playwright annotations
test('test name', {
  annotation: [
    { type: 'epic', description: 'Workflow' },
    { type: 'feature', description: 'GUP in Summary' },
    { type: 'severity', description: 'blocker' },
    { type: 'owner', description: 'Quentin' },
    { type: 'tag', description: 'GUP' },
    { type: 'tag', description: 'Summary' },
  ],
}, async ({ page }) => {
  // test code
});
```

## Success Criteria

- [ ] Reporter captures all test data and metadata
- [ ] HTML report displays all fields correctly
- [ ] Chart renders pass/fail/skip ratio
- [ ] Comments are editable and persist
- [ ] PDF export includes comments and chart
- [ ] Works in CI/CD (headless)
- [ ] No allure-playwright dependency
