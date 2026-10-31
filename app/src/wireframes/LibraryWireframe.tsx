import { Fragment, startTransition, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { form, t, locale } from '@/lib/i18n'
import { DndContext, DragOverlay, MeasuringStrategy, PointerSensor, TouchSensor, pointerWithin, useDndContext, useDraggable, useSensor, useSensors, type DragEndEvent, type DragStartEvent } from '@dnd-kit/core'
import { dragState, useDragging } from '@/lib/drag-state'
import { snapCenterToCursor } from '@dnd-kit/modifiers'
import { LayoutGroup, motion } from 'framer-motion'
import { CanvasCover } from '@/components/canvas-thumb'
import { CanvasPage } from '@/components/canvas-page'
import { TEMPLATES } from '@/components/canvas/nodes'
import { HomeGreeting } from '@/components/home-greeting'
import { Network, NotebookPen, ListChecks, LayoutGrid, SquarePen, FileQuestion, MessageSquarePlus, RotateCcw, SmilePlus, ArrowDown, ArrowLeft, ArrowUp, ScrollText, FolderPlus, Inbox, ArrowUpRight, BookOpen, ChevronDown, EllipsisVertical, ListFilter, ChevronUp, Palette, ScanSearch, Zap, ExternalLink, Link2, MessageSquare, Trash2, LoaderCircle, Plus, Bot, LayoutDashboard, List, Tag, Film, ChevronLeft, ChevronRight, Pin, PinOff, X, ChartColumn, CircleDashed, CodeXml, FileText, Folder, Image as ImageIcon, ImagePlus, Library, Loader2, MousePointerClick, Search, SlidersHorizontal, SquarePlay, StickyNote, Music, Type, Wind, Orbit, Rocket, Upload } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn, sourceHref } from '@/lib/utils'
import { Input } from '@/components/ui/input'
import { DropTarget } from '@/components/drop-target'
import { AddDialog, type AddDraft, type AddFields } from '@/components/add-dialog'
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group'
import { Skeleton } from '@/components/ui/skeleton'
import { SidebarInset, SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar'
import { Island } from '@/components/ui/island'
import ImageModal from '@/components/interaction-kit/ImageModal'
import { FloatingBar } from '@/components/floating-bar'
import { PaperNote } from '@/components/paper-note'
import { Tilt } from '@/components/tilt'
import { CreateTile } from '@/components/create-tile'
import { SpaceGlyph, SpaceTile } from '@/components/space-tile'
import { tileSurface } from '@/components/tile'
import { IconDialog } from '@/components/icon-dialog'
import type { CardComment } from '@/components/comment-feed'
import { compact, roomy, useMinWidth, wide } from '@/lib/breakpoints'
import { SettingsPage } from '@/components/settings-page'
import { actionLabels } from '@/wireframes/AppSidebar'
import { canvasTileMin, tileCaption, spaceTileMin, tileGap, tileGridStyle, tileInset, tileSpring } from '@/lib/tile-grid'
import { useTileColumns, useTileScale } from '@/lib/tile-scale'
import { notify, notifyError } from '@/lib/notify'
import { AppSidebar } from './AppSidebar'
import { useActions } from '@/components/agent-memory'
import RefCard from './RefCard'
import { LibraryAgent, type AgentTab } from './LibraryAgent'
import { TrashView, type TrashItem } from './TrashView'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuItem, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { ContextMenu, ContextMenuCheckboxItem, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuSub, ContextMenuSubContent, ContextMenuSubTrigger, ContextMenuTrigger } from '@/components/ui/context-menu'
import { collectionsOf, collectionsOfType, tagsByMeaning, defaultCollections, type Collection, type TypeId } from '@/lib/collections'
import { firstThought, type SpeechHit, isMaterial, library, probe, shelfName, type Action, type AgentProgress, type Board, type Folder as FolderItem, type Depth, type Digest, type Estimate, type Kind, type ModelSettings, type Turn, type Usage } from '@/lib/library'
import './library.css'
import { FilterBar } from '@/components/filter-bar'
import { ActionsPage } from '@/components/actions-page'
import { linkKey } from '@/lib/link-key'
import { TagsPage } from '@/components/tags-page'
import { GraphPage } from '@/components/graph-page'
import { FlyPage } from '@/components/fly-page'
import { BoardHeader } from '@/components/board-header'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Ellipsis as TagMoreIcon, Pencil as TagRenameIcon, Tag as TagIcon, Folder as FolderRowIcon } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { queryStems, stem } from '@/lib/stem.mjs'

type Stage = 'new' | 'analyzed' | 'ready' | 'used'
type Format = 'image' | 'video'
type Reference = {
  id: string; createdAt?: number; updatedAt?: number; folder?: string; dupOf?: string; batch?: string; batchSource?: string; title: string; technique: string; meaning: string; comments?: CardComment[]; image: string; ratio: string; format: Format; video?: string
  collections?: string[]; collection?: string; stage: Stage; tags: string[]; source: string
  description?: string; describing?: boolean; converting?: boolean; hasCode?: boolean; convertError?: string; codeAt?: number
  thumbAt?: number
  canvasBoxes?: Array<{ x: number; y: number; w: number; h: number; k: string }>
  kind?: Kind; author?: string; digest?: Digest; fetching?: boolean; fetchError?: string; digesting?: boolean; digestError?: string
  suggestions?: string[]; thread?: Turn[]; asking?: boolean; askError?: string | null; conversation?: number; sources?: string[]; focus?: string[]
  estimate?: Estimate; digestUsage?: Usage[]; embed?: string; embedRatio?: string
  media?: Array<{ image: string; ratio: string; video?: string }> // пост-альбом: все файлы, первый — он же image/video
  boards?: string[]; openedAt?: number; tagOffer?: { name: string; hint: string }
  colors?: string[] // главные цвета картинки, считает код при добавлении (№18)
}

// Типы контента для боковой панели — что это. Подборки ниже — о чём это; фильтры работают вместе.
const types: Array<{ id: TypeId; label: string; icon: typeof Library; match: (reference: Reference) => boolean }> = [
  // Наборы и синтезы (заметка с sources) — только в «Заметках»: во «Всё» они дублировали обложки своих источников (grill-skeptic.md)
  { id: 'all', label: t('Всё'), icon: Library, match: (reference) => !reference.sources?.length },
  // Картинки и закинутое видео — по формату файла; YouTube — «Ролики» (grill-formats.md)
  { id: 'refs', label: t('Картинки'), icon: ImageIcon, match: (reference) => !isMaterial(reference.kind) && reference.format !== 'video' },
  { id: 'video', label: t('Видео'), icon: Film, match: (reference) => !isMaterial(reference.kind) && reference.format === 'video' },
  { id: 'youtube', label: t('Ролики'), icon: SquarePlay, match: (reference) => reference.kind === 'youtube' },
  { id: 'article', label: t('Статьи'), icon: FileText, match: (reference) => typeOf(reference) === 'article' }, // и закладки-ссылки: иначе их не видно ни в одном типе
  { id: 'note', label: t('Заметки'), icon: SquarePen, match: (reference) => reference.kind === 'note' },
  { id: 'music', label: t('Музыка'), icon: Music, match: (reference) => reference.kind === 'music' }, // ссылки Spotify (grill-music.md)
  { id: 'canvas', label: t('Холсты'), icon: Network, match: (reference) => reference.kind === 'canvas' }, // доски (grill-canvas.md)
]

// Подборки — о чём это; список — library/collections.json через сервер, тип и стартовый набор — lib/collections.ts. Здесь — иконки: у стартовых свои, у созданных — папка.
const icons: Record<string, typeof Library> = { 'Данные': ChartColumn, 'Контролы': SlidersHorizontal, 'Типографика': Type, 'Моушен': Wind, 'ИИ и агенты': Bot, 'UX': MousePointerClick, 'Фронтенд': CodeXml }
const iconOf = (name: string) => icons[name] ?? Tag // новый тег — значок тега, не папки: папка — у подборок
// Закладка раскладывается по подборкам статей и видна только во «Всё» — отдельного вида в панели нет
const typeOf = (reference: Reference): TypeId => reference.kind === 'link' ? 'article' : isMaterial(reference.kind) ? reference.kind : reference.format === 'video' ? 'video' : 'refs'

// Ролик YouTube в карточке — настоящий плеер. youtube-nocookie: куки YouTube не ставятся, пока не нажали «воспроизвести»
const youtubeId = (reference: Reference) => reference.kind === 'youtube' ? reference.source.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/shorts\/)([\w-]{11})/)?.[1] : undefined

// «1 карточка», «2 карточки», «5 карточек»
function cardsWord(count: number) {
  const f = form(count)
  return f === 'one' ? t('карточка') : f === 'few' ? t('карточки') : t('карточек')
}
function plural(count: number) {
  const f = form(count)
  return f === 'one' ? t('материал') : f === 'few' ? t('материала') : t('материалов')
}

