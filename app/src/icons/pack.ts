import { useSyncExternalStore } from 'react'

// Какой набор иконок включён: обычные (Lucide) или мягкие (свои, перерисованные). Выбор помнится в браузере; переключение — в «Настройки → Иконки»
export type IconPack = 'classic' | 'soft' | 'solar'
const KEY = 'refkit.icons.v2' // новый ключ: прежний выбор «Обычные» не перебивает новый набор по умолчанию
const listeners = new Set<() => void>()
// По умолчанию Solar (владелец 2026-10-27: «Lucide не нравится»); выбранное ранее остаётся
const read = (): IconPack => { try { const saved = localStorage.getItem(KEY); return saved === 'soft' || saved === 'classic' ? saved : 'solar' } catch { return 'solar' } }
let current: IconPack = read()
export const setIconPack = (pack: IconPack) => {
  current = pack
  try { localStorage.setItem(KEY, pack) } catch { /* без памяти */ }
  listeners.forEach((listener) => listener())
}
export const useIconPack = () => useSyncExternalStore((listener) => { listeners.add(listener); return () => { listeners.delete(listener) } }, () => current)
