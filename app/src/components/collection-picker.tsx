import { useState } from 'react'
import { t } from '@/lib/i18n'
import { Plus, Tag, type LucideIcon } from 'lucide-react'
import { CollectionChip } from '@/components/collection-chip'
import { Button } from '@/components/ui/button'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

// «+» у тегов — поиск: выбрать существующий или завести новый в словарь (как метки в Linear и Notion). Один элемент на карточку и плитку.
// Слой 80 — карточка на 70; Escape закрывает только поиск
// compact — на плитке ленты (решение владельца: чипы закрывали превью): иконки подборок кружками и пунктирный «+»;
// окно раскрывается вверх, над кнопкой вся плитка. В окне сверху —
// выбранные чипами с × (onRemove), ниже тот же поиск
export function CollectionPicker({ collections, picked, onPick, onCreate, onRemove, size = 'default', compact = false }: {
  collections: Array<{ name: string; icon: LucideIcon }>; picked: string[]
  onPick: (name: string) => void; onCreate: (name: string) => Promise<void>; onRemove?: (name: string) => void
  size?: 'default' | 'sm'; compact?: boolean
}) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const query = search.trim()
  const exists = collections.some((item) => item.name.toLowerCase() === query.toLowerCase())
  const pick = (name: string) => { onPick(name); setSearch(''); if (!compact) setOpen(false) }
  return (
    <Popover open={open} onOpenChange={(next) => { setOpen(next); if (!next) setSearch('') }}>
      <PopoverTrigger asChild>
        {compact
          ? (
            // Иконки подборок кружками + пунктирный «+» (как «новая подборка» в боковой панели); всё вместе — одна кнопка.
            // Название — подсказкой на иконке (исключение из «на плитках без подсказок», решение владельца)
            <button type="button" aria-label={picked.length ? t('Теги: {join}', { join: picked.join(', ') }) : t('Добавить тег')} className="flex items-center gap-1 rounded-full outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
              {picked.map((name) => {
                const Icon = collections.find((item) => item.name === name)?.icon ?? Tag
                return (
                  <Tooltip key={name}>
                    <TooltipTrigger asChild><span className="grid size-8 place-items-center rounded-full bg-secondary text-secondary-foreground"><Icon className="size-4" /></span></TooltipTrigger>
                    <TooltipContent>{name}</TooltipContent>
                  </Tooltip>
                )
              })}
              <span className="grid size-8 place-items-center rounded-full border border-dashed border-white/60 text-white/80 hover:border-white hover:text-white"><Plus className="size-4" /></span>
            </button>
          )
          : <Button variant="ghost" size={size === 'sm' ? 'icon-sm' : 'icon'} className="bg-muted/50 text-muted-foreground" aria-label={t('Добавить тег')}><Plus /></Button>}
      </PopoverTrigger>
      <PopoverContent side={compact ? 'top' : 'bottom'} align="start" className="w-64 p-0" onEscapeKeyDown={(event) => event.stopPropagation()}>
        {compact && picked.length > 0 && (
          <div className="flex flex-wrap gap-1 border-b p-2">
            {picked.map((name) => <CollectionChip key={name} size="sm" icon={collections.find((item) => item.name === name)?.icon ?? Tag} name={name} onRemove={() => onRemove?.(name)} />)}
          </div>
        )}
        <Command>
          <CommandInput aria-label={t('Тег')} value={search} onValueChange={setSearch} />
          <CommandList>
            {!(query && !exists) && <CommandEmpty>{t('Ничего не нашлось')}</CommandEmpty>}
            <CommandGroup heading={t('Теги')}>
              {collections.filter((item) => !picked.includes(item.name)).map((item) => <CommandItem key={item.name} value={`c:${item.name}`} onSelect={() => pick(item.name)}><item.icon />{item.name}</CommandItem>)}
            </CommandGroup>
            {query && !exists && (
              <CommandGroup forceMount>
                <CommandItem forceMount value="create-collection" onSelect={() => void onCreate(query).then(() => pick(query))}><Plus />{t('Новый тег «{query}»', { query })}</CommandItem>
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
