import { randomUUID } from 'node:crypto';
import { test, expect, register, createContent, visit, anotherUser } from '../e2e/helpers';

test('profile and post requests can each recover without hiding the other section', async ({ page }) => {
  const user = await register(page);
  const post = await createContent(page);
  const profileApi = `**/api/v1/users/${user.path.split('/').pop()}`;
  const postsApi = `${profileApi}/contents?*`;
  await page.route(profileApi, route => route.abort('failed'));
  await visit(page, user.path);
  await expect(page.getByRole('alert')).toHaveText(/プロフィールを読み込めませんでした/);
  await expect(page.getByRole('link', { name: `${post.title}さんの投稿`, exact: true })).toBeVisible();
  await page.unroute(profileApi);
  await page.getByRole('button', { name: 'プロフィールを再読み込み' }).click();
  await expect(page.getByRole('heading', { name: `${user.name}のページ`, exact: true })).toBeVisible();
  await page.route(postsApi, route => route.abort('failed'));
  await page.reload();
  await expect(page.getByRole('alert')).toHaveText(/投稿を読み込めませんでした/);
  await expect(page.getByRole('heading', { name: `${user.name}のページ`, exact: true })).toBeVisible();
  await page.unroute(postsApi);
  await page.getByRole('button', { name: '投稿を再読み込み' }).click();
  await expect(page.getByRole('link', { name: `${post.title}さんの投稿`, exact: true })).toBeVisible();
});

test('broken profile and post images retain readable names and post links', async ({ page }) => {
  const user = await register(page, true);
  const post = await createContent(page, true);
  await page.route('**/uploads/user/avatar/**', route => route.abort('failed'));
  await page.route('**/uploads/photo/image/**', route => route.abort('failed'));
  await visit(page, user.path);
  await expect(page.getByRole('heading', { name: `${user.name}のページ`, exact: true })).toBeVisible();
  await expect(page.getByRole('img', { name: 'イメージ未登録' })).toBeVisible();
  await expect(page.getByRole('img', { name: '投稿画像 1を表示できません' })).toBeVisible();
  await expect(page.getByRole('link', { name: `${post.title}さんの投稿`, exact: true })).toBeVisible();
});

test('profile pagination contains only the selected author and survives reload', async ({ page }) => {
  const user = await register(page);
  const me = await (await page.request.get('/api/v1/me')).json();
  const titles: string[] = [];
  for (let count = 0; count < 20; count++) {
    const title = `本-${randomUUID().slice(0, 12)}`;
    const response = await page.request.post('/contents', {
      form: { 'content[name]': title, 'content[description]': 'ページ送りの準備' },
      headers: { 'X-CSRF-Token': me.data.csrf_token }, maxRedirects: 0,
    });
    expect(response.status()).toBe(302);
    titles.push(title);
  }
  const newest = await createContent(page);
  await visit(page, user.path);
  await expect(page.getByText('21積んでいます', { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: `${newest.title}さんの投稿`, exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: `${titles[0]}さんの投稿`, exact: true })).toHaveCount(0);
  await page.getByRole('link', { name: '次のページ', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`${user.path}\\?page=2$`));
  await expect(page.getByRole('link', { name: `${titles[0]}さんの投稿`, exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('link', { name: `${titles[0]}さんの投稿`, exact: true })).toBeVisible();
  await page.getByRole('link', { name: '前のページ', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`${user.path}$`));
});

test('follow controls update their counters without replacing the React profile', async ({ page, browser }) => {
  const { user: followed } = await anotherUser(browser);
  const user = await register(page);
  await visit(page, followed.path);
  const root = page.locator('[data-react-page="profile"]');
  await expect(page.getByRole('heading', { name: `${followed.name}のページ`, exact: true })).toBeVisible();
  await root.evaluate(element => element.setAttribute('data-probe', 'kept'));
  if (process.env.EXPECT_REACT_FOLLOWS === '1') {
    await expect(root.getByRole('button', { name: 'Follow', exact: true })).toBeEnabled();
    await expect(page.locator('#following_form')).toHaveCount(0);
  }
  await page.getByRole('button', { name: 'Follow', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Unfollow', exact: true })).toBeVisible();
  await expect(page.locator(`a[href="${followed.path}/followers"]`)).toHaveText('1 followers');
  await expect(root).toHaveAttribute('data-probe', 'kept');
  await expect(page.locator('[data-react-page]')).toHaveCount(2);
  await visit(page, `${user.path}/following`);
  await expect(page.getByText(followed.name, { exact: true })).toBeVisible();
  await page.getByRole('link', { name: '詳細', exact: true }).click();
  await page.getByRole('button', { name: 'Unfollow', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Follow', exact: true })).toBeVisible();
  await expect(page.locator(`a[href="${followed.path}/followers"]`)).toHaveText('0 followers');
  await expect(page.locator('[data-react-page]')).toHaveCount(2);
  await expect(page.getByText(followed.email, { exact: true })).toHaveCount(0);
});
