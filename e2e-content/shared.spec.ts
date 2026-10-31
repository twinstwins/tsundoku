import { test, expect, register, createContent, logout, visit, expectImageLoaded } from '../e2e/helpers';

const react = process.env.EXPECT_REACT_CONTENT_DETAIL === '1';

test('a text post survives profile navigation, browser back, and reload', async ({ page }, testInfo) => {
  const user = await register(page);
  const post = await createContent(page);
  await page.evaluate(() => { (window as any).__contentVisit = 'same-document'; });
  await page.locator(`a[href="${post.path}"]`).first().click();
  const root = page.locator('[data-react-page="content"]');
  await expect(root).toHaveCount(react ? 1 : 0);
  await expect(page.getByText(post.title, { exact: true })).toBeVisible();
  await expect(page.getByText('イメージ未登録', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => (window as any).__contentVisit)).toBe('same-document');
  await page.locator(`a[href="${user.path}"]`).first().click();
  await expect(page.getByRole('heading', { name: `${user.name}のページ`, exact: true })).toBeVisible();
  await page.goBack();
  await expect(page.getByText(post.title, { exact: true })).toHaveCount(1);
  await expect(root).toHaveCount(react ? 1 : 0);
  await page.reload();
  await expect(page.getByText(post.title, { exact: true })).toBeVisible();
  if (testInfo.project.use.isMobile) {
    const width = page.viewportSize()!.width;
    expect(await page.evaluate(() => window.innerWidth)).toBe(width);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  }
});

test('uploaded images render for members and the public guest view remains available', async ({ page }, testInfo) => {
  await register(page, true);
  const post = await createContent(page, true);
  await visit(page, post.path);
  await expect(page.locator('[data-react-page="content"]')).toHaveCount(react ? 1 : 0);
  const photo = page.locator('img[src*="/uploads/photo/image/"]');
  await expectImageLoaded(photo);
  await expect.poll(() => photo.evaluate(element => (element as HTMLImageElement).naturalWidth)).toBeLessThanOrEqual(300);
  await expectImageLoaded(page.locator('img[src*="/uploads/user/avatar/"]'));
  if (react) await page.screenshot({ path: testInfo.outputPath(`content-${testInfo.project.name}.png`), fullPage: !testInfo.project.use.isMobile });
  await logout(page);
  await visit(page, post.path);
  await expect(page.locator('[data-react-page]')).toHaveCount(0);
  await expect(page.getByText(post.title, { exact: true })).toBeVisible();
  await expectImageLoaded(page.locator('img[src*="/uploads/photo/image/"]'));
});

test('a missing post keeps its HTTP 404 status', async ({ page }) => {
  const response = await page.goto('/contents/0');
  expect(response?.status()).toBe(404);
  await expect(page.locator('[data-react-page]')).toHaveCount(0);
});
