// PLAN §3.9 Playwright guardrails.
import { expect, test } from '@playwright/test';
import { EMPTY_STORAGE, isStaticAsset, recordRequests, storageSnapshot } from './helpers';

test('page loads with the disclaimer and the strict CSP', async ({ page }) => {
  const res = await page.goto('/');
  expect(res?.status()).toBe(200);
  const csp = res?.headers()['content-security-policy'] ?? '';
  expect(csp).toContain("connect-src http://localhost:8788/api/price");
  await expect(page.getByTestId('disclaimer')).toContainText('Not tax advice');
});

test('CSP blocks any connection that is not the price route', async ({ page }) => {
  await page.goto('/');
  const result = await page.evaluate(async () => {
    const out: string[] = [];
    for (const url of ['https://example.com/x', '/not-the-price-route', '/api/price2']) {
      try { await window.fetch(url); out.push(`allowed ${url}`); } catch { out.push(`blocked ${url}`); }
    }
    return out;
  });
  expect(result).toEqual(['blocked https://example.com/x', 'blocked /not-the-price-route', 'blocked /api/price2']);
});

test('lookups off: loading files makes zero requests and leaves no storage', async ({ page }) => {
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  const seen = recordRequests(page);
  await page.getByTestId('file-input').setInputFiles({ name: 'empty.csv', mimeType: 'text/csv', buffer: Buffer.from('a,b\n1,2\n') });
  await expect(page.getByTestId('file-list')).toContainText('empty.csv');
  await page.waitForTimeout(500);
  expect(seen.filter((r) => !isStaticAsset(r)).map((r) => r.url())).toEqual([]);
  expect(await storageSnapshot(page)).toEqual(EMPTY_STORAGE);
});
