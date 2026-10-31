import { useEffect, useMemo, useState } from 'react'
import { t } from '@/lib/i18n'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type { Folder } from '@/lib/library'

// Пикера эмодзи в shadcn нет — собран из Dialog, Input, Tabs и ScrollArea. Полный набор (≈1900, с русскими названиями для поиска) —
// emojibase-data, грузится только при открытии диалога. Без ✨ — знак ИИ в продукте не используем, поэтому и из полного набора он убран.
const NO_AI_SPARKLES = '✨'

// «Частые» — прежний короткий набор: открывается первым, чтобы привычное было под рукой
const favorites = [
  '💡', '📚', '🎨', '🎬', '🎵', '🎮', '🧠', '🔥', '⭐', '💼', '🛠️', '🧪',
  '📷', '🖼️', '🧩', '✏️', '📌', '🏷️', '🌿', '🌍', '🚀', '☕', '🍜', '🏠',
  '💬', '📝', '🔖', '🎯', '⚡', '🧭', '🔮', '🎲', '🪴', '🐙', '🦊', '🌙',
  '☀️', '🌈', '❤️', '😍', '🎧', '📺', '🧳', '🏆', '🔬', '📐', '🎓', '🕹️',
]

// Вкладки — по группам emojibase (индекс = group). Группа 2 («компонент») — не эмодзи, а детали составных, вкладки у неё нет.
// Подписей нет: иконка вкладки — сама группа, название в aria-label
const groups = [
  { id: 0, icon: '😀', name: t('Смайлики') }, { id: 1, icon: '🖐️', name: t('Люди') }, { id: 3, icon: '🐻', name: t('Животные и природа') },
  { id: 4, icon: '🍔', name: t('Еда и напитки') }, { id: 5, icon: '✈️', name: t('Путешествия') }, { id: 6, icon: '⚽', name: t('Досуг') },
  { id: 7, icon: '💡', name: t('Предметы') }, { id: 8, icon: '🔣', name: t('Символы') }, { id: 9, icon: '🚩', name: t('Флаги') },
]

type Emoji = { emoji: string; label: string; tags: string[]; group: number }

function useEmojiData(open: boolean) {
  const [data, setData] = useState<Emoji[] | null>(null)
  useEffect(() => {
    if (!open || data) return
    import('emojibase-data/ru/compact.json').then((module) => {
      const list = (module.default as { unicode: string; label: string; tags?: string[]; group?: number; order?: number }[])
        .filter((item) => item.group !== undefined && item.group !== 2 && item.unicode !== NO_AI_SPARKLES)
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
      setData(list.map((item) => ({ emoji: item.unicode, label: item.label, tags: item.tags ?? [], group: item.group! })))
    })
  }, [open, data])
  return data
}

// Выбор иконки space: эмодзи из набора или возврат к папке. Открывается из меню space — диалог, а не поповер, потому что у пункта меню нет якоря.
export function IconDialog({ folder, onPick, onClose }: { folder: Folder | null; onPick: (icon: string) => void; onClose: () => void }) {
  const open = folder !== null
  const data = useEmojiData(open)
  const [tab, setTab] = useState('favorites')
  const [query, setQuery] = useState('')
  useEffect(() => { if (!open) { setTab('favorites'); setQuery('') } }, [open])

  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (needle) return (data ?? []).filter((item) => item.label.includes(needle) || item.tags.some((tag) => tag.includes(needle)))
    if (tab === 'favorites') return favorites.map((emoji) => ({ emoji, label: emoji }))
    return (data ?? []).filter((item) => item.group === Number(tab))
  }, [data, tab, query])

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onClose() }}>
      <DialogContent className="gap-3 sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('Иконка space «{name}»', { name: folder?.name })}</DialogTitle>
          <DialogDescription className="sr-only">{t('Выберите эмодзи или верните папку')}</DialogDescription>
        </DialogHeader>
        <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t('Поиск')} aria-label={t('Поиск эмодзи')} />
        {!query && (
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList className="w-full">
              <TabsTrigger value="favorites" aria-label={t('Частые')}>⭐</TabsTrigger>
              {groups.map((group) => <TabsTrigger key={group.id} value={String(group.id)} aria-label={group.name}>{group.icon}</TabsTrigger>)}
            </TabsList>
          </Tabs>
        )}
        <ScrollArea className="h-72">
          <div role="listbox" aria-label={t('Эмодзи')} className="grid grid-cols-8 gap-1 pr-3">
            {shown.map((item) => (
              <Button key={item.emoji} role="option" aria-selected={folder?.icon === item.emoji} aria-label={item.label} title={item.label} variant={folder?.icon === item.emoji ? 'secondary' : 'ghost'} size="icon-lg" className="text-2xl"
                onClick={() => { onPick(item.emoji); onClose() }}>{item.emoji}</Button>
            ))}
          </div>
          {query && data && shown.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">{t('Ничего не найдено')}</p>}
        </ScrollArea>
        {folder?.icon && <Button variant="secondary" className="self-start" onClick={() => { onPick(''); onClose() }}>{t('Вернуть папку')}</Button>}
      </DialogContent>
    </Dialog>
  )
}
