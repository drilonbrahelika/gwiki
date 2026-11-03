import { useSyncExternalStore } from 'react';

/**
 * The URL is the only navigation state, so every view is linkable and the
 * browser's back button just works.
 *   /            home
 *   /?id=<id>    a folder or a document
 *   /?view=starred
 */
export interface Route {
  id?: string;
  view?: 'starred';
}

const NAVIGATE = 'gwiki:navigate';

function parse(search: string): Route {
  const params = new URLSearchParams(search);
  return {
    id: params.get('id') || undefined,
    view: params.get('view') === 'starred' ? 'starred' : undefined,
  };
}

export function href(route: Route): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(route)) if (value !== undefined) params.set(key, value);
  const query = params.toString();
  return query ? `/?${query}` : '/';
}

export function navigate(route: Route, { replace = false } = {}) {
  const url = href(route);
  if (url === location.pathname + location.search) return;
  history[replace ? 'replaceState' : 'pushState'](null, '', url);
  window.dispatchEvent(new Event(NAVIGATE));
}

function subscribe(fn: () => void) {
  window.addEventListener('popstate', fn);
  window.addEventListener(NAVIGATE, fn);
  return () => {
    window.removeEventListener('popstate', fn);
    window.removeEventListener(NAVIGATE, fn);
  };
}

const getSearch = () => location.search;

export function useRoute(): Route {
  return parse(useSyncExternalStore(subscribe, getSearch));
}
