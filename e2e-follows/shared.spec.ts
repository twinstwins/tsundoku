import { test, expect, register, anotherUser, baseURL } from '../e2e/helpers';

test('follow state requires a session and CSRF, and concurrent API and legacy writes store one relation', async ({ page, browser }) => {
  const { user: target } = await anotherUser(browser);
  const user = await register(page); const path = `/api/v1${target.path}/follow`;
  const guest = await browser.newContext({ baseURL });
  try {
    for (const response of [await guest.request.get(path), await guest.request.put(path), await guest.request.delete(path)]) {
      expect(response.status()).toBe(401); expect(response.headers()['cache-control']).toContain('no-store');
    }
  } finally { await guest.close(); }
  expect((await page.request.put(path)).status()).toBe(422);
  const me = await (await page.request.get('/api/v1/me')).json(); const headers = { 'X-CSRF-Token': me.data.csrf_token };
  const responses = await Promise.all([
    page.request.put(path, { headers }), page.request.put(path, { headers }),
    page.request.post('/relationships', { headers: { ...headers, Accept: 'text/javascript', 'X-Requested-With': 'XMLHttpRequest' }, form: { 'relationship[following_id]': target.path.split('/').pop()! } }),
  ]);
  expect(responses[0].status()).toBe(200); expect(responses[1].status()).toBe(200); expect([200, 422]).toContain(responses[2].status());
  const saved = await page.request.get(path); expect(saved.headers()['cache-control']).toContain('no-store');
  expect((await saved.json()).data).toMatchObject({ followers_count: 1, followed_by_current_user: true, is_current_user: false });
  expect(await saved.text()).not.toMatch(/email|csrf_token|encrypted_password/);
  expect((await page.request.put(`/api/v1${user.path}/follow`, { headers })).status()).toBe(422);
  expect((await page.request.delete(path)).status()).toBe(422);
  for (const removed of await Promise.all([page.request.delete(path, { headers }), page.request.delete(path, { headers })])) {
    expect(removed.status()).toBe(200); expect((await removed.json()).data).toMatchObject({ followers_count: 0, followed_by_current_user: false });
  }
  expect((await page.request.get('/api/v1/users/0/follow')).status()).toBe(404);
});

test('unfollow preserves another follower and another target, and ignores a forged actor and target', async ({ page, browser }) => {
  const { user: target } = await anotherUser(browser); const { user: different } = await anotherUser(browser);
  const foreign = await browser.newContext({ baseURL });
  const path = `/api/v1${target.path}/follow`;
  try {
    await register(await foreign.newPage()); const me = await (await foreign.request.get('/api/v1/me')).json();
    expect((await foreign.request.put(path, { headers: { 'X-CSRF-Token': me.data.csrf_token } })).status()).toBe(200);
  } finally { await foreign.close(); }
  await register(page); const me = await (await page.request.get('/api/v1/me')).json(); const headers = { 'X-CSRF-Token': me.data.csrf_token };
  const body = { follower_id: Number(target.path.split('/').pop()), following_id: Number(different.path.split('/').pop()), user_id: Number(different.path.split('/').pop()) };
  expect((await page.request.put(`/api/v1${different.path}/follow`, { headers })).status()).toBe(200);
  const created = await page.request.put(path, { headers, data: body }); expect(created.status()).toBe(200);
  expect((await created.json()).data).toMatchObject({ user_id: Number(target.path.split('/').pop()), followers_count: 2, followed_by_current_user: true });
  const removed = await page.request.delete(path, { headers, data: body });
  expect((await removed.json()).data).toMatchObject({ followers_count: 1, followed_by_current_user: false });
  const following = await (await page.request.get(`/api/v1/users/${me.data.id}/following`)).json();
  expect(following.data.map((user: { id: number }) => user.id)).toEqual([Number(different.path.split('/').pop())]);
});
