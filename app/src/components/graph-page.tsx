import { createPortal } from 'react-dom'
import { form, t } from '@/lib/i18n'
import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Dices, EllipsisVertical, FileText, Orbit, Plus, RotateCw, Square, SquarePen, X } from 'lucide-react'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { SpaceBackdrop } from '@/components/space-backdrop'
import { PaperNote } from '@/components/paper-note'
import { tileRatio } from '@/lib/tile-grid'
import { FilterBar } from '@/components/filter-bar'
import { kindOptions, matchesFilters, tagOptions } from '@/lib/material-filters'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { Progress } from '@/components/ui/progress'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cardLinks, clusterCards, derive, nearby, neighbours } from '@/lib/graph-core.mjs'
import { arc, sphere, type Pt3 } from '@/lib/graph-arrange'
import { apply, axisAngle, between, initialView, mul, orthonormalize, underPointer, type Mat, type V3 } from '@/lib/sphere-view'
import { library, type GraphState } from '@/lib/library'
import { cn } from '@/lib/utils'

// Страница «Граф» — Explorer как у Fabric (02_research/teardowns/fabric/explorer/explorer.md): весь холст — поле без рамок
// и боковых панелей; интерфейс (полоса сверху, таблетка снизу) проявляется при движении мыши и гаснет в покое. Узлы — наши
// материалы: по умолчанию вращаемый мышью 3D-шар из бледных точек, связи — дуги внутри (по общим понятиям); название и описание — по наведению.
// Клик (или «Мне повезёт») — вид-фокус на одном материале: он в центре, на лучах — его понятия тёмными плашками. «Собрать по…»
// — режимы из окна у названия режима. Приближение превращает точки в карточки-превью (картинки грузятся только тогда). Модель работает ТОЛЬКО по кнопке (цена — в диалоге до запуска). Холст — React Flow (компонента графа в shadcn нет).
export type Item = { id: string; title: string; image: string; ratio?: string; description?: string; kind?: string; format?: string; createdAt?: number; author?: string; collections?: string[] }
// Пропорция превью карточки — как в «Мозаике» (у каждой своя), но не длиннее 1,6 и не площе 0,5 ширины: иначе у шара торчат и вытянутые, и плоские
const heightOf = (item?: Item) => { const [w, h] = (item?.ratio ?? '').split('/').map(Number); return w > 0 && h > 0 ? Math.min(1.6, Math.max(0.5, h / w)) : 1 }
type At = { x: number; y: number } // точка в поле графа: откуда растёт вид-фокус
type Focus = { card: string; from?: At } | { concept: string; from?: At } | null
type Props = { items: Item[]; onOpen: (id: string) => void; onTag: (name: string, ids: string[]) => Promise<void>; onNote: (id: string) => void; filtersOpen: boolean; onFocus: (context: { ids: string[]; name: string | null } | null) => void; menuSlot: HTMLElement | null; dockSlot: HTMLElement | null }

// Цвета — токены --community-1…5 (светлая и тёмная тема); -1 — без группы. Кластер — цвет графа, тип — цвет «собрать по…»
const PULSE_TAIL = 0.14 // длина штриха в долях линии
const PULSES = 3, PULSE_MS = 1600 // сколько точек «передачи данных» бежит по графу и сколько секунд идёт одна
const f1 = (n: number) => n.toFixed(1)
const palette = (index: number) => index < 0 ? 'var(--muted-foreground)' : `var(--community-${(index % 5) + 1})`
export const shuffled = <T,>(list: T[], seed: number) => { const out = [...list]; let x = seed * 9301 + 49297; for (let i = out.length - 1; i > 0; i--) { x = (x * 9301 + 49297) % 233280; const j = Math.floor((x / 233280) * (i + 1)); [out[i], out[j]] = [out[j], out[i]] } return out }
const plural = (count: number, one: string, few: string, many: string) => form(count) === 'one' ? one : form(count) === 'few' ? few : many
const tokensWord = (tokens: number) => tokens >= 1_000_000 ? t('{replace} млн', { replace: (tokens / 1_000_000).toFixed(1).replace('.', ',') }) : t('{tokens} тыс.', { tokens: Math.max(1, Math.round(tokens / 1000)) })

export function GraphPage(props: Props) {
  return <Page {...props} />
}

