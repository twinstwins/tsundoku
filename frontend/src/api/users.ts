import type { UsersResponse } from '../../../types/api-v1';

export async function fetchUsers(page: number, signal?: AbortSignal): Promise<UsersResponse> {
  const response = await fetch(`/api/v1/users?page=${page}&per_page=20`, {
    credentials: 'same-origin', headers: { Accept: 'application/json' }, signal,
  });
  if (!response.ok) throw new Error('ユーザーを読み込めませんでした');
  return response.json();
}

export function usersPage(search: string): number {
  const value = new URLSearchParams(search).get('page');
  return value && /^[1-9]\d{0,6}$/.test(value) && Number(value) <= 1_000_000 ? Number(value) : 1;
}
