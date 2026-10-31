import { test, expect, register, createContent, baseURL } from '../e2e/helpers';

test('like requests are authenticated, CSRF-protected, and idempotent alongside legacy writes', async ({ page, browser }) => {
  await register(page);
  const post = await createContent(page);
  const path = `/api/v1/contents/${post.id}/like`;
  const guest = await browser.newContext({ baseURL });
  try {
    const response = await guest.request.put(path);
    expect(response.status()).toBe(401);
    expect(response.headers()['cache-control']).toContain('no-store');
  } finally { await guest.close(); }
  expect((await page.request.put(path)).status()).toBe(422);
  const me = await (await page.request.get('/api/v1/me')).json();
  const headers = { 'X-CSRF-Token': me.data.csrf_token, Accept: 'application/json' };
  const responses = await Promise.all([
    page.request.put(path, { headers }), page.request.put(path, { headers }),
    page.request.post(`/contents/${post.id}/likes`, { headers: { ...headers, Accept: 'text/javascript', 'X-Requested-With': 'XMLHttpRequest' } }),
  ]);
  expect(responses[0].status()).toBe(200);
  expect(responses[1].status()).toBe(200);
  expect([200, 422]).toContain(responses[2].status());
  const saved = await (await page.request.get(`/api/v1/contents/${post.id}`)).json();
  expect(saved.data).toMatchObject({ likes_count: 1, liked_by_current_user: true });
  const removals = await Promise.all([page.request.delete(path, { headers }), page.request.delete(path, { headers })]);
  for (const removal of removals) {
    expect(removal.status()).toBe(200);
    expect((await removal.json()).data).toMatchObject({ likes_count: 0, liked_by_current_user: false });
  }
});

test('removing the viewer like preserves another user like and ignores a forged actor', async ({ page, browser }) => {
  const author = await browser.newContext({ baseURL });
  let post: Awaited<ReturnType<typeof createContent>>;
  let authorId: number;
  try {
    const authorPage = await author.newPage();
    await register(authorPage);
    post = await createContent(authorPage);
    const me = await (await author.request.get('/api/v1/me')).json(); authorId = me.data.id;
    expect((await author.request.put(`/api/v1/contents/${post.id}/like`, { headers: { 'X-CSRF-Token': me.data.csrf_token } })).status()).toBe(200);
  } finally { await author.close(); }
  await register(page);
  const me = await (await page.request.get('/api/v1/me')).json();
  const headers = { 'X-CSRF-Token': me.data.csrf_token };
  const path = `/api/v1/contents/${post!.id}/like`;
  const initial = await page.request.delete(path, { headers });
  expect((await initial.json()).data).toMatchObject({ likes_count: 1, liked_by_current_user: false });
  const added = await page.request.put(path, { headers, data: { user_id: authorId!, content_id: 0 } });
  expect(added.status()).toBe(200);
  expect((await added.json()).data).toMatchObject({ likes_count: 2, liked_by_current_user: true });
  const removed = await page.request.delete(path, { headers, data: { user_id: authorId! } });
  expect((await removed.json()).data).toMatchObject({ likes_count: 1, liked_by_current_user: false });
});
