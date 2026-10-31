import { it, expect, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider, onlineManager } from '@tanstack/react-query';
import ContentFormPage from './ContentFormPage';

const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status });
const result = (name = '新しい本') => ({ data: { id: 9, name, description: '説明', user: { id: 7, name: '読者', avatar_url: null }, photos: [], created_at: '2026-10-31T00:00:00Z', likes_count: 0, comments_count: 0, liked_by_current_user: false } });
function server() {
  const state = {
    tokens: 0, reads: 0, meStatus: 200, meId: 7, offline: false,
    writes: [] as { key: string; body: FormData }[], saved: new Map<string, ReturnType<typeof result>>(),
    onWrite: null as null | ((options: RequestInit) => Response | Promise<Response>),
  };
  const normalWrite = (options: RequestInit) => {
    const key = (options.headers as Record<string, string>)['Idempotency-Key'];
    state.saved.set(key, result(String((options.body as FormData).get('content[name]')))); return json(state.saved.get(key), 201);
  };
  vi.stubGlobal('fetch', vi.fn(async (url: string, options: RequestInit = {}) => {
    if (url === '/api/v1/me') {
      state.tokens++; if (state.offline) throw new TypeError('Offline');
      return state.meStatus === 200 ? json({ data: { id: state.meId, csrf_token: `token-${state.tokens}` } }) : new Response('', { status: state.meStatus });
    }
    if (url.startsWith('/api/v1/content-submissions/')) {
      state.reads++; if (state.offline) throw new TypeError('Offline');
      const saved = state.saved.get(url.split('/').pop()!); return saved ? json(saved) : new Response('', { status: 404 });
    }
    if (url === '/api/v1/contents') {
      state.writes.push({ key: (options.headers as Record<string, string>)['Idempotency-Key'], body: options.body as FormData });
      return state.onWrite ? state.onWrite(options) : normalWrite(options);
    }
    throw new Error(`Unexpected request ${url}`);
  }));
  return { state, normalWrite };
}
function show() {
  const navigate = vi.fn(); const client = new QueryClient();
  const view = render(<QueryClientProvider client={client}><ContentFormPage userId="7" loginUrl="/users/sign_in?return_to=%2Fcontents%2Fnew" navigate={navigate} /></QueryClientProvider>);
  return { ...view, navigate };
}
const submit = () => screen.getByRole('button', { name: '投稿' });
async function fill(withImage = false) {
  await userEvent.type(screen.getByLabelText('Name'), '新しい本');
  await userEvent.type(screen.getByLabelText('Description'), '説明');
  if (withImage) await userEvent.upload(screen.getByLabelText('投稿画像'), new File(['png'], 'book.png', { type: 'image/png' }));
}

it('sends a multipart body with CSRF, an idempotency key, and the selected file before opening the saved post', async () => {
  const { state, normalWrite } = server(); state.onWrite = options => {
    const headers = options.headers as Record<string, string>;
    expect(headers['Content-Type']).toBeUndefined(); expect(headers['X-CSRF-Token']).toBe('token-1');
    expect(options.credentials).toBe('same-origin'); return normalWrite(options);
  };
  const { navigate } = show(); await fill(true); await userEvent.click(submit());
  await waitFor(() => expect(navigate).toHaveBeenCalledWith('/contents/9'));
  expect(state.writes[0]!.key).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  expect(state.writes[0]!.body.get('content[name]')).toBe('新しい本');
  expect((state.writes[0]!.body.get('content[image]') as File).name).toBe('book.png');
});

it('blocks duplicate submissions and keeps the draft read-only until the request completes', async () => {
  const { state, normalWrite } = server(); let finish!: () => void;
  state.onWrite = options => new Promise(resolve => { finish = () => resolve(normalWrite(options)); });
  const { navigate } = show(); await fill(); const control = submit(); fireEvent.click(control); fireEvent.click(control);
  await waitFor(() => expect(state.writes).toHaveLength(1));
  expect(control).toBeDisabled(); expect(screen.getByLabelText('Name')).toHaveAttribute('readonly');
  finish(); await waitFor(() => expect(navigate).toHaveBeenCalledTimes(1));
});

