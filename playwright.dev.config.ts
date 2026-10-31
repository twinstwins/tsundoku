import { defineConfig } from '@playwright/test';
import base from './playwright.config';
export default defineConfig({ ...base, testDir: './e2e-dev', outputDir: 'test-results/dev', reporter: [['list'], ['html', { outputFolder: 'playwright-report/dev', open: 'never' }]] });
