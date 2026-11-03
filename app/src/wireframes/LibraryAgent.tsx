import { useEffect, useRef, useState } from 'react'
import { t } from '@/lib/i18n'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { Activity as ActivityIcon, AppWindow, Brain, Info, ArrowUp, Check, ChevronDown, ChevronRight, CircleStop, GripVertical, MessageSquare, Minimize2, PanelLeft, PanelRight, Plus, Undo2, X, Zap } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupTextarea } from '@/components/ui/input-group'
import { Command, CommandItem, CommandList } from '@/components/ui/command'
import { Kbd } from '@/components/ui/kbd'
import { AgentChats } from '@/components/agent-chats'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { library, type AgentChange, type AgentState, type Depth, type McpCall, type ModelSettings, type Turn } from '@/lib/library'
import { springClose, springOpen } from '@/lib/springs'
import { compact, useMinWidth } from '@/lib/breakpoints'
import { cn } from '@/lib/utils'
import { memoryChanged, permissionsChanged, useActions } from '@/components/agent-memory'
import { ActionsMenu, actionName } from '@/components/actions-menu'
import { DiffText } from '@/components/diff-text'
import { AgentSettingsMenu, ModelMenu, Thread, type Hint } from './RefCard'

// Готовые просьбы общему агенту — метод Refkit, пока агент не предложил своих. Сначала — про содержание (grill-skeptic.md:
// панель открывалась уборкой, а ценность — в сути накопленного); уборка — третьей.
// «Сведи теги к словарю» — шаг 3 grill-taxonomy.md: старые слова карточек → теги словаря, правками на принятие
const presets = [t('Что общего у последних 10 материалов'), t('Что из накопленного применить на этой неделе'), t('Сведи теги к словарю')]
// Подсказки, когда спрашивают про выбранные карточки (№21)
const contextPresets = (many: boolean) => many ? [t('Что у них общего'), t('Сравни их'), t('Что из этого применить')] : [t('Что здесь главное и как применить'), t('Что в библиотеке с этим перекликается')]
// Подсказки на странице «Память»: агент помогает с самой памятью — новые правила только через «Запомнить?»
const memoryPresets = [t('Что ты обо мне знаешь?'), t('Найди дубли и противоречия в памяти'), t('Что запомнить по моей библиотеке?')]
// Подсказки, когда агента открыли из подборки
const boardPresets = [t('Что общего в этой подборке'), t('Чего в ней не хватает'), t('Что из неё применить')]
const fieldName: Record<AgentChange['field'], string> = { title: t('Название'), description: t('Описание'), collections: t('Теги'), boards: t('Мои подборки'), folder: t('Папка'), delete: t('Удалить') }
const show = (value: unknown) => Array.isArray(value) ? value.join(', ') || '—' : String(value ?? '') || '—'

// Общий агент библиотеки (прожарка 01_strategy/grill-library-agent.md): панель справа поверх сетки, сетка видна.
// Внутри — та же колонка агента, что в карточке. Правки приходят списком «было → стало», меняется только принятое.
// Ширина — у зрителя в localStorage, тянется за левый край; двойной клик по краю — сброс
// Самое узкое окно агента, px: уже панель ломает шапку с вкладками; тянется мышью за край и стрелками
const AGENT_MIN = 260

