import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { test, expect, register } from '../e2e/helpers';

test('Rails loads Vite modules and React Refresh preserves image fallback state', async ({ page }) => {
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
});
