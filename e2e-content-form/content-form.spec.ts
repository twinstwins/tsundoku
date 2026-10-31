import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { test, expect, register, visit, imagePath, expectImageLoaded, baseURL } from '../e2e/helpers';
import type { Page } from '@playwright/test';

const submit = (page: Page) => page.getByRole('button', { name: '投稿', exact: true });
async function fill(page: Page, withImage = true) {
  const title = `本-${randomUUID().slice(0, 12)}`;
  await page.getByLabel('Name', { exact: true }).fill(title);
  await page.getByLabel('Description', { exact: true }).fill('一行目の説明\n二行目の説明');
  if (withImage) await page.getByLabel('投稿画像', { exact: true }).setInputFiles(imagePath);
  return title;
}

test('an image post keeps its draft while pending, blocks double submission, and opens the saved detail', async ({ page }, testInfo) => {
  const user = await register(page); await visit(page, '/contents/new'); const title = await fill(page);
  await expect(page.locator('[data-react-page="content-form"]')).toHaveCount(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath(`content-form-${testInfo.project.name}.png`), fullPage: true });
  let release!: () => void; let writes = 0; let key = ''; const gate = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/v1/contents', async route => {
    if (route.request().method() !== 'POST') return route.continue();
    writes++; key = route.request().headers()['idempotency-key']; await gate; await route.continue();
  });
  try {
    await submit(page).dblclick(); await expect.poll(() => writes).toBe(1);
    await expect(submit(page)).toBeDisabled(); await expect(page.getByLabel('Name', { exact: true })).toHaveValue(title);
    await expect(page.getByLabel('Name', { exact: true })).toHaveAttribute('readonly', '');
    await expect(page.getByLabel('投稿画像', { exact: true })).toBeDisabled();
  } finally { release(); }
  await expect(page).toHaveURL(/\/contents\/[1-9]\d*$/); await expect(page.getByText(title, { exact: true }).first()).toBeVisible();
  await expectImageLoaded(page.locator('img[src*="/uploads/photo/image/"]').first());
  const saved = await (await page.request.get(`/api/v1/content-submissions/${key}`)).json();
  expect(saved.data.photos).toHaveLength(1); expect(saved.data.user.id).toBe(Number(user.path.split('/').pop()));
  const posts = await (await page.request.get(`/api/v1${user.path}/contents`)).json(); expect(posts.meta.total_count).toBe(1);
});

test('real image validation preserves text and the selected file and correction saves one post', async ({ page }) => {
  const user = await register(page); await visit(page, '/contents/new'); const title = await fill(page, false);
  await page.getByLabel('投稿画像', { exact: true }).setInputFiles({ name: 'broken.png', mimeType: 'image/png', buffer: Buffer.from('not an image') });
  const keys: string[] = []; page.on('request', request => { if (request.method() === 'POST' && request.url().endsWith('/api/v1/contents')) keys.push(request.headers()['idempotency-key']); });
  await submit(page).click(); await expect(page.locator('#image-error')).toHaveText(/画像を読み込めませんでした/);
  await expect(page.getByLabel('Name', { exact: true })).toHaveValue(title);
  await expect(page.getByLabel('Description', { exact: true })).toHaveValue('一行目の説明\n二行目の説明');
  await expect(page.getByText('選択中：broken.png')).toBeVisible();
  await expect(page.getByLabel('投稿画像', { exact: true })).toBeEnabled();
  await page.getByLabel('投稿画像', { exact: true }).setInputFiles(imagePath); await submit(page).click();
  await expect(page).toHaveURL(/\/contents\/[1-9]\d*$/); expect(keys).toHaveLength(2); expect(keys[0]).not.toBe(keys[1]);
  const posts = await (await page.request.get(`/api/v1${user.path}/contents`)).json(); expect(posts.meta.total_count).toBe(1);
});

test('offline, network, and CSRF failures keep one immutable request and never replay it on reconnect', async ({ page }) => {
  const user = await register(page); await visit(page, '/contents/new'); const title = await fill(page);
  const keys: string[] = []; page.on('request', request => { if (request.method() === 'POST' && request.url().endsWith('/api/v1/contents')) keys.push(request.headers()['idempotency-key']); });
  try {
    await page.context().setOffline(true); await submit(page).click(); await expect(page.getByRole('button', { name: '保存状態を確認', exact: true })).toBeEnabled();
  } finally { await page.context().setOffline(false); }
  expect(keys).toHaveLength(0); await page.getByRole('button', { name: '保存状態を確認', exact: true }).click();
  await expect(page.getByRole('button', { name: '同じ内容で再送' })).toBeEnabled(); expect(keys).toHaveLength(0);
  let stage = 0;
  await page.route('**/api/v1/contents', route => {
    if (route.request().method() !== 'POST') return route.continue();
    stage++;
    if (stage === 1) return route.abort('failed');
    if (stage === 2) return route.continue({ headers: { ...route.request().headers(), 'x-csrf-token': 'invalid' } });
    return route.continue();
  });
  await page.getByRole('button', { name: '同じ内容で再送' }).click(); await expect.poll(() => stage).toBe(1);
  await expect(page.getByRole('button', { name: '同じ内容で再送' })).toBeEnabled();
  await page.getByRole('button', { name: '同じ内容で再送' }).click(); await expect.poll(() => stage).toBe(2);
  await expect(page.getByRole('button', { name: '同じ内容で再送' })).toBeEnabled();
  await expect(page.getByLabel('Name', { exact: true })).toHaveValue(title); await expect(page.getByLabel('投稿画像', { exact: true })).toBeDisabled();
  await page.getByRole('button', { name: '同じ内容で再送' }).click(); await expect(page).toHaveURL(/\/contents\/[1-9]\d*$/);
  expect(keys).toHaveLength(3); expect(new Set(keys).size).toBe(1);
  const posts = await (await page.request.get(`/api/v1${user.path}/contents`)).json(); expect(posts.meta.total_count).toBe(1);
});

