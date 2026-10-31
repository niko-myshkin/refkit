import { createPortal } from 'react-dom'
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { t, locale } from '@/lib/i18n'
import { fieldTitle } from '@/components/field-title'
import { ArrowLeft, Zap, BookmarkPlus, Copy, ChevronDown, Check, EllipsisVertical, ExternalLink, Globe, Info, Link2, Loader2, Paperclip, GripVertical, PanelRightClose, PanelRightOpen, Pin, PinOff, Tag, Trash2, X, type LucideIcon , SlidersHorizontal } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { NameButton, agentPill, nameInline } from '@/components/name-button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Progress } from '@/components/ui/progress'
import { ThinkingIndicator } from '@/components/fluid/thinking-indicator'
import { AgentError } from '@/components/agent-error'
import { Separator } from '@/components/ui/separator'
import { Island } from '@/components/ui/island'
import { ScrollArea } from '@/components/ui/scroll-area'
import { collectionsOf, tagsByMeaning } from '@/lib/collections'
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuShortcut, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Textarea } from '@/components/ui/textarea'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Dialog, DialogContent, DialogDescription, DialogOverlay, DialogPortal, DialogTitle } from '@/components/ui/dialog'
import { Checkbox } from '@/components/ui/checkbox'
import { cn, sourceHref } from '@/lib/utils'
import { ResizableHandle } from '@/components/ui/resizable'
import { AgentAnswer, CopyButton, SaveNoteButton, WorkedFor } from '@/components/agent-answer'
import { QuestionCard } from '@/components/question-card'
import { StyleSection, isToneLine, styleChanged, useStyle } from '@/components/agent-style'
import { DiffText } from '@/components/diff-text'
import type { Mark } from '@/components/image-marks'
import { memoryChanged, permissionsChanged, PermissionsFields } from '@/components/agent-memory'
import { CollectionChip } from '@/components/collection-chip'
import { CommentFeed, type CardComment } from '@/components/comment-feed'
import { PinLayer } from '@/components/pin-layer'
import { CollectionPicker } from '@/components/collection-picker'
import { SuggestionList } from '@/components/suggestion-list'
import { depthLevels, library, progressMeta, shelfName, type Action, type AgentProgress, type Depth, type Digest, type Estimate, type Kind, type ModelSettings, type Turn, type Usage, type Found } from '@/lib/library'
import { DepthControl } from './DepthControl'
import { NearList } from '@/components/near-list'

export type CardReference = {
  id: string; title: string; meaning: string; comments?: CardComment[]; createdAt?: number; describing?: boolean; ytDescription?: string; views?: number; uploaded?: string; ytInfoAt?: number; tags: string[]; collections?: string[]; collection?: string; source: string; format: 'image' | 'video'; image: string
  hasCode?: boolean; converting?: boolean; convertError?: string; codeAt?: number; sources?: string[]; focus?: string[]
  kind?: Kind; author?: string; digest?: Digest; digesting?: boolean; digestError?: string; description?: string
  media?: Array<{ image: string; ratio: string; video?: string }>
  suggestions?: string[]; thread?: Turn[]; asking?: boolean; askError?: string | null; conversation?: number
  ratio?: string; estimate?: Estimate; digestUsage?: Usage[]; embed?: string; embedRatio?: string
  boards?: string[]
  tagOffer?: { name: string; hint: string } // новый тег от агента — ждёт ✓ (идея 54)
  marks?: Mark[] // метки на картинке (№28)
}
type Patch = { title?: string; meaning?: string; description?: string; tags?: string[]; collections?: string[]; boards?: string[]; askError?: null; focus?: string[]; marks?: Mark[] }
type Props = {
  onInfo: (patch: Partial<CardReference>) => void // данные ролика подгрузились — только в состояние ленты, без записи и без даты «Изменено»
  onShown: (id: string | null) => void // карточка открыта или закрыта — нижняя панель спросит агента про неё
  pinMode: boolean; onPinMode: (on: boolean) => void // режим комментария на картинке: кнопка в нижней панели (владелец 2026-10-10), состояние — у страницы
  onDescribe: () => void // «Описать» — агент пишет описание (с учётом комментария)
  reference: CardReference
  collections: Array<{ name: string; icon: LucideIcon; hint?: string }>
  onCreateCollection: (name: string) => Promise<void>
  modelSettings?: ModelSettings
  onDepth: (depth: Depth) => void
  onModels: (models: Partial<Record<Action, string>>) => void
  media: ReactNode
  onClose: () => void
  onUpdate: (patch: Patch) => void
  onConvert: (feedback?: string) => void
  onDigest: () => void
  onStop: () => void
  onConversation: (to?: number) => void
  onRemoveSource: (id: string) => void
  progress?: AgentProgress
  onAsk: (command: string, extra?: { cards?: string[]; files?: Array<{ name: string; data: string }>; web?: 'yes' | 'no' }) => void
  onSaveFound: (at: number, index: number) => Promise<void>
  onSaveNote: (at: number) => Promise<void>
  onMakeAction: (at: number, accept: boolean) => Promise<void>
  onTagOffer: (accept: boolean) => void
  onEdit: (at: number, action: 'apply' | 'reject' | 'undo') => void
  onRemember: (at: number, accept: boolean) => Promise<void>
  // Вся библиотека — для «+ → Добавить карточку»
  library: Array<{ id: string; title: string; image: string; kind?: Kind; ratio?: string; description?: string }>
  onDelete: () => void
  // Карточка страницей (идея 61, grill-card-page.md): на месте ленты, шапка как у space — ← назад, крошки, название последним шагом
  page?: boolean
  infoSlot?: HTMLElement | null // страница-карточка: сведения живут вкладкой Info в окне агента, сюда их кладёт портал
  infoOn?: boolean; onOpenInfo?: () => void
  crumbs?: ReactNode
}

