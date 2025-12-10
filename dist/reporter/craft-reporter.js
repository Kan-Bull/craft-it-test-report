"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
class CraftReporter {
    constructor(options = {}) {
        this.tests = [];
        this.startTime = new Date();
        this.options = {
            outputDir: options.outputDir || 'craft-report',
            outputFile: options.outputFile || 'report.html',
            open: options.open ?? false,
            title: options.title || 'Craft Test Report',
            logo: options.logo || ''
        };
        this.outputDir = path.resolve(process.cwd(), this.options.outputDir);
    }
    onBegin(_config, suite) {
        this.startTime = new Date();
        const totalTests = suite.allTests().length;
        console.log(`\n[CraftReporter] Starting test run with ${totalTests} tests`);
    }
    onTestEnd(test, result) {
        const metadata = this.extractMetadata(test);
        const entry = {
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
        this.tests.push(entry);
        // Log progress
        const statusSymbol = result.status === 'passed' ? '✓' : result.status === 'failed' ? '✗' : '○';
        console.log(`  ${statusSymbol} ${test.title}`);
    }
    extractMetadata(test) {
        const metadata = {};
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
                    metadata.severity = value;
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
    formatErrors(errors) {
        if (!errors || errors.length === 0)
            return undefined;
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
    async onEnd(result) {
        const duration = Date.now() - this.startTime.getTime();
        const reportData = {
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
            const { exec } = await Promise.resolve().then(() => __importStar(require('child_process')));
            const command = process.platform === 'darwin'
                ? `open "${reportPath}"`
                : process.platform === 'win32'
                    ? `start "" "${reportPath}"`
                    : `xdg-open "${reportPath}"`;
            exec(command);
        }
    }
    loadExistingComments() {
        const commentsPath = path.join(this.outputDir, 'comments.json');
        if (fs.existsSync(commentsPath)) {
            try {
                return JSON.parse(fs.readFileSync(commentsPath, 'utf-8'));
            }
            catch {
                return {};
            }
        }
        return {};
    }
    async generateHTMLReport(data) {
        const templatePath = path.join(__dirname, '../html/template.html');
        const cssPath = path.join(__dirname, '../html/styles.css');
        const jsPath = path.join(__dirname, '../html/report.js');
        let template;
        let css;
        let js;
        // Read template files
        if (fs.existsSync(templatePath)) {
            template = fs.readFileSync(templatePath, 'utf-8');
            css = fs.existsSync(cssPath) ? fs.readFileSync(cssPath, 'utf-8') : '';
            js = fs.existsSync(jsPath) ? fs.readFileSync(jsPath, 'utf-8') : '';
        }
        else {
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
    getDefaultTemplate() {
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
exports.default = CraftReporter;
//# sourceMappingURL=craft-reporter.js.map