import { useState } from 'react';
import type { Photo } from '../../../types/api-v1';
import styles from './ContentPhoto.module.css';

export default function ContentPhoto({ photo, number, linkTo }: { photo: Photo; number: number; linkTo?: string }) {
  const source = photo.thumbnail_url || photo.url;
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  if (!source || failedUrl === source) return <p className={styles.missing} role="img" aria-label={`投稿画像 ${number}を表示できません`}>画像を読み込めませんでした。</p>;
  const image = <img className={styles.image} src={source} alt={`投稿画像 ${number}`} loading="lazy" onError={() => setFailedUrl(source)} />;
  const href = linkTo || photo.url;
  return <figure className={styles.figure}>{href
    ? <a href={href} aria-label={`投稿画像 ${number}${linkTo ? 'の詳細を開く' : 'を元のサイズで開く'}`}>{image}</a>
    : image}</figure>;
}
