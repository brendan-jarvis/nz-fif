# Privacy: zero data retention

**Your files, quantities, amounts and results never leave your browser tab and
are never stored.** nz-fif is a static web page; every calculation runs in your
browser.

## What leaves your browser

Only one thing, and only when **price lookup is on**:

| Sent | To | Example |
|---|---|---|
| a ticker symbol and a date | our own route `/api/price` on the same site | `/api/price?symbol=AAPL&date=2026-03-31` |

- A lookup reveals **which tickers you hold** (and the year) to our Worker and to
  Cloudflare's edge, which sees the URL and your IP address like any web
  request. It does **not** reveal quantities, values, costs, dividends, your
  broker, or anything from your files.
- Before the first lookup in a session the page lists the exact tickers and
  dates it is about to send and asks you to choose **Fetch** or **Enter manually**.
- Our Worker forwards the symbol and date range to Yahoo Finance. Yahoo sees
  Cloudflare's request only, never your IP address, browser, cookies or referrer.
- You can turn lookups off. Manual entry works fully offline.

## What the server keeps

Nothing about you. The whole server is one file, [`worker/price.ts`](worker/price.ts):

- It accepts only `GET /api/price?symbol=…&date=…` (strictly validated) and returns 404/400 for anything else.
- It has **no storage bindings** (no KV, D1, R2, Durable Objects, Queues, Analytics Engine, rate-limit counters) – see [`wrangler.jsonc`](wrangler.jsonc).
- Workers Logs, traces and Logpush are **off**; the code never calls `console`.
- Its only caches hold **public price data** keyed solely on `symbol|date`: Cloudflare's Cache API (7 days) and a short-lived in-memory map inside the running Worker. Nothing in them identifies you.
- It does not read or forward your IP address, cookies or headers, and sends no CORS headers (same-origin only).

## What your browser keeps

Nothing. The app uses no cookies, `localStorage`, `sessionStorage`, IndexedDB,
Cache Storage or service worker. Files are read into memory with
`Blob.arrayBuffer()` and disappear when you close the tab. Price responses are
sent `Cache-Control: no-store`. If you want to keep your choices, download
`assumptions.json` and load it next time.

## No tracking

No analytics, telemetry, fonts, CDNs or third-party scripts. The Content
Security Policy (`public/_headers`) only allows scripts and styles from this
site and only allows connections to `/api/price`. These Cloudflare features
must stay **off**: Web Analytics auto-inject, Zaraz, Rocket Loader, Email
Address Obfuscation.

## Verify it yourself

See [AUDIT.md](AUDIT.md) for a step-by-step checklist and a 5-minute recipe.
