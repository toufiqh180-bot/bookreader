// Builds the renderer (the whole UI) for both targets:
//   - the Electron desktop app loads it from out/renderer
//   - the web/PWA build serves the same files from any static host
import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { viteStaticCopy } from 'vite-plugin-static-copy';
import { VitePWA } from 'vite-plugin-pwa';

const modules = (p: string) => path.join('node_modules', p).replaceAll('\\', '/');

export default defineConfig({
  base: './', // relative URLs so the build works from app:// and from any web path
  build: { outDir: 'out/renderer', emptyOutDir: true, target: 'es2022' },
  resolve: { alias: { '@': path.resolve(import.meta.dirname, 'src') } },
  plugins: [
    react(),
    tailwindcss(),
    // Assets pdf.js and Tesseract load at runtime by URL. Bundled so the app works offline.
    viteStaticCopy({
      targets: [
        { src: modules('pdfjs-dist/cmaps/*'), dest: 'vendor/pdfjs/cmaps' },
        { src: modules('pdfjs-dist/standard_fonts/*'), dest: 'vendor/pdfjs/standard_fonts' },
        { src: modules('pdfjs-dist/wasm/*'), dest: 'vendor/pdfjs/wasm' },
        { src: modules('pdfjs-dist/iccs/*'), dest: 'vendor/pdfjs/iccs' },
        { src: modules('tesseract.js/dist/worker.min.js'), dest: 'vendor/tesseract' },
        { src: modules('tesseract.js-core/tesseract-core*-lstm.wasm.js'), dest: 'vendor/tesseract/core' },
        { src: modules('@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz'), dest: 'vendor/tesseract/lang' },
      ],
    }),
    VitePWA({
      registerType: 'autoUpdate',
      // The service worker is for the web build only; Electron ignores it.
      injectRegister: null,
      manifest: {
        name: 'BookReader',
        short_name: 'BookReader',
        description: 'A free, open-source PDF reader made for reading books.',
        theme_color: '#1473e6',
        background_color: '#eceef1',
        display: 'standalone',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
        file_handlers: [{ action: './', accept: { 'application/pdf': ['.pdf'] } }],
      },
      workbox: {
        globPatterns: ['**/*.{js,mjs,css,html,png,svg,wasm,gz,bcmap,pfb,ttf,icc}'],
        maximumFileSizeToCacheInBytes: 40 * 1024 * 1024,
      },
    }),
  ],
  server: { port: 5173, strictPort: true },
});
