import { useEffect, useState } from 'react'

// Ширины экрана для JS — те же, что в index.css (@theme: --breakpoint-compact). Поменял здесь — поменяй там.
// compact совпадает с md: у shadcn (сайдбар-шторка), чтобы на 760–767 px не было «шторка уже, раскладка ещё широкая»
export const compact = 768 // уже — телефон: панели поверх, сайдбар шторкой
export const roomy = 1024 // уже — панель навигации при входе свёрнута в иконки: иначе контенту остаётся одна колонка
export const wide = 1280 // уже — открытый агент сам сворачивает панель навигации в иконки (панель + агент + контент не помещаются)

// Экран не уже width px; следит за поворотом и изменением окна
export function useMinWidth(width: number) {
  const [matches, setMatches] = useState(() => window.matchMedia(`(min-width: ${width}px)`).matches)
  useEffect(() => {
    const query = window.matchMedia(`(min-width: ${width}px)`)
    const sync = () => setMatches(query.matches)
    query.addEventListener('change', sync)
    return () => query.removeEventListener('change', sync)
  }, [width])
  return matches
}
