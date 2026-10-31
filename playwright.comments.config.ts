import { defineConfig } from '@playwright/test';
import base from './playwright.config';

export default defineConfig({
  ...base, testDir: './e2e-comments',
  testMatch: process.env.EXPECT_REACT_COMMENTS === '1' ? '**/*.spec.ts' : '**/shared.spec.ts',
  outputDir: 'test-results/comments',
  reporter: [['list'], ['html', { outputFolder: 'playwright-report/comments', open: 'never' }]],
});