function Page({ items, onOpen, filtersOpen, menuSlot, dockSlot, onFocus }: Props) {
  const [state, setState] = useState<GraphState>()
  const [failed, setFailed] = useState('')
  const [focus, setFocus] = useState<Focus>(null)
  const [hovered, setHovered] = useState<string | null>(null)
  const [pinned, setPinned] = useState<string | null>(null) // точка, к которой докрутил «Мне повезёт»: подсвечена, пока не потянули шар
  const [aim, setAim] = useState<{ id: string; n: number } | null>(null)
  const [kindFilter, setKindFilter] = useState<string | null>(null)
  const [tag, setTag] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<'build' | 'rebuild' | null>(null)
  // Интерфейс проявляется при движении мыши и гаснет в покое (как у Fabric)
  const reload = useCallback(async () => { try { setState(await library.graph()); setFailed('') } catch { setFailed(t('Не удалось прочитать граф')) } }, [])
  useEffect(() => { void reload() }, [reload])
  // Пока модель работает — опрос раз в 1,2 с, как у карточек; закончила — останавливаемся
  const kind = state?.run.kind
  useEffect(() => {
    if (!kind || kind === 'idle') return
    const timer = setInterval(() => void reload(), 1200)
    return () => clearInterval(timer)
  }, [kind, reload])
  // Esc — из вида-фокуса назад к графу (как у Fabric)
  useEffect(() => {
    if (!focus) return
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setFocus(null) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [focus])

  const byId = useMemo(() => new Map(items.map((item) => [item.id, item])), [items])
  const graph = useMemo(() => derive(state?.items, new Set(items.map((item) => item.id))), [state?.items, items])
  const built = graph.byId.size > 0
  const everyId = useMemo(() => [...graph.byId.keys()].filter((id) => byId.has(id)), [graph, byId])
  // Фильтр (Fabric: «28 из 32»): по типу, тегу и автору; пусто — всё
  const ids = useMemo(() => everyId.filter((id) => matchesFilters(byId.get(id)!, kindFilter, tag)), [everyId, byId, kindFilter, tag])
  // Фильтры действуют и в фокусе: на лучах только то, что проходит фильтр (выбранный материал остаётся как есть)
  const shown = useMemo(() => new Set(ids), [ids])
  const kindsHere = useMemo(() => kindOptions(everyId.map((id) => byId.get(id)!)), [everyId, byId])
  const tagsHere = useMemo(() => tagOptions(everyId.map((id) => byId.get(id)!)), [everyId, byId])

  // Связи между карточками и их кластеры (цвет)
  // Раскладка и связи считаются по всем карточкам и не двигаются от фильтров: лишние точки просто плавно гаснут
  const links = useMemo(() => cardLinks(graph, everyId, 3), [graph, everyId])
  const groups = useMemo(() => clusterCards(graph, everyId, links), [graph, everyId, links])
  const degree = useMemo(() => { const map = new Map<string, number>(); for (const link of links) { map.set(link.a, (map.get(link.a) ?? 0) + 1); map.set(link.b, (map.get(link.b) ?? 0) + 1) } return map }, [links])

  // Узлы шара: порядок по кластерам, чтобы цвета ложились поясами
  const ball = useMemo(() => sphere([...everyId].sort((a, b) => (groups.of.get(a) ?? 99) - (groups.of.get(b) ?? 99) || a.localeCompare(b)), links), [everyId, groups, links])

  // «Мне повезёт»: шар сам докручивается до случайной точки (из тех, у кого есть связи) и подсвечивает её; фокус — кликом по ней
  const lucky = () => {
    const linked = ids.filter((id) => degree.has(id))
    const pool = linked.length ? linked : ids
    if (!pool.length) return
    setFocus(null); setHovered(null); setPinned(null)
    setAim((old) => ({ id: pool[Math.floor(Math.random() * pool.length)], n: (old?.n ?? 0) + 1 }))
  }
  const running = Boolean(kind && kind !== 'idle')
  const estimate = state?.estimate
  const total = built ? graph.byId.size + (state?.pending ?? 0) : (state?.pending ?? 0)
  const start = (op: 'build' | 'rebuild') => { setConfirm(null); void library.graphOp(op).then(setState).catch(() => setFailed(t('Не получилось запустить'))) }
  const asked = confirm === 'rebuild' ? total : estimate?.cards ?? 0
  const askedTokens = confirm === 'rebuild' ? total * Math.round((estimate && estimate.cards ? estimate.inputTokens / estimate.cards : 12_800)) : estimate?.inputTokens ?? 0
  const card = focus && 'card' in focus ? byId.get(focus.card) : undefined
  const concept = focus && 'concept' in focus ? graph.byKey.get(focus.concept) : undefined
  // Агент из нижней панели знает, что сейчас в фокусе: разговор открывается про этот материал или понятие
  useEffect(() => {
    onFocus(card ? { ids: [card.id], name: null } : concept ? { ids: concept.ids.filter((id) => byId.has(id)), name: concept.name } : null)
    return () => onFocus(null)
  }, [card?.id, concept?.key]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!state) return <div className="py-6">{failed && <p role="alert" className="text-sm text-destructive">{failed}</p>}</div>
  return (
    <div className="relative flex min-h-0 flex-1 flex-col gap-3">
      {built && filtersOpen && !focus && (
        // Только пока открыты фильтры: пустая полоса на всю ширину перекрывала крестик фокуса справа и «съедала» клики
        <FilterBar floating type={{ value: kindFilter, onChange: setKindFilter, options: kindsHere }} tag={{ value: tag, onChange: setTag, options: tagsHere }} found={{ shown: ids.length, total: everyId.length }} />
      )}
      {/* Название страницы уже в шапке — второго «Граф» крупно здесь нет; во время построения — только ход и «остановить» */}
      {running && state.run.kind === 'build' && <div className="flex items-center justify-end gap-2 pt-2">
        <Progress className="w-40" value={state.run.total ? (state.run.done / state.run.total) * 100 : 0} aria-label={t('Ход построения графа')} />
        <span className="caption tabular-nums">{t('{done} из {total}', { done: state.run.done, total: state.run.total })}</span>
        <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon-sm" aria-label={t('Остановить построение')} onClick={() => void library.graphOp('stop').then(setState)}><Square /></Button></TooltipTrigger><TooltipContent>{t('Остановить')}</TooltipContent></Tooltip>
      </div>}
      {/* Управление графом — в общей нижней панели (слот в ней), отдельной таблетки нет. Пока открыт фокус, слот пуст */}
      {dockSlot && built && createPortal(
        <>
          <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" aria-label={t('Мне повезёт')} onClick={lucky}><Dices /></Button></TooltipTrigger><TooltipContent>{t('Мне повезёт')}</TooltipContent></Tooltip>
        </>, dockSlot)}
      {/* Действия графа — в «⋮» общей шапки (через портал в слот шапки), своих меню у страницы нет */}
      {menuSlot && built && !running && createPortal(
        card || concept ? <Button variant="ghost" size="icon-sm" aria-label={t('Назад к графу')} onClick={() => setFocus(null)}><X /></Button> : <DropdownMenu>
          <DropdownMenuTrigger asChild><Button variant="ghost" size="icon-sm" aria-label={t('Ещё')}><EllipsisVertical /></Button></DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {state.pending + state.stale > 0 && <><DropdownMenuItem onSelect={() => setConfirm('build')}><Plus />{state.stale > 0 ? t('Обновить') : t('Добавить новые')} · {state.pending + state.stale}</DropdownMenuItem><DropdownMenuSeparator /></>}
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => setConfirm('rebuild')}><RotateCw />{t('Построить заново')}</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>, menuSlot)}
      {(failed || state.run.error) && <p role="alert" className="text-sm text-destructive">{failed || state.run.error}</p>}

      {!built && !(running && state.run.kind === 'build') ? (
        <Empty className="min-h-[50vh]">
          <EmptyHeader>
            <EmptyMedia variant="icon"><Orbit /></EmptyMedia>
            <EmptyTitle>{t('Граф ещё не построен')}</EmptyTitle>
            <EmptyDescription>{t('Модель прочитает материалы, вытащит понятия, и карточки свяжутся по общим. Работает только по кнопке, готовое сохраняется по ходу.')}</EmptyDescription>
          </EmptyHeader>
          <EmptyContent><Button disabled={!state.pending} onClick={() => setConfirm('build')}>{t('Построить граф')}{state.pending ? ` · ${state.pending}` : ''}</Button></EmptyContent>
        </Empty>
      ) : (
        // Поле на всю ширину и высоту — без боковой панели. Управление как в «Карте» и Figma: два пальца двигают холст,
        // щипок и ⌘ + колесо — масштаб
        <div className="mind-map absolute inset-y-0 -inset-x-(--canvas-gutter) overflow-hidden" role="region" aria-label={card ? t('Материал «{title}»', { title: card.title }) : concept ? t('Понятие «{name}»', { name: concept.name }) : t('Граф материалов')}>
            <SpaceBackdrop />
            <div className="absolute inset-0 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-700">
              <div className="absolute inset-0 transition-opacity duration-200 [mask-image:linear-gradient(to_bottom,transparent,black_64px,black_calc(100%-40px),transparent)] [-webkit-mask-image:linear-gradient(to_bottom,transparent,black_64px,black_calc(100%-40px),transparent)]" style={{ opacity: focus ? 0 : 1, pointerEvents: focus ? 'none' : undefined }} inert={focus ? true : undefined}>
                <Sphere ids={everyId} visible={shown} ball={ball} links={links} byId={byId} groups={groups} degree={degree} hovered={hovered ?? pinned} onHover={setHovered} onPick={(id, from) => { setHovered(null); setPinned(null); setFocus({ card: id, from }) }} aim={aim} pinned={pinned} onPin={setPinned} paused={Boolean(focus)} padTop={48} />
              </div>
            </div>
          {card ? (
            <FocusView key={card.id} from={focus && 'from' in focus ? focus.from : undefined} byId={byId} onBack={() => setFocus(null)}
              title={card.title} cover={card} onOpen={() => onOpen(card.id)} cards={(seed) => { const near = nearby(graph, card.id, 24).filter((hit) => shown.has(hit.id)).map((hit) => hit.id); return (seed ? shuffled(near, seed) : near).slice(0, 8) }}
              keys={(seed) => { const all = [...(graph.byId.get(card.id) ?? [])].sort((a, b) => b.count - a.count); return (seed ? shuffled(all, seed + 7) : all).slice(0, 8).map((c) => ({ key: c.key, name: c.name })) }}
              onCard={(id, at) => setFocus({ card: id, from: at })} onKey={(key, at) => setFocus({ concept: key, from: at })}
               />
          ) : concept ? (
            <FocusView key={concept.key} from={focus && 'from' in focus ? focus.from : undefined} byId={byId} onBack={() => setFocus(null)}
              title={concept.name}
              cards={(seed) => { const all = concept.ids.filter((id) => shown.has(id)).sort((a, b) => (graph.byId.get(b)?.length ?? 0) - (graph.byId.get(a)?.length ?? 0)); return (seed ? shuffled(all, seed) : all).slice(0, 10) }}
              keys={() => neighbours(graph, concept.key).filter((next) => next.concept.count >= 2).slice(0, 8).map((next) => ({ key: next.concept.key, name: next.concept.name }))}
              onCard={(id, at) => setFocus({ card: id, from: at })} onKey={(key, at) => setFocus({ concept: key, from: at })}
               />
          ) : null}

        </div>
      )}


      <AlertDialog open={confirm !== null} onOpenChange={(open) => { if (!open) setConfirm(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirm === 'rebuild' ? t('Построить граф заново?') : t('Построить граф?')}</AlertDialogTitle>
            <AlertDialogDescription>
              Модель прочитает {asked} {plural(asked, t('материал'), t('материала'), t('материалов'))}: примерно {tokensWord(askedTokens)} входных токенов (почти всё — служебный контекст, он кэшируется), около {Math.max(1, Math.ceil((asked * 5) / 60))} мин.{confirm === 'build' && state.stale > 0 ? t(' Из них новых {pending}, изменённых с прошлого раза {stale}.', { pending: state.pending, stale: state.stale }) : ''} Работает на сервере, страницу можно закрыть; готовое сохраняется по ходу, остановить можно в любой момент.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('Отмена')}</AlertDialogCancel>
            <AlertDialogAction onClick={() => start(confirm ?? 'build')}>{t('Запустить')}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}


// Граф-шар, как «Brain explorer» у Fabric: все точки на поверхности шара, дуги идут по поверхности; вращается мышью как
// глобус Atlas (точка, за которую взялся, едет под курсором; свободно во все стороны; после отпускания инерция, в покое
// медленный дрейф), ⌘/Ctrl + колесо — масштаб. Перспектива: дальние точки мельче и бледнее; на обратной стороне точки не
// выбираются. Названия — подсказкой у курсора, клик — фокус. Во время вращения React не перерисовывает ~330 элементов
// на каждый кадр (это давало 25 к/с и ломало инерцию): элементы создаются один раз, атрибуты обновляет paint() напрямую
const CAMERA = 3.4 // камера в радиусах шара: и для перспективы, и для «шар под указателем»
let lastView: Mat | null = null // поворот запоминаем: после фокуса шар стоит как был
// h — наведена ли точка, g — подсвечена ли как соседняя, d — приглушена; все три плавно (0…1) идут к цели, а не скачут
type Slot = { g: SVGGElement | null; dot: SVGCircleElement | null; hit: SVGCircleElement | null; facing: boolean; h: number; l: number; d: number; card: SVGForeignObjectElement | null; img: HTMLImageElement | null; v: number }
export function Sphere({ wheel = true, radius = 0.36, dock = 80, cardTip = false, lineFade = 1, ids, visible, ball, links, byId, groups, degree, hovered, onHover, onPick, padTop, paused, aim, pinned, onPin }: {
  padTop: number; wheel?: boolean; radius?: number; dock?: number; cardTip?: boolean; lineFade?: number; ids: string[]; visible: Set<string>; ball: Map<string, Pt3>; links: Array<{ a: string; b: string; score: number }>; byId: Map<string, Item>
  groups: { of: Map<string, number> }; degree: Map<string, number>; hovered: string | null; onHover: (id: string | null) => void; onPick: (id: string, from: At) => void; paused: boolean
  aim: { id: string; n: number } | null; pinned: string | null; onPin: (id: string | null) => void
}) {
  const box = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })
  const [zoom, setZoom] = useState(1)
  const [tip, setTip] = useState<{ id: string; x: number; y: number } | null>(null)
  const view = useRef<Mat>(lastView ?? initialView()) // поворот шара: матрица, поэтому крутится свободно во все стороны
  const omega = useRef<V3>({ x: 0, y: 0, z: 0 }) // угловая скорость инерции, рад/мс, в осях вида
  const drag = useRef<{ x: number; y: number; moved: number; captured: boolean; grab: V3; samples: Array<{ t: number; axis: V3; angle: number }> } | null>(null)
  const touched = useRef(0)
  const wheelOn = useRef(wheel)
  const lineFadeNow = useRef(lineFade) // лендинг: линии бледнее (множитель непрозрачности)
  lineFadeNow.current = lineFade
  const hoveredNow = useRef(hovered)
  hoveredNow.current = hovered
  const pausedNow = useRef(paused) // пока открыт фокус или подсвечена выбранная точка, шар стоит
  pausedNow.current = paused || Boolean(pinned)
  const onPinNow = useRef(onPin)
  onPinNow.current = onPin
  const aimAnim = useRef<{ axis: V3; total: number; applied: number; start: number; dur: number; id: string } | null>(null)
  const [pinTip, setPinTip] = useState<{ id: string; x: number; y: number } | null>(null)
  const slots = useRef(new Map<string, Slot>())
  const edgeEls = useRef<Array<SVGPathElement | null>>([])
  const uid = useId()
  const gradEls = useRef<Array<SVGLinearGradientElement | null>>([]) // цвет дуги плывёт от цвета одного конца к другому: видно, куда она идёт
  const edgeState = useRef<Array<{ u: number; v: number; s: number }>>([]) // u — дуга у наведённой точки, v — приглушена: плавно 0…1
  const animating = useRef(false)
  // Бегущие по линиям точки («передача данных»): до PULSES штук, стартуют от самых связанных узлов, только пока шар отдыхает
  const pulses = useRef<Array<{ edge: number; rev: boolean; at: number; hub: string }>>([])
  const pulseEls = useRef<Array<{ g: SVGGElement | null; glow: SVGPathElement | null; dot: SVGPathElement | null }>>([])
  const edgePts = useRef<Array<Array<{ x: number; y: number }> | null>>([])
  const nextPulse = useRef(0)
  const nodeLayer = useRef<SVGGElement>(null)
  const lastSort = useRef(0)
  const still = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  // Центр — в свободной части поля: без ряда фильтров сверху (когда открыт) и без нижней панели (80 px со всеми зазорами), иначе
  // шар визуально ближе к нижней панели, чем к верху
  const free = Math.max(0, size.h - padTop - dock)
  const baseR = Math.min(size.w, free) * radius, cx = size.w / 2, cy = padTop + free / 2
  const geom = useRef({ baseR, cx, cy })
  geom.current = { baseR, cx, cy }
  const zoomCur = useRef(1) // текущий масштаб идёт к целевому (zoom) плавно, по кадрам
  const zoomTarget = useRef(zoom)
  zoomTarget.current = zoom
  const visibleNow = useRef(visible)
  visibleNow.current = visible
  const placedIds = useMemo(() => ids.filter((id) => ball.has(id)), [ids, ball])
  const arcs = useMemo(() => links.map((link) => { const a = ball.get(link.a), b = ball.get(link.b); return a && b ? arc(a, b, 10) : null }), [links, ball])
  const related = useMemo(() => { const set = new Set<string>(); if (hovered) { set.add(hovered); for (const link of links) { if (link.a === hovered) set.add(link.b); if (link.b === hovered) set.add(link.a) } } return set }, [hovered, links])
  const relatedNow = useRef(related)
  relatedNow.current = related
  const colorOf = (id: string) => palette(groups.of.get(id) ?? -1)

  // Всё, что зависит от поворота, наведения и размера, — в атрибутах напрямую
  // Наведение и подсветка идут к цели с постоянной времени ~60 мс (около 180 мс до полного): как у Fabric, а не скачком.
  // Возвращает true, пока что-то ещё не дошло, — цикл кадров тогда продолжает рисовать
  const paint = (dt = 16) => {
    const { baseR, cx: x0, cy: y0 } = geom.current
    const zoomNow = zoomCur.current, radius = baseR * zoomNow, cam = radius * CAMERA, visible = visibleNow.current
    if (!radius) return
    const m = view.current, hover = hoveredNow.current, lit = relatedNow.current
    const k = 1 - Math.exp(-dt / 60)
    let moving = false
    const ease = (now: number, target: number) => { const next = now + (target - now) * k; if (Math.abs(target - next) < 0.01) return target; moving = true; return next }
    const project = (point: Pt3) => { const q = apply(m, point); const scale = cam / (cam - q.z * radius); return { x: x0 + q.x * radius * scale, y: y0 + q.y * radius * scale, depth: (q.z + 1) / 2 } }
    const at = new Map<string, { x: number; y: number; depth: number }>()
    for (const id of placedIds) at.set(id, project(ball.get(id)!))
    links.forEach((link, i) => {
      const el = edgeEls.current[i], line = arcs[i]
      if (!el || !line) return
      const touches = Boolean(hover) && (link.a === hover || link.b === hover)
      const state = edgeState.current[i] ?? (edgeState.current[i] = { u: 0, v: 0, s: 1 })
      state.s = ease(state.s, visible.has(link.a) && visible.has(link.b) ? 1 : 0) // не проходит фильтр — дуга гаснет
      // Дуги на обратной стороне шара почти не видны: не считаем и не рисуем (половина работы на кадр), плавно гасим у края
      const middle = (apply(m, line[line.length >> 1]).z + 1) / 2
      const back = Math.min(1, Math.max(0, (middle - 0.2) / 0.2))
      if (state.s === 0 || (back === 0 && !touches)) { if (el.style.display !== 'none') el.style.display = 'none'; edgePts.current[i] = null; return }
      el.style.display = ''
      const points = line.map(project)
      const front = points.reduce((sum, point) => sum + point.depth, 0) / points.length
      state.u = ease(state.u, touches ? 1 : 0); state.v = ease(state.v, hover && !touches ? 1 : 0)
      const rest = (0.04 + front * 0.12) * back // приглушены: в покое линии не спорят с точками
      const opacity = ((rest * (1 - state.v) + 0.02 * state.v) * (1 - state.u) + 0.9 * state.u) * state.s * lineFadeNow.current
      edgePts.current[i] = points
      // Линия — гладкая кривая: квадратичные сегменты через середины отрезков ломаной (углов на стыках нет)
      const f = (n: number) => n.toFixed(1)
      let d = `M ${f(points[0].x)},${f(points[0].y)}`
      for (let k2 = 1; k2 < points.length - 1; k2++) { const mid = { x: (points[k2].x + points[k2 + 1].x) / 2, y: (points[k2].y + points[k2 + 1].y) / 2 }; d += ` Q ${f(points[k2].x)},${f(points[k2].y)} ${f(mid.x)},${f(mid.y)}` }
      el.setAttribute('d', d + ` L ${f(points[points.length - 1].x)},${f(points[points.length - 1].y)}`)
      // Плавный цвет от одного конца к другому — только у дуг на лицевой стороне, у остальных один цвет (так дешевле для отрисовки)
      const gradient = front >= 0.55
      const grad = gradEls.current[i]
      if (gradient && grad) { const from = points[0], to = points[points.length - 1]; grad.setAttribute('x1', from.x.toFixed(1)); grad.setAttribute('y1', from.y.toFixed(1)); grad.setAttribute('x2', to.x.toFixed(1)); grad.setAttribute('y2', to.y.toFixed(1)) }
      el.setAttribute('stroke', state.u > 0.5 && hover ? colorOf(hover) : gradient ? `url(#${uid}-${i})` : colorOf(link.a))
      el.setAttribute('stroke-opacity', opacity.toFixed(3))
      el.setAttribute('stroke-width', (1.2 + 1.8 * state.u).toFixed(2))
    })
    // Бегущие точки: появляются раз в ~0,9 с на случайной видимой линии от самого связанного узла к соседу; ползут за 1,6 с, плавно проявляются и гаснут
    if (!still) {
      const nowMs = performance.now(), live = pulses.current
      if (live.length < PULSES && nowMs > nextPulse.current && nowMs - touched.current > 2500 && !hover) {
        const hubs = [...degree.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([id]) => id)
        const options = links.map((link, i) => ({ link, i })).filter(({ link, i }) => edgePts.current[i] && (hubs.includes(link.a) || hubs.includes(link.b)) && visible.has(link.a) && visible.has(link.b) && !live.some((pulse) => pulse.edge === i))
        if (options.length) {
          const { link, i } = options[Math.floor(Math.random() * options.length)], rev = !hubs.includes(link.a)
          live.push({ edge: i, rev, at: nowMs, hub: rev ? link.b : link.a })
        }
        nextPulse.current = nowMs + 900
      }
      pulses.current = live.filter((pulse) => nowMs - pulse.at < PULSE_MS && edgePts.current[pulse.edge])
      pulseEls.current.forEach((els, n) => {
        const pulse = pulses.current[n]
        if (!els.g) return
        if (!pulse) { if (els.g.style.display !== 'none') els.g.style.display = 'none'; return }
        // Штрих — вытянутая «капля» вдоль линии: голова идёт по линии, хвост (14% длины) тянется за ней; ломаная линии режется по параметру
        const pts = edgePts.current[pulse.edge]!, t = (nowMs - pulse.at) / PULSE_MS, last = pts.length - 1
        const head = pulse.rev ? 1 - t : t, tail = Math.min(1, Math.max(0, pulse.rev ? head + PULSE_TAIL : head - PULSE_TAIL))
        const at = (u: number) => { const along = u * last, a = Math.min(last - 1, Math.floor(along)), k = along - a; return { x: pts[a].x + (pts[a + 1].x - pts[a].x) * k, y: pts[a].y + (pts[a + 1].y - pts[a].y) * k } }
        const lo = Math.min(head, tail), hi = Math.max(head, tail), inner: Array<{ x: number; y: number }> = []
        for (let n = Math.ceil(lo * last + 1e-6); n <= Math.floor(hi * last - 1e-6); n++) inner.push(pts[n])
        const run = [at(lo), ...inner, at(hi)], d = `M ${run.map((point) => `${f1(point.x)},${f1(point.y)}`).join(' L ')}`
        const fade = Math.sin(Math.PI * t), color = colorOf(pulse.hub)
        els.g.style.display = ''; els.g.setAttribute('opacity', fade.toFixed(2))
        for (const path of [els.glow, els.dot]) { if (!path) continue; path.setAttribute('d', d); path.setAttribute('stroke', color) }
      })
    }
    // Вблизи (масштаб от 1,45) ближние к зрителю точки — карточки-превью; не больше 20, картинка грузится только у показанных.
    // Карточка проявляется вместе с приближением (1,45 → 1,7), а не появляется разом
    const cardFade = Math.min(1, Math.max(0, (zoomNow - 1.45) / 0.25))
    const cardIds = new Set(cardFade > 0 ? [...placedIds].filter((id) => at.get(id)!.depth >= 0.75 && visible.has(id)).sort((a, b) => at.get(b)!.depth - at.get(a)!.depth).slice(0, 20) : [])
    for (const id of placedIds) {
      const slot = slots.current.get(id), p = at.get(id)
      if (!slot || !slot.dot || !slot.hit || !slot.g || !p) continue
      const deg = degree.get(id) ?? 0, glow = lit.has(id)
      slot.h = ease(slot.h, hover === id ? 1 : 0); slot.l = ease(slot.l, glow ? 1 : 0); slot.d = ease(slot.d, hover && !glow ? 1 : 0)
      slot.v = ease(slot.v, visible.has(id) ? 1 : 0) // не проходит фильтр — точка плавно гаснет, остальные стоят на местах
      const base = (1.6 + Math.min(deg, 8) * 0.4) * (0.55 + 0.9 * p.depth)
      const r = base * Math.pow(Math.min(1, zoomNow), 0.9) // не растёт ни при наведении, ни при подсветке (фокус виден по приглушению остальных); при отдалении уменьшается вместе с шаром (до ~55% на минимуме)
      const rest = (0.2 + 0.8 * p.depth) * (0.5 + 0.5 * Math.min(deg / 6, 1))
      const opacity = (rest * (1 - slot.d) + 0.1 * slot.d) * slot.v
      // Как в «Полёте»: карточка не проявляется из прозрачности, а плавно (smoothstep) вырастает из своей точки тёмной плиткой и
      // «просветляется» по мере роста; ближние к зрителю — первыми
      const grow = cardIds.has(id) ? Math.min(1, Math.max(0, cardFade * 1.5 - (1 - p.depth) * 0.5)) : 0
      const pop = grow * grow * (3 - 2 * grow)
      if (slot.card) {
        if (cardIds.has(id)) {
          const full = Math.min(120, 28 * zoomNow * (0.6 + 0.8 * p.depth)), side = full * pop, image = byId.get(id)?.image
          const tall = heightOf(byId.get(id)); slot.card.setAttribute('x', (p.x - side / 2).toFixed(1)); slot.card.setAttribute('y', (p.y - side * tall / 2).toFixed(1)); slot.card.style.overflow = 'visible'; slot.card.setAttribute('width', side.toFixed(1)); slot.card.setAttribute('height', ((full * tall + Math.round(Math.min(52, Math.max(32, full * 0.44)) / 2) * 2) * pop).toFixed(1))
          slot.card.style.display = ''; slot.card.style.opacity = (Math.min(1, grow * 3) * slot.v).toFixed(2)
          slot.card.style.filter = grow >= 1 ? '' : `brightness(${(0.25 + 0.75 * pop).toFixed(2)})` // фильтр только пока растёт: на готовой карточке он не нужен
          if (image && slot.img && slot.img.getAttribute('src') !== image) slot.img.setAttribute('src', image)
        } else slot.card.style.display = 'none'
      }
      slot.dot.setAttribute('cx', p.x.toFixed(1)); slot.dot.setAttribute('cy', p.y.toFixed(1)); slot.dot.setAttribute('r', r.toFixed(2)); slot.dot.setAttribute('fill-opacity', String(Math.min(1, cardIds.has(id) ? opacity * (1 - Math.min(1, grow * 2)) : opacity)))
      slot.hit.setAttribute('cx', p.x.toFixed(1)); slot.hit.setAttribute('cy', p.y.toFixed(1)); slot.hit.setAttribute('r', (base + 8).toFixed(2))
      slot.facing = p.depth >= 0.5 && slot.v > 0.5 // обратная сторона и отфильтрованные точки не выбираются
      slot.g.style.pointerEvents = slot.facing ? 'auto' : 'none'
      slot.g.style.cursor = slot.facing ? 'pointer' : 'inherit'
    }
    // Порядок рисования «дальние сзади» пересобираем не чаще раза в 600 мс и только если он изменился.
    // Не во время наведения и перетаскивания: перестановка узлов в DOM заново запускает события наведения под курсором (дёргает подсказку)
    const now = performance.now()
    if (nodeLayer.current && !hover && !drag.current && now - lastSort.current > 600) {
      lastSort.current = now
      const order = [...placedIds].sort((a, b) => at.get(a)!.depth - at.get(b)!.depth)
      const domOrder = [...nodeLayer.current.children].map((child) => (child as SVGGElement).dataset.id)
      if (order.some((id, i) => id !== domOrder[i])) for (const id of order) { const g = slots.current.get(id)?.g; if (g) nodeLayer.current.appendChild(g) }
    }
    animating.current = moving
  }
  const paintRef = useRef<(dt?: number) => void>(paint)
  paintRef.current = paint
  // «Мне повезёт»: поворот, который выводит точку на лицевую сторону чуть левее и выше центра, за ~1,2 с (разгон и торможение)
  useEffect(() => {
    if (!aim) return
    const point = ball.get(aim.id)
    if (!point) return
    omega.current = { x: 0, y: 0, z: 0 }
    setPinTip(null)
    // Не точно в центр: большой круг через центр диска проецируется прямой линией, и дуги подсвеченной точки были бы как спицы.
    // Чуть левее и выше — дуги изгибаются, а справа остаётся место под плашку
    const turn = between(apply(view.current, point), { x: -0.3, y: -0.18, z: 0.937 })
    aimAnim.current = { axis: turn?.axis ?? { x: 0, y: 1, z: 0 }, total: turn?.angle ?? 0, applied: 0, start: performance.now(), dur: still ? 1 : 1200, id: aim.id }
  }, [aim?.n]) // eslint-disable-line react-hooks/exhaustive-deps
  useLayoutEffect(() => { paint() }) // после каждой перерисовки React: наведение, масштаб, размер; дальше плавность ведёт цикл кадров

  useLayoutEffect(() => {
    const element = box.current
    if (!element) return
    const read = () => setSize({ w: element.clientWidth, h: element.clientHeight })
    read()
    const observer = new ResizeObserver(read)
    observer.observe(element)
    const wheel = (event: WheelEvent) => {
      // Прокрутка (колесо, два пальца) и щипок — масштаб; шар крутится перетаскиванием
      touched.current = performance.now()
      aimAnim.current = null; onPinNow.current(null)
      event.preventDefault(); setZoom((value) => Math.min(3, Math.max(0.5, value * Math.exp(-event.deltaY * 0.0025)))) }
    // wheel=false (лендинг): колесо листает страницу, а не масштабирует шар
    if (wheelOn.current) element.addEventListener('wheel', wheel, { passive: false })
    return () => { observer.disconnect(); element.removeEventListener('wheel', wheel) }
  }, [])
  useEffect(() => () => { lastView = view.current }, [])
  // Как у глобуса Atlas: после отпускания инерция с трением 0,94 за кадр (не зависит от частоты кадров), пока скорость не
  // упадёт; в покое — медленный дрейф 0,00012 рад/мс (около минуты на оборот). Дрейф стоит, пока пользователь трогал шар
  // меньше 2,5 с назад, держит указатель на точке или включено «уменьшить движение»
  useEffect(() => {
    let frame = 0, last = performance.now()
    const step = (now: number) => {
      const dt = Math.min(48, now - last)
      last = now
      const w = omega.current
      let changed = false
      if (zoomCur.current !== zoomTarget.current) { // масштаб плавно идёт к цели (постоянная времени ~90 мс)
        const next = zoomCur.current + (zoomTarget.current - zoomCur.current) * (1 - Math.exp(-dt / 90))
        zoomCur.current = Math.abs(zoomTarget.current - next) < 0.002 ? zoomTarget.current : next
        changed = true
      }
      const a = aimAnim.current
      if (a) {
        const t = Math.min(1, (now - a.start) / a.dur), eased = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
        const target = a.total * eased
        view.current = orthonormalize(mul(axisAngle(a.axis, target - a.applied), view.current))
        a.applied = target; w.x = 0; w.y = 0; w.z = 0; changed = true
        if (t >= 1) {
          aimAnim.current = null
          onPinNow.current(a.id)
          paintRef.current()
          const dot = slots.current.get(a.id)?.dot
          if (dot) setPinTip({ id: a.id, x: Number(dot.getAttribute('cx')), y: Number(dot.getAttribute('cy')) })
        }
      } else if (!drag.current && !pausedNow.current) {
        // Угловая скорость плавно стремится к целевой: после рывка гаснет (трение 0,972 за кадр, пока скорость заметна, — после броска шар докручивается около полусекунды), без отсечки и
        // «стоп-кадра»; в покое целью становится медленный дрейф, и вращение разгоняется до него само, а не включается скачком
        const resting = !still && !hoveredNow.current && now - touched.current > 2500
        const target = resting ? 0.00012 : 0
        const ease = 1 - Math.pow(Math.hypot(w.x, w.y, w.z) > 0.0004 ? 0.972 : 0.96, dt / 16) // пока шар летит после броска — трение мягче (выбег ~1 с); медленный остаток гасится прежним 0,96
        w.x -= w.x * ease; w.z -= w.z * ease; w.y += (target - w.y) * ease
        const speed = Math.hypot(w.x, w.y, w.z)
        if (speed > 0.000002) { view.current = orthonormalize(mul(axisAngle(w, speed * dt), view.current)); changed = true }
      }
      if (changed || animating.current || pulses.current.length) paintRef.current(dt)
      frame = requestAnimationFrame(step)
    }
    frame = requestAnimationFrame(step)
    return () => cancelAnimationFrame(frame)
  }, [still])

  // Точка шара под указателем (в осях вида) — за неё шар «берут»
  const grabAt = (event: { clientX: number; clientY: number }, rect: DOMRect) => underPointer((event.clientX - rect.left - cx) / (baseR * zoomCur.current), (event.clientY - rect.top - cy) / (baseR * zoomCur.current), CAMERA)
  const slot = (id: string) => { let item = slots.current.get(id); if (!item) { item = { g: null, dot: null, hit: null, facing: false, h: 0, l: 0, d: 0, card: null, img: null, v: 1 }; slots.current.set(id, item) } return item }

  return (
    <div ref={box} className="absolute inset-0 touch-none select-none" style={{ cursor: 'grab' }} onDoubleClick={(event) => { if (!(event.target as Element).closest('g[data-id]')) setZoom(1) }}
      onPointerDown={(event) => {
        touched.current = performance.now()
        aimAnim.current = null; onPin(null); setPinTip(null) // потянули шар — подсветка и докрутка отменяются
        drag.current = { x: event.clientX, y: event.clientY, moved: 0, captured: false, grab: grabAt(event, event.currentTarget.getBoundingClientRect()), samples: [] }
        omega.current = { x: 0, y: 0, z: 0 }
      }}
      onPointerMove={(event) => {
        const rect = event.currentTarget.getBoundingClientRect()
        touched.current = performance.now()
        if (tip) setTip((old) => old && { ...old, x: event.clientX - rect.left, y: event.clientY - rect.top })
        const d = drag.current
        if (!d) return
        if (event.buttons === 0) { drag.current = null; return }
        d.moved += Math.abs(event.clientX - d.x) + Math.abs(event.clientY - d.y)
        d.x = event.clientX; d.y = event.clientY
        // Пока указатель почти не сдвинулся — это клик по точке: захват указателя и вращение начинаем только с настоящего «потянул»
        // (иначе браузер отдаёт click контейнеру, а не точке, и фокус не открывается)
        if (d.moved <= 4) return
        if (!d.captured) { event.currentTarget.setPointerCapture(event.pointerId); d.captured = true; onHover(null); setTip(null) }
        const next = grabAt(event, rect)
        const turn = between(d.grab, next)
        if (!turn) return
        // Поворачиваем шар так, чтобы взятая точка оказалась под указателем
        view.current = orthonormalize(mul(axisAngle(turn.axis, turn.angle), view.current))
        d.grab = next
        const now = performance.now()
        d.samples = [...d.samples.filter((sample) => now - sample.t < 120), { t: now, axis: turn.axis, angle: turn.angle }]
        paint()
      }}
      onPointerUp={(event) => {
        const d = drag.current
        if (d?.captured) {
          event.currentTarget.releasePointerCapture(event.pointerId)
          // Скорость — из хвоста жеста за последние 100 мс (как «film» у Atlas): задержал палец перед отпусканием — инерции нет
          const now = performance.now(), tail = d.samples.filter((sample) => now - sample.t < 120)
          if (tail.length && !still) {
            const sum = tail.reduce((acc, sample) => ({ x: acc.x + sample.axis.x * sample.angle, y: acc.y + sample.axis.y * sample.angle, z: acc.z + sample.axis.z * sample.angle }), { x: 0, y: 0, z: 0 })
            const span = Math.max(16, now - tail[0].t + (tail.length > 1 ? (tail[tail.length - 1].t - tail[0].t) / (tail.length - 1) : 0))
            omega.current = { x: sum.x / span * 0.6, y: sum.y / span * 0.6, z: sum.z / span * 0.6 } // 0,6: бросок без этого раскручивал шар слишком сильно
          }
        }
        touched.current = performance.now()
        setTimeout(() => { drag.current = null }, 0)
      }}>
      {size.w > 0 && (
        <svg className="absolute inset-0 size-full" role="img" aria-label={t('Граф материалов: шар, который можно вращать мышью')}>
          <defs>{links.map((link, i) => (
            <linearGradient key={`${link.a}-${link.b}`} id={`${uid}-${i}`} ref={(el) => { gradEls.current[i] = el }} gradientUnits="userSpaceOnUse">
              <stop offset="0" style={{ stopColor: colorOf(link.a) }} /><stop offset="1" style={{ stopColor: colorOf(link.b) }} />
            </linearGradient>
          ))}</defs>
          <g>{links.map((link, i) => <path key={`${link.a}-${link.b}`} ref={(el) => { edgeEls.current[i] = el }} fill="none" />)}</g>
          <g aria-hidden pointerEvents="none">{Array.from({ length: PULSES }, (_, n) => (
            <g key={n} style={{ display: 'none' }} ref={(el) => { (pulseEls.current[n] ??= { g: null, glow: null, dot: null }).g = el }}>
              <path fill="none" strokeWidth={7} strokeOpacity={0.2} strokeLinecap="round" strokeLinejoin="round" ref={(el) => { (pulseEls.current[n] ??= { g: null, glow: null, dot: null }).glow = el }} />
              <path fill="none" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" ref={(el) => { (pulseEls.current[n] ??= { g: null, glow: null, dot: null }).dot = el }} />
            </g>
          ))}</g>
          <g ref={nodeLayer}>
            {placedIds.map((id) => (
              <g key={id} data-id={id} ref={(el) => { slot(id).g = el }}
                onPointerEnter={(event) => { onHover(id); const rect = box.current!.getBoundingClientRect(); setTip({ id, x: event.clientX - rect.left, y: event.clientY - rect.top }) }}
                onPointerLeave={() => { onHover(null); setTip(null) }}
                onClick={() => { const slot = slots.current.get(id); if (slot?.facing && slot.dot && (!drag.current || drag.current.moved < 4)) onPick(id, { x: Number(slot.dot.getAttribute('cx')), y: Number(slot.dot.getAttribute('cy')) }) }}>
                <circle ref={(el) => { slot(id).hit = el }} fill="transparent" />
                <circle ref={(el) => { slot(id).dot = el }} fill={colorOf(id)} />
                {zoom >= 1.45 && (
                  <foreignObject ref={(el) => { slot(id).card = el }} width="1" height="1" style={{ display: 'none' }}>
                    {/* Та же плитка, что в «Мозаике»: превью со скруглением и подпись под ним; заметка без картинки — лист бумаги */}
                    <div className="@container flex size-full min-w-0 flex-col">
                      <span className="relative block w-full shrink-0 overflow-hidden rounded-surface bg-card" style={{ aspectRatio: `1 / ${heightOf(byId.get(id))}` }}>
                        {byId.get(id)?.image
                          ? <img ref={(el) => { slot(id).img = el }} alt="" draggable={false} className="size-full object-cover" />
                          : <span aria-hidden className="absolute inset-0 grid place-items-center bg-muted text-muted-foreground">{byId.get(id)?.kind === 'note' ? <SquarePen className="size-[36%]" /> : <FileText className="size-[36%]" />}</span>}
                      </span>
                      <span className="mt-1 line-clamp-2 break-words text-[clamp(0.625rem,12cqw,0.875rem)] leading-snug font-medium text-foreground">{byId.get(id)?.title}</span>
                    </div>
                  </foreignObject>
                )}
              </g>
            ))}
          </g>
        </svg>
      )}
      {[tip, !tip && pinned && pinTip?.id === pinned ? pinTip : null].map((at) => at && byId.get(at.id) && (
        // Подсказка у курсора ни на что не реагирует; плашка у закреплённой точки (после «Мне повезёт») кликабельна: клик, Enter или пробел открывают фокус на этой точке
        <div key={at.id} {...(at === tip ? {} : { role: 'button' as const, tabIndex: 0, 'aria-label': t('Открыть фокус: {title}', { title: byId.get(at.id)!.title }), onPointerDown: (event: React.PointerEvent) => event.stopPropagation(), onClick: () => onPick(at.id, { x: at.x, y: at.y }), onKeyDown: (event: React.KeyboardEvent) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onPick(at.id, { x: at.x, y: at.y }) } } })}
          className={cn('absolute z-20 max-w-64 glass rounded-md motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-150 px-3 py-2 text-sm text-popover-foreground shadow-lg shadow-black/25 ring-1 ring-border', at === tip ? 'pointer-events-none' : 'cursor-pointer outline-none transition-shadow hover:ring-foreground/30 focus-visible:ring-2 focus-visible:ring-ring')} style={{ left: Math.min(at.x + 14, Math.max(0, size.w - 270)), top: at.y + 14 }}>
          {cardTip && byId.get(at.id)!.image
            // Подсказка-карточка (лендинг): вид плитки библиотеки — превью со скруглением и подпись под ним, без описания
            ? <span className="block w-44">
                <span className="relative block w-full overflow-hidden rounded-surface bg-card" style={{ aspectRatio: `1 / ${heightOf(byId.get(at.id))}` }}><img src={byId.get(at.id)!.image} alt="" draggable={false} className="size-full object-cover" /></span>
                <span className="mt-1.5 line-clamp-2 block break-words text-sm leading-snug font-medium">{byId.get(at.id)!.title}</span>
              </span>
            : <>
                <span className="block font-medium">{byId.get(at.id)!.title}</span>
                {byId.get(at.id)!.description && <span className="mt-0.5 line-clamp-3 block text-xs opacity-70">{byId.get(at.id)!.description}</span>}
              </>}
        </div>
      ))}
    </div>
  )
}

