// The deployed origin is swapped into the CSP at build time (PLAN §12.1).
// public/_headers carries this placeholder; scripts/finalize-dist.ts replaces it.
export const PLACEHOLDER_ORIGIN = 'https://nz-fif.example.workers.dev';
export const ORIGIN_RE = /^https?:\/\/[a-z0-9.-]+(:\d{1,5})?$/;

export function siteOrigin(env: NodeJS.ProcessEnv = process.env): string {
  const origin = (env.SITE_ORIGIN ?? PLACEHOLDER_ORIGIN).replace(/\/$/, '');
  if (!ORIGIN_RE.test(origin)) throw new Error(`SITE_ORIGIN must be a bare origin, got: ${origin}`);
  if (origin.startsWith('http://') && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
    throw new Error('Plain http is only allowed for localhost test builds.');
  }
  return origin;
}

export function expectedCsp(origin: string): string {
  return [
    "default-src 'none'",
    "script-src 'self'",
    "style-src 'self'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    "worker-src 'self'",
    `connect-src ${origin}/api/price`,
    "form-action 'none'",
    "base-uri 'none'",
    "frame-ancestors 'none'",
  ].join('; ');
}

export const EXPECTED_STATIC_HEADERS: Record<string, string> = {
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Cross-Origin-Opener-Policy': 'same-origin',
};
