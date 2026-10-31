import { it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import type { ProfileContent, ProfileContentsResponse } from '../../../types/api-v1';
import ProfileHeader from './ProfileHeader';
import ProfilePosts from './ProfilePosts';

const user = { id: 7, name: '本を読む人', avatar_url: null, contents_count: 1, following_count: 2, followers_count: 3 };
const post: ProfileContent = { id: 9, name: '読んだ本', description: '本の説明', created_at: '2026-10-31T00:00:00Z', photos: [{ id: 1, url: '/original.png', thumbnail_url: '/thumb.png' }] };
const response = (data: unknown) => new Response(JSON.stringify(data));
const payload = (data = [post], meta = {}): ProfileContentsResponse => ({ data, meta: { page: 1, per_page: 20, total_count: data.length, total_pages: data.length ? 1 : 0, ...meta } });
function show(node: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(<QueryClientProvider client={client}>{node}</QueryClientProvider>);
}
const posts = (page = 1) => <ProfilePosts id="7" page={page} pathname="/users/7" />;

it('loads the public profile and preserves its heading and content count', async () => {
  const fetch = vi.fn().mockResolvedValue(response({ data: user })); vi.stubGlobal('fetch', fetch);
  show(<ProfileHeader id="7" />);
  expect(screen.getByRole('status')).toHaveTextContent('プロフィールを読み込み中');
  expect(await screen.findByRole('heading', { name: `${user.name}のページ` })).toBeVisible();
  expect(screen.getByText('1積んでいます')).toBeVisible();
  expect(fetch).toHaveBeenCalledWith('/api/v1/users/7', expect.objectContaining({ credentials: 'same-origin', signal: expect.any(AbortSignal) }));
});

it('retries the profile request after a transient HTTP failure', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(new Response('', { status: 503 })).mockResolvedValueOnce(response({ data: user })));
  show(<ProfileHeader id="7" />);
  expect(await screen.findByRole('alert')).toHaveTextContent('プロフィールを読み込めませんでした');
  await userEvent.click(screen.getByRole('button', { name: 'プロフィールを再読み込み' }));
  expect(await screen.findByRole('heading', { name: `${user.name}のページ` })).toBeVisible();
});

it('shows a distinct missing-user state without offering endless retries', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 404 })));
  show(<ProfileHeader id="7" />);
  expect(await screen.findByRole('heading', { name: 'ユーザーが見つかりません' })).toBeVisible();
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'ユーザー一覧へ' })).toHaveAttribute('href', '/users');
});

it('links both the post title and its thumbnail to the existing detail URL', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(payload()))); show(posts());
  expect(await screen.findByRole('link', { name: '読んだ本さんの投稿' })).toHaveAttribute('href', '/contents/9');
  expect(screen.getByRole('link', { name: '投稿画像 1の詳細を開く' })).toHaveAttribute('href', '/contents/9');
  expect(screen.getByRole('img', { name: '投稿画像 1' })).toHaveAttribute('src', '/thumb.png');
  expect(screen.getByText('計1件')).toBeVisible();
});

it('shows an empty profile without pagination controls', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(payload([])))); show(posts());
  expect(await screen.findByText('投稿はまだありません。')).toBeVisible();
  expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
});

it('keeps pagination in the profile URL', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(payload([post], { page: 2, total_count: 45, total_pages: 3 })))); show(posts(2));
  expect(await screen.findByRole('link', { name: '前のページ' })).toHaveAttribute('href', '/users/7');
  expect(screen.getByRole('link', { name: '次のページ' })).toHaveAttribute('href', '/users/7?page=3');
});

it('offers the first page when a formerly valid page has become empty', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(payload([], { page: 9, total_count: 21, total_pages: 2 })))); show(posts(9));
  expect(await screen.findByText('このページには投稿がありません。')).toBeVisible();
  expect(screen.getByRole('link', { name: '最初のページへ' })).toHaveAttribute('href', '/users/7');
});

it('can retry post loading independently of the public profile header', async () => {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValueOnce(new TypeError('Network failure')).mockResolvedValueOnce(response(payload()))); show(posts());
  expect(await screen.findByRole('alert')).toHaveTextContent('投稿を読み込めませんでした');
  await userEvent.click(screen.getByRole('button', { name: '投稿を再読み込み' }));
  expect(await screen.findByRole('link', { name: '読んだ本さんの投稿' })).toBeVisible();
});
