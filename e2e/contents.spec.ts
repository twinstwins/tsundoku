import { test, expect, register, createContent, visit, contentRegion, expectSaved, expectImageLoaded } from './helpers';

test('a text-only post opens even when its author has no avatar', async ({ page }) => {
  await register(page);
  const content = await createContent(page);
  await visit(page, content.path);
  await expect(page.getByText(content.title, { exact: true })).toBeVisible();
  await expect(page.getByText('イメージ未登録', { exact: true })).toBeVisible();
});

test('an image post navigates after saving and displays its thumbnail', async ({ page }) => {
  await register(page);
  const content = await createContent(page, true);
  await visit(page, content.path);
  const image = page.locator('img[src*="/uploads/photo/image/"]');
  await expectImageLoaded(image);
  await expect.poll(() => image.evaluate(element => (element as HTMLImageElement).naturalWidth)).toBeLessThanOrEqual(300);
});

test('sharing a post saves it and navigates to the confirmation', async ({ page }) => {
  await register(page);
  const content = await createContent(page);
  await contentRegion(page, 'share-form', content).getByRole('button').click();
  await expectSaved(page);
  await visit(page, '/contents');
  await expect(page.getByTestId('content-title').filter({ hasText: `${content.title}さんの投稿` })).toHaveCount(2);
});
