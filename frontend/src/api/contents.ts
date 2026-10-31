import type { ContentResponse } from '../../../types/api-v1';

export class ContentRequestError extends Error {
  constructor(public readonly status: number) { super('投稿を読み込めませんでした'); }
}

export async function fetchContent(id: string, signal?: AbortSignal): Promise<ContentResponse> {
  const response = await fetch(`/api/v1/contents/${id}`, {
    credentials: 'same-origin', headers: { Accept: 'application/json' }, signal,
  });
  if (!response.ok) throw new ContentRequestError(response.status);
  return response.json();
}
