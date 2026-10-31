import { it, expect, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider, onlineManager } from '@tanstack/react-query';
import FollowControls from './FollowControls';

const json = (value: unknown) => new Response(JSON.stringify(value));
function server() {
  const state = {
    followed: false, self: false, reads: 0, tokens: 0, meStatus: 200, meError: false, writes: [] as string[],
    onWrite: null as null | ((options: RequestInit) => Response | Promise<Response>),
    onRead: null as null | (() => Response | Promise<Response>),
  };
  const payload = () => ({ data: { user_id: 9, following_count: 2, followers_count: state.followed ? 6 : 5, followed_by_current_user: state.followed, is_current_user: state.self } });
  const normalWrite = (options: RequestInit) => { state.followed = options.method === 'PUT'; return json(payload()); };
  vi.stubGlobal('fetch', vi.fn(async (url: string, options: RequestInit = {}) => {
    if (url === '/api/v1/me') {
      state.tokens++;
      if (state.meError) throw new TypeError('Offline');
      return state.meStatus === 200 ? json({ data: { csrf_token: `fresh-${state.tokens}` } }) : new Response('', { status: state.meStatus });
    }
    if (url === '/api/v1/users/9/follow') {
      if (options.method) { state.writes.push(options.method); return state.onWrite ? state.onWrite(options) : normalWrite(options); }
      state.reads++; return state.onRead ? state.onRead() : json(payload());
    }
    throw new Error(`Unexpected request ${url}`);
  }));
  return { state, normalWrite };
}
function show() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(<QueryClientProvider client={client}><FollowControls id="9" loginUrl="/users/sign_in?return_to=%2Fusers%2F9" followingCount={2} followersCount={5} /></QueryClientProvider>);
}
const button = (followed = false) => screen.findByRole('button', { name: followed ? 'Unfollow' : 'Follow' });

it('keeps public list links and uses fresh CSRF tokens and server counts for both writes', async () => {
  const { state, normalWrite } = server(); const tokens: string[] = [];
  state.onWrite = options => { tokens.push((options.headers as Record<string, string>)['X-CSRF-Token']); expect(options.credentials).toBe('same-origin'); expect(options.body).toBeUndefined(); return normalWrite(options); };
  show();
  expect(screen.getByRole('link', { name: '2 following' })).toHaveAttribute('href', '/users/9/following');
  await userEvent.click(await button());
  await waitFor(async () => expect(await button(true)).toBeEnabled());
  expect(screen.getByRole('link', { name: '6 followers' })).toHaveAttribute('href', '/users/9/followers');
  await userEvent.click(await button(true)); await waitFor(async () => expect(await button()).toBeEnabled());
  expect(screen.getByRole('link', { name: '5 followers' })).toBeVisible();
  expect(tokens).toEqual(['fresh-1', 'fresh-2']); expect(state.writes).toEqual(['PUT', 'DELETE']);
});

it('blocks duplicate clicks and does not change counts before the server confirms', async () => {
  const { state, normalWrite } = server(); let finish!: () => void;
  state.onWrite = options => new Promise(resolve => { finish = () => resolve(normalWrite(options)); });
  show(); const control = await button(); fireEvent.click(control); fireEvent.click(control);
  await waitFor(() => expect(state.writes).toEqual(['PUT']));
  expect(control).toBeDisabled(); expect(screen.getByRole('link', { name: '5 followers' })).toBeVisible();
  finish(); await waitFor(async () => expect(await button(true)).toBeEnabled());
});

it('confirms an unsuccessful write and retries the same intent only on a user action', async () => {
  const { state } = server(); state.onWrite = () => Promise.reject(new TypeError('Network failure'));
  show(); await userEvent.click(await button());
  await screen.findByRole('button', { name: 'フォロー操作を再試行' });
  expect(state.reads).toBe(2); expect(state.writes).toEqual(['PUT']);
  state.onWrite = null; await userEvent.click(screen.getByRole('button', { name: 'フォロー操作を再試行' }));
  await waitFor(async () => expect(await button(true)).toBeEnabled()); expect(state.writes).toEqual(['PUT', 'PUT']);
});

it('reconciles committed follow and unfollow requests after losing their responses', async () => {
  const { state, normalWrite } = server();
  state.onWrite = options => { normalWrite(options); return Promise.reject(new TypeError('Response lost')); };
  show(); await userEvent.click(await button());
  await screen.findByText('フォローの状態を確認しました。');
  await userEvent.click(await button(true)); await waitFor(async () => expect(await button()).toBeEnabled());
  expect(state.writes).toEqual(['PUT', 'DELETE']); expect(screen.getByRole('link', { name: '5 followers' })).toBeVisible();
});

