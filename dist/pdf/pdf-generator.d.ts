import { PDFOptions, ReportData } from '../types';
/**
 * Generate PDF from an HTML report file
 */
export declare function generatePDF(htmlPath: string, options?: PDFOptions): Promise<Uint8Array>;
/**
 * Generate PDF directly from report data (creates temp HTML)
 */
export declare function generatePDFFromData(reportData: ReportData, options?: PDFOptions): Promise<Uint8Array>;
/**
 * Merge comments into report data
 */
export declare function mergeComments(reportData: ReportData, comments: Record<string, string>): ReportData;
//# sourceMappingURL=pdf-generator.d.ts.map