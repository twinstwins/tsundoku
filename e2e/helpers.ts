import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { expect, test as base, type Browser, type Locator, type Page } from '@playwright/test';

export const baseURL = process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:43122';
export const imagePath = path.join(__dirname, 'fixtures', 'book.png');
const password = 'E2ePassword123!';

export const test = base.extend<{ pageHealth: void }>({
  pageHealth: [async ({ page }, use) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('response', response => {
      if (response.url().startsWith(baseURL) && response.status() >= 500) {
        errors.push(`${response.status()} ${response.url()}`);
      }
    });
    await use();
    expect(errors, 'Unexpected browser or server errors').toEqual([]);
  }, { auto: true }],
});
export { expect };

export type User = { name: string; email: string; password: string; path: string };
export type Content = { title: string; id: string; path: string };

export async function visit(page: Page, pathname: string) {
  const response = await page.goto(new URL(pathname, baseURL).href);
  expect(response?.status(), pathname).toBe(200);
}

export async function register(page: Page, withAvatar = false): Promise<User> {
  const key = randomUUID().slice(0, 12);
  const name = `読者-${key}`;
  const email = `reader-${key}@example.test`;
  await visit(page, '/users/sign_up');
  await page.getByLabel('Name', { exact: true }).fill(name);
  await page.getByLabel('Email', { exact: true }).fill(email);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByLabel('Password confirmation', { exact: true }).fill(password);
  if (withAvatar) await page.getByLabel('プロフィール画像', { exact: true }).setInputFiles(imagePath);
  await page.getByRole('button', { name: '登録する', exact: true }).click();
  await expect(page).toHaveURL(new URL('/', baseURL).href);
  const profile = page.getByRole('link', { name, exact: true });
  await expect(profile).toBeVisible();
  const userPath = await profile.getAttribute('href');
  expect(userPath).toMatch(/^\/users\/\d+$/);
  return { name, email, password, path: userPath! };
}

export async function logout(page: Page) {
  const navigation = page.getByRole('navigation');
  const link = navigation.getByRole('link', { name: 'ログアウト', exact: true });
  if (!(await link.isVisible())) {
    await navigation.getByRole('button', { name: 'Toggle navigation' }).click();
  }
  await link.click();
  const signIn = navigation.getByRole('link', { name: 'ログイン', exact: true, includeHidden: true });
  await expect(signIn).toHaveCount(1);
  if (!(await signIn.isVisible())) {
    await navigation.getByRole('button', { name: 'Toggle navigation' }).click();
  }
  await expect(signIn).toBeVisible();
}

export async function login(page: Page, user: User) {
  await visit(page, '/users/sign_in');
  await page.getByLabel('Email', { exact: true }).fill(user.email);
  await page.getByLabel('Password', { exact: true }).fill(user.password);
  await page.getByRole('button', { name: 'ログインする', exact: true }).click();
  await expect(page).toHaveURL(new URL('/', baseURL).href);
  await expect(page.getByRole('link', { name: user.name, exact: true })).toBeVisible();
}

export async function expectSaved(page: Page, reactForm = false) {
  if (reactForm) {
    await expect(page).toHaveURL(/\/contents\/[1-9]\d*$/);
    return;
  }
  await expect(page).toHaveURL(new URL('/', baseURL).href);
  await expect(page.getByText('投稿が保存されました', { exact: true }).first()).toBeVisible();
}

export async function createContent(page: Page, withImage = false): Promise<Content> {
  const title = `積読-${randomUUID().slice(0, 12)}`;
  await visit(page, '/contents/new');
  await page.getByLabel('Name', { exact: true }).fill(title);
  await page.getByLabel('Description', { exact: true }).fill('E2Eで作成した本の紹介');
  if (withImage) await page.getByLabel('投稿画像', { exact: true }).setInputFiles(imagePath);
  await page.getByRole('button', { name: '投稿', exact: true }).click();
  await expectSaved(page, process.env.EXPECT_REACT_CONTENT_FORM === '1');
  await visit(page, '/contents');
  const marker = page.getByTestId('content-title').filter({ hasText: `${title}さんの投稿` });
  await expect(marker).toHaveCount(1);
  const id = await marker.getAttribute('data-content-id');
  expect(id).toMatch(/^\d+$/);
  return { title, id: id!, path: `/contents/${id}` };
}

export function contentRegion(page: Page, testId: string, content: Content): Locator {
  return page.getByTestId(testId).and(page.locator(`[data-content-id="${content.id}"]`));
}

export async function anotherUser(browser: Browser, withContent = false) {
  const context = await browser.newContext({ baseURL });
  try {
    const page = await context.newPage();
    const user = await register(page);
    const content = withContent ? await createContent(page) : undefined;
    return { user, content };
  } finally {
    await context.close();
  }
}

export async function expectImageLoaded(image: Locator) {
  await expect(image).toBeVisible();
  await expect.poll(() => image.evaluate(element => (element as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
}
