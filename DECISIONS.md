# Decisions log

Dated entries made while Brendan was unavailable. Each lists the decision, why,
the alternative, and what Brendan should confirm. Newest at the bottom.

## 2026-10-04 – Working name `nz-fif`, Apache-2.0, neutral copyright line
- **Decision:** repo/package name `nz-fif`; licence Apache-2.0 with a NOTICE file that carries the not-tax-advice disclaimer (PLAN §10). Copyright line is "nz-fif contributors".
- **Why:** PLAN §10 recommends Apache-2.0 (patent grant + NOTICE).
- **Alternative:** MIT; or a personal copyright line in your own name.
- **Confirm:** name, licence and copyright holder.

## 2026-10-04 – Commit author is a neutral placeholder
- **Decision:** commits are authored as `nz-fif overnight build <nz-fif@example.invalid>`.
- **Why:** avoid putting a real email address in a repo that will become public, and avoid committing as Brendan without his say-so.
- **Alternative:** `git rebase --root --exec 'git commit --amend --no-edit --reset-author'` before publishing (rewrites local history only; nothing has been pushed).
- **Confirm:** whether to re-author before the first push.

## 2026-10-04 – Workers Rate Limiting binding dropped (Free-plan availability unclear)
- **Decision:** no `ratelimits` binding. `wrangler.jsonc` has **no bindings at all**. Protection is: Cache API + per-isolate memory cache + Cloudflare subrequest cache (see next entry), a small per-isolate upstream budget in the Worker (a module-scope counter, never persisted, never keyed on IP), strict validation, and the `PRICE_SOURCE=off` kill switch.
- **Why:** the brief says keep it only if it is verifiably available on Workers Free. Cloudflare's official Rate Limiting page (last updated 23 Apr 2026) and the GA changelog (19 Sep 2025) do not state which plans include it, and the Workers pricing/limits pages do not list it. Only a third-party blog says "available on all plans including Free". Unclear, so dropped. Bonus: no IP-derived key anywhere, which simplifies PRIVACY.md.
- **Alternative:** add back `ratelimits` (global ~300/60 s + per-IP ~60/60 s, applied on cache misses only) if a test deploy on the Free account accepts it.
- **Confirm:** whether you want the binding re-added after checking it deploys on your Free account.

## 2026-10-04 – `workers_dev: true` (PLAN §2 said false)
- **Decision:** `workers_dev: true`, `preview_urls: false`.
- **Why:** PLAN §12.1 says hosting is the free `*.workers.dev` subdomain until a custom domain exists; with `workers_dev: false` the site would have no URL at all.
- **Alternative:** flip to `false` and add a custom-domain route once a domain is bought (and update `SITE_ORIGIN`).
- **Confirm:** the workers.dev hostname to put into the CSP (`SITE_ORIGIN`).

## 2026-10-04 – CSP origin is substituted at build time
- **Decision:** `public/_headers` carries the placeholder `https://nz-fif.example.workers.dev`; `scripts/finalize-dist.ts` replaces it with `SITE_ORIGIN` (validated; plain http only for localhost test builds).
- **Why:** connect-src must name the exact `/api/price` URL (PLAN §3.4), and the real hostname is not known yet. Local tests build with `http://localhost:<port>`.
- **Confirm:** final hostname.

## 2026-10-04 – Toolchain: Node 22, pinned known-good majors
- **Decision:** Node 22 LTS (`.nvmrc`, `engines`), pnpm 10, TypeScript 5.9, Vite 7, Vitest 4, ESLint 9, Preact 10, Wrangler 4.147, all exact-pinned with a frozen lockfile.
- **Why:** Wrangler 4 requires Node ≥ 22 (the box had Node 20, so Node 22.23.3 was installed under `~/.local`). TypeScript 7 / Vite 8 / ESLint 10 are newer than typescript-eslint supports (`typescript <6.1`).
- **Alternative:** move up once typescript-eslint supports TS 7.

## 2026-10-04 – SheetJS from the official CDN tarball
- **Decision:** `xlsx` is installed from `https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz` (pinned in the lockfile with its integrity hash).
- **Why:** the `xlsx` package on the npm registry is frozen at 0.18.5 with known advisories; SheetJS publishes current builds only on its CDN.
- **Alternative:** a tiny hand-written xlsx reader over `fflate` (fewer bytes, more code to audit).

## 2026-10-04 – Build manifest hashes an esbuild bundle of the Worker
- **Decision:** `scripts/build-manifest.ts` hashes every file in `dist/` plus an esbuild ESM bundle of `worker/price.ts`.
- **Why:** I was told not to run `wrangler deploy` (including `--dry-run`) tonight, and the exact Wrangler bundle can only be produced that way.
- **Alternative / follow-up:** in `release.yml`, run `wrangler deploy --dry-run --outdir dist-worker` and hash that output instead (CI only).
- **Confirm:** nothing needed now.

## 2026-10-04 – "Zero requests after load" allows same-origin static chunks
- **Decision:** the Playwright "lookups off" check fails on any request after load **except** same-origin `GET /assets/*.js|css` with no query string (lazy chunks such as the parser Web Worker and the spreadsheet library).
- **Why:** those are our own static files and carry no user data; loading them eagerly would slow first paint for everyone.
- **Alternative:** preload every chunk at startup and assert literally zero requests.
