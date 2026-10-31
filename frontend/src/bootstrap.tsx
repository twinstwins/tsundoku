import { StrictMode, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import UsersPage from './pages/UsersPage';
import ContentPage from './pages/ContentPage';
import ProfileHeader from './pages/ProfileHeader';
import ProfilePosts from './pages/ProfilePosts';
import { usersPage } from './api/users';

export function startFrontendPages() {
  const mounted = new Map<HTMLElement, { root: Root; client: QueryClient }>();
  function mount() {
    for (const element of document.querySelectorAll<HTMLElement>('[data-react-page]')) {
      if (mounted.has(element)) continue;
      const id = element.dataset.reactPage === 'content' ? element.dataset.contentId : element.dataset.userId;
      if (element.dataset.reactPage !== 'users' && (!id || !/^[1-9]\d*$/.test(id))) continue;
      let page: ReactNode;
      switch (element.dataset.reactPage) {
        case 'users': page = <UsersPage page={usersPage(window.location.search)} pathname={window.location.pathname} />; break;
        case 'content': page = <ContentPage id={id!} loginUrl={element.dataset.loginUrl!} />; break;
        case 'profile': page = <ProfileHeader id={id!} />; break;
        case 'profile-posts': page = <ProfilePosts id={id!} page={usersPage(window.location.search)} pathname={window.location.pathname} />; break;
        default: continue;
      }
      const client = new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } } });
      const root = createRoot(element);
      mounted.set(element, { root, client });
      root.render(<StrictMode><QueryClientProvider client={client}>{page}</QueryClientProvider></StrictMode>);
    }
  }
  function unmount() {
    for (const { root, client } of mounted.values()) { root.unmount(); client.clear(); }
    mounted.clear();
  }
  function restore(event: PageTransitionEvent) {
    if (event.persisted) { unmount(); mount(); }
  }
  document.addEventListener('DOMContentLoaded', mount);
  document.addEventListener('turbolinks:load', mount);
  document.addEventListener('turbolinks:before-cache', unmount);
  document.addEventListener('turbolinks:before-render', unmount);
  window.addEventListener('pageshow', restore);
  if (document.readyState !== 'loading') mount();
  return () => {
    unmount();
    document.removeEventListener('DOMContentLoaded', mount);
    document.removeEventListener('turbolinks:load', mount);
    document.removeEventListener('turbolinks:before-cache', unmount);
    document.removeEventListener('turbolinks:before-render', unmount);
    window.removeEventListener('pageshow', restore);
  };
}
