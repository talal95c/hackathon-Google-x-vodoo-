import { defineConfig } from 'vite';
import { studioApi } from './studio/api.js';

// base './' : obligatoire pour itch.io (le jeu est servi depuis un sous-dossier)
export default defineConfig({
  base: './',
  plugins: [studioApi()],
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 1000,
    rollupOptions: { input: { main: 'index.html', brand: 'brand.html', studio: 'studio.html' } },
  },
});
