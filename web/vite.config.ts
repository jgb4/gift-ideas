import path from 'node:path'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

// Builds the static site into the repo root, which GitHub Pages serves.
export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
  build: {
    outDir: '..',
    emptyOutDir: false,
    rollupOptions: {
      input: {
        home: path.resolve(__dirname, 'index.html'),
        hanukkah: path.resolve(__dirname, 'hanukkah/index.html'),
        birthdays: path.resolve(__dirname, 'birthdays/index.html'),
      },
    },
  },
})
