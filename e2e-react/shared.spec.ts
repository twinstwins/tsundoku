import { test, expect, register, visit, expectImageLoaded } from '../e2e/helpers';

const react = process.env.EXPECT_REACT_USERS === '1';
test('the directory works through profile navigation, browser back, and reload', async ({ page }, testInfo) => {
  const user = await register(page, true);
  const root = page.locator('[data-react-page="users"]');
  await expect(root).toHaveCount(react ? 1 : 0);
  const link = page.getByRole('link', { name: user.name, exact: true });
  const row = page.getByRole('listitem').filter({ has: link });
  await expectImageLoaded(row.locator('img'));
  await page.evaluate(() => { (window as any).__directoryVisit = 'same-document'; });
  await link.click();
  await expect(page.getByRole('heading', { name: `${user.name}のページ`, exact: true })).toBeVisible();
  expect(await page.evaluate(() => (window as any).__directoryVisit)).toBe('same-document');
  await expect(page.locator('[data-react-page]')).toHaveCount(0);
  await page.goBack();
  await expect(page.getByRole('link', { name: user.name, exact: true })).toHaveCount(1);
  await expect(root).toHaveCount(react ? 1 : 0);
  await page.reload();
  await expect(page.getByRole('link', { name: user.name, exact: true })).toHaveCount(1);
  await visit(page, '/users');
  await expect(page.getByRole('heading', { name: '全てのユーザー' })).toBeVisible();
  await expect(page.getByRole('link', { name: user.name, exact: true })).toHaveCount(1);
  if (testInfo.project.use.isMobile) {
    const width = page.viewportSize()!.width;
    expect(await page.evaluate(() => window.innerWidth)).toBe(width);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  }
  if (react) await page.screenshot({ path: testInfo.outputPath(`users-${testInfo.project.name}.png`), fullPage: !testInfo.project.use.isMobile });
});
