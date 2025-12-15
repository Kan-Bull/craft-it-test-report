import { defineConfig, devices } from '@playwright/test';
import * as path from 'path';

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 2,
  workers: process.env.CI ? 1 : undefined,

  reporter: [
    ['list'],
    // Use the Craft Reporter
    [path.join(__dirname, '../dist/reporter/craft-reporter.js'), {
      outputDir: 'craft-report',
      outputFile: 'report.html',
      title: 'EDC Test Report',
      open: false,
      logo: '/Users/titus/Documents/GitHub Repos/Craft-Test-Report/images/Craftit-monogram.png'
    }]
  ],

  use: {
    baseURL: 'https://example.com',
    trace: 'on-first-retry',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
