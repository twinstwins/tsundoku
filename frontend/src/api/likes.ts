import type { LikeStateResponse, MeResponse } from '../../../types/api-v1';

export class LikeRequestError extends Error {
  constructor(public readonly status: number) { super('いいねを更新できませんでした'); }
}

export async function setContentLike(id: string, liked: boolean, signal: AbortSignal): Promise<LikeStateResponse> {
  const me = await fetch('/api/v1/me', { credentials: 'same-origin', headers: { Accept: 'application/json' }, signal });
  if (!me.ok) throw new LikeRequestError(me.status);
  const { data }: MeResponse = await me.json();
  if (!data.csrf_token) throw new LikeRequestError(422);
  const response = await fetch(`/api/v1/contents/${id}/like`, {
    method: liked ? 'PUT' : 'DELETE', credentials: 'same-origin', signal,
    headers: { Accept: 'application/json', 'X-CSRF-Token': data.csrf_token },
  });
  if (!response.ok) throw new LikeRequestError(response.status);
  return response.json();
}
