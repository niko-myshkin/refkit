import { defineConfig } from 'vitest/config'
import { aliases } from './aliases.ts'

// Тесты не поднимают vite.config.ts (там dev-плагин библиотеки со своим сервером): только чистые модули и компоненты.
// Псевдонимы (@, lucide-react) те же, что в приложении и в сборке экранов
export default defineConfig({ resolve: { alias: aliases }, test: { include: ['shared/**/*.test.{mjs,ts}'], environment: 'node' } })
