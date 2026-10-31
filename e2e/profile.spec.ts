import { test, expect, register, visit, imagePath, expectImageLoaded } from './helpers';

test('the owner can update their name and avatar using their current password', async ({ page }) => {
  const user = await register(page);
  await visit(page, '/users/edit');
  const newName = `${user.name}-更新`;
  await page.getByLabel('Name', { exact: true }).fill(newName);
  await page.getByLabel('Avatar', { exact: true }).setInputFiles(imagePath);
  await page.getByLabel('Current password', { exact: true }).fill(user.password);
  await page.getByRole('button', { name: 'Update', exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`${user.path}$`));
  await expect(page.getByRole('heading', { name: `${newName}のページ`, exact: true })).toBeVisible();
  await page.reload();
  await expectImageLoaded(page.locator('img[src*="/uploads/user/avatar/"]'));
});
