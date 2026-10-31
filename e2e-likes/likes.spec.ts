import { test, expect, register, createContent, visit, contentRegion, baseURL } from '../e2e/helpers';

test('pending likes reject double clicks and stay consistent with reload and legacy controls', async ({ page }, testInfo) => {
  await register(page); const post = await createContent(page);
  await visit(page, post.path);
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  let writes = 0;
  const api = `**/api/v1/contents/${post.id}/like`;
  await page.route(api, async route => { writes++; await gate; await route.continue(); });
  const like = page.getByRole('button', { name: 'いいね', exact: true });
  try {
    await like.dblclick();
    await expect.poll(() => writes).toBe(1);
    await expect(like).toBeDisabled();
    await expect(page.locator('dd')).toHaveText(['0', '0']);
  } finally { release(); }
  const unlike = page.getByRole('button', { name: 'いいねを取り消す', exact: true });
  await expect(unlike).toBeEnabled();
  await expect(page.locator('dd')).toHaveText(['1', '0']);
  await page.screenshot({ path: testInfo.outputPath(`likes-${testInfo.project.name}.png`), fullPage: !testInfo.project.use.isMobile });
  await page.unroute(api);
  await page.reload();
  await expect(unlike).toHaveAttribute('aria-pressed', 'true');
  await unlike.click();
  await expect(like).toBeEnabled();
  await expect(page.locator('dd')).toHaveText(['0', '0']);
  await page.getByRole('link', { name: '投稿一覧へ', exact: true }).click();
  const legacy = contentRegion(page, 'content-likes', post);
  await legacy.getByRole('link', { name: 'いいね', exact: true }).click();
  await expect(legacy.getByRole('link', { name: 'いいねを取り消す' })).toBeVisible();
  await page.locator(`a[href="${post.path}"]`).first().click();
  await expect(unlike).toBeEnabled();
  await expect(page.locator('dd')).toHaveText(['1', '0']);
});

test('network failures and CSRF rejection can be retried without reversing the intent', async ({ page }) => {
  await register(page); const post = await createContent(page);
  const api = `**/api/v1/contents/${post.id}/like`;
  await page.route(api, route => route.abort('failed'));
  await visit(page, post.path);
  await page.getByRole('button', { name: 'いいね', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText(/現在の状態を確認/);
  await page.unroute(api);
  await page.getByRole('button', { name: 'もう一度試す' }).click();
  const unlike = page.getByRole('button', { name: 'いいねを取り消す', exact: true });
  await expect(unlike).toBeEnabled();
  let corrupt = true;
  await page.route(api, route => {
    if (corrupt) { corrupt = false; return route.continue({ headers: { ...route.request().headers(), 'x-csrf-token': 'invalid' } }); }
    return route.continue();
  });
  await unlike.click();
  await expect(page.getByRole('alert')).toHaveText(/現在の状態を確認/);
  await expect(page.locator('dd')).toHaveText(['1', '0']);
  await page.getByRole('button', { name: 'もう一度試す' }).click();
  await expect(page.getByRole('button', { name: 'いいね', exact: true })).toBeEnabled();
  await expect(page.locator('dd')).toHaveText(['0', '0']);
  await page.unroute(api);
  let offlineWrites = 0;
  page.on('request', request => { if (request.url().endsWith(`/contents/${post.id}/like`)) offlineWrites++; });
  try {
    await page.context().setOffline(true);
    await page.getByRole('button', { name: 'いいね', exact: true }).click();
    await expect(page.getByRole('alert')).toHaveText(/送信結果を確認できませんでした/);
  } finally { await page.context().setOffline(false); }
  await page.getByRole('button', { name: '状態を確認' }).click();
  await expect(page.getByRole('button', { name: 'もう一度試す' })).toBeEnabled();
  expect(offlineWrites).toBe(0);
  await page.getByRole('button', { name: 'もう一度試す' }).click();
  await expect(page.getByRole('button', { name: 'いいねを取り消す', exact: true })).toBeEnabled();
  expect(offlineWrites).toBe(1);
});

test('a lost response is reconciled from the real server without resending the write', async ({ page }) => {
  await register(page); const post = await createContent(page);
  let writes = 0;
  await page.route(`**/api/v1/contents/${post.id}/like`, async route => {
    const response = await route.fetch();
    expect(response.status()).toBe(200); writes++;
    await route.abort('failed');
  });
  await visit(page, post.path);
  await page.getByRole('button', { name: 'いいね', exact: true }).click();
  const unlike = page.getByRole('button', { name: 'いいねを取り消す', exact: true });
  await expect(unlike).toBeEnabled();
  await expect(page.getByRole('status')).toHaveText('いいねの状態を確認しました。');
  await expect(page.locator('dd')).toHaveText(['1', '0']);
  expect(writes).toBe(1);
  await unlike.click();
  await expect(page.getByRole('button', { name: 'いいね', exact: true })).toBeEnabled();
  await expect(page.locator('dd')).toHaveText(['0', '0']);
  expect(writes).toBe(2);
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('session expiry offers login and return without automatically replaying the like', async ({ page }) => {
  const user = await register(page); const post = await createContent(page);
  await visit(page, post.path);
  const like = page.getByRole('button', { name: 'いいね', exact: true });
  await expect(like).toBeEnabled();
  // Finish the new section's initial response before clearing the session cookie.
  if (process.env.EXPECT_REACT_COMMENTS === '1') await expect(page.getByRole('button', { name: 'コメントを投稿', exact: true })).toBeEnabled();
  let writes = 0;
  page.on('request', request => { if (request.url().endsWith(`/contents/${post.id}/like`)) writes++; });
  await page.context().clearCookies();
  await like.click();
  await page.getByRole('link', { name: 'ログインして投稿に戻る' }).click();
  await page.getByLabel('Email', { exact: true }).fill(user.email);
  await page.getByLabel('Password', { exact: true }).fill(user.password);
  await page.getByRole('button', { name: 'ログインする', exact: true }).click();
  await expect(page).toHaveURL(new URL(post.path, baseURL).href);
  await expect(like).toBeEnabled();
  expect(writes).toBe(0);
  await like.click();
  await expect(page.getByRole('button', { name: 'いいねを取り消す', exact: true })).toBeEnabled();
  expect(writes).toBe(1);
});
