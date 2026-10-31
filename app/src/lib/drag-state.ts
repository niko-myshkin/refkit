import { useSyncExternalStore } from 'react'

// Что тащат сейчас (id плитки) — вне React-состояния страницы: иначе старт перетаскивания перерисовывает всю ленту.
// Подписаны только те, кому это нужно: дерево папок, пустая полка пинов, плавающие панели
let current: string | null = null
const listeners = new Set<() => void>()

export const dragState = {
  // self — какие плитки «в руке» (одна или пачка): они остаются яркими, остальная лента гаснет по CSS (html[data-dragging])
  set(id: string | null, self: string[] = id ? [id] : []) {
    document.querySelectorAll('[data-drag-self]').forEach((node) => node.removeAttribute('data-drag-self'))
    if (id) {
      document.documentElement.dataset.dragging = ''
      self.forEach((item) => document.querySelector(`[data-tile-id="${CSS.escape(item)}"]`)?.setAttribute('data-drag-self', ''))
    } else delete document.documentElement.dataset.dragging
    if (current === id) return
    current = id
    listeners.forEach((listener) => listener())
  },
  get: () => current,
}

export function useDragging() {
  return useSyncExternalStore((listener) => { listeners.add(listener); return () => { listeners.delete(listener) } }, dragState.get, dragState.get)
}
