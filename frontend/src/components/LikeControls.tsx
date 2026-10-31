import { useEffect, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { ContentResponse, LikeState } from '../../../types/api-v1';
import { ContentRequestError, fetchContent } from '../api/contents';
import { LikeRequestError, setContentLike } from '../api/likes';
import styles from './LikeControls.module.css';

type Action = { target: boolean; checkOnly: boolean; signal: AbortSignal };
type Result = { state: LikeState; confirmed?: ContentResponse };
type Failure = { target: boolean; unknown: boolean };
const statusOf = (error: unknown) => error instanceof LikeRequestError || error instanceof ContentRequestError ? error.status : 0;
const stateOf = ({ data }: ContentResponse): LikeState => ({ content_id: data.id, likes_count: data.likes_count, liked_by_current_user: data.liked_by_current_user });

export default function LikeControls({ id, liked }: { id: string; liked: boolean }) {
  const client = useQueryClient();
  const alive = useRef(true);
  const busy = useRef(false);
  const controller = useRef<AbortController | null>(null);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [message, setMessage] = useState('');
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; controller.current?.abort(); };
  }, []);

  function apply(result: Result, action: Action) {
    if (!alive.current || action.signal.aborted) return;
    if (result.confirmed) client.setQueryData(['content', id], result.confirmed);
    else client.setQueryData<ContentResponse>(['content', id], old => old && ({ data: { ...old.data, likes_count: result.state.likes_count, liked_by_current_user: result.state.liked_by_current_user } }));
    if (result.state.liked_by_current_user === action.target) {
      setFailure(null);
      setMessage(result.confirmed ? 'いいねの状態を確認しました。' : action.target ? 'いいねしました。' : 'いいねを取り消しました。');
    } else setFailure({ target: action.target, unknown: false });
  }

  async function refreshAfterSessionOrContentChange() {
    // The parent page already provides the login-return and missing-post views.
    try { await client.fetchQuery({ queryKey: ['content', id], queryFn: ({ signal }) => fetchContent(id, signal), retry: false, staleTime: 0, networkMode: 'always' }); } catch { /* The query displays its error. */ }
  }

  const mutation = useMutation<Result, Error, Action>({
    retry: false,
    networkMode: 'always',
    mutationFn: async action => {
      if (action.checkOnly) {
        const confirmed = await fetchContent(id, action.signal);
        return { state: stateOf(confirmed), confirmed };
      }
      return { state: (await setContentLike(id, action.target, action.signal)).data };
    },
    onSuccess: apply,
    onError: async (error, action) => {
      if (!alive.current || action.signal.aborted) return;
      if ([401, 404].includes(statusOf(error))) { await refreshAfterSessionOrContentChange(); return; }
      if (action.checkOnly) { setFailure({ target: action.target, unknown: true }); return; }
      try {
        const confirmed = await fetchContent(id, action.signal);
        apply({ state: stateOf(confirmed), confirmed }, action);
      } catch (readError) {
        if (!alive.current || action.signal.aborted) return;
        if ([401, 404].includes(statusOf(readError))) await refreshAfterSessionOrContentChange();
        else setFailure({ target: action.target, unknown: true });
      }
    },
    onSettled: () => { if (alive.current) busy.current = false; },
  });

  function submit(target: boolean, checkOnly = false) {
    if (busy.current || !alive.current) return;
    busy.current = true;
    setFailure(null); setMessage('');
    controller.current = new AbortController();
    mutation.mutate({ target, checkOnly, signal: controller.current.signal });
  }

  return <section className={styles.controls} aria-label="いいねの操作">
    <button className={styles.button} type="button" aria-pressed={liked} aria-label={liked ? 'いいねを取り消す' : 'いいね'} aria-busy={mutation.isPending} disabled={mutation.isPending || !!failure} onClick={() => submit(!liked)}>
      {mutation.isPending ? '確認中…' : liked ? 'いいねを取り消す' : 'いいね'}
    </button>
    {message && <p role="status">{message}</p>}
    {failure && <div role="alert">
      <p>{failure.unknown ? '送信結果を確認できませんでした。状態を確認してください。' : 'いいねを更新できませんでした。現在の状態を確認したので、もう一度お試しください。'}</p>
      <button type="button" className={styles.button} disabled={mutation.isPending} onClick={() => submit(failure.target, failure.unknown)}>{failure.unknown ? '状態を確認' : 'もう一度試す'}</button>
    </div>}
  </section>;
}
