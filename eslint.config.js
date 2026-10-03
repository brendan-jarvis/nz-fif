// Privacy guardrails (PLAN §3.9). These rules are part of the audit surface:
// - No network, storage, cookie, service-worker or beacon APIs anywhere in the
//   app or core, except `fetch` inside src/net/priceClient.ts.
// - No `console` in worker/ and no storage bindings there.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

const bannedGlobals = [
  'fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource', 'RTCPeerConnection',
  'localStorage', 'sessionStorage', 'indexedDB', 'caches', 'cookieStore',
  'importScripts', 'SharedWorker', 'BroadcastChannel', 'openDatabase',
].map((name) => ({ name, message: `${name} is banned by the zero-retention policy (see AUDIT.md).` }));

const bannedMemberNames = [
  'fetch', 'sendBeacon', 'localStorage', 'sessionStorage', 'indexedDB', 'cookie',
  'cookieStore', 'serviceWorker', 'caches', 'importScripts', 'XMLHttpRequest',
  'WebSocket', 'EventSource', 'RTCPeerConnection',
];
const memberRe = `^(${bannedMemberNames.join('|')})$`;
const bannedSyntax = [
  { selector: `MemberExpression[computed=false][property.name=/${memberRe}/]`, message: 'Network/storage API access is banned (see AUDIT.md).' },
  { selector: `MemberExpression[computed=true][property.value=/${memberRe}/]`, message: 'Network/storage API access is banned (see AUDIT.md).' },
  { selector: "NewExpression[callee.name='Function']", message: 'new Function is banned.' },
  { selector: "CallExpression[callee.name='eval']", message: 'eval is banned.' },
];

export default tseslint.config(
  { ignores: ['dist/**', 'dist-worker/**', 'node_modules/**', '.wrangler/**', 'private/**', 'playwright-report/**', 'test-results/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['src/**/*.{ts,tsx}', 'packages/core/src/**/*.ts'],
    languageOptions: { globals: { ...globals.browser } },
    rules: {
      'no-restricted-globals': ['error', ...bannedGlobals],
      'no-restricted-syntax': ['error', ...bannedSyntax],
    },
  },
  {
    // The one sanctioned network module.
    files: ['src/net/priceClient.ts'],
    rules: {
      'no-restricted-globals': ['error', ...bannedGlobals.filter((g) => g.name !== 'fetch')],
      'no-restricted-syntax': 'off',
    },
  },
  {
    // Core is pure: no DOM either.
    files: ['packages/core/src/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', { patterns: ['preact*', '../../src/*'] }],
    },
  },
  {
    files: ['worker/**/*.ts'],
    languageOptions: { globals: { ...globals.serviceworker } },
    rules: {
      'no-console': 'error',
      'no-restricted-syntax': [
        'error',
        { selector: "Identifier[name=/^(KVNamespace|D1Database|R2Bucket|DurableObjectNamespace|DurableObject|Queue|AnalyticsEngineDataset|RateLimit)$/]", message: 'Storage/analytics bindings are banned in the Worker (Workers Free, zero retention).' },
        { selector: "MemberExpression[object.name='env'][property.name!=/^(PRICE_SOURCE)$/]", message: 'The Worker may only read env.PRICE_SOURCE.' },
        { selector: "CallExpression[callee.name='eval']", message: 'eval is banned.' },
      ],
    },
  },
);
