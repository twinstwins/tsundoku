import { randomUUID } from 'node:crypto';
import { test, expect, register, createContent, visit, contentRegion, baseURL } from '../e2e/helpers';
import type { Page } from '@playwright/test';

const section = (page: Page) => page.getByRole('region', { name: 'コメント', exact: true });
const submit = (page: Page) => section(page).getByRole('button', { name: 'コメントを投稿', exact: true });

test('comments keep multiline text safe, block double submissions, and agree with reload and legacy controls', async ({ page }, testInfo) => {
  await register(page); const post = await createContent(page); await visit(page, post.path);
  const text = '<script>window.__commentXss=1</script>\n読んでみたい本です。';
  await page.getByLabel('コメントを書く', { exact: true }).fill(text);
  let release!: () => void; let writes = 0;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const api = `**/api/v1/contents/${post.id}/comments`;
  await page.route(api, async route => { writes++; await gate; await route.continue(); });
  try {
    await submit(page).dblclick();
    await expect.poll(() => writes).toBe(1);
    await expect(submit(page)).toBeDisabled();
    await expect(page.getByLabel('コメントを書く', { exact: true })).toHaveValue(text);
    await expect(page.locator('dd')).toHaveText(['0', '0']);
  } finally { release(); }
  const list = section(page).getByRole('list', { name: '投稿へのコメント' });
  await expect(list).toContainText(text);
  await expect(page.locator('dd')).toHaveText(['0', '1']);
  expect(await page.evaluate(() => (window as any).__commentXss)).toBeUndefined();
  expect(await list.locator('p').evaluate(element => getComputedStyle(element).whiteSpace)).toBe('pre-wrap');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath(`comments-${testInfo.project.name}.png`), fullPage: true });
  await page.unroute(api); await page.reload();
  await expect(submit(page)).toBeDisabled();
  await section(page).getByRole('button', { name: '自分のコメントを削除' }).click();
  await expect(section(page).getByText('コメントはまだありません。')).toBeVisible();
  await expect(page.locator('dd')).toHaveText(['0', '0']);
  await page.getByRole('link', { name: '投稿一覧へ', exact: true }).click();
  const legacy = contentRegion(page, 'comment-form', post);
  await legacy.getByPlaceholder('コメント ...', { exact: true }).fill('既存画面で書いた感想');
  await legacy.getByRole('button', { name: 'コメント送信', exact: true }).click();
  await expect(contentRegion(page, 'content-comments', post)).toContainText('既存画面で書いた感想');
  await page.locator(`a[href="${post.path}"]`).first().click();
  await expect(list).toContainText('既存画面で書いた感想');
  await expect(section(page).getByRole('button', { name: '自分のコメントを削除' })).toBeEnabled();
});

test('network and CSRF failures preserve drafts and offline actions are never queued for reconnect', async ({ page }) => {
  await register(page); const post = await createContent(page); await visit(page, post.path);
  const api = `**/api/v1/contents/${post.id}/comments`;
  await page.route(api, route => route.abort('failed'));
  await page.getByLabel('コメントを書く', { exact: true }).fill('再試行しても変えない感想'); await submit(page).click();
  await expect(section(page).getByRole('button', { name: 'コメント送信を再試行' })).toBeEnabled();
  await expect(page.getByLabel('コメントを書く', { exact: true })).toHaveValue('再試行しても変えない感想');
  await page.unroute(api); await section(page).getByRole('button', { name: 'コメント送信を再試行' }).click();
  const remove = section(page).getByRole('button', { name: '自分のコメントを削除' });
  await expect(remove).toBeEnabled();
  let corrupt = true;
  await page.route(`${api}/*`, route => {
    if (corrupt) { corrupt = false; return route.continue({ headers: { ...route.request().headers(), 'x-csrf-token': 'invalid' } }); }
    return route.continue();
  });
  await remove.click();
  await expect(section(page).getByRole('button', { name: '削除を再試行' })).toBeEnabled();
  await expect(page.locator('dd')).toHaveText(['0', '1']);
  await section(page).getByRole('button', { name: '削除を再試行' }).click();
  await expect(submit(page)).toBeEnabled();
  await page.getByLabel('コメントを書く', { exact: true }).fill('オフラインで書いた感想');
  let offlineWrites = 0;
  page.on('request', request => { if (request.method() === 'POST' && request.url().endsWith(`/contents/${post.id}/comments`)) offlineWrites++; });
  try {
    await page.context().setOffline(true); await submit(page).click();
    await expect(section(page).getByRole('button', { name: 'コメントの状態を確認' })).toBeEnabled();
  } finally { await page.context().setOffline(false); }
  await section(page).getByRole('button', { name: 'コメントの状態を確認' }).click();
  await expect(section(page).getByRole('button', { name: 'コメント送信を再試行' })).toBeEnabled();
  expect(offlineWrites).toBe(0);
  await section(page).getByRole('button', { name: 'コメント送信を再試行' }).click();
  await expect(remove).toBeEnabled(); expect(offlineWrites).toBe(1);
});