export function LibraryAgent({ overlay = false, tab = 'agent', onTab, commentsCount = 0, canvasOpen = false, onCommentsSlot, onMemorySlot, cardOpen = false, hideInfoTab = false, autoAsk, onManageActions, open, onClose, cards, modelSettings, onModels, onDepth, onChanged, onOpenCard, context = [], contextName, onContext }: {
  overlay?: boolean // на холсте окно лежит поверх него, а не сдвигает
  // Вкладки окна (как у Doop): разговор, комментарии холста (холст кладёт панель в слот порталом), журнал действий агента
  hideInfoTab?: boolean // сведения карточки показаны на странице под картинкой
  tab?: AgentTab; onTab?: (tab: AgentTab) => void; commentsCount?: number; canvasOpen?: boolean; onCommentsSlot?: (element: HTMLElement | null) => void; onMemorySlot?: (element: HTMLElement | null) => void; cardOpen?: boolean
  onManageActions?: () => void // «Мои Actions» — страница Actions
  autoAsk?: { text: string; n: number } | null // просьба снаружи (Summary дня) — уходит сама, когда панель открыта
  open: boolean; onClose: () => void; cards: Array<{ id: string; title: string }>
  modelSettings?: ModelSettings; onModels: (key: string) => void; onDepth: (depth: Depth) => void; onChanged: () => void
  onOpenCard: (id: string) => void // ссылка на карточку в ответе агента
  context?: string[]; contextName?: string | null; onContext?: (ids: string[]) => void // про что спрашиваем (№21): пусто — вся библиотека
}) {
  const [state, setState] = useState<AgentState | null>(null)
  const [command, setCommand] = useState('')
  const [pending, setPending] = useState('')
  // Вид колонки: разговор (при открытии всегда — можно сразу обсуждать контекст) или список разговоров по кнопке «История»
  const [view, setView] = useState<'list' | 'chat'>('chat')
  const [query, setQuery] = useState('')
  // Actions: «/» в начале поля — список подходящих над полем; Enter или клик запускает первый / выбранный
  const actions = useActions()
  const slash = command.startsWith('/') ? command.slice(1).trim().toLowerCase() : null
  const matches = slash === null ? [] : actions.filter((item) => actionName(item).toLowerCase().includes(slash))
  // Выбранное действие в списке: по умолчанию первое; стрелки в поле ввода двигают его
  const [activeActionId, setActiveActionId] = useState('')
  const activeAction = matches.find((item) => item.id === activeActionId) ?? matches[0]
  const [width, setWidth] = useState(() => { try { return Number(localStorage.getItem('refkit-agent-width')) || 440 } catch { return 440 } })
  // Режим окна, как у Codex: панель справа, панель слева, плавающее, свёрнутое в строку ввода. Режим и рамка плавающего — у зрителя
  const [mode, setModeState] = useState<AgentMode>(() => { try { const saved = localStorage.getItem('refkit-agent-mode'); return saved === 'dock-left' || saved === 'float' || saved === 'min' ? saved : 'dock-right' } catch { return 'dock-right' } })
  const [rect, setRect] = useState<FloatRect>(() => { try { const saved = JSON.parse(localStorage.getItem('refkit-agent-float') ?? 'null'); if (saved && [saved.x, saved.y, saved.w, saved.h].every(Number.isFinite)) return saved } catch { /* без памяти */ } return { x: Math.max(8, window.innerWidth - 480), y: 64, w: 440, h: Math.max(360, Math.min(640, window.innerHeight - 160)) } })
  const setMode = (next: AgentMode) => { setModeState(next); try { localStorage.setItem('refkit-agent-mode', next) } catch { /* без памяти */ } }
  const saveRect = (next: FloatRect) => { setRect(next); try { localStorage.setItem('refkit-agent-float', JSON.stringify(next)) } catch { /* без памяти */ } }
  const load = () => library.agent().then(setState).catch(() => {})
  useEffect(() => { if (open) void load() }, [open])
  useEffect(() => { if (open) { setView('chat'); setQuery('') } }, [open])
  // Открыли панель про карточки — новый разговор (прошлый — в истории), чтобы вопрос не лёг в хвост чужой темы.
  // Пока панель открыта, контекст меняется на ходу (чип следит за фокусом) — разговор при этом не рвётся
  const contextKey = context.join()
  useEffect(() => { if (open && contextKey) void library.agentAct({ action: 'conversation' }).then(setState).catch(() => {}) }, [open]) // eslint-disable-line react-hooks/exhaustive-deps
  // Пока агент работает — раз в секунду: ход работы и итог
  useEffect(() => {
    if (!state?.asking) return
    const timer = setInterval(() => { void load() }, 1000)
    return () => clearInterval(timer)
  }, [state?.asking])
  const act = async (body: Parameters<typeof library.agentAct>[0]) => {
    const next = await library.agentAct(body)
    setState(next)
    if (body.action === 'apply' || body.action === 'undo' || body.action === 'save-found' || body.action === 'save-note') onChanged()
  }
  // «Поискать в сети?» — та же просьба заново; вопрос из ленты убираем сразу, как и сервер
  const answerWeb = (turn: Turn, allow: boolean) => {
    if (state?.asking) return
    setState((old) => old && { ...old, asking: true, thread: old.thread.at(-1)?.webAsk ? old.thread.slice(0, -1) : old.thread })
    setPending(turn.command)
    void act({ action: 'ask', command: turn.command, web: allow ? 'yes' : 'no' })
  }
  // Просьба снаружи уходит один раз (n — её номер), когда панель открыта и контекст уже поставлен
  const sentAuto = useRef(0)
  useEffect(() => { if (open && autoAsk && autoAsk.n !== sentAuto.current) { sentAuto.current = autoAsk.n; setTimeout(() => send(autoAsk.text), 300) } }, [open, autoAsk]) // eslint-disable-line react-hooks/exhaustive-deps
  const send = (text: string, actionId?: string) => { if (!text.trim() || state?.asking) return; if (mode === 'min') setMode('float'); setCommand(''); setPending(text.trim()); void act({ action: 'ask', command: text.trim(), actionId, ids: context.length ? context : undefined }) }
  // Контекст — своим именем: «Память», «Входящие», «Сегодня» (слово «Подборка» врало для разделов и дней)
  const contextLabel = contextName ? contextName : context.length === 1 ? cards.find((card) => card.id === context[0])?.title ?? t('Карточка') : `${context.length} ${context.length < 5 ? t('карточки') : t('карточек')}`

  const conversation = state?.conversation ?? 0
  const hasHistory = (state?.thread ?? []).some((turn) => turn.via !== 'digest')
  const showList = view === 'list' && hasHistory
  const turns = (state?.thread ?? []).filter((turn) => (turn.conversation ?? 0) === conversation)
  const asked = new Set(turns.map((turn) => turn.command.trim()))
  // Новый разговор начинается с метода Refkit; подсказки агента — продолжение уже начатого
  const hintTexts = (turns.length && state?.suggestions?.length ? state.suggestions : context.includes('memory') ? memoryPresets : contextName ? boardPresets : context.length ? contextPresets(context.length > 1) : presets).filter((text) => !asked.has(text)).slice(0, 3)
  const hints: Hint[] = hintTexts.map((text) => ({ text, run: () => send(text) }))
  const working = Boolean(state?.asking)

  const resize = (event: React.PointerEvent<HTMLDivElement>) => {
    const from = width
    const x = event.clientX
    let next = from
    event.currentTarget.setPointerCapture(event.pointerId)
    const move = (e: PointerEvent) => { next = Math.round(Math.min(window.innerWidth * 0.9, Math.max(AGENT_MIN, from + (mode === 'dock-left' ? 1 : -1) * (e.clientX - x)))); setWidth(next) }
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); try { localStorage.setItem('refkit-agent-width', String(next)) } catch { /* без памяти */ } }
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up)
  }

  const still = useReducedMotion()
  // Панель слева — ещё одна выезжающая колонка, сразу за Spaces (владелец 2026-10-10): сдвигает ленту и карточку вправо
  // на свою ширину (RefCard читает --agent-w); навигацию не трогает; поверх — только на телефонной ширине (< compact, lib/breakpoints.ts)
  const wide = useMinWidth(compact)
  const eff: AgentMode = wide ? mode : 'dock-right'
  const dockRight = eff === 'dock-right'
  const mini = eff === 'min'
  const floating = eff === 'float'
  const shownTab: AgentTab = mini ? 'agent' : tab === 'info' && hideInfoTab ? 'agent' : tab === 'comments' && !canvasOpen ? 'agent' : tab // «Правки» есть только на холсте
  useEffect(() => {
    document.documentElement.style.setProperty('--agent-w', open && wide && !overlay && dockRight ? `${width + 8}px` : '0px')
    document.documentElement.style.setProperty('--agent-overlay-w', open && overlay && wide && dockRight ? `${width + 8}px` : '0px')
    document.documentElement.style.setProperty('--agent-left-w', open && wide && eff === 'dock-left' ? `${width + 8}px` : '0px')
    return () => { document.documentElement.style.setProperty('--agent-w', '0px'); document.documentElement.style.setProperty('--agent-overlay-w', '0px'); document.documentElement.style.setProperty('--agent-left-w', '0px') }
  }, [open, width, wide, overlay, dockRight, eff])
  // Плавающее окно: за шапку тянется, за правый нижний угол меняет размер; не уходит за экран
  const view2 = { x: Math.min(Math.max(0, rect.x), Math.max(0, window.innerWidth - 160)), y: Math.min(Math.max(0, rect.y), Math.max(0, window.innerHeight - 120)) }
  const [snap, setSnap] = useState<'left' | 'right' | null>(null)
  const dragFloat = (event: React.PointerEvent<HTMLElement>) => {
    if (!wide || mini || (event.target as HTMLElement).closest('button,[role=tab],[role=menuitem]')) return
    // Из панели окно отрывается, как только курсор прошёл 6 px: панель становится плавающим окном и идёт за курсором
    const box = event.currentTarget.closest('aside')!.getBoundingClientRect()
    const from = floating ? { ...rect, ...view2 } : { x: Math.round(box.x), y: Math.round(box.y), w: Math.round(box.width), h: Math.round(Math.min(box.height, 640, window.innerHeight - 16)) }
    const x = event.clientX, y = event.clientY
    let next = from
    let edge: 'left' | 'right' | null = null
    let torn = floating
    // Слева край зоны — не край экрана, а край рейки: иначе курсор приходится загонять под неё
    const railRight = Math.round(document.querySelector('[data-sidebar=sidebar]')?.getBoundingClientRect().right ?? 0)
    // Прилипает, если курсор в 48–64 px от края или само окно подошло к краю ближе чем на 24 px — подсветка: отпустил, и окно становится панелью с этой стороны
    const move = (e: PointerEvent) => {
      if (!torn) { if (Math.hypot(e.clientX - x, e.clientY - y) < 6) return; torn = true; setModeState('float') }
      next = { ...from, x: Math.round(from.x + e.clientX - x), y: Math.round(from.y + e.clientY - y) }; setRect(next)
      edge = e.clientX < railRight + 48 || next.x < railRight + 24 ? 'left' : e.clientX > window.innerWidth - 64 || next.x + next.w > window.innerWidth - 24 ? 'right' : null; setSnap(edge)
    }
    const up = () => {
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); setSnap(null)
      if (!torn) return
      if (edge) setMode(edge === 'left' ? 'dock-left' : 'dock-right'); else { setMode('float'); saveRect(next) }
    }
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up)
  }
  const resizeFloat = (event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault()
    const from = { ...rect, ...view2 }
    const x = event.clientX, y = event.clientY
    let next = from
    const move = (e: PointerEvent) => { next = { ...from, w: Math.round(Math.min(window.innerWidth - from.x, Math.max(AGENT_MIN, from.w + e.clientX - x))), h: Math.round(Math.min(window.innerHeight - from.y, Math.max(280, from.h + e.clientY - y))) }; setRect(next) }
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); saveRect(next) }
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up)
  }
  const modeItems: Array<{ id: AgentMode; label: string; icon: React.ReactNode }> = [
    { id: 'float', label: t('Плавающее окно'), icon: <AppWindow /> },
    { id: 'dock-right', label: t('Панель справа'), icon: <PanelRight /> },
    { id: 'dock-left', label: t('Панель слева'), icon: <PanelLeft /> },
    { id: 'min', label: t('Свернуть в строку ввода'), icon: <Minimize2 /> },
  ]
  // Колонка между навигацией и лентой.
  // Выезд: пружиной растёт ширина колонки, а не панели — лента сдвигается вместе с ней, текст внутри не переливается.
  // Уход ждёт конца пружины (AnimatePresence). «Уменьшить движение» ширину не гасит — гасим сами
  return (
    <>
    {snap && <div aria-hidden="true" className={cn('pointer-events-none fixed bottom-2 z-(--z-agent) rounded-container border-2 border-primary/50 bg-primary/10', overlay || cardOpen ? 'top-16' : 'top-2', snap === 'left' ? 'left-(--canvas-left,var(--rail-w,56px))' : 'right-2')} style={{ width }} />}
    <AnimatePresence initial={false}>
      {open && (
        <motion.div key="agent" className={cn('z-(--z-agent) shrink-0', floating || mini ? '' : 'overflow-hidden', wide && !overlay && dockRight ? 'sticky top-2 self-start' : floating ? 'fixed' : mini ? 'fixed right-2 bottom-2' : eff === 'dock-left' ? cn('fixed bottom-2 left-(--canvas-left,var(--rail-w,56px))', overlay || cardOpen ? 'top-16' : 'top-2') : cn('fixed bottom-2 right-2', overlay || cardOpen ? 'top-16' : 'top-2'))}
          style={floating ? { left: view2.x, top: view2.y } : undefined}
          initial={floating || mini ? { opacity: 0, scale: 0.96 } : { width: 0 }} animate={floating || mini ? { opacity: 1, scale: 1, transition: still ? { duration: 0 } : springOpen } : { width: 'auto', transition: still ? { duration: 0 } : springOpen }} exit={floating || mini ? { opacity: 0, scale: 0.96, transition: still ? { duration: 0 } : springClose } : { width: 0, transition: still ? { duration: 0 } : springClose }}>
        {/* Esc из любого места панели (и из поля) закрывает её (аудит 2026-10-13); меню, «/» и «стоп» перехватывают Esc раньше */}
        <aside aria-label={t('Агент библиотеки')} onKeyDown={(event) => { if (event.key === 'Escape' && !event.defaultPrevented) { event.stopPropagation(); onClose() } }} className={cn('relative flex overflow-hidden rounded-container bg-card ring-1 ring-foreground/10', wide && !overlay && dockRight ? 'my-2 mr-2 h-[calc(100svh-1rem)]' : floating ? 'h-full shadow-lg' : mini ? 'shadow-lg' : 'h-full shadow-lg')} style={{ width: !wide ? 'calc(100vw - 16px)' : floating ? rect.w : width, ...(floating ? { height: rect.h } : {}) }}>
          {/* Край тянет ширину (панель справа — левый, слева — правый; как у Doop); клик по краю ничего не делает. У плавающего — угол */}
          {floating ? <div aria-hidden="true" className="absolute right-0 bottom-0 z-10 size-4 cursor-nwse-resize" onPointerDown={resizeFloat} /> : null}
          {!floating && !mini && <div role="separator" aria-orientation="vertical" aria-label={t('Ширина колонки агента')} aria-valuenow={width} aria-valuemin={AGENT_MIN} tabIndex={0}
            className={cn('absolute inset-y-4 z-10 w-2 cursor-ew-resize rounded-lg outline-none focus-visible:bg-ring/40', eff === 'dock-left' ? 'right-0' : 'left-0')}
            onPointerDown={resize} onDoubleClick={() => { setWidth(440); try { localStorage.removeItem('refkit-agent-width') } catch { /* без памяти */ } }}
            onKeyDown={(event) => {
              if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
              event.preventDefault()
              const next = Math.round(Math.min(window.innerWidth * 0.9, Math.max(AGENT_MIN, width + ((event.key === 'ArrowLeft') === (mode === 'dock-left') ? -16 : 16))))
              setWidth(next)
              try { localStorage.setItem('refkit-agent-width', String(next)) } catch { /* без памяти */ }
            }} />}
          <div className="@container/agent flex min-w-0 flex-1 flex-col gap-3 px-3 pb-3">
            <div className={cn('-mt-px -mb-2 flex h-12 shrink-0 items-center gap-0.5', wide && !mini && 'cursor-grab active:cursor-grabbing')} onPointerDown={dragFloat}>
              {!mini && <span className="flex items-center gap-0.5" role="tablist" aria-label={t('Окно агента')}>
                {cardOpen && !hideInfoTab && <TabButton label={t('Сведения')} active={tab === 'info'} onClick={() => onTab?.('info')} labeled><Info /></TabButton>}
                <TabButton label={t('Агент')} active={tab === 'agent'} onClick={() => onTab?.('agent')} labeled><Zap /></TabButton>
                {canvasOpen && <TabButton label={t('Правки')} active={tab === 'comments'} onClick={() => onTab?.('comments')} labeled badge={commentsCount}><MessageSquare /></TabButton>}
                {canvasOpen && <TabButton label={t('Память')} active={tab === 'memory'} onClick={() => onTab?.('memory')} labeled><Brain /></TabButton>}
                <TabButton label={t('Активность')} active={tab === 'activity'} onClick={() => onTab?.('activity')} labeled><ActivityIcon /></TabButton>
              </span>}
              <span className="flex-1" />
              {shownTab === 'agent' && !mini && <>
              {(turns.length > 0 || showList) && <IconButton label={t('Новый разговор')} disabled={working} onClick={() => { void act({ action: 'conversation' }); setView('chat') }}><Plus /></IconButton>}
              </>}
              <DropdownMenu>
                <Tooltip>
                  <TooltipTrigger asChild><DropdownMenuTrigger asChild><Button variant="ghost" size="icon-sm" aria-label={t('Режим окна')}><GripVertical /></Button></DropdownMenuTrigger></TooltipTrigger>
                  <TooltipContent>{t('Режим окна')}</TooltipContent>
                </Tooltip>
                <DropdownMenuContent align="end">
                  {modeItems.filter((item) => item.id !== eff).map((item) => <DropdownMenuItem key={item.id} onSelect={() => setMode(item.id)}>{item.icon}{item.label}</DropdownMenuItem>)}
                </DropdownMenuContent>
              </DropdownMenu>
              <IconButton label={t('Закрыть')} onClick={onClose}><X /></IconButton>
            </div>
            {shownTab === 'agent' && !mini && (
              <div className="flex shrink-0 items-center gap-1" role="tablist" aria-label={t('Разговоры')}>
                {([['chat', t('Текущий')], ['list', t('История')]] as const).map(([id, label]) => (
                  <button key={id} type="button" role="tab" aria-selected={(id === 'list') === showList} disabled={id === 'list' && !hasHistory} onClick={() => setView(id)}
                    className={cn('rounded-lg px-2.5 py-1 text-xs transition-colors disabled:opacity-40', (id === 'list') === showList ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground')}>{label}</button>
                ))}
              </div>
            )}
            {/* Комментарии: слот для панели холста (она рисуется порталом из CanvasPage); слот живёт всегда, чтобы панель не пересоздавалась при смене вкладки */}
            <div ref={onCommentsSlot} className={shownTab === 'comments' ? 'flex min-h-0 flex-1 flex-col' : 'hidden'} />
            <div ref={onMemorySlot} className={shownTab === 'memory' ? 'flex min-h-0 flex-1 flex-col' : 'hidden'} />
            {shownTab === 'activity' ? (
              <ActivityList turns={state?.thread ?? turns} />
            ) : shownTab !== 'agent' ? null : showList && !mini ? (
              <AgentChats thread={state?.thread ?? []} current={conversation} query={query} onQuery={setQuery} onOpen={(to) => { void act({ action: 'conversation', to }); setView('chat'); setQuery('') }} />
            ) : (
              <>
            {!mini && <ScrollArea className="min-h-0 flex-1 [&_[data-slot=scroll-area-viewport]>div]:!block">
              <Thread turns={turns} asking={working} pending={pending} onWeb={answerWeb} onAnswer={(text) => send(text)} onCard={onOpenCard} onRemember={(at, accept) => act({ action: 'remember', at, accept })} onSaveFound={(at, index) => act({ action: 'save-found', at, index })} onSaveNote={(at) => act({ action: 'save-note', at })} onMakeAction={(at, accept) => act({ action: 'make-action', at, accept }).then(() => { if (accept) memoryChanged() })} progress={state?.progress} settings={modelSettings} onDigest={() => {}} hints={hints} disabled={working}
                extra={(turn) => <Changes turn={turn as Turn & { changes?: AgentChange[] }} cards={cards} onAct={(action, ids) => void act({ action, at: turn.at, ids })}
                  onAlways={() => void library.setPermissions({ library: 'allow' }).then(() => { permissionsChanged(); void act({ action: 'apply', at: turn.at }) })} />} />
              {state?.askError && <p className="px-1 text-xs text-destructive">{t('Не получилось: {askError}', { askError: state.askError })}</p>}
            </ScrollArea>}
            {/* Список Actions по «/» — shadcn Command (владелец 2026-10-10): поле ввода остаётся у textarea, стрелки ↑↓ двигают выбор, Enter запускает */}
            {matches.length > 0 && (
              <Command shouldFilter={false} value={activeAction?.id ?? ''} onValueChange={setActiveActionId} className="size-auto max-h-56 border shadow-md" aria-label={t('Действия')}>
                <CommandList id="agent-actions-list">
                  {matches.map((item) => (
                    <CommandItem key={item.id} id={`action-${item.id}`} value={item.id} onSelect={() => send(item.text, item.id)}>
                      <span className="text-muted-foreground">/</span><span className="truncate">{actionName(item)}</span>
                    </CommandItem>
                  ))}
                </CommandList>
              </Command>
            )}
            <InputGroup>
              {/* Контекст чипом внутри поля (№21, приём Figma): про что вопрос, следит за фокусом; × — снова вся библиотека */}
              {context.length > 0 && (
                <InputGroupAddon align="block-start" className="pb-0">
                  <span className="flex max-w-full items-center gap-1 rounded-control bg-muted py-0.5 pl-2 pr-0.5 text-xs text-foreground">
                    <span className="truncate">{contextLabel}</span>
                    <Button variant="ghost" size="icon-xs" aria-label={t('Спрашивать про всю библиотеку')} onClick={() => onContext?.([])}><X /></Button>
                  </span>
                </InputGroupAddon>
              )}
              <InputGroupTextarea aria-label={t('Просьба агенту библиотеки — «/» открывает действия')} aria-controls={matches.length > 0 ? 'agent-actions-list' : undefined} aria-activedescendant={activeAction ? `action-${activeAction.id}` : undefined} rows={1} value={command} className="max-h-36 min-h-0" placeholder={hintTexts[0]}
                onChange={(event) => setCommand(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Tab' && !command && hintTexts[0]) { event.preventDefault(); setCommand(hintTexts[0]) }
                  if (matches.length > 1 && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
                    event.preventDefault()
                    const at = Math.max(0, matches.findIndex((item) => item.id === activeAction?.id))
                    setActiveActionId(matches[(at + (event.key === 'ArrowDown' ? 1 : matches.length - 1)) % matches.length].id)
                  }
                  if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); send(activeAction ? activeAction.text : command, activeAction?.id) }
                  if (event.key === 'Escape' && slash !== null) { event.preventDefault(); event.stopPropagation(); setCommand('') }
                  if (event.key === 'Escape' && working) { event.preventDefault(); event.stopPropagation(); void act({ action: 'stop' }) }
                }} />
              <InputGroupAddon align="inline-end" className="self-end">
                {working ? (
                  <Tooltip>
                    <TooltipTrigger asChild><InputGroupButton size="icon-sm" variant="default" className="rounded-lg" aria-label={t('Остановить агента')} onClick={() => void act({ action: 'stop' })}><CircleStop /></InputGroupButton></TooltipTrigger>
                    <TooltipContent>{t('Стоп')} <Kbd>Esc</Kbd></TooltipContent>
                  </Tooltip>
                ) : <InputGroupButton size="icon-sm" variant="default" className="rounded-lg" aria-label={t('Отправить агенту')} disabled={!command.trim()} onClick={() => send(command)}><ArrowUp /></InputGroupButton>}
              </InputGroupAddon>
            </InputGroup>
            {modelSettings && !mini && (
              <div className="flex items-center justify-end gap-1">
                <ActionsMenu actions={actions} onRun={(item) => send(item.text, item.id)} onManage={() => onManageActions?.()} />
                <span className="mr-auto" />
                <ModelMenu settings={modelSettings} onModel={onModels} />
                <AgentSettingsMenu settings={modelSettings} onDepth={onDepth} turns={turns} />
              </div>
            )}
              </>
            )}
          </div>
        </aside>
        </motion.div>
      )}
    </AnimatePresence>
    </>
  )
}