// Вид-фокус: выбранное в центре крупно, связанные карточки кольцом вокруг, понятия — рядом стеклянных капсул сверху.
// Постоянных линий нет (как в «Полёте»): связь прорисовывается от центра к карточке, когда наводишь на неё или фокус на ней с клавиатуры.
// Картинки грузятся только здесь. Раскладка считает прямоугольники: кольцо карточек не задевает центр, друг друга, ряд понятий и нижнюю панель
type Rect = { x: number; y: number; w: number; h: number }
const overlaps = (a: Rect, b: Rect, pad = 8) => a.x < b.x + b.w + pad && b.x < a.x + a.w + pad && a.y < b.y + b.h + pad && b.y < a.y + a.h + pad
const CARD_W = 112, CARD_H = 120 // плитка связанной карточки вместе с подписью
const DOCK = 96 // снизу занято плавающей панелью
const TAG_H = 32, TAG_GAP = 8, TAG_TOP = 16 // ряд понятий: высота капсулы, зазор, отступ сверху

export function FocusView({ byId, title, cover, cards, keys, onCard, onKey, onOpen, from }: {
  from?: At; onOpen?: () => void; byId: Map<string, Item>; onBack: () => void; title: string; cover?: Item
  cards: (seed: number) => string[]; keys: (seed: number) => Array<{ key: string; name: string }>
  onCard: (id: string, from: At) => void; onKey: (key: string, from: At) => void
}) {
  const box = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })
  const [hoverId, setHoverId] = useState<string | null>(null)
  // Линия связи не пропадает мгновенно: последняя карточка остаётся в памяти, пока линия гаснет
  const [linkId, setLinkId] = useState<{ id: string; run: number } | null>(null)
  useEffect(() => { if (hoverId) setLinkId((old) => ({ id: hoverId, run: (old?.run ?? 0) + 1 })) }, [hoverId])
  const seed = 0
  // Вход (motion.md): материал вырастает из точки, на которую нажали, ~1,1 с с замедлением в конце; следом по одной всплывают
  // карточки, потом ряд понятий и кнопка ↗. stage: 0 — старт, 1 — рост, 2 — карточки, 3 — понятия
  const [stage, setStage] = useState(0)
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { setStage(3); return }
    const timers = [window.setTimeout(() => setStage(1), 30), window.setTimeout(() => setStage(2), 450), window.setTimeout(() => setStage(3), 1000)]
    return () => timers.forEach(window.clearTimeout)
  }, [])
  useLayoutEffect(() => {
    const element = box.current
    if (!element) return
    const read = () => setSize({ w: element.clientWidth, h: element.clientHeight })
    read()
    const observer = new ResizeObserver(read)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])
  const words = useMemo(() => keys(seed), [keys, seed]) // eslint-disable-line react-hooks/exhaustive-deps
  // Ширина капсулы — по настоящему тексту (canvas), а не по числу букв: иначе кириллица обрезается раньше, чем раскладка это учла
  const measure = useMemo(() => { const ctx = document.createElement('canvas').getContext('2d'); if (ctx) ctx.font = `14px ${getComputedStyle(document.body).fontFamily}`; return (text: string) => ctx ? ctx.measureText(text).width : text.length * 8.4 }, [])
  const tagWidths = useMemo(() => words.map((word) => Math.min(224, measure(word.name) + 26)), [words, measure])
  // Сколько рядов займут понятия при переносе: от них зависит, сколько места остаётся карточкам
  const tagRows = useMemo(() => {
    if (size.w < 640) return words.length ? 1 : 0 // на узком экране понятия — одна строка с горизонтальной прокруткой
    const room = Math.max(size.w - 48, 120)
    let rows = words.length ? 1 : 0, used = 0
    tagWidths.forEach((width) => { if (used && used + TAG_GAP + width > room) { rows++; used = 0 } used += (used ? TAG_GAP : 0) + width })
    return rows
  }, [tagWidths, words.length, size.w])
  const topReserve = tagRows ? TAG_TOP + tagRows * TAG_H + (tagRows - 1) * TAG_GAP + 16 : 8
  const centerW0 = cover ? 224 : 240, centerH0 = cover ? 232 : 40 // без карточки (фокус на понятии) в центре небольшая капсула
  const cx = size.w / 2, cy = size.h / 2
  // Кольцо считается от свободной высоты (минус ряд понятий сверху и нижняя панель): помещается — кольцо, нет — столбик (compact)
  const ringMaxY = Math.min(cy - CARD_H / 2 - topReserve, size.h - DOCK - CARD_H / 2 - cy)
  const ringNeedY = centerH0 / 2 + CARD_H / 2 + 12
  const compact = size.w < 640 || ringMaxY < ringNeedY
  const near = useMemo(() => cards(seed).slice(0, 8), [cards, seed]) // eslint-disable-line react-hooks/exhaustive-deps
  const centerW = compact && cover ? 160 : centerW0, centerH = compact && cover ? 208 : centerH0 // 208: квадрат 160 + две строки названия
  const cyM = compact ? topReserve + centerH / 2 + 8 : cy // в столбике центр прижат под ряд понятий, карточки идут сеткой под ним
  const layout = useMemo(() => {
    const none = { spots: [] as Array<{ id: string; x: number; y: number }> }
    if (!size.w) return none
    const center: Rect = { x: cx - centerW / 2, y: cyM - centerH / 2, w: centerW, h: centerH }
    if (compact) {
      // Столбик: карточки сеткой под центром (по три в ряд на телефоне), рядов — сколько влезает над нижней панелью
      const cols = Math.max(1, Math.floor((size.w - 16 + 8) / (CARD_W + 8)))
      const gridTop = cyM + centerH / 2 + 12
      const rows = Math.max(1, Math.floor((size.h - DOCK - gridTop + 8) / (CARD_H + 8)))
      const shown = near.slice(0, cols * rows)
      return { spots: shown.map((id, i) => {
        const row = Math.floor(i / cols), inRow = Math.min(cols, shown.length - row * cols)
        return { id, x: cx + ((i % cols) - (inRow - 1) / 2) * (CARD_W + 8), y: gridTop + CARD_H / 2 + row * (CARD_H + 8) }
      }) }
    }
    // Карточки — кольцо из фиксированных мест, начиная сверху; если плитки задевают центр или друг друга (узкое окно), их становится меньше
    const rx = Math.max(Math.min(size.w * 0.34, 380), centerW / 2 + CARD_W / 2 + 28), ry = Math.max(Math.min(size.h * 0.32, 270, ringMaxY), ringNeedY)
    const rectOf = (spot: { x: number; y: number }): Rect => ({ x: spot.x - CARD_W / 2, y: spot.y - CARD_H / 2, w: CARD_W, h: CARD_H })
    const ring = (n: number) => near.slice(0, n).map((id, i) => { const a = -Math.PI / 2 + (i / n) * Math.PI * 2; return { id, x: cx + Math.cos(a) * rx, y: cyM + Math.sin(a) * ry } })
    let spots = ring(near.length)
    for (let n = near.length; n > 3; n--) {
      spots = ring(n)
      const rects = spots.map(rectOf)
      if (!rects.some((r, i) => overlaps(r, center, 4) || rects.some((other, k) => k > i && overlaps(r, other, 4)))) break
    }
    return { spots }
  }, [size.w, size.h, compact, near, cx, cyM, centerW, centerH, ringMaxY, ringNeedY])
  const hovered = layout.spots.find((spot) => spot.id === linkId?.id)
  const glassButton = 'glass border text-foreground outline-none transition-[opacity,box-shadow] duration-300 hover:ring-1 hover:ring-foreground/30 focus-visible:ring-2 focus-visible:ring-ring'
  return (
    <div ref={box} className="absolute inset-0">
      {size.w > 0 && (
        <>
          <svg className="pointer-events-none absolute inset-0 size-full" aria-hidden>
            {hovered && <g key={linkId?.run} className={cn('transition-opacity ease-out motion-reduce:transition-none', hoverId === hovered.id ? 'opacity-100 duration-150' : 'opacity-0 duration-500')}>
              {/* Линия прорисовывается от центра к карточке, потом по ней бежит штрих */}
              <line className="link-draw" x1={cx} y1={cyM} x2={hovered.x} y2={hovered.y} pathLength={100} stroke="var(--foreground)" strokeOpacity={0.3} />
              <line className="link-pulse" x1={cx} y1={cyM} x2={hovered.x} y2={hovered.y} pathLength={100} stroke="var(--foreground)" strokeOpacity={0.9} strokeWidth={1.5} strokeLinecap="round" />
            </g>}
          </svg>
          {words.length > 0 && (
            <div className={cn('absolute flex transition-[opacity,transform] duration-700 ease-out motion-reduce:transition-none', size.w < 640 ? 'inset-x-0 overflow-x-auto px-4 [scrollbar-width:none]' : 'inset-x-6 flex-wrap justify-center')} style={{ top: TAG_TOP, gap: TAG_GAP, opacity: stage >= 3 ? 1 : 0, transform: stage >= 3 ? 'none' : 'translateY(-8px)', pointerEvents: stage >= 3 ? undefined : 'none' }}>
              {words.map((word, i) => (
                <Button key={word.key} variant="ghost" size="sm" className={cn(glassButton, 'h-8 shrink-0 rounded-lg px-3 text-sm font-normal')} style={{ maxWidth: tagWidths[i] }} tabIndex={stage >= 3 ? 0 : -1} onClick={() => onKey(word.key, { x: cx, y: TAG_TOP })}>
                  <span className="truncate">{word.name}</span>
                </Button>
              ))}
            </div>
          )}
          <div className="absolute -translate-x-1/2 -translate-y-1/2" style={{ left: cx, top: cyM }}>
          <div className="flex flex-col items-center gap-2 transition-[transform,opacity] duration-[1100ms] ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none" style={{ transform: stage >= 1 ? 'none' : `translate(${(from?.x ?? cx) - cx}px, ${(from?.y ?? cyM) - cyM}px) scale(0.12)`, opacity: stage >= 1 ? 1 : 0 }}>
            {cover ? (
              <div className="group/center flex flex-col items-center gap-2" style={{ width: centerW }}>
                {/* Центральная карточка сама открывает материал: отдельной кнопки-стрелки нет */}
                <button type="button" aria-label={t('Открыть «{title}»', { title: cover.title })} disabled={!onOpen} tabIndex={stage < 3 ? -1 : 0} onClick={onOpen} className={cn('relative block w-full overflow-hidden rounded-container shadow-md outline-none transition-transform duration-300 focus-visible:ring-2 focus-visible:ring-ring', onOpen && 'cursor-pointer hover:scale-[1.02]', cover.image ? 'border bg-card' : 'bg-transparent')} style={{ aspectRatio: tileRatio }}>
                  {cover.image ? <img src={cover.image} alt="" className="size-full object-cover" draggable={false} /> : <PaperNote title={cover.title} text={cover.description} size="tile" />}
                </button>
                {cover.image && <span className="line-clamp-2 w-full px-1 text-center text-sm font-medium">{cover.title}</span>}{/* у заметки название уже в самом листе */}
              </div>
            ) : <span className="glass max-w-72 rounded-lg border px-4 py-2 text-center text-sm font-medium">{title}</span>}
          </div>
          </div>
          {layout.spots.map((spot, i) => {
            const item = byId.get(spot.id)
            return (
              <button key={spot.id} type="button" className="absolute flex w-28 -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1.5 rounded-control p-1 outline-none hover:scale-105 focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
                // Карточка вылетает из центра в своё место: растёт (с 20%) и «просветляется» из тёмной, как в «Полёте»; прозрачность включается почти сразу, чтобы не читалось как проявление
                style={{ left: spot.x, top: spot.y, opacity: stage >= 2 ? 1 : 0, transform: stage >= 2 ? undefined : `translate(${cx - spot.x}px, ${cyM - spot.y}px) scale(0.2)`, filter: stage >= 2 ? undefined : 'brightness(0.3)', transitionProperty: 'transform, filter, opacity, scale', transitionDuration: '1100ms, 1100ms, 250ms, 300ms', transitionTimingFunction: 'cubic-bezier(0.33, 0.6, 0.25, 1)', transitionDelay: stage >= 2 ? `${i * 60}ms, ${i * 60}ms, ${i * 60}ms, 0ms` : undefined, pointerEvents: stage >= 2 ? undefined : 'none' }} tabIndex={stage >= 2 ? 0 : -1}
                onMouseEnter={() => setHoverId(spot.id)} onMouseLeave={() => setHoverId(null)} onFocus={() => setHoverId(spot.id)} onBlur={() => setHoverId(null)}
                onClick={() => onCard(spot.id, { x: spot.x, y: spot.y })}>
                {item?.image ? (
                  <>
                    <span className="relative block h-18 w-24 overflow-hidden rounded-surface border bg-card"><img src={item.image} alt="" className="size-full object-cover" draggable={false} /></span>
                    <span className="line-clamp-2 text-center text-xs text-foreground/80">{item.title}</span>
                  </>
                ) : (
                  // заметка: лист с одним названием крупно (текст листа в таком размере не читается), подписи под ним нет
                  <span className="flex h-24 w-24 items-center rounded-surface bg-paper p-2 text-left text-xs leading-snug font-medium text-paper-foreground"><span className="line-clamp-5">{item?.title}</span></span>
                )}
              </button>
            )
          })}
        </>
      )}
    </div>
  )
}
