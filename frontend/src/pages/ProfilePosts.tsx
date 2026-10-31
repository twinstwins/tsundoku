import { useQuery } from '@tanstack/react-query';
import { fetchProfileContents, ProfileRequestError } from '../api/profiles';
import ContentPhoto from '../components/ContentPhoto';
import styles from './Profile.module.css';

export default function ProfilePosts({ id, page, pathname }: { id: string; page: number; pathname: string }) {
  const posts = useQuery({ queryKey: ['profile-posts', id, page], queryFn: ({ signal }) => fetchProfileContents(id, page, signal) });
  const href = (number: number) => number === 1 ? pathname : `${pathname}?page=${number}`;
  return <section className={styles.section} aria-labelledby="profile-posts-heading">
    <h2 id="profile-posts-heading" className={styles.subheading}>投稿</h2>
    {posts.isPending && <p role="status">投稿を読み込み中…</p>}
    {posts.isError && <div role="alert">
      {posts.error instanceof ProfileRequestError && posts.error.status === 404
        ? <p>ユーザーが見つからないため投稿を表示できません。</p>
        : <><p>投稿を読み込めませんでした。</p><button type="button" className={styles.retry} disabled={posts.isFetching} onClick={() => void posts.refetch()}>投稿を再読み込み</button></>}
    </div>}
    {!posts.isError && posts.data && <>
      <p className={styles.meta}>計{posts.data.meta.total_count}件</p>
      {!posts.data.data.length ? <p>{posts.data.meta.total_count === 0 ? '投稿はまだありません。' : 'このページには投稿がありません。'}</p>
        : <ul className={styles.posts} aria-label="ユーザーの投稿">
          {posts.data.data.map(post => <li key={post.id}>
            <article className={styles.card}>
              <h3 className={styles.title}><a href={`/contents/${post.id}`}>{post.name || '無題の投稿'}さんの投稿</a></h3>
              <p className={styles.description}>{post.description || '説明はありません。'}</p>
              {post.photos[0] && <ContentPhoto photo={post.photos[0]} number={1} linkTo={`/contents/${post.id}`} />}
              <p className={styles.meta}><time dateTime={post.created_at}>{new Intl.DateTimeFormat('ja-JP', { dateStyle: 'long', timeZone: 'Asia/Tokyo' }).format(new Date(post.created_at))}</time></p>
            </article>
          </li>)}
        </ul>}
      {!!posts.data.data.length && posts.data.meta.total_pages > 1 && <nav className={styles.pagination} aria-label="プロフィール投稿のページ">
        {page > 1 && <a href={href(page - 1)}>前のページ</a>}
        <span aria-current="page">{page} / {posts.data.meta.total_pages}ページ</span>
        {page < posts.data.meta.total_pages && <a href={href(page + 1)}>次のページ</a>}
      </nav>}
      {page > 1 && !posts.data.data.length && <a href={href(1)}>最初のページへ</a>}
    </>}
  </section>;
}
