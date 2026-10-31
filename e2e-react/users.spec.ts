import { test, expect, register, logout, visit } from '../e2e/helpers';

test('a failed directory request can be retried against the real API', async ({ page }) => {
  const user = await register(page);
  await page.route('**/api/v1/users?*', route => route.abort('failed'));
  await page.reload();
  await expect(page.getByRole('alert')).toHaveText(/ユーザーを読み込めませんでした/);
  await page.unroute('**/api/v1/users?*');
  await page.getByRole('button', { name: '再読み込み' }).click();
  await expect(page.getByRole('link', { name: user.name, exact: true })).toBeVisible();
});

test('pagination retains its URL on reload and returns to the first page', async ({ page }) => {
  const names: string[] = [];
  for (let count = 0; count < 21; count++) {
    const user = await register(page); names.push(user.name);
    await logout(page);
  }
  await visit(page, '/users');
  await expect(page.getByRole('link', { name: names[20], exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: names[0], exact: true })).toHaveCount(0);
  await page.getByRole('link', { name: '次のページ', exact: true }).click();
  await expect(page).toHaveURL(/\/users\?page=2$/);
  await expect(page.getByRole('link', { name: names[0], exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('link', { name: names[0], exact: true })).toBeVisible();
  await page.getByRole('link', { name: '前のページ', exact: true }).click();
  await expect(page).toHaveURL(/\/users$/);
  await expect(page.getByRole('link', { name: names[20], exact: true })).toBeVisible();
});
