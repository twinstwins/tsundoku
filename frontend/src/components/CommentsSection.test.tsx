import { it, expect, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider, onlineManager } from '@tanstack/react-query';
import CommentsSection from './CommentsSection';

const json = (value: unknown) => new Response(JSON.stringify(value));
const comment = (id = 3, text = '感想\n二行目', owned = true) => ({ id, content_id: 9, comment: text, created_at: '2026-10-31T00:00:00Z', user: { id: owned ? 7 : 8, name: owned ? '本人' : '他の読者', avatar_url: null }, owned_by_current_user: owned });
function server() {
  const state = {
    own: null as ReturnType<typeof comment> | null, tokens: 0, reads: 0, writes: [] as string[], meStatus: 200,
    onWrite: null as null | ((options: RequestInit) => Response | Promise<Response>),
    onRead: null as null | ((page: number) => Response | Promise<Response>),
  };
  const normalWrite = (options: RequestInit) => {
    state.own = options.method === 'POST' ? comment(3, JSON.parse(options.body as string).comment.comment) : null;
    return json({ data: state.own });
  };
  vi.stubGlobal('fetch', vi.fn(async (url: string, options: RequestInit = {}) => {
    if (url === '/api/v1/me') {
      state.tokens++;
      return state.meStatus === 200 ? json({ data: { csrf_token: `fresh-${state.tokens}` } }) : new Response('', { status: state.meStatus });
    }
    if (options.method) { state.writes.push(options.method); return state.onWrite ? state.onWrite(options) : normalWrite(options); }
    state.reads++;
    const page = Number(new URL(url, 'http://test').searchParams.get('page'));
    return state.onRead ? state.onRead(page) : json({ data: state.own ? [state.own] : [], current_user_comment: state.own, meta: { page, per_page: 20, total_count: state.own ? 1 : 0, total_pages: state.own ? 1 : 0 } });
  }));
  return { state, normalWrite };
}
function show() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(<QueryClientProvider client={client}><CommentsSection id="9" loginUrl="/users/sign_in?return_to=%2Fcontents%2F9" /></QueryClientProvider>);
}
async function typeDraft(text = '感想\n二行目') {
  await waitFor(() => expect(screen.getByRole('button', { name: 'コメントを投稿' })).toBeEnabled());
  await userEvent.type(screen.getByLabelText('コメントを書く'), text);
}
const submit = () => screen.getByRole('button', { name: 'コメントを投稿' });

it('uses fresh tokens, renders text safely, and permits only the owner deletion', async () => {
  const { state, normalWrite } = server(); const tokens: string[] = [];
  state.onWrite = options => { tokens.push((options.headers as Record<string, string>)['X-CSRF-Token']); expect(options.credentials).toBe('same-origin'); return normalWrite(options); };
  show(); await typeDraft('<script>alert(1)</script>\n感想');
  await userEvent.click(submit());
  expect(await screen.findByRole('list')).toHaveTextContent('<script>alert(1)</script>');
  expect(document.querySelector('script')).toBeNull();
  expect(screen.getByLabelText('コメントを書く')).toHaveValue('');
  expect(submit()).toBeDisabled();
  await userEvent.click(screen.getByRole('button', { name: '自分のコメントを削除' }));
  await waitFor(() => expect(submit()).toBeEnabled());
  expect(tokens).toEqual(['fresh-1', 'fresh-2']);
  expect(state.writes).toEqual(['POST', 'DELETE']);
});

it('blocks duplicate submissions, keeps the draft while pending, and rejects whitespace locally', async () => {
  const { state, normalWrite } = server(); let finish!: () => void;
  state.onWrite = options => new Promise(resolve => { finish = () => resolve(normalWrite(options)); });
  show(); await typeDraft('  '); await userEvent.click(submit());
  expect(await screen.findByRole('alert')).toHaveTextContent('コメントを入力');
  expect(state.writes).toEqual([]);
  await userEvent.type(screen.getByLabelText('コメントを書く'), '感想');
  fireEvent.click(submit()); fireEvent.click(submit());
  await waitFor(() => expect(state.writes).toEqual(['POST']));
  expect(screen.getByLabelText('コメントを書く')).toHaveValue('  感想');
  expect(submit()).toBeDisabled(); finish();
  await screen.findByText('コメントを投稿しました。');
});

it('keeps a failed draft and retries the same text only on an explicit action', async () => {
  const { state } = server(); state.onWrite = () => Promise.reject(new TypeError('Offline'));
  show(); await typeDraft(); await userEvent.click(submit());
  await screen.findByRole('button', { name: 'コメント送信を再試行' });
  expect(screen.getByLabelText('コメントを書く')).toHaveValue('感想\n二行目');
  expect(state.writes).toEqual(['POST']); state.onWrite = null;
  await userEvent.click(screen.getByRole('button', { name: 'コメント送信を再試行' }));
  await screen.findByText('コメントを投稿しました。');
  expect(state.writes).toEqual(['POST', 'POST']);
});

it('recognizes committed create and delete requests after their responses are lost', async () => {
  const { state, normalWrite } = server();
  state.onWrite = options => { normalWrite(options); return Promise.reject(new TypeError('Lost response')); };
  show(); await typeDraft(); await userEvent.click(submit());
  await screen.findByText('保存済みの状態を確認しました。');
  expect(screen.getByLabelText('コメントを書く')).toHaveValue('');
  await userEvent.click(screen.getByRole('button', { name: '自分のコメントを削除' }));
  await waitFor(() => expect(submit()).toBeEnabled());
  expect(state.writes).toEqual(['POST', 'DELETE']);
});

