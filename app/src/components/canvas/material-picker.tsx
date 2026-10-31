import { useEffect, useMemo, useRef, useState } from 'react'
import { t } from '@/lib/i18n'
import { Check, FolderOpen, Layers, Search, Shapes, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import type { CanvasItem } from '@/components/canvas/nodes'

// Панель «Материал из библиотеки» (разбор 02_research/teardowns/asset-picker, 2026-10-29): плавающая над холстом, холст остаётся живым.
// Сначала поиск, потом папка и тип; четыре колонки крупных превью с полными названиями; отмечаешь сколько нужно и либо жмёшь
// «Добавить (N)», либо перетаскиваешь отмеченное на холст сразу пачкой (панель на время перетаскивания гаснет, холст виден целиком).
// Двойной клик и Enter добавляют сразу; уже лежащее на холсте помечено; папку или подборку можно положить одной нодой.
type Group = { kind: 'folder' | 'board'; key: string; name: string }
type TypeId = 'all' | 'image' | 'video' | 'article' | 'note' | 'music'
const typeOf = (item: CanvasItem): Exclude<TypeId, 'all'> => item.kind === 'note' ? 'note' : item.kind === 'article' || item.kind === 'link' ? 'article' : item.kind === 'youtube' ? 'video' : item.kind === 'music' ? 'music' : 'image'
const typeLabel = (type: TypeId) => ({ all: t('Все'), image: t('Картинки'), video: t('Ролики'), article: t('Статьи'), note: t('Заметки'), music: t('Музыка') })[type]
export const CARDS_MIME = 'application/x-refkit-cards'

export function MaterialPicker({ open, items, groups, onCanvas, onClose, onAddCards, onAddGroup }: {
  open: boolean; items: CanvasItem[]; groups: Group[]; onCanvas: Set<string>
  onClose: () => void; onAddCards: (ids: string[]) => void; onAddGroup: (group: Group) => void
}) {
  const [query, setQuery] = useState('')
  const [group, setGroup] = useState('all')
  const [type, setType] = useState<TypeId>('all')
  const [picked, setPicked] = useState<string[]>([])
  const [dragging, setDragging] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const box = useRef<HTMLDivElement>(null)
  // Выделение областью: тянешь рамку по пустому месту, плитки под ней отмечаются; ⇧ или ⌘ добавляют к уже отмеченным
  const [frame, setFrame] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null)
  const base = useRef<string[]>([])
  const marquee = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || (event.target as HTMLElement).closest('[data-tile]')) return
    base.current = event.shiftKey || event.metaKey || event.ctrlKey ? picked : []
    const start = { x0: event.clientX, y0: event.clientY }
    let moved = false
    try { event.currentTarget.setPointerCapture(event.pointerId) } catch { /* без захвата: рамка всё равно считается по событиям контейнера */ }
    const host = event.currentTarget
    const move = (e: PointerEvent) => {
      if (!moved && Math.hypot(e.clientX - start.x0, e.clientY - start.y0) < 4) return
      moved = true
      const rect = { x0: Math.min(start.x0, e.clientX), y0: Math.min(start.y0, e.clientY), x1: Math.max(start.x0, e.clientX), y1: Math.max(start.y0, e.clientY) }
      setFrame(rect)
      const inside = [...host.querySelectorAll<HTMLElement>('[data-tile]')].filter((tile) => { const r = tile.getBoundingClientRect(); return r.left < rect.x1 && r.right > rect.x0 && r.top < rect.y1 && r.bottom > rect.y0 }).map((tile) => tile.dataset.tile!)
      setPicked([...new Set([...base.current, ...inside])])
    }
    const up = () => {
      host.removeEventListener('pointermove', move); host.removeEventListener('pointerup', up); host.removeEventListener('pointercancel', up)
      if (!moved && !base.current.length) setPicked([]) // клик по пустому месту снимает отметки
      setFrame(null)
    }
    host.addEventListener('pointermove', move); host.addEventListener('pointerup', up); host.addEventListener('pointercancel', up)
  }
  useEffect(() => { if (!open) { setQuery(''); setGroup('all'); setType('all'); setPicked([]); setDragging(false) } else input.current?.focus() }, [open])
  useEffect(() => {
    if (!open) return
    const on = (event: KeyboardEvent) => { if (event.key === 'Escape' && !event.defaultPrevented) { event.stopPropagation(); onClose() } }
    window.addEventListener('keydown', on, true)
    return () => window.removeEventListener('keydown', on, true)
  }, [open, onClose])
  const chosen = groups.find((item) => `${item.kind}:${item.key}` === group)
  const shown = useMemo(() => items.filter((item) => {
    if (query.trim() && !item.title.toLowerCase().includes(query.trim().toLowerCase())) return false
    if (type !== 'all' && typeOf(item) !== type) return false
    if (chosen && !(chosen.kind === 'folder' ? item.folder === chosen.key : item.boards?.includes(chosen.key))) return false
    return true
  }), [items, query, type, chosen])
  const types = useMemo(() => (['all', ...new Set(items.map(typeOf))] as TypeId[]), [items])
  const toggle = (id: string) => setPicked((list) => list.includes(id) ? list.filter((item) => item !== id) : [...list, id])
  const add = (ids: string[]) => { if (ids.length) { onAddCards(ids); onClose() } }
  if (!open) return null
  return (
    <div role="dialog" aria-label={t('Материал из библиотеки')} className={cn('fixed top-20 left-1/2 z-50 flex h-[min(680px,calc(100vh-10rem))] w-[min(900px,calc(100vw-2rem))] -translate-x-1/2 flex-col overflow-hidden rounded-container border border-line bg-popover text-popover-foreground shadow-xl transition-opacity duration-150', dragging && 'pointer-events-none opacity-0')}>
      <div className="flex flex-col gap-3 border-b border-line p-4">
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input ref={input} aria-label={t('Поиск по библиотеке')} placeholder={t('Найти материал')} value={query} onChange={(event) => setQuery(event.target.value)} className="h-10 pl-9"
              onKeyDown={(event) => { if (event.key === 'Enter' && picked.length && !event.nativeEvent.isComposing) { event.preventDefault(); add(picked) } }} />
          </div>
          <Tooltip>
            <TooltipTrigger asChild><Button variant="ghost" size="icon" aria-label={t('Закрыть')} onClick={onClose}><X /></Button></TooltipTrigger>
            <TooltipContent>{t('Закрыть')}</TooltipContent>
          </Tooltip>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={group} onValueChange={setGroup}>
            <SelectTrigger aria-label={t('Папка или подборка')} className="h-8 w-52"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('Вся библиотека')}</SelectItem>
              {(['folder', 'board'] as const).map((kind) => groups.some((item) => item.kind === kind) && (
                <SelectGroup key={kind}>
                  <SelectLabel>{kind === 'folder' ? t('Папки') : t('Подборки')}</SelectLabel>
                  {groups.filter((item) => item.kind === kind).map((item) => <SelectItem key={`${item.kind}:${item.key}`} value={`${item.kind}:${item.key}`}>{item.name}</SelectItem>)}
                </SelectGroup>
              ))}
            </SelectContent>
          </Select>
          <div className="flex flex-wrap gap-1" role="group" aria-label={t('Тип материала')}>
            {types.map((id) => (
              <button key={id} type="button" aria-pressed={type === id} onClick={() => setType(id)} className={cn('rounded-lg px-2.5 py-1 text-xs transition-colors', type === id ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground')}>{typeLabel(id)}</button>
            ))}
          </div>
        </div>
      </div>
      <div ref={box} className={cn('relative min-h-0 flex-1 overflow-y-auto p-4', frame && 'select-none')} role="listbox" aria-multiselectable aria-label={t('Материалы')} onPointerDown={marquee}>
        {shown.length === 0 ? <p className="py-16 text-center text-sm text-muted-foreground">{t('Ничего не найдено')}</p> : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {shown.map((item) => {
              const on = picked.includes(item.id)
              return (
                <button key={item.id} data-tile={item.id} type="button" role="option" aria-selected={on} title={item.title} draggable onClick={() => toggle(item.id)} onDoubleClick={() => add([item.id])}
                  onDragStart={(event) => {
                    // Тянешь отмеченный — уходит вся отметка; тянешь неотмеченный — только он
                    const ids = on ? picked : [item.id]
                    event.dataTransfer.setData(CARDS_MIME, JSON.stringify(ids))
                    if (ids.length === 1) event.dataTransfer.setData('application/x-refkit-card', ids[0])
                    event.dataTransfer.effectAllowed = 'copy'
                    requestAnimationFrame(() => setDragging(true))
                  }}
                  onDragEnd={() => setDragging(false)}
                  className={cn('group relative flex min-w-0 cursor-grab flex-col gap-2 rounded-container p-2 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing', on ? 'bg-primary/15 ring-2 ring-primary' : 'hover:bg-muted/60')}>
                  <span className="relative block aspect-4/3 overflow-hidden rounded-surface bg-muted">
                    {item.image ? <img src={item.image} alt="" draggable={false} className="absolute inset-0 size-full object-cover" /> : <span aria-hidden className="absolute inset-0 grid place-items-center text-muted-foreground"><Shapes className="size-6" /></span>}
                    {on && <span className="absolute top-2 right-2 grid size-6 place-items-center rounded-full bg-primary text-primary-foreground"><Check className="size-4" /></span>}
                    {onCanvas.has(item.id) && <span className="absolute bottom-2 left-2 rounded-md bg-background/80 px-1.5 py-0.5 text-xs backdrop-blur">{t('уже на холсте')}</span>}
                  </span>
                  <span className="flex min-w-0 flex-col">
                    <span className="line-clamp-2 text-sm leading-snug break-words">{item.title}</span>
                    <span className="text-xs text-muted-foreground">{typeLabel(typeOf(item))}</span>
                  </span>
                </button>
              )
            })}
          </div>
        )}
        {frame && box.current && (() => { const host = box.current.getBoundingClientRect(); return <span aria-hidden className="pointer-events-none absolute z-10 rounded-sm border border-primary bg-primary/10" style={{ left: frame.x0 - host.left + box.current.scrollLeft, top: frame.y0 - host.top + box.current.scrollTop, width: frame.x1 - frame.x0, height: frame.y1 - frame.y0 }} /> })()}
      </div>
      <div className="flex items-center gap-3 border-t border-line bg-card p-3">
        <span className="text-sm text-muted-foreground">{picked.length ? t('Выбрано: {n}', { n: picked.length }) : t('Отметь материалы (можно рамкой) и перетащи на холст или нажми «Добавить»')}</span>
        {picked.length > 0 && <Button variant="ghost" size="sm" onClick={() => setPicked([])}>{t('Снять отметки')}</Button>}
        {picked.length === 0 && shown.length > 1 && <Button variant="ghost" size="sm" onClick={() => setPicked(shown.map((item) => item.id))}>{t('Отметить все ({n})', { n: shown.length })}</Button>}
        {chosen && <Button variant="ghost" size="sm" onClick={() => { onAddGroup(chosen); onClose() }}>{chosen.kind === 'folder' ? <FolderOpen /> : <Layers />}{t('Всю {kind} одной нодой', { kind: chosen.kind === 'folder' ? t('папку') : t('подборку') })}</Button>}
        <Button className="ml-auto" disabled={!picked.length} onClick={() => add(picked)}>{picked.length ? t('Добавить ({n})', { n: picked.length }) : t('Добавить')}</Button>
      </div>
    </div>
  )
}
