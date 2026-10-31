import { t } from '@/lib/i18n'
// Общие фильтры материалов для разделов «Граф» и «Полёт»: тип («что это») и тег (подборка). Один канон — иначе два раздела разойдутся,
// когда появится новый тип материала.
export type FilterItem = { kind?: string; format?: string; collections?: string[] }

export const kindLabel = (item: FilterItem) => item.kind === 'youtube' ? t('Ролики') : item.kind === 'article' || item.kind === 'link' ? t('Статьи') : item.kind === 'note' ? t('Заметки') : item.kind === 'music' ? t('Музыка') : item.kind === 'canvas' ? t('Холсты') : item.format === 'video' ? t('Видео') : t('Картинки')

// Подходит ли материал под выбранные тип и тег (пусто — любой)
export const matchesFilters = (item: FilterItem, kind: string | null, tag: string | null) => (!kind || kindLabel(item) === kind) && (!tag || (item.collections ?? []).includes(tag))

// Варианты для выпадающих списков: типы — какие есть в наборе; теги — топ-14 по числу материалов
export function kindOptions(items: FilterItem[]) {
  const count = new Map<string, number>()
  for (const item of items) count.set(kindLabel(item), (count.get(kindLabel(item)) ?? 0) + 1)
  return [...count.keys()].map((value) => ({ value, label: value }))
}
export function tagOptions(items: FilterItem[]) {
  const count = new Map<string, number>()
  for (const item of items) for (const name of item.collections ?? []) count.set(name, (count.get(name) ?? 0) + 1)
  return [...count.entries()].sort((a, b) => b[1] - a[1]).slice(0, 14).map(([value]) => ({ value, label: value }))
}
