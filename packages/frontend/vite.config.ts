import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
  },
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        admin: resolve(__dirname, 'admin.html'),
      },
      output: {
        // React e il router in un pezzo a parte ("vendor"), condiviso da
        // sito e gestionale: cambia di rado, quindi resta nella cache del
        // browser anche quando si pubblica una nuova versione del sito.
        manualChunks(id) {
          if (/[\\/]node_modules[\\/](react|react-dom|scheduler|react-router|react-router-dom|@remix-run[\\/]router)[\\/]/.test(id)) return 'vendor';
          return undefined;
        },
      },
    },
  },
});
