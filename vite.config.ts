import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';

// Reproducible, CSP-friendly static build. No inline scripts or styles:
// the CSP in public/_headers is script-src 'self'; style-src 'self'.
export default defineConfig({
  plugins: [preact()],
  publicDir: 'public',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: false,
    // Vite would otherwise inline a tiny modulepreload polyfill.
    modulePreload: { polyfill: false },
    // Never inline assets as data: URLs into JS/CSS (keeps the bundle scan honest).
    assetsInlineLimit: 0,
    cssCodeSplit: false,
    rollupOptions: {
      output: {
        entryFileNames: 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
  },
  worker: {
    format: 'es',
  },
});
