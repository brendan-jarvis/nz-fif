// CSP test (PLAN §3.4/§3.9): assert the exact static-asset header policy.
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { EXPECTED_STATIC_HEADERS, PLACEHOLDER_ORIGIN, expectedCsp } from '../scripts/site';
import { parseHeadersFile } from '../scripts/headers-file';

function assertPolicy(text: string, origin: string) {
  const parsed = parseHeadersFile(text);
  expect([...parsed.keys()]).toEqual(['/*']);
  const h = parsed.get('/*')!;
  expect(h['Content-Security-Policy']).toBe(expectedCsp(origin));
  for (const [k, v] of Object.entries(EXPECTED_STATIC_HEADERS)) expect(h[k]).toBe(v);
  expect(Object.keys(h).sort()).toEqual(['Content-Security-Policy', ...Object.keys(EXPECTED_STATIC_HEADERS)].sort());
}

describe('public/_headers', () => {
  const text = readFileSync('public/_headers', 'utf8');
  it('has the exact CSP and security headers', () => assertPolicy(text, PLACEHOLDER_ORIGIN));

  it('connect-src names only the price route, never a wildcard or a third party', () => {
    const csp = parseHeadersFile(text).get('/*')!['Content-Security-Policy']!;
    const connect = csp.split(';').map((s) => s.trim()).find((s) => s.startsWith('connect-src'))!;
    expect(connect.split(/\s+/)).toEqual(['connect-src', `${PLACEHOLDER_ORIGIN}/api/price`]);
    expect(csp).not.toMatch(/unsafe-inline|unsafe-eval|\*/);
  });

  it('sends no CORS headers', () => {
    expect(text).not.toMatch(/Access-Control-Allow/i);
  });
});

describe('dist/_headers (if built)', () => {
  it.skipIf(!existsSync('dist/_headers'))('keeps the same policy with the deploy origin substituted', () => {
    const text = readFileSync('dist/_headers', 'utf8');
    const csp = parseHeadersFile(text).get('/*')!['Content-Security-Policy']!;
    const origin = /connect-src (\S+)\/api\/price/.exec(csp)![1]!;
    assertPolicy(text, origin);
  });
});
