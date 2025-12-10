/**
 * Allure-style metadata extracted from Playwright annotations
 */
export interface TestMetadata {
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
/**
 * Single test entry in the report
 */
export interface TestEntry {
    testId: string;
    name: string;
    fullTitle: string;
    status: 'passed' | 'failed' | 'timedOut' | 'skipped' | 'interrupted';
    duration: number;
    errorTrace?: string;
    metadata: TestMetadata;
    filePath: string;
    line: number;
    startTime: string;
    retries: number;
}
/**
 * Complete report data structure
 */
export interface ReportData {
    timestamp: string;
    totalTests: number;
    passed: number;
    failed: number;
    skipped: number;
    duration: number;
    tests: TestEntry[];
    comments: Record<string, string>;
}
/**
 * Reporter configuration options
 */
export interface ReporterOptions {
    /** Output directory for the report (default: 'craft-report') */
    outputDir?: string;
    /** Output HTML filename (default: 'report.html') */
    outputFile?: string;
    /** Open report in browser after generation (default: false) */
    open?: boolean;
    /** Report title (default: 'Craft Test Report') */
    title?: string;
    /** Path to logo image to include in the report header */
    logo?: string;
}
/**
 * PDF generation options
 */
export interface PDFOptions {
    /** Output PDF path */
    outputPath?: string;
    /** Page format (default: 'A4') */
    format?: 'A4' | 'Letter';
    /** Use landscape orientation (default: false) */
    landscape?: boolean;
    /** Include charts in PDF (default: true) */
    includeCharts?: boolean;
}
//# sourceMappingURL=index.d.ts.map