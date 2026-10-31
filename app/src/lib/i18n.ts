import { en } from './i18n-en'

// Английский по умолчанию; русский — VITE_LANG=ru.
// Ключ — сам русский текст: нет перевода → показываем русский, ничего не ломается.
const demo = import.meta.env?.VITE_LANG !== 'ru'

export const lang = demo ? 'en' : 'ru'

/** t('Приблизить') · t('Слоёв: {n}', { n: 3 }) */
export function t(ru: string, vars?: Record<string, string | number | null | undefined>): string {
  const text = demo ? (en[ru] ?? ru) : ru
  return vars ? text.replace(/\{(\w+)\}/g, (whole, key) => key in vars ? String(vars[key] ?? '') : whole) : text
}

/** Язык для toLocaleString и подобного */
export const locale = demo ? 'en-US' : 'ru-RU'

/** Форма числительного: по-русски one/few/many (1 · 2–4 · 5+), по-английски one/many */
export function form(n: number): 'one' | 'few' | 'many' {
  if (demo) return n === 1 ? 'one' : 'many'
  const mod10 = n % 10, mod100 = n % 100
  if (mod10 === 1 && mod100 !== 11) return 'one'
  return mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14) ? 'few' : 'many'
}
