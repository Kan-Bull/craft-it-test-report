import type { Reporter, FullConfig, Suite, TestCase, TestResult, FullResult } from '@playwright/test/reporter';
import { ReporterOptions } from '../types';
declare class CraftReporter implements Reporter {
    private tests;
    private startTime;
    private options;
    private outputDir;
    constructor(options?: ReporterOptions);
    onBegin(_config: FullConfig, suite: Suite): void;
    onTestEnd(test: TestCase, result: TestResult): void;
    private extractMetadata;
    private formatErrors;
    onEnd(result: FullResult): Promise<void>;
    private loadExistingComments;
    private generateHTMLReport;
    private getDefaultTemplate;
}
export default CraftReporter;
//# sourceMappingURL=craft-reporter.d.ts.map