import type { MeResponse, UsersResponse, ContentResponse } from '../types/api-v1/types.gen';
import { test, expect, register, anotherUser, createContent } from './helpers';

test('public API hides email while private endpoints require a session', async ({ page, browser }) => {
  const unauthenticated = await page.request.get('/api/v1/me');
  expect(unauthenticated.status()).toBe(401);
  expect((await unauthenticated.json()).error.code).toBe('unauthenticated');
  const { user } = await anotherUser(browser);
  const response = await page.request.get('/api/v1/users');
  expect(response.status()).toBe(200);
  const body: UsersResponse = await response.json();
  expect(body.data.some(item => item.name === user.name)).toBe(true);
  expect(body.data.every(item => !('email' in item))).toBe(true);
  expect(response.headers()['cache-control']).toContain('no-store');
});

test('session API shares CSRF protection and rejects another user update', async ({ page, browser }) => {
  const { user: other } = await anotherUser(browser);
  const user = await register(page);
  const content = await createContent(page);
  const meResponse = await page.request.get('/api/v1/me');
  expect(meResponse.status()).toBe(200);
  const me: MeResponse = await meResponse.json();
  expect(me.data.email).toBe(user.email);
  const detailResponse = await page.request.get(`/api/v1/contents/${content.id}`);
  expect(detailResponse.status()).toBe(200);
  const detail: ContentResponse = await detailResponse.json();
  expect(detail.data.name).toBe(content.title);

  const withoutToken = await page.request.post('/contents', { data: { content: { name: '不正な送信' } }, headers: { Accept: 'application/json' } });
  expect(withoutToken.status()).toBe(422);
  expect((await withoutToken.json()).error.code).toBe('invalid_csrf_token');
  const headers = { Accept: 'application/json', 'X-CSRF-Token': me.data.csrf_token };
  const invalid = await page.request.post('/contents', { data: { content: { name: '' } }, headers });
  expect(invalid.status()).toBe(422);
  expect((await invalid.json()).error.fields.name.length).toBeGreaterThan(0);
  const unauthorized = await page.request.patch(other.path, { data: { user: { name: '不正な変更' } }, headers });
  expect(unauthorized.status()).toBe(404);
  const profile = await page.request.get(`/api/v1${other.path}`);
  expect((await profile.json()).data.name).toBe(other.name);
});
