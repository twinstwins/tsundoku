import { useQuery } from '@tanstack/react-query';
import { fetchProfile, ProfileRequestError } from '../api/profiles';
import UserAvatar from '../components/UserAvatar';
import styles from './Profile.module.css';

export default function ProfileHeader({ id }: { id: string }) {
  const profile = useQuery({ queryKey: ['profile', id], queryFn: ({ signal }) => fetchProfile(id, signal) });
  if (profile.isPending) return <p role="status">プロフィールを読み込み中…</p>;
  if (profile.isError) return <section className={styles.section}>
    {profile.error instanceof ProfileRequestError && profile.error.status === 404
      ? <><h1 className={styles.heading}>ユーザーが見つかりません</h1><p role="alert">ユーザーは退会したか、存在しません。</p><a href="/users">ユーザー一覧へ</a></>
      : <div role="alert"><p>プロフィールを読み込めませんでした。</p><button type="button" className={styles.retry} disabled={profile.isFetching} onClick={() => void profile.refetch()}>プロフィールを再読み込み</button></div>}
  </section>;
  const user = profile.data.data;
  return <section className={styles.section} aria-labelledby="profile-heading">
    <div className={styles.header}>
      <UserAvatar user={user} />
      <div><h1 id="profile-heading" className={styles.heading}>{user.name}のページ</h1><p className={styles.meta}>{user.contents_count}積んでいます</p></div>
    </div>
  </section>;
}