it('blocks unknown outcomes and confirms the result using GET without another write or token', async () => {
  const { state } = server();
  state.onWrite = () => { state.followed = true; state.onRead = () => Promise.reject(new TypeError('Offline')); return Promise.reject(new TypeError('Response lost')); };
  show(); await userEvent.click(await button());
  await screen.findByRole('button', { name: 'フォローの状態を確認' }); expect(await button()).toBeDisabled();
  state.onRead = null; await userEvent.click(screen.getByRole('button', { name: 'フォローの状態を確認' }));
  await waitFor(async () => expect(await button(true)).toBeEnabled());
  expect(state.writes).toEqual(['PUT']); expect(state.tokens).toBe(1);
});

it('can retry a failed state read while leaving public counters available', async () => {
  const { state } = server(); state.onRead = () => Promise.reject(new TypeError('Network failure'));
  show(); await screen.findByRole('alert'); expect(screen.getByRole('link', { name: '5 followers' })).toBeVisible();
  state.onRead = null; await userEvent.click(screen.getByRole('button', { name: 'フォロー状態を再読み込み' }));
  expect(await button()).toBeEnabled(); expect(state.writes).toEqual([]);
});

it('keeps the profile public and offers login for guests without fetching a token or showing writes', async () => {
  const { state } = server(); state.onRead = () => new Response('', { status: 401 });
  show(); expect(await screen.findByRole('link', { name: 'ログインしてプロフィールに戻る' })).toHaveAttribute('href', '/users/sign_in?return_to=%2Fusers%2F9');
  expect(screen.getByRole('link', { name: '5 followers' })).toBeVisible();
  expect(screen.queryByRole('button')).not.toBeInTheDocument(); expect(state.tokens).toBe(0);
});

it('never offers follow or unfollow on the current user profile', async () => {
  const { state } = server(); state.self = true; show();
  await screen.findByText('自分のプロフィールです。');
  expect(screen.queryByRole('button')).not.toBeInTheDocument(); expect(state.writes).toEqual([]);
});

it('stops writes when the target no longer exists', async () => {
  const { state } = server(); state.onRead = () => new Response('', { status: 404 }); show();
  expect(await screen.findByRole('alert')).toHaveTextContent('ユーザーが見つからない');
  expect(screen.queryByRole('button')).not.toBeInTheDocument(); expect(state.writes).toEqual([]);
});

it('offers login and return after session expiry without sending a write', async () => {
  const { state } = server(); show(); const control = await button(); state.meStatus = 401;
  await userEvent.click(control); await screen.findByRole('link', { name: 'ログインしてプロフィールに戻る' });
  expect(screen.queryByRole('button')).not.toBeInTheDocument(); expect(state.writes).toEqual([]);
});

it('does not queue offline writes or replay them on reconnect', async () => {
  const { state } = server(); show(); const control = await button();
  state.meError = true; state.onRead = () => Promise.reject(new TypeError('Offline'));
  try {
    onlineManager.setOnline(false); await userEvent.click(control);
    await screen.findByRole('button', { name: 'フォローの状態を確認' });
    state.meError = false; state.onRead = null; onlineManager.setOnline(true);
    expect(state.writes).toEqual([]); expect(await button()).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'フォローの状態を確認' }));
    await screen.findByRole('button', { name: 'フォロー操作を再試行' }); expect(state.writes).toEqual([]);
  } finally { onlineManager.setOnline(true); }
});

it('obtains a new token on explicit retry after a CSRF rejection', async () => {
  const { state } = server(); state.onWrite = () => new Response('', { status: 422 });
  show(); await userEvent.click(await button()); await screen.findByRole('button', { name: 'フォロー操作を再試行' });
  state.onWrite = null; await userEvent.click(screen.getByRole('button', { name: 'フォロー操作を再試行' }));
  await waitFor(async () => expect(await button(true)).toBeEnabled()); expect(state.tokens).toBe(2);
});

it('aborts an in-flight write when the profile unmounts without starting a reconciliation read', async () => {
  const { state } = server(); let signal!: AbortSignal;
  state.onWrite = options => new Promise((_resolve, reject) => { signal = options.signal!; signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError'))); });
  const view = show(); await userEvent.click(await button()); await waitFor(() => expect(state.writes).toEqual(['PUT']));
  view.unmount(); expect(signal.aborted).toBe(true); expect(state.reads).toBe(1);
});
