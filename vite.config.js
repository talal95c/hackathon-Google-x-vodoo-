import { defineConfig } from 'vite';

// base './' : obligatoire pour itch.io (le jeu est servi depuis un sous-dossier)
export default defineConfig({
  base: './',
  build: { target: 'es2020', chunkSizeWarningLimit: 1000 },
});
