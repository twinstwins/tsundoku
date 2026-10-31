import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useMutation } from '@tanstack/react-query';
import type { ContentResponse } from '../../../types/api-v1';
import { fetchSubmission, submitContent, newSubmissionKey, SubmissionRequestError, type ContentAttempt } from '../api/contentSubmissions';
import styles from './ContentFormPage.module.css';

type Operation = { attempt: ContentAttempt; checkOnly: boolean; signal: AbortSignal };
type Failure = { attempt: ContentAttempt; unknown: boolean };

export default function ContentFormPage({ userId, loginUrl, navigate = path => window.location.assign(path) }: { userId: string; loginUrl: string; navigate?: (path: string) => void }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [image, setImage] = useState<File | null>(null);
  const [attempt, setAttempt] = useState<ContentAttempt | null>(null);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [message, setMessage] = useState('');
  const [login, setLogin] = useState(false);
  const [saved, setSaved] = useState<number | null>(null);
  const [conflict, setConflict] = useState<number | null>(null);
  const alive = useRef(true);
  const busy = useRef(false);
  const controller = useRef<AbortController | null>(null);
  const fileInput = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; controller.current?.abort(); };
  }, []);

  function complete(result: ContentResponse, operation: Operation) {
    if (!alive.current || operation.signal.aborted) return;
    setFailure(null); setSaved(result.data.id); setMessage('投稿を保存しました。');
    navigate(`/contents/${result.data.id}`);
  }
  const mutation = useMutation<ContentResponse, Error, Operation>({
    retry: false, networkMode: 'always',
    mutationFn: operation => operation.checkOnly ? fetchSubmission(operation.attempt, operation.signal) : submitContent(operation.attempt, operation.signal),
    onSuccess: complete,
    onError: async (error, operation) => {
      if (!alive.current || operation.signal.aborted) return;
      const requestError = error instanceof SubmissionRequestError ? error : null;
      if (requestError?.status === 401) { setLogin(true); return; }
      if (!operation.checkOnly && requestError && (
        (requestError.status === 400 && !operation.attempt.uncertain) ||
        (requestError.status === 422 && (requestError.code === 'validation_error' || !operation.attempt.uncertain))
      )) {
        setAttempt(null); setFailure(null); setErrors(requestError.fields);
        setMessage('投稿できませんでした。入力内容を確認して、もう一度投稿してください。'); return;
      }
      operation.attempt.uncertain = true;
      if (operation.checkOnly) {
        setFailure({ attempt: operation.attempt, unknown: requestError?.status !== 404 }); return;
      }
      try {
        const result = await fetchSubmission(operation.attempt, operation.signal);
        if (!alive.current || operation.signal.aborted) return;
        if (requestError?.status === 409) { setConflict(result.data.id); setMessage('別の内容が保存されています。入力内容をコピーしてから、保存済みの投稿を確認してください。'); }
        else complete(result, operation);
      } catch (readError) {
        if (!alive.current || operation.signal.aborted) return;
        if (readError instanceof SubmissionRequestError && readError.status === 401) setLogin(true);
        else setFailure({ attempt: operation.attempt, unknown: !(readError instanceof SubmissionRequestError && readError.status === 404) });
      }
    },
    onSettled: () => { if (alive.current) busy.current = false; },
  });
  function perform(value: ContentAttempt, checkOnly = false) {
    if (busy.current || !alive.current) return;
    busy.current = true; setFailure(null); setErrors({}); setMessage(''); setAttempt(value);
    controller.current = new AbortController();
    mutation.mutate({ attempt: value, checkOnly, signal: controller.current.signal });
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    if (attempt || busy.current) return;
    const fields: Record<string, string[]> = {};
    if (!name.trim()) fields.name = ['名前を入力してください。'];
    if (image && (image.size > 5 * 1024 * 1024 || !['image/jpeg', 'image/png', 'image/gif'].includes(image.type))) fields.image = ['JPEG・PNG・GIFの画像を5MB以下で選択してください。'];
    if (Object.keys(fields).length) { setErrors(fields); return; }
    perform({ name, description, image, key: newSubmissionKey(), userId: Number(userId), uncertain: false });
  }
  const locked = mutation.isPending || !!attempt || login || !!saved || !!conflict;
  return <main className={styles.page}>
    <p><a href="/contents">投稿一覧へ</a></p>
    <h1>新しい投稿</h1>
    {login && <div role="alert"><p>ログイン状態が変わりました。名前と説明をコピーし、画像を控えてからログインしてください。ログイン後に自動送信はしません。</p><a href={loginUrl} data-turbolinks="false">ログインして投稿フォームに戻る</a></div>}
    <form noValidate onSubmit={submit} className={styles.form}>
      <label htmlFor="content-name">Name</label>
      <input id="content-name" value={name} maxLength={255} readOnly={locked} aria-invalid={!!errors.name} aria-describedby={errors.name ? 'name-error' : undefined} onChange={event => { setName(event.target.value); setErrors({}); setMessage(''); }} />
      {errors.name && <p id="name-error" role="alert">{errors.name.join('、')}</p>}
      <label htmlFor="content-description">Description</label>
      <textarea id="content-description" rows={6} value={description} readOnly={locked} aria-invalid={!!errors.description} aria-describedby={errors.description ? 'description-error' : undefined} onChange={event => { setDescription(event.target.value); setErrors({}); setMessage(''); }} />
      {errors.description && <p id="description-error" role="alert">{errors.description.join('、')}</p>}
      <label htmlFor="content-image">投稿画像</label>
      <p id="image-help">画像は任意です。JPEG・PNG・GIFを1枚、5MBまで選択できます。</p>
      <input id="content-image" ref={fileInput} type="file" accept="image/jpeg,image/png,image/gif" disabled={locked} aria-invalid={!!errors.image} aria-describedby={`image-help${errors.image ? ' image-error' : ''}`} onChange={event => { setImage(event.target.files?.[0] || null); setErrors({}); setMessage(''); }} />
      {image && <div><p>選択中：{image.name}</p><button type="button" disabled={locked} onClick={() => { setImage(null); if (fileInput.current) fileInput.current.value = ''; setErrors({}); }}>画像を取り消す</button></div>}
      {errors.image && <p id="image-error" role="alert">{errors.image.join('、')}</p>}
      <button type="submit" aria-label="投稿" disabled={locked} aria-busy={mutation.isPending}>{mutation.isPending ? '保存状態を確認中…' : '投稿'}</button>
    </form>
    {message && <p role={Object.keys(errors).length ? 'alert' : 'status'}>{message}</p>}
    {saved && <p><a href={`/contents/${saved}`}>保存した投稿を開く</a></p>}
    {conflict && <p><a href={`/contents/${conflict}`}>保存済みの投稿を確認</a></p>}
    {failure && !login && <div role="alert">
      <p>{failure.unknown ? '保存されたか確認できませんでした。入力内容を保持しています。保存状態を確認してください。' : '保存をまだ確認できません。同じ内容で再送しても投稿は重複しません。'}</p>
      <button type="button" disabled={mutation.isPending} onClick={() => perform(failure.attempt, failure.unknown)}>{failure.unknown ? '保存状態を確認' : '同じ内容で再送'}</button>
    </div>}
  </main>;
}
