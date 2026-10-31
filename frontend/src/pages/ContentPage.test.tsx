import { it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Content } from '../../../types/api-v1';
import ContentPage from './ContentPage';

const post: Content = { id: 9, name: '積んだ本', description: '一行目\n二行目 <script>alert(1)</script>', created_at: '2026-10-31T00:00:00Z', user: { id: 7, name: '本を読む人', avatar_url: null }, photos: [], likes_count: 2, comments_count: 3, liked_by_current_user: true };
const response = (changes: Partial<Content> = {}) => new Response(JSON.stringify({ data: { ...post, ...changes } }));
function show() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(<QueryClientProvider client={client}><ContentPage id="9" loginUrl="/users/sign_in?return_to=%2Fcontents%2F9" /></QueryClientProvider>);
}

it('loads a post, escapes its description, and links to the author and existing update page', async () => {
  const fetch = vi.fn().mockResolvedValue(response()); vi.stubGlobal('fetch', fetch); show();
  expect(screen.getByRole('status')).toHaveTextContent('読み込み中');
  expect(await screen.findByRole('heading', { name: post.name })).toBeVisible();
  expect(screen.getByText(/一行目/)).toHaveTextContent('一行目 二行目 <script>alert(1)</script>');
  expect(document.querySelector('script')).toBeNull();
  expect(screen.getByRole('link', { name: post.user.name })).toHaveAttribute('href', '/users/7');
  expect(screen.getByText('画像はありません。')).toBeVisible();
  expect(screen.getByText('イメージ未登録')).toBeVisible();
  expect(screen.getByText('この投稿にいいねしています')).toBeVisible();
  expect(screen.getByText('2', { selector: 'dd' })).toBeVisible();
  expect(screen.getByText('3', { selector: 'dd' })).toBeVisible();
  expect(screen.getByRole('link', { name: '投稿一覧で操作できます' })).toHaveAttribute('href', '/contents#like-icon-post-9');
  expect(document.querySelector('time')).toHaveAttribute('datetime', post.created_at);
  expect(fetch).toHaveBeenCalledWith('/api/v1/contents/9', expect.objectContaining({ credentials: 'same-origin', signal: expect.any(AbortSignal) }));
});

it('keeps unnamed legacy posts and empty descriptions readable', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({ name: '', description: null }))); show();
  expect(await screen.findByRole('heading', { name: '無題の投稿' })).toBeVisible();
  expect(screen.getByText('説明はありません。')).toBeVisible();
});

it('offers retry after a transient failure, using the actual content request again', async () => {
  const fetch = vi.fn().mockRejectedValueOnce(new TypeError('Network error')).mockResolvedValueOnce(response());
  vi.stubGlobal('fetch', fetch); show();
  expect(await screen.findByRole('alert')).toHaveTextContent('投稿を読み込めませんでした');
  await userEvent.click(screen.getByRole('button', { name: '再読み込み' }));
  expect(await screen.findByRole('heading', { name: post.name })).toBeVisible();
  expect(fetch).toHaveBeenCalledTimes(2);
});

it('offers login and a return destination after a real HTTP 401', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 401 }))); show();
  expect(await screen.findByRole('alert')).toHaveTextContent('ログインが必要');
  expect(screen.getByRole('link', { name: 'ログインして投稿に戻る' })).toHaveAttribute('href', '/users/sign_in?return_to=%2Fcontents%2F9');
  expect(screen.queryByRole('button', { name: '再読み込み' })).not.toBeInTheDocument();
});

it('distinguishes a removed post from a retryable failure', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 404 }))); show();
  expect(await screen.findByRole('heading', { name: '投稿が見つかりません' })).toBeVisible();
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
  expect(screen.getByRole('link', { name: '投稿一覧へ' })).toHaveAttribute('href', '/contents');
});

it('uses thumbnails, links to originals, and replaces broken photos with readable feedback', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({ photos: [{ id: 1, thumbnail_url: '/uploads/thumb.png', url: '/uploads/original.png' }, { id: 2, thumbnail_url: null, url: null }] }))); show();
  const image = await screen.findByRole('img', { name: '投稿画像 1' });
  expect(image).toHaveAttribute('src', '/uploads/thumb.png');
  expect(screen.getByRole('link', { name: '投稿画像 1を元のサイズで開く' })).toHaveAttribute('href', '/uploads/original.png');
  fireEvent.error(image);
  expect(screen.getByRole('img', { name: '投稿画像 1を表示できません' })).toBeVisible();
  expect(screen.getByRole('img', { name: '投稿画像 2を表示できません' })).toBeVisible();
});