it('validates whitespace and oversized images locally without requesting a token', async () => {
  const { state } = server(); show(); await userEvent.type(screen.getByLabelText('Name'), '  '); await userEvent.click(submit());
  expect(await screen.findByRole('alert')).toHaveTextContent('名前を入力');
  await userEvent.type(screen.getByLabelText('Name'), '本');
  await userEvent.upload(screen.getByLabelText('投稿画像'), new File([new Uint8Array(5 * 1024 * 1024 + 1)], 'large.png', { type: 'image/png' }));
  await userEvent.click(submit()); expect(await screen.findByRole('alert')).toHaveTextContent('5MB'); expect(state.tokens).toBe(0);
});

it('retains text and the selected file after server validation and uses a new key after correction', async () => {
  const { state } = server(); state.onWrite = () => json({ error: { code: 'validation_error', fields: { image: ['画像を確認してください'] } } }, 422);
  const { navigate } = show(); await fill(true); await userEvent.click(submit());
  await screen.findByText('画像を確認してください');
  expect(screen.getByLabelText('Name')).toHaveValue('新しい本'); expect(screen.getByLabelText('Description')).toHaveValue('説明');
  expect(screen.getByLabelText('投稿画像')).toHaveProperty('files', expect.objectContaining({ length: 1 }));
  expect(screen.getByLabelText('Name')).not.toHaveAttribute('readonly');
  state.onWrite = null; await userEvent.type(screen.getByLabelText('Name'), 'の修正'); await userEvent.click(submit());
  await waitFor(() => expect(navigate).toHaveBeenCalledTimes(1)); expect(state.writes[0]!.key).not.toBe(state.writes[1]!.key);
  expect(state.tokens).toBe(2);
});

it('retries a failed request with the same immutable content, file, and key only on an explicit action', async () => {
  const { state } = server(); state.onWrite = () => Promise.reject(new TypeError('Network failure'));
  const { navigate } = show(); await fill(true); await userEvent.click(submit()); await screen.findByRole('button', { name: '同じ内容で再送' });
  expect(screen.getByLabelText('Name')).toHaveAttribute('readonly'); expect(screen.getByLabelText('投稿画像')).toBeDisabled();
  state.onWrite = null; await userEvent.click(screen.getByRole('button', { name: '同じ内容で再送' }));
  await waitFor(() => expect(navigate).toHaveBeenCalledTimes(1)); expect(state.writes[0]!.key).toBe(state.writes[1]!.key);
  expect((state.writes[1]!.body.get('content[image]') as File).name).toBe('book.png');
});

it('recognizes a committed post after losing its response without repeating the upload', async () => {
  const { state, normalWrite } = server(); state.onWrite = options => { normalWrite(options); return Promise.reject(new TypeError('Response lost')); };
  const { navigate } = show(); await fill(true); await userEvent.click(submit());
  await waitFor(() => expect(navigate).toHaveBeenCalledWith('/contents/9')); expect(state.writes).toHaveLength(1); expect(state.reads).toBe(1);
});

it('confirms unknown outcomes using GET only before offering the original request for manual retry', async () => {
  const { state } = server(); state.onWrite = () => { state.offline = true; return Promise.reject(new TypeError('Offline')); };
  const { navigate } = show(); await fill(); await userEvent.click(submit()); await screen.findByRole('button', { name: '保存状態を確認' });
  state.offline = false; state.onWrite = null; await userEvent.click(screen.getByRole('button', { name: '保存状態を確認' }));
  await screen.findByRole('button', { name: '同じ内容で再送' }); expect(state.writes).toHaveLength(1); expect(state.tokens).toBe(1);
  await userEvent.click(screen.getByRole('button', { name: '同じ内容で再送' })); await waitFor(() => expect(navigate).toHaveBeenCalledTimes(1));
});

