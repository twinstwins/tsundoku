import { it, expect } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import UserAvatar from './UserAvatar';

it('falls back after a broken image and tries a newly changed image URL', () => {
  const user = { id: 7, name: '読者', avatar_url: '/uploads/avatar.png' };
  const view = render(<UserAvatar user={user} />);
  fireEvent.error(screen.getByAltText(''));
  expect(screen.getByRole('img', { name: 'イメージ未登録' })).toBeVisible();
  view.rerender(<UserAvatar user={{ ...user, avatar_url: '/uploads/new-avatar.png' }} />);
  expect(screen.getByAltText('')).toHaveAttribute('src', '/uploads/new-avatar.png');
});
