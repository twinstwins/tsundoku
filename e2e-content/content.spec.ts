import { test, expect, register, createContent, visit, contentRegion, baseURL } from '../e2e/helpers';

test('request failures can be retried and a removed post has a distinct error', async ({ page }) => {
  await register(page);
  const post = await createContent(page);
  const api = `**/api/v1/contents/${post.id}`;
  await page.route(api, route => route.abort('failed'));
  await visit(page, post.path);
  await expect(page.getByRole('alert')).toHaveText(/投稿を読み込めませんでした/);
  await page.unroute(api);
  await page.getByRole('button', { name: '再読み込み' }).click();
  await expect(page.getByRole('heading', { name: post.title, exact: true })).toBeVisible();
  await page.route(api, route => route.continue({ url: new URL('/api/v1/contents/0', baseURL).href }));
  await page.reload();
  await expect(page.getByRole('heading', { name: '投稿が見つかりません' })).toBeVisible();
  await expect(page.getByRole('button', { name: '再読み込み' })).toHaveCount(0);
});

test('a broken uploaded photo does not hide the rest of the post', async ({ page }) => {
  await register(page);
  const post = await createContent(page, true);
  await page.route('**/uploads/photo/image/**', route => route.abort('failed'));
  await visit(page, post.path);
  await expect(page.getByRole('img', { name: '投稿画像 1を表示できません' })).toBeVisible();
  await expect(page.getByRole('heading', { name: post.title, exact: true })).toBeVisible();
  await expect(page.getByText('E2Eで作成した本の紹介', { exact: true })).toBeVisible();
});

test('an expired session can sign in and return to the same post', async ({ page }) => {
  const user = await register(page);
  const post = await createContent(page);
  const api = `**/api/v1/contents/${post.id}`;
  await page.route(api, async route => {
    await page.context().clearCookies();
    const response = await page.request.get(route.request().url());
    expect(response.status()).toBe(401);
    await route.fulfill({ response });
  });
  await visit(page, post.path);
  await expect(page.getByRole('alert')).toHaveText(/ログインが必要/);
  await page.unroute(api);
  await page.getByRole('link', { name: 'ログインして投稿に戻る' }).click();
  await page.getByLabel('Email', { exact: true }).fill(user.email);
  await page.getByLabel('Password', { exact: true }).fill(user.password);
  await page.getByRole('button', { name: 'ログインする', exact: true }).click();
  await expect(page).toHaveURL(new URL(post.path, baseURL).href);
  await expect(page.getByRole('heading', { name: post.title, exact: true })).toBeVisible();
});

test('returning from the legacy feed refreshes the viewer like status and counts', async ({ page }) => {
  await register(page);
  const post = await createContent(page);
  const likes = contentRegion(page, 'content-likes', post);
  await likes.getByRole('link', { name: 'いいね', exact: true }).click();
  await expect(likes.getByRole('link', { name: 'いいねを取り消す' })).toBeVisible();
  await page.locator(`a[href="${post.path}"]`).first().click();
  await expect(page.getByText('この投稿にいいねしています', { exact: true })).toBeVisible();
  await expect(page.locator('dd')).toHaveText(['1', '0']);
  await page.evaluate(() => { (window as any).__contentVisit = 'same-document'; });
  await page.goBack();
  await likes.getByRole('link', { name: 'いいねを取り消す' }).click();
  await expect(likes.getByRole('link', { name: 'いいね', exact: true })).toBeVisible();
  await page.goForward();
  await expect(page.getByRole('heading', { name: post.title, exact: true })).toBeVisible();
  await expect(page.getByText('この投稿にいいねしています', { exact: true })).toHaveCount(0);
  await expect(page.locator('dd')).toHaveText(['0', '0']);
  expect(await page.evaluate(() => (window as any).__contentVisit)).toBe('same-document');
});
