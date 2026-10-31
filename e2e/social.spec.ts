import { test, expect, register, anotherUser, contentRegion, visit } from './helpers';

test('likes can be added, persist after reload, and be removed', async ({ page, browser }) => {
  const { content } = await anotherUser(browser, true);
  await register(page);
  await visit(page, '/contents');
  const likes = contentRegion(page, 'content-likes', content!);
  await likes.getByRole('link', { name: 'いいね', exact: true }).click();
  await expect(likes.getByRole('link', { name: 'いいねを取り消す', exact: true })).toBeVisible();
  await page.reload();
  await likes.getByRole('link', { name: 'いいねを取り消す', exact: true }).click();
  await expect(likes.getByRole('link', { name: 'いいね', exact: true })).toBeVisible();
  await page.reload();
  await expect(likes.getByRole('link', { name: 'いいね', exact: true })).toBeVisible();
});

test('a comment appears immediately and its author can delete it', async ({ page, browser }) => {
  const { content } = await anotherUser(browser, true);
  const user = await register(page);
  await visit(page, '/contents');
  const form = contentRegion(page, 'comment-form', content!);
  const comments = contentRegion(page, 'content-comments', content!);
  const message = `${user.name}のコメント`;
  await form.getByPlaceholder('コメント ...', { exact: true }).fill(message);
  await form.getByRole('button', { name: 'コメント送信', exact: true }).click();
  await expect(comments.getByText(message, { exact: true })).toBeVisible();
  await page.reload();
  await comments.getByRole('link', { name: 'コメント削除', exact: true }).click();
  await expect(comments.getByText(message, { exact: true })).toHaveCount(0);
  await page.reload();
  await expect(comments.getByText(message, { exact: true })).toHaveCount(0);
});

test('follow and unfollow update the button and both user lists', async ({ page, browser }) => {
  const { user: followed } = await anotherUser(browser);
  const user = await register(page);
  await visit(page, followed.path);
  await page.getByRole('button', { name: 'Follow', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Unfollow', exact: true })).toBeVisible();
  await visit(page, `${user.path}/following`);
  await expect(page.getByText(followed.name, { exact: true })).toBeVisible();
  await visit(page, `${followed.path}/followers`);
  await expect(page.getByText(user.name, { exact: true })).toBeVisible();
  await visit(page, followed.path);
  await page.getByRole('button', { name: 'Unfollow', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Follow', exact: true })).toBeVisible();
  await visit(page, `${user.path}/following`);
  await expect(page.getByText(followed.name, { exact: true })).toHaveCount(0);
  await visit(page, `${followed.path}/followers`);
  await expect(page.getByText(user.name, { exact: true })).toHaveCount(0);
});