test('committed create and delete responses can be lost without repeating either write', async ({ page }) => {
  await register(page); const post = await createContent(page); await visit(page, post.path);
  let writes = 0;
  await page.route(`**/api/v1/contents/${post.id}/comments{,/*}`, async route => {
    const response = await route.fetch(); expect([200, 201]).toContain(response.status()); writes++;
    await route.abort('failed');
  });
  await page.getByLabel('コメントを書く', { exact: true }).fill('応答が失われても一度だけ'); await submit(page).click();
  await expect(section(page).getByRole('status')).toHaveText('保存済みの状態を確認しました。');
  await expect(section(page).getByRole('button', { name: '自分のコメントを削除' })).toBeEnabled(); expect(writes).toBe(1);
  await expect(page.getByLabel('コメントを書く', { exact: true })).toHaveValue('');
  await section(page).getByRole('button', { name: '自分のコメントを削除' }).click();
  await expect(submit(page)).toBeEnabled(); expect(writes).toBe(2);
  await expect(page.locator('dd')).toHaveText(['0', '0']);
});

test('session expiry keeps the draft available to copy and login never replays the comment', async ({ page }) => {
  const user = await register(page); const post = await createContent(page); await visit(page, post.path);
  await expect(submit(page)).toBeEnabled();
  await page.getByLabel('コメントを書く', { exact: true }).fill('コピーして残す下書き');
  let writes = 0;
  page.on('request', request => { if (request.method() === 'POST' && request.url().endsWith(`/contents/${post.id}/comments`)) writes++; });
  await page.context().clearCookies(); await submit(page).click();
  await expect(page.getByLabel('コメントを書く', { exact: true })).toHaveValue('コピーして残す下書き');
  await section(page).getByRole('link', { name: 'ログインして投稿に戻る' }).click();
  await page.getByLabel('Email', { exact: true }).fill(user.email);
  await page.getByLabel('Password', { exact: true }).fill(user.password);
  await page.getByRole('button', { name: 'ログインする', exact: true }).click();
  await expect(page).toHaveURL(new URL(post.path, baseURL).href);
  await expect(submit(page)).toBeEnabled(); expect(writes).toBe(0);
  await expect(page.getByLabel('コメントを書く', { exact: true })).toHaveValue('');
  await page.getByLabel('コメントを書く', { exact: true }).fill('ログイン後に再入力'); await submit(page).click();
  await expect(section(page).getByRole('button', { name: '自分のコメントを削除' })).toBeEnabled(); expect(writes).toBe(1);
});

