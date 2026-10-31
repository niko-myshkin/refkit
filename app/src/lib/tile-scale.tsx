import { useEffect, useSyncExternalStore, type ReactNode } from 'react'
import { columnsFor, scaleRange, tileMin } from '@/lib/tile-grid'

// Размер плиток: Cmd + колесо меняет общий масштаб всех плиток (идея 63, владелец 2026-10-02; сначала просил Ctrl, потом поправил на Cmd).
// Щипок на трекпаде работает тоже: браузер шлёт его как колесо с ctrlKey, отличить от Ctrl+колесо нельзя, поэтому Ctrl не отключаем.
// Один масштаб на контент, Spaces и Actions; хранится в браузере. Cmd+0 (и Ctrl+0) — вернуть.
// Работает только над содержимым страницы (main), не над карточкой и диалогами.
//
// Масштаб лежит во внешнем хранилище, а не в контексте React: лента плиток подписана только на ЧИСЛО КОЛОНОК (useTileColumns) —
// плитки растягиваются на всю ширину, и между границами колонок раскладка не меняется. Тик колеса или шаг ползунка без смены колонки
// не перерисовывает страницу (раньше перерисовывал: ~200 мс на каждый тик). На сам масштаб (Spaces, Actions, ползунок) подписан useTileScale.
const key = 'refkit.tileScale'
const clamp = (value: number) => Math.min(scaleRange.max, Math.max(scaleRange.min, value))

function stored() {
  try { const value = Number(localStorage.getItem(key)); return value > 0 ? clamp(value) : 1 } catch { return 1 }
}

let scale = stored()
const listeners = new Set<() => void>()
const subscribe = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener) } }
const read = () => scale

let pending: number | null = null // накопленное за кадр: колесо шлёт события чаще, чем нужно применять
let frame = 0
function apply(next: number) {
  pending = clamp(next)
  if (frame) return
  frame = requestAnimationFrame(() => {
    frame = 0
    if (pending === null || pending === scale) return
    scale = pending
    try { localStorage.setItem(key, String(scale)) } catch { /* приватный режим — не запомнится */ }
    listeners.forEach((listener) => listener())
  })
}

// Масштаб целиком — для тех, кому нужно само значение (страницы-сетки на CSS-grid, ползунок)
export const useTileScale = () => useSyncExternalStore(subscribe, read, read)
// Задать масштаб прямо (ползунок в меню): те же пределы и память, что у колеса
export const useSetTileScale = () => apply
// Сколько колонок помещается в ширину width при текущем масштабе. Страница перерисовывается, только когда число колонок изменилось
export const useTileColumns = (width: number, base = tileMin) => useSyncExternalStore(subscribe, () => columnsFor(width, Math.min(base * scale, width || Infinity)))

export function TileScaleProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    const current = () => pending ?? scale
    const inContent = (target: EventTarget | null) => target instanceof Element && Boolean(target.closest('main')) && !document.querySelector('[role="dialog"]')
    const onWheel = (event: WheelEvent) => {
      if (!(event.metaKey || event.ctrlKey) || !inContent(event.target)) return
      event.preventDefault() // без этого браузер приблизил бы всю страницу
      // Мышь шлёт ~100 за щелчок, щипок — единицы: ограничиваем шаг, чтобы щелчок не прыгал на треть
      const step = Math.max(-30, Math.min(30, event.deltaY))
      apply(current() * Math.exp(-step * 0.01))
    }
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === '0' && !(event.target instanceof HTMLElement && event.target.closest('input, textarea, [contenteditable]'))) { event.preventDefault(); apply(1) }
    }
    window.addEventListener('wheel', onWheel, { passive: false })
    window.addEventListener('keydown', onKey)
    return () => { window.removeEventListener('wheel', onWheel); window.removeEventListener('keydown', onKey) }
  }, [])
  return <>{children}</>
}
