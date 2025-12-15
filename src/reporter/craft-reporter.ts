import type {
  Reporter,
  FullConfig,
  Suite,
  TestCase,
  TestResult,
  FullResult
} from '@playwright/test/reporter';
import * as fs from 'fs';
import * as path from 'path';
import { TestEntry, ReportData, TestMetadata, ReporterOptions } from '../types';

class CraftReporter implements Reporter {
  private tests: TestEntry[] = [];
  private startTime: Date = new Date();
  private options: Required<ReporterOptions>;
  private outputDir: string;

  constructor(options: ReporterOptions = {}) {
    this.options = {
      outputDir: options.outputDir || 'craft-report',
      outputFile: options.outputFile || 'report.html',
      open: options.open ?? false,
      title: options.title || 'Craft Test Report',
      logo: options.logo || ''
    };
    this.outputDir = path.resolve(process.cwd(), this.options.outputDir);
  }

  onBegin(_config: FullConfig, suite: Suite): void {
    this.startTime = new Date();
    const totalTests = suite.allTests().length;
    console.log(`\n[CraftReporter] Starting test run with ${totalTests} tests`);
  }

  onTestEnd(test: TestCase, result: TestResult): void {
    const metadata = this.extractMetadata(test);

    const entry: TestEntry = {
      testId: test.id,
      name: test.title,
      fullTitle: test.titlePath().join(' > '),
      status: result.status,
      duration: result.duration,
      errorTrace: this.formatErrors(result.errors),
      metadata,
      filePath: test.location.file,
      line: test.location.line,
      startTime: result.startTime.toISOString(),
      retries: result.retry
    };

    // Replace existing test entry if this is a retry (keep only the latest run)
    const existingIndex = this.tests.findIndex(t => t.testId === test.id);
    if (existingIndex !== -1) {
      this.tests[existingIndex] = entry;
    } else {
      this.tests.push(entry);
    }

    // Log progress
    const statusSymbol = result.status === 'passed' ? '✓' : result.status === 'failed' ? '✗' : '○';
    console.log(`  ${statusSymbol} ${test.title}`);
  }

  private extractMetadata(test: TestCase): TestMetadata {
    const metadata: TestMetadata = {};
    const annotations = test.annotations;

    for (const annotation of annotations) {
      const type = annotation.type.toLowerCase();
      const value = annotation.description || '';

      switch (type) {
        case 'epic':
          metadata.epic = value;
          break;
        case 'feature':
          metadata.feature = value;
          break;
        case 'story':
          metadata.story = value;
          break;
        case 'suite':
          metadata.suite = value;
          break;
        case 'subsuite':
          metadata.subSuite = value;
          break;
        case 'parentsuite':
          metadata.parentSuite = value;
          break;
        case 'severity':
          metadata.severity = value as TestMetadata['severity'];
          break;
        case 'owner':
          metadata.owner = value;
          break;
        case 'tag':
          metadata.tags = metadata.tags || [];
          metadata.tags.push(value);
          break;
        case 'description':
          metadata.description = value;
          break;
        default:
          // Store unknown annotations as parameters
          if (value) {
            metadata.parameters = metadata.parameters || {};
            metadata.parameters[type] = value;
          }
      }
    }

    // Extract suite hierarchy from titlePath if not set via annotations
    const titlePath = test.titlePath();
    if (titlePath.length > 1) {
      // First element is usually the file name, use describe blocks for suite hierarchy
      if (!metadata.parentSuite && titlePath.length > 1) {
        metadata.parentSuite = titlePath[0];
      }
      if (!metadata.suite && titlePath.length > 2) {
        metadata.suite = titlePath[1];
      }
      if (!metadata.subSuite && titlePath.length > 3) {
        metadata.subSuite = titlePath[2];
      }
    }

    return metadata;
  }

  private formatErrors(errors: TestResult['errors']): string | undefined {
    if (!errors || errors.length === 0) return undefined;

    return errors
      .map((error) => {
        let message = error.message || '';
        if (error.stack) {
          message += '\n' + error.stack;
        }
        return message;
      })
      .join('\n---\n');
  }

  async onEnd(result: FullResult): Promise<void> {
    const duration = Date.now() - this.startTime.getTime();

    const reportData: ReportData = {
      timestamp: new Date().toISOString(),
      totalTests: this.tests.length,
      passed: this.tests.filter((t) => t.status === 'passed').length,
      failed: this.tests.filter((t) => t.status === 'failed' || t.status === 'timedOut').length,
      skipped: this.tests.filter((t) => t.status === 'skipped').length,
      duration,
      tests: this.tests,
      comments: this.loadExistingComments()
    };

    // Ensure output directory exists
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }

