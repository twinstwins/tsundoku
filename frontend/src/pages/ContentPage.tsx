import { useQuery } from '@tanstack/react-query';
import { ContentRequestError, fetchContent } from '../api/contents';
import UserAvatar from '../components/UserAvatar';
import ContentPhoto from '../components/ContentPhoto';
import LikeControls from '../components/LikeControls';
import styles from './ContentPage.module.css';

const dateFormat = new Intl.DateTimeFormat('ja-JP', { dateStyle: 'long', timeStyle: 'short', timeZone: 'Asia/Tokyo' });

export default function ContentPage({ id, loginUrl, likesEnabled = false }: { id: string; loginUrl: string; likesEnabled?: boolean }) {
  const content = useQuery({ queryKey: ['content', id], queryFn: ({ signal }) => fetchContent(id, signal) });
  if (content.isPending) return <main className={styles.page}><p role="status">投稿を読み込み中…</p></main>;
  if (content.isError) {
    const status = content.error instanceof ContentRequestError ? content.error.status : null;
    return <main className={styles.page}>
      <h1 className={styles.heading}>{status === 404 ? '投稿が見つかりません' : '投稿の詳細'}</h1>
      {status === 401 ? <div role="alert"><p>ログインが必要です。ログインするとこの投稿に戻ります。</p><a href={loginUrl} data-turbolinks="false">ログインして投稿に戻る</a></div>
        : status === 404 ? <p role="alert">投稿は削除されたか、存在しません。</p>
        : <div role="alert"><p>投稿を読み込めませんでした。もう一度お試しください。</p><button className={styles.retry} type="button" disabled={content.isFetching} onClick={() => void content.refetch()}>再読み込み</button></div>}
      <p><a href="/contents">投稿一覧へ</a></p>
    </main>;
  }
  const post = content.data.data;
  return <main className={styles.page} aria-labelledby="content-heading">
    <p className={styles.back}><a href="/contents">投稿一覧へ</a></p>
    <article>
      <h1 id="content-heading" className={styles.heading}>{post.name || '無題の投稿'}</h1>
      <div className={styles.author}>
        <UserAvatar user={post.user} />
        <div><a href={`/users/${post.user.id}`}>{post.user.name}</a>{!post.user.avatar_url && <p className={styles.meta}>イメージ未登録</p>}</div>
      </div>
      <p className={styles.meta}><time dateTime={post.created_at}>{dateFormat.format(new Date(post.created_at))}</time></p>
      <p className={styles.description}>{post.description || '説明はありません。'}</p>
      <section aria-labelledby="content-images-heading">
        <h2 id="content-images-heading" className={styles.subheading}>コンテンツイメージ</h2>
        {post.photos.length ? <div className={styles.gallery}>{post.photos.map((photo, index) => <ContentPhoto key={photo.id} photo={photo} number={index + 1} />)}</div> : <p className={styles.meta}>画像はありません。</p>}
      </section>
      <dl className={styles.counts}>
        <div><dt>いいね</dt><dd>{post.likes_count}</dd></div>
        <div><dt>コメント</dt><dd>{post.comments_count}</dd></div>
      </dl>
      {post.liked_by_current_user && <p>この投稿にいいねしています</p>}
      {likesEnabled && <LikeControls id={id} liked={post.liked_by_current_user} />}
      <p className={styles.meta}>{likesEnabled ? 'コメントは' : 'いいね・コメントは'}<a href={`/contents#like-icon-post-${post.id}`}>投稿一覧で操作できます</a>。</p>
    </article>
  </main>;
}
