import { test, expect, register, createContent, baseURL } from '../e2e/helpers';

test('comments require a session and CSRF, and concurrent API and legacy creation stores one comment', async ({ page, browser }) => {
  await register(page); const post = await createContent(page);
  const path = `/api/v1/contents/${post.id}/comments`;
  const guest = await browser.newContext({ baseURL });
  try {
    for (const response of [await guest.request.get(path), await guest.request.post(path), await guest.request.delete(`${path}/1`)]) {
      expect(response.status()).toBe(401);
      expect(response.headers()['cache-control']).toContain('no-store');
    }
  } finally { await guest.close(); }
  expect((await page.request.post(path, { data: { comment: { comment: '感想' } } })).status()).toBe(422);
  const me = await (await page.request.get('/api/v1/me')).json();
  const headers = { 'X-CSRF-Token': me.data.csrf_token };
  expect((await page.request.post(path, { headers, data: {} })).status()).toBe(400);
  const invalid = await page.request.post(path, { headers, data: { comment: { comment: '  ' } } });
  expect(invalid.status()).toBe(422);
  expect((await invalid.json()).error.fields.comment.length).toBeGreaterThan(0);
  const responses = await Promise.all([
    page.request.post(path, { headers, data: { comment: { comment: 'APIの感想' } } }),
    page.request.post(path, { headers, data: { comment: { comment: 'APIの感想' } } }),
    page.request.post(`/contents/${post.id}/comments`, { headers: { ...headers, Accept: 'text/javascript', 'X-Requested-With': 'XMLHttpRequest' }, form: { 'comment[comment]': '既存画面の感想' } }),
  ]);
  expect(responses.filter(response => [200, 201].includes(response.status()))).toHaveLength(1);
  expect(responses.filter(response => response.status() === 422)).toHaveLength(2);
  const saved = await (await page.request.get(path)).json();
  expect(saved.meta.total_count).toBe(1);
  expect(saved.data).toHaveLength(1);
  const id = saved.current_user_comment.id;
  expect((await page.request.delete(`${path}/${id}`)).status()).toBe(422);
  expect((await page.request.delete(`${path}/${id}`, { headers })).status()).toBe(200);
  expect((await page.request.delete(`${path}/${id}`, { headers })).status()).toBe(404);
  expect((await (await page.request.get(path)).json()).meta.total_count).toBe(0);
});

test('comments hide private fields and reject foreign or mismatched deletion and forged authors', async ({ page, browser }) => {
  const author = await browser.newContext({ baseURL });
  let post: Awaited<ReturnType<typeof createContent>>;
  let foreignId: number;
  let authorId: number;
  try {
    const authorPage = await author.newPage(); await register(authorPage); post = await createContent(authorPage);
    const me = await (await author.request.get('/api/v1/me')).json(); authorId = me.data.id;
    const response = await author.request.post(`/api/v1/contents/${post.id}/comments`, { headers: { 'X-CSRF-Token': me.data.csrf_token }, data: { comment: { comment: '他の読者の感想' } } });
    expect(response.status()).toBe(201); foreignId = (await response.json()).data.id;
  } finally { await author.close(); }
  await register(page); const different = await createContent(page);
  const path = `/api/v1/contents/${post!.id}/comments`;
  const me = await (await page.request.get('/api/v1/me')).json();
  const headers = { 'X-CSRF-Token': me.data.csrf_token };
  const created = await page.request.post(path, { headers, data: { comment: { comment: '本人の感想', user_id: authorId!, content_id: different.id } } });
  expect(created.status()).toBe(201);
  const own = (await created.json()).data;
  expect(own.user.id).toBe(me.data.id); expect(own.content_id).toBe(Number(post!.id));
  expect((await page.request.delete(`${path}/${foreignId!}`, { headers })).status()).toBe(404);
  expect((await page.request.delete(`/api/v1/contents/${different.id}/comments/${own.id}`, { headers })).status()).toBe(404);
  const list = await page.request.get(path);
  expect(list.headers()['cache-control']).toContain('no-store');
  expect(await list.text()).not.toMatch(/email|csrf_token|encrypted_password/);
  expect((await list.json()).meta.total_count).toBe(2);
  expect((await page.request.delete(`${path}/${own.id}`, { headers })).status()).toBe(200);
  expect((await (await page.request.get(path)).json()).data[0].id).toBe(foreignId!);
});
