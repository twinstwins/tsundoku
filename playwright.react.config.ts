import { defineConfig } from '@playwright/test';
import base from './playwright.config';
export default defineConfig({ ...base, testDir: './e2e-react', testMatch: process.env.EXPECT_REACT_USERS === '1' ? '**/*.spec.ts' : '**/shared.spec.ts', outputDir: 'test-results/react', reporter: [['list'], ['html', { outputFolder: 'playwright-report/react', open: 'never' }]] });
