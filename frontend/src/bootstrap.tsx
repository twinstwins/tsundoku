import { StrictMode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import UsersPage from './pages/UsersPage';
import { usersPage } from './api/users';

export function startUserDirectory() {
  const mounted = new Map<HTMLElement, { root: Root; client: QueryClient }>();
  function mount() {
    const element = document.querySelector<HTMLElement>('[data-react-page="users"]');
    if (!element || mounted.has(element)) return;
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false } } });
    const root = createRoot(element);
    mounted.set(element, { root, client });
    root.render(<StrictMode><QueryClientProvider client={client}>
      <UsersPage page={usersPage(window.location.search)} pathname={window.location.pathname} />
    </QueryClientProvider></StrictMode>);
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
