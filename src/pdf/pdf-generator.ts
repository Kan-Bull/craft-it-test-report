import puppeteer from 'puppeteer';
import * as fs from 'fs';
import * as path from 'path';
import { PDFOptions, ReportData } from '../types';

/**
 * Generate PDF from an HTML report file
 */
export async function generatePDF(
  htmlPath: string,
  options: PDFOptions = {}
): Promise<Uint8Array> {
  const absolutePath = path.resolve(htmlPath);

  if (!fs.existsSync(absolutePath)) {
    throw new Error(`HTML file not found: ${absolutePath}`);
  }

  console.log('[PDF Generator] Launching browser...');
  const browser = await puppeteer.launch({
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
    await page.waitForFunction(
      () => {
        const canvas = document.querySelector('#results-chart') as HTMLCanvasElement;
        return canvas && canvas.getContext('2d');
      },
      { timeout: 10000 }
    ).catch(() => {
      console.log('[PDF Generator] Chart not found or timeout - continuing anyway');
    });

    // Additional wait for chart animation to complete
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Expand all error traces for PDF
    await page.evaluate(() => {
      document.querySelectorAll('.error-content').forEach((el: Element) => {
        (el as HTMLElement).style.display = 'block';
      });
      document.querySelectorAll('.error-toggle').forEach((el: Element) => {
        (el as HTMLElement).style.display = 'none';
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
  } finally {
    await browser.close();
  }
}

/**
 * Generate PDF directly from report data (creates temp HTML)
 */
export async function generatePDFFromData(
  reportData: ReportData,
  options: PDFOptions = {}
): Promise<Uint8Array> {
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

    let template: string;
    let css: string;
    let js: string;

    if (fs.existsSync(templatePath)) {
      template = fs.readFileSync(templatePath, 'utf-8');
      css = fs.readFileSync(cssPath, 'utf-8');
      js = fs.readFileSync(jsPath, 'utf-8');
    } else if (fs.existsSync(srcTemplateDir)) {
      template = fs.readFileSync(path.join(srcTemplateDir, 'template.html'), 'utf-8');
      css = fs.readFileSync(path.join(srcTemplateDir, 'styles.css'), 'utf-8');
      js = fs.readFileSync(path.join(srcTemplateDir, 'report.js'), 'utf-8');
    } else {
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
  } finally {
    // Cleanup temp files
    if (fs.existsSync(tempHtmlPath)) {
      fs.unlinkSync(tempHtmlPath);
    }
    if (fs.existsSync(tempDir)) {
      try {
        fs.rmdirSync(tempDir);
      } catch {
        // Directory not empty, ignore
      }
    }
  }
}

/**
 * Merge comments into report data
 */
export function mergeComments(
  reportData: ReportData,
  comments: Record<string, string>
): ReportData {
  return {
    ...reportData,
    comments: {
      ...reportData.comments,
      ...comments
    }
  };
}
