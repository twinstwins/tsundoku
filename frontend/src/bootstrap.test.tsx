import { it, expect, vi } from 'vitest';
import { act, screen, waitFor } from '@testing-library/react';
import { startUserDirectory } from './bootstrap';

it('unmounts before Turbolinks caching and mounts once with fresh data on return', async () => {
  let name = '最初の読者';
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ data: [{ id: 1, name, avatar_url: null }], meta: { page: 1, per_page: 20, total_count: 1, total_pages: 1 } }))));
  document.body.innerHTML = '<div data-react-page="users"></div>';
  let stop = () => {};
  act(() => { stop = startUserDirectory(); });
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

it('cancels pending user requests before a cached page is stored', async () => {
  const signals: AbortSignal[] = [];
  vi.stubGlobal('fetch', vi.fn((_url, options) => new Promise((_resolve, reject) => {
    const signal: AbortSignal = options.signal; signals.push(signal);
    signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
  })));
  document.body.innerHTML = '<div data-react-page="users"></div>';
  let stop = () => {};
  act(() => { stop = startUserDirectory(); });
  try {
    await waitFor(() => expect(signals.length).toBeGreaterThan(0));
    act(() => { document.dispatchEvent(new Event('turbolinks:before-cache')); });
    expect(signals.every(signal => signal.aborted)).toBe(true);
  } finally { act(stop); }
});
