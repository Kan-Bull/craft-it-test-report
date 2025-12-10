#!/usr/bin/env node

import { program } from 'commander';
import * as fs from 'fs';
import * as path from 'path';
import { generatePDF, generatePDFFromData, mergeComments } from './pdf/pdf-generator';
import { ReportData } from './types';

program
  .name('craft-report')
  .description('Playwright Test Report Generator - HTML reports with PDF export')
  .version('1.0.0');

// PDF generation command
program
  .command('pdf')
  .description('Generate PDF from HTML report or JSON data')
  .argument('<input>', 'Path to HTML report or JSON data file')
  .option('-o, --output <path>', 'Output PDF path', 'report.pdf')
  .option('-f, --format <format>', 'Page format (A4, Letter)', 'A4')
  .option('-l, --landscape', 'Use landscape orientation')
  .action(async (input: string, options) => {
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
        await generatePDF(inputPath, {
          outputPath,
          format: options.format as 'A4' | 'Letter',
          landscape: options.landscape
        });
      } else if (input.endsWith('.json')) {
        const data: ReportData = JSON.parse(fs.readFileSync(inputPath, 'utf-8'));
        await generatePDFFromData(data, {
          outputPath,
          format: options.format as 'A4' | 'Letter',
          landscape: options.landscape
        });
      } else {
        console.error('Error: Input must be .html or .json file');
        process.exit(1);
      }

      console.log(`\nPDF generated successfully: ${outputPath}`);
    } catch (error) {
      console.error('Error generating PDF:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

// Merge comments command
program
  .command('merge-comments')
  .description('Merge comments JSON into report data')
  .argument('<report>', 'Path to report JSON file')
  .argument('<comments>', 'Path to comments JSON file')
  .option('-o, --output <path>', 'Output path (defaults to overwriting report)')
  .action((reportPath: string, commentsPath: string, options) => {
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

      const reportData: ReportData = JSON.parse(fs.readFileSync(resolvedReportPath, 'utf-8'));
      const comments: Record<string, string> = JSON.parse(fs.readFileSync(resolvedCommentsPath, 'utf-8'));

      const mergedData = mergeComments(reportData, comments);

      const outputPath = options.output ? path.resolve(options.output) : resolvedReportPath;
      fs.writeFileSync(outputPath, JSON.stringify(mergedData, null, 2));

      console.log(`Comments merged successfully: ${outputPath}`);
      console.log(`Total comments: ${Object.keys(mergedData.comments).length}`);
    } catch (error) {
      console.error('Error merging comments:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

// Info command
program
  .command('info')
  .description('Display information about a report')
  .argument('<report>', 'Path to report HTML or JSON file')
  .action((reportPath: string) => {
    try {
      const resolvedPath = path.resolve(reportPath);

      if (!fs.existsSync(resolvedPath)) {
        console.error(`Error: File not found: ${resolvedPath}`);
        process.exit(1);
      }

      let data: ReportData;

      if (reportPath.endsWith('.json')) {
        data = JSON.parse(fs.readFileSync(resolvedPath, 'utf-8'));
      } else if (reportPath.endsWith('.html')) {
        // Try to find accompanying JSON file
        const jsonPath = resolvedPath.replace('.html', '-data.json');
        if (!fs.existsSync(jsonPath)) {
          console.error('Error: Could not find report-data.json file');
          process.exit(1);
        }
        data = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
      } else {
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
    } catch (error) {
      console.error('Error reading report:', error instanceof Error ? error.message : error);
      process.exit(1);
    }
  });

program.parse();

// Export for programmatic use
export { generatePDF, generatePDFFromData, mergeComments } from './pdf/pdf-generator';
export { default as CraftReporter } from './reporter/craft-reporter';
export * from './types';
