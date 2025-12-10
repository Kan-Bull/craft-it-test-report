import { defineConfig, devices } from '@playwright/test';
import * as path from 'path';

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,

  reporter: [
    ['list'],
    // Use the Craft Reporter
    [path.join(__dirname, '../dist/reporter/craft-reporter.js'), {
      outputDir: 'craft-report',
      outputFile: 'report.html',
      title: 'EDC Test Report',
      open: false,
      logo: '../images/Craftit-monogram.png'
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