test('a lost response after a real committed upload is confirmed without sending the image again', async ({ page }) => {
  const user = await register(page); await visit(page, '/contents/new'); await fill(page); let writes = 0;
  const imageBytes = await readFile(imagePath);
  await page.route('**/api/v1/contents', async route => {
    if (route.request().method() !== 'POST') return route.continue();
    // Intercepted multipart data can omit file bytes. Restore the actual fixture
    // before forwarding the request, preserving its fields, boundary and key.
    const request = route.request(); const body = request.postDataBuffer()!;
    const boundary = /boundary="?([^";]+)"?/.exec(request.headers()['content-type'])?.[1]; expect(boundary).toBeTruthy();
    const part = body.indexOf(Buffer.from('name="content[image]"')); expect(part).toBeGreaterThan(0);
    const begin = body.indexOf(Buffer.from('\r\n\r\n'), part) + 4;
    const end = body.indexOf(Buffer.from(`\r\n--${boundary}`), begin); expect(end).toBeGreaterThanOrEqual(begin);
    const upload = Buffer.concat([body.subarray(0, begin), imageBytes, body.subarray(end)]);
    const response = await route.fetch({ postData: upload }); expect(response.status()).toBe(201); writes++; await route.abort('failed');
  });
  await submit(page).click(); await expect(page).toHaveURL(/\/contents\/[1-9]\d*$/); expect(writes).toBe(1);
  const content = await (await page.request.get(`/api/v1/contents/${new URL(page.url()).pathname.split('/').pop()}`)).json(); expect(content.data.photos).toHaveLength(1);
  const posts = await (await page.request.get(`/api/v1${user.path}/contents`)).json(); expect(posts.meta.total_count).toBe(1);
});

test('session expiry leaves a copyable draft and returns to an empty form without automatically posting', async ({ page }) => {
  const user = await register(page); await visit(page, '/contents/new'); const title = await fill(page); let writes = 0;
  page.on('request', request => { if (request.method() === 'POST' && request.url().endsWith('/api/v1/contents')) writes++; });
  await page.context().clearCookies(); await submit(page).click();
  await expect(page.getByLabel('Name', { exact: true })).toHaveValue(title); await expect(page.getByText('選択中：book.png')).toBeVisible();
  await page.getByRole('link', { name: 'ログインして投稿フォームに戻る' }).click();
  await page.getByLabel('Email', { exact: true }).fill(user.email); await page.getByLabel('Password', { exact: true }).fill(user.password);
  await page.getByRole('button', { name: 'ログインする', exact: true }).click(); await expect(page).toHaveURL(new URL('/contents/new', baseURL).href);
  await expect(page.getByLabel('Name', { exact: true })).toHaveValue(''); expect(writes).toBe(0);
  expect(await page.getByLabel('投稿画像', { exact: true }).evaluate(element => (element as HTMLInputElement).files?.length)).toBe(0);
  await fill(page); await submit(page).click(); await expect(page).toHaveURL(/\/contents\/[1-9]\d*$/); expect(writes).toBe(1);
});

test('private drafts are discarded on navigation and text-only posts need no image', async ({ page }) => {
  const user = await register(page); await visit(page, '/contents/new'); await fill(page);
  await page.getByRole('link', { name: '投稿一覧へ', exact: true }).click(); await page.goBack();
  await expect(page.getByLabel('Name', { exact: true })).toHaveValue('');
  expect(await page.getByLabel('投稿画像', { exact: true }).evaluate(element => (element as HTMLInputElement).files?.length)).toBe(0);
  await page.getByLabel('Name', { exact: true }).fill('  '); await submit(page).click(); await expect(page.locator('#name-error')).toHaveText('名前を入力してください。');
  const title = await fill(page, false); await submit(page).click(); await expect(page).toHaveURL(/\/contents\/[1-9]\d*$/);
  await expect(page.getByText(title, { exact: true }).first()).toBeVisible();
  const posts = await (await page.request.get(`/api/v1${user.path}/contents`)).json(); expect(posts.meta.total_count).toBe(1); expect(posts.data[0].photos).toHaveLength(0);
});
