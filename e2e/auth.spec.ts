import { test, expect, register, login, logout, visit, expectImageLoaded } from './helpers';

test('guest pages render and an invalid password does not sign in', async ({ page }) => {
  await visit(page, '/');
  await expect(page.getByRole('heading', { name: '全てのユーザー' })).toBeVisible();
  await visit(page, '/users/sign_in');
  await page.getByLabel('Email', { exact: true }).fill('unknown@example.test');
  await page.getByLabel('Password', { exact: true }).fill('IncorrectPassword');
  await page.getByRole('button', { name: 'ログインする', exact: true }).click();
  await expect(page).toHaveURL(/\/users\/sign_in$/);
  await expect(page.getByText(/パスワードが不正/).first()).toBeVisible();
});

test('a new account can sign out and sign in again', async ({ page }) => {
  const user = await register(page);
  await logout(page);
  await login(page, user);
  await visit(page, user.path);
  await expect(page.getByRole('heading', { name: `${user.name}のページ`, exact: true })).toBeVisible();
});

test('registration stores and displays an uploaded avatar', async ({ page }) => {
  const user = await register(page, true);
  await visit(page, user.path);
  await expectImageLoaded(page.locator('img[src*="/uploads/user/avatar/"]'));
});
