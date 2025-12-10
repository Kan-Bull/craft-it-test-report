#!/usr/bin/env node
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
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CraftReporter = exports.mergeComments = exports.generatePDFFromData = exports.generatePDF = void 0;
const commander_1 = require("commander");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const pdf_generator_1 = require("./pdf/pdf-generator");
commander_1.program
    .name('craft-report')
    .description('Playwright Test Report Generator - HTML reports with PDF export')
    .version('1.0.0');
// PDF generation command
commander_1.program
    .command('pdf')
    .description('Generate PDF from HTML report or JSON data')
    .argument('<input>', 'Path to HTML report or JSON data file')
    .option('-o, --output <path>', 'Output PDF path', 'report.pdf')
    .option('-f, --format <format>', 'Page format (A4, Letter)', 'A4')
    .option('-l, --landscape', 'Use landscape orientation')
    .action(async (input, options) => {
    try {
        const inputPath = path.resolve(input);
        if (!fs.existsSync(inputPath)) {
            console.error(`Error: File not found: ${inputPath}`);
            process.exit(1);
        }
        const outputPath = path.resolve(options.output);
        console.log(`\nGenerating PDF from: ${inputPath}`);
        console.log(`Output: ${outputPath}\n`);
        if (input.endsWith('.html')) {
            await (0, pdf_generator_1.generatePDF)(inputPath, {
                outputPath,
                format: options.format,
                landscape: options.landscape
            });
        }
        else if (input.endsWith('.json')) {
            const data = JSON.parse(fs.readFileSync(inputPath, 'utf-8'));
            await (0, pdf_generator_1.generatePDFFromData)(data, {
                outputPath,
                format: options.format,
                landscape: options.landscape
            });
        }
        else {
            console.error('Error: Input must be .html or .json file');
            process.exit(1);
        }
        console.log(`\nPDF generated successfully: ${outputPath}`);
    }
    catch (error) {
        console.error('Error generating PDF:', error instanceof Error ? error.message : error);
        process.exit(1);
    }
});
// Merge comments command
commander_1.program
    .command('merge-comments')
    .description('Merge comments JSON into report data')
    .argument('<report>', 'Path to report JSON file')
    .argument('<comments>', 'Path to comments JSON file')
    .option('-o, --output <path>', 'Output path (defaults to overwriting report)')
    .action((reportPath, commentsPath, options) => {
    try {
        const resolvedReportPath = path.resolve(reportPath);
        const resolvedCommentsPath = path.resolve(commentsPath);
        if (!fs.existsSync(resolvedReportPath)) {
            console.error(`Error: Report file not found: ${resolvedReportPath}`);
            process.exit(1);
        }
        if (!fs.existsSync(resolvedCommentsPath)) {
            console.error(`Error: Comments file not found: ${resolvedCommentsPath}`);
            process.exit(1);
        }
        const reportData = JSON.parse(fs.readFileSync(resolvedReportPath, 'utf-8'));
        const comments = JSON.parse(fs.readFileSync(resolvedCommentsPath, 'utf-8'));
        const mergedData = (0, pdf_generator_1.mergeComments)(reportData, comments);
        const outputPath = options.output ? path.resolve(options.output) : resolvedReportPath;
        fs.writeFileSync(outputPath, JSON.stringify(mergedData, null, 2));
        console.log(`Comments merged successfully: ${outputPath}`);
        console.log(`Total comments: ${Object.keys(mergedData.comments).length}`);
    }
    catch (error) {
        console.error('Error merging comments:', error instanceof Error ? error.message : error);
        process.exit(1);
    }
});
// Info command
commander_1.program
    .command('info')
    .description('Display information about a report')
    .argument('<report>', 'Path to report HTML or JSON file')
    .action((reportPath) => {
    try {
        const resolvedPath = path.resolve(reportPath);
        if (!fs.existsSync(resolvedPath)) {
            console.error(`Error: File not found: ${resolvedPath}`);
            process.exit(1);
        }
        let data;
        if (reportPath.endsWith('.json')) {
            data = JSON.parse(fs.readFileSync(resolvedPath, 'utf-8'));
        }
        else if (reportPath.endsWith('.html')) {
            // Try to find accompanying JSON file
            const jsonPath = resolvedPath.replace('.html', '-data.json');
            if (!fs.existsSync(jsonPath)) {
                console.error('Error: Could not find report-data.json file');
                process.exit(1);
            }
            data = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
        }
        else {
            console.error('Error: File must be .html or .json');
            process.exit(1);
        }
        console.log('\n=== Craft Test Report Info ===\n');
        console.log(`Timestamp: ${new Date(data.timestamp).toLocaleString()}`);
        console.log(`Duration:  ${(data.duration / 1000).toFixed(2)}s`);
        console.log('');
        console.log('Results:');
        console.log(`  Total:   ${data.totalTests}`);
        console.log(`  Passed:  ${data.passed} (${((data.passed / data.totalTests) * 100).toFixed(1)}%)`);
        console.log(`  Failed:  ${data.failed} (${((data.failed / data.totalTests) * 100).toFixed(1)}%)`);
        console.log(`  Skipped: ${data.skipped} (${((data.skipped / data.totalTests) * 100).toFixed(1)}%)`);
        console.log('');
        console.log(`Comments: ${Object.keys(data.comments).length} tests have comments`);
        console.log('');
        // Show failed tests
        const failedTests = data.tests.filter(t => t.status === 'failed' || t.status === 'timedOut');
        if (failedTests.length > 0) {
            console.log('Failed Tests:');
            failedTests.forEach(test => {
                console.log(`  - ${test.name}`);
                if (test.metadata.owner) {
                    console.log(`    Owner: ${test.metadata.owner}`);
                }
            });
        }
    }
    catch (error) {
        console.error('Error reading report:', error instanceof Error ? error.message : error);
        process.exit(1);
    }
});
commander_1.program.parse();
// Export for programmatic use
var pdf_generator_2 = require("./pdf/pdf-generator");
Object.defineProperty(exports, "generatePDF", { enumerable: true, get: function () { return pdf_generator_2.generatePDF; } });
Object.defineProperty(exports, "generatePDFFromData", { enumerable: true, get: function () { return pdf_generator_2.generatePDFFromData; } });
Object.defineProperty(exports, "mergeComments", { enumerable: true, get: function () { return pdf_generator_2.mergeComments; } });
var craft_reporter_1 = require("./reporter/craft-reporter");
Object.defineProperty(exports, "CraftReporter", { enumerable: true, get: function () { return __importDefault(craft_reporter_1).default; } });
__exportStar(require("./types"), exports);
//# sourceMappingURL=index.js.map