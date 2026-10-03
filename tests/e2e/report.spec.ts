// M2-M5 end to end with synthetic files: review → consented price lookups (routed to
// a stub, never Yahoo) → report. Checks every request, storage, and that the
// browser's totals equal the core engine's totals for the same inputs.
import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { buildLedger, calculate, FxTable, isRelevant, mergeSources, money2, parseFile, suggestClass, type FifClass, type FxTableJson, type PriceInput } from '../../packages/core/src/index';
import { EMPTY_STORAGE, isStaticAsset, recordRequests, storageSnapshot } from './helpers';

const FILES = ['fixtures/alltrades-history-synthetic.xlsx', 'fixtures/hatch-synthetic.csv'];
const PRICE_URL = /^\/api\/price\?symbol=[A-Z0-9]{1,10}([.-][A-Z0-9]{1,4})?&date=\d{4}-\d{2}-\d{2}$/;

/** Deterministic stub price: from the symbol's letters; TRPL had a 2:1 split after 2025-03-31. */
function stubPrice(symbol: string, date: string) {
  const close = 5 + [...symbol].reduce((a, c) => a + c.charCodeAt(0), 0) % 40 + (date.startsWith('2026') ? 1.5 : 0);
  const split = symbol === 'TRPL' && date < '2025-11-24';
  return { symbol, requestedDate: date, tradingDate: date, currency: 'USD', exchangeTimezone: 'America/New_York', close, rawClose: split ? close * 2 : close, splitsAfter: split ? [{ date: '2025-11-24', ratio: '2:1' }] : [], source: 'stub' };
}

function expectedTotals() {
  const merged = mergeSources(FILES.map((f) => parseFile(f.split('/').pop()!, readFileSync(f))));
  const fx = new FxTable(JSON.parse(readFileSync('packages/core/data/rbnz-b1-daily.json', 'utf8')) as FxTableJson);
  const classes: Record<string, FifClass> = {};
  const prices: Record<string, { opening?: PriceInput; closing?: PriceInput }> = {};
  for (const p of [...buildLedger(merged.txns, { year: 2026, dateBasis: 'exchange' }).values()].filter(isRelevant)) {
    classes[p.key] = suggestClass(p).fifClass;
    if (classes[p.key] !== 'fif') continue;
    const o = stubPrice(p.symbol, '2025-03-31'), c = stubPrice(p.symbol, '2026-03-31');
    prices[p.key] = { opening: { price: String(o.rawClose), currency: 'USD', source: 's' }, closing: { price: String(c.rawClose), currency: 'USD', source: 's' } };
  }
  return calculate({ txns: merged.txns, year: 2026, classes, prices, fx }).totals!;
}

test('review → consented lookups → report; only ticker/date requests; nothing stored', async ({ page }) => {
  const priceRequests: string[] = [];
  await page.route('**/api/price?**', async (route) => {
    const u = new URL(route.request().url());
    priceRequests.push(u.pathname + u.search);
    expect(route.request().method()).toBe('GET');
    expect(route.request().postData()).toBeNull();
    await route.fulfill({ status: 200, contentType: 'application/json', headers: { 'cache-control': 'no-store' }, body: JSON.stringify(stubPrice(u.searchParams.get('symbol')!, u.searchParams.get('date')!)) });
  });
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  const seen = recordRequests(page);
  await page.getByTestId('file-input').setInputFiles(FILES);
  await expect(page.getByTestId('review')).toBeVisible();
  await expect(page.getByTestId('year')).toHaveValue('2026');
  await page.getByTestId('accept-all').click();
  await expect(page.getByTestId('review-count')).toHaveText('All holdings classified.');
  // Before consent: no request at all beyond static assets.
  expect(seen.filter((r) => !isStaticAsset(r)).map((r) => r.url())).toEqual([]);
  await expect(page.getByTestId('report-blocked')).toBeVisible();

  await page.getByTestId('lookup').click();
  const list = page.getByTestId('consent-list');
  await expect(list.locator('li')).toHaveCount(12);
  await expect(list).toContainText('TRPL on 2025-03-31');
  await page.getByTestId('consent-yes').click();
  await expect(page.getByTestId('report')).toBeVisible();

  expect(priceRequests).toHaveLength(12);
  for (const u of priceRequests) expect(u).toMatch(PRICE_URL);
  // No quantity from the files ever appears in a URL.
  const fixtureText = readFileSync('fixtures/hatch-synthetic.csv', 'utf8');
  const qtys = new Set((fixtureText.match(/\b\d+\.\d{3,}\b/g) ?? []));
  for (const u of priceRequests) for (const q of qtys) expect(u.includes(q)).toBe(false);
  // The only non-static requests are those price lookups.
  expect(seen.filter((r) => !isStaticAsset(r)).map((r) => new URL(r.url()).pathname)).toEqual(Array(12).fill('/api/price'));

  const t = expectedTotals();
  await expect(page.getByTestId('total-fdr')).toHaveText(money2(t.fdr));
  await expect(page.getByTestId('total-cv')).toHaveText(money2(t.cv));
  await expect(page.getByTestId('total-qsa')).toHaveText(money2(t.qsa));
  await expect(page.getByTestId('table-ir3')).toContainText('17B');
  await expect(page.getByTestId('price-TRPL:US-opening')).toHaveValue(String(stubPrice('TRPL', '2025-03-31').rawClose));
  expect(await storageSnapshot(page)).toEqual(EMPTY_STORAGE);
});
