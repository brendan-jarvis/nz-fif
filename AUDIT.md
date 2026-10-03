# Audit checklist

How to check nz-fif's zero-retention claims (PRIVACY.md) yourself, by hand or
with an AI assistant. Every item names the file to read and what must be true.

## 1. Server surface

- [ ] **`wrangler.jsonc`**: exactly one `main` (`worker/price.ts`); **no bindings** of any kind (no `kv_namespaces`, `d1_databases`, `r2_buckets`, `durable_objects`, `queues`, `analytics_engine_datasets`, `ratelimits`, `services`, `tail_consumers`…); `observability.enabled` is `false`; `logpush` is `false`; `assets.run_worker_first` is exactly `["/api/price"]`; the only var is `PRICE_SOURCE`.
- [ ] No `functions/` folder, no `public/_worker.js`, no `_routes.json`, no second wrangler config.
- [ ] **`worker/price.ts`** is the entire server. Read it top to bottom: it validates `symbol` and `date`, makes upstream GETs to Yahoo with a fixed User-Agent and no client headers, caches only on a key built from `symbol` and `date`, never calls `console`, never reads `cf-connecting-ip` or cookies, and answers 400/404/405 for anything else.

## 2. Browser surface

- [ ] **`public/_headers`**: CSP `default-src 'none'`; `script-src 'self'`; `style-src 'self'`; `connect-src` lists only `https://<site>/api/price`; `form-action 'none'`; `frame-ancestors 'none'`; plus `Referrer-Policy: no-referrer`, `X-Content-Type-Options: nosniff`, `Permissions-Policy`, `Cross-Origin-Opener-Policy`.
- [ ] **`src/net/priceClient.ts`** is the only file that calls `fetch`. URLs are only `/api/price?symbol=…&date=…`; `credentials: 'omit'`, `referrerPolicy: 'no-referrer'`, no body, no custom headers.
- [ ] **`src/io/readFile.ts`** reads files with `Blob.arrayBuffer()` into memory; **`src/io/download.ts`** builds downloads with `Blob` + `<a download>`.
- [ ] **`eslint.config.js`** bans `fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource`, `sendBeacon`, `RTCPeerConnection`, storage APIs, `document.cookie`, `cookieStore`, `navigator.serviceWorker`, `importScripts` everywhere in `src/` and `packages/core/` except `fetch` in `priceClient.ts`; bans `console` and storage bindings in `worker/`. `tests/eslint-guard.test.ts` proves each ban fires.
- [ ] **`scripts/scan-bundle.ts`** + **`audit/bundle-allowlist.json`**: after `pnpm build`, every network/storage/eval string in `dist/` is listed with a reason.

## 3. Tests that enforce the above

- [ ] `tests/config.test.ts` – wrangler config allowlist.
- [ ] `tests/csp.test.ts` – exact `_headers` policy (source and built).
- [ ] `tests/worker.test.ts` – validation, no `console`, cache key `symbol|date`, no-store, no CORS, no redirects.
- [ ] `tests/e2e/network.spec.ts` – in a real browser against `wrangler dev`: CSP blocks other connections; with lookups off there are zero requests after load (other than our own static chunks); with lookups on every request matches `^/api/price\?symbol=[A-Z0-9.\-]+&date=\d{4}-\d{2}-\d{2}$`, is a GET with no body and no cookies, and contains no quantity or amount from the fixture; storage is empty afterwards.
- [ ] `.githooks/pre-commit` – data guard: no real exports committed.
- [ ] `packages/core/data/rbnz-b1-daily.json` – public RBNZ exchange rates, exempt from the denylist grep; `tests/data-provenance.test.ts` pins its shape (dates + rates only). Rebuild with `scripts/build-rbnz.ts` and diff.

## 4. Deploy integrity

- [ ] `.github/workflows/release.yml` builds a tag with a frozen lockfile and `SOURCE_DATE_EPOCH`, writes `build-manifest.json` (SHA-256 of every asset and the Worker bundle, commit and tag), attests it and deploys exactly that output.
- [ ] `scripts/verify-deploy.ts`: `pnpm verify-deploy https://<site>` compares every live asset with the manifest and checks the live headers.

## 5-minute verification recipe

1. `git clone … && cd nz-fif && pnpm install --frozen-lockfile`
2. `pnpm check` – typecheck, lint (privacy bans), unit/worker/config/CSP tests, build, bundle scan.
3. `pnpm headers:local` – starts `wrangler dev` locally (no Cloudflare login) and checks the live headers.
4. `pnpm e2e` – Playwright network and storage tests.
5. Open the live site, open DevTools → Network, load the sample files in `fixtures/` with lookups off: no requests. Turn lookups on: only `/api/price?symbol=…&date=…` GETs appear. Application tab: no cookies, storage or service workers.
6. `pnpm verify-deploy https://<site>` against the release's `build-manifest.json`.
