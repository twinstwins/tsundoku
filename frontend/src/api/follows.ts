import type { FollowStateResponse, MeResponse } from '../../../types/api-v1';

export class FollowRequestError extends Error {
  constructor(public readonly status: number) { super('フォローを更新できませんでした'); }
}
export async function fetchFollow(id: string, signal?: AbortSignal): Promise<FollowStateResponse> {
  const response = await fetch(`/api/v1/users/${id}/follow`, { credentials: 'same-origin', headers: { Accept: 'application/json' }, signal });
  if (!response.ok) throw new FollowRequestError(response.status);
  return response.json();
}
export async function setFollow(id: string, followed: boolean, signal: AbortSignal): Promise<FollowStateResponse> {
  const me = await fetch('/api/v1/me', { credentials: 'same-origin', headers: { Accept: 'application/json' }, signal });
  if (!me.ok) throw new FollowRequestError(me.status);
  const { data }: MeResponse = await me.json();
  if (!data.csrf_token) throw new FollowRequestError(422);
  const response = await fetch(`/api/v1/users/${id}/follow`, {
    method: followed ? 'PUT' : 'DELETE', credentials: 'same-origin', signal,
    headers: { Accept: 'application/json', 'X-CSRF-Token': data.csrf_token },
  });
  if (!response.ok) throw new FollowRequestError(response.status);
  return response.json();
}
