import type { UserResponse, ProfileContentsResponse } from '../../../types/api-v1';

export class ProfileRequestError extends Error {
  constructor(public readonly status: number) { super('プロフィールを読み込めませんでした'); }
}

async function get<T>(url: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, { credentials: 'same-origin', headers: { Accept: 'application/json' }, signal });
  if (!response.ok) throw new ProfileRequestError(response.status);
  return response.json();
}

export const fetchProfile = (id: string, signal?: AbortSignal) => get<UserResponse>(`/api/v1/users/${id}`, signal);
export const fetchProfileContents = (id: string, page: number, signal?: AbortSignal) => get<ProfileContentsResponse>(`/api/v1/users/${id}/contents?page=${page}&per_page=20`, signal);
