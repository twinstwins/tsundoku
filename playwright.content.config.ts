import { defineConfig } from '@playwright/test';
import base from './playwright.config';

export default defineConfig({
  ...base, testDir: './e2e-content',
  testMatch: process.env.EXPECT_REACT_CONTENT_DETAIL === '1' ? '**/*.spec.ts' : '**/shared.spec.ts',
  outputDir: 'test-results/content',
  reporter: [['list'], ['html', { outputFolder: 'playwright-report/content', open: 'never' }]],
});