test('list failures recover independently and an existing legacy comment never gets overwritten', async ({ page }) => {
  await register(page); const post = await createContent(page);
  const api = `**/api/v1/contents/${post.id}/comments?*`;
  await page.route(api, route => route.abort('failed')); await visit(page, post.path);
  await expect(page.getByRole('heading', { name: post.title, exact: true })).toBeVisible();
  await expect(section(page).getByRole('button', { name: 'コメントを再読み込み' })).toBeVisible();
  await page.getByLabel('コメントを書く', { exact: true }).fill('先に書いた下書き');
  await page.unroute(api); await section(page).getByRole('button', { name: 'コメントを再読み込み' }).click();
  await expect(submit(page)).toBeEnabled();
  await expect(page.getByLabel('コメントを書く', { exact: true })).toHaveValue('先に書いた下書き');
  await page.getByLabel('コメントを書く', { exact: true }).fill('  '); await submit(page).click();
  await expect(section(page).getByRole('alert')).toHaveText('コメントを入力してください。');
  await page.getByLabel('コメントを書く', { exact: true }).fill('上書きせず残す下書き');
  const me = await (await page.request.get('/api/v1/me')).json();
  const response = await page.request.post(`/contents/${post.id}/comments`, { headers: { 'X-CSRF-Token': me.data.csrf_token, Accept: 'text/javascript', 'X-Requested-With': 'XMLHttpRequest' }, form: { 'comment[comment]': '別画面で先に保存した感想' } });
  expect(response.status()).toBe(200); await submit(page).click();
  await expect(section(page).getByRole('status')).toHaveText('すでに別のコメントがあります。入力内容は保持しています。');
  await expect(submit(page)).toBeDisabled();
  await expect(page.getByLabel('コメントを書く', { exact: true })).toHaveValue('上書きせず残す下書き');
  await expect(section(page).getByRole('list')).toContainText('別画面で先に保存した感想');
});

test('pagination keeps drafts and an off-page owned comment can be removed after the last page shrinks', async ({ page, playwright }) => {
  await register(page); const post = await createContent(page); const path = `/api/v1/contents/${post.id}/comments`;
  const me = await (await page.request.get('/api/v1/me')).json();
  expect((await page.request.post(path, { headers: { 'X-CSRF-Token': me.data.csrf_token }, data: { comment: { comment: '最初に書いた本人の感想' } } })).status()).toBe(201);
  for (let index = 0; index < 20; index++) {
    const request = await playwright.request.newContext({ baseURL });
    try {
      const key = randomUUID(); const signUp = await request.get('/users/sign_up');
      const token = (await signUp.text()).match(/<meta name="csrf-token" content="([^"]+)"/)?.[1]; expect(token).toBeTruthy();
      expect((await request.post('/users', { form: { authenticity_token: token!, 'user[name]': `読者-${key}`, 'user[email]': `${key}@example.test`, 'user[password]': 'E2ePassword123!', 'user[password_confirmation]': 'E2ePassword123!' }, maxRedirects: 0 })).status()).toBe(302);
      const reader = await (await request.get('/api/v1/me')).json();
      expect((await request.post(path, { headers: { 'X-CSRF-Token': reader.data.csrf_token }, data: { comment: { comment: `読者の感想 ${index}` } } })).status()).toBe(201);
    } finally { await request.dispose(); }
  }
  await visit(page, post.path);
  const list = section(page).getByRole('list', { name: '投稿へのコメント' });
  await expect(list.getByRole('listitem')).toHaveCount(20);
  await expect(list).not.toContainText('最初に書いた本人の感想');
  await expect(section(page).getByLabel('自分のコメント')).toContainText('最初に書いた本人の感想');
  await page.getByLabel('コメントを書く', { exact: true }).fill('ページを移っても残す下書き');
  await section(page).getByRole('button', { name: '次のコメント' }).click();
  await expect(list.getByRole('listitem')).toHaveCount(1);
  await expect(page.getByLabel('コメントを書く', { exact: true })).toHaveValue('ページを移っても残す下書き');
  await section(page).getByRole('button', { name: '自分のコメントを削除' }).click();
  await section(page).getByRole('button', { name: '最初のコメントへ' }).click();
  await expect(list.getByRole('listitem')).toHaveCount(20);
  await expect(submit(page)).toBeEnabled();
  await expect(page.getByLabel('コメントを書く', { exact: true })).toHaveValue('ページを移っても残す下書き');
  await expect(page.locator('dd')).toHaveText(['0', '20']);
});