// Карточка материала (v2, каркас Fabric): открыта поверх сетки на слое 70 (ImageModal) — всплывающие окна внутри
// неё поднимаем на 80, иначе они под карточкой. Вопросы агенту — в правой панели библиотеки (onAskAgent)
function RefCard({ pinMode, onPinMode: setPinMode, reference, collections, onCreateCollection, media, onClose, onUpdate, onRemoveSource, onTagOffer, onDelete, onShown, onInfo, onDescribe, onDigest, library: items, page, crumbs, infoSlot, infoOn, onOpenInfo }: Props) {
  const note = reference.kind === 'note'
  // У заметки и статьи показываем полный текст — его и читают (владелец 2026-09-30: «статью прочитать полностью»)
  const article = reference.kind === 'article' || reference.kind === 'link'
  const readable = note || article
  // Ролик: под плеером — просмотры, дата и описание автора, как на YouTube. Добавленный раньше — подгружаем один раз
  const video = reference.kind === 'youtube'
  const [moreText, setMoreText] = useState(false)
  useEffect(() => { if (video && !reference.ytInfoAt) void library.ytInfo<CardReference>(reference.id).then(({ ytDescription, views, uploaded, ytInfoAt }) => onInfo({ ytDescription, views, uploaded, ytInfoAt })) }, [video, reference.id, reference.ytInfoAt]) // eslint-disable-line react-hooks/exhaustive-deps
  const [noteText, setNoteText] = useState('')
  // Правка заметки диффом меняет text.txt — перечитываем, когда статус правки поменялся (и без кэша браузера)
  const editStamp = (reference.thread ?? []).map((turn) => turn.edit?.target === 'note' ? turn.edit.status : '').join()
  useEffect(() => { if (readable) fetch(`/library/${reference.id}/text.txt?t=${Date.now()}`).then((response) => response.text()).then(setNoteText).catch(() => setNoteText('')) }, [readable, reference.id, editStamp])
  // Каждое открытие карточки считается — эксперимент «выжимка сразу или по кнопке» (grill-everything.md)
  // Флаг в useRef: в режиме разработки React запускает эффект дважды, без флага одно открытие считалось бы за два.
  // Открыта — говорим ленте, чтобы агент из нижней панели спрашивал про эту карточку
  useEffect(() => { onShown(reference.id); return () => onShown(null) }, [reference.id]) // eslint-disable-line react-hooks/exhaustive-deps
  const counted = useRef(false)
  useEffect(() => { if (counted.current) return; counted.current = true; void library.opened(reference.id) }, [reference.id])
  const [title, setTitle] = useState(reference.title)
  // Название пришло с сервера (синтез, сортировка) — поле подхватывает его, если владелец его не правил
  const shownTitle = useRef(reference.title)
  useEffect(() => {
    if (reference.title !== shownTitle.current) { setTitle((old) => old === shownTitle.current ? reference.title : old); shownTitle.current = reference.title }
  }, [reference.title])
  // Заметка-набор (полка, разбор полки): материалы — из библиотеки по sources; галочка — фокус агента
  const sources = (reference.sources ?? []).map((id) => items.find((item) => item.id === id)).filter((item): item is Props['library'][number] => Boolean(item))
  const isSet = (reference.sources?.length ?? 0) > 0
  const focus = (reference.focus ?? []).filter((id) => sources.some((item) => item.id === id))
  // Комментарии пишет сервер (лента + зеркало meaning); ответ — в состояние ленты без второй записи
  // Лента комментариев; старые метки на картинке (идея 28) показываются в ней же, с точкой — сервер перенесёт их при первой записи
  const comments: CardComment[] = [
    ...(reference.comments ?? (reference.meaning ? [{ id: 'c0', text: reference.meaning, at: reference.createdAt ?? 0 }] : [])),
    ...(reference.marks ?? []).filter((mark) => mark.text?.trim() && !reference.comments?.some((item) => item.id === mark.id)).map((mark) => ({ id: mark.id, text: mark.text, at: mark.at, x: mark.x, y: mark.y })),
  ]
  const [hoverPin, setHoverPin] = useState<string | null>(null)
  // C — режим комментария (как в Figma), только у картинки и не в поле; Esc выходит из режима, а не закрывает карточку
  const canPin = !reference.kind && reference.format === 'image' && Boolean(reference.image)
  useEffect(() => {
    if (!canPin) return
    const onKey = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLElement && event.target.closest('input, textarea, [contenteditable="true"]')) return
      if (event.key === 'Escape' && pinMode) { event.preventDefault(); event.stopPropagation(); setPinMode(false); return }
      if ((event.key === 'c' || event.key === 'с') && !event.metaKey && !event.ctrlKey && !event.altKey) { event.preventDefault(); setPinMode(!pinMode) }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [canPin, pinMode])
  const comment = (body: Parameters<typeof library.comment>[1]) => library.comment(reference.id, body).then((saved) => onInfo({ comments: saved.comments, meaning: saved.meaning }))
  const toggleFocus = (id: string) => onUpdate({ focus: focus.includes(id) ? focus.filter((item) => item !== id) : [...focus, id] })
  const [picked, setPicked] = useState<string[]>(collectionsOf(reference))
  // Автосохранение: правка уходит в meta.json рефа через паузу. Открытие карточки без правок ничего не пишет.
  useEffect(() => {
    const patch = { title: title.trim() || reference.title, collections: picked }
    const same = (a: string[], b: string[]) => a.join('\u0000') === b.join('\u0000')
    if (patch.title === reference.title && same(patch.collections, collectionsOf(reference))) return
    const timer = setTimeout(() => onUpdate(patch), 600)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, picked])
  // Масштаб картинки (как просмотр у Fabric, идея из пинов): null — вписана в окно; иначе доля настоящего размера.
  // ⌘ или Ctrl + колесо (щипок на тачпаде), как в Figma, и ⌘+ / ⌘− меняют масштаб, клик по процентам — снова вписать
  const zoomable = !reference.kind && reference.format === 'image' && Boolean(reference.image) && (reference.media?.length ?? 0) < 2 // у альбома — лента, масштаба нет
  // Панель сведений: сворачивается кнопкой в шапке (по краю не кликаем), выбор запоминается; пока выбора нет — на окне уже 1100 px свёрнута сама
  const root = useRef<HTMLDivElement>(null)
  const [wide, setWide] = useState(true)
  const [infoChoice, setInfoChoice] = useState<'open' | 'closed' | null>(() => { try { const saved = localStorage.getItem('refkit.card.info'); return saved === 'open' || saved === 'closed' ? saved : null } catch { return null } })
  useEffect(() => {
    const node = root.current
    if (!node) return
    const watch = new ResizeObserver(() => { setWide(node.clientWidth >= 1100); setNarrow(node.clientWidth < 720) })
    watch.observe(node); setWide(node.clientWidth >= 1100); setNarrow(node.clientWidth < 720)
    return () => watch.disconnect()
  }, [])
  // Тесная карточка (агент рядом, узкое окно): сведения свёрнуты в кнопку у края и раскрываются поверх материала; выбор не запоминается
  const [narrow, setNarrow] = useState(false)
  const [peek, setPeek] = useState(false)
  const infoOpen = narrow ? peek : infoChoice ? infoChoice === 'open' : wide
  const toggleInfo = () => { if (narrow) { setPeek(!peek); return } const next = infoOpen ? 'closed' : 'open'; setInfoChoice(next); try { localStorage.setItem('refkit.card.info', next) } catch { /* без памяти браузера работает так же */ } }
  const [zoom, setZoom] = useState<number | null>(null)
  // Сдвиг вписанной картинки (владелец 2026-10-29, как на холсте): пробел + перетаскивание или средняя кнопка; приблизили — дальше двигает прокрутка
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const panDrag = useRef<{ x: number; y: number; px: number; py: number; moved: boolean } | null>(null)
  useEffect(() => { setPan({ x: 0, y: 0 }) }, [zoom, reference.id])
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null)
  const frame = useRef<HTMLDivElement>(null)
  useEffect(() => { if (!zoomable) return; const img = new Image(); img.onload = () => setNatural({ w: img.naturalWidth, h: img.naturalHeight }); img.src = reference.image }, [zoomable, reference.image])
  const stage = Boolean(page && zoomable) // картинка-страница: материал на всё поле под островами; поля сверху 64, снизу 80, по бокам 8
  const fit = natural && frame.current ? Math.min(1, (frame.current.clientWidth - (stage ? 16 : 0)) / natural.w, (frame.current.clientHeight - (stage ? 144 : 0)) / natural.h) : 1
  const scale = zoom ?? fit
  const zoomBy = (step: number) => setZoom(Math.min(8, Math.max(0.1, Math.round(scale * step * 100) / 100)))
  // Как на холсте: колесо — масштаб к курсору, перетаскивание — сдвиг. Точка под курсором остаётся на месте:
  // до смены масштаба запоминаем, какая точка картинки (в её пикселях) под курсором, после — подкручиваем прокрутку
  const scroller = useRef<HTMLDivElement>(null)
  const anchor = useRef<{ u: number; v: number; x: number; y: number } | null>(null)
  const zoomAt = (event: { clientX: number; clientY: number }, step: number) => {
    const box = frame.current?.getBoundingClientRect()
    if (!box || !natural) return
    const x = event.clientX - box.left
    const y = event.clientY - box.top
    const view = scroller.current
    if (view) {
      const offX = Math.max(0, (view.clientWidth - (natural.w * scale + 48)) / 2)
      const offY = Math.max(0, (view.clientHeight - (natural.h * scale + 48)) / 2)
      anchor.current = { u: (view.scrollLeft + x - 24 - offX) / scale, v: (view.scrollTop + y - 24 - offY) / scale, x, y }
    } else {
      // вписанный вид: картинка по центру рамки
      const offX = (box.width - natural.w * scale) / 2
      const offY = (box.height - natural.h * scale) / 2
      anchor.current = { u: (x - offX) / scale, v: (y - offY) / scale, x, y }
    }
    setZoom(Math.min(8, Math.max(0.1, Math.round(scale * step * 100) / 100)))
  }
  useLayoutEffect(() => {
    const view = scroller.current
    const hold = anchor.current
    anchor.current = null
    if (!view || !hold || !natural || zoom === null) return
    const offX = Math.max(0, (view.clientWidth - (natural.w * zoom + 48)) / 2)
    const pad = stage ? 128 : 48, offY = Math.max(0, (view.clientHeight - (natural.h * zoom + pad)) / 2)
    view.scrollLeft = hold.u * zoom + 24 + offX - hold.x
    view.scrollTop = hold.v * zoom + pad / 2 + offY - hold.y
  }, [zoom, natural, stage])
  useEffect(() => {
    const node = frame.current
    if (!zoomable || !node) return
    const onWheel = (event: WheelEvent) => { event.preventDefault(); if (spaceHeld.current) { if (scroller.current) { scroller.current.scrollLeft += event.deltaX; scroller.current.scrollTop += event.deltaY } else setPan((value) => ({ x: value.x - event.deltaX, y: value.y - event.deltaY })); return } zoomAt(event, Math.exp(-event.deltaY * (event.ctrlKey ? 0.01 : 0.0025))) }
    node.addEventListener('wheel', onWheel, { passive: false })
    return () => node.removeEventListener('wheel', onWheel)
  })
  const drag = useRef<{ x: number; y: number; left: number; top: number } | null>(null)
  // Пробел зажат — как в Figma: курсор-рука, колесо двигает картинку вверх-вниз, а не масштабирует
  const spaceHeld = useRef(false)
  const [space, setSpace] = useState(false)
  useEffect(() => {
    if (!zoomable) return
    const typing = (event: KeyboardEvent) => event.target instanceof HTMLElement && Boolean(event.target.closest('input, textarea, [contenteditable="true"]'))
    const down = (event: KeyboardEvent) => { if (event.code !== 'Space' || typing(event)) return; event.preventDefault(); spaceHeld.current = true; setSpace(true) }
    const up = (event: KeyboardEvent) => { if (event.code !== 'Space') return; spaceHeld.current = false; setSpace(false) }
    // На macOS пока зажат ⌘, keyup пробела не приходит — сбрасываем пробел, когда отпустили ⌘ или окно потеряло фокус
    const reset = (event?: KeyboardEvent) => { if (event && event.key !== 'Meta' && event.key !== 'Control') return; spaceHeld.current = false; setSpace(false) }
    window.addEventListener('keydown', down); window.addEventListener('keyup', up); window.addEventListener('keyup', reset); const onBlur = () => reset(); window.addEventListener('blur', onBlur)
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); window.removeEventListener('keyup', reset); window.removeEventListener('blur', onBlur) }
  }, [zoomable])
  useEffect(() => {
    if (!zoomable) return
    const onKey = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey)) return
      if (event.key === '=' || event.key === '+') { event.preventDefault(); zoomBy(1.25) }
      if (event.key === '-') { event.preventDefault(); zoomBy(0.8) }
      if (event.key === '0') { event.preventDefault(); setZoom(1) } // как в Figma: ⌘0 — 100%
    }
    // ⇧1 — вписать в окно (как в Figma); не в поле ввода
    const onFit = (event: KeyboardEvent) => { if (event.shiftKey && event.code === 'Digit1' && !(event.target instanceof HTMLElement && event.target.closest('input, textarea, [contenteditable="true"]'))) { event.preventDefault(); setZoom(null) } }
    window.addEventListener('keydown', onFit)
    const offFit = () => window.removeEventListener('keydown', onFit)
    window.addEventListener('keydown', onKey)
    return () => { window.removeEventListener('keydown', onKey); offFit() }
  })
  // Полка — подборка «Под рукой» (grill-taxonomy.md)
  const shelved = Boolean(reference.boards?.includes(shelfName))
  const iconFor = (name: string) => collections.find((item) => item.name === name)?.icon ?? Tag
  const pickCollection = (name: string) => setPicked((list) => list.includes(name) ? list : [...list, name])

  // У закладки с плеером — пропорции плеера (Spotify — высокий, обложка + треки), а не обложки
  const ratio = reference.kind === 'youtube' ? '16 / 9' : reference.embed && reference.embedRatio ? reference.embedRatio : reference.ratio || '4 / 3'
  // Под исходником — только подборки (решение владельца): описания и текста статьи нет, свободные теги не показываем —
  // по ним не раскладываем, они остаются в данных для поиска
  // Чипы — те же, что фильтры над лентой (CollectionChip): включённые, нажатие снимает подборку
  // Пустой карточке — до 3 тегов словаря по смыслу, как подсказки в окне добавления: без модели, порог «2+ совпадения слов»
  // (grill-card-tag-chips.md); нечего предложить — чипов нет. Клик ставит тег
  const suggested = picked.length || reference.tagOffer ? [] : tagsByMeaning(`${reference.title} ${reference.description ?? ''} ${(reference.tags ?? []).join(' ')}`, collections.map((item) => ({ name: item.name, hint: item.hint ?? '', types: [] })), 2).slice(0, 3)
  const collectionsRow = (
    <div className="flex flex-wrap items-center gap-2" role="group" aria-label={t('Теги и подборки')}>
      {picked.map((name) => <CollectionChip key={`collection-${name}`} icon={iconFor(name)} name={name} onRemove={() => setPicked((list) => list.filter((item) => item !== name))} />)}
      {/* Агент предложил новый тег, словаря он ещё не касался (идея 54): ✓ — в словарь и сюда, × — забыть */}
      {reference.tagOffer && (
        <span className="flex items-center gap-1 rounded-lg border border-dashed border-line py-0.5 pl-3 pr-1 text-sm">
          <span className="text-muted-foreground">{t('Новый тег')}</span>{reference.tagOffer.name}
          <Button variant="ghost" size="icon-xs" aria-label={t('Добавить тег «{name}» в словарь', { name: reference.tagOffer.name })} onClick={() => onTagOffer(true)}><Check /></Button>
          <Button variant="ghost" size="icon-xs" aria-label={t('Не добавлять тег')} onClick={() => onTagOffer(false)}><X /></Button>
        </span>
      )}
      {suggested.map((name) => <button key={name} type="button" aria-label={t('Поставить тег «{name}»', { name })} className="rounded-lg border border-dashed border-line px-2.5 py-0.5 text-xs text-muted-foreground transition-colors hover:border-solid hover:bg-muted hover:text-foreground" onClick={() => pickCollection(name)}>{name}</button>)}
      <CollectionPicker collections={collections} picked={picked} onPick={pickCollection} onCreate={onCreateCollection} />
    </div>
  )
  // Название — обычный заголовок, без поля. Клик по нему включает правку (появляется поле): Enter или клик мимо — сохранить, Esc — вернуть
  const [editingTitle, setEditingTitle] = useState(false)
  const titleField = editingTitle ? (
    <Input
      autoFocus aria-label={t('Название')} value={title}
      onChange={(event) => setTitle(event.target.value)} onFocus={(event) => event.currentTarget.select()} onBlur={() => setEditingTitle(false)}
      onKeyDown={(event) => {
        if (event.key === 'Enter') event.currentTarget.blur()
        if (event.key === 'Escape') { event.stopPropagation(); setTitle(reference.title); event.currentTarget.blur() }
      }}
      className={page ? 'h-8 w-auto min-w-24 py-1 text-sm font-medium field-sizing-content md:text-sm' : 'h-auto py-1 text-xl font-semibold md:text-xl'}
    />
  ) : (
    <div className={page ? 'group flex min-w-0 items-center gap-2' : 'group relative w-fit max-w-[calc(100%-2.5rem)]'}>
    <h2 className={page ? 'truncate px-1.5 py-1 text-sm font-medium' : 'truncate px-1 py-1 text-xl font-semibold'}><button type="button" aria-label={t('Переименовать: {title}', { title })} className={cn('max-w-full cursor-text truncate text-left outline-none focus-visible:underline', page && 'min-h-6 leading-6')} onClick={() => setEditingTitle(true)}>{title}</button></h2>
    {/* На карточке-странице «Назвать за меня» нет (владелец 2026-10-03): в шапке ей не место, наезжала на масштаб */}
    {!page && <NameButton className={nameInline} current={title} suggest={() => library.suggestName(reference.id)} onName={setTitle} />}
    </div>
  )

  // v2 (каркас Fabric): карточка — шапка, вкладки «Материал · Суть · Сведения», внизу кнопка агента.
  // Агент один — правая панель библиотеки; из карточки открывается с этим материалом в контексте (grill-minimal.md)
  const sourceUrl = /^https?:\/\//.test(reference.source) ? reference.source : ''
  const infoPanel = (
    <>
          <ScrollArea className="min-h-0 flex-1 [&_[data-slot=scroll-area-viewport]>div]:!block">
            <div className={cn('flex flex-col gap-5 pt-4 pb-4 pl-4', page ? 'pr-4' : 'pr-4')}>
              <InfoField label={t('Описание')} value={reference.description ?? ''} onSave={(description) => onUpdate({ description })}
                action={<span className="flex items-center gap-1"><Button variant="outline" size="xs" className={agentPill} aria-label={reference.description ? t('Переписать описание — агент учтёт комментарий') : t('Описать — агент учтёт комментарий')} disabled={Boolean(reference.describing || reference.digesting)} onClick={onDescribe}>
                  {/* Та же кнопка агента, что «Назвать за меня» (как у Fabric) */}
                  {reference.describing || reference.digesting ? <Loader2 className="animate-spin" /> : <Zap />}{reference.description ? t('Переписать') : t('Описать')}
                </Button>
                  {!page && <DropdownMenu>
                    <Tooltip><TooltipTrigger asChild><DropdownMenuTrigger asChild><Button variant="ghost" size="icon-xs" aria-label={t('Режим окна')}><GripVertical /></Button></DropdownMenuTrigger></TooltipTrigger><TooltipContent>{t('Режим окна')}</TooltipContent></Tooltip>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onSelect={toggleInfo}><PanelRightClose />{t('Свернуть')}</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>}</span>} />
              <DigestBlock reference={reference} onDigest={onDigest} onCard={(id) => { window.location.hash = `#/card/${id}` }} />
              <section className="flex flex-col gap-2">
                <h3 className={fieldTitle}>{t('Теги')}</h3>
                {collectionsRow}
              </section>
              {/* Рядом — материалы с общими понятиями графа; без графа или соседей строки нет */}
              <NearList id={reference.id} items={items} onOpen={(id) => { window.location.hash = `#/card/${id}` }} />
              {/* Комментарии — под тегами (владелец 2026-10-03): сначала что это, потом заметки */}
              <CommentFeed comments={comments} hovered={hoverPin} onHover={setHoverPin}
                onAdd={(text) => void comment({ op: 'add', text })} onEdit={(id, text) => void comment({ op: 'edit', id, text })} onRemove={(id) => void comment({ op: 'remove', id })} />
              {/* Источник — таким же полем, как описание и теги: заголовок сверху, ссылка под ним (в строке с подписью она вылезала за колонку) */}
              {sourceUrl && (
                <section className="flex min-w-0 flex-col gap-2">
                  <h3 className={fieldTitle}>{t('Источник')}</h3>
                  <a href={sourceHref(sourceUrl)} target="_blank" rel="noreferrer" className="block truncate text-xs underline-offset-4 hover:underline">{sourceUrl}</a>
                  {/* Ролик: просмотры и описание автора — здесь, свёрнуто; под плеером остаётся суть (скептик 2026-10-14: промо автора стояло выше выжимки) */}
                  {(reference.views || reference.uploaded) && (
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {reference.views ? t('{n} просмотров', { n: reference.views.toLocaleString(locale) }) : ''}{reference.views && reference.uploaded ? ' · ' : ''}
                      {reference.uploaded ? new Date(reference.uploaded).toLocaleDateString(locale, { day: 'numeric', month: 'long', year: 'numeric' }) : ''}
                    </span>
                  )}
                  {reference.ytDescription && <>
                    <button type="button" aria-expanded={moreText} className="self-start text-xs font-medium text-muted-foreground hover:text-foreground" onClick={() => setMoreText(!moreText)}>{moreText ? t('Скрыть описание автора') : t('Описание автора')}</button>
                    {moreText && <p className="whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">{linkify(reference.ytDescription)}</p>}
                  </>}
                </section>
              )}
            </div>
          </ScrollArea>
            </>
  )
  return (
    <div ref={root} className={page ? '@container relative flex min-h-0 flex-1 flex-col text-foreground animate-in fade-in duration-200 motion-reduce:animate-none' : 'pointer-events-auto relative flex h-[min(860px,94vh)] w-[min(1280px,calc(94vw-var(--agent-w,0px)))] flex-col rounded-container border bg-card text-card-foreground shadow-lg'}
      style={page ? undefined : { marginRight: 'var(--agent-w, 0px)' }}>
      {page ? (
        // Страница-карточка: материал на всё поле, поверх него острова — название, действия, масштаб, сведения (макет 2026-10-29)
        <header className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start justify-between gap-2 px-(--canvas-gutter) pt-4">
          <Island className="min-h-10 max-w-[60%] min-w-0 gap-0">
            <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" aria-label={t('Назад')} onClick={onClose}><ArrowLeft /></Button></TooltipTrigger><TooltipContent>{t('Назад')}</TooltipContent></Tooltip>
            <div className="flex min-w-0 flex-1 items-center gap-1 text-sm">
              <span className="flex min-w-0 shrink items-center gap-1 overflow-hidden @max-[480px]:hidden">{crumbs}<span className="text-muted-foreground">/</span></span>
              <div className="min-w-0 flex-1">{titleField}</div>
            </div>
          </Island>
          <Island className="[&_button]:size-8">
            {!infoOn && <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" aria-label={t('Показать сведения')} onClick={() => onOpenInfo?.()}><Info /></Button></TooltipTrigger><TooltipContent>{t('Показать сведения')}</TooltipContent></Tooltip>}
            <AgentCopyButton id={reference.id} title={title} />
            <CardMenu onDelete={() => { onDelete(); onClose() }} shelved={shelved} onShelf={() => onUpdate({ boards: shelved ? (reference.boards ?? []).filter((name) => name !== shelfName) : [...(reference.boards ?? []), shelfName] })} source={sourceUrl} />
            <Button variant="ghost" size="icon" aria-label={t('Закрыть')} onClick={onClose}><X /></Button>
          </Island>
        </header>
      ) : (      <header className={page ? 'relative flex h-12 shrink-0 items-center gap-2 px-(--canvas-gutter)' : 'relative flex items-center gap-3 border-b px-4 py-2.5'}>
        {page && <Button variant="ghost" size="icon-sm" className="-ml-2.5" aria-label={t('Назад')} onClick={onClose}><ArrowLeft /></Button>}
        {page ? (
          <div className="flex min-w-0 flex-1 items-center gap-1.5 text-sm">
            {/* Узкая страница (колонки друг под другом): крошек нет — их ужимало до «В…» и съедало название; назад ведёт ← (аудит 2026-10-13) */}
            <span className="contents @max-[720px]:hidden">
              {crumbs}
              <span className="text-muted-foreground">/</span>
            </span>
            <div className="min-w-0 flex-1">{titleField}</div>
          </div>
        ) : (
        <div className={cn('min-w-0 flex-1', zoomable && 'max-w-[calc(50%-5rem)]')}>
          {titleField}
          {sourceUrl && <a href={sourceHref(sourceUrl)} target="_blank" rel="noreferrer" className="block truncate px-1 caption hover:text-foreground">{sourceUrl}</a>}
        </div>
        )}
        {zoomable && (
          // На странице масштаб справа, в ряду действий: по центру он наезжал на крошки в узкой странице
          // Масштаб как в Figma (владелец 2026-10-03): одна кнопка «23% ⌄», в меню — поле процентов и список действий
          <div className={page ? 'flex shrink-0 items-center gap-1 @max-[720px]:hidden' : 'absolute left-1/2 flex -translate-x-1/2 items-center gap-1'}>
            <ZoomMenu scale={scale} onZoom={setZoom} onStep={zoomBy} />
          </div>
        )}
        {zoomable && !page && <span className="flex-1" />}
        <AgentCopyButton id={reference.id} title={title} />
        <CardMenu onDelete={() => { onDelete(); onClose() }} shelved={shelved} onShelf={() => onUpdate({ boards: shelved ? (reference.boards ?? []).filter((name) => name !== shelfName) : [...(reference.boards ?? []), shelfName] })} source={sourceUrl} />
        {/* Крестик и на странице (владелец 2026-10-03) — то же, что ← и Esc */}
        <Button variant="ghost" size="icon-sm" className={page ? '-mr-2.5' : undefined} aria-label={t('Закрыть')} onClick={onClose}><X className={page ? 'size-5' : undefined} /></Button>
      </header>)}
      {page && zoomable && <Island className="absolute bottom-2 z-20 [&_button]:h-8" style={{ right: 'calc(var(--agent-overlay-w, 0px) + 8px)' }}><ZoomMenu scale={scale} onZoom={setZoom} onStep={zoomBy} /></Island>}

      {/* Две колонки (владелец 2026-10-01): слева материал, справа сведения — описание, теги, комментарии, источник.
          Страница уже 720 px (агент справа, узкое окно) — колонки друг под другом, прокручивается вся страница (grill-card-page.md) */}
      <div className="relative flex min-h-0 flex-1">
        <div className="relative flex min-h-0 min-w-0 flex-1 flex-col" style={page && !zoomable ? { paddingTop: 56 } : undefined}>
          {!page && !infoOpen && <Button variant="outline" size="icon-sm" className="absolute top-2 right-2 z-20 rounded-lg bg-card shadow-sm" aria-label={t('Показать сведения')} onClick={toggleInfo}><PanelRightOpen /></Button>}
          <div className="flex min-h-0 flex-1 flex-col">
            {/* Пост-альбом (владелец 2026-10-02): все файлы лентой друг под другом, видео — с плеером */}
            {(reference.media?.length ?? 0) > 1 ? (
              <ScrollArea className="min-h-0 flex-1 [&_[data-slot=scroll-area-viewport]>div]:!block">
                <div className={cn('mx-auto flex max-w-3xl flex-col gap-4 px-(--canvas-gutter) pt-6 pb-24', page && '@max-[720px]:pb-6')} role="list" aria-label={t('Файлы поста')}>
                  {reference.media!.map((item) => (
                    <div key={item.image} role="listitem" className="relative w-full overflow-hidden rounded-surface" style={{ aspectRatio: item.ratio }}>
                      {item.video
                        ? <video src={item.video} poster={item.image} controls muted loop playsInline className="absolute inset-0 h-full w-full object-contain" />
                        : <img src={item.image} alt="" className="absolute inset-0 h-full w-full object-contain" />}
                    </div>
                  ))}
                </div>
              </ScrollArea>
            ) : video ? (
              <ScrollArea className="min-h-0 flex-1 [&_[data-slot=scroll-area-viewport]>div]:!block">
                <div className={cn('mx-auto flex max-w-3xl flex-col gap-4 px-(--canvas-gutter) pt-6 pb-24', page && '@max-[720px]:pb-6')}>
                  <div className="relative w-full shrink-0 overflow-hidden rounded-surface" style={{ aspectRatio: ratio }}>{media}</div>
                </div>
              </ScrollArea>
            ) : readable ? (
              <ScrollArea className="min-h-0 flex-1 [&_[data-slot=scroll-area-viewport]>div]:!block">
                <div className={cn('mx-auto flex max-w-3xl flex-col gap-5 px-(--canvas-gutter) pt-6 pb-24', page && '@max-[720px]:pb-6')}>
                  {isSet ? (
                    <>
                      <div className="relative size-0 overflow-hidden">{media}</div>
                      <div className="gap-3" style={{ columnCount: Math.min(Math.max(sources.length, 1), 3) }} role="list" aria-label={t('Материалы набора')}>
                        {sources.map((item) => {
                          const focused = focus.includes(item.id)
                          return (
                            <div key={item.id} role="listitem" className={cn('group relative mb-3 break-inside-avoid overflow-hidden rounded-surface transition-opacity', focus.length > 0 && !focused && 'opacity-40')} style={item.image ? { aspectRatio: item.ratio || '4 / 3' } : undefined}>
                              {item.image
                                ? <img src={item.image} alt={item.title} className="absolute inset-0 h-full w-full object-cover" />
                                : <div className="flex flex-col gap-2 border bg-card p-4 pt-10"><span className="line-clamp-2 text-sm font-medium">{item.title}</span>{item.description && <span className="line-clamp-4 text-xs leading-relaxed text-muted-foreground">{item.description}</span>}</div>}
                              <Checkbox checked={focused} onCheckedChange={() => toggleFocus(item.id)} aria-label={t('Агенту смотреть «{title}»', { title: item.title })}
                                className={cn('absolute left-2 top-2 bg-background/80 transition-opacity', !focused && 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100')} />
                              <Button variant="secondary" size="icon-xs" aria-label={t('Убрать «{title}» из набора', { title: item.title })} className="absolute right-1.5 top-1.5 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100" onClick={() => onRemoveSource(item.id)}><X /></Button>
                            </div>
                          )
                        })}
                      </div>
                    </>
                  ) : (
                    <>
                      {/* Обложка — только у статьи с картинкой; лист-заметка на своей странице повторял название и описание (скептик 2026-10-14) */}
                      {article && reference.image && <div className="relative w-full shrink-0 overflow-hidden rounded-surface" style={{ aspectRatio: ratio }}>{media}</div>}
                      {/* Заметку написал агент (разметка, ссылки на карточки) — как ответ агента: ссылки кликаются, без сырых ** и [](card:) */}
                      {noteText.trim() && (/\]\(card:|\*\*|^#{1,3} /m.test(noteText)
                        ? <AgentAnswer text={noteText.trim()} onCard={(id) => { window.location.hash = `#/card/${id}` }} />
                        : <p className="whitespace-pre-wrap text-body">{linkify(noteText.trim())}</p>)}
                    </>
                  )}
                </div>
              </ScrollArea>
            ) : (
              // Превью по центру в рамке, вписано в высоту (как у Fabric); под ним — описание
              <div ref={frame}
                onMouseDown={(event) => { if (event.button === 1) event.preventDefault() }}
                onPointerDown={(event) => { if (zoom !== null || !zoomable || !(event.button === 1 || (event.button === 0 && spaceHeld.current))) return; event.preventDefault(); panDrag.current = { x: event.clientX, y: event.clientY, px: pan.x, py: pan.y, moved: false }; event.currentTarget.setPointerCapture(event.pointerId) }}
                onPointerMove={(event) => { const d = panDrag.current; if (!d) return; d.moved = true; setPan({ x: d.px + event.clientX - d.x, y: d.py + event.clientY - d.y }) }}
                onPointerUp={() => { if (panDrag.current?.moved) window.setTimeout(() => { panDrag.current = null }, 0); else panDrag.current = null }} onPointerCancel={() => { panDrag.current = null }}
                onClickCapture={(event) => { if (panDrag.current?.moved) event.stopPropagation() }}
                className={cn('relative flex min-h-0 flex-1 flex-col items-center gap-4', space && zoom === null && 'cursor-grab', stage ? 'px-(--canvas-gutter) pt-16 pb-20 [--media-reserve:0px]' : 'px-(--canvas-gutter) pt-6 pb-24', page && !stage && '@max-[720px]:flex-none @max-[720px]:aspect-(--card-ratio) @max-[720px]:max-h-[70svh] @max-[720px]:pb-6 @max-[720px]:[--media-reserve:16px]')} style={{ containerType: 'size', '--card-ratio': ratio } as React.CSSProperties}>
                {/* Приближено — картинка в настоящем размере × масштаб, прокручивается; вписанный вид остаётся смонтированным */}
                {zoom !== null && natural && (
                  <div ref={scroller} className={cn('absolute inset-0 z-10 overflow-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden', space ? 'cursor-grab active:cursor-grabbing' : 'cursor-grab', page ? 'bg-background' : 'bg-card')}
                    onMouseDown={(event) => { if (event.button === 1) event.preventDefault() }} onPointerDown={(event) => { if (event.button !== 0 && event.button !== 1) return; drag.current = { x: event.clientX, y: event.clientY, left: event.currentTarget.scrollLeft, top: event.currentTarget.scrollTop }; event.currentTarget.setPointerCapture(event.pointerId) }}
                    onPointerMove={(event) => { const d = drag.current; if (!d) return; event.currentTarget.scrollLeft = d.left - (event.clientX - d.x); event.currentTarget.scrollTop = d.top - (event.clientY - d.y) }}
                    onPointerUp={() => { drag.current = null }} onPointerCancel={() => { drag.current = null }}>
                    <div className={cn('flex min-h-full min-w-full items-center justify-center', stage ? 'px-6 py-16' : 'p-6')} style={{ width: natural.w * zoom + 48, height: natural.h * zoom + (stage ? 128 : 48) }}>
                      <img src={reference.image} alt={reference.title} draggable={false} style={{ width: natural.w * zoom, height: natural.h * zoom }} className="max-w-none select-none" />
                    </div>
                  </div>
                )}
                <div className={page ? (stage ? 'rounded-container' : '-mx-2 rounded-container p-2 ring-1 ring-border') : 'rounded-container border p-2.5'} style={pan.x || pan.y ? { transform: `translate(${pan.x}px, ${pan.y}px)` } : undefined}>
                  <div className={cn('relative rounded-surface', !page && 'overflow-hidden')} style={{ aspectRatio: ratio, width: `min(calc(100cqw - ${page ? 0 : 22}px), calc((100cqh - var(--media-reserve, 120px)) * (${ratio})))` }}>
                    {media}
                    {/* Комментарии точкой на картинке, как в Figma (владелец 2026-10-03): C или кнопка в шапке — режим, клик — точка и поле */}
                    <PinLayer comments={comments} active={pinMode} onHover={setHoverPin}
                      onSave={(text, x, y) => { void comment({ op: 'add', text, x, y }); setPinMode(false) }} onCancel={() => setPinMode(false)} />
                  </div>
                </div>
                </div>
            )}
          </div>
        </div>
        {!page && infoOpen && <aside aria-label={t('Сведения')} className="relative m-2 ml-0 flex w-[min(360px,40%)] shrink-0 flex-col overflow-hidden rounded-container bg-card ring-1 ring-foreground/10">{infoPanel}</aside>}
        {page && infoSlot && createPortal(<div className="flex min-h-0 flex-1 flex-col">{infoPanel}</div>, infoSlot)}
      </div>
    </div>
  )
}

export type Hint = { text: string; run: () => void }
// Лента агента: просьба — плашкой, ответ — обычным текстом, новое снизу. Пустая — подсказки посередине;
// с ответами — подсказки под последним, прямо над полем. Выжимка (via: 'digest') — такой же ответ, «Заново» — в строке действий под ответом
// extra — что показать под ответом (общий агент: блок правок «применить / отклонить»)
// pending — просьба, которая уже ушла, а ответа ещё нет: плашкой сразу, как в Claude, а не вместе с ответом
// onWeb — ответ на «Поискать в сети?», onSaveFound — найденное в библиотеку; где их нет (общий агент), нет и кнопок
// still — внутри колонки сведений карточки: при открытии не прокручивать к ответу, колонка начинается сверху
export function Thread({ still, turns: all = [], asking, pending, onWeb, onSaveFound, onSaveNote, onMakeAction, onEdit, onRemember, onCard, digesting, digestError, progress, settings, onDigest, onAnswer, hints, disabled, extra }: {
  still?: boolean; turns?: Turn[]; asking?: boolean; pending?: string; onWeb?: (turn: Turn, allow: boolean) => void; onSaveFound?: (at: number, index: number) => Promise<void>; onSaveNote?: (at: number) => Promise<unknown>; onMakeAction?: (at: number, accept: boolean) => Promise<unknown>; onEdit?: (at: number, action: 'apply' | 'reject' | 'undo') => void; onRemember?: (at: number, accept: boolean) => Promise<void>; onCard?: (id: string) => void; digesting?: boolean; digestError?: string; progress?: AgentProgress; settings?: ModelSettings
  onDigest: () => void; onAnswer?: (text: string) => void; hints: Hint[]; disabled?: boolean; extra?: (turn: Turn) => React.ReactNode
}) {
  // Вопрос «Поискать в сети?» живёт, пока он последний: владелец написал другое — вопрос снят
  const turns = all.filter((turn, index) => !turn.webAsk || index === all.length - 1)
  const end = useRef<HTMLDivElement>(null)
  const last = useRef<HTMLDivElement>(null)
  // Карточка открывается на начале последнего ответа: длинный ответ читается сверху, а не с хвоста.
  // Агент работает — докручиваем вниз к строке статуса; пришёл ответ — плавно к его началу
  const opened = useRef(false)
  const shown = useRef(`${asking}|${digesting}|${turns.length}`)
  useEffect(() => {
    // В режиме still крутим, только если с открытия что-то поменялось (эффект в разработке запускается дважды)
    const key = `${asking}|${digesting}|${turns.length}`
    if (still && key === shown.current) return
    shown.current = key
    const behavior = opened.current ? 'smooth' : 'auto'
    if (asking || digesting) end.current?.scrollIntoView({ behavior, block: 'end' })
    else last.current?.scrollIntoView({ behavior, block: 'start' })
    opened.current = true
  }, [asking, digesting, turns.length])
  const busy = asking || digesting
  // Время в строке статуса тикает каждую секунду, шаг и токены приходят с сервера
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    if (!busy) return
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [busy])
  // Шаги запуска: каждое новое значение progress.step дописываем; запуск закончился — список очищаем
  const [ran, setRan] = useState<string[]>([])
  useEffect(() => {
    if (!busy) { setRan((was) => was.length ? [] : was); return }
    const step = progress?.step
    if (step) setRan((was) => was.at(-1) === step ? was : [...was, step])
  }, [busy, progress?.step])
  // Агент ждёт ответа владельца: вопрос про сеть, правка на принятие, «запомнить?», «сделать действием?»
  const lastTurn = turns.at(-1)
  // Вопрос с вариантами живёт, пока он у последнего ответа и его не пропустили
  const [skipped, setSkipped] = useState<number[]>([])
  const asked = !busy && lastTurn?.question && onAnswer && !skipped.includes(lastTurn.at) ? lastTurn : undefined
  const waiting = !busy && Boolean(lastTurn && (lastTurn.webAsk || asked || lastTurn.edit?.status === 'pending' || (lastTurn.remember && !lastTurn.remembered) || (lastTurn.makeAction && !lastTurn.madeAction)))
  const hintButtons = <SuggestionList items={hints.map((hint) => hint.text)} label={t('Предложения агента')} disabled={disabled} onPick={(text) => hints.find((hint) => hint.text === text)?.run()} />
  if (!turns.length && !busy) return <div className="flex min-h-full flex-col justify-center gap-2 py-4 pr-3">{hintButtons}{digestError && <AgentError className="px-2 text-xs text-destructive" message={digestError} />}</div>
  return (
    <section className="flex flex-col gap-8 py-1 pr-3" aria-label={t('Ответы агента')} aria-live="polite">
      {turns.map((turn, index) => (
        <div key={turn.at} ref={index === turns.length - 1 ? last : undefined} className="group/turn flex scroll-mt-2 flex-col gap-4">
          <span data-text className="max-w-[85%] self-end rounded-container bg-secondary px-3.5 py-2 text-body">{turn.command}</span>
          {turn.attached?.length ? <span className="flex items-start gap-1 self-end caption"><Paperclip className="mt-0.5 size-3 shrink-0" />{turn.attached.join(', ')}</span> : null}
          {turn.webAsk ? (
            // Разрешение — на одну просьбу (grill-web-search.md): «Поискать» — та же просьба с поиском, «Без поиска» — по знаниям.
            // Карточка вопроса с вариантами, как у Claude Code: рекомендованный — первый
            <div className="flex flex-col gap-2">
              <span className="flex items-start gap-1.5 text-sm text-muted-foreground"><Globe className="mt-0.5 size-3.5 shrink-0" />{t('Нужен поиск в сети: {webAsk}', { webAsk: turn.webAsk })}</span>
              {!busy && onWeb && (
                <QuestionCard title={t('Искать в сети для этого ответа?')} submit={t('Отправить')}
                  options={[
                    { value: 'search', label: t('Поискать (рекомендуется)'), hint: t('Та же просьба, но агент сначала поищет в сети') },
                    { value: 'no', label: t('Без поиска'), hint: t('Ответить по тому, что есть в библиотеке и что знает модель') },
                    { value: 'always', label: t('Всегда искать без вопроса'), hint: t('Дальше агент ищет сам; вернуть можно в правах агента') },
                  ]}
                  onSubmit={(choice) => {
                    // «Всегда» — права «Сеть: можно» (идея 53): дальше агент ищет без вопроса; вернуть — в панели агента
                    if (choice === 'always') void library.setPermissions({ web: 'allow' }).then(() => { permissionsChanged(); onWeb(turn, true) })
                    else onWeb(turn, choice === 'search')
                  }} />
              )}
            </div>
          ) : (<>
          <WorkedFor steps={turn.steps} usage={turn.usage} model={settings?.models.find((item) => item.id === turn.usage?.[0]?.model)?.label} />
          <AgentAnswer text={turn.answer} onCard={onCard} />
          {turn.found?.length ? <FoundGrid found={turn.found} onSave={onSaveFound && ((index) => onSaveFound(turn.at, index))} /> : null}
          {extra?.(turn)}
          {/* Память (grill-agent-memory.md): агент предлагает запомнить пожелание — одно нажатие, без фона; подтверждённое — тихой строкой */}
          {turn.remember && onRemember && (
            <span className="flex items-center gap-2 rounded-control bg-muted/60 py-1 pl-2.5 pr-1 text-xs">
              <span className="min-w-0 flex-1"><span className="text-muted-foreground">{turn.memoryUpdate ? t('Обновить память: ') : t('Запомнить: ')}</span>{turn.memoryUpdate ? <DiffText from={turn.memoryUpdate} to={turn.remember} /> : turn.remember}</span>
              <Button size="xs" onClick={() => void onRemember(turn.at, true).then(memoryChanged)}>{t('Да')}</Button>
              {/* Строка про тон ответа — можно сделать стилем: создаётся свой стиль из этой строки, включается, предложение снимается */}
              {isToneLine(turn.remember) && <Button size="xs" variant="secondary" onClick={() => void library.addStyle(turn.remember!.replace(/\.$/, '').slice(0, 40), turn.remember!, true).then(() => { styleChanged(); return onRemember(turn.at, false) })}>{t('Стилем')}</Button>}
              <Button variant="ghost" size="icon-xs" aria-label={t('Не запоминать')} onClick={() => void onRemember(turn.at, false)}><X /></Button>
            </span>
          )}
          {asked?.at === turn.at && turn.question && (
            <QuestionCard title={turn.question.title} other
              options={turn.question.options.map((option) => ({ value: option.label, label: option.label, hint: option.hint }))}
              onSubmit={(text) => onAnswer!(text)} onSkip={() => setSkipped((was) => [...was, turn.at])} />
          )}
          {turn.remembered && <span className="flex items-center gap-1.5 caption"><Check className="size-3.5" />{t('Запомнил: {remembered}', { remembered: turn.remembered })}</span>}
          {/* Правка текста диффом (идея 55): что уйдёт и что придёт; принятое можно отменить */}
          {turn.edit && onEdit && (
            <div className={cn('flex flex-col gap-2 rounded-container bg-muted/60 p-3 text-body', turn.edit.status === 'rejected' && 'opacity-50')} aria-label={turn.edit.target === 'note' ? t('Правка заметки') : t('Правка выжимки')}>
              <span className="caption">{turn.edit.target === 'note' ? t('Правка заметки') : t('Правка выжимки')}</span>
              <DiffText from={turn.edit.from} to={turn.edit.to} className="leading-relaxed" />
              <span className="flex items-center gap-1">
                {turn.edit.status === 'pending' && <><Button size="xs" onClick={() => onEdit(turn.at, 'apply')}>{t('Принять')}</Button><Button size="xs" variant="ghost" onClick={() => onEdit(turn.at, 'reject')}>{t('Отклонить')}</Button></>}
                {turn.edit.status === 'applied' && <><span className="flex items-center gap-1 caption"><Check className="size-3.5" />{t('Принято')}</span><Button size="xs" variant="ghost" className="ml-auto" onClick={() => onEdit(turn.at, 'undo')}>{t('Отменить')}</Button></>}
                {turn.edit.status === 'rejected' && <span className="caption">{t('Отклонено')}</span>}
              </span>
            </div>
          )}
          {/* Свои действия (№22): просьба повторилась в третий раз — одно нажатие, и она станет действием */}
          {turn.makeAction && onMakeAction && (
            <span className="flex items-center gap-2 rounded-control bg-muted/60 py-1 pl-2.5 pr-1 text-xs">
              <span className="min-w-0 flex-1"><span className="text-muted-foreground">{t('Создать действие:')} </span>{turn.makeActionName && <span className="font-medium">/{turn.makeActionName} — </span>}{turn.makeAction}</span>
              <Button size="xs" onClick={() => void onMakeAction(turn.at, true).then(memoryChanged)}>{t('Да')}</Button>
              <Button variant="ghost" size="icon-xs" aria-label={t('Не делать действием')} onClick={() => void onMakeAction(turn.at, false)}><X /></Button>
            </span>
          )}
          {turn.madeAction && <span className="flex items-center gap-1.5 caption"><Check className="size-3.5" />{t('Теперь это действие: {madeAction}', { madeAction: turn.madeAction })}</span>}
          {/* Значки под ответом — только при наведении на ответ (как в ChatGPT); на сенсорных экранах видны всегда */}
          {/* «Учёл память: …» под ответом убрано (владелец 2026-10-15): какие пожелания применены, видно на странице «Память»; usedMemory в данных остаётся */}
          <span className="flex flex-wrap items-center gap-1 caption opacity-0 transition-opacity group-hover/turn:opacity-100 focus-within:opacity-100 pointer-coarse:opacity-100">
            <CopyButton text={turn.answer} label={t('Копировать')} />
            {onSaveNote && <SaveNoteButton onSave={() => onSaveNote(turn.at)} />}
            {turn.via === 'digest' && !busy && <Button variant="link" size="sm" className="h-auto p-0 caption" onClick={onDigest}>{t('Заново')}</Button>}
            <span className="ml-1 text-xs text-muted-foreground">{new Date(turn.at).toLocaleString(locale, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
          </span>
          </>)}
        </div>
      ))}
      {asking && pending && <span data-text className="max-w-[85%] self-end rounded-container bg-secondary px-3.5 py-2 text-body">{pending}</span>}
      {busy && (
        <div className="flex flex-col gap-2">
          {/* Список шагов: что агент уже сделал (✓) и что делает сейчас (кружок) — шаги копятся, пока идёт запуск */}
          {/* Текущий шаг показывает индикатор ниже, в списке — только законченные: иначе один и тот же шаг виден дважды */}
          {ran.length > 1 && (
            <ul className="flex flex-col gap-1.5 rounded-container bg-muted/60 px-4 py-3 text-sm text-muted-foreground" aria-label={t('Шаги агента')}>
              {ran.slice(0, -1).map((step, at) => (
                <li key={`${at}-${step}`} className="flex items-center gap-2"><Check className="size-3.5 shrink-0" />{t(step)}</li>
              ))}
            </ul>
          )}
          <div className="flex flex-col"><ThinkingIndicator className="px-0 py-0" label={progress ? t(progress.step) : t('думает')} />{progress ? <span className="pl-7 caption text-muted-foreground">{progressMeta(progress, now)}</span> : null}</div>
        </div>
      )}
      {waiting && <Badge variant="secondary" className="self-start gap-1.5"><span aria-hidden className="size-1.5 animate-pulse rounded-full bg-primary" />{t('Ждёт тебя')}</Badge>}
      {digestError && !digesting && <AgentError message={digestError} />}
      {!busy && !turns.at(-1)?.webAsk && hintButtons}
      <div ref={end} />
    </section>
  )
}

// Найденное в сети — сетка превью под ответом (grill-web-search.md). Клик — картинка крупно со ссылкой на источник,
// на наведении — «в библиотеку»: новый реф с источником; сохранённое отмечается галочкой
function FoundGrid({ found, onSave }: { found: Found[]; onSave?: (index: number) => Promise<void> }) {
  const [open, setOpen] = useState<number>()
  const [saved, setSaved] = useState<number[]>([])
  const host = (url: string) => new URL(url).hostname.replace(/^www\./, '')
  const save = async (index: number) => { await onSave?.(index); setSaved((list) => [...list, index]) }
  const shown = open === undefined ? undefined : found[open]
  return (
    <>
      <ul className="grid grid-cols-3 gap-1.5" aria-label={t('Найдено в сети')}>
        {found.map((item, index) => (
          <li key={item.image} className="group/found relative">
            <button type="button" className="block w-full overflow-hidden rounded-surface border" aria-label={`${item.title} — ${host(item.url)}`} onClick={() => setOpen(index)}>
              <img src={item.image} alt="" className="aspect-square w-full object-cover" />
            </button>
            {onSave && (
              saved.includes(index)
                ? <span className="absolute right-1 top-1 grid size-6 place-items-center glass rounded-control border" aria-label={t('В библиотеке')}><Check className="size-3.5" /></span>
                : <Tooltip>
                    <TooltipTrigger asChild>
                      <Button variant="secondary" size="icon-xs" aria-label={t('В библиотеку')} className="absolute right-1 top-1 opacity-0 transition-opacity group-hover/found:opacity-100 focus-visible:opacity-100" onClick={() => void save(index)}><BookmarkPlus /></Button>
                    </TooltipTrigger>
                    <TooltipContent>{t('В библиотеку')}</TooltipContent>
                  </Tooltip>
            )}
          </li>
        ))}
      </ul>
      <Dialog open={shown !== undefined} onOpenChange={(next) => { if (!next) setOpen(undefined) }}>
        {shown && <DialogPortal><DialogOverlay /></DialogPortal>}
        {shown && (
          <DialogContent className="gap-3 bg-background sm:max-w-3xl" onEscapeKeyDown={(event) => event.stopPropagation() /* Escape закрывает просмотр, не карточку */}>
            <DialogTitle className="pr-8">{shown.title}</DialogTitle>
            <img src={shown.image} alt={shown.title} className="max-h-[70vh] w-full rounded-surface object-contain" style={{ aspectRatio: shown.ratio }} />
            <DialogDescription asChild>
              <a href={shown.url} target="_blank" rel="noreferrer" className="flex items-center gap-1 hover:underline"><ExternalLink className="size-3.5" />{host(shown.url)}</a>
            </DialogDescription>
          </DialogContent>
        )}
      </Dialog>
    </>
  )
}


// Передать материал агенту (Claude Code, Codex): в буфер — строка с id, агент читает материал целиком через MCP (refkit_read).
// Отдельной кнопкой, не в «⋮» (владелец 2026-10-02): жест частый — скопировал, вставил, дописал задачу
function AgentCopyButton({ id, title }: { id: string; title: string }) {
  const [copied, setCopied] = useState(false)
  const copy = () => void navigator.clipboard.writeText(t('Материал из Refkit: «{title}» ({id})', { title, id })).then(() => {
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  })
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={t('Скопировать для агента')} onClick={copy}>{copied ? <Check /> : <Copy />}</Button>
      </TooltipTrigger>
      <TooltipContent>{copied ? t('Скопировано') : t('Скопировать для агента')}</TooltipContent>
    </Tooltip>
  )
}

// «⋯» в шапке карточки — редкие действия (решение владельца): корзина рядом с × — риск удалить промахом.
// «Удалить» — красным и в два нажатия: первое превращает пункт в «Нажмите ещё раз — удалить», второе удаляет;
// закрыл меню — подтверждение сброшено. Escape закрывает только меню, не карточку
// «⋮» карточки: всё редкое — под руку, источник, удалить (как правый клик по плитке)
function CardMenu({ onDelete, shelved, onShelf, source }: { onDelete: () => void; shelved: boolean; onShelf: () => void; source: string }) {
  const [confirming, setConfirming] = useState(false)
  return (
    <DropdownMenu onOpenChange={(open) => { if (!open) setConfirming(false) }}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" aria-label={t('Ещё действия')}><EllipsisVertical /></Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-48" onEscapeKeyDown={(event) => event.stopPropagation()}>
        <DropdownMenuItem onSelect={onShelf}>{shelved ? <PinOff /> : <Pin />}{shelved ? t('Открепить') : t('Закрепить')}</DropdownMenuItem>
        {source && <DropdownMenuItem onSelect={() => window.open(sourceHref(source), '_blank', 'noopener')}><ExternalLink />{t('Открыть источник')}</DropdownMenuItem>}
        {source && <DropdownMenuItem onSelect={() => void navigator.clipboard.writeText(source)}><Link2 />{t('Скопировать ссылку')}</DropdownMenuItem>}
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" className="whitespace-nowrap" onSelect={(event) => { if (!confirming) { event.preventDefault(); setConfirming(true) } else onDelete() }}>
          <Trash2 />{confirming ? t('Нажмите ещё раз — удалить') : t('Удалить')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

// Разделитель колонок: линия и «ручка»-таблетка видны при наведении и перетаскивании, подсказка «Ширина» (реф владельца)
// Меню масштаба по образцу Figma: в кнопке только проценты; сверху поле — ввёл число и Enter; ниже действия с сочетаниями
function ZoomMenu({ scale, onZoom, onStep }: { scale: number; onZoom: (zoom: number | null) => void; onStep: (step: number) => void }) {
  const percent = Math.round(scale * 100)
  const [draft, setDraft] = useState('')
  return (
    <DropdownMenu onOpenChange={(open) => { if (open) setDraft(`${percent}%`) }}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-1 tabular-nums text-muted-foreground" aria-label={t('Масштаб {percent}%', { percent })}>{percent}%<ChevronDown className="opacity-60" /></Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="center" className="w-56" onEscapeKeyDown={(event) => event.stopPropagation()}>
        <div className="p-1">
          <Input aria-label={t('Масштаб в процентах')} value={draft} autoFocus onFocus={(event) => event.currentTarget.select()}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              event.stopPropagation() // буквы и цифры — в поле, а не в навигацию меню
              if (event.key !== 'Enter') return
              const value = Number.parseFloat(draft.replace(',', '.'))
              if (value > 0) onZoom(Math.min(8, Math.max(0.1, value / 100)))
              setDraft(`${Math.round(value > 0 ? Math.min(800, Math.max(10, value)) : percent)}%`)
            }} className="h-8 tabular-nums" />
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={(event) => { event.preventDefault(); onStep(1.25) }}>{t('Приблизить')}<DropdownMenuShortcut>⌘+</DropdownMenuShortcut></DropdownMenuItem>
        <DropdownMenuItem onSelect={(event) => { event.preventDefault(); onStep(0.8) }}>{t('Отдалить')}<DropdownMenuShortcut>⌘−</DropdownMenuShortcut></DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onZoom(null)}>{t('Вписать')}<DropdownMenuShortcut>⇧1</DropdownMenuShortcut></DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onZoom(0.5)}>50%</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onZoom(1)}>100%<DropdownMenuShortcut>⌘0</DropdownMenuShortcut></DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onZoom(2)}>200%</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function WidthHandle({ className }: { className?: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <ResizableHandle withHandle className={cn('bg-transparent transition-colors hover:bg-line data-[separator=active]:bg-line [&>div]:opacity-0 [&>div]:transition-opacity hover:[&>div]:opacity-100 data-[separator=active]:[&>div]:opacity-100', className)} />
      </TooltipTrigger>
      <TooltipContent side="right">{t('Ширина')}</TooltipContent>
    </Tooltip>
  )
}

// История разговоров — боковая панель окна агента, как у Claude (реф владельца): сверху «⊕ Новый разговор»,
// ниже разговоры строкой с кружком (текущий — закрашен и подсвечен), без дат

// Модель — меню один в один как в Claude: основные модели (у выбранной ✓, у остальных номер — цифрой на клавиатуре выбирается
// сразу), плашка — только где есть оговорка; остальные — в «Ещё модели ›». Модель одна на выжимку и просьбы, общая для
// приложения; действует со следующей просьбы
export function ModelMenu({ settings, onModel }: { settings: ModelSettings; onModel: (key: string) => void }) {
  const current = settings.assigned.ask
  const main = settings.models.filter((model) => !model.more)
  const more = settings.models.filter((model) => model.more)
  const moreGroups = new Set(more.map((model) => model.provider)).size
  // Модель на кредитах не выбирается: покупка кредитов — касса Claude, открываем её страницу
  const choose = (model: ModelSettings['models'][number]) => model.badge === t('нужны кредиты') ? window.open('https://claude.ai/settings/usage', '_blank', 'noopener') : onModel(model.key)
  // Группы по провайдеру — разные подписки и лимиты (решение владельца): заголовок и разделитель; номера — сквозные по основным
  const grouped = (list: ModelSettings['models'], render: (model: ModelSettings['models'][number]) => React.ReactNode) =>
    (['claude', 'codex'] as const).filter((provider) => list.some((model) => model.provider === provider)).map((provider, group) => (
      <DropdownMenuGroup key={provider}>
        {group > 0 && <DropdownMenuSeparator />}
        <DropdownMenuLabel className="py-1 text-xs font-normal text-muted-foreground">{provider === 'claude' ? 'Claude' : 'ChatGPT'}</DropdownMenuLabel>
        {list.filter((model) => model.provider === provider).map(render)}
      </DropdownMenuGroup>
    ))
  const row = (model: ModelSettings['models'][number], index?: number) => (
    <DropdownMenuItem key={model.key} className="h-7 gap-1.5 py-0 text-xs whitespace-nowrap" onSelect={() => choose(model)}>
      {model.label}
      {model.badge && <Badge variant="secondary" className="px-1.5 font-normal text-muted-foreground">{model.badge !== t('по умолчанию') && <Info />}{model.badge}</Badge>}
      {model.key === current ? <Check className="ml-auto" /> : index !== undefined && <DropdownMenuShortcut>{index + 1}</DropdownMenuShortcut>}
    </DropdownMenuItem>
  )
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="xs" className="text-xs" aria-label={t('Модель агента')}>{settings.models.find((model) => model.key === current)?.label}</Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="end" className="w-auto min-w-56"
        onKeyDown={(event) => { const model = main[Number(event.key) - 1]; if (model) { event.preventDefault(); choose(model) } }}>
        {grouped(main, (model) => row(model, main.indexOf(model)))}
        {more.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuSub>
              <DropdownMenuSubTrigger className="h-7 py-0 text-xs">{t('Ещё модели')}</DropdownMenuSubTrigger>
              {/* Подменю — вверх, как в Claude: нижний край на строке «Ещё модели». В shadcn/Radix подменю растёт вниз от своей
                  строки, направления нет — сдвигаем на высоту списка (строки по 28 px, заголовки групп по 24, разделители по 9, поля 8) минус строка и поле */}
              <DropdownMenuSubContent alignOffset={-(more.length * 28 + moreGroups * 24 + (moreGroups - 1) * 9 - 24)}>{grouped(more, (model) => row(model))}</DropdownMenuSubContent>
            </DropdownMenuSub>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

// Уровень на кнопке — сохранённый или ближайший ниже, который принимает модель (как делает сервер)
const shownDepth = (settings: ModelSettings) => {
  const efforts = settings.models.find((model) => model.key === settings.assigned.ask)?.efforts ?? []
  const wanted = depthLevels.findIndex((level) => level.value === settings.depth)
  return depthLevels.filter((level, at) => at <= wanted && efforts.includes(level.value)).at(-1)?.label ?? depthLevels.find((level) => efforts.includes(level.value))?.label
}
// Глубина — кнопкой с названием уровня, как «Medium» в Claude; подсветка только при наведении, как у модели. Внутри — ползунок.
// Слой 80 — карточка на 70
export function DepthMenu({ settings, onDepth }: { settings: ModelSettings; onDepth: (depth: Depth) => void }) {
  const { active, isStyled } = useStyle()
  return (
    <Popover>
      <PopoverTrigger asChild>
        {/* Включён стиль — его название рядом с глубиной: чтобы не забыть про циника (прожарка grill-agent-style.md) */}
        <Button variant="ghost" size="xs" className="text-xs" aria-label={isStyled ? t('Глубина и стиль: {name}', { name: active?.name }) : t('Глубина')}>{shownDepth(settings)}{isStyled && <span className="ml-1 max-w-24 truncate text-muted-foreground">· {active?.name}</span>}</Button>
      </PopoverTrigger>
      <PopoverContent side="top" align="end" className="w-72 gap-3">
        <DepthControl settings={settings} onDepth={onDepth} />
        <Separator />
        <StyleSection />
      </PopoverContent>
    </Popover>
  )
}

// Кружок расхода — окно как в Claude: разделы с полосками. Только то, что Refkit знает сам: контекст последнего запроса
// карточки от окна модели и расход в карточке. Лимитов подписки (5 часов, неделя) через claude -p не получить — не рисуем.
// Значок — незамкнутое кольцо LoaderCircle из lucide, без вращения
// Расход: тело вынесено, чтобы лежать внутри «Настроек агента» (одно место вместо трёх чипов)
function UsageBody({ turns = [], settings }: { turns?: Turn[]; settings?: ModelSettings }) {
  const runs = turns.flatMap((turn) => turn.usage ?? [])
  const sum = (list: Usage[]) => list.reduce((total, run) => total + run.input + run.output, 0)
  const k = (value: number) => value >= 1_000_000 ? t('{toFixed} млн', { toFixed: +(value / 1_000_000).toFixed(1) }) : t('{toFixed} тыс.', { toFixed: +(value / 1000).toFixed(1) })
  const last = runs.at(-1)
  const model = last && settings?.models.find((item) => item.id === last.model)
  const used = last ? last.input + last.cached : 0
  const limit = model?.context ?? 0
  const answers = turns.filter((turn) => turn.usage?.length).length
  const seconds = runs.reduce((total, run) => total + run.seconds, 0)
  return (
    <div className="-mx-4 -mb-4 text-sm">
        {runs.length ? (
          <>
            {limit > 0 && (
              <div className="flex flex-col gap-2 p-3">
                <div className="flex justify-between"><span>{t('Контекст')}</span><span className="text-muted-foreground tabular-nums">{k(used)} / {k(limit)} ({Math.round(used / limit * 100)}%)</span></div>
                <Progress value={used / limit * 100} aria-label={t('Контекст последнего запроса')} />
                <span className="caption">{t('Последний запрос · {label}', { label: model?.label })}</span>
              </div>
            )}
            <Separator />
            <div className="flex flex-col gap-1 p-3">
              <div className="flex justify-between"><span>{t('В этой карточке')}</span><span className="text-muted-foreground tabular-nums">{t('{runs} токенов', { runs: k(sum(runs)) })}</span></div>
              <span className="caption">{answerCount(answers)} · {seconds < 60 ? t('{seconds} с', { seconds }) : t('{seconds} мин', { seconds: Math.round(seconds / 60) })}</span>
            </div>
          </>
        ) : <p className="p-3 text-muted-foreground">{t('В этой карточке агент ещё не работал')}</p>}
      
    </div>
  )
}

// Одна кнопка «Настройки агента» у поля ввода (владелец 2026-10-29: чипы права, глубина, стиль и расход путали): внутри
// права, глубина, стиль ответа и расход. Модель остаётся отдельной подписью рядом: её хочется видеть сразу
export function AgentSettingsMenu({ settings, onDepth, turns = [] }: { settings: ModelSettings; onDepth: (depth: Depth) => void; turns?: Turn[] }) {
  const efforts = settings.models.find((model) => model.key === settings.assigned.ask)?.efforts ?? []
  return (
    <Popover>
      <Tooltip>
        <TooltipTrigger asChild><PopoverTrigger asChild><Button variant="ghost" size="icon-xs" className="text-muted-foreground" aria-label={t('Настройки агента')}><SlidersHorizontal /></Button></PopoverTrigger></TooltipTrigger>
        <TooltipContent>{t('Настройки агента')}</TooltipContent>
      </Tooltip>
      <PopoverContent side="top" align="end" className="max-h-[70vh] w-80 gap-4 overflow-auto">
        <PermissionsFields />
        {efforts.length > 0 && <><Separator /><DepthControl settings={settings} onDepth={onDepth} /></>}
        <Separator />
        <StyleSection />
        <Separator />
        <UsageBody turns={turns} settings={settings} />
      </PopoverContent>
    </Popover>
  )
}
const answerCount = (n: number) => `${n} ${n % 10 === 1 && n % 100 !== 11 ? t('ответ') : [2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100) ? t('ответа') : t('ответов')}`

export default RefCard

// Ссылки в тексте заметки или статьи — кликабельные (посты из Telegram несут их в тексте)
function linkify(text: string) {
  return text.split(/(https?:\/\/[^\s)]+)/g).map((part, index) => index % 2
    ? <a key={index} href={part} target="_blank" rel="noreferrer" className="break-all underline underline-offset-2">{part}</a>
    : part)
}

// Поле сведений карточки: подпись и текст, правится по месту — уход фокуса сохраняет, Esc возвращает
// action — кнопка справа от подписи (у описания — «Описать» агентом)
// Выжимка в карточке (владелец 2026-10-18): весь блок свёрнут под заголовком, как и поля карточки — текст не сокращаем, а прячем;
// внутри суть, разделы, термины и «Как применить» по одному. Нет выжимки — на этом же месте «Разобрать». «Заново» остаётся в ленте агента
function DigestBlock({ reference, onDigest, onCard }: { reference: CardReference; onDigest: () => void; onCard: (id: string) => void }) {
  const [open, setOpen] = useState<string | null>(null)
  const [folded, setFolded] = useState(true)
  const answer = (reference.thread ?? []).filter((turn) => turn.via === 'digest').at(-1)?.answer
  if (!answer) return (
    <section className="flex flex-col gap-1">
      <Button variant="outline" size="xs" className={cn(agentPill, 'self-start')} disabled={reference.digesting} onClick={onDigest}>
        {reference.digesting ? <Loader2 className="animate-spin" /> : <Zap />}{t('Разобрать')}
      </Button>
      {reference.digestError && <AgentError message={reference.digestError} />}
    </section>
  )
  const parts = answer.split('\n\n')
  const headings = [t('Разделы:'), t('Термины:'), t('Как применить:')]
  const titled = parts.filter((part) => headings.some((heading) => part.startsWith(heading)))
  const main = parts.filter((part) => !titled.includes(part)).join('\n\n')
  const shown = titled.find((part) => part.startsWith(`${open}:`))
  return (
    <section className="flex flex-col gap-2">
      <h3 className={fieldTitle}>
        <button type="button" aria-expanded={!folded} className="flex items-center gap-1" onClick={() => setFolded(!folded)}>
          {t('Выжимка')}<ChevronDown className={cn('size-4 text-muted-foreground transition-transform', !folded && 'rotate-180')} />
        </button>
      </h3>
      {!folded && <AgentAnswer text={main} onCard={onCard} />}
      {!folded && titled.length > 0 && (
        <div className="flex flex-wrap gap-x-3 gap-y-1">
          {titled.map((part) => {
            const title = part.slice(0, part.indexOf(':'))
            return <button key={title} type="button" aria-expanded={open === title} className="text-xs font-medium text-muted-foreground hover:text-foreground" onClick={() => setOpen(open === title ? null : title)}>{title}</button>
          })}
        </div>
      )}
      {!folded && shown && <AgentAnswer text={shown.slice(shown.indexOf('\n') + 1)} onCard={onCard} />}
    </section>
  )
}

function InfoField({ label, value, onSave, action }: { label: string; value: string; onSave: (text: string) => void; action?: ReactNode }) {
  const [text, setText] = useState(value)
  useEffect(() => setText(value), [value])
  return (
    <section className="flex flex-col gap-1">
      <div className="flex items-center justify-between gap-2"><h3 className={fieldTitle}>{label}</h3>{action}</div>
      <Textarea aria-label={label} value={text} rows={1} onChange={(event) => setText(event.target.value)}
        onBlur={() => { if (text.trim() !== value.trim()) onSave(text.trim()) }}
        onKeyDown={(event) => { if (event.key === 'Escape') { event.stopPropagation(); setText(value); event.currentTarget.blur() } }}
        className="min-h-9 resize-none text-body md:text-body" />
    </section>
  )
}
