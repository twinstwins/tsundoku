import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { UsersResponse } from '../../../types/api-v1';
import UsersPage from './UsersPage';
import { usersPage } from '../api/users';

const user = { id: 7, name: '本を読む人', avatar_url: null };
const payload = (data = [user], meta = {}): UsersResponse => ({ data, meta: { page: 1, per_page: 20, total_count: data.length, total_pages: data.length ? 1 : 0, ...meta } });
const response = (body: UsersResponse) => new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } });
function show(page = 1) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(<QueryClientProvider client={client}><UsersPage page={page} pathname="/users" /></QueryClientProvider>);
}

describe('user directory', () => {
  it('shows a loading status, then real profile links and the total', async () => {
    const fetch = vi.fn().mockResolvedValue(response(payload())); vi.stubGlobal('fetch', fetch);
    show();
    expect(screen.getByRole('status')).toHaveTextContent('読み込み中');
    expect(await screen.findByRole('link', { name: user.name })).toHaveAttribute('href', '/users/7');
    expect(screen.getByText('1人のユーザー')).toBeVisible();
    expect(screen.getByRole('img', { name: 'イメージ未登録' })).toBeVisible();
    expect(fetch).toHaveBeenCalledWith('/api/v1/users?page=1&per_page=20', expect.objectContaining({ credentials: 'same-origin', signal: expect.any(AbortSignal) }));
  });

  it('offers a user-controlled retry after a request failure', async () => {
    const fetch = vi.fn().mockResolvedValueOnce(new Response('', { status: 503 })).mockResolvedValueOnce(response(payload()));
    vi.stubGlobal('fetch', fetch); show();
    expect(await screen.findByRole('alert')).toHaveTextContent('ユーザーを読み込めませんでした');
    await userEvent.click(screen.getByRole('button', { name: '再読み込み' }));
    expect(await screen.findByRole('link', { name: user.name })).toBeVisible();
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('distinguishes an empty directory from an out-of-range page', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(payload([])))); show();
    expect(await screen.findByText('ユーザーはまだ登録されていません。')).toBeVisible();
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
  });

  it('preserves Rails URLs when linking between pages', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(payload([user], { page: 2, total_count: 45, total_pages: 3 })))); show(2);
    expect(await screen.findByRole('link', { name: '前のページ' })).toHaveAttribute('href', '/users');
    expect(screen.getByRole('link', { name: '次のページ' })).toHaveAttribute('href', '/users?page=3');
    expect(screen.getByText('2 / 3ページ')).toHaveAttribute('aria-current', 'page');
  });

  it('offers a way back to the first page after requesting an empty page', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response(payload([], { page: 99, total_count: 25, total_pages: 2 })))); show(99);
    expect(await screen.findByText('このページにはユーザーがいません。')).toBeVisible();
    expect(screen.getByRole('link', { name: '最初のページへ' })).toHaveAttribute('href', '/users');
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
  });

  it('bounds URL page numbers before passing them to the API', () => {
    expect(usersPage('?page=2')).toBe(2);
    expect(usersPage('?page=1000000')).toBe(1_000_000);
    for (const query of ['?page=0', '?page=abc', '?page=1000001', '?page=1.5']) expect(usersPage(query)).toBe(1);
  });
});