it('does not discard an uncertain request identity after later CSRF or malformed-request rejections', async () => {
  const { state } = server(); state.onWrite = () => Promise.reject(new TypeError('Response lost'));
  const { navigate } = show(); await fill(); await userEvent.click(submit()); await screen.findByRole('button', { name: '同じ内容で再送' });
  state.onWrite = () => json({ error: { code: 'invalid_csrf_token' } }, 422);
  await userEvent.click(screen.getByRole('button', { name: '同じ内容で再送' })); await screen.findByRole('button', { name: '同じ内容で再送' });
  expect(screen.getByLabelText('Name')).toHaveAttribute('readonly');
  state.onWrite = () => json({ error: { code: 'invalid_request' } }, 400);
  await userEvent.click(screen.getByRole('button', { name: '同じ内容で再送' })); await screen.findByRole('button', { name: '同じ内容で再送' });
  expect(screen.getByLabelText('Name')).toHaveAttribute('readonly'); state.onWrite = null;
  await userEvent.click(screen.getByRole('button', { name: '同じ内容で再送' })); await waitFor(() => expect(navigate).toHaveBeenCalledTimes(1));
  expect(new Set(state.writes.map(write => write.key)).size).toBe(1); expect(state.tokens).toBe(4);
});

it('keeps a copyable draft and selected filename after session expiry without posting or replaying', async () => {
  const { state } = server(); state.meStatus = 401; const { navigate } = show(); await fill(true); await userEvent.click(submit());
  expect(await screen.findByRole('link', { name: 'ログインして投稿フォームに戻る' })).toHaveAttribute('href', '/users/sign_in?return_to=%2Fcontents%2Fnew');
  expect(screen.getByLabelText('Name')).toHaveValue('新しい本'); expect(screen.getByText('選択中：book.png')).toBeVisible();
  expect(state.writes).toEqual([]); expect(navigate).not.toHaveBeenCalled();
});

it('refuses to post if the account changed since the form was opened', async () => {
  const { state } = server(); state.meId = 8; show(); await fill(); await userEvent.click(submit());
  await screen.findByRole('link', { name: 'ログインして投稿フォームに戻る' }); expect(state.writes).toEqual([]);
});

it('never queues an offline creation for automatic execution on reconnect', async () => {
  const { state } = server(); show(); await fill(); state.offline = true;
  try {
    onlineManager.setOnline(false); await userEvent.click(submit()); await screen.findByRole('button', { name: '保存状態を確認' });
    state.offline = false; onlineManager.setOnline(true); expect(state.writes).toEqual([]); expect(screen.getByLabelText('Name')).toHaveAttribute('readonly');
    await userEvent.click(screen.getByRole('button', { name: '保存状態を確認' })); await screen.findByRole('button', { name: '同じ内容で再送' });
    expect(state.writes).toEqual([]);
  } finally { onlineManager.setOnline(true); }
});

it('offers the existing post explicitly on a conflicting identity without claiming the current draft was saved', async () => {
  const { state } = server(); state.onWrite = options => {
    state.saved.set((options.headers as Record<string, string>)['Idempotency-Key'], result('別の保存済み投稿'));
    return json({ error: { code: 'submission_conflict' } }, 409);
  };
  const { navigate } = show(); await fill(); await userEvent.click(submit());
  expect(await screen.findByRole('link', { name: '保存済みの投稿を確認' })).toHaveAttribute('href', '/contents/9');
  expect(navigate).not.toHaveBeenCalled(); expect(screen.getByLabelText('Name')).toHaveValue('新しい本');
});

it('aborts an in-flight upload on unmount without checking its result or navigating', async () => {
  const { state } = server(); let signal!: AbortSignal;
  state.onWrite = options => new Promise((_resolve, reject) => { signal = options.signal!; signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError'))); });
  const view = show(); await fill(true); await userEvent.click(submit()); await waitFor(() => expect(state.writes).toHaveLength(1));
  view.unmount(); expect(signal.aborted).toBe(true); expect(state.reads).toBe(0); expect(view.navigate).not.toHaveBeenCalled();
});
