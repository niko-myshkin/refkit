import { en } from './i18n-en.ts'

// Серверная сторона: язык сборки — то же VITE_LANG, что и у клиента (демо-сервер стартует с VITE_LANG=en).
const demo = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env.VITE_LANG === 'en'

export const lang = demo ? 'en' : 'ru'

/** Как t() на клиенте: ключ — русский текст; нет перевода → русский. */
export function t(ru: string, vars?: Record<string, string | number | null | undefined>): string {
  const text = demo ? (en[ru] ?? ru) : ru
  return vars ? text.replace(/\{(\w+)\}/g, (whole, key) => key in vars ? String(vars[key] ?? '') : whole) : text
}
