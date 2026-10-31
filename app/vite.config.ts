import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'
import { libraryPlugin } from './library-plugin.ts'
import { aliases } from './aliases.ts'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), libraryPlugin()],
  resolve: {
    alias: aliases,
  },
  // Порт выдаёт среда (PORT), чтобы не конфликтовать с другими чатами
  server: {
    port: Number(process.env.PORT) || 5173,
    strictPort: true,
    // Refkit без пароля: только этот компьютер (см. library-plugin.ts, защита от --host)
    host: '127.0.0.1',
    allowedHosts: ['localhost', '127.0.0.1'],
    // Сборка результата ноды не должна перезагружать открытый холст.
    watch: { ignored: ['**/.analyze/screens/**'] },
  },
})
