import { test, expect, register, anotherUser, visit, baseURL } from '../e2e/helpers';
import type { Page } from '@playwright/test';

const controls = (page: Page) => page.getByRole('region', { name: 'フォローの操作', exact: true });
const button = (page: Page, followed = false) => controls(page).getByRole('button', { name: followed ? 'Unfollow' : 'Follow', exact: true });

test('follow counts wait for the server, reject double clicks, and agree with lists, reload, and legacy writes', async ({ page, browser }, testInfo) => {
  const { user: target } = await anotherUser(browser); const user = await register(page); await visit(page, target.path);
  let release!: () => void; let writes = 0; const gate = new Promise<void>(resolve => { release = resolve; });
  const api = `**/api/v1${target.path}/follow`;
  await expect(button(page)).toBeEnabled();
  await page.route(api, async route => { if (route.request().method() === 'GET') return route.continue(); writes++; await gate; await route.continue(); });
  try {
    await button(page).dblclick(); await expect.poll(() => writes).toBe(1);
    await expect(button(page)).toBeDisabled(); await expect(controls(page).getByRole('link', { name: '0 followers' })).toBeVisible();
  } finally { release(); }
  await expect(button(page, true)).toBeEnabled(); await expect(controls(page).getByRole('link', { name: '1 followers' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath(`follows-${testInfo.project.name}.png`), fullPage: true });
  await page.unroute(api); await page.reload(); await expect(button(page, true)).toHaveAttribute('aria-pressed', 'true');
  await controls(page).getByRole('link', { name: '1 followers' }).click(); await expect(page.getByText(user.name, { exact: true })).toBeVisible();
  await page.goBack(); await expect(button(page, true)).toBeEnabled(); await button(page, true).click(); await expect(button(page)).toBeEnabled();
  await expect(controls(page).getByRole('link', { name: '0 followers' })).toBeVisible();
  const me = await (await page.request.get('/api/v1/me')).json();
  const legacy = await page.request.post('/relationships', { headers: { 'X-CSRF-Token': me.data.csrf_token, Accept: 'text/javascript', 'X-Requested-With': 'XMLHttpRequest' }, form: { 'relationship[following_id]': target.path.split('/').pop()! } });
  expect(legacy.status()).toBe(200); await page.reload(); await expect(button(page, true)).toBeEnabled();
  await visit(page, `${user.path}/following`); await expect(page.getByText(target.name, { exact: true })).toBeVisible();
  await page.getByRole('link', { name: '詳細', exact: true }).click(); await button(page, true).click(); await expect(button(page)).toBeEnabled();
  await page.goBack(); await expect(page).toHaveURL(new URL(`${user.path}/following`, baseURL).href);
  await expect(page.getByText(target.name, { exact: true })).toHaveCount(0);
});

test('network and CSRF failures preserve the intent and offline requests are not replayed on reconnect', async ({ page, browser }) => {
  const { user: target } = await anotherUser(browser); await register(page); await visit(page, target.path); await expect(button(page)).toBeEnabled();
  const api = `**/api/v1${target.path}/follow`;
  await page.route(api, route => route.request().method() === 'GET' ? route.continue() : route.abort('failed'));
  await button(page).click(); await expect(controls(page).getByRole('button', { name: 'フォロー操作を再試行' })).toBeEnabled();
  await page.unroute(api); await controls(page).getByRole('button', { name: 'フォロー操作を再試行' }).click(); await expect(button(page, true)).toBeEnabled();
  let corrupt = true;
  await page.route(api, route => {
    if (route.request().method() === 'DELETE' && corrupt) { corrupt = false; return route.continue({ headers: { ...route.request().headers(), 'x-csrf-token': 'invalid' } }); }
    return route.continue();
  });
  await button(page, true).click(); await expect(controls(page).getByRole('button', { name: 'フォロー操作を再試行' })).toBeEnabled();
  await expect(controls(page).getByRole('link', { name: '1 followers' })).toBeVisible();
  await controls(page).getByRole('button', { name: 'フォロー操作を再試行' }).click(); await expect(button(page)).toBeEnabled(); await page.unroute(api);
  let offlineWrites = 0;
  page.on('request', request => { if (request.url().endsWith(`/api/v1${target.path}/follow`) && request.method() !== 'GET') offlineWrites++; });
  try {
    await page.context().setOffline(true); await button(page).click();
    await expect(controls(page).getByRole('button', { name: 'フォローの状態を確認' })).toBeEnabled();
  } finally { await page.context().setOffline(false); }
  await controls(page).getByRole('button', { name: 'フォローの状態を確認' }).click();
  await expect(controls(page).getByRole('button', { name: 'フォロー操作を再試行' })).toBeEnabled(); expect(offlineWrites).toBe(0);
  await controls(page).getByRole('button', { name: 'フォロー操作を再試行' }).click(); await expect(button(page, true)).toBeEnabled(); expect(offlineWrites).toBe(1);
});

test('committed follow and unfollow responses can be lost without repeating the write', async ({ page, browser }) => {
  const { user: target } = await anotherUser(browser); await register(page); let writes = 0;
  await page.route(`**/api/v1${target.path}/follow`, async route => {
    if (route.request().method() === 'GET') return route.continue();
    const response = await route.fetch(); expect(response.status()).toBe(200); writes++; await route.abort('failed');
  });
  await visit(page, target.path); await button(page).click();
  await expect(controls(page).getByRole('status')).toHaveText('フォローの状態を確認しました。'); await expect(button(page, true)).toBeEnabled(); expect(writes).toBe(1);
  await button(page, true).click(); await expect(button(page)).toBeEnabled(); expect(writes).toBe(2);
  await expect(controls(page).getByRole('link', { name: '0 followers' })).toBeVisible();
});

test('session expiry returns to the same profile after login without replaying the follow', async ({ page, browser }) => {
  const { user: target } = await anotherUser(browser); const user = await register(page); await visit(page, target.path);
  await expect(button(page)).toBeEnabled(); await expect(page.getByText('投稿はまだありません。', { exact: true })).toBeVisible();
  let writes = 0; page.on('request', request => { if (request.url().endsWith(`/api/v1${target.path}/follow`) && request.method() !== 'GET') writes++; });
  await page.context().clearCookies(); await button(page).click();
  await controls(page).getByRole('link', { name: 'ログインしてプロフィールに戻る' }).click();
  await page.getByLabel('Email', { exact: true }).fill(user.email); await page.getByLabel('Password', { exact: true }).fill(user.password);
  await page.getByRole('button', { name: 'ログインする', exact: true }).click();
  await expect(page).toHaveURL(new URL(target.path, baseURL).href); await expect(button(page)).toBeEnabled(); expect(writes).toBe(0);
  await button(page).click(); await expect(button(page, true)).toBeEnabled(); expect(writes).toBe(1);
});

test('guest profiles stay public and the owner never receives self-follow controls', async ({ page, browser }) => {
  const user = await register(page); await visit(page, user.path);
  await expect(controls(page).getByText('自分のプロフィールです。')).toBeVisible();
  await expect(controls(page).getByRole('button')).toHaveCount(0); await expect(page.getByText(user.email, { exact: true })).toBeVisible();
  const guest = await browser.newContext({ baseURL });
  try {
    const guestPage = await guest.newPage(); await visit(guestPage, user.path);
    await expect(guestPage.getByRole('heading', { name: `${user.name}のページ`, exact: true })).toBeVisible();
    await expect(controls(guestPage).getByRole('link', { name: 'ログインしてプロフィールに戻る' })).toBeVisible();
    await expect(controls(guestPage).getByRole('button')).toHaveCount(0);
    await expect(controls(guestPage).getByRole('link', { name: '0 followers' })).toBeVisible();
    await expect(guestPage.getByText(user.email, { exact: true })).toHaveCount(0);
    await expect(guestPage.getByRole('link', { name: 'プロフィールを編集', exact: true })).toHaveCount(0);
  } finally { await guest.close(); }
});

test('follow-state failures recover independently of the public profile and posts', async ({ page, browser }) => {
  const { user: target } = await anotherUser(browser); await register(page);
  const api = `**/api/v1${target.path}/follow`; await page.route(api, route => route.abort('failed')); await visit(page, target.path);
  await expect(controls(page).getByRole('button', { name: 'フォロー状態を再読み込み' })).toBeVisible();
  await expect(page.getByRole('heading', { name: `${target.name}のページ`, exact: true })).toBeVisible();
  await expect(page.getByText('投稿はまだありません。', { exact: true })).toBeVisible();
  await expect(controls(page).getByRole('link', { name: '0 followers' })).toBeVisible();
  await page.unroute(api); await controls(page).getByRole('button', { name: 'フォロー状態を再読み込み' }).click(); await expect(button(page)).toBeEnabled();
  await button(page).click(); await expect(button(page, true)).toBeEnabled();
});
