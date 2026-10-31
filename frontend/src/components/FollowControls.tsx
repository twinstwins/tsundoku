import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { FollowStateResponse, UserResponse } from '../../../types/api-v1';
import { fetchFollow, FollowRequestError, setFollow } from '../api/follows';
import styles from './FollowControls.module.css';

type Action = { target: boolean; checkOnly: boolean; signal: AbortSignal };
type Failure = { target: boolean; unknown: boolean };
const statusOf = (error: unknown) => error instanceof FollowRequestError ? error.status : 0;

export default function FollowControls({ id, loginUrl, followingCount, followersCount }: { id: string; loginUrl: string; followingCount: number; followersCount: number }) {
  const client = useQueryClient();
  const state = useQuery({ queryKey: ['follow', id], queryFn: ({ signal }) => fetchFollow(id, signal), retry: false, refetchOnReconnect: false });
  const alive = useRef(true);
  const busy = useRef(false);
  const controller = useRef<AbortController | null>(null);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [message, setMessage] = useState('');
  const [sessionExpired, setSessionExpired] = useState(false);
  const [missing, setMissing] = useState(false);
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; controller.current?.abort(); };
  }, []);

  async function apply(result: FollowStateResponse, action: Action, confirmed: boolean) {
    if (!alive.current || action.signal.aborted) return;
    await client.cancelQueries({ queryKey: ['follow', id], exact: true });
    if (!alive.current || action.signal.aborted) return;
    client.setQueryData(['follow', id], result);
    client.setQueryData<UserResponse>(['profile', id], old => old && ({ data: { ...old.data, following_count: result.data.following_count, followers_count: result.data.followers_count } }));
    if (result.data.followed_by_current_user === action.target) {
      setFailure(null);
      setMessage(confirmed ? 'フォローの状態を確認しました。' : action.target ? 'フォローしました。' : 'フォローを解除しました。');
    } else setFailure({ target: action.target, unknown: false });
  }
  function unavailable(error: unknown) {
    if (statusOf(error) === 401) { setSessionExpired(true); return true; }
    if (statusOf(error) === 404) { setMissing(true); return true; }
    return false;
  }
  const mutation = useMutation<FollowStateResponse, Error, Action>({
    retry: false, networkMode: 'always',
    mutationFn: action => action.checkOnly ? fetchFollow(id, action.signal) : setFollow(id, action.target, action.signal),
    onSuccess: (result, action) => apply(result, action, action.checkOnly),
    onError: async (error, action) => {
      if (!alive.current || action.signal.aborted || unavailable(error)) return;
      if (action.checkOnly) { setFailure({ target: action.target, unknown: true }); return; }
      try { await apply(await fetchFollow(id, action.signal), action, true); }
      catch (readError) {
        if (!alive.current || action.signal.aborted || unavailable(readError)) return;
        setFailure({ target: action.target, unknown: true });
      }
    },
    onSettled: () => { if (alive.current) busy.current = false; },
  });
  function submit(target: boolean, checkOnly = false) {
    if (busy.current || !alive.current) return;
    busy.current = true; setFailure(null); setMessage('');
    controller.current = new AbortController();
    mutation.mutate({ target, checkOnly, signal: controller.current.signal });
  }
  const login = sessionExpired || statusOf(state.error) === 401;
  const absent = missing || statusOf(state.error) === 404;
  const data = state.data?.data;
  return <section className={styles.controls} aria-label="フォローの操作">
    <div className={styles.counts}>
      <a href={`/users/${id}/following`}>{data?.following_count ?? followingCount} following</a>
      <a href={`/users/${id}/followers`}>{data?.followers_count ?? followersCount} followers</a>
    </div>
    {login ? <p><a href={loginUrl} data-turbolinks="false">ログインしてプロフィールに戻る</a></p>
      : absent ? <p role="alert">ユーザーが見つからないためフォローできません。<a href="/users">ユーザー一覧へ</a></p>
      : <>
        {state.isPending && <p role="status">フォロー状態を確認中…</p>}
        {state.isError && <div role="alert"><p>フォロー状態を読み込めませんでした。</p><button type="button" disabled={state.isFetching} onClick={() => void state.refetch()}>フォロー状態を再読み込み</button></div>}
        {!state.isError && data && (data.is_current_user ? <p>自分のプロフィールです。</p> : <>
          <button type="button" aria-label={data.followed_by_current_user ? 'Unfollow' : 'Follow'} aria-pressed={data.followed_by_current_user} aria-busy={mutation.isPending} disabled={mutation.isPending || !!failure} onClick={() => submit(!data.followed_by_current_user)}>{mutation.isPending ? '確認中…' : data.followed_by_current_user ? 'Unfollow' : 'Follow'}</button>
          {message && <p role="status">{message}</p>}
          {failure && <div role="alert">
            <p>{failure.unknown ? '送信結果を確認できませんでした。状態を確認してください。' : 'フォローを更新できませんでした。現在の状態を確認したので、もう一度お試しください。'}</p>
            <button type="button" disabled={mutation.isPending} onClick={() => submit(failure.target, failure.unknown)}>{failure.unknown ? 'フォローの状態を確認' : 'フォロー操作を再試行'}</button>
          </div>}
        </>)}
      </>}
  </section>;
}
