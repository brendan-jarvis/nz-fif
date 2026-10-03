// Config test (PLAN §3.9): the deployable surface is exactly one tiny Worker
// with no storage, analytics or logging. Workers Free plan only.
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseJsonc } from './jsonc';

const cfg = parseJsonc(readFileSync('wrangler.jsonc', 'utf8')) as Record<string, unknown>;

// Every wrangler key that would attach state, compute or telemetry.
const FORBIDDEN_KEYS = [
  'kv_namespaces', 'd1_databases', 'r2_buckets', 'durable_objects', 'queues',
  'analytics_engine_datasets', 'tail_consumers', 'services', 'hyperdrive',
  'vectorize', 'ai', 'browser', 'mtls_certificates', 'dispatch_namespaces',
  'workflows', 'send_email', 'ratelimits', 'unsafe', 'secrets_store_secrets',
  'pipelines', 'containers', 'images', 'version_metadata', 'logfwdr',
  'triggers', 'migrations', 'site', 'build', 'routes', 'route',
  'placement', 'limits', 'usage_model', 'assets_binding', 'wasm_modules',
  'text_blobs', 'data_blobs', 'cloudchamber', 'vpc_services', 'worker_loaders',
];

describe('wrangler.jsonc', () => {
  it('has exactly one main: worker/price.ts', () => {
    expect(cfg.main).toBe('worker/price.ts');
  });

  it('has no bindings at all (no KV/D1/R2/DO/Queues/AE/rate limit/services)', () => {
    for (const k of FORBIDDEN_KEYS) expect(cfg, `forbidden key ${k}`).not.toHaveProperty(k);
  });

  it('only allows the known top-level keys', () => {
    expect(Object.keys(cfg).sort()).toEqual(
      ['$schema', 'assets', 'compatibility_date', 'logpush', 'main', 'name', 'observability',
        'preview_urls', 'send_metrics', 'upload_source_maps', 'vars', 'workers_dev'].sort(),
    );
  });

  it('turns observability, logpush, source maps and metrics off', () => {
    expect(cfg.observability).toEqual({ enabled: false });
    expect(cfg.logpush).toBe(false);
    expect(cfg.upload_source_maps).toBe(false);
    expect(cfg.send_metrics).toBe(false);
  });

  it('serves static assets from dist and runs the Worker only for /api/price', () => {
    const assets = cfg.assets as Record<string, unknown>;
    expect(assets.directory).toBe('dist');
    expect(assets.run_worker_first).toEqual(['/api/price']);
    expect(assets).not.toHaveProperty('binding');
  });

  it('exposes only the PRICE_SOURCE kill-switch var', () => {
    expect(cfg.vars).toEqual({ PRICE_SOURCE: 'yahoo' });
  });

  it('uses workers.dev without preview URLs', () => {
    expect(cfg.workers_dev).toBe(true);
    expect(cfg.preview_urls).toBe(false);
  });

  it('has no Pages Functions or advanced-mode _worker.js', () => {
    expect(existsSync('functions')).toBe(false);
    expect(existsSync('public/_worker.js')).toBe(false);
    expect(existsSync('public/_routes.json')).toBe(false);
    expect(existsSync('wrangler.toml')).toBe(false);
    expect(existsSync('wrangler.json')).toBe(false);
  });
});
