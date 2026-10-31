import { useLayoutEffect, useState } from 'react'

// Горизонтальный центр ОСНОВНОЙ области (не окна: слева боковая панель, она может быть любой ширины или свёрнута).
// Нужен всему, что стоит «по центру внизу» — плавающей панели и уведомлениям, иначе они разъезжаются. ResizeObserver срабатывает и во время анимации панели
export function useContentCenter(): number | null {
  const [center, setCenter] = useState<number | null>(null)
  useLayoutEffect(() => {
    const area = document.querySelector<HTMLElement>('[data-slot="sidebar-inset"]')
    if (!area) return
    const read = () => { const rect = area.getBoundingClientRect(); setCenter(rect.left + rect.width / 2) }
    read()
    const observer = new ResizeObserver(read)
    observer.observe(area)
    window.addEventListener('resize', read)
    return () => { observer.disconnect(); window.removeEventListener('resize', read) }
  }, [])
  return center
}