it('blocks an unknown result and confirms it with GET only, preserving a later draft edit', async () => {
  const { state, normalWrite } = server();
  state.onWrite = options => { normalWrite(options); state.onRead = () => Promise.reject(new TypeError('Offline')); return Promise.reject(new TypeError('Lost response')); };
  show(); await typeDraft(); await userEvent.click(submit());
  await screen.findByRole('button', { name: 'コメントの状態を確認' });
  expect(submit()).toBeDisabled();
  await userEvent.type(screen.getByLabelText('コメントを書く'), '下書きの追記');
  state.onRead = null;
  await userEvent.click(screen.getByRole('button', { name: 'コメントの状態を確認' }));
  await screen.findByText('保存済みの状態を確認しました。');
  expect(screen.getByLabelText('コメントを書く')).toHaveValue('感想\n二行目下書きの追記');
  expect(state.writes).toEqual(['POST']); expect(state.tokens).toBe(1);
});

it('shows server field errors and keeps a different existing comment without overwriting it', async () => {
  const { state } = server();
  state.onWrite = () => new Response(JSON.stringify({ error: { code: 'validation_error', fields: { comment: ['内容を確認してください'] } } }), { status: 422 });
  show(); await typeDraft(); await userEvent.click(submit());
  expect(await screen.findByRole('alert')).toHaveTextContent('内容を確認してください');
  expect(screen.getByLabelText('コメントを書く')).toHaveValue('感想\n二行目');
  state.onWrite = () => { state.own = comment(4, '別の画面で投稿済み'); return new Response('', { status: 422 }); };
  await userEvent.click(submit());
  await screen.findByText('すでに別のコメントがあります。入力内容は保持しています。');
  expect(submit()).toBeDisabled(); expect(screen.getByLabelText('コメントを書く')).toHaveValue('感想\n二行目');
});

it('requires a new explicit submission of an edited draft after confirming the original was not saved', async () => {
  const { state } = server();
  state.onWrite = () => { state.onRead = () => Promise.reject(new TypeError('Offline')); return Promise.reject(new TypeError('Offline')); };
  show(); await typeDraft('古い下書き'); await userEvent.click(submit());
  await screen.findByRole('button', { name: 'コメントの状態を確認' });
  await userEvent.clear(screen.getByLabelText('コメントを書く'));
  await userEvent.type(screen.getByLabelText('コメントを書く'), '編集した下書き');
  state.onRead = null; state.onWrite = null;
  await userEvent.click(screen.getByRole('button', { name: 'コメントの状態を確認' }));
  await waitFor(() => expect(submit()).toBeEnabled());
  expect(screen.queryByRole('button', { name: 'コメント送信を再試行' })).not.toBeInTheDocument();
  expect(state.writes).toEqual(['POST']);
  await userEvent.click(submit()); await screen.findByText('コメントを投稿しました。');
  expect(state.own?.comment).toBe('編集した下書き');
});

it('keeps the draft visible for copying when the session expires, without sending a write', async () => {
  const { state } = server(); show(); await typeDraft(); state.meStatus = 401;
  await userEvent.click(submit());
  expect(await screen.findByRole('link', { name: 'ログインして投稿に戻る' })).toHaveAttribute('href', '/users/sign_in?return_to=%2Fcontents%2F9');
  expect(screen.getByLabelText('コメントを書く')).toHaveValue('感想\n二行目');
  expect(state.writes).toEqual([]); expect(submit()).toBeDisabled();
});

it('does not queue an offline write or replay it on reconnect', async () => {
  const { state } = server(); show(); await typeDraft();
  state.meStatus = 503; state.onRead = () => Promise.reject(new TypeError('Offline'));
  try {
    onlineManager.setOnline(false); await userEvent.click(submit());
    await screen.findByRole('button', { name: 'コメントの状態を確認' });
    state.meStatus = 200; state.onRead = null; onlineManager.setOnline(true);
    expect(submit()).toBeDisabled(); expect(state.writes).toEqual([]);
    await userEvent.click(screen.getByRole('button', { name: 'コメントの状態を確認' }));
    await screen.findByRole('button', { name: 'コメント送信を再試行' });
    expect(state.writes).toEqual([]);
  } finally { onlineManager.setOnline(true); }
});

it('preserves a draft across pagination and makes an off-page owned comment removable', async () => {
  const { state } = server();
  state.onRead = page => json({ data: page === 1 ? [comment(10, '他の人', false)] : [], current_user_comment: null, meta: { page, per_page: 20, total_count: 21, total_pages: 2 } });
  show(); await typeDraft('途中の下書き');
  await userEvent.click(screen.getByRole('button', { name: '次のコメント' }));
  await screen.findByText('このページにはコメントがありません。');
  expect(screen.getByLabelText('コメントを書く')).toHaveValue('途中の下書き');
  expect(screen.queryByRole('button', { name: '自分のコメントを削除' })).not.toBeInTheDocument();
  state.onRead = page => json({ data: [], current_user_comment: comment(3, 'ページ外の本人'), meta: { page, per_page: 20, total_count: 21, total_pages: 2 } });
  await userEvent.click(screen.getByRole('button', { name: '前のコメント' }));
  await screen.findByText('ページ外の本人');
  expect(screen.getByRole('button', { name: '自分のコメントを削除' })).toBeEnabled();
});

it('aborts an in-flight request on unmount without starting a reconciliation read', async () => {
  const { state } = server(); let signal!: AbortSignal;
  state.onWrite = options => new Promise((_resolve, reject) => { signal = options.signal!; signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError'))); });
  const view = show(); await typeDraft(); await userEvent.click(submit());
  await waitFor(() => expect(state.writes).toEqual(['POST'])); view.unmount();
  expect(signal.aborted).toBe(true); expect(state.reads).toBe(1);
});
