// M1: upload the synthetic exports with lookups off; check reconciliation,
// zero non-static requests and empty storage.
import { expect, test } from '@playwright/test';
import { EMPTY_STORAGE, isStaticAsset, recordRequests, storageSnapshot } from './helpers';

const FIXTURES = ['fixtures/sharesies-synthetic.csv', 'fixtures/hatch-synthetic.csv', 'fixtures/alltrades-fy2026-synthetic.xlsx'];

test('parses the three synthetic exports in a Web Worker and reconciles them', async ({ page }) => {
  await page.goto('/');
  await page.waitForLoadState('networkidle');
  const seen = recordRequests(page);
  await page.getByTestId('file-input').setInputFiles(FIXTURES);
  await expect(page.getByTestId('recon-matched')).toHaveText('22');
  await expect(page.getByTestId('recon-at-only')).toHaveText('5');
  await expect(page.getByTestId('recon-csv-only')).toHaveText('1');
  await expect(page.getByTestId('kind-0')).toHaveText('Sharesies transactions');
  await expect(page.getByTestId('count-0')).toHaveText('19');
  await expect(page.getByTestId('kind-2')).toHaveText('Sharesight All Trades');
  await expect(page.getByTestId('count-2')).toHaveText('27');
  const offending = seen.filter((r) => !isStaticAsset(r));
  expect(offending.map((r) => r.url())).toEqual([]);
  expect(await storageSnapshot(page)).toEqual(EMPTY_STORAGE);
});
