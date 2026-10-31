import type { CommentsResponse, MeResponse } from '../../../types/api-v1';

export type CommentAction = { kind: 'create'; text: string } | { kind: 'delete'; id: number };
export class CommentRequestError extends Error {
  constructor(public readonly status: number, public readonly code = '', public readonly fields: Record<string, string[]> = {}) {
    super('コメントを更新できませんでした');
  }
}
async function checked(response: Response) {
  if (response.ok) return response;
  const body = await response.json().catch(() => null);
  throw new CommentRequestError(response.status, body?.error?.code, body?.error?.fields);
}
export async function fetchComments(id: string, page: number, signal?: AbortSignal): Promise<CommentsResponse> {
  const response = await fetch(`/api/v1/contents/${id}/comments?page=${page}`, {
    credentials: 'same-origin', headers: { Accept: 'application/json' }, signal,
  });
  return (await checked(response)).json();
}
export async function writeComment(id: string, action: CommentAction, signal: AbortSignal): Promise<void> {
  const me = await checked(await fetch('/api/v1/me', { credentials: 'same-origin', headers: { Accept: 'application/json' }, signal }));
  const { data }: MeResponse = await me.json();
  if (!data.csrf_token) throw new CommentRequestError(422, 'invalid_csrf_token');
  const path = `/api/v1/contents/${id}/comments`;
  await checked(await fetch(action.kind === 'create' ? path : `${path}/${action.id}`, {
    method: action.kind === 'create' ? 'POST' : 'DELETE', credentials: 'same-origin', signal,
    headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'X-CSRF-Token': data.csrf_token },
    ...(action.kind === 'create' ? { body: JSON.stringify({ comment: { comment: action.text } }) } : {}),
  }));
}
