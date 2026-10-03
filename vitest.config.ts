import { defineConfig } from 'vitest/config';

// Unit, worker and privacy/config tests. Never touches the network:
// tests/setup-no-network.ts replaces fetch with a function that throws.
export default defineConfig({
  test: {
    include: ['packages/core/test/**/*.test.ts', 'tests/**/*.test.ts'],
    exclude: ['tests/e2e/**', 'node_modules/**', 'private/**'],
    setupFiles: ['tests/setup-no-network.ts'],
    environment: 'node',
  },
});
