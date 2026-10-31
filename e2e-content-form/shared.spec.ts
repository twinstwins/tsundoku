import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { test, expect, register, imagePath, baseURL } from '../e2e/helpers';

test('creation requires a session, CSRF, and an identity, and concurrent JSON retries create one post', async ({ page, browser }) => {
  const key = randomUUID(); const path = `/api/v1/content-submissions/${key}`;
  const guest = await browser.newContext({ baseURL });
  try {
    expect((await guest.request.post('/api/v1/contents')).status()).toBe(401);
    const result = await guest.request.get(path); expect(result.status()).toBe(401); expect(result.headers()['cache-control']).toContain('no-store');
  } finally { await guest.close(); }
  await register(page); const me = await (await page.request.get('/api/v1/me')).json();
  const body = { content: { name: `本-${randomUUID()}`, description: '同時送信の確認', user_id: 0 } };
  const headers = { 'X-CSRF-Token': me.data.csrf_token, 'Idempotency-Key': key };
  expect((await page.request.post('/api/v1/contents', { headers: { 'Idempotency-Key': key }, data: body })).status()).toBe(422);
  expect((await page.request.post('/api/v1/contents', { headers: { 'X-CSRF-Token': me.data.csrf_token }, data: body })).status()).toBe(422);
  const results = await Promise.all([page.request.post('/api/v1/contents', { headers, data: body }), page.request.post('/api/v1/contents', { headers, data: body })]);
  expect(results.map(result => result.status()).sort()).toEqual([200, 201]);
  const saved = await results[0].json(); expect(saved.data.user.id).toBe(me.data.id);
  expect((await results[1].json()).data.id).toBe(saved.data.id);
  const lookup = await page.request.get(path); expect(lookup.status()).toBe(200); expect(lookup.headers()['cache-control']).toContain('no-store');
  expect((await lookup.json()).data.id).toBe(saved.data.id);
  expect(await lookup.text()).not.toMatch(/submission_digest|submission_key|email|csrf_token/);
  expect((await page.request.post('/api/v1/contents', { headers, data: { content: { name: '上書きしない' } } })).status()).toBe(409);
  const posts = await (await page.request.get(`/api/v1/users/${me.data.id}/contents`)).json(); expect(posts.meta.total_count).toBe(1);
});

test('multipart replays retain one real image and another account cannot look up the submission', async ({ page, browser }) => {
  await register(page); const me = await (await page.request.get('/api/v1/me')).json(); const key = randomUUID();
  const headers = { 'X-CSRF-Token': me.data.csrf_token, 'Idempotency-Key': key };
  const multipart = { 'content[name]': '画像の送信を再実行', 'content[description]': '同じ画像', 'content[image]': { name: 'book.png', mimeType: 'image/png', buffer: await readFile(imagePath) } };
  const results = await Promise.all([page.request.post('/api/v1/contents', { headers, multipart }), page.request.post('/api/v1/contents', { headers, multipart })]);
  expect(results.map(result => result.status()).sort()).toEqual([200, 201]);
  const saved = (await results[0].json()).data; expect(saved.photos).toHaveLength(1);
  expect((await page.request.get(saved.photos[0].thumbnail_url)).status()).toBe(200);
  const posts = await (await page.request.get(`/api/v1/users/${me.data.id}/contents`)).json(); expect(posts.meta.total_count).toBe(1);
  const other = await browser.newContext({ baseURL });
  try {
    await register(await other.newPage()); expect((await other.request.get(`/api/v1/content-submissions/${key}`)).status()).toBe(404);
    const viewer = await (await other.request.get('/api/v1/me')).json();
    const response = await other.request.post('/api/v1/contents', { headers: { 'X-CSRF-Token': viewer.data.csrf_token, 'Idempotency-Key': key }, data: { content: { name: '別ユーザーの投稿', user_id: me.data.id } } });
    expect(response.status()).toBe(201); expect((await response.json()).data.user.id).toBe(viewer.data.id);
  } finally { await other.close(); }
});
