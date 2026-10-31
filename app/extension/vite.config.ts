import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

// Три сборки: окно (popup.html, React) и два скрипта одним файлом IIFE — чтение страницы (его вставляют в чужую
// страницу) и фоновый (очередь). EXT_ENTRY=extract|background — скрипты. Собирает `npm run ext:build` из app/
const entry = process.env.EXT_ENTRY
const extract = Boolean(entry)
export default defineConfig({
  root: import.meta.dirname,
  base: './',
  plugins: extract ? [] : [react(), tailwindcss()],
  resolve: { alias: { '@': `${import.meta.dirname}/../src` } },
  publicDir: extract ? false : 'public',
  build: {
    outDir: 'dist',
    emptyOutDir: !extract,
    ...(extract
      ? { lib: { entry: `${entry}.ts`, formats: ['iife'], name: `refkit_${entry}`, fileName: () => `${entry}.js` } }
      : { rollupOptions: { input: 'popup.html' } }),
  },
})
