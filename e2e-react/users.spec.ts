import { randomUUID } from 'node:crypto';
import { test, expect, register, visit, baseURL } from '../e2e/helpers';

test('a failed directory request can be retried against the real API', async ({ page }) => {
  const user = await register(page);
  await page.route('**/api/v1/users?*', route => route.abort('failed'));
  await page.reload();
  await expect(page.getByRole('alert')).toHaveText(/ユーザーを読み込めませんでした/);
  await page.unroute('**/api/v1/users?*');
  await page.getByRole('button', { name: '再読み込み' }).click();
  await expect(page.getByRole('link', { name: user.name, exact: true })).toBeVisible();
});

test('pagination retains its URL on reload and returns to the first page', async ({ page, playwright }) => {
  const names: string[] = [];
  // Set up the other readers through real registrations; UI registration is
  // covered by the shared suite and the final reader below.
  for (let count = 0; count < 20; count++) {
    const key = randomUUID();
    const name = `読者-${key}`;
    const request = await playwright.request.newContext({ baseURL });
    try {
      const signUp = await request.get('/users/sign_up');
      expect(signUp.status()).toBe(200);
      const token = (await signUp.text()).match(/<meta name="csrf-token" content="([^"]+)"/)?.[1];
      expect(token, 'Registration CSRF token').toBeTruthy();
      const response = await request.post('/users', {
        form: {
          authenticity_token: token!,
          'user[name]': name,
          'user[email]': `reader-${key}@example.test`,
          'user[password]': 'E2ePassword123!',
          'user[password_confirmation]': 'E2ePassword123!',
        },
        maxRedirects: 0,
      });
      expect(response.status()).toBe(302);
      expect(new URL(response.headers().location, baseURL).pathname).toBe('/');
      names.push(name);
    } finally {
      await request.dispose();
    }
  }
  names.push((await register(page)).name);
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