    // Generate HTML report
    await this.generateHTMLReport(reportData);

    // Save JSON data
    const jsonPath = path.join(this.outputDir, 'report-data.json');
    fs.writeFileSync(jsonPath, JSON.stringify(reportData, null, 2));

    // Summary
    console.log(`\n[CraftReporter] Test run completed: ${result.status}`);
    console.log(`  Total: ${reportData.totalTests}`);
    console.log(`  Passed: ${reportData.passed}`);
    console.log(`  Failed: ${reportData.failed}`);
    console.log(`  Skipped: ${reportData.skipped}`);
    console.log(`  Duration: ${(duration / 1000).toFixed(2)}s`);
    console.log(`\n[CraftReporter] Report generated: ${path.join(this.outputDir, this.options.outputFile)}`);

    // Open in browser if requested
    if (this.options.open) {
      const reportPath = path.join(this.outputDir, this.options.outputFile);
      const { exec } = await import('child_process');
      const command = process.platform === 'darwin'
        ? `open "${reportPath}"`
        : process.platform === 'win32'
          ? `start "" "${reportPath}"`
          : `xdg-open "${reportPath}"`;
      exec(command);
    }
  }

  private loadExistingComments(): Record<string, string> {
    const commentsPath = path.join(this.outputDir, 'comments.json');
    if (fs.existsSync(commentsPath)) {
      try {
        return JSON.parse(fs.readFileSync(commentsPath, 'utf-8'));
      } catch {
        return {};
      }
    }
    return {};
  }

  private async generateHTMLReport(data: ReportData): Promise<void> {
    const templatePath = path.join(__dirname, '../html/template.html');
    const cssPath = path.join(__dirname, '../html/styles.css');
    const jsPath = path.join(__dirname, '../html/report.js');

    let template: string;
    let css: string;
    let js: string;

    // Read template files
    if (fs.existsSync(templatePath)) {
      template = fs.readFileSync(templatePath, 'utf-8');
      css = fs.existsSync(cssPath) ? fs.readFileSync(cssPath, 'utf-8') : '';
      js = fs.existsSync(jsPath) ? fs.readFileSync(jsPath, 'utf-8') : '';
    } else {
      // Fallback: try from src directory (development mode)
      const srcTemplatePath = path.join(__dirname, '../../src/html/template.html');
      const srcCssPath = path.join(__dirname, '../../src/html/styles.css');
      const srcJsPath = path.join(__dirname, '../../src/html/report.js');

      template = fs.existsSync(srcTemplatePath)
        ? fs.readFileSync(srcTemplatePath, 'utf-8')
        : this.getDefaultTemplate();
      css = fs.existsSync(srcCssPath) ? fs.readFileSync(srcCssPath, 'utf-8') : '';
      js = fs.existsSync(srcJsPath) ? fs.readFileSync(srcJsPath, 'utf-8') : '';
    }

    // Generate logo HTML if logo option is set
    let logoHtml = '';
    if (this.options.logo) {
      const logoPath = path.resolve(process.cwd(), this.options.logo);
      if (fs.existsSync(logoPath)) {
        const logoBuffer = fs.readFileSync(logoPath);
        const logoBase64 = logoBuffer.toString('base64');
        const ext = path.extname(logoPath).toLowerCase();
        const mimeType = ext === '.png' ? 'image/png' : ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : ext === '.svg' ? 'image/svg+xml' : 'image/png';
        logoHtml = `<img src="data:${mimeType};base64,${logoBase64}" alt="Logo">`;
      }
    }

    // Inject data, CSS, JS, and logo into template
    const html = template
      .replace('/* INJECT_STYLES */', css)
      .replace('/* INJECT_SCRIPT */', js)
      .replace('/* INJECT_DATA */', JSON.stringify(data))
      .replace(/\{\{TITLE\}\}/g, this.options.title)
      .replace('<!-- INJECT_LOGO -->', logoHtml);

    const outputPath = path.join(this.outputDir, this.options.outputFile);
    fs.writeFileSync(outputPath, html);
  }

  private getDefaultTemplate(): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>{{TITLE}}</title>
  <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js"></script>
  <style>/* INJECT_STYLES */</style>
</head>
<body>
  <div id="app">Loading report...</div>
  <script>
    const REPORT_DATA = /* INJECT_DATA */;
    /* INJECT_SCRIPT */
  </script>
</body>
</html>`;
  }
}

export default CraftReporter;
