import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { test, expect, register, createContent, expectImageLoaded, anotherUser, visit } from '../e2e/helpers';

test('Rails loads Vite modules and React Refresh preserves image fallback state', async ({ page, browser }) => {
  const user = await register(page, true);
  const me = await (await page.request.get('/api/v1/me')).json();
  const avatarUrl: string = me.data.avatar_url;
  let requests = 0;
  await page.route(`**${avatarUrl}`, route => { requests++; return route.abort('failed'); });
  await page.reload();
  const row = page.getByRole('listitem').filter({ has: page.getByRole('link', { name: user.name, exact: true }) });
  await expect(row.getByRole('img', { name: 'イメージ未登録' })).toBeVisible();
  await expect(page.locator('script[src="http://frontend:5173/@vite/client"]')).toHaveCount(1);
  await page.evaluate(() => { (window as any).__refreshDocument = 'same-document'; });
  const requestsBefore = requests;
  const source = path.join(process.env.FRONTEND_TEST_SOURCE!, 'src/components/UserAvatar.tsx');
  const original = await readFile(source, 'utf8');
  try {
    await writeFile(source, original.replace('イメージ未登録', '画像なし'));
    await expect(row.getByRole('img', { name: '画像なし' })).toBeVisible({ timeout: 15_000 });
    expect(await page.evaluate(() => (window as any).__refreshDocument)).toBe('same-document');
    expect(requests).toBe(requestsBefore);
    await expect(page.getByRole('link', { name: user.name, exact: true })).toHaveCount(1);
  } finally {
    await writeFile(source, original);
    await expect(row.getByRole('img', { name: 'イメージ未登録' })).toBeVisible({ timeout: 15_000 });
  }
  const post = await createContent(page, true);
  await page.locator(`a[href="${post.path}"]`).first().click();
  await expect(page.getByRole('heading', { name: post.title, exact: true })).toBeVisible();
  await expect(page.locator('[data-react-page="content"]')).toHaveCount(1);
  await expectImageLoaded(page.getByRole('img', { name: '投稿画像 1', exact: true }));
  await page.getByRole('button', { name: 'いいね', exact: true }).click();
  await expect(page.getByRole('button', { name: 'いいねを取り消す', exact: true })).toBeEnabled();
  await expect(page.locator('dd')).toHaveText(['1', '0']);
  await page.getByLabel('コメントを書く', { exact: true }).fill('開発サーバーからの感想');
  await page.getByRole('button', { name: 'コメントを投稿', exact: true }).click();
  await expect(page.getByRole('list', { name: '投稿へのコメント' })).toContainText('開発サーバーからの感想');
  await expect(page.locator('dd')).toHaveText(['1', '1']);
  await page.getByRole('list', { name: '投稿へのコメント' }).getByRole('link', { name: user.name, exact: true }).click();
  await expect(page.getByRole('heading', { name: `${user.name}のページ`, exact: true })).toBeVisible();
  await expect(page.locator('[data-react-page="profile"]')).toHaveCount(1);
  await expect(page.locator('[data-react-page="profile-posts"]')).toHaveCount(1);
  await expect(page.getByRole('link', { name: `${post.title}さんの投稿`, exact: true })).toBeVisible();
  await expect(page.getByText('自分のプロフィールです。')).toBeVisible();
  const { user: target } = await anotherUser(browser);
  await visit(page, target.path);
  await page.getByRole('button', { name: 'Follow', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Unfollow', exact: true })).toBeEnabled();
  await expect(page.locator(`a[href="${target.path}/followers"]`)).toHaveText('1 followers');
});
