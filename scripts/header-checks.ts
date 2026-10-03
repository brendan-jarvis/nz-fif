// Shared live-header assertions used by scripts/check-headers-local.ts
// (against `wrangler dev`) and scripts/verify-deploy.ts (against the deployed site).
import { EXPECTED_STATIC_HEADERS, expectedCsp } from './site';

export interface CheckResult { name: string; ok: boolean; detail: string }

type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;

export async function runHeaderChecks(origin: string, fetcher: Fetcher = fetch): Promise<CheckResult[]> {
  const results: CheckResult[] = [];
  const add = (name: string, ok: boolean, detail = '') => results.push({ name, ok, detail });

  const home = await fetcher(`${origin}/`, { redirect: 'manual' });
  add('GET / is 200', home.status === 200, `status ${home.status}`);
  add('CSP exact', home.headers.get('content-security-policy') === expectedCsp(origin), home.headers.get('content-security-policy') ?? 'missing');
  for (const [k, v] of Object.entries(EXPECTED_STATIC_HEADERS)) {
    add(`${k} exact`, home.headers.get(k) === v, home.headers.get(k) ?? 'missing');
  }
  add('no Set-Cookie on /', !home.headers.has('set-cookie'));
  add('no CORS on /', ![...home.headers.keys()].some((k) => k.startsWith('access-control-')));
  const html = await home.text();
  add('no inline <script> in HTML', !/<script(?![^>]*\bsrc=)[^>]*>/i.test(html));

  const bad = await fetcher(`${origin}/api/price?symbol=bad!&date=2025-03-31`, { redirect: 'manual' });
  add('/api/price rejects a bad symbol with 400', bad.status === 400, `status ${bad.status}`);
  add('/api/price is no-store', (bad.headers.get('cache-control') ?? '').includes('no-store'), bad.headers.get('cache-control') ?? 'missing');
  add('/api/price sends no CORS', ![...bad.headers.keys()].some((k) => k.startsWith('access-control-')));
  add('/api/price sends no Set-Cookie', !bad.headers.has('set-cookie'));
  add('/api/price never redirects', bad.status < 300 || bad.status >= 400, `status ${bad.status}`);

  const post = await fetcher(`${origin}/api/price?symbol=AAPL&date=2025-03-31`, { method: 'POST', body: 'x', redirect: 'manual' });
  add('/api/price rejects POST with 405', post.status === 405, `status ${post.status}`);

  const missing = await fetcher(`${origin}/definitely-not-a-file.txt`, { redirect: 'manual' });
  add('unknown path is 404', missing.status === 404, `status ${missing.status}`);
  return results;
}

export function report(results: CheckResult[]): boolean {
  for (const r of results) console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.ok ? '' : `  (${r.detail})`}`);
  const failed = results.filter((r) => !r.ok).length;
  console.log(`${results.length - failed}/${results.length} header checks passed`);
  return failed === 0;
}
