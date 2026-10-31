import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { MotionConfig } from 'framer-motion'
import './index.css'
import './fonts.css'
import App from './App.tsx'
import { ThumbPage } from './components/thumb-page.tsx'
import { SNAPSHOT } from './lib/library.ts'

// Снимок для публикации: ставим признак, по нему index.css прячет всё, что меняет данные (сайдбар, вставка нод, перезапуск, нижняя панель)
if (SNAPSHOT) document.documentElement.dataset.snapshot = '1'

// ?thumb=<id> — страница для снимка превью холста (её открывает сервер), без приложения
const thumbId = new URLSearchParams(window.location.search).get('thumb')

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* «Уменьшить движение» в системе — framer-motion убирает перемещение и масштаб, прозрачность оставляет */}
    <MotionConfig reducedMotion="user">
      {thumbId ? <ThumbPage id={thumbId} /> : <App />}
    </MotionConfig>
  </StrictMode>,
)
