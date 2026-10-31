import { useLayoutEffect, useRef, useState } from 'react'
import { t } from '@/lib/i18n'
import { MoreHorizontal, Pencil, Trash2, type LucideIcon } from 'lucide-react'
import { ChipClose, chipClassName } from '@/components/collection-chip'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from '@/components/ui/context-menu'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'

// Теги над лентой (шаг 4 grill-taxonomy.md): одна строка самых частых в текущем разделе, остальное — в «ещё» с поиском.
// Выбранный тег виден всегда. Словарь правится здесь же: правый клик по чипу или «⋯» в «ещё» — переименовать, удалить
export type TagChip = { name: string; icon: LucideIcon; count: number }
type Props = {
  tags: TagChip[]; value: string | null; onChange: (name: string | null) => void
  onRename: (from: string, to: string) => void; onDelete: (name: string) => void
}

const gap = 8

export function TagChips({ tags, value, onChange, onRename, onDelete }: Props) {
  // Частые — первыми; выбранный — в строке, даже если редкий
  const sorted = [...tags].sort((a, b) => b.count - a.count)
  const row = useRef<HTMLDivElement>(null)
  const ruler = useRef<HTMLDivElement>(null)
  const [fits, setFits] = useState(sorted.length)
  // Сколько чипов влезает в строку: меряем невидимую копию ряда, оставляем место под «ещё»
  useLayoutEffect(() => {
    const measure = () => {
      const width = row.current?.clientWidth ?? 0
      const widths = [...(ruler.current?.children ?? [])].map((child) => (child as HTMLElement).offsetWidth)
      const more = widths.pop() ?? 0
      let used = 0, count = 0
      for (const w of widths) {
        const rest = widths.length - count - 1 > 0 ? more + gap : 0
        if (used + w + rest > width) break
        used += w + gap; count++
      }
      setFits(count)
    }
    measure()
    const observer = new ResizeObserver(measure)
    if (row.current) observer.observe(row.current)
    return () => observer.disconnect()
  }, [tags])
  const shown = sorted.slice(0, fits)
  const picked = value && !shown.some((tag) => tag.name === value) ? sorted.find((tag) => tag.name === value) : undefined
  const visible = picked ? [...shown.slice(0, Math.max(0, fits - 1)), picked] : shown
  const rest = sorted.filter((tag) => !visible.includes(tag))

  const [renaming, setRenaming] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [deleting, setDeleting] = useState<TagChip | null>(null)
  const startRename = (name: string) => { setDraft(name); setRenaming(name) }
  const finishRename = () => { const to = draft.trim(); if (renaming && to && to !== renaming) onRename(renaming, to); setRenaming(null) }

  const actions = (tag: TagChip, Item: typeof ContextMenuItem | typeof DropdownMenuItem) => <>
    <Item onSelect={() => startRename(tag.name)}><Pencil />{t('Переименовать')}</Item>
    <Item variant="destructive" onSelect={() => setDeleting(tag)}><Trash2 />{t('Удалить тег')}</Item>
  </>

  return (
    <div ref={row} className="relative min-w-0 flex-1">
      {/* Невидимая копия — только для замера ширин: все чипы и «ещё» */}
      {/* Обёртка с обрезкой: иначе линейка шире ряда растягивала страницу вбок, и лента уезжала под панель */}
      <div aria-hidden className="pointer-events-none invisible absolute inset-x-0 top-0 h-0 overflow-hidden">
        <div ref={ruler} className="flex w-max gap-2">
          {sorted.map((tag) => <span key={tag.name} className={`${chipClassName} inline-flex items-center`}><tag.icon className="size-4" />{tag.name}</span>)}
          <span className={`${chipClassName} inline-flex items-center`}><MoreHorizontal className="size-4" /></span>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <ToggleGroup type="single" spacing={2} value={value ?? ''} onValueChange={(next) => onChange(next || null)} aria-label={t('Теги')} className="flex-nowrap">
          {visible.map((tag) => (
            <ContextMenu key={tag.name}>
              {/* Меню — на обёртке, не на самом чипе: триггер меню ставит data-state=closed и затирал data-state=on у
                  выбранного чипа — пропадали крестик и подсветка. display: contents — обёртка не влияет на раскладку */}
              <ContextMenuTrigger asChild>
                <span className="contents">
                  <ToggleGroupItem value={tag.name} className={chipClassName}><tag.icon />{tag.name}<ChipClose /></ToggleGroupItem>
                </span>
              </ContextMenuTrigger>
              <ContextMenuContent>{actions(tag, ContextMenuItem)}</ContextMenuContent>
            </ContextMenu>
          ))}
        </ToggleGroup>
        {rest.length > 0 && (
          <Popover>
            <PopoverTrigger asChild><Button variant="ghost" className={chipClassName} aria-label={t('Ещё теги: {n}', { n: rest.length })}><MoreHorizontal /></Button></PopoverTrigger>
            <PopoverContent align="start" className="w-72 p-0">
              <Command>
                <CommandInput aria-label={t('Найти тег')} />
                <CommandList>
                  <CommandEmpty>{t('Ничего не нашлось')}</CommandEmpty>
                  {rest.map((tag) => (
                    <CommandItem key={tag.name} value={tag.name} onSelect={() => onChange(tag.name)} className="group/tag">
                      <tag.icon />{tag.name}
                      <span className="ml-auto text-xs tabular-nums text-muted-foreground">{tag.count}</span>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild onClick={(event) => event.stopPropagation()}>
                          <Button variant="ghost" size="icon-sm" className="size-6 opacity-0 group-hover/tag:opacity-100 group-data-[selected=true]/tag:opacity-100 focus-visible:opacity-100" aria-label={t('Действия с тегом {name}', { name: tag.name })}><MoreHorizontal /></Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent side="right" align="start">{actions(tag, DropdownMenuItem)}</DropdownMenuContent>
                      </DropdownMenu>
                    </CommandItem>
                  ))}
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        )}
      </div>

      <Dialog open={renaming !== null} onOpenChange={(open) => { if (!open) setRenaming(null) }}>
        <DialogContent className="max-w-sm">
          <DialogTitle className="sr-only">{t('Переименовать тег')}</DialogTitle>
          {/* Переименование в существующий тег сливает их — сервер переносит карточки */}
          <Input autoFocus aria-label={t('Название тега')} value={draft} onChange={(event) => setDraft(event.target.value)} onFocus={(event) => event.currentTarget.select()}
            onKeyDown={(event) => { if (event.key === 'Enter') finishRename() }} />
          <Button onClick={finishRename}>{t('Сохранить')}</Button>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleting !== null} onOpenChange={(open) => { if (!open) setDeleting(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('Удалить тег «{name}»?', { name: deleting?.name })}</AlertDialogTitle>
            <AlertDialogDescription>{t('Он снимется со всех карточек: {n}. Сами карточки останутся.', { n: deleting?.count ?? 0 })}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('Отмена')}</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => { if (deleting) onDelete(deleting.name); setDeleting(null) }}>{t('Удалить')}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