export type AgentTab = 'info' | 'agent' | 'comments' | 'memory' | 'activity'
type AgentMode = 'dock-right' | 'dock-left' | 'float' | 'min'
interface FloatRect { x: number; y: number; w: number; h: number }

// Вкладка окна: у активной подпись рядом с иконкой, у остальных только иконка и подсказка (как в Doop); badge — число у «Комментариев»
function TabButton({ label, active, onClick, badge = 0, children }: { label: string; active: boolean; onClick: () => void; badge?: number; labeled?: boolean; children: React.ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button variant={active ? 'secondary' : 'ghost'} size={active ? 'sm' : 'icon-sm'} role="tab" aria-selected={active} aria-label={label} className="relative gap-1.5" onClick={onClick}>
          {children}{active && <span className="text-sm">{label}</span>}
          {badge > 0 && <span className="absolute -top-0.5 -right-0.5 grid min-w-4 place-items-center rounded-full bg-primary px-1 text-[10px] leading-4 font-medium text-primary-foreground tabular-nums">{badge}</span>}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}

// Журнал действий агента: вопросы владельца в этом окне и обращения внешних агентов по MCP, новые сверху. Ничего не запускает
function ActivityList({ turns }: { turns: Turn[] }) {
  const [calls, setCalls] = useState<McpCall[]>([])
  useEffect(() => { library.mcpLog().then(setCalls).catch(() => {}) }, [])
  const when = (at: number) => new Date(at).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
  const rows = [
    ...turns.map((turn) => {
      const changes = (turn as Turn & { changes?: AgentChange[] }).changes ?? []
      const count = (status: AgentChange['status']) => changes.filter((change) => change.status === status).length
      const parts = [count('applied') && t('применено: {n}', { n: count('applied') }), count('rejected') && t('отклонено: {n}', { n: count('rejected') }), count('pending') && t('ждёт: {n}', { n: count('pending') })].filter(Boolean)
      return { at: turn.at, title: turn.command, meta: t('Ответ в окне агента') + (parts.length ? ` · ${parts.join(', ')}` : '') }
    }),
    ...calls.map((call) => ({ at: call.at, title: `${call.client} · ${call.tool}`, meta: call.project })),
  ].sort((a, b) => b.at - a.at).slice(0, 60)
  return (
    <ScrollArea className="min-h-0 flex-1 [&_[data-slot=scroll-area-viewport]>div]:!block">
      {rows.length === 0 ? <p className="px-3 py-6 text-center text-xs text-muted-foreground">{t('Пока пусто: здесь появятся ответы агента и обращения Claude Code или Codex.')}</p> : (
        <ul className="flex flex-col">
          {rows.map((row) => (
            <li key={`${row.at}-${row.title}`} className="flex flex-col gap-0.5 rounded-md px-2 py-2 hover:bg-muted/60">
              <span className="truncate text-sm">{row.title}</span>
              <span className="text-xs text-muted-foreground">{row.meta} · {when(row.at)}</span>
            </li>
          ))}
        </ul>
      )}
    </ScrollArea>
  )
}

function IconButton({ label, children, onClick, disabled }: { label: string; children: React.ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild><Button variant="ghost" size="icon-sm" aria-label={label} disabled={disabled} onClick={onClick}>{children}</Button></TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}

// Блок правок под ответом: «было → стало», у каждой ✓ и ×; внизу — применить / отклонить всё, после — отменить.
// Переносы в папки (разбор пачки) показаны группами «→ папка (N)» с одним ✓ на группу, удаление — своей группой «В корзину (N)».
// Удаление в «применить всё» не входит — только по явному ✓ (решение владельца)
function Changes({ turn, cards, onAct, onAlways }: { turn: Turn & { changes?: AgentChange[] }; cards: Array<{ id: string; title: string }>; onAct: (action: 'apply' | 'reject' | 'undo', ids?: string[]) => void; onAlways: () => void }) {
  const changes = turn.changes ?? []
  if (!changes.length) return null
  const pending = changes.filter((change) => change.status === 'pending')
  const applied = changes.filter((change) => change.status === 'applied')
  // Пакетом применяется всё, кроме удаления — кнопка нужна, только когда таких правок несколько
  const batch = pending.filter((change) => change.field !== 'delete')
  const title = (change: AgentChange) => cards.find((card) => card.id === change.card)?.title ?? show(change.field === 'delete' || change.field === 'title' ? change.from : change.card)
  // Пакетное предложение подборки от внешнего агента (refkit_propose_board): правки boards с label — группой, один ✓ на всю пачку
  const boardGroup = (change: AgentChange) => change.field === 'boards' && Boolean(change.label)
  const single = changes.filter((change) => change.field !== 'folder' && change.field !== 'delete' && !boardGroup(change))
  const byBoard = new Map<string, AgentChange[]>()
  for (const change of changes) if (boardGroup(change)) byBoard.set(String(change.label), [...(byBoard.get(String(change.label)) ?? []), change])
  const byFolder = new Map<string, AgentChange[]>()
  for (const change of changes) if (change.field === 'folder') byFolder.set(String(change.to), [...(byFolder.get(String(change.to)) ?? []), change])
  const folderGroups = [...byFolder.values()]
  const trash = changes.filter((change) => change.field === 'delete')
  return (
    <div className="flex flex-col overflow-hidden rounded-container bg-muted/60" role="list" aria-label={t('Предложенные правки')}>
      {folderGroups.map((items) => <ChangeGroup key={String(items[0].to)} label={`→ ${items[0].label ?? t('Папка')}`} hint={String(items[0].to).startsWith('+') ? t('новая папка') : undefined} items={items} title={title} onAct={onAct} />)}
      {[...byBoard].map(([name, items]) => <ChangeGroup key={`board-${name}`} label={t('В подборку «{name}»', { name })} items={items} title={title} onAct={onAct} />)}
      {single.map((change) => (
        <div key={change.id} role="listitem" className={cn('flex items-start gap-2 px-3 py-2.5 text-xs', change.status === 'rejected' && 'opacity-40')}>
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="truncate text-muted-foreground">{fieldName[change.field]} · {title(change)}</span>
            <DiffText from={show(change.from)} to={show(change.to)} /> {/* дифф по словам (идея 55) вместо «было → стало» */}
          </div>
          {change.status === 'pending' ? (
            <div className="flex shrink-0 gap-0.5">
              <Button variant="ghost" size="icon-xs" aria-label={t('Применить')} onClick={() => onAct('apply', [change.id])}><Check /></Button>
              <Button variant="ghost" size="icon-xs" aria-label={t('Отклонить')} onClick={() => onAct('reject', [change.id])}><X /></Button>
            </div>
          ) : <span className="shrink-0 text-muted-foreground">{change.status === 'applied' ? t('Применено') : t('Отклонено')}</span>}
        </div>
      ))}
      {trash.length > 0 && <ChangeGroup label={t('В корзину')} items={trash} title={title} onAct={onAct} danger />}
      {(batch.length > 0 || pending.length > 1 || applied.length > 0) && (
        <div className="flex items-center gap-1 px-2 py-1.5">
          {batch.length > 1 && <Button variant="secondary" size="xs" onClick={() => onAct('apply')}>{t('Применить всё')}</Button>}
          {pending.length > 1 && <Button variant="ghost" size="xs" onClick={() => onAct('reject', pending.map((change) => change.id))}>{t('Отклонить всё')}</Button>}
          {/* «Всегда» — права «Менять библиотеку: можно» (идея 53): дальше правки применяются сразу, «Отменить» остаётся */}
          {batch.length > 0 && <Button variant="ghost" size="xs" onClick={onAlways}>{t('Всегда применять')}</Button>}
          {applied.length > 0 && <Button variant="ghost" size="xs" className="ml-auto" onClick={() => onAct('undo', applied.map((change) => change.id))}><Undo2 />{t('Отменить')}</Button>}
        </div>
      )}
    </div>
  )
}

// Группа правок одного вида: заголовок «→ папка (N)» с одним ✓ и ×, раскрывается списком карточек, у каждой можно снять × до применения
function ChangeGroup({ label, hint, items, danger, title, onAct }: { label: string; hint?: string; items: AgentChange[]; danger?: boolean; title: (change: AgentChange) => string; onAct: (action: 'apply' | 'reject' | 'undo', ids?: string[]) => void }) {
  const [open, setOpen] = useState(false)
  const pending = items.filter((change) => change.status === 'pending')
  const done = items.some((change) => change.status === 'applied')
  const Chevron = open ? ChevronDown : ChevronRight
  return (
    <div role="listitem" className="text-xs">
      <div className="flex items-center gap-2 px-3 py-2.5">
        <button type="button" className="flex min-w-0 flex-1 items-center gap-1.5 text-left" aria-expanded={open} onClick={() => setOpen(!open)}>
          <Chevron className="size-3.5 shrink-0 text-muted-foreground" />
          <span className={cn('truncate', danger && 'text-destructive')}>{label}</span>
          <span className="text-muted-foreground">{items.length}{hint ? ` · ${hint}` : ''}</span>
        </button>
        {pending.length > 0 ? (
          <div className="flex shrink-0 gap-0.5">
            <Button variant="ghost" size="icon-xs" aria-label={t('Применить группу')} onClick={() => onAct('apply', pending.map((change) => change.id))}><Check /></Button>
            <Button variant="ghost" size="icon-xs" aria-label={t('Отклонить группу')} onClick={() => onAct('reject', pending.map((change) => change.id))}><X /></Button>
          </div>
        ) : <span className="shrink-0 text-muted-foreground">{done ? t('Применено') : t('Отклонено')}</span>}
      </div>
      {open && (
        <ul className="flex flex-col gap-0.5 px-3 pb-2.5 pl-8">
          {items.map((change) => (
            <li key={change.id} className={cn('flex items-center gap-2', change.status === 'rejected' && 'opacity-40')}>
              <span className="min-w-0 flex-1 truncate">{title(change)}</span>
              {change.status === 'pending' && <Button variant="ghost" size="icon-xs" aria-label={t('Не трогать эту карточку')} onClick={() => onAct('reject', [change.id])}><X /></Button>}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
