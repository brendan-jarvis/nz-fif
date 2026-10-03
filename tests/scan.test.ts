import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { check, scan } from '../scripts/scan-bundle';

function fakeDist(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'nzfif-scan-'));
  for (const [name, text] of Object.entries(files)) {
    mkdirSync(join(dir, name, '..'), { recursive: true });
    writeFileSync(join(dir, name), text);
  }
  return dir;
}

describe('bundle scan', () => {
  it('flags unexplained network and storage capabilities', () => {
    const dir = fakeDist({ 'assets/index-abc.js': 'fetch("https://evil.example/x");localStorage.x=1;navigator.sendBeacon(1)' });
    const { failures } = check(scan(dir), []);
    expect(failures.join('\n')).toMatch(/fetch/);
    expect(failures.join('\n')).toMatch(/localStorage/);
    expect(failures.join('\n')).toMatch(/sendBeacon/);
    expect(failures.join('\n')).toMatch(/evil\.example/);
  });

  it('accepts justified hits within maxCount and rejects extra ones', () => {
    const rules = [{ pattern: 'fetch', file: 'assets/index-*.js', maxCount: 1, why: 'priceClient' }];
    expect(check(scan(fakeDist({ 'assets/index-abc.js': 'a=fetch(u)' })), rules).failures).toEqual([]);
    expect(check(scan(fakeDist({ 'assets/index-abc.js': 'a=fetch(u);b=fetch(v)' })), rules).failures).toHaveLength(1);
    expect(check(scan(fakeDist({ 'assets/other-abc.js': 'a=fetch(u)' })), rules).failures).toHaveLength(1);
  });
});
