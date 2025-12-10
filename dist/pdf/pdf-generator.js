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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generatePDF = generatePDF;
exports.generatePDFFromData = generatePDFFromData;
exports.mergeComments = mergeComments;
const puppeteer_1 = __importDefault(require("puppeteer"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
/**
 * Generate PDF from an HTML report file
 */
async function generatePDF(htmlPath, options = {}) {
    const absolutePath = path.resolve(htmlPath);
    if (!fs.existsSync(absolutePath)) {
        throw new Error(`HTML file not found: ${absolutePath}`);
    }
    console.log('[PDF Generator] Launching browser...');
    const browser = await puppeteer_1.default.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    try {
        const page = await browser.newPage();
        // Set wide viewport to prevent responsive CSS from hiding columns
        await page.setViewport({ width: 1400, height: 900 });
        // Load the HTML report
        console.log('[PDF Generator] Loading report...');
        await page.goto(`file://${absolutePath}`, {
            waitUntil: 'networkidle0',
            timeout: 30000
        });
        // Wait for Chart.js to render
        console.log('[PDF Generator] Waiting for chart to render...');
        await page.waitForFunction(() => {
            const canvas = document.querySelector('#results-chart');
            return canvas && canvas.getContext('2d');
        }, { timeout: 10000 }).catch(() => {
            console.log('[PDF Generator] Chart not found or timeout - continuing anyway');
        });
        // Additional wait for chart animation to complete
        await new Promise(resolve => setTimeout(resolve, 1000));
        // Expand all error traces for PDF
        await page.evaluate(() => {
            document.querySelectorAll('.error-content').forEach((el) => {
                el.style.display = 'block';
            });
            document.querySelectorAll('.error-toggle').forEach((el) => {
                el.style.display = 'none';
            });
        });
        // Extract report title from page
        const reportTitle = await page.evaluate(() => {
            const h1 = document.querySelector('.header h1');
            return h1?.textContent || document.title || 'Test Report';
        });
        // Generate PDF
        console.log('[PDF Generator] Generating PDF...');
        const pdfBuffer = await page.pdf({
            format: options.format || 'A4',
            landscape: options.landscape ?? true,
            printBackground: true,
            margin: {
                top: '20mm',
                right: '15mm',
                bottom: '20mm',
                left: '15mm'
            },
            displayHeaderFooter: true,
            headerTemplate: `
        <div style="font-size: 9px; color: #64748b; width: 100%; text-align: center; padding: 0 15mm;">
          ${reportTitle}
        </div>
      `,
            footerTemplate: `
        <div style="font-size: 9px; color: #64748b; width: 100%; text-align: center; padding: 0 15mm;">
          Page <span class="pageNumber"></span> of <span class="totalPages"></span>
        </div>
      `
        });
        // Optionally save to file
        if (options.outputPath) {
            const outputDir = path.dirname(options.outputPath);
            if (!fs.existsSync(outputDir)) {
                fs.mkdirSync(outputDir, { recursive: true });
            }
            fs.writeFileSync(options.outputPath, pdfBuffer);
            console.log(`[PDF Generator] PDF saved: ${options.outputPath}`);
        }
        return pdfBuffer;
    }
    finally {
        await browser.close();
    }
}
/**
 * Generate PDF directly from report data (creates temp HTML)
 */
async function generatePDFFromData(reportData, options = {}) {
    const tempDir = path.join(process.cwd(), '.craft-report-temp');
    const tempHtmlPath = path.join(tempDir, 'temp-report.html');
    // Ensure temp directory exists
    if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
    }
    try {
        // Read template files from package
        const packageDir = path.join(__dirname, '..');
        const templatePath = path.join(packageDir, 'html', 'template.html');
        const cssPath = path.join(packageDir, 'html', 'styles.css');
        const jsPath = path.join(packageDir, 'html', 'report.js');
        // Fallback to src directory for development
        const srcTemplateDir = path.join(__dirname, '../../src/html');
        let template;
        let css;
        let js;
        if (fs.existsSync(templatePath)) {
            template = fs.readFileSync(templatePath, 'utf-8');
            css = fs.readFileSync(cssPath, 'utf-8');
            js = fs.readFileSync(jsPath, 'utf-8');
        }
        else if (fs.existsSync(srcTemplateDir)) {
            template = fs.readFileSync(path.join(srcTemplateDir, 'template.html'), 'utf-8');
            css = fs.readFileSync(path.join(srcTemplateDir, 'styles.css'), 'utf-8');
            js = fs.readFileSync(path.join(srcTemplateDir, 'report.js'), 'utf-8');
        }
        else {
            throw new Error('Template files not found');
        }
        // Inject data into template
        const html = template
            .replace('/* INJECT_STYLES */', css)
            .replace('/* INJECT_SCRIPT */', js)
            .replace('/* INJECT_DATA */', JSON.stringify(reportData))
            .replace(/\{\{TITLE\}\}/g, 'Craft Test Report');
        fs.writeFileSync(tempHtmlPath, html);
        // Generate PDF
        const pdfBuffer = await generatePDF(tempHtmlPath, options);
        return pdfBuffer;
    }
    finally {
        // Cleanup temp files
        if (fs.existsSync(tempHtmlPath)) {
            fs.unlinkSync(tempHtmlPath);
        }
        if (fs.existsSync(tempDir)) {
            try {
                fs.rmdirSync(tempDir);
            }
            catch {
                // Directory not empty, ignore
            }
        }
    }
}
/**
 * Merge comments into report data
 */
function mergeComments(reportData, comments) {
    return {
        ...reportData,
        comments: {
            ...reportData.comments,
            ...comments
        }
    };
}
//# sourceMappingURL=pdf-generator.js.map