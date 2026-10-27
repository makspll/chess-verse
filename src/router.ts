import { useEffect, useState } from 'react';

export type Page = 'import' | 'train' | 'stats';

export interface Route {
  page: Page | null;
  params: URLSearchParams;
}

function parse(): Route {
  const [path, query] = location.hash.replace(/^#\/?/, '').split('?');
  const page = (['import', 'train', 'stats'] as const).find((p) => p === path) ?? null;
  return { page, params: new URLSearchParams(query ?? '') };
}

export function useRoute(): Route {
  const [route, setRoute] = useState(parse);
  useEffect(() => {
    const on = () => setRoute(parse());
    addEventListener('hashchange', on);
    return () => removeEventListener('hashchange', on);
  }, []);
  return route;
}

export function go(page: Page, params?: Record<string, string>) {
  const q = params ? '?' + new URLSearchParams(params).toString() : '';
  location.hash = `/${page}${q}`;
}