// Библиотека — минимум действий: добавить одним жестом (⌘V, перетащить, «+»), найти поиском, открыть карточку.
// Рефы живут в папке library/ (library-plugin.ts); после добавления модель в фоне пишет название, описание и теги.
function LibraryWireframe() {
  const [collection, setCollection] = useState<string | null>(null)
  // Ширина боковой панели тянется за край; запоминаем в браузере — это удобство одного зрителя, не данные
  // Подборки с сервера (library/collections.json); до ответа — стартовый набор
  const [collectionList, setCollectionList] = useState<Collection[]>(defaultCollections)
  useEffect(() => { library.collections().then(setCollectionList).catch(() => {}) }, [])
  const collectionsFor = (type: TypeId) => collectionsOfType(collectionList, type).map((item) => ({ ...item, icon: iconOf(item.name) }))
  const createCollection = async (name: string) => setCollectionList(await library.createCollection(name))
  // Граф: «Сделать тегом» — тег в словаре и на материалах с понятием; новый тег откатывается удалением, существующий — нет
  const tagFromGraph = async (name: string, ids: string[]) => {
    try {
      const result = await library.graphTag(name, ids)
      setCollectionList(result.collections)
      await reload()
      notify(result.created ? t('Тег «{tag}» создан, на {changed} {t}', { tag: result.tag, changed: result.changed, t: result.changed === 1 ? t('материале') : t('материалах') }) : t('«{tag}» добавлен ещё на {changed}', { tag: result.tag, changed: result.changed }),
        result.created ? { undo: () => void library.deleteCollection(result.tag).then((next) => { setCollectionList(next); void reload() }) } : {})
    } catch { notifyError(t('Не получилось сделать тегом')) }
  }
  // Находки по графу → заметка во «Входящих» (как ответ агента → заметка)
  const noteFromGraph = (id: string) => { void reload(); notify(t('Заметка добавлена во «Входящие»')); void id }
  // Словарь тегов правится из чипов: сервер меняет и словарь, и карточки — перечитываем обе стороны
  const renameTag = async (from: string, to: string) => {
    setCollectionList(await library.renameCollection(from, to))
    if (collection === from) setCollection(null)
    await reload()
  }
  const [tagRename, setTagRename] = useState<string | null>(null)
  const [refRename, setRefRename] = useState<{ id: string; title: string } | null>(null)
  const deleteTag = async (name: string) => {
    setCollectionList(await library.deleteCollection(name))
    if (collection === name) setCollection(null)
    await reload()
  }
  // Модель разбора — одна на всё приложение; выбирается в меню пользователя и у кнопки «Сделать выжимку»
  const [modelSettings, setModelSettings] = useState<ModelSettings>()
  useEffect(() => { library.settings().then(setModelSettings).catch(() => {}) }, [])
  // Смена модели у действия меняет и цену — после сохранения забираем список с новыми оценками
  const chooseModels = async (models: Partial<Record<Action, string>>) => { setModelSettings(await library.setModels(models)); void reload() }
  // Глубина меняет цену всех действий — после сохранения забираем список с новыми оценками
  const chooseDepth = async (depth: Depth) => { setModelSettings(await library.setDepth(depth)); void reload() }
  const [query, setQuery] = useState('')
  // Поиск по цвету и «похожее» (№18): цвет — hex из палитры библиотеки или пипетки; похожее — на какую карточку
  const [color, setColor] = useState<string | null>(null)
  const [similarTo, setSimilarTo] = useState<string | null>(null)
  // Поиск по речи роликов (идея 59): сервер ищет в субтитрах с таймкодами; seek — открыть ролик с этой секунды
  const [speech, setSpeech] = useState<SpeechHit[]>([])
  useEffect(() => {
    if (query.trim().length < 3) { setSpeech([]); return }
    const timer = setTimeout(() => { library.speech(query.trim()).then(setSpeech).catch(() => setSpeech([])) }, 300)
    return () => clearTimeout(timer)
  }, [query])
  const [seek, setSeek] = useState<{ id: string; t: number } | null>(null)
  const heard = (id: string) => speech.find((hit) => hit.id === id)
  const [references, setReferences] = useState<Reference[]>([])
  const [loadError, setLoadError] = useState('')
  const [dragOver, setDragOver] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)

  // loaded — список пришёл: пустая библиотека до ответа сервера не должна показывать анкету первого входа
  const [loaded, setLoaded] = useState(false)
  // Первый материал в пустой библиотеке — тихая подсказка, где настраивается агент (вместо анкеты первого входа)
  const hadNone = useRef<boolean | null>(null)
  useEffect(() => {
    if (!loaded) return
    if (hadNone.current && references.length > 0) notify(t('Агент разбирает материал. Как ему отвечать — настраивается в «Памяти»'))
    hadNone.current = references.length === 0
  }, [loaded, references.length])
  const reload = () => library.list<Reference>().then((list) => { setReferences(list); setLoaded(true); setLoadError('') }).catch((error: Error) => setLoadError(error.message))
  useEffect(() => { void reload() }, [])
  // Пока модель описывает или собирает код — раз в 3 секунды забираем список, чтобы подтянуть результат.
  const busy = references.some((item) => item.describing || item.converting || item.fetching || item.digesting || item.asking)
  // Пока агент в карточке работает — раз в секунду забираем ход работы для строки статуса
  const [progress, setProgress] = useState<Record<string, AgentProgress>>({})
  const agentBusy = references.some((item) => item.digesting || item.asking)
  useEffect(() => {
    if (!agentBusy) { setProgress({}); return }
    const timer = setInterval(() => { library.progress().then(setProgress).catch(() => {}) }, 1000)
    return () => clearInterval(timer)
  }, [agentBusy])
  useEffect(() => {
    if (!busy) return
    const timer = setInterval(() => { void reload() }, 3000)
    return () => clearInterval(timer)
  }, [busy])

  const update = (id: string, patch: Partial<Reference>) => {
    setReferences((list) => list.map((item) => item.id === id ? { ...item, ...patch } : item))
    // Состав подборок поменялся — порядок подборок (и полки) держит сервер, перечитываем
    void library.update(id, patch).then(() => { if ('boards' in patch) void library.boards().then(setBoards) })
  }
  // «В код» — сборка 1:1 в фоне (library-plugin.ts); готово — «Скопировать код».
  const convert = (id: string, feedback?: string) => {
    setReferences((list) => list.map((item) => item.id === id ? { ...item, converting: true, convertError: undefined } : item))
    void library.convert(id, feedback)
  }

  // В корзину (откатывается): уведомление с «Отменить» возвращает карточки из корзины
  const removeMany = async (ids: string[]) => {
    setReferences((list) => list.filter((item) => !ids.includes(item.id)))
    try {
      const results = await Promise.all(ids.map((id) => library.remove(id)))
      notify(ids.length === 1 ? t('Карточка в корзине') : t('{n} {n2} в корзине', { n: ids.length, n2: cardsWord(ids.length) }), {
        undo: () => void (async () => { let failed = false; for (const result of results) await library.restore(result.trashName).catch(() => { failed = true }); if (failed) notifyError(t('Не удалось вернуть из корзины')); await reload(); void loadTrash() })(),
      })
    } catch { notifyError(t('Не удалось удалить')); void reload() }
  }
  const removeReference = (id: string) => void removeMany([id])

  // Подсказка тегов в окне добавления (grill-tag-hints.md, 2026-10-04): только то, что связано с этой ссылкой —
  // смысл страницы (заголовок и описание, без модели) ×10 и теги карточек с того же сайта ×1. Последние и частые в space
  // не подсказываем: к материалу не относятся (фильм получал «UX»). Нечего подсказать — строки нет
  const tagHints = (link: string, _folderId?: string, page = '') => {
    const host = sourceHost(link)
    const known = new Set(collectionList.map((item) => item.name))
    const score = new Map<string, number>()
    if (host) references.filter((item) => sourceHost(item.source) === host).forEach((item) => collectionsOf(item).forEach((name) => { if (known.has(name)) score.set(name, (score.get(name) ?? 0) + 1) }))
    tagsByMeaning(page, collectionList).forEach((name) => score.set(name, (score.get(name) ?? 0) + 10))
    return [...score.entries()].sort((a, b) => b[1] - a[1]).map(([name]) => name)
  }
  // «Отменить» у добавления — карточка тихо уходит в корзину (без второго уведомления)
  const undoAdd = (id: string) => () => { setReferences((list) => list.filter((item) => item.id !== id)); void library.remove(id).catch(() => { notifyError(t('Не удалось отменить добавление')); void reload() }) }
  // Добавление без формы: файл (картинка или видео) или ссылка.
  const addFile = async (file: File, fields: Partial<AddFields> = {}) => {
    if (!/^(image|video)\//.test(file.type)) return undefined
    const format: Format = file.type.startsWith('video') ? 'video' : 'image'
    const url = URL.createObjectURL(file)
    const { poster, ratio } = await probe(url, format)
    let saved: Reference
    try { saved = await library.add<Reference>({ title: file.name.replace(/\.[^.]+$/, '') || t('Скриншот'), meaning: '', source: file.name, format, image: poster, video: format === 'video' ? url : undefined, ratio, technique: '', collections: [], ...fields, stage: 'new', tags: [] }) } catch { notifyError(t('Не удалось добавить файл')); return }
    setReferences((list) => [saved, ...list])
    notify(t('Карточка добавлена'), { undo: undoAdd(saved.id) })
    return saved.id
  }
  // Ссылку разбирает сервер: ролик YouTube, статья или пин Pinterest. Плитка появляется сразу, содержимое — по мере загрузки.
  const addNote = async (text: string, fields: Partial<AddFields> = {}) => {
    let saved: Reference
    try { saved = await library.addNote<Reference>(text, { folder: fields.folder, collections: fields.collections }) } catch { notifyError(t('Не удалось добавить заметку')); return }
    setReferences((list) => list.some((item) => item.id === saved.id) ? list : [saved, ...list])
    notify(t('Заметка добавлена'), { undo: undoAdd(saved.id) })
  }
  // Холст: пустая доска в текущей папке (без агента и описания), сразу открывается на всю страницу
  // template — ключ шаблона цепочки: холст сам разложит его при открытии (canvas-page читает метку из sessionStorage)
  const addCanvas = async (template?: string) => {
    let saved: Reference
    try { saved = await library.createCanvas<Reference>({ folder: currentFolder?.id, ...(template ? { title: TEMPLATES.find((item) => item.key === template)?.label } : {}) }) } catch { notifyError(t('Не удалось создать холст')); return }
    setReferences((list) => [saved, ...list])
    if (template) try { sessionStorage.setItem('refkit.pendingTemplate', JSON.stringify({ id: saved.id, key: template })) } catch { /* без метки холст просто откроется пустым */ }
    openCard(saved.id)
  }
  const addLink = async (link: string, fields: Partial<AddFields> = {}) => {
    let saved: Reference
    try { saved = await library.addLink<Reference>(link, fields) } catch { notifyError(t('Не удалось добавить ссылку')); return undefined }
    const existed = references.some((item) => item.id === saved.id)
    setReferences((list) => list.some((item) => item.id === saved.id) ? list : [saved, ...list]) // повтор — сервер вернул уже существующий
    notify(existed ? t('Эта ссылка уже в библиотеке') : t('Ссылка добавлена'), existed ? {} : { undo: undoAdd(saved.id) })
    return saved.id
  }
  const askAgent = (id: string, command: string, extra?: Parameters<typeof library.ask>[2]) => {
    // Ответ на «Поискать в сети?» — вопрос из ленты убираем сразу, как и сервер: иначе просьба на миг видна дважды
    setReferences((list) => list.map((item) => item.id === id ? { ...item, asking: true, askError: undefined, thread: extra?.web && item.thread?.at(-1)?.webAsk ? item.thread.slice(0, -1) : item.thread } : item))
    void library.ask(id, command, extra)
  }
  // «Запомнить: …?» под ответом в карточке — сервер отвечает карточкой с обновлённой лентой
  const rememberAt = async (id: string, at: number, accept: boolean) => {
    const saved = await library.remember<Reference>(id, at, accept)
    setReferences((list) => list.map((item) => item.id === id ? { ...item, thread: saved.thread } : item))
  }
  // Найденное в сети → новый реф в библиотеке
  const saveFound = async (id: string, at: number, index: number) => {
    const saved = await library.saveFound<Reference>(id, at, index)
    setReferences((list) => [saved, ...list])
  }
  // Предложенный тег: сервер отвечает карточкой; принят — словарь поменялся, перечитываем
  const answerTagOffer = async (id: string, accept: boolean) => {
    setReferences((list) => list.map((item) => item.id === id ? { ...item, tagOffer: undefined } : item))
    const saved = await library.tagOffer<Reference>(id, accept)
    setReferences((list) => list.map((item) => item.id === id ? saved : item))
    if (accept) setCollectionList(await library.collections())
  }
  // Правка текста диффом: сервер отвечает карточкой с обновлённой лентой (и текстом)
  const editAt = async (id: string, at: number, action: 'apply' | 'reject' | 'undo') => {
    const saved = await library.editAt<Reference>(id, at, action)
    setReferences((list) => list.map((item) => item.id === id ? saved : item))
  }
  // «Сделать действием?» под ответом в карточке
  const makeActionAt = async (id: string, at: number, accept: boolean) => {
    const saved = await library.makeAction<Reference>(id, at, accept)
    setReferences((list) => list.map((item) => item.id === id ? { ...item, thread: saved.thread } : item))
  }
  // Ответ агента → заметка: новая плитка сразу первой
  const saveNote = async (id: string, at: number) => {
    const saved = await library.saveNote<Reference>(id, at)
    setReferences((list) => [saved, ...list])
  }
  // Стоп — прервать выжимку или просьбу; в ленту ничего не пишется
  const stopAgent = (id: string) => {
    setReferences((list) => list.map((item) => item.id === id ? { ...item, asking: false, digesting: false } : item))
    void library.stop(id)
  }
  // Разговор: новый (без to) или прошлый; сервер отвечает карточкой — берём номер текущего
  const openConversation = (id: string, to?: number) => {
    void library.conversation<Reference>(id, to).then((meta) => setReferences((list) => list.map((item) => item.id === id ? { ...item, conversation: meta.conversation } : item)))
  }
  // Выжимка по кнопке — когда на сервере выключен autoDigest или прошлая попытка не удалась.
  // «Описать»: картинку описывает агент, остальное — через разбор; плитка показывает работу, список опрашивается как обычно
  const describeRef = (id: string) => {
    const item = references.find((reference) => reference.id === id)
    const image = Boolean(item?.image.startsWith('/library/') && !item?.kind)
    setReferences((list) => list.map((reference) => reference.id === id ? { ...reference, ...(image ? { describing: true } : { digesting: true }) } : reference))
    void library.describe(id)
  }
  const makeDigest = (id: string) => {
    setReferences((list) => list.map((item) => item.id === id ? { ...item, digesting: true, digestError: undefined } : item))
    void library.digest(id)
  }
  // Ссылка не открылась — ещё раз, без удаления и повторной вставки
  const refetch = (id: string) => {
    setReferences((list) => list.map((item) => item.id === id ? { ...item, fetching: true, fetchError: undefined } : item))
    void library.refetch(id)
  }
  // ⌘V на холсте: файл или ссылка из буфера становится материалом библиотеки (во «Входящих») и сразу ложится карточкой на доску
  const addMaterial = async (input: { files?: File[]; link?: string }) => {
    const ids: string[] = []
    for (const file of input.files ?? []) { const id = await addFile(file); if (id) ids.push(id) }
    if (input.link) { const id = await addLink(input.link); if (id) ids.push(id) }
    return ids
  }
  // ⌘V и перетаскивание открывают окно добавления (grill-minimal.md); сохраняется по «Сохранить»
  const [draft, setDraft] = useState<AddDraft | null>(null)
  const [draftFolder, setDraftFolder] = useState<string | undefined>(undefined) // «+» в ноде-папке на холсте: материал сразу ложится в эту папку
  const openDraft = (next: AddDraft) => {
    if (next.note) { setDraft({ note: true }); return }
    const files = next.files?.filter((file) => /^(image|video)\//.test(file.type))
    if (next.link !== undefined || files?.length) setDraft(next.link !== undefined ? next : { files })
  }
  const saveDraft = (fields: AddFields) => {
    const link = fields.link ?? draft?.link
    if (fields.note) void addNote(fields.note, fields)
    else if (link) void addLink(link, fields)
    draft?.files?.forEach((file) => void addFile(file, fields))
    setDraft(null); setDraftFolder(undefined)
    // Сохранил со страницы Spaces, Actions или Тегов — там новой карточки не видно: открываем space, куда она легла (без выбора — «Входящие»)
    if (!folder && (foldersPage || actionsPage || tagsPage || graphPage || flyPage || memoryLike)) {
      const target = fields.folder ?? folders.find((item) => item.inbox)?.id
      if (target) openFolder(target)
    }
  }
  // ⌘V в любом месте библиотеки: скриншот из буфера или ссылка. В полях ввода — обычная вставка.
  useEffect(() => {
    const onPaste = (event: ClipboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target?.closest('input, textarea, [contenteditable="true"]')) return
      const files = [...(event.clipboardData?.files ?? [])]
      const text = event.clipboardData?.getData('text/plain').trim() ?? ''
      if (files.length) { event.preventDefault(); openDraft({ files }) }
      else if (/^https?:\/\//.test(text)) { event.preventDefault(); openDraft({ link: text }) }
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  })

  const [type, setType] = useState<TypeId>('all')
  // Авторские подборки (library/boards.json) — собираются руками перетаскиванием плитки на панель; выбранная — фильтр, как тип
  const [boards, setBoards] = useState<Board[]>([])
  useEffect(() => { library.boards().then(setBoards).catch(() => {}) }, [])
  // Папки (v2, как Spaces у Fabric): folder — открытая папка (id); foldersPage — страница всех папок
  const [folders, setFolders] = useState<FolderItem[]>([])
  const [folder, setFolder] = useState<string | null>(null)
  // Раздела «Библиотека» нет (владелец 2026-10-01): главная — страница папок
  // Стартовый экран — Хронология (скептик 2026-10-14): материалы и «Пересказ» дня сразу, а не эмодзи-папки, повторяющие дерево
  const [foldersPage, setFoldersPage] = useState(false)
  const [actionsPage, setActionsPage] = useState(false)
  // Timeline (как у Fabric): всё по дням, у карточки — в каком она space; Summary дня — агент по клику
  const [timelinePage, setTimelinePage] = useState(true)
  // Рейка слева (владелец 2026-10-29): узкая полоса иконок или раскрытая с подписями; ширина и состояние помнятся в браузере.
  // --rail-w на <html> — для всего, что стоит рядом с рейкой (острова холста, окно агента): сдвигаются вместе с содержимым
  const [railOpen, setRailOpen] = useState(() => { try { return localStorage.getItem('refkit.rail') === 'open' } catch { return false } })
  const [railWidth, setRailWidth] = useState(() => { try { return Math.min(360, Math.max(160, Number(localStorage.getItem('refkit.railWidth')) || 224)) } catch { return 224 } })
  useEffect(() => {
    try { localStorage.setItem('refkit.rail', railOpen ? 'open' : 'closed'); localStorage.setItem('refkit.railWidth', String(railWidth)) } catch { /* без памяти — по умолчанию */ }
    document.documentElement.style.setProperty('--rail-w', railOpen ? `${railWidth}px` : '56px')
  }, [railOpen, railWidth])
  const [tagsPage, setTagsPage] = useState(false)
  // Страница «Граф» (grill-graph.md): понятия и связи между материалами; строит модель только по кнопке
  const [graphPage, setGraphPage] = useState(false)
  // Память — страницей на месте ленты, как Граф и Теги (навигация v3, владелец 2026-10-14)
  const [settingsPage, setSettingsPage] = useState(false)
  const [foldersView, setFoldersView] = useState<'grid' | 'list'>(() => { try { return localStorage.getItem('refkit.folders.view') === 'list' ? 'list' : 'grid' } catch { return 'grid' } })
  useEffect(() => { try { localStorage.setItem('refkit.folders.view', foldersView) } catch { /* приватный режим */ } }, [foldersView])
  const memoryLike = settingsPage // страницы без ленты: фильтры, меню и «Назад» им не нужны
  // «Настройки» открываются из меню профиля и с холста; закрытие возвращает туда, откуда открыли (если это был холст или карточка), иначе в начало
  const settingsFrom = useRef('')
  const openSettings = () => { settingsFrom.current = window.location.hash; openFolder(null); setFoldersPage(false); setSettingsPage(true) }
  const closeSettings = () => { openFolder(null); if (settingsFrom.current.startsWith('#/card/')) window.location.hash = settingsFrom.current }
  useEffect(() => {
    if (!settingsPage) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return
      if ((event.target as HTMLElement | null)?.closest('input, textarea, [role="dialog"], [role="listbox"], [role="menu"]')) return
      closeSettings()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }) // eslint-disable-line react-hooks/exhaustive-deps
  const [spaceMode, setSpaceMode] = useState<'graph' | 'fly'>(() => { try { return localStorage.getItem('refkit.space-mode') === 'fly' ? 'fly' : 'graph' } catch { return 'graph' } })
  useEffect(() => { try { localStorage.setItem('refkit.space-mode', spaceMode) } catch { /* приватный режим — не запоминаем */ } }, [spaceMode])
  const [flyPage, setFlyPage] = useState(false) // раздел «Полёт»: летишь сквозь материалы (fly-page.tsx)
  // Открытая карточка — нижняя панель видна и над ней, агент из панели спрашивает про неё
  const [shownCard, setShownCard] = useState<string | null>(null)
  // Комментарий на области картинки (как в Figma): кнопка в нижней панели, только у открытой карточки-картинки; C и Esc — в карточке
  const [pinMode, setPinMode] = useState(false)
  useEffect(() => { setPinMode(false) }, [shownCard])
  const shownRef = shownCard ? references.find((item) => item.id === shownCard) : undefined
  const canPinShown = Boolean(shownRef && !shownRef.kind && shownRef.format === 'image' && shownRef.image)
  const [agentAsk, setAgentAsk] = useState<{ text: string; n: number } | null>(null)
  useEffect(() => { library.folders().then(setFolders).catch(() => {}) }, [])
  // Материал без папки (создан мимо v2: v1, MCP, импорт) считаем лежащим во «Входящих»
  const inboxId = folders.find((item) => item.inbox)?.id
  const placeOf = (reference: Reference) => reference.folder ?? inboxId
  const [board, setBoard] = useState<string | null>(null)
  // Какую плитку сейчас тащат: панель показывает «Новая подборка», над сеткой появляется полка
  // Перетаскивание строки space в дереве: что тащат и куда встанет (линия над строкой или под ней)
  const [draggingFolder, setDraggingFolder] = useState<string | null>(null)
  const [pickedFolders, setPickedFolders] = useState<string[]>([]) // выделенные в сайдбаре spaces (Shift, Cmd)
  const [rowDrop, setRowDrop] = useState<{ over: string; before: boolean; into?: boolean } | null>(null)
  // Порядок — по дате: новые или старые сверху. Свой порядок и перестановку мышью убрали (v2, владелец 2026-10-01)
  const [sortMode, setSortMode] = useState<SortMode>(() => { try { const saved = localStorage.getItem('refkit.sort'); return sorts.some((item) => item.id === saved) ? saved as SortMode : 'created' } catch { return 'created' } })
  // Направление: по умолчанию — новые сверху и А → Я; выбор помнит браузер
  const [descending, setDescending] = useState(() => { try { return localStorage.getItem('refkit.sort-desc') !== '0' } catch { return true } })
  useEffect(() => { try { localStorage.setItem('refkit.sort', sortMode); localStorage.setItem('refkit.sort-desc', descending ? '1' : '0') } catch { /* приватный режим */ } }, [sortMode, descending])
  const currentSort = sorts.find((item) => item.id === sortMode)!
  const ordered = useMemo(() => {
    const key = (item: Reference): string | number => sortMode === 'title' ? item.title.toLowerCase() : sortMode === 'kind' ? typeOf(item) : sortMode === 'updated' ? (item.updatedAt ?? item.createdAt ?? 0) : (item.createdAt ?? 0)
    // Даты: «по убыванию» — новые сверху; текст: «по убыванию» — А → Я (как стрелка ↓ у Fabric)
    const text = sortMode === 'title' || sortMode === 'kind'
    return [...references].sort((a, b) => {
      const [x, y] = [key(a), key(b)]
      const order = typeof x === 'string' ? x.localeCompare(String(y), 'ru') : x - (y as number)
      return (text ? order : -order) * (descending ? 1 : -1) || (b.createdAt ?? 0) - (a.createdAt ?? 0)
    })
  }, [references, sortMode, descending])
  // Содержимое папок для колонки Spaces: название карточки под строкой папки, порядок — как в ленте (новые сверху)
  const sensors = useSensors(
    useSensor(TileSensor, { activationConstraint: { distance: 6 } }), // клик по плитке и её кнопкам — не перетаскивание
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }), // на тач — долгое нажатие, прокрутка не ломается
  )
  // Выделение (рамка, ⌘/Shift-клик): тащишь любую из выделенных — едут все, пачкой (group)
  const [selected, setSelected] = useState<string[]>([])
  const anchor = useRef<string | null>(null) // от какой плитки Shift-клик выделяет диапазон
  const group = useRef<string[]>([]) // пачка, которую тащат: в ref, чтобы старт перетаскивания не перерисовывал ленту
  const endDrag = () => { dragState.set(null); group.current = []; setDraggingFolder(null); setRowDrop(null) }
  // Перетаскивание — только чтобы бросить на подборку или полку; лента при этом не переставляется
  const dragKind = useRef<'tile' | 'folder'>('tile') // что тащат: от этого зависит, как показывается бросок (папка — стандартный переезд строки)
  const onDragStart = ({ active }: DragStartEvent) => {
    const id = cardOf(active)
    dragKind.current = id.startsWith('frow:') ? 'folder' : 'tile'
    if (id.startsWith('ftile:')) return // плитку папки на канвасе тащим как есть: ленту и панели не трогаем
    if (id.startsWith('frow:')) {
      rowSnapshot.current = [...document.querySelectorAll<HTMLElement>('[data-folder-row]')].map((node) => { const box = node.getBoundingClientRect(); return { id: node.dataset.folderRow!, top: box.top, height: box.height } })
        .sort((a, b) => a.top - b.top).map((item, index, all) => ({ ...item, height: all[index + 1] ? all[index + 1].top - item.top : item.height })) // без зазоров между строками
      setDraggingFolder(id.slice(5)); return
    }
    // Состояние перетаскивания — вне React страницы (dragState, ref): лента при захвате не перерисовывается
    if (!id.startsWith('shelf-all')) group.current = selected.includes(id) ? ordered.map((item) => item.id).filter((item) => selected.includes(item)) : [id]
    dragState.set(id, group.current.length ? group.current : [id])
  }
  // Куда встанет space: строка под курсором и верхняя ли половина (над ней) или нижняя (под ней)
  // Курсор над приглушённой копией (под ним нет цели), но внутри сайдбара — место вставки держим, иначе копия мигает.
  // Вне сайдбара не держим: отпустил в ленте — space остаётся где был
  const overGhost = (event: { over: DragEndEvent['over']; activatorEvent: Event; delta: { x: number; y: number } }) => {
    const start = event.activatorEvent as PointerEvent
    const [x, y] = [start.clientX + event.delta.x, start.clientY + event.delta.y]
    const box = document.querySelector('[data-sidebar="sidebar"]')?.getBoundingClientRect()
    return Boolean(box && x >= box.left && x <= box.right && y >= box.top && y <= box.bottom)
  }
  // Раскладка строк spaces на момент, когда схватили (как Finder): место вставки считаем по ней, а не по живым строкам —
  // иначе раскрытый промежуток сдвигал строки, место менялось, промежуток прыгал (владелец 2026-10-03: «дёрганая анимация»)
  const rowSnapshot = useRef<Array<{ id: string; top: number; height: number }>>([])
  const rowTarget = (event: { over: DragEndEvent['over']; activatorEvent: Event; delta: { y: number } }) => {
    const y = (event.activatorEvent as PointerEvent).clientY + event.delta.y
    const hit = rowSnapshot.current.find((item) => y >= item.top && y < item.top + item.height)
    if (!hit) return null
    // Верхняя четверть строки — выше неё, нижняя — ниже, середина — внутрь (вложенный space); «Входящие» принимают только «после»
    const { top, height } = hit
    const inbox = folders.find((item) => item.id === hit.id)?.inbox
    return { over: hit.id, before: y < top + height / 2, into: !inbox && y >= top + height * 0.25 && y <= top + height * 0.75 }
  }
  // Перенос space на другой уровень — с уведомлением; «Отменить» возвращает на прежний уровень и место среди прежних соседей. Смена порядка в том же списке — тихая
  const moveSpace = (id: string, parent: string | null, after: string | null) => {
    const item = folders.find((other) => other.id === id)
    if (!item) return
    const oldParent = item.parent ?? null
    const siblings = folders.filter((other) => (other.parent ?? null) === oldParent).sort((a, b) => Number(Boolean(b.inbox)) - Number(Boolean(a.inbox)))
    const oldAfter = siblings[siblings.findIndex((other) => other.id === id) - 1]?.id ?? null
    library.moveFolder(id, parent, after).then((next) => {
      setFolders(next)
      if (parent === oldParent) return
      const to = next.find((other) => other.id === parent)
      notify(to ? t('Папка «{name}» перенесена в «{name2}»', { name: item.name, name2: to.name }) : t('Папка «{name}» на верхнем уровне', { name: item.name }), { undo: () => void library.moveFolder(id, oldParent, oldAfter).then(setFolders).catch(() => {}) })
    }).catch(() => notifyError(t('Не удалось перенести папку')))
  }
  // Встать рядом с целью, на её уровне; уровень определяет строка, на которую целятся. «Входящие» — первые, выше них не встать
  const dropFolderRow = (id: string, target: { over: string; before: boolean; into?: boolean }) => {
    const to = folders.find((item) => item.id === target.over)
    if (!to || to.id === id) return
    if (target.into) { moveSpace(id, to.id, null); return }
    const siblings = folders.filter((item) => item.parent === to.parent && item.id !== id).sort((a, b) => Number(Boolean(b.inbox)) - Number(Boolean(a.inbox)))
    const at = siblings.findIndex((item) => item.id === to.id)
    const previous = to.inbox ? to : target.before ? siblings[at - 1] : to
    moveSpace(id, to.parent ?? null, previous?.id ?? null)
  }
  // Тащат выделенный space — едут все выделенные, в порядке сайдбара; невыделенный — только он
  const dragGroup = (id: string) => pickedFolders.includes(id) ? folders.filter((item) => pickedFolders.includes(item.id)).map((item) => item.id) : [id]
  // Пачка spaces: по одному подряд, каждый следующий — сразу за предыдущим; «Отменить» возвращает всех на прежние места.
  // Внутрь себя или своего вложенного не кладём
  const dropFolders = async (ids: string[], target: { over: string; before: boolean; into?: boolean }) => {
    if (ids.length === 1) { dropFolderRow(ids[0], target); setPickedFolders(ids); return }
    const to = folders.find((item) => item.id === target.over)
    const insideMoved = (id?: string): boolean => Boolean(id && (ids.includes(id) || insideMoved(folders.find((item) => item.id === id)?.parent)))
    if (!to || insideMoved(to.id)) return
    const order = (parent?: string) => folders.filter((item) => item.parent === parent).sort((a, b) => Number(Boolean(b.inbox)) - Number(Boolean(a.inbox)))
    const before = ids.map((id) => { const item = folders.find((other) => other.id === id)!; const list = order(item.parent); return { id, parent: item.parent ?? null, after: list[list.findIndex((other) => other.id === id) - 1]?.id ?? null } })
    let parent: string | null = to.id
    let after: string | null = null
    if (!target.into) {
      const siblings = order(to.parent).filter((item) => !ids.includes(item.id))
      const at = siblings.findIndex((item) => item.id === to.id)
      parent = to.parent ?? null
      after = (to.inbox ? to : target.before ? siblings[at - 1] : to)?.id ?? null
    }
    try {
      let next = folders
      for (const id of ids) { next = await library.moveFolder(id, parent, after); after = id }
      setFolders(next); setPickedFolders(ids) // как Finder: перенесённые остаются выделенными
      notify(t('Перенесено папок: {n}', { n: ids.length }), { undo: () => void (async () => { let back = next; for (const item of before) back = await library.moveFolder(item.id, item.parent, item.after); setFolders(back) })().catch(() => notifyError(t('Не удалось вернуть'))) })
    } catch { notifyError(t('Не удалось перенести папки')); void library.folders().then(setFolders).catch(() => {}) }
  }
  // «Выше» / «Ниже» из меню — на одну позицию среди соседей, тем же ходом
  // «Создать»: одно меню и в шапке («⋮»), и по правому клику на пустом месте канваса; значок в круге, потому что меню прячет значки-«дети» пункта
  const createEntries = [
    { label: t('Заметка'), icon: StickyNote, run: () => openDraft({ note: true }) },
    { label: t('Холст'), icon: Network, run: () => void addCanvas() },
    { label: t('Загрузить'), icon: Upload, run: () => fileInput.current?.click() },
    { label: t('Ссылка'), icon: Link2, run: () => openDraft({ link: '' }) },
    { label: t('Новая папка'), icon: FolderPlus, run: () => void createFolder(currentFolder?.id) },
  ] as const
  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    const id = cardOf(active)
    if (id.startsWith('ftile:')) {
      // Плитку папки бросили на другую: встаёт перед ней или после — смотря, левее или правее центра цели она оказалась
      const overId = over ? String(over.id) : '', target = overId.startsWith('folder-tile:') ? overId.slice('folder-tile:'.length) : ''
      if (over && target && target !== id.slice('ftile:'.length)) {
        const moved = event.active.rect.current.translated
        dropFolderRow(id.slice('ftile:'.length), { over: target, before: moved ? moved.left + moved.width / 2 < over.rect.left + over.rect.width / 2 : true })
      }
      endDrag(); return
    }
    if (id.startsWith('frow:') && over?.id === 'trash') { void deleteFolders(dragGroup(id.slice(5))); endDrag(); return }
    if (id.startsWith('frow:')) { const target = rowTarget(event) ?? (overGhost(event) ? rowDrop : null); if (target) dropFolders(dragGroup(id.slice(5)), target); endDrag(); return }
    const target = over ? String(over.id) : ''
    const ids = id.startsWith('shelf-all') ? pinned.map((item) => item.id) : group.current.length ? group.current : [id]
    if (id.startsWith('shelf-all') && target.startsWith('shelf')) { endDrag(); return } // полку — на саму себя: ничего
    if (target === 'trash') void removeMany(ids)
    else if (target === 'new-folder') void createFolder(undefined, ids)
    // folder: — строка в сайдбаре, folder-tile: — плитка на странице Spaces; id цели у них разные: одинаковые стирали друг друга в реестре dnd-kit
    else if (target.startsWith('folder:') || target.startsWith('folder-tile:')) moveTo(ids, target.slice(target.indexOf(':') + 1))
    else if (target.startsWith('board:')) ids.forEach((item) => addToBoard(target.slice(6), item))
    else if (target === 'new-board') void createBoard(ids)
    else if (target.startsWith('shelf')) ids.forEach((item) => pin(item, true))
    endDrag()
  }
  // Раскладка по строкам: плитка идёт в самый короткий столбец — «раньше в порядке» значит «выше» (CSS columns
  // раскладывали вниз по столбцу, и перестановка работала непредсказуемо). Столбцов — как было: 2 / 3 с 1024 / 4 с 1280
  // Вид ленты (grill-order.md): мозаика, список, карта (сетку владелец убрал 2026-09-27; карта — grill-mindmap.md). Запоминается в браузере — удобство, не данные
  const [showFilters, setShowFilters] = useState(true)
  const [view, setView] = useState<View>(() => { try { const saved = localStorage.getItem('refkit.view'); return views.some((item) => item.id === saved) ? saved as View : 'mosaic' } catch { return 'mosaic' } })
  useEffect(() => { try { localStorage.setItem('refkit.view', view) } catch { /* приватный режим — не запоминаем */ } }, [view])
  // Ширина сетки — для раскладки плиток по координатам. Источник один — ResizeObserver: clientWidth округлял до целого,
  // contentRect — нет, они перебивали друг друга, и сетка перерисовывалась по кругу. Ref стабильный — наблюдатель один
  const [gridWidth, setGridWidth] = useState(0)
  const gridObserver = useRef<ResizeObserver | null>(null)
  const gridNode = useRef<HTMLDivElement | null>(null)
  const gridRef = useCallback((node: HTMLDivElement | null) => {
    gridObserver.current?.disconnect()
    gridNode.current = node
    if (!node) return
    // Ширина меняется кадр за кадром, пока едет рейка или тянут окно: сетку пересчитываем не чаще раза в 90 мс, последняя ширина — обязательно
    let last = 0, timer: ReturnType<typeof setTimeout> | undefined
    gridObserver.current = new ResizeObserver(([entry]) => {
      const width = entry.contentRect.width, wait = 90 - (performance.now() - last)
      clearTimeout(timer)
      if (wait <= 0) { last = performance.now(); setGridWidth(width) }
      else timer = setTimeout(() => { last = performance.now(); setGridWidth(width) }, wait)
    })
    gridObserver.current.observe(node)
  }, [])
  // Размер плитки по колесу (база × масштаб) задаёт число колонок; ширину плитки считает mosaic() — на всю ширину сетки
  const columnCount = useTileColumns(gridWidth, type === 'canvas' ? canvasTileMin : undefined) // подписка на число колонок, а не на масштаб: см. lib/tile-scale
  // Вынуть из подборки (не удалить материал): быстрый путь из ленты подборки — кнопка на плитке и пункт правого клика
  // Любой переход из боковой панели закрывает открытую карточку: ходить по папкам, не нажимая её крестик
  const openFolder = (id: string | null) => { if (cardFromHash()) { fromFeed.current = false; window.location.hash = '' } setFolder(id); setBoard(null); setType('all'); setTrashOpen(false); setFoldersPage(id === null); setActionsPage(false); setTimelinePage(false); setTagsPage(false); setGraphPage(false); setFlyPage(false); setSettingsPage(false); setSelected([]) }
  // Ссылка из расширения (collect): #/folder/<id> открывает папку-сессию, хеш сразу сбрасывается — перезагрузка не вернёт её
  useEffect(() => {
    const open = () => {
      const id = window.location.hash.match(/^#\/folder\/([\w-]+)/)?.[1]
      if (!id) return
      history.replaceState(null, '', window.location.pathname + window.location.search)
      openFolder(id)
    }
    open()
    window.addEventListener('hashchange', open)
    return () => window.removeEventListener('hashchange', open)
  }, [])
  // В папку = переместить: материал лежит в одной папке
  // Перенос карточек — с уведомлением; «Отменить» возвращает каждую в её прежний space
  const moveTo = (ids: string[], to: string, toName?: string) => {
    const before = new Map(ids.map((id) => { const item = references.find((reference) => reference.id === id); return [id, item ? placeOf(item) : undefined] as const }))
    const moved = ids.filter((id) => before.get(id) !== to)
    ids.forEach((id) => update(id, { folder: to }))
    setSelected([])
    if (!moved.length) return
    const name = toName ?? folders.find((item) => item.id === to)?.name ?? 'space' // имя новой папки приходит параметром: список spaces в замыкании ещё старый
    notify(moved.length === 1 ? t('Перенесено в «{name}»', { name }) : t('Перенесено в «{name}»: {n} {n2}', { name, n: moved.length, n2: cardsWord(moved.length) }), { undo: () => moved.forEach((id) => update(id, { folder: before.get(id) })) })
  }
  const createFolder = async (parent?: string, ids?: string[]) => {
    const result = await library.createFolder(t('Новая папка'), parent)
    setFolders(result.folders)
    if (ids?.length) moveTo(ids, result.id, t('Новая папка')); else { openFolder(result.id); notify(t('Папка создана'), { undo: () => void deleteFolder(result.id, true) }) }
  }
  const renameFolder = (id: string, name: string) => void library.updateFolder(id, { name }).then(setFolders)
  // Несколько spaces разом (меню пачки, бросок в «Корзину»): одно уведомление; карточки из них уходят на уровень выше
  const deleteFolders = async (ids: string[]) => {
    if (ids.length === 1) { await deleteFolder(ids[0]); return }
    for (const id of ids) await deleteFolder(id, true)
    setPickedFolders([])
    notify(t('Удалено папок: {n}', { n: ids.length }))
  }
  const deleteFolder = async (id: string, quiet = false) => {
    const gone = folders.find((item) => item.id === id)
    setFolders(await library.deleteFolder(id))
    await reload()
    if (folder === id) openFolder(gone?.parent ?? null)
    if (!quiet) notify(t('Папка «{name}» удалена', { name: gone?.name ?? '' }))
  }

  const addToBoard = (name: string, id: string) => {
    const item = references.find((reference) => reference.id === id)
    if (item && !item.boards?.includes(name)) update(id, { boards: [...(item.boards ?? []), name] })
  }
  // Название не спрашиваем: «Подборка N» сразу, переименовать — двойным кликом или из меню подборки
  const createBoard = async (id?: string | string[]) => {
    let number = 1
    while (boards.some((item) => item.name === t('Подборка {number}', { number }))) number += 1
    const name = t('Подборка {number}', { number })
    setBoards(await library.createBoard(name))
    for (const item of typeof id === 'string' ? [id] : id ?? []) addToBoard(name, item)
  }
  const currentFolder = folders.find((item) => item.id === folder)
  // Путь папки сверху вниз — для «хлебных крошек»
  const folderPath = (id?: string): FolderItem[] => { const item = folders.find((other) => other.id === id); return item ? [...folderPath(item.parent), item] : [] }
  const renameBoard = async (from: string, to: string) => {
    setBoards(await library.renameBoard(from, to))
    setReferences((list) => list.map((item) => item.boards?.includes(from) ? { ...item, boards: item.boards.map((other) => other === from ? to : other) } : item))
    if (board === from) setBoard(to)
  }
  const deleteBoard = async (name: string) => {
    setBoards(await library.deleteBoard(name))
    setReferences((list) => list.map((item) => item.boards?.includes(name) ? { ...item, boards: item.boards.filter((other) => other !== name) } : item))
    if (board === name) setBoard(null)
  }
  // Полка «под рукой» — временная, с чем работаю сейчас (как Top of Mind в mymind). Порядок — когда положили
  // Полка — подборка «Под рукой» (grill-taxonomy.md): положить под руку = положить в неё; порядок — её order
  const shelf = boards.find((item) => item.shelf)
  const onShelf = (reference: Reference) => Boolean(reference.boards?.includes(shelfName))
  const pin = (id: string, on: boolean) => {
    const item = references.find((reference) => reference.id === id)
    if (!item || onShelf(item) === on) return
    update(id, { boards: on ? [...(item.boards ?? []), shelfName] : (item.boards ?? []).filter((name) => name !== shelfName) })
    // Новый — в конец полки сразу, не дожидаясь сервера; сервер ответит тем же составом
    setBoards((list) => list.map((board) => board.shelf ? { ...board, order: on ? [...(board.order ?? []), id] : (board.order ?? []).filter((item) => item !== id) } : board))
  }
  const pinned = (shelf?.order ?? []).map((id) => references.find((item) => item.id === id)).filter((item): item is Reference => Boolean(item))
  // Начал прокручивать вниз — полка сразу сжимается в полоску поверх ленты (мелкая полка и чипы); вернулся к самому верху — снова полная.
  const mainRef = useRef<HTMLElement>(null)
  // Системное перетаскивание, начатое внутри приложения (картинка из карточки или плитки): лента его не принимает как
  // добавление — раньше отпущенная картинка открывала окно новой карточки (владелец 2026-10-03). Снаружи — как было
  const innerDrag = useRef(false)
  useEffect(() => {
    const start = () => { innerDrag.current = true }
    const end = () => { innerDrag.current = false }
    document.addEventListener('dragstart', start)
    document.addEventListener('dragend', end)
    return () => { document.removeEventListener('dragstart', start); document.removeEventListener('dragend', end) }
  }, [])
  // Разобрать полку вместе: сервер сразу заводит заметку (digesting) — она встаёт первой в сетке, синтез дописывается в фоне
  // Полка = заметка (решение владельца): клик по фону полки — карточка заметки полки (материалы + агент). Сервер заводит
  // заметку или обновляет её состав; карточка открывается сама (autoOpen) из скрытой точки у конца страницы
  const [shelfNote, setShelfNote] = useState<string | null>(null)
  // Навигация v3 (владелец 2026-10-14, сравнение navigation/compare.html): одна панель с подписями, агент колонкой слева сразу за ней.
  // Панель раскрыта при входе на экране от roomy; кнопка и ⌘B сворачивают её в полосу иконок.
  // Открыли агента на экране уже wide — панель сама сжимается в иконки и возвращается, когда агента закрыли (если сжала она сама)
  const [navOpen, setNavOpen] = useState(() => window.innerWidth >= roomy)
  const navAuto = useRef(false)
  const [agentOpen, setAgentShown] = useState(false)
  const [agentTab, setAgentTab] = useState<AgentTab>('agent') // вкладка окна агента: разговор, комментарии холста, активность
  const [infoSlot, setInfoSlot] = useState<HTMLElement | null>(null) // слот вкладки «Сведения»: туда карточка-страница кладёт описание, теги, комментарии
  const [memorySlot, setMemorySlot] = useState<HTMLElement | null>(null)
  const [commentsSlot, setCommentsSlot] = useState<HTMLElement | null>(null) // слот во вкладке «Комментарии», туда холст кладёт свою панель
  const [commentsCount, setCommentsCount] = useState(0)
  const notPhone = useMinWidth(compact)
  const setAgentOpen = (next: boolean) => {
    setAgentShown(next)
    if (next && navOpen && window.innerWidth < wide) { navAuto.current = true; setNavOpen(false) }
    if (!next && navAuto.current) { navAuto.current = false; setNavOpen(true) }
  }
  const myActions = useActions()
  // Контекст агента библиотеки (№21): карточки, про которые спрашивают, — чипом в поле; пусто — вся библиотека
  const [agentContext, setAgentContext] = useState<string[]>([])
  // Открыли агента из подборки — контекст по умолчанию она сама: чип с её названием, × — вся библиотека
  const [agentContextName, setAgentContextName] = useState<string | null>(null)
  const askAbout = (ids: string[], name: string | null = null) => { setAgentContext(ids); setAgentContextName(name) }
  // Корзина: список удалённых; пункт в боковой панели виден, пока она не пуста
  const [trash, setTrash] = useState<TrashItem[]>([])
  const [trashOpen, setTrashOpen] = useState(false)
  const loadTrash = () => library.trash<TrashItem>().then(setTrash).catch(() => {})
  useEffect(() => { void loadTrash() }, [references.length])
  // Корзина из меню профиля или «⋮»; открыта карточка-страница — сначала уходим из неё, иначе корзина откроется в спрятанной ленте
  const openTrash = () => { if (cardFromHash()) leaveCard(() => {}); openFolder(null); setFoldersPage(false); setTrashOpen(true); void loadTrash() }
  const restore = async (name: string) => { await library.restore(name).catch(() => notifyError(t('Не удалось вернуть из корзины'))); await reload(); void loadTrash() }
  const emptyTrash = async () => { await library.emptyTrash(); setTrash([]); setTrashOpen(false) }
  const [openNew, setOpenNew] = useState<string | null>(null)
  // Карточка страницей (идея 61, grill-card-page.md): адрес #/card/<id> — источник правды. Открыть — записать адрес
  // (плитка, полка, карта, ссылка агента, «уже есть» при добавлении); «назад» и Esc — шаг назад в истории, туда, откуда пришли.
  // Лента на время карточки спрятана, а не размонтирована: фильтры и выделение целы; прокрутку возвращаем сами
  const [cardId, setCardId] = useState(cardFromHash)
  // Стопка открытых карточек: с холста открыл материал — закрытие возвращает на холст, откуда пришли, а не в ленту
  // (флаг fromFeed знает только про ленту и теряется при перезагрузке или переходе по ссылке)
  const trail = useRef<string[]>([])
  const lastCard = useRef<string | null>(cardFromHash())
  useEffect(() => {
    const onChange = () => {
      const next = cardFromHash(), prev = lastCard.current
      if (!next) trail.current = []
      else if (prev && prev !== next) {
        if (trail.current[trail.current.length - 1] === next) trail.current.pop() // шаг назад
        else trail.current.push(prev)
      }
      lastCard.current = next
      setCardId(next)
    }
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])
  const fromFeed = useRef(false)
  const feedScroll = useRef(0)
  // Стабильная: карта держит её в зависимостях, новая на каждой перерисовке пересобирала узлы, и карта мигала
  // from — где была плитка: материал на странице «вырастает» из неё (FLIP, GrowFrom)
  const growFrom = useRef<{ id: string; rect: DOMRect } | null>(null)
  const openCard = useCallback((id: string, from?: DOMRect) => {
    growFrom.current = from ? { id, rect: from } : null
    if (!cardFromHash()) { fromFeed.current = true; feedScroll.current = mainRef.current?.scrollTop ?? 0 }
    window.location.hash = `#/card/${id}`
  }, [])
  const closeCard = useCallback(() => {
    if (trail.current.length) history.back() // карточка открыта из другой карточки (холст): назад — туда
    else if (fromFeed.current) { fromFeed.current = false; history.back() } else window.location.hash = ''
  }, [])
  // Пришли по ссылке и ушли из карточки крошкой — на ленту без шага назад
  const leaveCard = (then: () => void) => { fromFeed.current = false; window.location.hash = ''; then() }
  useEffect(() => { if (!cardId) requestAnimationFrame(() => { if (mainRef.current) mainRef.current.scrollTop = feedScroll.current }) }, [cardId])
  const openLinked = openCard
  const cardRef = cardId ? references.find((item) => item.id === cardId) : undefined
  const canvasOpen = Boolean(cardId && cardRef?.kind === 'canvas') // на открытом холсте нижняя панель несёт инструменты холста
  // Карточка-страница: сведения — вкладка окна агента. Само окно не открывается; ушли с карточки — вкладка возвращается к агенту
  const cardPageId = cardRef && !canvasOpen ? cardRef.id : null
  useEffect(() => {
    // Само ничего не открываем (владелец 2026-10-29): окно агента — по молнии внизу, сведения — по кнопке ⓘ в шапке карточки
    if (!cardPageId) setAgentTab((tab) => (tab === 'info' ? 'agent' : tab))
  }, [cardPageId]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { // холст на весь экран (план островов): рейка и окно агента лежат поверх него, поля и рамка окна убираются
    if (canvasOpen) document.documentElement.dataset.canvasOpen = '1'
    return () => { delete document.documentElement.dataset.canvasOpen }
  }, [canvasOpen])
  useEffect(() => { if (cardId && loaded && !cardRef) void loadTrash() }, [cardId, loaded, cardRef]) // eslint-disable-line react-hooks/exhaustive-deps
  const openShelf = async () => {
    const note = await library.shelf<Reference>()
    setReferences((list) => [note, ...list.filter((item) => item.id !== note.id)])
    setShelfNote(note.id); setOpenNew(note.id)
  }
  // × на материале в карточке набора: у заметки полки — снять с полки (сервер обновит состав), у разбора — убрать из sources
  const removeSource = (note: Reference, id: string) => {
    if (note.id === shelfNote) { pin(id, false); setTimeout(() => void reload(), 400) }
    else update(note.id, { sources: (note.sources ?? []).filter((item) => item !== id) })
  }
  const shelfNoteRef = references.find((item) => item.id === shelfNote)
  const shelfBusy = Boolean(shelfNoteRef?.digesting || shelfNoteRef?.asking)
  // Скинуть всё с полки — × справа при наведении; полка временная — без подтверждения. Заметка полки остаётся в библиотеке
  const shelfOverlay = !trashOpen && pinned.length > 0
  // Раздел «Холст» из меню: путь — просто «Холсты», как у Хронологии (без «Папки /»)
  const canvasSection = type === 'canvas' && !folder && !foldersPage && !board
  const filtersOn = showFilters && !trashOpen && !foldersPage && !actionsPage && !tagsPage && !graphPage && !flyPage && !memoryLike
  const overlayOn = filtersOn || shelfOverlay
  // Лента начинается под плавающими фильтрами и пинами: отступ сверху = их высота без градиентного хвоста и сдвига вверх, плюс воздух до первой секции
  const overlayRef = useRef<HTMLDivElement>(null)
  // Шапка живёт не всегда (при открытой карточке её нет в дереве) — поэтому узел в состоянии, а не в ref: появилась — измерили заново
  const [headerNode, setHeaderNode] = useState<HTMLElement | null>(null)
  const [headerH, setHeaderH] = useState(0)
  useLayoutEffect(() => {
    if (!headerNode) return
    const measure = () => setHeaderH(headerNode.offsetHeight)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(headerNode)
    return () => observer.disconnect()
  }, [headerNode])
  const [overlayPad, setOverlayPad] = useState(0)
  useLayoutEffect(() => {
    const node = overlayRef.current
    if (!overlayOn || !node) { setOverlayPad(0); return }
    const measure = () => setOverlayPad(Math.max(0, node.offsetHeight - 60))
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(node)
    return () => observer.disconnect()
  }, [overlayOn, filtersOn, shelfOverlay])
  const clearShelf = <Button variant="ghost" size="icon-sm" className="shrink-0 opacity-0 transition-opacity group-hover/shelfbox:opacity-100 focus-visible:opacity-100" aria-label={t('Открепить все')} onClick={() => { pinned.forEach((item) => pin(item.id, false)); setShelfNote(null); setTimeout(() => void reload(), 500) }}><X /></Button>
  const currentType = types.find((item) => item.id === type) ?? types[0]
  // Лента сужена поиском или фильтром (а не просто пустой space)
  // Кнопка быстрого действия на главной: одна строка высотой 40 с крупной иконкой, без превью — не спорит с лентой
  const pill = 'h-10 gap-2 px-4'
  // У каждого шаблона свой значок, а не один и тот же у всех семи (иначе значок ничего не говорит)
  const templateIcons: Record<string, typeof Network> = { hypothesis: ScanSearch, 'rules-concepts': ScrollText, 'brand-directions': Palette, 'technique-recipe': NotebookPen, 'style-image': ImageIcon, 'collection-gaps': ListChecks, 'compare-choose': LayoutGrid }
  // Холсты по свежести — список под «Холстом» в рейке
  const canvasList = useMemo(() => references.filter((item) => item.kind === 'canvas').sort((a, b) => (b.openedAt ?? b.updatedAt ?? 0) - (a.openedAt ?? a.updatedAt ?? 0)).map((item) => ({ id: item.id, title: item.title })), [references])
  // Главная: приветствие, ряд действий, лента с фильтрами под ним; острова справа нет (владелец 2026-10-29)
  const homePage = timelinePage && !currentFolder && !trashOpen && !settingsPage
  const filtering = Boolean(query.trim() || collection || type !== 'all' || color || similarTo)
  const searchOnly = Boolean(query.trim()) && !collection && type === 'all' && !color && !similarTo
  const title = settingsPage ? t('Настройки') : graphPage ? t('Граф') : flyPage ? t('Полёт') : tagsPage ? t('Теги') : timelinePage ? t('Главная') : actionsPage ? t('Действия') : currentFolder?.name ?? (board === shelfName ? t('Пины') : board) ?? (foldersPage ? t('Папки') : type === 'all' ? t('Библиотека') : currentType.label)
  // На карте тип — не фильтр, а переход: дерево видно целиком, выбранный тип раскрыт (владелец 2026-09-28)
  // Без разбора — нет выжимки (наборы и полка не в счёт)
  const isRaw = (reference: Reference) => !firstThought(reference) && !reference.sources?.length && reference.kind !== 'link' && reference.kind !== 'music'
  // Палитра для поиска по цвету — самые частые главные цвета библиотеки, без почти одинаковых
  const palette = useMemo(() => {
    const counts = new Map<string, number>()
    references.forEach((item) => item.colors?.slice(0, 3).forEach((hex) => counts.set(hex, (counts.get(hex) ?? 0) + 1)))
    const picked: string[] = []
    for (const [hex] of [...counts].sort((a, b) => b[1] - a[1])) if (!picked.some((other) => colorDistance(other, hex) < 60)) picked.push(hex)
    return picked.slice(0, 12)
  }, [references])
  const filterBy = (byType: boolean) => {
    const stems = queryStems(query)
    return ordered.filter((reference) => {
      // В подборке показываем всё, что в неё положили, наборы тоже: «Всё» прячет их только в общей ленте
      if (byType && !(board && type === 'all') && !currentType.match(reference)) return false
      if (board && !reference.boards?.includes(board)) return false
      if (folder && placeOf(reference) !== folder) return false
      if (collection && !collectionsOf(reference).includes(collection)) return false
      if (color && nearest(reference, color) > colorNear) return false
      // Поиск по механике и сценарию: название, описание, теги, заметка владельца.
      // Каждое слово запроса должно найтись, порядок неважен: «шкала полукруглая» = «полукруглая шкала».
      const haystack = [reference.title, reference.description, reference.technique, reference.meaning, ...(reference.comments ?? []).map((item) => item.text), ...collectionsOf(reference), reference.author, ...reference.tags].join(' ').toLowerCase().replace(/ё/g, 'е')
      return stems.every((word) => haystack.includes(word)) || Boolean(heard(reference.id))
    })
  }
  const filtered = useMemo(() => {
    const list = filterBy(true)
    // Цвет — ближайшие первыми; похожее — по общим тегам и цветам, сама карточка и совсем непохожие не показываются
    if (similarTo) {
      const base = references.find((item) => item.id === similarTo)
      if (!base) return list
      return list.filter((item) => item.id !== base.id).map((item) => ({ item, score: likeness(base, item) })).filter(({ score }) => score > 0).sort((a, b) => b.score - a.score).slice(0, 24).map(({ item }) => item)
    }
    return color ? [...list].sort((a, b) => nearest(a, color) - nearest(b, color)) : list
  }, [ordered, collection, query, currentType, board, folder, color, similarTo, references, speech]) // eslint-disable-line react-hooks/exhaustive-deps

  const counts = Object.fromEntries(types.map((item) => [item.id, references.filter(item.match).length]))
  // Пустой тип в меню не показываем — меню растёт вместе с библиотекой (grill-formats.md); открытый — остаётся
  const shownTypes = types.filter((item) => item.id === 'all' || item.id === type || counts[item.id] > 0)

  // Плитка открывается в карточку через ImageModal: картинка «вырастает» в слот исходника. Одна функция на сетку и полку —
  // у каждой свой префикс layoutId, иначе переход перепутает, откуда вырастать
  // face — своё превью вместо плитки: строка списка открывает карточку так же, как плитка
  // Esc — назад; ←/→ — соседняя карточка текущей ленты (с её фильтром и порядком), адрес заменяется — «назад» ведёт в ленту.
  // Не в поле, не в плеере и не при открытом меню или окне: у них свои клавиши
  useEffect(() => {
    if (!cardId) return
    const onKey = (event: KeyboardEvent) => {
      if (!['Escape', 'ArrowLeft', 'ArrowRight'].includes(event.key) || event.defaultPrevented || event.metaKey || event.altKey) return
      const target = event.target as HTMLElement
      if (target.closest('input, textarea, video, [contenteditable="true"]') || document.querySelector('[role="menu"], [role="dialog"], [role="listbox"]')) return
      // На холсте Esc и стрелки принадлежат холсту (снять инструмент, двигать выбранное): из холста выходят стрелкой «назад» в шапке, а не клавишей
      if (cardRef?.kind === 'canvas') return
      if (event.key === 'Escape') { closeCard(); return }
      const index = filtered.findIndex((item) => item.id === cardId)
      const next = index === -1 ? undefined : filtered[index + (event.key === 'ArrowRight' ? 1 : -1)]
      if (next) { event.preventDefault(); window.location.replace(`#/card/${next.id}`) }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [cardId, cardRef?.kind, closeCard, filtered])
  const faceOf = (reference: Reference, prefix = 'ref-image', mini = false) => {
    // Материал без обложки (заметка, статья без картинки) показывается текстом: название и первая мысль выжимки
    const textOnly = isMaterial(reference.kind) && !reference.image && !reference.fetching
    // На полке плитка низкая (96 px) — только название; в сетке сверху место под название при наведении, ниже первая мысль
    const onShelf = prefix === 'shelf'
    // Заметка-набор (полка, разбор полки): под названием — мозаика обложек, чтобы видно, что внутри (решение владельца 2026-09-27).
    // Занимает всё место под названием: первая — крупно слева на две строки, вторая и третья — справа; одна — на всю ширину,
    // две — пополам. Остальные — «+N» значком в углу последней, не плашкой поверх обложки
    const set = (reference.sources ?? []).map((id) => references.find((item) => item.id === id)).filter((item): item is Reference => Boolean(item))
    const shown = set.slice(0, 3)
    const setRow = set.length > 0 && !onShelf ? (
      <div className={cn('grid min-h-0 flex-1 grid-rows-2 gap-1.5', shown.length === 1 ? 'grid-cols-1' : shown.length === 2 ? 'grid-cols-2' : 'grid-cols-[3fr_2fr]')}>
        {shown.map((item, index) => (
          <div key={item.id} className={cn('relative overflow-hidden rounded-surface bg-muted', (index === 0 || shown.length === 2) && 'row-span-2')}>
            {item.image ? <img src={item.image} alt="" className="absolute inset-0 h-full w-full object-cover" /> : <PaperNote size="mini" title={item.title} />}
            {set.length > 3 && index === shown.length - 1 && <Badge variant="secondary" className="absolute bottom-1.5 right-1.5">+{set.length - 3}</Badge>}
          </div>
        ))}
      </div>
    ) : null
    // Набор с картинками — только мозаика на всю плитку, без названия внутри: оно появляется при наведении, как у рефов
    // (решение владельца 2026-09-27). Набор из одних текстов — с названием, иначе плитка пустая
    const coversOnly = Boolean(setRow) && set.some((item) => item.image)
    // В полоске пинов материал без обложки — квадрат 40 px со значком типа (мелкая копия бумажки не читалась, владелец 2026-10-15)
    const noteCard = reference.kind === 'canvas' ? (mini ? <TypeGlyph reference={reference} /> : <CanvasCover id={reference.id} updatedAt={reference.updatedAt} thumbAt={reference.thumbAt} boxes={reference.canvasBoxes} />) : textOnly && mini ? <TypeGlyph reference={reference} /> : coversOnly ? <div className="absolute inset-0 flex flex-col bg-card">{setRow}</div> : textOnly ? <PaperNote size={onShelf ? 'shelf' : 'tile'} title={reference.title} text={setRow ? undefined : reference.description}>{setRow}</PaperNote> : undefined
    return { textOnly, noteCard }
  }
  // Что показывает карточка на месте материала: плеер YouTube, встраивание, видео; иначе — картинка (у окна и страницы своя)
  const mediaOf = (reference: Reference, textOnly: boolean, noteCard: ReactNode) => textOnly ? noteCard : youtubeId(reference) ? <iframe src={`https://www.youtube-nocookie.com/embed/${youtubeId(reference)}?rel=0${seek?.id === reference.id ? `&start=${seek.t}&autoplay=1` : ''}`} title={reference.title} allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen className="absolute inset-0 h-full w-full border-0" /> : reference.embed ? <iframe src={reference.embed} title={reference.title} allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" allowFullScreen className="absolute inset-0 h-full w-full rounded-surface border-0" /> : reference.video ? <video src={reference.video} poster={reference.image} controls autoPlay muted className="absolute inset-0 h-full w-full object-contain" /> : undefined
  // key — карточка заново на каждый материал: иначе название и теги прошлой карточки переезжали в следующую и автосохранялись (скептик 2026-10-14)
  const cardView = (reference: Reference, media: ReactNode, close: () => void, page?: { crumbs: ReactNode }) => <RefCard key={reference.id} reference={reference} onDescribe={() => describeRef(reference.id)} onShown={setShownCard} pinMode={pinMode} onPinMode={setPinMode} onInfo={(patch) => setReferences((list) => list.map((item) => item.id === reference.id ? { ...item, ...patch } : item))} collections={collectionsFor(typeOf(reference))} onCreateCollection={createCollection} modelSettings={modelSettings} onDepth={(depth) => void chooseDepth(depth)} onModels={(models) => void chooseModels(models)} media={media} onClose={close} onUpdate={(patch) => update(reference.id, patch)} onConvert={(feedback) => convert(reference.id, feedback)} onDigest={() => makeDigest(reference.id)} onStop={() => stopAgent(reference.id)} onConversation={(to) => openConversation(reference.id, to)} onRemoveSource={(id) => removeSource(reference, id)} progress={progress[reference.id]} onAsk={(command, extra) => askAgent(reference.id, command, extra)} onSaveFound={(at, index) => saveFound(reference.id, at, index)} onSaveNote={(at) => saveNote(reference.id, at)} onMakeAction={(at, accept) => makeActionAt(reference.id, at, accept)} onTagOffer={(accept) => void answerTagOffer(reference.id, accept)} onEdit={(at, action) => void editAt(reference.id, at, action)} onRemember={(at, accept) => rememberAt(reference.id, at, accept)} library={references} onDelete={() => removeReference(reference.id)} page={Boolean(page)} crumbs={page?.crumbs} infoSlot={infoSlot} infoOn={agentOpen && agentTab === 'info'} onOpenInfo={() => { setAgentTab('info'); setAgentOpen(true) }} />
  const modal = (reference: Reference, prefix = 'ref-image', mini = false, face?: ReactNode) => {
    const { textOnly, noteCard } = faceOf(reference, prefix, mini)
    return <ImageModal
                      src={reference.image}
                      alt={reference.title}
                      layoutId={`${prefix}-${reference.id}`}
                      animateLayout
                      className="!h-full !w-full"
                      thumbnail={face ?? noteCard}
                      autoOpen={(prefix === 'shelf-note' && reference.id === openNew) || prefix === 'agent-link'}
                      onAutoOpened={() => setOpenNew(null)}
                      mediaContent={mediaOf(reference, textOnly, noteCard)}
                      card={(media, close) => cardView(reference, media, close)}
                      onOpen={prefix === 'shelf-note' || prefix === 'agent-link' ? undefined : (from) => openCard(reference.id, from.getBoundingClientRect())}
                    />
  }

  // Полка «под рукой» — с чем работаю сейчас. Пустая скрыта; пока тащишь плитку — появляется, бросил — плитка на полке.
  // mini — полоска поверх ленты: квадратные превью 40 px. Ряд один, лишнее — прокруткой вбок (ShelfRow).
  // Клик по фону полки — окно полки (материалы + агент), как карточка; клик по превью — карточка материала (решение владельца,
  // вместо кнопки «Передать агенту» с ростом полки). С клавиатуры — Enter на полке
  // Полку можно схватить целиком и бросить в колонку подборок — получится постоянная подборка с тем же набором (идея 36)
  const shelfBox = (mini: boolean) => (
    <DragShelf id={mini ? 'shelf-all-mini' : 'shelf-all'} disabled={!pinned.length}>{(dragRef, dragListeners) => (
    <DropTarget id={mini ? 'shelf-mini' : 'shelf'}>{(shelfOver, dropRef) => (
    <section
      ref={(node: HTMLElement | null) => { dropRef(node); dragRef(node) }}
      {...dragListeners}
      aria-label={t('Пины')}
      className={`group/shelfbox relative rounded-container transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none ${shelfOver ? 'bg-muted' : 'glass'} ${pinned.length ? 'cursor-pointer border' : 'border-2 border-dashed'}`}
      onClick={(event) => { const target = event.target as HTMLElement; if (pinned.length && event.currentTarget.contains(target) && !target.closest('button, a, input')) void openShelf() }} // contains — клики из карточки в портале всплывают по дереву React, их не считаем
      onKeyDown={(event) => { if (event.key === 'Enter' && event.target === event.currentTarget && pinned.length) void openShelf() }}
      tabIndex={pinned.length ? 0 : undefined}
    >
      {pinned.length === 0 ? (
        <div className={`flex items-center justify-center ${mini ? 'h-14' : 'min-h-28 p-3'}`}><span className="text-sm text-muted-foreground">{t('Отпустите — закрепится в пинах')}</span></div>
      ) : (
        <div className={`flex gap-2 ${mini ? 'items-center p-2' : 'items-start p-3'}`}>
          <ShelfRow gap={mini ? 'gap-2' : 'gap-3'}>
            {pinned.map((reference) => mini ? (
              <div key={reference.id} className="group/pin relative size-10 shrink-0">
                {(() => {
                  const tile = <div className="relative size-full overflow-hidden rounded-control">{modal(reference, 'shelf', true)}</div>
                  return isMaterial(reference.kind) && !reference.image && !reference.fetching ? <NoteHint reference={reference}>{tile}</NoteHint> : tile
                })()}
                <Button variant="secondary" size="icon-xs" aria-label={t('Открепить')} className="absolute -right-1.5 -top-1.5 size-5 opacity-0 shadow-sm transition-opacity group-hover/pin:opacity-100 focus-visible:opacity-100" onClick={(event) => { event.stopPropagation(); pin(reference.id, false) }}><X className="size-3" /></Button>
              </div>
            ) : (
              <div key={reference.id} className="group/shelf relative h-24 shrink-0" style={{ aspectRatio: reference.ratio }}>
                {modal(reference, 'shelf')}
                <Button variant="secondary" size="icon-xs" aria-label={t('Открепить')} className="absolute right-1 top-1 opacity-0 transition-opacity group-hover/shelf:opacity-100" onClick={() => pin(reference.id, false)}><X /></Button>
              </div>
            ))}
          </ShelfRow>
          {shelfBusy && <Loader2 className="size-4 shrink-0 animate-spin self-center text-muted-foreground" aria-label={t('Агент разбирает полку')} />}
          {clearShelf}
        </div>
      )}
    </section>
    )}</DropTarget>
    )}</DragShelf>
  )
  // Подборки чипами — то же состояние, что и в боковой панели: выбор здесь подсвечивает пункт там и наоборот
  // Частота тега — в текущем разделе (тип и подборка), без учёта самого фильтра по тегу
  const tagChips = useMemo(() => {
    const scope = references.filter((reference) => currentType.match(reference) && (!board || reference.boards?.includes(board)) && (!folder || placeOf(reference) === folder))
    return collectionsFor(type).map((item) => ({ ...item, count: scope.filter((reference) => collectionsOf(reference).includes(item.name)).length }))
  }, [references, currentType, board, folder, collectionList, type]) // eslint-disable-line react-hooks/exhaustive-deps
  const chips = (
    <FilterBar className={cn('collection-filter', !showFilters && 'hidden')}
      type={{ value: type === 'all' ? null : type, onChange: (next) => setType((next ?? 'all') as TypeId), options: types.filter((item) => item.id !== 'all' && (counts[item.id] > 0 || item.id === type)).map((item) => ({ value: item.id, label: item.label, icon: item.icon, count: counts[item.id] })) }}
      tag={{ value: collection, onChange: setCollection, options: [...tagChips].filter((item) => item.count > 0 || item.name === collection).sort((a, b) => b.count - a.count).map((item) => ({ value: item.name, label: item.name, icon: item.icon, count: item.count })) }}
      // Выбранный тег правится по месту: «⋯» — переименовать или удалить из словаря (раньше — правый клик по чипу)
      tagActions={collection && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild><Button variant="ghost" size="icon-sm" aria-label={t('Действия с тегом {collection}', { collection })}><TagMoreIcon /></Button></DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            <DropdownMenuItem onSelect={() => setTagRename(collection)}><TagRenameIcon />{t('Переименовать')}</DropdownMenuItem>
            <DropdownMenuItem variant="destructive" onSelect={() => void deleteTag(collection)}><Trash2 />{t('Удалить тег')}</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      // Порядок — как у Fabric: стрелка направления и поле выпадашкой
      end={(
        <div className="ml-auto flex shrink-0 items-center gap-1">
          <Button variant="ghost" size="icon-sm" aria-label={descending ? t('По убыванию') : t('По возрастанию')} onClick={() => setDescending(!descending)}>{descending ? <ArrowDown /> : <ArrowUp />}</Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild><Button variant="glass" size="sm">{currentSort.label}<ChevronDown className="opacity-60" /></Button></DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-44">
              <DropdownMenuRadioGroup value={sortMode} onValueChange={(next) => setSortMode(next as SortMode)}>
                {sorts.map((item) => <DropdownMenuRadioItem key={item.id} value={item.id}>{item.label}</DropdownMenuRadioItem>)}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )} />
  )

  // Суть под обложкой (grill-skeptic.md): у плитки с картинкой снизу две строки сути; у заметки-листа суть и так внутри
  // Правый клик по плитке (№25, grill-fabric-findings.md): все действия в одном месте; на наведении — только частые.
  // Плитка из выделения — действие над всеми выбранными
  // Правый клик по space — как у карточки, только применимое к папке
  const [folderRename, setFolderRename] = useState<FolderItem | null>(null)
  const [iconFolder, setIconFolder] = useState<FolderItem | null>(null)
  const folderMenu = (item: FolderItem) => {
    const inside = (id?: string): boolean => !!id && (id === item.id || inside(folders.find((other) => other.id === id)?.parent))
    return (
      <ContextMenuContent className="w-56">
        <ContextMenuItem onSelect={() => openFolder(item.id)}><BookOpen />{t('Открыть')}</ContextMenuItem>
        <ContextMenuItem onSelect={() => { const members = references.filter((reference) => placeOf(reference) === item.id).map((reference) => reference.id); askAbout(members, item.name); setAgentOpen(true) }}><MessageSquare />{t('Спросить агента')}</ContextMenuItem>
        <ContextMenuSeparator />
        {!item.inbox && <ContextMenuItem onSelect={() => setFolderRename(item)}><TagRenameIcon />{t('Переименовать')}</ContextMenuItem>}
        {!item.inbox && <ContextMenuItem onSelect={() => setIconFolder(item)}><SmilePlus />{t('Сменить иконку…')}</ContextMenuItem>}
        <ContextMenuItem onSelect={() => void createFolder(item.id)}><FolderPlus />{t('Вложенная папка')}</ContextMenuItem>
        {!item.inbox && <ContextMenuSub>
          <ContextMenuSubTrigger><Folder />{t('Переместить в…')}</ContextMenuSubTrigger>
          <ContextMenuSubContent className="max-h-80 overflow-y-auto">
            <ContextMenuItem disabled={!item.parent} onSelect={() => void library.updateFolder(item.id, { parent: null }).then(setFolders)}>{t('Верхний уровень')}</ContextMenuItem>
            <ContextMenuSeparator />
            {flatFolders(folders).filter(({ item: other }) => !other.inbox && !inside(other.id)).map(({ item: other, depth }) => <ContextMenuItem key={other.id} disabled={item.parent === other.id} style={{ paddingLeft: 8 + depth * 14 }} onSelect={() => void library.updateFolder(item.id, { parent: other.id }).then(setFolders)}><Folder />{other.name}</ContextMenuItem>)}
          </ContextMenuSubContent>
        </ContextMenuSub>}
        {!item.inbox && <>
          <ContextMenuSeparator />
          <ContextMenuItem variant="destructive" onSelect={() => void deleteFolder(item.id)}><Trash2 />{t('Удалить папку')}</ContextMenuItem>
        </>}
      </ContextMenuContent>
    )
  }
  // Просьба агенту про одну карточку (спросить, выжимка, Action) — открыть её страницу и агента справа с ней в контексте:
  // видно, что агент делает и куда ляжет ответ (владелец 2026-10-03). Про несколько — лента и агент, как раньше
  const workOn = (ids: string[]) => {
    askAbout(ids); setAgentOpen(true)
    if (ids.length === 1 && cardId !== ids[0]) openCard(ids[0])
  }
  const tileMenu = (reference: Reference) => {
    const ids = selected.includes(reference.id) ? selected : [reference.id]
    const many = ids.length > 1
    const link = /^https?:\/\//.test(reference.source) ? reference.source : ''
    return (
      <ContextMenuContent className="w-56">
        {!many && <ContextMenuItem onSelect={() => openLinked(reference.id)}><BookOpen />{t('Открыть')}</ContextMenuItem>}
        <ContextMenuItem onSelect={() => workOn(ids)}><MessageSquare />{many ? t('Спросить агента про {n}', { n: ids.length }) : t('Спросить агента')}</ContextMenuItem>
        {!many && isRaw(reference) && <ContextMenuItem onSelect={() => { workOn(ids); makeDigest(reference.id) }}><FileText />{t('Сделать выжимку')}</ContextMenuItem>}
        {!many && <ContextMenuItem onSelect={() => { setSimilarTo(reference.id); setColor(null); setQuery(''); setCollection(null); setType('all'); setBoard(null) }}><ScanSearch />{t('Найти похожее')}</ContextMenuItem>}
        {/* Свои действия (№22): запускаются прямо на плитке — ответ ляжет в карточку, плитка покажет работу */}
        {myActions.length > 0 && <ContextMenuSub>
          <ContextMenuSubTrigger><Zap />{t('Действия')}</ContextMenuSubTrigger>
          <ContextMenuSubContent className="max-w-72">
            {myActions.map((item) => <ContextMenuItem key={item.id} onSelect={() => { if (!many) workOn(ids); ids.forEach((id) => askAgent(id, item.text, { actionId: item.id })) }}><span className="truncate">{item.name || item.text}</span></ContextMenuItem>)}
          </ContextMenuSubContent>
        </ContextMenuSub>}
        <ContextMenuSeparator />
        {!many && <ContextMenuItem onSelect={() => setRefRename({ id: reference.id, title: reference.title })}><TagRenameIcon />{t('Переименовать')}</ContextMenuItem>}
        {/* Теги — галочками; для выделения — ставит или снимает у всех */}
        <ContextMenuSub>
          <ContextMenuSubTrigger><TagIcon />{t('Теги')}</ContextMenuSubTrigger>
          <ContextMenuSubContent className="max-h-80 overflow-y-auto">
            {collectionsFor(typeOf(reference)).map((item) => {
              const on = collectionsOf(reference).includes(item.name)
              return <ContextMenuCheckboxItem key={item.name} checked={on} onSelect={(event) => event.preventDefault()}
                onCheckedChange={() => ids.forEach((id) => { const target = references.find((other) => other.id === id); if (target) update(id, { collections: on ? collectionsOf(target).filter((name) => name !== item.name) : [...new Set([...collectionsOf(target), item.name])] }) })}>{item.name}</ContextMenuCheckboxItem>
            })}
          </ContextMenuSubContent>
        </ContextMenuSub>
        <ContextMenuItem onSelect={() => ids.forEach((id) => pin(id, !onShelf(reference)))}>{onShelf(reference) ? <PinOff /> : <Pin />}{onShelf(reference) ? t('Открепить') : t('Закрепить')}</ContextMenuItem>
        <ContextMenuSub>
          <ContextMenuSubTrigger><Folder />{t('Переместить в…')}</ContextMenuSubTrigger>
          <ContextMenuSubContent className="max-h-80 overflow-y-auto">
            {flatFolders(folders).map(({ item, depth }) => <ContextMenuItem key={item.id} disabled={!many && placeOf(reference) === item.id} style={{ paddingLeft: 8 + depth * 14 }} onSelect={() => moveTo(ids, item.id)}>{item.inbox ? <Inbox /> : <Folder />}{item.name}</ContextMenuItem>)}
            <ContextMenuSeparator />
            <ContextMenuItem onSelect={() => void createFolder(undefined, ids)}><Plus />{t('Новая папка')}</ContextMenuItem>
          </ContextMenuSubContent>
        </ContextMenuSub>
        {!many && link && <>
          <ContextMenuSeparator />
          <ContextMenuItem onSelect={() => window.open(link, '_blank', 'noopener')}><ExternalLink />{t('Открыть источник')}</ContextMenuItem>
          <ContextMenuItem onSelect={() => void navigator.clipboard.writeText(link)}><Link2 />{t('Скопировать ссылку')}</ContextMenuItem>
        </>}
        <ContextMenuSeparator />
        {/* В корзину — не насовсем: вернуть можно из «Корзины», поэтому без подтверждения */}
        <ContextMenuItem variant="destructive" onSelect={() => { void removeMany(ids); setSelected([]) }}><Trash2 />{many ? t('В корзину — {n}', { n: ids.length }) : t('В корзину')}</ContextMenuItem>
      </ContextMenuContent>
    )
  }
  // v2 (карточка как у Fabric): рамка cardInset со всех сторон превью, снизу подпись captionHeight
  // Во «Входящих» при сортировке по дате лента делится по дням («Сегодня», «Вчера», дата) — каждый день своим блоком
  // «Разобрать» во «Входящих»: вся очередь неразобранного, не только пачка. За раз — самые новые inboxBatchSize карточек,
  // чтобы список правок можно было просмотреть; разобрал — кнопка предложит следующие
  const inboxBatchSize = 40
  const inboxQueue = useMemo(() => references.filter((reference) => placeOf(reference) === inboxId).sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0)), [references, inboxId])
  const sortInbox = () => {
    const part = inboxQueue.slice(0, inboxBatchSize)
    askAbout(part.map((item) => item.id), t('Входящие')); setAgentOpen(true)
    setAgentAsk({ text: t('Разбери то, что лежит во «Входящих» ({n}{n2}). В ответе: одна фраза — что накопилось, затем темы и что прочитать первым. Дальше предложи правки: каждую карточку переложи в подходящую папку (folder), а мусор — страницы входа, капчи, «недоступно», дубли — в корзину (delete). Теги, названия и описания не трогай.', { n: part.length, n2: inboxQueue.length > part.length ? t(' самых новых из {n}', { n: inboxQueue.length }) : '' }), n: Date.now() })
  }
  // Пересказ дня или разбор пачки: агент по клику (в фоне он не работает). У пачки кнопка «Разобрать» видна всегда — это её главное действие
  const recap = (day: { label: string; batch: boolean; ids: string[] }) => {
    askAbout(day.ids, day.label); setAgentOpen(true)
    setAgentAsk({ text: day.batch ? t('Разбери пачку, которую я собрал из браузера ({split}). В ответе: одна фраза — о чём пачка в целом, затем темы и что прочитать первым. Дальше предложи правки: каждую карточку переложи в подходящую папку (folder), а мусор — страницы входа, капчи, «недоступно», дубли — в корзину (delete). Теги, названия и описания не трогай.', { split: day.label.split(' · ')[0] }) : t('Коротко перескажи, что я сохранил: {toLowerCase}. Сначала одной фразой — о чём день, потом главное по каждой карточке ссылкой и зачем это может быть мне полезно.', { toLowerCase: day.label.toLowerCase() }), n: Date.now() })
  }
  const byDay = (Boolean(currentFolder?.inbox) || timelinePage) && (sortMode === 'created' || sortMode === 'updated')
  const grid = useMemo(() => {
    const extra = () => cardInset + captionHeight
    if (!byDay) return { ...placeTiles(filtered, view, columnCount, gridWidth, tileGap, extra, cardInset), days: [] as Array<{ key: string; label: string; batch: boolean; y: number; ids: string[] }> }
    // Собранное из браузера (collect) — одним блоком под своим заголовком «Chrome, 16 октября · 24», а не россыпью по дням
    const groups: Array<{ key: string; label: string; batch: boolean; items: Reference[] }> = []
    // Пачка — один блок, даже если её карточки в ленте не идут подряд; осталась одна карточка — заголовок не нужен, она идёт по дню
    const batchSize = new Map<string, number>()
    for (const item of filtered) if (item.batch) batchSize.set(item.batch, (batchSize.get(item.batch) ?? 0) + 1)
    const batchAt = new Map<string, number>()
    for (const item of filtered) {
      const at = sortMode === 'updated' ? item.updatedAt ?? item.createdAt : item.createdAt
      const inBatch = Boolean(item.batch) && (batchSize.get(item.batch!) ?? 0) >= 2
      const key = inBatch ? item.batch! : dayLabel(at)
      // Один блок на ключ, даже если между его карточками вклинилась пачка: иначе «Сегодня» повторяется дважды
      if (batchAt.has(key)) groups[batchAt.get(key)!].items.push(item)
      else {
        batchAt.set(key, groups.length)
        groups.push({ key, label: inBatch ? `${item.batchSource || t('Пачка')}, ${new Date(item.createdAt ?? 0).toLocaleDateString(locale, { day: 'numeric', month: 'long' })}` : dayLabel(at), batch: inBatch, items: [item] })
      }
    }
    const tiles: ReturnType<typeof placeTiles<Reference>>['tiles'] = []
    const days: Array<{ key: string; label: string; batch: boolean; y: number; ids: string[] }> = []
    let top = 0
    for (const group of groups) {
      days.push({ key: group.key, label: group.batch ? `${group.label} · ${group.items.length}` : group.label, batch: group.batch, y: top, ids: group.items.map((item) => item.id) })
      // Список — одна колонка строк по 56 px через 4, как в placeTiles, но от низа заголовка дня
      const placed = view === 'list'
        ? { tiles: group.items.map((item, index): (typeof tiles)[number] => ({ item, x: 8, y: top + dayHeading + index * 60, width: gridWidth - 8, height: 56 })), bottom: top + dayHeading + group.items.length * 60 - 4 }
        : mosaic(group.items, columnCount, gridWidth, tileGap, top + dayHeading, extra, cardInset)
      tiles.push(...placed.tiles)
      top = placed.bottom + 24
    }
    return { tiles, height: Math.max(0, top - 24), days }
  }, [filtered, view, columnCount, gridWidth, byDay, sortMode])
  // Окно отрисовки: плитки вне экрана (с запасом выше и ниже) не монтируем вообще — их сотни, и смена масштаба перерисовывала всё
  // за 600 мс одним кадром. Прокрутка квантуется (шаг 240 px), чтобы не перерисовывать ленту на каждый пиксель
  const [scrolled, setScrolled] = useState(0)
  const scrolledAt = useRef(0)
  // Уже показанное не выгружаем, пока раскладка та же (прокрутка назад бесплатна); сменилась раскладка — окно начинается заново
  const reach = useRef<{ key: string; from: number; to: number } | null>(null)
  const nearRange = () => {
    const height = mainRef.current?.clientHeight ?? 900
    const top = scrolled - (gridNode.current?.offsetTop ?? 0)
    const key = `${columnCount}|${gridWidth}|${view}|${filtered.length}|${byDay}`
    const wanted = { from: top - height * 1.5, to: top + height * 3 }
    const kept = reach.current?.key === key ? reach.current : null
    reach.current = { key, from: Math.min(kept?.from ?? Infinity, wanted.from), to: Math.max(kept?.to ?? -Infinity, wanted.to) }
    return reach.current
  }
  // Рамка выделения — с пустого места ленты (не с плитки, кнопки или поля), как в Finder: задетые плитки выделяются;
  // с ⌘ или Shift — добавляются к уже выделенным. Клик по пустому без протяжки — снять выделение
  const [marquee, setMarquee] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null)
  // На карте рамки нет: там нажатие тянет холст, а рамка перерисовывала ленту на каждое движение — холст шёл рывками
  const [graphFocus, setGraphFocus] = useState<{ ids: string[]; name: string | null } | null>(null) // что открыто в фокусе графа: агент отвечает про это
  // Чип контекста следит за фокусом, пока панель агента открыта: открыл другую карточку или точку на графе — чип сменился.
  // Срабатывает только на смену фокуса, не на открытие панели (его ставит кнопка агента)
  const lastFocus = useRef({ card: shownCard, graph: graphFocus })
  useEffect(() => {
    const was = lastFocus.current
    lastFocus.current = { card: shownCard, graph: graphFocus }
    if (!agentOpen) return
    if (shownCard && shownCard !== was.card) askAbout([shownCard])
    else if (graphPage && graphFocus !== was.graph) askAbout(graphFocus?.ids ?? [], graphFocus?.name ?? null)
  }, [shownCard, graphFocus]) // eslint-disable-line react-hooks/exhaustive-deps
  const [graphDockSlot, setGraphDockSlot] = useState<HTMLElement | null>(null)
  const [graphMenuSlot, setGraphMenuSlot] = useState<HTMLElement | null>(null)
  const startMarquee = (event: ReactPointerEvent<HTMLElement>) => {
    const target = event.target as HTMLElement
    if (event.button !== 0 || !event.currentTarget.contains(target) || target.closest('.touch-manipulation, button, a, input, textarea, aside, section, [role="radiogroup"], .react-flow, .mind-map')) return
    const base = event.metaKey || event.ctrlKey || event.shiftKey ? selected : []
    const start = { x0: event.clientX, y0: event.clientY }
    let moved = false
    const move = (e: PointerEvent) => {
      if (!moved && Math.hypot(e.clientX - start.x0, e.clientY - start.y0) < 4) return
      moved = true
      e.preventDefault() // без выделения текста под рамкой
      const box = { ...start, x1: e.clientX, y1: e.clientY }
      setMarquee(box)
      const origin = gridNode.current?.getBoundingClientRect()
      if (!origin) return
      const left = Math.min(box.x0, box.x1) - origin.left, right = Math.max(box.x0, box.x1) - origin.left
      const top = Math.min(box.y0, box.y1) - origin.top, bottom = Math.max(box.y0, box.y1) - origin.top
      const hit = grid.tiles.filter((tile) => tile.x < right && tile.x + tile.width > left && tile.y < bottom && tile.y + tile.height > top).map((tile) => tile.item.id)
      setSelected([...new Set([...base, ...hit])])
    }
    const up = () => {
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up)
      setMarquee(null)
      if (!moved && !base.length) setSelected([])
    }
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up)
  }
  // ⌘-клик — добавить или убрать плитку, Shift-клик — диапазон от прошлой; без клавиш клик открывает карточку, как раньше
  // ⌘A — выделить всё видимое, Esc — снять. В полях ввода и в открытой карточке (диалог) — их собственные клавиши
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement
      if (target?.closest('input, textarea, [contenteditable="true"], [role="dialog"]') || document.querySelector('[role="dialog"]')) return
      if (cardFromHash()) return // открыта карточка или холст: ⌘A и Esc там свои, ленту не трогаем
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'a') { event.preventDefault(); setSelected(filtered.map((item) => item.id)) }
      if (event.key === 'Escape' && selected.length) setSelected([])
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })
  const pickTile = (event: React.MouseEvent, id: string) => {
    if (!(event.metaKey || event.ctrlKey || event.shiftKey)) return
    event.preventDefault(); event.stopPropagation()
    if (event.shiftKey && anchor.current) {
      const ids = filtered.map((item) => item.id)
      const [from, to] = [ids.indexOf(anchor.current), ids.indexOf(id)].sort((a, b) => a - b)
      if (from >= 0) { setSelected((list) => [...new Set([...list, ...ids.slice(from, to + 1)])]); return }
    }
    anchor.current = id
    setSelected((list) => list.includes(id) ? list.filter((item) => item !== id) : [...list, id])
  }
  // Кнопка агента одна: на холсте она стоит в его вертикальной панели инструментов, на остальных страницах — в нижней
  const agentButton = (
  <Tooltip>
    <TooltipTrigger asChild><Button variant={agentOpen ? 'secondary' : 'ghost'} size="icon" aria-label={t('Агент библиотеки')} aria-pressed={agentOpen} onClick={() => { if (shownCard) { askAbout([shownCard]); setAgentOpen(true); return } if (graphPage && graphFocus) { askAbout(graphFocus.ids, graphFocus.name); setAgentOpen(true); return } setAgentOpen(!agentOpen); if (actionsPage) { askAbout(['actions'], t('Действия')); return } if (memoryLike) { askAbout(['memory'], t('Память')); return } const members = currentFolder ? references.filter((item) => placeOf(item) === currentFolder.id).map((item) => item.id) : board ? references.filter((item) => item.boards?.includes(board)).map((item) => item.id) : []; askAbout(members, members.length ? currentFolder?.name ?? board : null) }}><Zap /></Button></TooltipTrigger>
    <TooltipContent>{t('Агент')}</TooltipContent>
  </Tooltip>
  )
  // Панель справа от шапки: фильтры, вид, «⋮»; на главной она стоит в строке заголовка «Хронология»
  const viewControls = (
    <Island className="ml-auto min-h-10 [&_button]:size-8">
      {foldersPage && <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon-sm" aria-label={foldersView === 'grid' ? t('Вид: плитки') : t('Вид: список')} onClick={() => setFoldersView(foldersView === 'grid' ? 'list' : 'grid')}>{foldersView === 'grid' ? <LayoutDashboard /> : <List />}</Button></TooltipTrigger><TooltipContent>{foldersView === 'grid' ? t('Показать списком') : t('Показать плитками')}</TooltipContent></Tooltip>}
      {!actionsPage && !tagsPage && !foldersPage && !memoryLike && <>
      {(graphPage || flyPage) && (() => {
        // Режим — одна кнопка, как у вида ленты: иконка показывает текущий, нажатие переключает на другой
        const modes = [{ id: 'graph', label: t('Граф'), icon: Orbit }, { id: 'fly', label: t('Полёт'), icon: Rocket }] as const
        const current = modes.find((item) => item.id === spaceMode)!, next = modes.find((item) => item.id !== spaceMode)!
        return <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon-sm" aria-label={t('Режим: {label}', { label: current.label })} onClick={() => { setSpaceMode(next.id); setGraphPage(next.id === 'graph'); setFlyPage(next.id === 'fly') }}><current.icon /></Button></TooltipTrigger><TooltipContent>{current.label} → {next.label}</TooltipContent></Tooltip>
      })()}
      {!(graphPage && graphFocus) && <Button variant={showFilters ? 'secondary' : 'ghost'} size="icon-sm" aria-label={t('Фильтры')} aria-pressed={showFilters} onClick={() => setShowFilters(!showFilters)}><ListFilter /></Button>}
      {!graphPage && !flyPage && (() => {
        // Вид — одна кнопка: иконка показывает текущий, нажатие сразу переключает на следующий по кругу
        const current = views.find((item) => item.id === view)!, next = views[(views.indexOf(current) + 1) % views.length]
        return <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon-sm" aria-label={t('Вид: {label}', { label: current.label })} onClick={() => setView(next.id)}><current.icon /></Button></TooltipTrigger><TooltipContent>{current.label} → {next.label}</TooltipContent></Tooltip>
      })()}
      </>}
      {graphPage ? <span ref={setGraphMenuSlot} className="flex size-8 items-center justify-center empty:hidden" /> : <DropdownMenu>
        <DropdownMenuTrigger asChild><Button variant="ghost" size="icon-sm" aria-label={t('Создать')}><EllipsisVertical /></Button></DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-56">
          {createEntries.map((entry) => (
            <DropdownMenuItem key={entry.label} onSelect={entry.run} className="gap-3 py-1.5">
              {/* Значок в span: меню прячет прямые svg; без подложки-кружка (владелец 2026-10-15) */}
              <span className="grid size-4 shrink-0 place-items-center"><entry.icon className="size-4" /></span>
              {entry.label}
            </DropdownMenuItem>
          ))}
                        <DropdownMenuSub>
            <DropdownMenuSubTrigger className="gap-3 py-1.5"><span className="grid size-4 shrink-0 place-items-center"><Network className="size-4" /></span>{t('Холст из шаблона')}</DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="min-w-56">
              {TEMPLATES.map((template) => <DropdownMenuItem key={template.key} onSelect={() => void addCanvas(template.key)} className="py-1.5">{template.label}</DropdownMenuItem>)}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        </DropdownMenuContent>
      </DropdownMenu>}
    </Island>
  )
  return (
    <DndContext sensors={sensors} collisionDetection={pointerWithin} measuring={{ droppable: { strategy: MeasuringStrategy.WhileDragging, frequency: 150 } }}
      onDragStart={onDragStart} onDragMove={(event) => { if (!draggingFolder) return; if (event.over?.id === 'trash') { setRowDrop(null); return } const target = rowTarget(event); setRowDrop((last) => target ?? (overGhost(event) ? last : null)) }} onDragEnd={onDragEnd} onDragCancel={endDrag}>
    {/* Каркас как у ChatGPT (2026-10-10): полоса разделов всегда; колонка Spaces — только в разделе Spaces */}
    <SidebarProvider className="bg-background" open={railOpen} onOpenChange={setRailOpen} style={{ '--sidebar-width': `${railWidth}px` } as React.CSSProperties}>
      <AppSidebar canvases={canvasList} currentCanvasId={cardId ?? null} onOpenCanvas={(id) => openCard(id)} folders={folders} currentFolderId={currentFolder?.id ?? null} onOpenFolder={openFolder} railWidth={railWidth} onRailWidth={setRailWidth} active={board || folder || foldersPage || trashOpen ? null : type} trashActive={trashOpen && !cardId} onTrash={openTrash} counts={counts}
          
          allFoldersActive={foldersPage}        onAllFolders={() => openFolder(null)} onSettings={openSettings} tagsActive={tagsPage} graphActive={graphPage || flyPage} onGraph={() => { openFolder(null); setFoldersPage(false); if (spaceMode === 'fly') setFlyPage(true); else setGraphPage(true) }} flyActive={false} onFly={() => {}} onTags={() => { openFolder(null); setFoldersPage(false); setTagsPage(true) }} canvasActive={type === 'canvas' && !folder && !foldersPage} onCanvas={() => { openFolder(null); setFoldersPage(false); setType('canvas') }} timelineActive={timelinePage} onTimeline={() => { openFolder(null); setFoldersPage(false); setTimelinePage(true) }} actionsActive={actionsPage} onActions={() => { openFolder(null); setFoldersPage(false); setActionsPage(true) }}
           
         onCreateBoard={(id) => void createBoard(id)} onRenameBoard={(from, to) => void renameBoard(from, to).catch(() => notifyError(t('Не удалось переименовать подборку')))} onDeleteBoard={(name) => void deleteBoard(name)} types={shownTypes} onNavigate={(id) => {
        setTrashOpen(false)
        // Выбранная подборка может не относиться к новому типу — тогда сбрасываем, иначе сетка молча опустеет
        const next = id as TypeId
        setType(next)
        setBoard(null)
        if (collection && !collectionsFor(next).some((item) => item.name === collection)) setCollection(null)
      }} />
      <SidebarInset
        className={cn('library-canvas relative max-compact:m-0 max-compact:h-svh max-compact:rounded-none', 'm-0 h-svh rounded-none')}
        onDragOver={(event) => { if (innerDrag.current) return; const types = event.dataTransfer.types; if (types.includes('Files') || types.includes('text/uri-list')) { event.preventDefault(); setDragOver(true) } }}
        onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragOver(false) }}
        onDrop={(event) => {
          event.preventDefault(); setDragOver(false)
          if (innerDrag.current) { innerDrag.current = false; return } // схватили картинку внутри Refkit — это не добавление
          // Файлы — как раньше; ссылка, перетащенная из другой вкладки или приложения, — тоже в окно добавления
          const files = [...event.dataTransfer.files]
          if (files.length) { openDraft({ files }); return }
          const link = (event.dataTransfer.getData('text/uri-list') || event.dataTransfer.getData('text/plain')).split('\n').map((line) => line.trim()).find((line) => /^https?:\/\//.test(line))
          if (link) openDraft({ link })
        }}
      >
        {/* Карточка страницей — на месте ленты; лента спрятана целиком (display: contents → none), состояние живо */}
        <div className={cardId ? 'hidden' : 'contents'}>
        <header ref={setHeaderNode} className={cn("relative z-[calc(var(--z-sticky)+1)] flex shrink-0 items-start gap-2 px-(--canvas-gutter)", "h-18 pt-4")}>
          {/* Лента идёт до самого верха канваса и уходит под шапку: под ней мягкий градиент, чтобы текст шапки читался */}
          {!overlayOn && <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[calc(100%+16px)] scrim-down [--fade:40px]" />}
          {/* На телефоне панель — шторка, открыть её можно только отсюда; на широком экране кнопка живёт в самой панели */}
          <SidebarTrigger className="md:hidden" />
          {/* v2 (каркас Fabric): слева путь — «Папки / папка · число», справа фильтры, режим и «⋮» */}
          {/* Путь: «Папки / родитель / папка» — каждый шаг кликабелен; ← — на шаг выше */}
          <Island className={cn("min-h-10 max-w-[60%] min-w-0 gap-0 [&_button]:h-8", homePage && "hidden")}>
          {settingsPage && <Button variant="ghost" size="icon-sm" aria-label={t('Назад')} onClick={closeSettings}><ArrowLeft /></Button>}
          {!foldersPage && !actionsPage && !timelinePage && !tagsPage && !graphPage && !flyPage && !memoryLike && !canvasSection && <Button variant="ghost" size="icon-sm" aria-label={t('Назад')} onClick={() => openFolder(currentFolder?.parent ?? null)}><ArrowLeft /></Button>}
          <h1 className="flex h-8 min-w-0 items-center gap-1.5 text-sm">
            {trashOpen ? <span className="px-1.5 font-medium">{t('Корзина')}</span> : settingsPage ? <span className="px-1.5 font-medium">{t('Настройки')}</span> : graphPage ? <span className="px-1.5 font-medium">{t('Граф')}</span> : flyPage ? <span className="px-1.5 font-medium">{t('Полёт')}</span> : tagsPage ? <span className="px-1.5 font-medium">{t('Теги')}</span> : timelinePage ? <span className="px-1.5 font-medium">{t('Главная')}</span> : canvasSection ? <span className="px-1.5 font-medium">{t('Холсты')}</span> : actionsPage ? <span className="px-1.5 font-medium">{t('Действия')}</span> : <button type="button" className={cn('shrink-0 rounded-control px-1.5 py-1 hover:bg-muted', foldersPage ? 'font-medium' : 'text-muted-foreground')} onClick={() => openFolder(null)}>{t('Папки')}</button>}
            {/* Последнее звено — сама папка: её название уже крупно под шапкой (BoardHeader), второй раз его не пишем */}
            {folderPath(folder ?? undefined).slice(0, currentFolder ? -1 : undefined).map((item) => (
              <Fragment key={item.id}>
                <span className="text-muted-foreground">/</span>
                <button type="button" className="shrink-0 rounded-control px-1.5 py-1 text-muted-foreground hover:bg-muted" onClick={() => openFolder(item.id)}>{item.name}</button>
              </Fragment>
            ))}
            {!folder && !canvasSection && (board || type !== 'all') && <>
              <span className="text-muted-foreground">/</span>
              {board ? <Pin className="size-4 shrink-0 text-muted-foreground" /> : <currentType.icon className="size-4 shrink-0 text-muted-foreground" />}
              <span className="truncate font-medium">{title}</span>
            </>}
          </h1>
          </Island>
          {!homePage && viewControls}
          <input ref={fileInput} type="file" accept="image/*,video/*" multiple className="hidden" onChange={(event) => { [...(event.target.files ?? [])].forEach((file) => void addFile(file)); event.target.value = '' }} />
        </header>
        {/* v2: фильтры — вторая строка шапки, под переключателями, не прокручивается, без разделительных линий; кнопка фильтров её прячет */}
        {/* v2: фильтры и пины висят поверх ленты — она прокручивается под ними; снизу градиент, чтобы край не резало */}
        {(overlayOn || pinned.length === 0) && !trashOpen && <div className="relative z-(--z-sticky) h-0 shrink-0">
          <div ref={overlayRef} className="pointer-events-none absolute inset-x-0 -top-[14px] pb-[42px]">
            {overlayOn && <>
            {/* Тёмный градиент от верха канваса через шапку, фильтры и пины: лента уходит под него и гаснет */}
            {/* Под градиентом лёгкое размытие ленты: тоже гаснет книзу маской, чтобы край не был виден */}
            <div aria-hidden className="scrim-mask pointer-events-none absolute inset-x-0 bottom-0 -z-10 backdrop-blur-[3px]" style={{ top: -headerH }} />
            <div aria-hidden className="scrim-down pointer-events-none absolute inset-x-0 bottom-0 -z-10" style={{ top: -headerH }} />
            </>}
            {/* Пока тащат плитку и пинов нет, под будущей полкой тот же градиент — как будто она уже создана */}
            {pinned.length === 0 && <WhileDragging><div aria-hidden className="scrim-down pointer-events-none absolute inset-x-0 -z-10" style={{ top: -headerH, bottom: -74 }} /></WhileDragging>}
            {filtersOn && !homePage && <div className="pointer-events-auto relative px-(--canvas-gutter)">
              {chips}
            </div>}
            {shelfOverlay && <div className={cn('pointer-events-auto px-(--canvas-gutter)', filtersOn ? '' : 'pt-4')}>{shelfBox(true)}</div>}
            {/* Пустая полка во время перетаскивания — поверх ленты на месте будущих пинов (вне потока: ленту не двигает) */}
            {pinned.length === 0 && <div className="relative h-0"><WhileDragging><div className={cn('pointer-events-auto absolute inset-x-0 px-(--canvas-gutter)', filtersOn ? 'top-0' : 'top-4')}>{shelfBox(true)}</div></WhileDragging></div>}
          </div>
        </div>}
        <ContextMenu>
        {/* Правый клик на пустом месте — то же меню «Создать»; плитки, у которых своё меню, перехватывают клик у себя (stopPropagation) */}
        <ContextMenuTrigger asChild disabled={memoryLike || graphPage || flyPage || trashOpen}>
        <main ref={mainRef} className="library-main" onScroll={(event) => { const step = event.currentTarget.clientHeight || 800; const next = Math.floor(event.currentTarget.scrollTop / step) * step; if (next !== scrolledAt.current) { scrolledAt.current = next; startTransition(() => setScrolled(next)) } }} style={graphPage || flyPage ? undefined : { marginTop: -headerH, paddingTop: headerH + (overlayOn ? overlayPad : 0) }} data-fixed={graphPage || flyPage || undefined} onPointerDown={startMarquee}>
          {/* Точка открытия карточки заметки полки: плитки не видно, карточка открывается сама и живёт, пока полка та же */}
          {shelfNoteRef && <div className="absolute size-0 overflow-hidden">{modal(shelfNoteRef, 'shelf-note')}</div>}
          {settingsPage ? <SettingsPage settings={modelSettings} onModels={(models) => void chooseModels(models)} actionLabels={actionLabels} /> : flyPage ? <FlyPage items={references.map((item) => ({ id: item.id, title: item.title, image: item.image, ratio: item.ratio, description: item.description, kind: item.kind, format: item.format, createdAt: item.createdAt, collections: collectionsOf(item) }))} onOpen={(id) => openCard(id)} filtersOpen={showFilters} dockSlot={graphDockSlot} /> : graphPage ? <GraphPage items={references.map((item) => ({ id: item.id, title: item.title, image: item.image, ratio: item.ratio, description: item.description, kind: item.kind, format: item.format, createdAt: item.createdAt, author: item.author, collections: collectionsOf(item) }))} onOpen={(id) => openCard(id)} onTag={tagFromGraph} onNote={noteFromGraph} filtersOpen={showFilters} onFocus={setGraphFocus} menuSlot={graphMenuSlot} dockSlot={graphDockSlot} /> : tagsPage ? <TagsPage tags={collectionList.map((item) => ({ name: item.name, count: references.filter((reference) => collectionsOf(reference).includes(item.name)).length }))}
            onOpen={(name) => { openFolder(null); setFoldersPage(false); setTimelinePage(true); setCollection(name) }} onCreate={createCollection}
            onRename={(from, to) => void renameTag(from, to)} onDelete={(name) => void deleteTag(name)} /> : actionsPage ? <ActionsPage /> : trashOpen ? <TrashView items={trash} onRestore={(name) => void restore(name)} onEmpty={() => void emptyTrash()} /> : (<>
          {/* Верх ленты — полка и чипы. Пока поверх ленты полоска, этот верх невидим и inert — клавиатура и диктор не находят его дважды */}
          <div>
            {/* v2: открытая подборка — место со своей шапкой (как пространство у Fabric) */}
            {/* Быстрые действия главной (владелец 2026-10-29): то, что делают чаще всего, одним кликом; пока что-то отфильтровано — прячутся */}
            {homePage && (
              <>
                <div className="flex flex-col items-center gap-6 pt-12">
                <HomeGreeting />
                <div className="flex flex-wrap justify-center gap-2" role="group" aria-label={t('Быстрые действия')}>
                  {TEMPLATES.map((template) => { const Icon = templateIcons[template.key] ?? Network; return <Button key={template.key} variant="glass" className={pill} onClick={() => void addCanvas(template.key)}><Icon className="size-5" />{template.label}</Button> })}
                </div>
                </div>
                <div className="flex w-full items-center justify-between gap-4 pt-12"><h2 className="text-2xl font-semibold tracking-tight">{t('Хронология')}</h2>{viewControls}</div>
                {filtersOn && <div className="pt-2">{chips}</div>}
              </>
            )}
            {currentFolder && <BoardHeader name={currentFolder.name} description={currentFolder.description} locked={currentFolder.inbox} action={currentFolder.inbox && inboxQueue.length > 0 ? <Button variant="glass" size="sm" onClick={sortInbox}>{inboxQueue.length > inboxBatchSize ? t('Разобрать {inboxBatchSize} из {n}', { inboxBatchSize, n: inboxQueue.length }) : t('Разобрать')}</Button> : undefined}
              onSuggest={() => library.suggestFolderName(currentFolder.id)} onRename={(to) => renameFolder(currentFolder.id, to)} onDescribe={(text) => void library.updateFolder(currentFolder.id, { description: text }).then(setFolders)} />}
            {/* Вложенные папки — плитками над материалами, как у Fabric; на странице «Папки» — папки верхнего уровня */}
            {(foldersPage || folders.some((item) => item.parent === currentFolder?.id && currentFolder)) && <FolderTiles view={foldersView} folders={folders.filter((item) => item.parent === (currentFolder?.id ?? undefined))} menu={folderMenu} onOpen={(id) => openFolder(id)} onCreate={() => void createFolder(currentFolder?.id)} pins={foldersPage && pinned.length ? pinned.length : undefined} onPins={() => { openFolder(null); setFoldersPage(false); setBoard(shelfName) }} />}
          </div>
          {/* Счётчик не показываем, но экранный диктор его читает после каждого фильтра */}
          <span className="sr-only" aria-live="polite">{filtered.length} {plural(filtered.length)}</span>

          {/* Анкеты первого входа больше нет (владелец 2026-10-14): пустая библиотека — только «кинь что угодно»,
              настройка агента — чек-листом на странице «Память» */}
          {foldersPage && !query && !color && !similarTo ? null  : filtered.length > 0 ? (
            <LayoutGroup id="library-masonry">
              {/* Все плитки — в одном контейнере, место каждой считает masonry(): перестановка — только сдвиг, плитка
                  не пересоздаётся (раньше столбцы были отдельными блоками, и переезд в соседний пересоздавал её посреди перетаскивания) */}
                            <motion.div ref={gridRef} className={cn('relative -ml-2', !currentFolder && 'mt-[22px]')} initial={false} animate={{ height: grid.height }} transition={tileSpring}>
                {grid.days.map((day) => (
                  <motion.div key={day.key} className="group/day absolute inset-x-2 flex items-center gap-2" initial={false} animate={{ top: day.y }} transition={tileSpring}>
                    <h2 className="text-xl font-semibold text-muted-foreground">{day.label}</h2>
                    {/* Summary дня: агент пересказывает сохранённое за день — только по клику (агент в фоне не работает). Справа иконкой, видна при наведении на строку дня */}
                    {day.batch ? <Button variant="glass" size="sm" className="ml-auto" onClick={() => recap(day)}>{t('Разобрать')}</Button> : (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button variant="ghost" size="icon-sm" aria-label={t('Пересказать день')} className="ml-auto text-muted-foreground opacity-0 transition-opacity group-hover/day:opacity-100 focus-visible:opacity-100 pointer-coarse:opacity-100" onClick={() => recap(day)}><ScrollText /></Button>
                      </TooltipTrigger>
                      <TooltipContent>{t('Пересказать день')}</TooltipContent>
                    </Tooltip>
                    )}
                  </motion.div>
                ))}
                {/* Пока ширина не измерена, плиток нет: иначе все встают в угол и пружиной разлетаются по местам */}
                {gridWidth > 0 && (() => { const near = nearRange(); return grid.tiles.map(({ item: reference, x, y, width, height }) => {
                  if (y + height < near.from || y > near.to) return null // вне окна отрисовки
                  const working = reference.describing || reference.converting || reference.fetching || reference.digesting || reference.asking
                  // Ссылка не открылась — своя строка с «Повторить»; сырой текст ошибки сервера человеку не показываем
                  const error = reference.fetchError ? '' : reference.digestError || reference.convertError
                  const textOnly = isMaterial(reference.kind) && !reference.image && !reference.fetching
                  // Плитку можно тащить: на подборку в панели или на полку «под рукой». Тип данных свой — чтобы не спутать с файлом
                  // Соседи плавно разъезжаются (layout); вне перетаскивания layout выключен — не мешает открытию карточки
                  // Соседи плавно разъезжаются: сдвиг — анимацией transform; первая раскладка — без анимации
                  return <motion.div key={reference.id} className="absolute left-0 top-0" initial={false} animate={{ x, y, width, height }} transition={tileSpring}>
                  <ContextMenu>
                  <ContextMenuTrigger asChild><div className="h-full" onContextMenu={(event) => event.stopPropagation()}>
                  <DraggableTile id={reference.id} picked={selected.includes(reference.id)} onClickCapture={(event) => pickTile(event, reference.id)}>
                    {view === 'list' ? <>
                    {/* Строка списка — превью карточки: клик открывает её, как плитку. Действия — при наведении справа, поверх данных */}
                    {modal(reference, 'ref-image', false, <ListRow reference={reference} kind={types.find((item) => item.id === typeOf(reference))?.label ?? ''} working={Boolean(working)} />)}
                    </> : <>
                    {/* v2: карточка-рамка как у Fabric — превью с отступом, под ним название и домен; ↗ — источник при наведении */}
                    <Tilt className="absolute rounded-surface" style={{ top: cardInset - 1, left: cardInset - 1, right: cardInset - 1, bottom: captionHeight }}>
                    {/* Пока сервер достаёт содержимое ссылки, картинки ещё нет — показываем заглушку */}
                    {!reference.image && !textOnly ? <Skeleton className="absolute inset-0 rounded-surface" /> : modal(reference)}
                    {/* Идёт работа — плитка приглушена, по ней проходит блик, сверху слева — что именно идёт и сколько (владелец 2026-09-27).
                        На наведении плашка уступает место названию и кнопкам */}
                    {working && <TileWorking label={workLabel(reference, progress[reference.id])} />}
                    {/* Откуда материал — фавиконка сайта; без ссылки или без фавиконки — иконка типа (гибрид, владелец 2026-10-03). У текстовой плитки иконка в заголовке */}
                    {!textOnly && reference.image && <SourceBadge source={reference.source} fallback={types.find((item) => item.id === typeOf(reference))?.icon} />}
                    {/* Пост-альбом: на плитке первый файл и сколько их всего (владелец 2026-10-02) */}
                    {(reference.media?.length ?? 0) > 1 && <span className="pointer-events-none absolute right-2 bottom-2 glass-lite rounded-lg border px-2 py-0.5 text-xs text-popover-foreground tabular-nums" aria-label={t('Файлов в посте: {n}', { n: reference.media!.length })}>1/{reference.media!.length}</span>}
                    {/* В покое плитка — превью, иконка типа и счётчик альбома; остальное — при наведении */}
                    {/* Действия на плитке, как у Pinterest: подборка, главное действие, удалить. Видны при наведении и пока идёт работа. */}
                    <div className={`pointer-events-none absolute inset-0 flex flex-col justify-between rounded-surface bg-gradient-to-t from-black/70 via-transparent to-black/40 p-2.5 ${reference.fetchError || error ? '' : 'hidden'}`}>
                      {/* v2 (каркас Fabric): на плитке нет кнопок — всё в правом клике; здесь только статус ошибки */}
                      <span />
                      <div className="flex items-end justify-between gap-2">
                        {/* Слева внизу — подборки (решение владельца: вместо «открыть оригинал»; оригинал — в карточке): одна кнопка
                            «папка + число», в окне — чипы с × и поиск. Рядом — статус работы; справа — удалить */}
                        <div className="pointer-events-auto flex min-w-0 flex-col items-start gap-1">
                        <div className="flex min-w-0 flex-col gap-0.5">
                          {error && <span className="line-clamp-2 text-xs text-white/70">{t('Не получилось: {error}', { error })}</span>}
                          {reference.fetchError && !reference.fetching && (
                            // Причина с сервера, а не общая фраза: «закрытый канал», «пост удалён» — разное, что делать дальше
                            <span className="pointer-events-auto flex items-end gap-2 text-xs text-white/70">
                              <span className="line-clamp-3">{reference.fetchError}</span>
                              {/* Повтор — только там, где он может помочь: закрытый канал и не-ссылка на пост сами не починятся */}
                              {!/^(Закрытый канал|Это не ссылка на пост)/.test(reference.fetchError) && (
                                <Button variant="ghost" size="icon-sm" className="shrink-0 text-white hover:bg-white/10 hover:text-white" aria-label={t('Повторить')} title={t('Повторить')} onClick={() => refetch(reference.id)}><RotateCcw /></Button>
                              )}
                            </span>
                          )}
                        </div>
                        </div>
                      </div>
                    </div>
                    </Tilt>
                    {/* Источник — открыть в новой вкладке, только при наведении */}
                    {/^https?:\/\//.test(reference.source) && <Button variant="secondary" size="icon-sm" aria-label={t('Открыть источник')} className="absolute top-3 right-3 opacity-0 shadow-sm transition-opacity group-hover:opacity-100 focus-visible:opacity-100" onClick={(event) => { event.stopPropagation(); window.open(sourceHref(reference.source), '_blank', 'noopener') }}><ArrowUpRight /></Button>}
                    <div className="absolute inset-x-2 bottom-0 flex flex-col justify-center" style={{ height: captionHeight }}>
                      <span className="truncate text-sm font-medium">{reference.title}</span>
                      {heard(reference.id)
                        // Нашлось в речи ролика — вместо домена таймкод и фрагмент; клик — карточка, плеер с этой секунды
                        ? <button type="button" className="truncate text-left caption hover:text-foreground" onClick={() => { setSeek({ id: reference.id, t: heard(reference.id)!.t }); openLinked(reference.id) }}><span className="font-medium text-foreground tabular-nums">▶ {clock(heard(reference.id)!.t)}</span> {heard(reference.id)!.text}</button>
                        : <span className="truncate caption">{reference.dupOf && <span className="mr-1 rounded-sm bg-muted px-1 py-0.5 text-micro font-medium uppercase tracking-wide text-foreground">{t('Дубль')}</span>}{timelinePage ? [folders.find((item) => item.id === placeOf(reference) && !item.inbox)?.name, sourceLabel(reference)].filter(Boolean).join(' · ') : sourceLabel(reference)}</span>}
                    </div>
                    </>}
                  </DraggableTile>
                  </div></ContextMenuTrigger>
                  {tileMenu(reference)}
                  </ContextMenu>
                  </motion.div>
                }) })()}
              </motion.div>
            </LayoutGroup>
          ) : (
            // Раздел «Холст» без холстов: не «ничего не нашлось», а предложение создать первый
            type === 'canvas' && !query.trim() && !collection && !board && !color && !similarTo ? (
              <Empty>
                <EmptyHeader>
                  <EmptyMedia variant="icon"><Network /></EmptyMedia>
                  <EmptyTitle>{t('Холстов пока нет')}</EmptyTitle>
                </EmptyHeader>
                <EmptyContent><Button size="sm" onClick={() => void addCanvas()}><Plus />{t('Создать холст')}</Button></EmptyContent>
              </Empty>
            ) : (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon"><CircleDashed /></EmptyMedia>
                {/* Отсекает только поиск (фильтров нет) — так и говорим: «сбросьте фильтры» при пустых фильтрах путал (аудит 2026-10-13) */}
                {/* Пусто из-за фильтра — «Сбросить фильтры»; space пустой сам по себе — без кнопки, она там ничего не делала (владелец 2026-10-03) */}
                <EmptyTitle>{loadError ? t('Библиотека не загрузилась') : !references.length ? t('Библиотека пуста') : filtering ? t('Ничего не нашлось') : t('Здесь пока пусто')}</EmptyTitle>
                <EmptyDescription>{loadError ? t('Сервер Refkit не отвечает. Проверьте, что он запущен, и повторите.') : (references.length && filtering ? (searchOnly ? t('Ничего по «{trim}». Попробуйте другое слово.', { trim: query.trim() }) : t('Попробуйте другое слово или сбросьте фильтры.')) : t('Вставьте что угодно через ⌘V — картинку, ссылку, видео — или перетащите сюда карточку.'))}</EmptyDescription>
              </EmptyHeader>
              {/* Ошибка загрузки — причина и «Повторить» (выбор владельца 2026-10-14 из 4 вариантов) */}
              {loadError && <EmptyContent><Button variant="outline" size="sm" onClick={() => void reload()}>{t('Повторить')}</Button></EmptyContent>}
              {/* Совсем пустая библиотека (владелец 2026-10-29): два первых шага кнопками; как только появился материал, подсказка уходит сама */}
              {!loadError && loaded && !references.length && <EmptyContent className="flex-row justify-center"><Button size="sm" onClick={() => openDraft({ link: '' })}><Plus />{t('Добавить')}</Button><Button variant="outline" size="sm" onClick={() => void addCanvas()}>{t('Создать холст')}</Button></EmptyContent>}
              {!loadError && references.length > 0 && filtering && <EmptyContent><Button variant="outline" size="sm" onClick={() => { setQuery(''); setCollection(null); setType('all'); setColor(null); setSimilarTo(null) }}>{searchOnly ? t('Очистить поиск') : t('Сбросить фильтры')}</Button></EmptyContent>}
            </Empty>
            )
          )}
          </>)}
        </main>
        </ContextMenuTrigger>
        <ContextMenuContent className="min-w-56">
          {createEntries.map((entry) => (
            <ContextMenuItem key={entry.label} onSelect={entry.run} className="gap-3 py-1.5">
              <span className="grid size-4 shrink-0 place-items-center"><entry.icon className="size-4" /></span>
              {entry.label}
            </ContextMenuItem>
          ))}
        </ContextMenuContent>
        </ContextMenu>
        {/* Затемнение под нижней панелью: лента уходит под него, и панель не сливается с плитками (как градиент под шапкой) */}
        {!graphPage && !flyPage && <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 z-(--z-sticky) h-28 scrim-up [--fade:88px]" />}
        </div>
        {cardId && (cardRef?.kind === 'canvas' ? (
          <CanvasPage memorySlot={memorySlot} commentsSlot={commentsSlot} commentsActive={agentOpen && agentTab === 'comments'} onCommentsCount={setCommentsCount} onOpenComments={() => { setAgentTab('comments'); setAgentOpen(true) }} onHideComments={() => setAgentTab('agent')} agentButton={agentButton} onSettings={openSettings} onAddMaterial={addMaterial} onAddToFolder={(target) => { setDraftFolder(target); setDraft({ link: '' }) }} onMoveToFolder={(ids, folderId) => moveTo(ids, folderId)} onRemoveFromBoard={(refId, board) => { const item = references.find((reference) => reference.id === refId); if (item) update(refId, { boards: (item.boards ?? []).filter((name) => name !== board) }) }} id={cardRef.id} title={cardRef.title} onManageActions={() => { openFolder(null); setFoldersPage(false); setActionsPage(true) }} items={references.map((item) => ({ id: item.id, title: item.title, image: item.image, ratio: item.ratio, kind: item.kind, text: item.description, folder: item.folder, boards: item.boards }))}
            onBack={closeCard} onRename={(next) => update(cardRef.id, { title: next })} onOpenCard={(to) => openCard(to)}
            onBoxes={(boxes) => setReferences((list) => list.map((item) => item.id === cardRef.id ? { ...item, canvasBoxes: boxes } : item))} />
        ) : cardRef ? cardView(cardRef, (() => {
          const { textOnly, noteCard } = faceOf(cardRef)
          return (
            <GrowFrom key={cardRef.id} from={growFrom.current?.id === cardRef.id ? growFrom.current.rect : undefined}>
              <PageDrag id={cardRef.id}>{mediaOf(cardRef, textOnly, noteCard) ?? <img src={cardRef.image} alt={cardRef.title} className="absolute inset-0 h-full w-full object-contain" />}</PageDrag>
            </GrowFrom>
          )
        })(), closeCard, {
          // Крошки — место карточки: Spaces / родитель / space; клик — туда, без шага назад
          crumbs: <>
            <button type="button" className="shrink-0 rounded-control px-1.5 py-1 text-muted-foreground hover:bg-muted" onClick={() => leaveCard(() => openFolder(null))}>{t('Папки')}</button>
            {folderPath(placeOf(cardRef)).map((item) => (
              <Fragment key={item.id}>
                <span className="text-muted-foreground">/</span>
                <button type="button" className="min-w-14 shrink truncate rounded-control px-1.5 py-1 text-muted-foreground hover:bg-muted" onClick={() => leaveCard(() => openFolder(item.id))}>{item.name}</button>
              </Fragment>
            ))}
          </>,
        }) : loaded && (
          // Карточки нет: удалена насовсем или лежит в корзине — тогда «Вернуть»
          <div className="flex min-h-0 flex-1 flex-col">
            <header className="flex h-18 shrink-0 items-start gap-2 px-(--canvas-gutter) pt-4">
              <Button variant="ghost" size="icon-sm" className="-ml-2.5" aria-label={t('Назад')} onClick={closeCard}><ArrowLeft /></Button>
            </header>
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon"><FileQuestion /></EmptyMedia>
                <EmptyTitle>{t('Карточки нет')}</EmptyTitle>
                <EmptyDescription>{trash.some((item) => item.id === cardId) ? t('Она в корзине.') : t('Её удалили насовсем или ссылка неверная.')}</EmptyDescription>
              </EmptyHeader>
              {trash.some((item) => item.id === cardId) && <EmptyContent><Button variant="outline" size="sm" onClick={() => void restore(trash.find((item) => item.id === cardId)!.trashName)}><RotateCcw />{t('Вернуть')}</Button></EmptyContent>}
            </Empty>
          </div>
        ))}

        {dragOver && (
          <div className="pointer-events-none absolute inset-3 z-10 grid place-items-center glass rounded-container border-2 border-dashed border-ring">
            <span className="flex items-center gap-2 text-sm font-medium"><ImagePlus className="size-4" />{t('Отпустите, чтобы добавить')}</span>
          </div>
        )}
      </SidebarInset>
      <LibraryAgent overlay={canvasOpen || Boolean(cardRef)} tab={agentTab} onTab={setAgentTab} commentsCount={commentsCount} canvasOpen={canvasOpen} onCommentsSlot={setCommentsSlot} onMemorySlot={setMemorySlot} onInfoSlot={setInfoSlot} cardOpen={Boolean(cardRef) && !canvasOpen} autoAsk={agentAsk} onManageActions={() => { openFolder(null); setFoldersPage(false); setActionsPage(true) }} open={agentOpen} onClose={() => { setAgentOpen(false); askAbout([]) }} cards={references} modelSettings={modelSettings} onModels={(key) => void chooseModels({ digest: key, ask: key })} onDepth={(depth) => void chooseDepth(depth)} onChanged={() => { void reload(); void library.folders().then(setFolders).catch(() => {}) }} onOpenCard={openLinked} context={agentContext} contextName={agentContextName} onContext={(ids) => askAbout(ids)} />
      {/* Переименование тега: Enter — готово, Esc — отмена */}
      <Dialog open={tagRename !== null} onOpenChange={(open) => { if (!open) setTagRename(null) }}>
        <DialogContent className="sm:max-w-sm">
          <DialogTitle>{t('Переименовать тег')}</DialogTitle>
          <form onSubmit={(event) => { event.preventDefault(); const to = String(new FormData(event.currentTarget).get('name') ?? '').trim(); if (tagRename && to && to !== tagRename) void renameTag(tagRename, to); setTagRename(null) }}>
            <Input name="name" aria-label={t('Новое название тега')} defaultValue={tagRename ?? ''} autoFocus />
          </form>
        </DialogContent>
      </Dialog>
      <Dialog open={refRename !== null} onOpenChange={(open) => { if (!open) setRefRename(null) }}>
        <DialogContent className="sm:max-w-sm">
          <DialogTitle>{t('Переименовать')}</DialogTitle>
          <form onSubmit={(event) => { event.preventDefault(); const title = String(new FormData(event.currentTarget).get('name') ?? '').trim(); if (refRename && title && title !== refRename.title) update(refRename.id, { title }); setRefRename(null) }}>
            <Input name="name" aria-label={t('Новое название')} defaultValue={refRename?.title ?? ''} autoFocus onFocus={(event) => event.currentTarget.select()} />
          </form>
        </DialogContent>
      </Dialog>
      <IconDialog folder={iconFolder} onPick={(icon) => { if (iconFolder) void library.updateFolder(iconFolder.id, { icon }).then(setFolders) }} onClose={() => setIconFolder(null)} />
      <Dialog open={folderRename !== null} onOpenChange={(open) => { if (!open) setFolderRename(null) }}>
        <DialogContent className="sm:max-w-sm">
          <DialogTitle>{t('Переименовать папку')}</DialogTitle>
          <form onSubmit={(event) => { event.preventDefault(); const name = String(new FormData(event.currentTarget).get('name') ?? '').trim(); if (folderRename && name && name !== folderRename.name) renameFolder(folderRename.id, name); setFolderRename(null) }}>
            <Input name="name" aria-label={t('Новое название папки')} defaultValue={folderRename?.name ?? ''} autoFocus onFocus={(event) => event.currentTarget.select()} />
          </form>
        </DialogContent>
      </Dialog>
      <AddDialog hintsFor={tagHints} findExisting={(link) => { const found = references.find((item) => item.source && linkKey(item.source) === linkKey(link)); return found ? { id: found.id, title: found.title, place: folders.find((item) => item.id === placeOf(found))?.name ?? t('Папки') } : undefined }} onOpenExisting={openLinked} draft={draft} folders={flatFolders(folders)} defaultFolder={draftFolder ?? folder ?? undefined}
        collections={collectionList.map((item) => ({ name: item.name, icon: iconOf(item.name) }))} onCreateCollection={createCollection}
        onSave={saveDraft} onClose={() => { setDraft(null); setDraftFolder(undefined) }} />
    </SidebarProvider>
    {marquee && <div aria-hidden className="pointer-events-none fixed z-(--z-marquee) rounded-sm border border-primary/60 bg-primary/10" style={{ left: Math.min(marquee.x0, marquee.x1), top: Math.min(marquee.y0, marquee.y1), width: Math.abs(marquee.x1 - marquee.x0), height: Math.abs(marquee.y1 - marquee.y0) }} />}
    {/* Плашка выделения — снизу по центру: сколько выбрано и что с ними сделать; × или Esc — снять */}
    {selected.length > 0 && !cardId && (
      // v2: панель выделения как у Fabric — действия словами; Esc или «Снять выделение» — выйти
      <FloatingBar label={t('Выбранные карточки')}>
        <Button variant="ghost" size="sm" onClick={() => setSelected([])}>{t('Снять выделение')} <Badge variant="secondary" className="tabular-nums">{selected.length}</Badge></Button>
        <Button variant="destructive" size="sm" onClick={() => { void removeMany(selected); setSelected([]) }}>{t('Удалить')}</Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild><Button variant="ghost" size="sm">{t('Переместить…')}</Button></DropdownMenuTrigger>
          <DropdownMenuContent side="top" align="center" className="max-h-80">
            {flatFolders(folders).map(({ item, depth }) => <DropdownMenuItem key={item.id} style={{ paddingLeft: 8 + depth * 14 }} onSelect={() => moveTo(selected, item.id)}>{item.inbox ? <Inbox /> : <Folder />}{item.name}</DropdownMenuItem>)}
            <DropdownMenuItem onSelect={() => void createFolder(undefined, selected)}><Plus />{t('Новая папка')}</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        {/* Теги для всех выбранных: галочка — у всех стоит; клик ставит всем или снимает у всех (как в правом клике) */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild><Button variant="ghost" size="icon-sm" aria-label={t('Теги')}><TagIcon /></Button></DropdownMenuTrigger>
          <DropdownMenuContent side="top" align="center" className="max-h-80">
            {collectionList.map((item) => {
              const picked = references.filter((reference) => selected.includes(reference.id))
              const on = picked.length > 0 && picked.every((reference) => collectionsOf(reference).includes(item.name))
              return <DropdownMenuCheckboxItem key={item.name} checked={on} onSelect={(event) => event.preventDefault()}
                onCheckedChange={() => picked.forEach((reference) => update(reference.id, { collections: on ? collectionsOf(reference).filter((name) => name !== item.name) : [...new Set([...collectionsOf(reference), item.name])] }))}>{item.name}</DropdownMenuCheckboxItem>
            })}
          </DropdownMenuContent>
        </DropdownMenu>
        {/* Агент: спросить только про выбранные — или дописать их к тому, что уже в контексте */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild><Button variant="outline" size="sm"><MessageSquare />{t('Спросить агента')}<ChevronUp className="opacity-60" /></Button></DropdownMenuTrigger>
          <DropdownMenuContent side="top" align="end">
            <DropdownMenuItem onSelect={() => workOn(selected)}>{t('Спросить про выбранные')}</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => { setAgentContext((list) => [...new Set([...list, ...selected])]); setAgentOpen(true) }}>{t('Добавить в контекст')}</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </FloatingBar>
    )}
    {/* v2: нижняя плавающая панель как у Fabric — добавить, найти, агент. Пока что-то выделено, на её месте панель выделения */}
    {/* На телефоне агент открыт на весь экран — панель легла бы на его поле ввода; закрыть агента — крестик в его шапке */}
    {selected.length === 0 && !canvasOpen && !(agentOpen && !notPhone) && (
      <FloatingBar label={t('Действия')}>
        {!canvasOpen && <><Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" aria-label={canvasSection ? t('Создать холст') : t('Добавить')} onClick={() => (canvasSection ? void addCanvas() : openDraft({ link: '' }))}><Plus /></Button></TooltipTrigger><TooltipContent>{canvasSection ? t('Создать холст') : t('Добавить · ⌘V')}</TooltipContent></Tooltip>
        <Popover>
          <Tooltip><TooltipTrigger asChild><PopoverTrigger asChild><Button variant={query || color || similarTo ? 'secondary' : 'ghost'} size="icon" aria-label={t('Найти')}><Search /></Button></PopoverTrigger></TooltipTrigger><TooltipContent>{t('Найти')}</TooltipContent></Tooltip>
          <PopoverContent side="top" align="center" sideOffset={12} className="w-auto rounded-lg p-1">
              <InputGroup className="w-(--bar-width)">
                <InputGroupAddon><Search /></InputGroupAddon>
                {/* Фильтры поиска чипами внутри поля: цвет и «похожее на»; × снимает */}
                {color && <InputGroupAddon><span className="flex items-center gap-1 rounded-full bg-muted py-0.5 pl-1 pr-0.5 text-xs text-foreground"><span className="size-4 rounded-full ring-1 ring-border" style={{ background: color }} />{color}<Button variant="ghost" size="icon-xs" aria-label={t('Снять цвет')} onClick={() => setColor(null)}><X /></Button></span></InputGroupAddon>}
                {similarTo && <InputGroupAddon><span className="flex max-w-56 items-center gap-1 rounded-lg bg-muted py-0.5 pl-2 pr-0.5 text-xs text-foreground"><span className="truncate">{t('Похожее на «{title}»', { title: references.find((item) => item.id === similarTo)?.title })}</span><Button variant="ghost" size="icon-xs" aria-label={t('Снять «похожее»')} onClick={() => setSimilarTo(null)}><X /></Button></span></InputGroupAddon>}
                <InputGroupInput autoFocus value={query} onChange={(event) => setQuery(event.target.value)} aria-label={t('Найти в библиотеке')} />
                {palette.length > 0 && (
                  <InputGroupAddon align="inline-end">
                    <Popover>
                      <PopoverTrigger asChild><Button variant="ghost" size="icon-sm" className="rounded-lg" aria-label={t('Искать по цвету')}><Palette /></Button></PopoverTrigger>
                      <PopoverContent align="end" className="w-auto p-3">
                        <div className="grid grid-cols-6 gap-2" role="listbox" aria-label={t('Цвета библиотеки')}>
                          {palette.map((hex) => <button key={hex} type="button" role="option" aria-selected={color === hex} aria-label={hex} className={cn('size-7 rounded-lg ring-1 ring-border transition-transform hover:scale-110 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none', color === hex && 'ring-2 ring-foreground')} style={{ background: hex }} onClick={() => { setColor(hex); setSimilarTo(null) }} />)}
                        </div>
                        {/* Свой цвет — системная пипетка (в shadcn выбора цвета нет): можно взять цвет с экрана */}
                        <label className="mt-3 flex cursor-pointer items-center gap-2 caption">
                          <input type="color" value={color ?? '#888888'} onChange={(event) => { setColor(event.target.value); setSimilarTo(null) }} className="size-6 cursor-pointer rounded-sm border-0 bg-transparent p-0" />
                          {t('Свой цвет')}
                        </label>
                      </PopoverContent>
                    </Popover>
                  </InputGroupAddon>
                )}
              </InputGroup>
          </PopoverContent>
        </Popover></>}
        {canPinShown && (
          <Tooltip>
            <TooltipTrigger asChild><Button variant={pinMode ? 'secondary' : 'ghost'} size="icon" aria-label={t('Комментарий на картинке')} aria-pressed={pinMode} onClick={() => setPinMode(!pinMode)}><MessageSquarePlus /></Button></TooltipTrigger>
            <TooltipContent>{t('Комментарий · C')}</TooltipContent>
          </Tooltip>
        )}
        {agentButton}
        {(graphPage || flyPage) && <span ref={setGraphDockSlot} className="contents" />}
      </FloatingBar>
    )}
    {/* Копия под курсором — картинка, а не плитка: вторая плитка задвоила бы переходы открытия карточки (layoutId) */}
    <DragOverlay modifiers={dragKind.current === 'folder' ? [snapCenterToCursor] : undefined} dropAnimation={dragKind.current === 'folder' ? undefined : { sideEffects: null }}>{draggingFolder ? (() => { const first = folders.find((item) => item.id === draggingFolder); return <div className="flex h-8 items-center gap-2 px-2 text-sm text-sidebar-foreground/60">{first?.icon ? <span className="grid size-4 place-items-center leading-none opacity-60">{first.icon}</span> : <Folder className="size-4" />}<span>{dragGroup(draggingFolder).length > 1 ? `${dragGroup(draggingFolder).length} spaces` : folders.find((item) => item.id === draggingFolder)?.name}</span></div> })() : <ActiveTilePreview references={references} pinned={pinned} selected={selected} ordered={ordered} folders={folders} />}</DragOverlay>
    </DndContext>
  )
}

export default LibraryWireframe

// Ряд полки с прокруткой вбок: тачпадом, колесом с Shift или круглыми стрелками по краям (при наведении на полку).
// Стрелка и затухание — только с той стороны, где есть ещё карточки
function ShelfRow({ gap, children }: { gap: string; children: ReactNode }) {
  const row = useRef<HTMLDivElement>(null)
  const [edges, setEdges] = useState({ prev: false, next: false, overflow: false })
  const measure = () => {
    const el = row.current
    if (!el) return
    const prev = el.scrollLeft > 1
    const next = el.scrollLeft + el.clientWidth < el.scrollWidth - 1
    const overflow = el.scrollWidth > el.clientWidth + 1
    setEdges((old) => old.prev === prev && old.next === next && old.overflow === overflow ? old : { prev, next, overflow })
  }
  useEffect(() => {
    const el = row.current
    if (!el) return
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])
  useEffect(measure)
  const scroll = (direction: 1 | -1) => row.current?.scrollBy({ left: direction * row.current.clientWidth * 0.8, behavior: 'smooth' })
  const fade = 'pointer-events-none absolute inset-y-0 w-12 from-[color-mix(in_oklab,var(--muted)_40%,var(--background))] to-transparent'
  // Центр по вертикали — inset-y-0 + my-auto, не translate: у Button при нажатии свой translate-y-px, он затирал центровку и стрелка прыгала вниз
  const arrow = 'absolute inset-y-0 my-auto opacity-0 transition-opacity group-hover/shelfbox:opacity-100 focus-visible:opacity-100'
  return (
    <div className="relative min-w-0 flex-1">
      {/* overflow-x: auto включает прокрутку и по вертикали — превью при наведении чуть растёт, и ряд съезжал вверх.
          Вертикаль выключена, py-2 / -my-2 и pr-2 / -mr-2 — запас, чтобы увеличенное превью и крестик на углу карточки не обрезались */}
      <div ref={row} onScroll={measure} className={`-mr-2 -my-2 flex overflow-x-auto overflow-y-hidden py-2 pr-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${gap}`}>{children}</div>
      {/* Затухание — градиентом цвета полки поверх края, не mask-image: маска стала бы рамкой для fixed-слоёв внутри,
          и карточка, открытая с полки, раскрывалась бы внутри ряда, обрезанная его краями */}
      {edges.prev && <div aria-hidden className={`${fade} left-0 bg-linear-to-r`} />}
      {edges.next && <div aria-hidden className={`${fade} right-0 bg-linear-to-l`} />}
      {/* Стрелки есть, пока ряд длиннее полки, и не пропадают у края — иначе исчезали бы из-под курсора, и следующий клик
          открывал карточку. У края, куда листать некуда, тускнеют и молчат. Не disabled: у Button он даёт pointer-events: none,
          и клик провалился бы в карточку под стрелкой */}
      {edges.overflow && <Button variant="secondary" size="icon-sm" aria-label={t('Прокрутить полку назад')} aria-disabled={!edges.prev} className={`${arrow} left-1 aria-disabled:group-hover/shelfbox:opacity-30`} onClick={() => edges.prev && scroll(-1)}><ChevronLeft /></Button>}
      {edges.overflow && <Button variant="secondary" size="icon-sm" aria-label={t('Прокрутить полку вперёд')} aria-disabled={!edges.next} className={`${arrow} right-1 aria-disabled:group-hover/shelfbox:opacity-30`} onClick={() => edges.next && scroll(1)}><ChevronRight /></Button>}
    </div>
  )
}

type View = 'list' | 'mosaic'
type SortMode = 'title' | 'created' | 'updated' | 'kind'
// v2: сортировка как у Fabric — поле выпадашкой, направление стрелкой рядом
const sorts: Array<{ id: SortMode; label: string }> = [
  { id: 'title', label: t('По алфавиту') },
  { id: 'created', label: t('Добавлено') },
  { id: 'updated', label: t('Изменено') },
  { id: 'kind', label: t('Тип') },
]
// v2: режимы Мозаика · Список (сетку убрали 2026-10-15 — у неё те же плитки с квадратными превью, а мозаика не обрезает; старое «grid» из памяти браузера читается как мозаика); «Дерево» (бывшая «Карта») убрано 2026-10-07 — в истории git
const views: Array<{ id: View; label: string; icon: typeof Library }> = [
  { id: 'mosaic', label: t('Мозаика'), icon: LayoutDashboard },
  { id: 'list', label: t('Список'), icon: List },
]
type Placed<T> = { item: T; x: number; y: number; width: number; height: number }
// Мозаика: плитка — в самый короткий столбец, высота — по пропорции «w / h»; top — откуда начинать (лента по дням)
// Колонки делят ширину поровну, зазор постоянный: колесо меняет число колонок, плитки растягиваются на всю ширину
// Материал на карточке-странице тащится как сама карточка — в «Пины», в space, в «Корзину» (владелец 2026-10-03).
// Свой id (у спрятанной плитки ленты тот же id карточки), карточку называет data.ref — как у листа карты
function PageDrag({ id, children }: { id: string; children: ReactNode }) {
  const { setNodeRef, listeners } = useDraggable({ id: `page:${id}`, data: { ref: id } })
  return <div ref={setNodeRef} {...listeners} className="absolute inset-0 cursor-grab active:cursor-grabbing">{children}</div>
}
// Значок в левом верхнем углу плитки: фавиконка сайта-источника (сервер находит и хранит, /api/library/favicon) или,
// без ссылки и фавиконки, иконка типа — оба на одной тёмной подложке, 32 px (владелец 2026-10-03); показываются только при наведении (владелец 2026-10-29):
// тип уже подписан под плиткой, значок на кадре дублировал его
const sourceHost = (source: string) => {
  if (!/^https?:\/\//.test(source)) return ''
  const host = new URL(source).hostname.replace(/^(www|m)\./, '')
  if (/^(localhost|127\.0\.0\.1)$/.test(host)) return ''
  return host === 'youtu.be' ? 'youtube.com' : host === 'pin.it' ? 'pinterest.com' : host === 'twitter.com' ? 'x.com' : host
}
function SourceBadge({ source, fallback: Fallback }: { source: string; fallback?: LucideIcon }) {
  const host = sourceHost(source)
  const [failed, setFailed] = useState(false)
  if (host && !failed) return (
    <span aria-hidden className="pointer-events-none absolute left-2 top-2 grid size-8 place-items-center glass-lite rounded-control border opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
      <img src={`/api/library/favicon?host=${host}`} alt="" className="size-5 rounded-[4px] object-contain" onError={() => setFailed(true)} />
    </span>
  )
  return Fallback ? <span aria-hidden className="pointer-events-none absolute left-2 top-2 grid size-8 place-items-center glass-lite rounded-control border text-popover-foreground opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"><Fallback className="size-5" /></span> : null
}

// Открытая карточка — из адреса #/card/<id> (идея 61)
// Материал страницы «вырастает» из плитки, по которой кликнули: старт — прямоугольник плитки, финиш — своё место, 200 мс
// (grill-card-page.md). Общий layoutId framer тут не сработал бы: лента прячется, а не размонтируется. «Меньше движения» — без анимации
function GrowFrom({ from, children }: { from?: DOMRect; children: ReactNode }) {
  const box = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const node = box.current
    if (!from || !node || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const to = node.getBoundingClientRect()
    if (!to.width || !to.height) return
    node.animate([
      { transformOrigin: 'top left', transform: `translate(${from.left - to.left}px, ${from.top - to.top}px) scale(${from.width / to.width}, ${from.height / to.height})` },
      { transformOrigin: 'top left', transform: 'none' },
    ], { duration: 200, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  return <div ref={box} className="relative h-full w-full overflow-hidden rounded-surface">{children}</div>
}
const cardFromHash = () => window.location.hash.match(/^#\/card\/([\w-]+)/)?.[1] ?? null

function mosaic<T extends { ratio: string }>(items: T[], count: number, width: number, gap: number, top = 0, extra: (item: T) => number = () => 0, inset = 0) {
  const column = width ? (width - gap * (count - 1)) / count : 0
  const stepX = column + gap
  const heights = Array(count).fill(top)
  const tiles = items.map((item): Placed<T> => {
    const [w, h] = (item.ratio ?? '1 / 1').split('/').map(Number) // без ratio (материал добавили мимо интерфейса) — квадрат, а не белый экран
    const col = heights.indexOf(Math.min(...heights))
    const height = (column - inset * 2) * (h && w ? h / w : 1) + extra(item)
    const tile = { item, x: col * stepX, y: heights[col], width: column, height }
    heights[col] += height + gap
    return tile
  })
  return { tiles, bottom: Math.max(top, ...heights.map((value) => value - gap)) }
}
// Место каждой плитки (x, y, ширина, высота) во всех видах: одна раскладка — перестановка везде только сдвиг
function placeTiles<T extends { ratio: string }>(items: T[], view: View, count: number, width: number, gap = tileGap, extra?: (item: T) => number, inset = 0) {
  if (view === 'list') {
    const row = 56
    return { tiles: items.map((item, index): Placed<T> => ({ item, x: 8, y: index * (row + 4), width: width - 8, height: row })), height: Math.max(0, items.length * (row + 4) - 4) }
  }
  const placed = mosaic(items, count, width, gap, 0, extra, inset)
  return { tiles: placed.tiles, height: placed.bottom }
}

// Подсказка-стекло у значка заметки: название и первые строки текста, как подпись в полёте
function NoteHint({ reference, children }: { reference: Reference; children: ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side="bottom" className="block max-w-72 py-2 leading-snug">
        <span className="block font-medium">{reference.title}</span>
        {reference.description && <span className="mt-0.5 line-clamp-3 block text-muted-foreground">{reference.description}</span>}
      </TooltipContent>
    </Tooltip>
  )
}

// Превью материала без картинки в 40 px (пины, список): значок его типа — заметка, статья, ролик. Мелкая копия бумажки не читалась
function TypeGlyph({ reference }: { reference: Reference }) {
  const Icon = types.find((item) => item.id === typeOf(reference))?.icon ?? SquarePen
  return <span aria-hidden className="absolute inset-0 grid place-items-center bg-muted text-muted-foreground"><Icon className="size-5" /></span>
}

// Строка списка: превью, название и строка описания, справа — тип, подборки, дата (на наведении их закрывают действия)
function ListRow({ reference, kind, working }: { reference: Reference; kind: string; working: boolean }) {
  const date = reference.createdAt ? new Date(reference.createdAt).toLocaleDateString(locale, { day: 'numeric', month: 'short' }) : ''
  return (
    <span className="absolute inset-0 flex items-center gap-3 bg-card px-2 text-left">
      {(() => {
        const thumb = (
          <span className="relative size-10 shrink-0 overflow-hidden rounded-control bg-muted">
            {reference.image ? <img src={reference.image} alt="" className="absolute inset-0 h-full w-full object-cover" /> : <TypeGlyph reference={reference} />}
            {working && <span className="absolute inset-0 grid place-items-center bg-black/50"><LoaderCircle className="size-4 animate-spin text-white" /></span>}
          </span>
        )
        return reference.image ? thumb : <NoteHint reference={reference}>{thumb}</NoteHint>
      })()}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{reference.title}</span>
        <span className="block truncate caption">{working ? workLabel(reference) : reference.description ?? ''}</span>
      </span>
      <span className="hidden shrink-0 caption transition-opacity group-hover:opacity-0 md:block">{[kind, ...collectionsOf(reference), date].filter(Boolean).join(' · ')}</span>
    </span>
  )
}

// Копия под курсором строится от состояния самого dnd-kit (active), а не от dragging/group: те ставятся в фоне (startTransition),
// потому что их смена перерисовывает всю ленту (в разработке ~0,6 с) — копия должна появиться сразу, без этой задержки
// Снимок разметки плитки: один на перетаскивание (кэш по id), без iframe и ярлыков доступности — это просто картинка
let snapshot: { id: string; html: string } | null = null
function tileSnapshot(id: string, node: HTMLElement | null) {
  if (snapshot?.id === id) return snapshot.html
  if (!node) return ''
  const copy = node.cloneNode(true) as HTMLElement
  copy.querySelectorAll('iframe, video, audio').forEach((item) => item.remove())
  copy.querySelectorAll('[id]').forEach((item) => item.removeAttribute('id'))
  copy.removeAttribute('aria-selected')
  snapshot = { id, html: copy.outerHTML }
  return snapshot.html
}

function ActiveTilePreview({ references, pinned, selected, ordered, folders }: { references: Reference[]; pinned: Reference[]; selected: string[]; ordered: Reference[]; folders: FolderItem[] }) {
  const { active, activeNode, activeNodeRect, activatorEvent } = useDndContext()
  if (!active) { snapshot = null; return null }
  const width = active.rect.current.initial?.width ?? 160
  const id = cardOf(active as Parameters<typeof cardOf>[0])
  if (id.startsWith('frow:')) return null
  if (id.startsWith('ftile:')) {
    const folder = folders.find((item) => item.id === id.slice('ftile:'.length))
    return <div className="glass flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm shadow-xl"><span aria-hidden className="grid size-4 place-items-center leading-none">{folder?.icon ?? <Folder className="size-4" />}</span>{folder?.name}</div>
  }
  const shelf = id.startsWith('shelf-all')
  // Плитка ленты — её точная копия: снимок готовой разметки (размер, превью, подпись как есть), а не пересборка
  const box = activeNodeRect
  const html = shelf || !box ? '' : tileSnapshot(id, activeNode)
  if (html && box) {
    const count = selected.includes(id) ? ordered.filter((reference) => selected.includes(reference.id)).length : 1
    // Вдвое меньше, но сжимается к точке захвата: курсор остаётся на том же месте копии, механика прежняя
    const grab = activatorEvent as PointerEvent | null
    const origin = grab && 'clientX' in grab ? `${grab.clientX - box.left}px ${grab.clientY - box.top}px` : 'center'
    return <div className="pointer-events-none relative opacity-60" style={{ width: box.width, height: box.height, transform: 'scale(0.5)', transformOrigin: origin }}>
      <div className="size-full" dangerouslySetInnerHTML={{ __html: html }} />
      {count > 1 && <Badge className="absolute -right-2 -top-2 tabular-nums">{count}</Badge>}
    </div>
  }
  // Полка целиком — стопкой её обложек с числом
  const item = shelf ? pinned.find((reference) => reference.image) ?? pinned[0] : references.find((reference) => reference.id === id)
  const count = shelf ? pinned.length : selected.includes(id) ? ordered.filter((reference) => selected.includes(reference.id)).length : 1
  if (!item) return null
  // Пачка — стопкой: под верхней картинкой край второй карточки и число. Копия появляется мягко: из крупной (как была плитка) в свой размер на пружине
  return <div className="relative opacity-60" style={{ width }}>
    {count > 1 && <div className="absolute inset-0 -rotate-3 rounded-surface bg-muted shadow-xl ring-1 ring-border" />}
    <div className="relative overflow-hidden rounded-surface bg-card shadow-lg ring-1 ring-border" style={{ aspectRatio: item.ratio }}>
      {item.image ? <img src={item.image} alt="" className="h-full w-full object-cover" /> : <span className="line-clamp-4 p-3 text-sm font-medium">{item.title}</span>}
    </div>
    {count > 1 && <Badge className="absolute -right-2 -top-2 tabular-nums">{count}</Badge>}
  </div>
}

// Мышь и перо: перетаскивание начинается только с самой плитки — не из поля названия и не из открытой карточки
// (она в портале, но события из неё всплывают по дереву React до плитки)
class TileSensor extends PointerSensor {
  static activators = [{
    eventName: 'onPointerDown' as const,
    handler: ({ nativeEvent: event, currentTarget }: ReactPointerEvent) =>
      event.isPrimary && event.button === 0 && event.pointerType !== 'touch' && currentTarget.contains(event.target as Node)
        && !(event.target as HTMLElement).closest('input, textarea, video, iframe, [contenteditable="true"]'), // плеер: ползунок и кнопки — не перетаскивание
  }]
}

// Полка как целое тоже тащится (dnd-kit): render-prop, потому что сама полка собирается функцией shelfBox
function DragShelf({ id, disabled, children }: { id: string; disabled: boolean; children: (ref: (node: HTMLElement | null) => void, listeners: ReturnType<typeof useDraggable>['listeners']) => ReactNode }) {
  const { setNodeRef, listeners } = useDraggable({ id, disabled })
  return children(setNodeRef, listeners)
}

// Плитка сетки: её тащат (dnd-kit) и на неё бросают — встать на её место. Пока её тащат, она сама — слот:
// светлая пунктирная рамка той же пропорции, содержимое скрыто
// Что тащат: у листа карты id — путь в дереве (карточка бывает в нескольких ветках), сама карточка — в data.ref
const cardOf = (active: { id: string | number; data: { current?: { ref?: string } | null } }) => active.data.current?.ref ?? String(active.id)

// Высоту и ширину плитке задаёт обёртка-пружина (motion.div), оболочка просто заполняет её
function DraggableTile({ id, picked, onClickCapture, children }: { id: string; picked: boolean; onClickCapture: (event: React.MouseEvent) => void; children: ReactNode }) {
  const { setNodeRef: ref, listeners } = useDraggable({ id })
  return (
    <div ref={ref} data-tile-id={id} {...listeners} onClickCapture={onClickCapture} aria-selected={picked || undefined}
      className={cn('group relative h-full touch-manipulation', tileSurface, picked && 'border-primary bg-primary/15 ring-2 ring-primary/60 hover:bg-primary/15', 'transition-[opacity,color,background-color,border-color] duration-200')}>
      {children}
    </div>
  )
}

// Таймкод «12:34» или «1:02:03»
const clock = (seconds: number) => { const h = Math.floor(seconds / 3600), m = Math.floor(seconds / 60) % 60, s = String(seconds % 60).padStart(2, '0'); return h ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}` }
// Цвет (№18): расстояние в «весах глаза» (зелёный заметнее), как на сервере в colors.ts; близко — меньше colorNear
const rgb = (hex: string) => [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16))
const colorDistance = (a: string, b: string) => { const [x, y] = [rgb(a), rgb(b)]; return Math.sqrt(2 * (x[0] - y[0]) ** 2 + 4 * (x[1] - y[1]) ** 2 + 3 * (x[2] - y[2]) ** 2) }
const colorNear = 110
const nearest = (reference: Reference, hex: string) => Math.min(Infinity, ...(reference.colors ?? []).slice(0, 4).map((own) => colorDistance(own, hex)))
// Похожее: главное — общие значимые слова названия и сути (корни, как в поиске), потом теги и слова для поиска,
// близкие главные цвета — добавка. Широкий общий тег («UX») сам по себе похожести не делает
const meaningful = (reference: Reference) => new Set([reference.title, reference.description, firstThought(reference), ...reference.tags].join(' ').toLowerCase().replace(/ё/g, 'е').split(/[^\p{L}\d]+/u).filter((word) => word.length > 4).map(stem))
function likeness(a: Reference, b: Reference) {
  const shared = (x: string[] = [], y: string[] = []) => x.filter((item) => y.includes(item)).length
  const [own, other] = [meaningful(a), meaningful(b)]
  const words = [...own].filter((word) => other.has(word)).length
  const colors = (a.colors ?? []).slice(0, 3).filter((hex) => nearest(b, hex) < 90).length
  const score = 2 * words + shared(collectionsOf(a), collectionsOf(b)) + shared(a.tags, b.tags) + 0.5 * colors
  return words ? score : 0
}

const cardInset = tileInset
const dayHeading = 44
// «Сегодня», «Вчера» или дата — заголовок дня во «Входящих»
function dayLabel(at?: number) {
  if (!at) return t('Раньше')
  const day = new Date(at); day.setHours(0, 0, 0, 0)
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const diff = Math.round((today.getTime() - day.getTime()) / 86400000)
  return diff === 0 ? t('Сегодня') : diff === 1 ? t('Вчера') : day.toLocaleDateString(locale, { day: 'numeric', month: 'long', ...(day.getFullYear() !== today.getFullYear() ? { year: 'numeric' } : {}) })
}
const captionHeight = tileCaption
// Подпись под превью: домен ссылки; у файла — его тип
function sourceLabel(reference: Reference) {
  try { return /^https?:\/\//.test(reference.source) ? new URL(reference.source).hostname.replace(/^www\./, '') + new URL(reference.source).pathname.replace(/\/$/, '') : reference.format === 'video' ? t('Видео') : reference.kind === 'note' ? t('Заметка') : reference.kind === 'canvas' ? t('Холст') : t('Картинка') } catch { return '' }
}

// Что идёт на плитке: шаг агента со временем («думает · 12 с»), пока его нет — что делает сервер
function workLabel(reference: Reference, progress?: AgentProgress) {
  if (progress && (reference.digesting || reference.asking)) return t('{step} · {startedAt} с', { step: t(progress.step), startedAt: Math.max(0, Math.round((Date.now() - progress.startedAt) / 1000)) })
  return reference.fetching ? t('Загружаем…') : reference.describing ? t('Описываем…') : reference.digesting ? t('Разбираем…') : reference.converting ? t('Собираем код…') : t('Думает…')
}
function TileWorking({ label }: { label: string }) {
  return (
    <div aria-live="polite" className="pointer-events-none absolute inset-0 z-1 overflow-hidden rounded-surface bg-black/40 transition-opacity group-hover:opacity-0">
      <span aria-hidden className="tile-shine absolute inset-y-0 -left-1/2 w-1/2 bg-gradient-to-r from-transparent via-white/15 to-transparent" />
      <span className="absolute left-2.5 top-2.5 flex max-w-[calc(100%-20px)] items-center gap-1.5 glass-lite rounded-lg border px-2 py-1 text-xs text-popover-foreground">
        <LoaderCircle className="size-3.5 shrink-0 animate-spin" /><span className="truncate">{label}</span>
      </span>
    </div>
  )
}


// Папки списком с глубиной — для меню «Переместить в…»: «Входящие» первыми, вложенные под родителем
function flatFolders(folders: FolderItem[], parent?: string, depth = 0): Array<{ item: FolderItem; depth: number }> {
  return folders.filter((item) => item.parent === parent).sort((a, b) => Number(Boolean(b.inbox)) - Number(Boolean(a.inbox)))
    .flatMap((item) => [{ item, depth }, ...flatFolders(folders, item.id, depth + 1)])
}
// Папки плитками, как у Fabric: иконка папки и название; последняя — «Новая папка»
// Spaces плитками — того же вида, что карточки материалов (рамка, область с иконкой, подпись); без превью содержимого. pins — число пинов: временная папка «Пины» идёт после «Входящих»
// Плитку папки можно перетащить на другую: порядок меняется (onDragEnd → dropFolderRow); «Входящие» стоят первыми и не двигаются
function FolderDrag({ id, disabled, children }: { id: string; disabled: boolean; children: ReactNode }) {
  const { setNodeRef, listeners, isDragging } = useDraggable({ id: `ftile:${id}`, disabled })
  return <div ref={setNodeRef} {...listeners} className={cn('grid transition-opacity duration-200', isDragging && 'opacity-30')}>{children}</div>
}

function FolderTiles({ folders, onOpen, onCreate, pins, onPins, menu, view = 'grid' }: {
  view?: 'grid' | 'list'
  folders: FolderItem[]; onOpen: (id: string) => void; onCreate: () => void
  pins?: number; onPins: () => void
  menu: (item: FolderItem) => ReactNode // правый клик по space — его действия
}) {
  const tileScale = Math.min(useTileScale(), 1) // папки не крупнее обычного размера (владелец 2026-10-27): крупный вид им не нужен
  // Подложка при наведении — только у плиток папок (владелец, 2026-10-15): у плиток ленты она убрана с 13.10
  const tile = (key: string, name: string, glyph: ReactNode, onClick: () => void, drop?: string, rowIcon?: ReactNode) => {
    const body = (over: boolean, ref?: (node: HTMLElement | null) => void) => view === 'list' ? (
      <button key={key} ref={ref as React.Ref<HTMLButtonElement>} type="button" onClick={onClick} className={cn('flex w-full items-center gap-3 rounded-control px-3 py-2 text-left text-sm outline-none hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring', over && 'bg-muted ring-2 ring-primary/50')}>
        <span aria-hidden className="grid size-6 shrink-0 place-items-center text-muted-foreground [&_svg]:size-4">{rowIcon ?? glyph}</span>
        <span className="min-w-0 flex-1 truncate">{name}</span>
      </button>
    ) : (
      <SpaceTile key={key} buttonRef={ref} glyph={glyph} name={name} over={over} onClick={onClick} className="hover:bg-muted/60" />
    )
    const folder = folders.find((item) => item.id === key)
    const tileNode = drop ? <DropTarget key={key} id={drop}>{(over, ref) => body(over, ref)}</DropTarget> : body(false)
    return folder ? <ContextMenu key={key}><ContextMenuTrigger asChild><div className="grid" onContextMenu={(event) => event.stopPropagation()}><FolderDrag id={folder.id} disabled={Boolean(folder.inbox)}>{tileNode}</FolderDrag></div></ContextMenuTrigger>{menu(folder)}</ContextMenu> : tileNode
  }
  return (
    <div className={cn('pt-4', view === 'list' && 'mx-auto flex max-w-xl flex-col gap-0.5')} style={view === 'list' ? undefined : tileGridStyle(spaceTileMin * tileScale, 2)} role="list" aria-label={t('Папки')}>
      {[...folders].sort((a, b) => Number(Boolean(b.inbox)) - Number(Boolean(a.inbox))).flatMap((item) => [
        tile(item.id, item.name,
          <SpaceGlyph emoji={item.icon} fallback={item.inbox ? <Inbox className="size-2/5 stroke-1" /> : <Folder className="size-2/5 stroke-1" />} />, // папка — такая же спокойная иконка, как у «Входящих» (владелец 2026-10-29: мозаика обложек выглядела неопрятно)
          () => onOpen(item.id), `folder-tile:${item.id}`, item.icon ? <span className="text-base leading-none">{item.icon}</span> : item.inbox ? <Inbox /> : <FolderRowIcon />),
        ...(item.inbox && pins !== undefined ? [tile('pins', t('Пины'), <SpaceGlyph fallback={<Pin className="size-2/5 stroke-1" />} />, onPins, undefined, <Pin />)] : []),
      ])}
      {view === 'list'
        ? <button type="button" onClick={onCreate} className="flex w-full items-center gap-3 rounded-control px-3 py-2 text-left text-sm text-muted-foreground outline-none hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring"><span aria-hidden className="grid size-6 shrink-0 place-items-center [&_svg]:size-4"><FolderPlus /></span>{t('Новая папка')}</button>
        : <CreateTile icon={FolderPlus} label={t('Новая папка')} centered onClick={onCreate} />}
    </div>
  )
}

// Показывает содержимое только пока тащат плитку (пустая полка пинов — бросить некуда)
function WhileDragging({ children }: { children: ReactNode }) { return useDragging() ? <>{children}</> : null }

