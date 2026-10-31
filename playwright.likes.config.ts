import { defineConfig } from '@playwright/test';
import base from './playwright.config';

export default defineConfig({
  ...base, testDir: './e2e-likes',
  testMatch: process.env.EXPECT_REACT_LIKES === '1' ? '**/*.spec.ts' : '**/shared.spec.ts',
  outputDir: 'test-results/likes',
  reporter: [['list'], ['html', { outputFolder: 'playwright-report/likes', open: 'never' }]],
});
