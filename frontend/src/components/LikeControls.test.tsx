import { it, expect, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider, onlineManager } from '@tanstack/react-query';
import ContentPage from '../pages/ContentPage';

const json = (value: unknown) => new Response(JSON.stringify(value));
function server() {
  const state = {
    liked: false, reads: 0, tokens: 0, meStatus: 200, meError: false, writes: [] as string[],
    onWrite: null as null | ((method: string, options: RequestInit) => Response | Promise<Response>),
    onRead: null as null | (() => Response | Promise<Response>),
  };
  const normalWrite = (method: string) => {
    state.liked = method === 'PUT';
    return json({ data: { content_id: 9, likes_count: state.liked ? 1 : 0, liked_by_current_user: state.liked } });
  };
  vi.stubGlobal('fetch', vi.fn(async (url: string, options: RequestInit = {}) => {
    if (url === '/api/v1/me') {
      state.tokens++;
      if (state.meError) throw new TypeError('Offline');
      return state.meStatus === 200 ? json({ data: { csrf_token: `fresh-${state.tokens}` } }) : new Response('', { status: state.meStatus });
    }
    if (url.endsWith('/like')) {
      state.writes.push(options.method!);
      return state.onWrite ? state.onWrite(options.method!, options) : normalWrite(options.method!);
    }
    if (url === '/api/v1/contents/9') {
      state.reads++;
      if (state.onRead) return state.onRead();
      return json({ data: { id: 9, name: '本', description: null, created_at: '2026-10-31T00:00:00Z', user: { id: 7, name: '読者', avatar_url: null }, photos: [], likes_count: state.liked ? 1 : 0, comments_count: 0, liked_by_current_user: state.liked } });
    }
    throw new Error(`Unexpected request ${url}`);
  }));
  return { state, normalWrite };
}
function show() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(<QueryClientProvider client={client}><ContentPage id="9" loginUrl="/users/sign_in?return_to=%2Fcontents%2F9" likesEnabled /></QueryClientProvider>);
}
const button = (liked = false) => screen.findByRole('button', { name: liked ? 'いいねを取り消す' : 'いいね' });

it('uses fresh CSRF tokens and server counts for PUT and DELETE', async () => {
  const { state, normalWrite } = server();
  const tokens: string[] = [];
  state.onWrite = (method, options) => {
    expect(options.credentials).toBe('same-origin');
    tokens.push((options.headers as Record<string, string>)['X-CSRF-Token']);
    return normalWrite(method);
  };
  show();
  await userEvent.click(await button());
  await waitFor(async () => expect(await button(true)).toBeEnabled());
  expect(screen.getByText('1', { selector: 'dd' })).toBeVisible();
  await userEvent.click(await button(true));
  await waitFor(async () => expect(await button()).toBeEnabled());
  expect(state.writes).toEqual(['PUT', 'DELETE']);
  expect(tokens).toEqual(['fresh-1', 'fresh-2']);
  expect(state.reads).toBe(1);
  expect(screen.getAllByText('0', { selector: 'dd' })).toHaveLength(2);
});

it('blocks duplicate clicks and leaves the count unchanged while pending', async () => {
  const { state, normalWrite } = server();
  let finish!: () => void;
  state.onWrite = method => new Promise(resolve => { finish = () => resolve(normalWrite(method)); });
  show();
  const control = await button();
  fireEvent.click(control); fireEvent.click(control);
  await waitFor(() => expect(state.writes).toHaveLength(1));
  expect(control).toBeDisabled();
  expect(screen.getAllByText('0', { selector: 'dd' })).toHaveLength(2);
  finish();
  await waitFor(async () => expect(await button(true)).toBeEnabled());
  expect(state.writes).toEqual(['PUT']);
});

it('confirms an unsuccessful request before offering an explicit retry of the same intent', async () => {
  const { state } = server();
  state.onWrite = () => Promise.reject(new TypeError('Network failure'));
  show(); await userEvent.click(await button());
  expect(await screen.findByRole('alert')).toHaveTextContent('現在の状態を確認');
  expect(state.reads).toBe(2);
  expect(state.writes).toEqual(['PUT']);
  state.onWrite = null;
  await userEvent.click(screen.getByRole('button', { name: 'もう一度試す' }));
  await waitFor(async () => expect(await button(true)).toBeEnabled());
  expect(state.writes).toEqual(['PUT', 'PUT']);
});

it('recognizes a committed write after its response was lost without repeating it', async () => {
  const { state } = server();
  state.onWrite = () => { state.liked = true; return Promise.reject(new TypeError('Response lost')); };
  show(); await userEvent.click(await button());
  expect(await screen.findByRole('status')).toHaveTextContent('状態を確認しました');
  expect(await button(true)).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByText('1', { selector: 'dd' })).toBeVisible();
  expect(state.writes).toEqual(['PUT']);
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});

it('blocks new writes while the outcome is unknown and uses GET-only confirmation', async () => {
  const { state } = server();
  state.onWrite = () => { state.liked = true; state.onRead = () => Promise.reject(new TypeError('Offline')); return Promise.reject(new TypeError('Response lost')); };
  show(); await userEvent.click(await button());
  expect(await screen.findByRole('alert')).toHaveTextContent('送信結果を確認できませんでした');
  expect(await button()).toBeDisabled();
  state.onRead = null;
  await userEvent.click(screen.getByRole('button', { name: '状態を確認' }));
  await waitFor(async () => expect(await button(true)).toBeEnabled());
  expect(state.writes).toEqual(['PUT']);
  expect(state.tokens).toBe(1);
});

it('offers login and return when the session expires before sending a write', async () => {
  const { state } = server(); show();
  const control = await button();
  state.meStatus = 401; state.onRead = () => new Response('', { status: 401 });
  await userEvent.click(control);
  expect(await screen.findByRole('link', { name: 'ログインして投稿に戻る' })).toHaveAttribute('href', '/users/sign_in?return_to=%2Fcontents%2F9');
  expect(state.writes).toEqual([]);
});

it('does not queue an offline write for automatic execution on reconnect', async () => {
  const { state } = server(); show();
  const control = await button();
  state.meError = true; state.onRead = () => Promise.reject(new TypeError('Offline'));
  try {
    onlineManager.setOnline(false);
    await userEvent.click(control);
    expect(await screen.findByRole('alert')).toHaveTextContent('送信結果を確認できませんでした');
    state.meError = false; state.onRead = null;
    onlineManager.setOnline(true);
    expect(state.writes).toEqual([]);
    expect(await button()).toBeDisabled();
  } finally { onlineManager.setOnline(true); }
});

it('obtains another token for a user-initiated retry after CSRF rejection', async () => {
  const { state } = server();
  state.onWrite = () => new Response('', { status: 422 });
  show(); await userEvent.click(await button());
  await screen.findByRole('alert');
  state.onWrite = null;
  await userEvent.click(screen.getByRole('button', { name: 'もう一度試す' }));
  await waitFor(async () => expect(await button(true)).toBeEnabled());
  expect(state.tokens).toBe(2);
});

it('aborts an in-flight write on unmount without starting a reconciliation request', async () => {
  const { state } = server();
  let signal!: AbortSignal;
  state.onWrite = (_method, options) => new Promise((_resolve, reject) => {
    signal = options.signal!;
    signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
  });
  const view = show(); await userEvent.click(await button());
  await waitFor(() => expect(state.writes).toHaveLength(1));
  view.unmount();
  expect(signal.aborted).toBe(true);
  expect(state.reads).toBe(1);
});
