import type { ContentResponse, MeResponse } from '../../../types/api-v1';

export type ContentDraft = { name: string; description: string; image: File | null };
export type ContentAttempt = ContentDraft & { key: string; userId: number; uncertain: boolean };
export function newSubmissionKey() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6]! & 15) | 64; bytes[8] = (bytes[8]! & 63) | 128;
  const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
export class SubmissionRequestError extends Error {
  constructor(public readonly status: number, public readonly code = '', public readonly fields: Record<string, string[]> = {}) {
    super('投稿を保存できませんでした');
  }
}
async function checked(response: Response) {
  if (response.ok) return response;
  const body = await response.json().catch(() => null);
  throw new SubmissionRequestError(response.status, body?.error?.code, body?.error?.fields);
}
function owned(result: ContentResponse, userId: number) {
  if (result.data.user.id !== userId) throw new SubmissionRequestError(401, 'account_changed');
  return result;
}
export async function fetchSubmission(attempt: ContentAttempt, signal: AbortSignal): Promise<ContentResponse> {
  const response = await checked(await fetch(`/api/v1/content-submissions/${attempt.key}`, {
    credentials: 'same-origin', headers: { Accept: 'application/json' }, signal,
  }));
  return owned(await response.json(), attempt.userId);
}
export async function submitContent(attempt: ContentAttempt, signal: AbortSignal): Promise<ContentResponse> {
  const me = await checked(await fetch('/api/v1/me', { credentials: 'same-origin', headers: { Accept: 'application/json' }, signal }));
  const { data }: MeResponse = await me.json();
  if (data.id !== attempt.userId) throw new SubmissionRequestError(401, 'account_changed');
  if (!data.csrf_token) throw new SubmissionRequestError(422, 'invalid_csrf_token');
  const body = new FormData();
  body.append('content[name]', attempt.name); body.append('content[description]', attempt.description);
  if (attempt.image) body.append('content[image]', attempt.image);
  const response = await checked(await fetch('/api/v1/contents', {
    method: 'POST', credentials: 'same-origin', signal, body,
    headers: { Accept: 'application/json', 'X-CSRF-Token': data.csrf_token, 'Idempotency-Key': attempt.key },
  }));
  return owned(await response.json(), attempt.userId);
}
