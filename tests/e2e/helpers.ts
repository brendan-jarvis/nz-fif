import type { Page, Request } from '@playwright/test';

export const ORIGIN = 'http://localhost:8788';

/** Records every request the page makes from now on. */
export function recordRequests(page: Page): Request[] {
  const seen: Request[] = [];
  page.on('request', (r) => seen.push(r));
  return seen;
}

/** Same-origin static chunks (lazy JS/CSS/worker scripts) carry no user data. */
export function isStaticAsset(r: Request): boolean {
  const u = new URL(r.url());
  return u.origin === ORIGIN && r.method() === 'GET' && /^\/assets\/[\w.-]+\.(js|css)$/.test(u.pathname) && u.search === '';
}

export async function storageSnapshot(page: Page) {
  return page.evaluate(async () => ({
    localStorage: window.localStorage.length,
    sessionStorage: window.sessionStorage.length,
    cookie: document.cookie,
    indexedDB: (await indexedDB.databases()).length,
    cacheStorage: (await caches.keys()).length,
    serviceWorkers: (await navigator.serviceWorker.getRegistrations()).length,
  }));
}

export const EMPTY_STORAGE = { localStorage: 0, sessionStorage: 0, cookie: '', indexedDB: 0, cacheStorage: 0, serviceWorkers: 0 };
