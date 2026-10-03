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

## 2026-10-04 – Own 40-line CSV reader instead of PapaParse
- **Decision:** `packages/core/src/parsers/tabular.ts` has a small RFC 4180 reader; PapaParse was removed.
- **Why:** PapaParse bundles an `XMLHttpRequest` streamer (`download: true`). We never used it, but the bundle scan flagged it; removing it means the shipped JS has **no network-capable code** outside `priceClient.ts` and the auditor has less to read.
- **Alternative:** keep PapaParse and allowlist the XHR hit.

## 2026-10-04 – Sharesies "Initiated by = System" rows are typed `DRP` (flagged)
- **Decision:** treated as dividend reinvestments (`DRP`, an acquisition at cost, same FIF treatment as a buy), flagged `drp_inferred_from_initiated_by_system`.
- **Why:** PLAN §0 found all 30 fall on dividend dates. For FDR/CV a DRP is an acquisition at cost either way; the label matters only for display and the CV "gains" side (the matching cash dividend must be counted as a gain when a dividend file is supplied).
- **Confirm:** that these are DRPs (PLAN §12.7).

## 2026-10-04 – Hatch: dividends grossed up at 15 % (flagged); money-market dividends not grossed up
- **Decision:** default gross-up 15 % for Hatch share dividends (configurable); DAGXX / "Money market fund" dividends are taken as gross with withholding 0, flagged `mmf_dividend_withholding_unknown_assumed_nil`. The blank-symbol "January 2026 Dividend" row is kept as an unassigned dividend for the user to assign.
- **Why:** PLAN §0 back-solves ~15 % on share dividends. US money-market "interest-related dividends" are commonly exempt from non-resident withholding, so grossing them up would invent a tax credit.
- **Confirm:** 15 % (PLAN §12.7) and the DAGXX treatment against a Hatch tax statement.

## 2026-10-04 – Hatch rows are US-venue; Sharesight supplies the exchange code and date when matched
- **Decision:** Hatch has no market column, so Hatch trades are keyed to the pooled US venue (`SYMBOL:US`); when matched, the Sharesight market code and exchange date replace the inferred NZ date − 1.
- **Why:** PLAN §0: All Trades date = Hatch date − 1 for all 16 orders; the merge window allows −2…0 days.

## 2026-10-04 – US venues pooled in the instrument key
- **Decision:** `instrumentKey` = `SYMBOL:US` for NASDAQ/NYSE/BATS/CBOE/NYSE Arca/OTC; other markets keep their own code (e.g. `CSL:ASX`).
- **Why:** the same share appears as CBOE in Sharesies and BATS in Sharesight (ARKG); Hatch has no venue at all. A US ticker identifies one security across US venues.
- **Alternative:** venue-specific keys with an alias table only.

## 2026-10-04 – Synthetic fixtures; the openpyxl `dxfId` quirk is not reproduced
- **Decision:** `scripts/make-fixtures.ts` deterministically generates all files in `fixtures/` with invented tickers (ACME, GLOBX, ZETF, ROKT, PLNT, TRPL, MEGA), quantities, prices, rates and IDs, copying only the shapes and quirks of the real exports. A private script checks that no non-trivial number from the real files appears in a fixture.
- **Why:** only anonymised/synthetic data may be committed.
- **Gap:** SheetJS cannot write the table-part `dxfId` that crashes openpyxl; the browser reader (SheetJS) is not affected by it, and the real file is covered by the private golden test.

## 2026-10-04 – FX: bundled RBNZ B1 snapshot; trades on the transaction date; values on 31 March
- **Decision:** default FX mode `rbnz`: every amount converted at the RBNZ B1 daily rate for its date (exchange date by default), walking back up to 7 days for weekends/holidays. Opening values use the **31 March** rate of the previous year (IRD allows the 31 March rate for 1 April); closing values use 31 March. `trade` (match) mode uses Sharesight's per-trade `Value`/`Exch. Rate` for trades and RBNZ for market values and broker dividends. The snapshot covers USD, GBP, AUD, JPY, EUR, CAD, HKD, SGD from 2018.
- **Why:** PLAN §6.3/§12 default; RBNZ licence allows redistribution; one consistent method (s EX 57).
- **Alternative:** IRD rolling 12-month average (not built yet; IRD reuse licence unverified).
- **Confirm:** that "actual daily rate on the exchange date" is the convention you want for US trades (the NZ date is one day later).

## 2026-10-04 – Same-day ordering: acquisitions before disposals
- **Decision:** within one date the ledger applies opening/buys/DRPs, then merge-cancel, merge-buy, splits, sells.
- **Why:** intraday order is unknown in the exports; matches the reference implementation (and so its peak holdings). It can only raise the peak, never lower it.
- **Alternative:** use broker timestamps when both legs come from Sharesies (not done).

## 2026-10-04 – Quick sale: strict "acquire then later dispose"; dividends left out of the gain
- **Decision:** a QSA is required only if a disposal follows an in-year acquisition (s EX 52(6) "later disposes"); the reference implementation required any buy and any sell in the year (kept as `qsaStrictOrder: false` for the differential test). The quick sale gain counts disposal proceeds only; dividends received on quick-sale shares ("derives from holding", s EX 52(12)) are not added (flagged `qs_gain_excludes_dividends_on_quick_sale_shares`).
- **Why:** follows the statute text; per-share dividend attribution needs data we don't reliably have. Effect is small and only increases the gain leg.
- **Confirm:** whether to include those dividends.

## 2026-10-04 – FTC under CV is capped per holding on max(0, CV), zero if the CV total is floored
- **Decision:** FTC per holding = min(withholding, marginal rate × that holding's FIF income); under CV a negative holding gets no credit and a floored portfolio gets none.
- **Why:** IR461 p.20 caps the credit per FIF interest; offsetting between holdings is not addressed.
- **Confirm:** with an adviser if CV is the method chosen.

## 2026-10-04 – De minimis cost uses trade NZD values under the chosen FX mode
- **Decision:** running FIFO cost of FIF-classed holdings, converted like other trades (RBNZ on the trade date, or Sharesight values in match mode), checked at each day's end; a trade whose cost can't be determined marks the test incomplete.
