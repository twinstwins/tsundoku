import { it, expect, vi } from 'vitest';
import { act, screen, waitFor } from '@testing-library/react';
import { startFrontendPages } from './bootstrap';

it('unmounts before Turbolinks caching and mounts once with fresh data on return', async () => {
  let name = '最初の読者';
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ data: [{ id: 1, name, avatar_url: null }], meta: { page: 1, per_page: 20, total_count: 1, total_pages: 1 } }))));
  document.body.innerHTML = '<div data-react-page="users"></div>';
  let stop = () => {};
  act(() => { stop = startFrontendPages(); });
  try {
    expect(await screen.findByRole('link', { name })).toBeVisible();
    act(() => { document.dispatchEvent(new Event('turbolinks:before-cache')); });
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    document.body.innerHTML = '<h1>既存の画面</h1>';
    act(() => { document.dispatchEvent(new Event('turbolinks:load')); });
    expect(screen.getByRole('heading')).toHaveTextContent('既存の画面');
    name = '戻った後の読者';
    document.body.innerHTML = '<div data-react-page="users"></div>';
    act(() => { document.dispatchEvent(new Event('turbolinks:load')); document.dispatchEvent(new Event('turbolinks:load')); });
    expect(await screen.findByRole('link', { name })).toBeVisible();
    expect(screen.getAllByRole('link')).toHaveLength(1);
  } finally { act(stop); }
});

it.each(['users', 'content'])('cancels pending %s requests before a cached page is stored', async (page) => {
  const signals: AbortSignal[] = [];
  vi.stubGlobal('fetch', vi.fn((_url, options) => new Promise((_resolve, reject) => {
    const signal: AbortSignal = options.signal; signals.push(signal);
    signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
  })));
  document.body.innerHTML = `<div data-react-page="${page}" data-content-id="9" data-login-url="/users/sign_in"></div>`;
  let stop = () => {};
  act(() => { stop = startFrontendPages(); });
  try {
    await waitFor(() => expect(signals.length).toBeGreaterThan(0));
    act(() => { document.dispatchEvent(new Event('turbolinks:before-cache')); });
    expect(signals.every(signal => signal.aborted)).toBe(true);
  } finally { act(stop); }
});

it('moves between the directory and two content pages without retaining another post', async () => {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => new Response(JSON.stringify(url.startsWith('/api/v1/users')
    ? { data: [{ id: 7, name: '読者', avatar_url: null }], meta: { page: 1, per_page: 20, total_count: 1, total_pages: 1 } }
    : { data: { id: Number(url.split('/').pop()), name: `本-${url.split('/').pop()}`, description: null, created_at: '2026-10-31T00:00:00Z', user: { id: 7, name: '読者', avatar_url: null }, photos: [], likes_count: 0, comments_count: 0, liked_by_current_user: false } }))));
  document.body.innerHTML = '<div data-react-page="users"></div>';
  let stop = () => {};
  act(() => { stop = startFrontendPages(); });
  try {
    expect(await screen.findByRole('link', { name: '読者' })).toBeVisible();
    for (const id of [9, 10]) {
      act(() => { document.dispatchEvent(new Event('turbolinks:before-cache')); });
      document.body.innerHTML = `<div data-react-page="content" data-content-id="${id}" data-login-url="/users/sign_in"></div>`;
      act(() => { document.dispatchEvent(new Event('turbolinks:load')); document.dispatchEvent(new Event('turbolinks:load')); });
      expect(await screen.findByRole('heading', { name: `本-${id}` })).toBeVisible();
      expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    }
    expect(screen.queryByRole('heading', { name: '本-9' })).not.toBeInTheDocument();
  } finally { act(stop); }
});
