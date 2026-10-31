import { useQuery } from '@tanstack/react-query';
import { fetchUsers } from '../api/users';
import UserAvatar from '../components/UserAvatar';
import styles from './UsersPage.module.css';

export default function UsersPage({ page, pathname }: { page: number; pathname: string }) {
  const users = useQuery({ queryKey: ['users', page], queryFn: ({ signal }) => fetchUsers(page, signal) });
  const pageHref = (number: number) => number === 1 ? pathname : `${pathname}?page=${number}`;
  return <main className={styles.page} aria-labelledby="users-heading">
    <h1 id="users-heading" className={styles.heading}>全てのユーザー</h1>
    {users.isPending && <p role="status">ユーザーを読み込み中…</p>}
    {users.isError && <div role="alert" className={styles.error}>
      <p>ユーザーを読み込めませんでした。もう一度お試しください。</p>
      <button className={styles.retry} type="button" disabled={users.isFetching} onClick={() => void users.refetch()}>再読み込み</button>
    </div>}
    {users.data && <>
      <p className={styles.summary}>{users.data.meta.total_count}人のユーザー</p>
      {users.data.data.length === 0 ? <p role="status">{users.data.meta.total_count === 0 ? 'ユーザーはまだ登録されていません。' : 'このページにはユーザーがいません。'}</p> : <ul className={styles.list} aria-label="ユーザー">
        {users.data.data.map(user => <li key={user.id} className={styles.card}>
          <UserAvatar user={user} />
          <a className={styles.name} href={`/users/${user.id}`}>{user.name}</a>
        </li>)}
      </ul>}
      {users.data.data.length > 0 && users.data.meta.total_pages > 1 && <nav className={styles.pagination} aria-label="ユーザー一覧のページ">
        {page > 1 && <a href={pageHref(page - 1)}>前のページ</a>}
        <span aria-current="page">{page} / {users.data.meta.total_pages}ページ</span>
        {page < users.data.meta.total_pages && <a href={pageHref(page + 1)}>次のページ</a>}
      </nav>}
      {page > 1 && users.data.data.length === 0 && <a href={pageHref(1)}>最初のページへ</a>}
    </>}
  </main>;
}
