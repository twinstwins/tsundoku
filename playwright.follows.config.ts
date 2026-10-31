import { defineConfig } from '@playwright/test';
import base from './playwright.config';

export default defineConfig({
  ...base, testDir: './e2e-follows',
  testMatch: process.env.EXPECT_REACT_FOLLOWS === '1' ? '**/*.spec.ts' : '**/shared.spec.ts',
  outputDir: 'test-results/follows',
  reporter: [['list'], ['html', { outputFolder: 'playwright-report/follows', open: 'never' }]],
});
