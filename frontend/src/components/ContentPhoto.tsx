import { useState } from 'react';
import type { Photo } from '../../../types/api-v1';
import styles from './ContentPhoto.module.css';

export default function ContentPhoto({ photo, number }: { photo: Photo; number: number }) {
  const source = photo.thumbnail_url || photo.url;
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  if (!source || failedUrl === source) return <p className={styles.missing} role="img" aria-label={`投稿画像 ${number}を表示できません`}>画像を読み込めませんでした。</p>;
  const image = <img className={styles.image} src={source} alt={`投稿画像 ${number}`} loading="lazy" onError={() => setFailedUrl(source)} />;
  return <figure className={styles.figure}>{photo.url
    ? <a href={photo.url} aria-label={`投稿画像 ${number}を元のサイズで開く`}>{image}</a>
    : image}</figure>;
}
