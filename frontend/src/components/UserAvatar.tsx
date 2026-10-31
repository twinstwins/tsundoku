import { useState } from 'react';
import type { UserSummary } from '../../../types/api-v1';
import styles from './UserAvatar.module.css';

export default function UserAvatar({ user }: { user: UserSummary }) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  if (user.avatar_url && failedUrl !== user.avatar_url) {
    return <img className={styles.avatar} src={user.avatar_url} alt="" width={48} height={48} loading="lazy" onError={() => setFailedUrl(user.avatar_url)} />;
  }
  return <span className={styles.placeholder} role="img" aria-label="イメージ未登録">{Array.from(user.name)[0]}</span>;
}
