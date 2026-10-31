import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CommentsResponse, ContentResponse } from '../../../types/api-v1';
import { CommentRequestError, fetchComments, writeComment, type CommentAction } from '../api/comments';
import styles from './CommentsSection.module.css';

type Operation = { action: CommentAction; checkOnly: boolean; page: number; signal: AbortSignal };
type Failure = { action: CommentAction; unknown: boolean };
const statusOf = (error: unknown) => error instanceof CommentRequestError ? error.status : 0;

export default function CommentsSection({ id, loginUrl }: { id: string; loginUrl: string }) {
  const client = useQueryClient();
  const [page, setPage] = useState(1);
  const [draft, setDraft] = useState('');
  const draftValue = useRef('');
  const [fieldError, setFieldError] = useState('');
  const [message, setMessage] = useState('');
  const [failure, setFailure] = useState<Failure | null>(null);
  const [sessionExpired, setSessionExpired] = useState(false);
  const [missing, setMissing] = useState(false);
  const alive = useRef(true);
  const busy = useRef(false);
  const controller = useRef<AbortController | null>(null);
  const comments = useQuery({ queryKey: ['comments', id, page], queryFn: ({ signal }) => fetchComments(id, page, signal), retry: false, refetchOnReconnect: false });
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; controller.current?.abort(); };
  }, []);

  async function apply(result: CommentsResponse, operation: Operation, reconciled: boolean) {
    if (!alive.current || operation.signal.aborted) return;
    await client.cancelQueries({ queryKey: ['comments', id], exact: false });
    if (!alive.current || operation.signal.aborted) return;
    void client.invalidateQueries({ queryKey: ['comments', id], refetchType: 'none' });
    client.setQueryData(['comments', id, operation.page], result);
    client.setQueryData<ContentResponse>(['content', id], old => old && ({ data: { ...old.data, comments_count: result.meta.total_count } }));
    const { action } = operation;
    const own = result.current_user_comment;
    const complete = action.kind === 'create' ? own?.comment === action.text : own?.id !== action.id;
    if (complete) {
      setFailure(null);
      setMessage(reconciled ? '保存済みの状態を確認しました。' : action.kind === 'create' ? 'コメントを投稿しました。' : 'コメントを削除しました。');
      if (action.kind === 'create' && draftValue.current === action.text) changeDraft('');
    } else if (action.kind === 'create' && own) {
      setFailure(null);
      setMessage('すでに別のコメントがあります。入力内容は保持しています。');
    } else if (action.kind === 'create' && draftValue.current !== action.text) {
      setFailure(null);
      setMessage('保存されていません。編集した入力内容を確認して投稿してください。');
    } else setFailure({ action, unknown: false });
  }

  const mutation = useMutation<CommentsResponse, Error, Operation>({
    retry: false, networkMode: 'always',
    mutationFn: async operation => {
      if (!operation.checkOnly) await writeComment(id, operation.action, operation.signal);
      return fetchComments(id, operation.page, operation.signal);
    },
    onSuccess: (result, operation) => apply(result, operation, operation.checkOnly),
    onError: async (error, operation) => {
      if (!alive.current || operation.signal.aborted) return;
      if (statusOf(error) === 401) { setSessionExpired(true); return; }
      if (error instanceof CommentRequestError && (error.status === 400 || error.fields.comment)) {
        setFieldError(error.fields.comment?.join('、') || '入力内容を確認してください。'); return;
      }
      if (operation.checkOnly) {
        if (statusOf(error) === 404) setMissing(true);
        else setFailure({ action: operation.action, unknown: true });
        return;
      }
      try {
        const result = await fetchComments(id, operation.page, operation.signal);
        await apply(result, operation, true);
      } catch (readError) {
        if (!alive.current || operation.signal.aborted) return;
        if (statusOf(readError) === 401) setSessionExpired(true);
        else if (statusOf(readError) === 404) setMissing(true);
        else setFailure({ action: operation.action, unknown: true });
      }
    },
    onSettled: () => { if (alive.current) busy.current = false; },
  });

  function perform(action: CommentAction, checkOnly = false) {
    if (busy.current || !alive.current) return;
    busy.current = true;
    setFailure(null); setFieldError(''); setMessage('');
    controller.current = new AbortController();
    mutation.mutate({ action, checkOnly, page, signal: controller.current.signal });
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    if (!draft.trim()) { setFieldError('コメントを入力してください。'); return; }
    perform({ kind: 'create', text: draft });
  }
  function changeDraft(value: string) {
    draftValue.current = value;
    setDraft(value);
  }

  const login = sessionExpired || statusOf(comments.error) === 401;
  const absent = missing || statusOf(comments.error) === 404;
  const own = comments.data?.current_user_comment;
  const blocked = mutation.isPending || !!failure || comments.isError || !comments.data || login || absent;
  return <section className={styles.section} aria-labelledby="comments-heading">
    <h2 id="comments-heading" className={styles.heading}>コメント</h2>
    {login && <div role="alert"><p>ログインが必要です。入力内容をコピーしてからログインしてください。ログイン後に自動送信はしません。</p><a href={loginUrl} data-turbolinks="false">ログインして投稿に戻る</a></div>}
    {absent && <p role="alert">投稿が見つからないためコメントを表示できません。</p>}
    {!login && !absent && <>
      {comments.isPending && <p role="status">コメントを読み込み中…</p>}
      {comments.isError && <div role="alert"><p>コメントを読み込めませんでした。</p><button type="button" disabled={comments.isFetching} onClick={() => void comments.refetch()}>コメントを再読み込み</button></div>}
      {!comments.isError && comments.data && <>
        <p>計{comments.data.meta.total_count}件</p>
        {own && <div className={styles.own} aria-label="自分のコメント">
          <p>この投稿にはコメント済みです。削除すると再投稿できます。</p>
          {!comments.data.data.some(comment => comment.id === own.id) && <p className={styles.text}>{own.comment}</p>}
          <button type="button" disabled={blocked} onClick={() => perform({ kind: 'delete', id: own.id })}>自分のコメントを削除</button>
        </div>}
        {!comments.data.data.length ? <p>{comments.data.meta.total_count === 0 ? 'コメントはまだありません。' : 'このページにはコメントがありません。'}</p>
          : <ul className={styles.list} aria-label="投稿へのコメント">
            {comments.data.data.map(comment => <li key={comment.id}>
              <a href={`/users/${comment.user.id}`}>{comment.user.name}</a>
              <p className={styles.text}>{comment.comment}</p>
              <time dateTime={comment.created_at}>{new Intl.DateTimeFormat('ja-JP', { dateStyle: 'long', timeZone: 'Asia/Tokyo' }).format(new Date(comment.created_at))}</time>
            </li>)}
          </ul>}
        {comments.data.meta.total_pages > 1 && <nav className={styles.pagination} aria-label="コメントのページ">
          <button type="button" disabled={page === 1 || blocked} onClick={() => setPage(page - 1)}>前のコメント</button>
          <span aria-current="page">{page} / {comments.data.meta.total_pages}ページ</span>
          <button type="button" disabled={page >= comments.data.meta.total_pages || blocked} onClick={() => setPage(page + 1)}>次のコメント</button>
        </nav>}
        {page > 1 && !comments.data.data.length && <button type="button" disabled={blocked} onClick={() => setPage(1)}>最初のコメントへ</button>}
      </>}
    </>}
    <form onSubmit={submit} className={styles.form}>
      <label htmlFor="comment-text">コメントを書く</label>
      <textarea id="comment-text" rows={4} value={draft} disabled={mutation.isPending} aria-invalid={!!fieldError} aria-describedby={fieldError ? 'comment-error' : undefined} onChange={event => {
        changeDraft(event.target.value); setFieldError(''); setMessage('');
        if (failure && !failure.unknown) setFailure(null);
      }} />
      {fieldError && <p id="comment-error" role="alert">{fieldError}</p>}
      <button type="submit" disabled={blocked || !!own} aria-busy={mutation.isPending}>コメントを投稿</button>
    </form>
    {message && <p role="status">{message}</p>}
    {failure && !login && !absent && <div role="alert">
      <p>{failure.unknown ? '送信結果を確認できませんでした。状態を確認してください。' : '変更が反映されていません。入力内容を保持しています。'}</p>
      <button type="button" disabled={mutation.isPending} onClick={() => perform(failure.action, failure.unknown)}>{failure.unknown ? 'コメントの状態を確認' : failure.action.kind === 'create' ? 'コメント送信を再試行' : '削除を再試行'}</button>
    </div>}
  </section>;
}
