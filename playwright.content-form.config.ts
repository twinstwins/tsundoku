import { defineConfig } from '@playwright/test';
import base from './playwright.config';

export default defineConfig({
  ...base, testDir: './e2e-content-form',
  testMatch: process.env.EXPECT_REACT_CONTENT_FORM === '1' ? '**/*.spec.ts' : '**/shared.spec.ts',
  outputDir: 'test-results/content-form',
  reporter: [['list'], ['html', { outputFolder: 'playwright-report/content-form', open: 'never' }]],
});
