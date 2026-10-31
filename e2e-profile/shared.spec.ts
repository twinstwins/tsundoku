import { test, expect, register, createContent, visit, expectImageLoaded } from '../e2e/helpers';

const react = process.env.EXPECT_REACT_PROFILE === '1';

test('an empty profile stays public and private owner details disappear after the session ends', async ({ page }) => {
  const user = await register(page);
  await visit(page, user.path);
  await expect(page.getByRole('heading', { name: `${user.name}のページ`, exact: true })).toBeVisible();
  await expect(page.getByText('投稿はまだありません。', { exact: true })).toBeVisible();
  await expect(page.getByText(user.email, { exact: true })).toBeVisible();
  await expect(page.locator('[data-react-page]')).toHaveCount(react ? 2 : 0);
  const controls = page.getByRole('region', { name: 'プロフィールの操作' });
  await controls.getByRole('link', { name: 'プロフィールを編集', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`${user.path}/edit$`));
  await expect(page.getByLabel('Name', { exact: true })).toBeVisible();
  await page.context().clearCookies();
  await page.goBack();
  await expect(page).toHaveURL(new RegExp(`${user.path}$`));
  await expect(page.getByRole('heading', { name: `${user.name}のページ`, exact: true })).toBeVisible();
  await expect(page.getByText(user.email, { exact: true })).toHaveCount(0);
  await expect(controls.getByRole('link', { name: 'プロフィールを編集', exact: true })).toHaveCount(0);
  await expect(page.getByText('投稿はまだありません。', { exact: true })).toBeVisible();
});

test('profile post links and images survive detail navigation, browser back, and reload', async ({ page }, testInfo) => {
  const user = await register(page, true);
  const post = await createContent(page, true);
  await visit(page, user.path);
  await expect(page.getByRole('heading', { name: `${user.name}のページ`, exact: true })).toBeVisible();
  await expectImageLoaded(page.locator('img[src*="/uploads/user/avatar/"]'));
  await expectImageLoaded(page.locator('img[src*="/uploads/photo/image/"]'));
  await page.getByRole('link', { name: `${post.title}さんの投稿`, exact: true }).click();
  await expect(page.getByText(post.title, { exact: true })).toBeVisible();
  await page.goBack();
  await expect(page.getByRole('heading', { name: `${user.name}のページ`, exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: `${post.title}さんの投稿`, exact: true })).toHaveCount(1);
  await page.reload();
  await expect(page.getByRole('link', { name: `${post.title}さんの投稿`, exact: true })).toBeVisible();
  if (testInfo.project.use.isMobile) {
    const width = page.viewportSize()!.width;
    expect(await page.evaluate(() => window.innerWidth)).toBe(width);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
  }
  if (react) await page.screenshot({ path: testInfo.outputPath(`profile-${testInfo.project.name}.png`), fullPage: !testInfo.project.use.isMobile });
});

test('a missing profile returns a visible HTTP 404 page', async ({ page }) => {
  const response = await page.goto('/users/0');
  expect(response?.status()).toBe(404);
  await expect(page.getByRole('heading', { name: 'ユーザーが見つかりません' })).toBeVisible();
});
