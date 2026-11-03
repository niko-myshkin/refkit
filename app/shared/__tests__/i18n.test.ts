import { afterEach, expect, it, vi } from 'vitest'

afterEach(() => { vi.unstubAllEnvs(); vi.resetModules() })

it('с VITE_LANG=ru отдаёт русский', async () => {
  vi.stubEnv('VITE_LANG', 'ru')
  const { t } = await import('../../src/lib/i18n')
  expect(t('Приблизить')).toBe('Приблизить')
})

it('по умолчанию переводит, а без перевода оставляет русский', async () => {
  const { t } = await import('../../src/lib/i18n')
  expect(t('Приблизить')).toBe('Zoom in')
  expect(t('Нет такой строки')).toBe('Нет такой строки')
})

it('подставляет переменные', async () => {
  vi.stubEnv('VITE_LANG', 'ru')
  const { t } = await import('../../src/lib/i18n')
  expect(t('Слоёв: {n}', { n: 3 })).toBe('Слоёв: 3')
})
