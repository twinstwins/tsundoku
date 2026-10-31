import { defineConfig } from '@playwright/test';
import base from './playwright.config';

export default defineConfig({
  ...base, testDir: './e2e-profile',
  testMatch: process.env.EXPECT_REACT_PROFILE === '1' ? '**/*.spec.ts' : '**/shared.spec.ts',
  outputDir: 'test-results/profile',
  reporter: [['list'], ['html', { outputFolder: 'playwright-report/profile', open: 'never' }]],
});
