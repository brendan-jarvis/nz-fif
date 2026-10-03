# nz-fif

An open-source calculator for New Zealand's **foreign investment fund (FIF)**
rules that runs **entirely in your browser**. Load your Sharesies, Hatch and/or
Sharesight *All Trades* exports and get FDR, CV, the lower of the two, the
NZ$50,000 de minimis test and foreign tax credits, laid out like Sharesight's
FIF report so you can compare line by line.

> **Not tax advice.** nz-fif is a calculation aid. It does not decide your tax
> residence, whether an interest is a FIF, whether an exemption applies, or
> which method you must use. See [NOTICE](NOTICE).

**Zero data retention:** your files never leave the tab and nothing is stored.
The only thing that can leave your browser is a ticker symbol and a date, sent
to this site's own `/api/price` route when price lookup is on. See
[PRIVACY.md](PRIVACY.md) and verify it with [AUDIT.md](AUDIT.md).

## Status

See the milestone table at the bottom of this file. Design: PLAN §11 (kept privately).

## Quick start (development)

Requires Node 22 (`.nvmrc`) and pnpm 10.

```bash
pnpm install --frozen-lockfile
pnpm dev               # Vite dev server (no Worker; price lookups need wrangler)
pnpm check             # typecheck + lint + tests + build + bundle scan
pnpm headers:local     # build for localhost and assert live headers via `wrangler dev`
pnpm e2e               # Playwright privacy + full-flow tests against `wrangler dev`
pnpm golden            # private real-data checks (needs files in private/; never in CI)
```

`wrangler dev` runs locally in workerd and needs no Cloudflare login.

## Repository layout

| Path | What |
|---|---|
| `packages/core/` | Pure TypeScript: parsers, merge, ledger, IRD engine, report model. No I/O. |
| `src/` | The Preact single-page app. `src/net/priceClient.ts` is the only `fetch`. |
| `worker/price.ts`, `worker/lib.ts` | The entire server: `GET /api/price` (entry file + logic). |
| `public/_headers` | CSP and security headers for static assets. |
| `wrangler.jsonc` | Cloudflare Workers config: static assets + one route, no bindings. |
| `fixtures/` | **Synthetic** sample exports and recorded price responses. Never real data. |
| `scripts/` | Build finalisation, bundle scan, manifest, header checks, deploy verification. |
| `private/` | Git-ignored. Real exports and golden checks live here locally only. |

## Cloudflare free tier: limits and how nz-fif stays inside them

nz-fif is designed for the **Workers Free** plan only. No paid add-ons.

| Free-plan limit | nz-fif's use |
|---|---|
| **Static assets: free and unlimited** | The whole app (HTML, JS, CSS, bundled RBNZ FX data). All calculation is client-side, so serving the app costs nothing and does not count against the Worker request quota. |
| **100,000 Worker requests/day** (account-wide, resets 00:00 UTC) | Only `/api/price` invokes the Worker (`run_worker_first: ["/api/price"]`). A report needs at most 2 lookups per FIF holding (opening and closing price), e.g. 25 holdings → 50 requests, so ~2,000 full reports/day. Lookups are optional and manual entry always works. |
| **10 ms CPU per request** | The Worker validates two strings, makes at most two small upstream GETs (network wait is not CPU time), picks one bar and multiplies by split ratios. The upstream window is ~2 weeks of daily bars plus a split list, so JSON parsing stays tiny. Cache hits do no parsing at all. |
| **50 subrequests per request** | At most 2 (bars + split events). |
| **Over the daily limit** | Cloudflare answers `/api/price` with an error (and our own per-isolate budget of 60 upstream calls/minute answers 429); `priceClient.ts` reports "rate limited" and the UI falls back to manual price entry. Static assets keep working. |
| **No KV / D1 / R2 / Durable Objects / Queues / Analytics Engine** | None used. `wrangler.jsonc` has no bindings at all (enforced by `tests/config.test.ts`). |
| **Rate Limiting binding** | Not used: its Free-plan availability is not stated in Cloudflare's docs (see DECISIONS.md). |

**Caching** (keys built only from `symbol` and `date`):
1. `caches.default` with a synthetic key `https://cache.internal/v1/<symbol>/<date>`, 7-day TTL. Cloudflare documents a functional Cache API on custom domains; on `*.workers.dev` it may be a no-op, hence layers 2 and 3.
2. A small in-memory map inside the running Worker isolate (ephemeral, public price data only).
3. Cloudflare's subrequest cache on the upstream fetch (`cf.cacheTtl`), with a day-stable upstream URL.

The browser always receives `Cache-Control: no-store` so tickers do not linger
in its HTTP cache.

## Deploying (documented; not yet done)

Nothing has been deployed. When ready:

1. Create a Cloudflare account (Free plan) and pick the workers.dev subdomain.
2. Set `SITE_ORIGIN=https://nz-fif.<subdomain>.workers.dev` (this goes into the CSP).
3. Make sure Web Analytics auto-inject, Zaraz, Rocket Loader and Email Obfuscation are off.
4. Either run the tagged-release workflow (`.github/workflows/release.yml`, needs `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `SITE_ORIGIN`), or locally:
   ```bash
   SITE_ORIGIN=https://nz-fif.<subdomain>.workers.dev pnpm build && pnpm manifest
   pnpm exec wrangler login && pnpm exec wrangler deploy
   pnpm verify-deploy https://nz-fif.<subdomain>.workers.dev
   ```

## Milestones

| Milestone | Status |
|---|---|
| M0 privacy scaffold | done (local header proof instead of deploy) |
| M1 parsers, merge, upload UI, reconciliation | done |
| M2 eligibility review, cash/MMF, assumptions | done (ASX list intentionally empty) |
| M3 price lookup, FX, ledger, FDR base, CV | done (no Stooq fallback; Rate Limiting binding dropped) |
| M4 QSA, de minimis, FTC, method choice | done |
| M5 Sharesight-shaped report, downloads, IR3 | mostly done: column names unverified until checked against a Sharesight FIF report export |

## Licence

Apache-2.0. See [LICENSE](LICENSE) and [NOTICE](NOTICE).
