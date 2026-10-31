import { createPortal } from 'react-dom'
import { t } from '@/lib/i18n'
import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Kbd, KbdGroup } from '@/components/ui/kbd'
import { notify } from '@/lib/notify'
import { Dices, SlidersHorizontal } from 'lucide-react'
import { SpaceBackdrop } from '@/components/space-backdrop'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import { cardLinks, clusterCards, derive } from '@/lib/graph-core.mjs'
import { FilterBar } from '@/components/filter-bar'
import { kindOptions, matchesFilters, tagOptions } from '@/lib/material-filters'
import { library, type GraphState } from '@/lib/library'

// Раздел «Полёт» (иконка-ракета в левой полосе; фильтры типа и тега, как у графа): летишь сквозь пространство своих материалов. Ось — время (новые у входа, старые в глубине), цвет — тема.
// Издалека — тёмные мини-карточки, ближе — карточки целиком в настоящих пропорциях; картинки грузятся, только когда материал подлетел.
// Набросок и вся история подбора — 05_experiments/face-graph/cards.html. Эксперимент: не понравится — откат коммитов «Полёт».
// Рисуем canvas: SVG на сотне карточек с картинками тормозил бы. Все карточки непрозрачные; даль темнеет туманом цвета фона.
type Item = { id: string; title: string; image?: string; ratio?: string; createdAt?: number; description?: string; kind?: string; format?: string; collections?: string[] }
type Props = { items: Item[]; onOpen: (id: string) => void; filtersOpen: boolean; dockSlot: HTMLElement | null }
type Pt = { id: string; title: string; description: string; crop: boolean; image: string; ratio: number; group: number; z: number; x: number; y: number; i: number }
type Box = { x0: number; y0: number; x1: number; y1: number }
type Seen = { p: Pt; d: number; sx: number; sy: number; k: number; hit: null | Box; wide: null | Box; dot: boolean; r?: Rect }
type Rect = { rw: number; rh: number; x0: number; y0: number; ready: boolean; ratio: number }

// Ручки настройки (панель справа): для подбора значений, когда они устоятся — панель убрать
const DEFAULTS = { gap: 1.5, spread: 1.0, size: 0.7, fog: 0.75, fogStart: 3, overlap: 100, far: 26, tie: 0, grow: 0, axis: 1, speed: 1.6, drift: 0.004 } // подобраны с владельцем 2026-10-13: кучно у центра, но в камеру не залетают (ось ≥ ~0,8: половина самой широкой карточки 0,55 плюс запас)
type Config = typeof DEFAULTS
const CONTROLS: Array<{ key: keyof Config; label: string; min: number; max: number; step: number }> = [
  { key: 'gap', label: t('Шаг по глубине'), min: 0.6, max: 3, step: 0.1 },
  { key: 'spread', label: t('Разброс от оси'), min: 0.5, max: 4, step: 0.1 },
  { key: 'size', label: t('Размер карточек'), min: 0.3, max: 1.4, step: 0.05 },
  { key: 'fog', label: t('Сила тумана'), min: 0, max: 1, step: 0.02 },
  { key: 'fogStart', label: t('Туман с расстояния'), min: 0, max: 15, step: 0.5 },
  { key: 'overlap', label: t('Допустимое перекрытие, % (100 — выкл.)'), min: 0, max: 100, step: 1 },
  { key: 'far', label: t('Дальность видимости'), min: 12, max: 40, step: 1 },
  { key: 'tie', label: t('Привязка темы к стороне'), min: 0, max: 1, step: 0.05 },
  { key: 'grow', label: t('Время появления, мс (0 — сразу)'), min: 0, max: 1200, step: 10 },
  { key: 'axis', label: t('Не ближе к оси полёта'), min: 0, max: 3, step: 0.1 },
  { key: 'speed', label: t('Скорость полёта при прокрутке'), min: 0.5, max: 4, step: 0.1 },
  { key: 'drift', label: t('Дрейф вперёд в покое (0 — стоять)'), min: 0, max: 0.02, step: 0.001 },
]
const STORAGE = 'refkit:fly'
const loadConfig = (): Config => { try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(STORAGE) ?? '{}') } } catch { return { ...DEFAULTS } } }
const HIT_MIN = 28, HIT_PAD = 4 // область наведения: не меньше 28 px и запас 4 px по краям
const IDLE_MS = 1500 // сколько мышь должна стоять, чтобы включился дрейф вперёд
const PRELOAD = 8 // картинку начинаем грузить за столько единиц ДО появления карточки из тумана: к моменту появления превью уже готово
const START = 4.5 // первая (самая свежая) карточка лежит в 4,5 единицах от входа: в первом кадре видна композиция, а не одна карточка в упор
const TAU = Math.PI * 2
const BOOST = 2.5 // Shift: во столько раз быстрее и рулёж, и полёт
const STEER_MAX = 2.5 // насколько камера может уйти вбок от оси пути, единиц

// Детерминированный генератор: раскладка не прыгает между открытиями
const lcg = (start: number) => { let seed = start; return () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296 }
const ratioOf = (text?: string) => { const [w, h] = String(text ?? '').split('/').map(Number); return w && h ? Math.min(2.5, Math.max(0.4, w / h)) : 0 }
// Ось полёта чуть изгибается: путь не прямой, но камера всегда по центру
const BEND = 0.35 // изгиб пути в долях от прежнего: большой изгиб сдвигал ряд относительно камеры и карточки проходили прямо по центру
const bendX = (z: number) => BEND * (0.55 * Math.sin(z * 0.23) + 0.25 * Math.sin(z * 0.07))
const bendY = (z: number) => BEND * 0.4 * Math.cos(z * 0.19)

// Раскладка: время даёт глубину, из 24 кандидатов берётся тот, что дальше всех от соседей по глубине — ровно, без комков и наложений.
// tie = 0: по всему кругу равномерно; tie = 1: каждая тема в своём секторе
function layout(cards: Array<Omit<Pt, 'z' | 'x' | 'y' | 'i'>>, cfg: Config, sectors: number): { pts: Pt[]; depth: number } {
  const rand = lcg(3), pts: Pt[] = []
  cards.forEach((card, i) => {
    const z = START + i * cfg.gap + (rand() - 0.5) * 0.3, centre = card.group < 0 ? rand() * TAU : (card.group / sectors) * TAU
    let best = { x: 0, y: 0 }, gap = -1
    for (let t = 0; t < 24; t++) {
      const theta = card.group < 0 ? rand() * TAU : centre + (rand() - 0.5) * (TAU - cfg.tie * (TAU - 1.7)), r = cfg.axis + cfg.spread * (0.3 + rand() * 0.7)
      const x = Math.cos(theta) * r, y = Math.sin(theta) * r
      let d = 9
      for (const q of pts) if (Math.abs(q.z - z) < 3.4) d = Math.min(d, Math.hypot(q.x - x, q.y - y))
      if (d > gap) { gap = d; best = { x, y } }
    }
    pts.push({ ...card, z, x: best.x, y: best.y, i })
  })
  return { pts, depth: START + cards.length * cfg.gap + 6 }
}

// Карточка под точкой экрана: сначала по рамке (ближняя перекрывает), потом по близости к центру
function pickAt(seen: Seen[], x: number, y: number): Pt | null {
  const inside = (box: Box | null) => box !== null && x >= box.x0 && x <= box.x1 && y >= box.y0 && y <= box.y1
  for (let n = seen.length - 1; n >= 0; n--) if (inside(seen[n].hit)) return seen[n].p // точно под курсором: ближняя первой
  let best: { p: Pt; d: number } | null = null // мелкая рядом с курсором: ближайшая по центру среди расширенных областей
  for (const e of seen) if (inside(e.wide)) { const d = Math.hypot(e.sx - x, e.sy - y); if (!best || d < best.d) best = { p: e.p, d } }
  return best?.p ?? null
}

// Текстовая карточка: текст раскладывается один раз на «эталонной» карточке (300 px по ширине, шрифт и поля фиксированы) и дальше
// только масштабируется вместе с ней, как картинка: никакого пересчёта шрифта и переносов при каждом размере
const TEXT = { width: 300, pad: 20, gap: 10, corner: 26, title: { font: 17, line: 23 }, body: { font: 13, line: 21 } } // эталон: те же числа, что у PaperNote (вариант A) на плитке 300 px
const FONT = '"Inter Variable", system-ui, sans-serif'
type NoteLayout = { title: string[]; body: string[]; bodyTop: number }
// Текстовая карточка: текст раскладывается один раз на эталонной карточке (300 px) и дальше только масштабируется вместе с ней, как картинка:
// никакого пересчёта шрифта и переносов при каждом размере. Перенос — по пробелам, по дефису, а слово шире строки — по буквам
function wrapLines(ctx: CanvasRenderingContext2D, text: string, room: number, maxLines: number, ellipsis: boolean): string[] {
  const fits = (value: string) => ctx.measureText(value).width <= room
  const pieces: Array<{ text: string; glue: boolean }> = []
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const parts = fits(word) ? [word] : word.split(/(?<=-)/)
    parts.forEach((part, i) => {
      if (fits(part)) { pieces.push({ text: part, glue: i > 0 }); return }
      let rest = part, first = true
      while (rest) {
        let take = rest.length
        while (take > 1 && !fits(rest.slice(0, take))) take--
        pieces.push({ text: rest.slice(0, take), glue: i > 0 || !first })
        rest = rest.slice(take); first = false
      }
    })
  }
  const lines: string[] = []
  let line = ''
  for (const piece of pieces) {
    const next = line ? (piece.glue ? line + piece.text : `${line} ${piece.text}`) : piece.text
    if (line && !fits(next)) { lines.push(line); line = piece.text } else line = next
  }
  if (line) lines.push(line)
  if (lines.length > maxLines) {
    lines.length = maxLines
    if (ellipsis) { let last = lines[maxLines - 1]; while (last && !fits(`${last}…`)) last = last.slice(0, -1); lines[maxLines - 1] = `${last.trimEnd()}…` }
  }
  return lines
}
function noteLayout(ctx: CanvasRenderingContext2D, title: string, description: string, ratio: number): NoteLayout {
  const height = TEXT.width / ratio, inner = TEXT.width - TEXT.pad * 2
  ctx.font = `500 ${TEXT.title.font}px ${FONT}`
  const titleLines = wrapLines(ctx, title, inner - TEXT.corner - 1, 2, true) // справа место под срезанный угол
  const bodyTop = TEXT.pad + titleLines.length * TEXT.title.line + TEXT.gap
  ctx.font = `400 ${TEXT.body.font}px ${FONT}`
  // Строк описания столько, сколько помещается; последняя заканчивается многоточием, затухания нет
  const fit = Math.max(1, Math.floor((height - bodyTop - TEXT.pad) / TEXT.body.line))
  return { title: titleLines, body: description ? wrapLines(ctx, description, inner, fit, true) : [], bodyTop }
}

export function FlyPage({ items, onOpen, filtersOpen, dockSlot }: Props) {
  const [state, setState] = useState<GraphState>()
  const [kindFilter, setKindFilter] = useState<string | null>(null)
  const [tagFilter, setTagFilter] = useState<string | null>(null)
  const openRef = useRef(onOpen)
  openRef.current = onOpen
  const [failed, setFailed] = useState(false)
  const [cfg, setCfg] = useState(loadConfig)
  const [tip, setTip] = useState<{ title: string; x: number; y: number } | null>(null)
  const [flew, setFlew] = useState(false)
  const [panel, setPanel] = useState(false) // закрыта при входе на любой ширине: 12 ползунков — инструмент подбора, а не первое, что видно (аудит 2026-10-13)
  useEffect(() => { void library.graph().then(setState).catch(() => setFailed(true)) }, [])
  useEffect(() => { try { localStorage.setItem(STORAGE, JSON.stringify(cfg)) } catch { /* без хранилища просто не запоминаем */ } }, [cfg])

  // Темы — кластеры графа (как у страницы «Граф»); материалы без графа остаются без цвета
  const graph = useMemo(() => derive(state?.items, new Set(items.map((item) => item.id))), [state?.items, items])
  const order = useMemo(() => [...graph.byId.keys()].filter((id) => items.some((item) => item.id === id)), [graph, items])
  const links = useMemo(() => cardLinks(graph, order, 3), [graph, order])
  const groups = useMemo(() => clusterCards(graph, order, links), [graph, order, links])
  const cards = useMemo(() => {
    const byId = new Map(items.map((item) => [item.id, item]))
    return items.filter((item) => matchesFilters(item, kindFilter, tagFilter)).map((item) => ({ id: item.id, title: item.title, description: item.description ?? '', crop: item.kind === 'youtube' && ratioOf(item.ratio) > 1.2 && ratioOf(item.ratio) < 1.45, image: item.image ?? '', ratio: ratioOf(item.ratio), group: groups.of.get(item.id) ?? -1 }))
      .sort((a, b) => (byId.get(b.id)?.createdAt ?? 0) - (byId.get(a.id)?.createdAt ?? 0))
  }, [items, groups, kindFilter, tagFilter])
  const kinds = useMemo(() => kindOptions(items), [items])
  const tags = useMemo(() => tagOptions(items), [items])
  const laid = useMemo(() => layout(cards, cfg, Math.max(groups.list.length, 1)), [cards, cfg.gap, cfg.spread, cfg.tie, cfg.axis, groups.list.length]) // eslint-disable-line react-hooks/exhaustive-deps

  // Всё, что нужно кадру, — в ref: холст рисует сам, React на кадр не дёргаем
  const canvas = useRef<HTMLCanvasElement>(null)
  // «Мне повезёт»: случайная карточка выбирается из тех, что сейчас видны с учётом фильтров; камера останавливается в 2,2 единицах перед ней — вне тумана
  const lucky = () => {
    const pool = live.current.laid.pts
    if (!pool.length) return
    const pick = pool[Math.floor(Math.random() * pool.length)]
    const z = Math.max(0, Math.min(Math.max(0, live.current.laid.depth - 4), pick.z - 2.2))
    // боковой сдвиг камеры = положение карточки относительно оси пути в точке остановки: тогда она ляжет в центр кадра
    live.current.hold = true // после перелёта стоим у карточки: дрейф вперёд выключен, пока сам не полетишь (колесо, стрелки)
    live.current.aim = { z, x: pick.x + bendX(pick.z) - bendX(z), y: pick.y + bendY(pick.z) - bendY(z) }; setFlew(true)
  }
  const live = useRef({ cfg, laid, links, groups, cam: 0, vel: 0, aim: null as { z: number; x: number; y: number } | null, offX: 0, offY: 0, hold: false, hover: null as Pt | null, pointer: null as { x: number; y: number; cx: number; cy: number } | null, dragging: false, hoverId: '', lastMove: 0, driftK: 0, dim: new Map<string, number>(), lit: new Map<string, number>(), text: new Map<string, NoteLayout>(), seen: [] as Seen[], imgs: new Map<string, { img: HTMLImageElement; ready: boolean; at: number }>(), appear: new Map<string, number>() })
  live.current.cfg = cfg; live.current.laid = laid; live.current.links = links; live.current.groups = groups
  useEffect(() => { live.current.cam = Math.min(live.current.cam, Math.max(0, laid.depth - 4)) }, [laid])

  useEffect(() => {
    const el = canvas.current
    const ctx = el?.getContext('2d')
    if (!el || !ctx) return
    const state = live.current, still = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const held = new Set<string>()
    let w = 0, h = 0, dpr = 1, frame = 0, palette: string[] = [], paletteAt = -1e9, lastTime = 0
    const readPalette = () => {
      const style = getComputedStyle(document.documentElement), read = (name: string) => style.getPropertyValue(name).trim()
      return [read('--muted-foreground'), read('--background'), read('--foreground'), read('--paper'), read('--paper-foreground'), read('--paper-muted'), read('--secondary')]
    }
    const fit = () => { const rect = el.getBoundingClientRect(); dpr = window.devicePixelRatio || 1; w = rect.width; h = rect.height; el.width = w * dpr; el.height = h * dpr }
    fit()
    const observer = new ResizeObserver(fit)
    observer.observe(el)
    const imageOf = (p: Pt) => {
      if (!p.image) return null
      let slot = state.imgs.get(p.id)
      if (!slot) { const img = new Image(), entry = { img, ready: false, at: 0 }; img.onload = () => { entry.ready = true; entry.at = performance.now() }; img.src = p.image; state.imgs.set(p.id, entry); slot = entry }
      return slot
    }
    const project = (x: number, y: number, z: number) => {
      const d = z - state.cam
      if (d < 0.08) return null
      // Параллакса за курсором нет: он сдвигал близкие карточки до 30 px и уводил цель из-под мыши в момент наведения
      const f = Math.min(w, h) * 0.95
      return { sx: w / 2 + (x - state.offX + bendX(z) - bendX(state.cam)) * f / d, sy: h / 2 + (y - state.offY + bendY(z) - bendY(state.cam)) * f / d, d, k: f / d }
    }

    const step = (now: number) => {
      const { cfg: c, laid: field } = state
      const dt = Math.min(64, now - (lastTime || now)); lastTime = now
      if (now - paletteAt > 500) { palette = readPalette(); paletteAt = now } // тема могла смениться
      // В покое медленно плывём вперёд (ручка «Дрейф»): только когда мышь не двигалась IDLE_MS, не пока летишь сам, не при наведении (иначе цель уезжает из-под мыши) и не при «уменьшить движение»
      const idle = !still && !state.hold && !state.hover && !state.dragging && Math.abs(state.vel) < 0.004 && now - state.lastMove > IDLE_MS
      state.driftK += ((idle ? 1 : 0) - state.driftK) * (1 - Math.exp(-dt / (idle ? 700 : 150))) // разгоняется плавно за ~1,5 с, останавливается за долю секунды
      const drifting = c.drift * state.driftK * (dt / 16.7)
      // «Мне повезёт»: камера плавно едет к цели — вперёд и в сторону, чтобы карточка встала по центру; колесо и стрелки (fly) цель сбрасывают
      const camBefore = state.cam
      if (state.aim) {
        state.vel = 0
        const k = still ? 1 : 1 - Math.exp(-dt / 280), left = state.aim.z - state.cam
        state.cam += left * k; state.offX += (state.aim.x - state.offX) * k; state.offY += (state.aim.y - state.offY) * k
        if (Math.abs(left) < 0.02 && Math.abs(state.aim.x - state.offX) < 0.01 && Math.abs(state.aim.y - state.offY) < 0.01) state.aim = null
      }
      state.cam = Math.max(0, Math.min(Math.max(0, field.depth - 4), state.cam + state.vel + drifting)); state.vel *= 0.93
      // Рулим: A/D (←/→) — вбок, пока клавиша зажата; Shift ускоряет; сдвиг ограничен, дрейф вперёд при этом не включается
      const boost = held.has('ShiftLeft') || held.has('ShiftRight') ? BOOST : 1
      const steer = (held.has('KeyD') || held.has('ArrowRight') ? 1 : 0) - (held.has('KeyA') || held.has('ArrowLeft') ? 1 : 0)
      if (steer) { state.aim = null; state.hold = true; state.offX = Math.max(-STEER_MAX, Math.min(STEER_MAX, state.offX + steer * 0.03 * boost * (dt / 16.7))) }
      if (!state.aim) { const k = Math.exp(-Math.abs(state.cam - camBefore) / 3); state.offX *= k; state.offY *= k } // боковой сдвиг после перелёта рассасывается по мере пролёта (на ~3 единицах пути — до трети)
      if (Math.abs(state.vel) < 0.0004) state.vel = 0
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, w, h)
      const bg = palette[1], paper = palette[3], paperFg = palette[4], paperMuted = palette[5], fold = palette[6]

      // Кто виден: расстояние до камеры вдоль полёта; ближние картинки начинаем грузить заранее
      const seen: Seen[] = []
      for (const p of field.pts) {
        const v = project(p.x, p.y, p.z)
        if (!v || v.d > c.far + PRELOAD) continue
        imageOf(p)
        if (v.d > c.far) continue
        seen.push({ p, d: v.d, sx: v.sx, sy: v.sy, k: v.k, hit: null, wide: null, dot: false })
      }
      seen.sort((a, b) => b.d - a.d) // от дальних к ближним: ближняя перекрывает
      // Фокус — по последнему положению курсора и каждый кадр: летишь колесом или стрелками, карточка уезжает из-под курсора — фокус уходит с ней
      state.hover = state.pointer && !state.dragging ? pickAt(state.seen, state.pointer.x, state.pointer.y) : null
      const hoverId = state.hover?.id ?? ''
      if (hoverId !== state.hoverId) { state.hoverId = hoverId; const at = state.pointer; setTip(state.hover && at ? { title: state.hover.title, x: at.cx, y: at.cy } : null) }
      const hover = state.hover, lit = new Set<string>(), settle = 1 - Math.exp(-dt / 220)
      if (hover) { lit.add(hover.id); for (const link of state.links) { if (link.a === hover.id) lit.add(link.b); if (link.b === hover.id) lit.add(link.a) } }

      // Размер — по «площади», чтобы высокие и широкие весили одинаково; пропорции настоящие с первого кадра (по данным, у всех материалов совпадают с картинкой), картинка целиком (как в мозаике)
      const rectOf = (e: Seen): Rect => {
        const slot = imageOf(e.p), ready = Boolean(slot?.ready), ratio = e.p.crop ? 16 / 9 : e.p.ratio || (ready ? slot!.img.naturalWidth / slot!.img.naturalHeight : slot ? 1.3 : 0.85)
        // Потолка размера нет: близкая карточка честно растёт и вылетает за кадр (с потолком она переставала расти, но продолжала ехать к краю и «уезжала»)
        const side = c.size * e.k, rw = Math.max(6, side * Math.sqrt(ratio)), rh = rw / ratio
        return { rw, rh, x0: e.sx - rw / 2, y0: e.sy - rh / 2, ready, ratio }
      }
      // Перекрытая ближней карточкой больше допустимого плавно уходит: никаких стопок и никаких кружков (даль — мини-карточки)
      const solid: Array<{ x0: number; y0: number; x1: number; y1: number }> = []
      for (const e of [...seen].reverse()) {
        const r = e.r = rectOf(e)
        if (r.rw < 34) continue
        for (const q of solid) {
          const ox = Math.max(0, Math.min(r.x0 + r.rw, q.x1) - Math.max(r.x0, q.x0)), oy = Math.max(0, Math.min(r.y0 + r.rh, q.y1) - Math.max(r.y0, q.y0))
          if (ox * oy > (c.overlap / 100) * r.rw * r.rh) { e.dot = true; break }
        }
        if (!e.dot) solid.push({ x0: r.x0, y0: r.y0, x1: r.x0 + r.rw, y1: r.y0 + r.rh })
      }

      for (const e of seen) {
        const { p, r } = e
        // Фокус виден по приглушению остальных; оно включается и гаснет плавно, а не щелчком
        const dimNow = state.dim.get(p.id) ?? 0, dimAmt = dimNow + ((hover && !lit.has(p.id) ? 1 : 0) - dimNow) * settle
        state.dim.set(p.id, dimAmt)
                const edge = Math.min(1, Math.max(0, (e.d - c.far * 0.6) / (c.far * 0.4))) // у границы дальности туман доходит до 100%: плитка не выскакивает, а проступает из фона
        const fog = Math.min(0.93, Math.max(c.fog * Math.pow(Math.min(1, Math.max(0, (e.d - c.fogStart) / (c.far - c.fogStart))), 0.85), edge * edge * (3 - 2 * edge))), pass = 1 // потолок 0,93: на самом краю дальности карточка ещё еле видна, а не пропадает целиком
        if (!r) continue
        // Появление: карточка вырастает из центра (без прозрачности) за время из ручки «Время появления» (по умолчанию ~0,3 с); перекрытая ближней так же плавно уменьшается и уходит
        const was = state.appear.get(p.id) ?? 0, target = e.dot ? 0 : 1, grown = c.grow <= 0 ? target : was + (target - was) * (1 - Math.exp(-dt / (c.grow / 3)))
        state.appear.set(p.id, grown)
        if (grown < 0.02) continue
        const sc = grown * grown * (3 - 2 * grown), q = { rw: r.rw * sc, rh: r.rh * sc, x0: e.sx - (r.rw * sc) / 2, y0: e.sy - (r.rh * sc) / 2, ready: r.ready }
        const corner = Math.max(2, Math.min(q.rw, q.rh) * 0.07), slot = imageOf(p)
        ctx.globalAlpha = pass
        ctx.save(); ctx.beginPath(); ctx.roundRect(q.x0, q.y0, q.rw, q.rh, corner); ctx.clip()
        // Пока картинки нет — нейтральная тёмная плитка (не цвет темы): скачок «плитка → картинка» остаётся тихим
        ctx.fillStyle = palette[0]; ctx.fillRect(q.x0, q.y0, q.rw, q.rh)
        ctx.globalAlpha = pass * 0.72; ctx.fillStyle = bg; ctx.fillRect(q.x0, q.y0, q.rw, q.rh); ctx.globalAlpha = pass
        if (q.rw >= 20) {
          if (slot && q.ready) { ctx.globalAlpha = pass * Math.min(1, (now - slot.at) / 450); if (p.crop) { const iw = slot.img.naturalWidth, ih = slot.img.naturalHeight; ctx.drawImage(slot.img, 0, ih * 0.125, iw, ih * 0.75, q.x0, q.y0, q.rw, q.rh) } else ctx.drawImage(slot.img, q.x0, q.y0, q.rw, q.rh); ctx.globalAlpha = pass } // 0,45 с проявляется поверх плитки
          else if (!slot) {
            ctx.fillStyle = paper; ctx.fillRect(q.x0, q.y0, q.rw, q.rh)
            if (q.rw > 40) {
              let layout = state.text.get(p.id)
              if (!layout) { layout = noteLayout(ctx, p.title, p.description, r.ratio); state.text.set(p.id, layout) }
              const sc = q.rw / TEXT.width
              ctx.save(); ctx.translate(q.x0, q.y0); ctx.scale(sc, sc); ctx.textBaseline = 'alphabetic'
              ctx.fillStyle = paperFg; ctx.font = `500 ${TEXT.title.font}px ${FONT}`
              layout.title.forEach((line, n) => ctx.fillText(line, TEXT.pad, TEXT.pad + 16 + n * TEXT.title.line))
              ctx.fillStyle = paperMuted; ctx.font = `400 ${TEXT.body.font}px ${FONT}`
              layout.body.forEach((line, n) => ctx.fillText(line, TEXT.pad, layout.bodyTop + 12 + n * TEXT.body.line))
              // Что это заметка, говорит срезанный угол листа: вырез цветом фона и чуть более светлый загиб
              const cw = TEXT.corner
              ctx.fillStyle = bg; ctx.beginPath(); ctx.moveTo(TEXT.width - cw, 0); ctx.lineTo(TEXT.width, 0); ctx.lineTo(TEXT.width, cw); ctx.closePath(); ctx.fill()
              ctx.fillStyle = fold; ctx.beginPath(); ctx.moveTo(TEXT.width - cw, 0); ctx.lineTo(TEXT.width - cw, cw); ctx.lineTo(TEXT.width, cw); ctx.closePath(); ctx.fill()
              ctx.restore()
            }
          }
        }
        // Туман и приглушение остальных при наведении — цветом фона поверх: карточка остаётся непрозрачной
        // Фокус: наведённая карточка «выплывает» из тумана (он плавно уходит), связанные — наполовину, остальные приглушены
        const litNow = state.lit.get(p.id) ?? 0, litAmt = litNow + ((hover && p.id === hover.id ? 1 : hover && lit.has(p.id) ? 0.6 : 0) - litNow) * settle
        state.lit.set(p.id, litAmt)
        const dim = Math.max(fog * (1 - litAmt), 0.55 * dimAmt)
        if (dim > 0) { ctx.globalAlpha = pass * dim; ctx.fillStyle = bg; ctx.fillRect(q.x0, q.y0, q.rw, q.rh) }
        ctx.restore()
        // Обводок нет: фокус виден по приглушению остальных
        // Наведение: сначала настоящая рамка (ближняя перекрывает дальнюю), расширенная область (не меньше 28 px) — только запасной вариант для мелких, и только пока карточка
        // видна, чтобы мелкая невидимая не отбирала мышь у соседней
        if (fog < 0.94) { // настоящая рамка — у любой нарисованной карточки, даже в густом тумане (её видно, значит, целиться можно); расширенная — только у заметных (ниже)
          const padX = Math.max(0, HIT_MIN - q.rw) / 2 + HIT_PAD, padY = Math.max(0, HIT_MIN - q.rh) / 2 + HIT_PAD
          e.hit = { x0: q.x0, y0: q.y0, x1: q.x0 + q.rw, y1: q.y0 + q.rh }
          if (fog < 0.7) e.wide = { x0: q.x0 - padX, y0: q.y0 - padY, x1: q.x0 + q.rw + padX, y1: q.y0 + q.rh + padY }
        }
      }
      ctx.globalAlpha = 1
      state.seen = seen

      frame = requestAnimationFrame(step)
    }
    frame = requestAnimationFrame(step)

    const fly = (amount: number, fast = false) => { state.aim = null; state.hold = false; state.vel += amount * state.cfg.speed * (still ? 0.3 : 1) * (fast ? BOOST : 1); setFlew(true) }
    // с Shift браузер может отдать прокрутку в deltaX, поэтому берём любую из осей
    const onWheel = (event: WheelEvent) => { event.preventDefault(); fly(Math.max(-1, Math.min(1, (event.deltaY || event.deltaX) / 120)) * 0.035, event.shiftKey) }
    const onKey = (event: KeyboardEvent) => {
      // Стрелки летят, только когда фокус не в поле ввода и карточка не открыта (иначе в разделе перехватывали бы набор текста и прокрутку карточки)
      if (event.target instanceof HTMLElement && event.target.closest('input, textarea, select, [contenteditable="true"], [role="slider"]')) return
      if (window.location.hash.startsWith('#/card/')) return
      if (event.code === 'ArrowUp' || event.code === 'KeyW') fly(0.04, event.shiftKey)
      if (event.code === 'ArrowDown' || event.code === 'KeyS') fly(-0.04, event.shiftKey)
      if (['KeyA', 'KeyD', 'ArrowLeft', 'ArrowRight', 'ShiftLeft', 'ShiftRight'].includes(event.code)) { if (event.code.startsWith('Arrow')) event.preventDefault(); held.add(event.code) }
    }
    const onKeyUp = (event: KeyboardEvent) => { held.delete(event.code) }
    const onBlur = () => held.clear()
    el.addEventListener('wheel', onWheel, { passive: false })
    window.addEventListener('keydown', onKey); window.addEventListener('keyup', onKeyUp); window.addEventListener('blur', onBlur)
    return () => { cancelAnimationFrame(frame); observer.disconnect(); el.removeEventListener('wheel', onWheel); window.removeEventListener('keydown', onKey); window.removeEventListener('keyup', onKeyUp); window.removeEventListener('blur', onBlur) }
  }, [])

  // Указатель: мышь чуть сдвигает ракурс; перетаскивание вверх-вниз — полёт; клик по карточке открывает её
  const drag = useRef<{ x: number; y: number; moved: number } | null>(null)
  const lastTip = useRef(tip)
  if (tip) lastTip.current = tip
  const shownTip = tip ?? lastTip.current // последнюю подпись держим в DOM, пока она гаснет
  const empty = !failed && state && cards.length === 0
  // Подсказка управления — обычное уведомление, а не строка на сцене: показывается при входе и пропадает, как только полетел
  const hintId = useRef<string | number | undefined>(undefined)
  const ready = Boolean(state) && !failed && !empty
  useEffect(() => {
    if (!ready || flew) return
    hintId.current = notify(
      <span className="flex items-center gap-4 whitespace-nowrap">
        <span className="flex items-center gap-2"><KbdGroup><Kbd>W</Kbd><Kbd>S</Kbd></KbdGroup>{t('вперёд и назад')}</span>
        <span className="flex items-center gap-2"><KbdGroup><Kbd>A</Kbd><Kbd>D</Kbd></KbdGroup>{t('вбок')}</span>
        <span className="flex items-center gap-2"><Kbd>Shift</Kbd>{t('быстрее')}</span>
      </span>)
    return () => { toast.dismiss(hintId.current) }
  }, [ready, flew])
  return (
    <div className="relative -mx-(--canvas-gutter) min-h-0 flex-1 select-none overflow-hidden bg-background text-foreground">{/* на всю ширину раздела: у родителя боковые отступы, внутри них сцена обрезалась бы по их границе */}
      <SpaceBackdrop />
      <canvas ref={canvas} className="absolute inset-0 size-full touch-none" role="img" aria-label={t('Полёт сквозь материалы библиотеки: колесо мыши или стрелки вверх и вниз')}
        onPointerDown={(event) => { drag.current = { x: event.clientX, y: event.clientY, moved: 0 }; live.current.dragging = true; event.currentTarget.setPointerCapture(event.pointerId) }}
        onPointerMove={(event) => {
          const rect = event.currentTarget.getBoundingClientRect(), s = live.current
          // x, y — от угла холста (в них считаются карточки), cx, cy — от угла окна (для подписи): холст стоит в разделе со смещением, их нельзя путать
          s.pointer = { x: event.clientX - rect.left, y: event.clientY - rect.top, cx: event.clientX, cy: event.clientY }; s.lastMove = performance.now()
          const d = drag.current
          if (d && event.buttons) {
            d.moved += Math.abs(event.clientY - d.y) + Math.abs(event.clientX - d.x)
            // Мышью перетаскивание не летит (мешало выделять и кликать); на телефоне другого способа нет: там тянем вверх-вниз.
            // Мёртвая зона 6 px: дрожь пальца при касании не должна разгонять полёт; скорость ограничена, чтобы инерция не уносила
            if (event.pointerType === 'touch' && d.moved > 6) s.vel = Math.max(-0.5, Math.min(0.5, s.vel + (d.y - event.clientY) * 0.004 * s.cfg.speed))
            d.y = event.clientY; d.x = event.clientX
            if (event.pointerType === 'touch') setFlew(true)
            return
          }
          setTip((old) => old && { ...old, x: event.clientX, y: event.clientY }) // подпись едет за курсором
        }}
        onPointerUp={(event) => {
          const d = drag.current, s = live.current
          drag.current = null; s.dragging = false
          if (d && d.moved <= 6) s.vel = 0 // это был клик, а не рывок: остановиться
          if (d && d.moved <= 6) { const box = event.currentTarget.getBoundingClientRect(), p = pickAt(s.seen, event.clientX - box.left, event.clientY - box.top); if (p) openRef.current(p.id) }
        }}
        onPointerCancel={() => { drag.current = null; live.current.dragging = false }}
        onLostPointerCapture={() => { drag.current = null; live.current.dragging = false }} // отпустили кнопку вне окна или касание сорвали: без этого «нажато» оставалось и наведение молчало до следующего клика
        onPointerLeave={() => { live.current.pointer = null }} />
      {dockSlot && createPortal(
        <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" aria-label={t('Мне повезёт')} onClick={lucky}><Dices /></Button></TooltipTrigger><TooltipContent>{t('Мне повезёт')}</TooltipContent></Tooltip>, dockSlot)}
      {failed && <p className="pointer-events-none absolute inset-x-4 bottom-20 text-center text-sm text-muted-foreground">{t('Не удалось прочитать библиотеку')}</p>}
      {empty && <p className="pointer-events-none absolute inset-x-4 bottom-20 text-center text-sm text-muted-foreground">{t('Материалов пока нет')}</p>}
      {/* Подпись проявляется не сразу и медленно (задержка 0,15 с, проявление 0,35 с) и гаснет быстрее; без монтирования/размонтирования */}
      {shownTip && <div className="pointer-events-none fixed w-max max-w-80 glass rounded-md px-3 py-1.5 text-xs leading-snug break-words text-popover-foreground shadow-lg shadow-black/25 ring-1 ring-border" style={{ left: Math.min(shownTip.x + 12, window.innerWidth - 336), top: Math.min(shownTip.y + 12, window.innerHeight - 96), opacity: tip ? 1 : 0, transition: `opacity ${tip ? 200 : 120}ms ease-out` }}>{shownTip.title}</div>}
      {filtersOpen && (
        // Те же фильтры, что у графа: тип и тег; вне кнопок строка не перехватывает клики по сцене
        <FilterBar floating className="pl-(--canvas-gutter) pr-[calc(var(--canvas-gutter)+3rem)]" type={{ value: kindFilter, onChange: setKindFilter, options: kinds }} tag={{ value: tagFilter, onChange: setTagFilter, options: tags }} found={{ shown: cards.length, total: items.length }} />
      )}
      {/* Ручки настройки: подбор значений, потом панель убрать */}
      <Button variant={panel ? 'secondary' : 'ghost'} size="icon-sm" className="absolute right-(--canvas-gutter) top-2" aria-label={t('Ручки настройки')} aria-pressed={panel} onClick={() => setPanel((open) => !open)}><SlidersHorizontal /></Button>
      {panel && (
        <div className="absolute right-(--canvas-gutter) top-12 flex w-56 flex-col gap-3 glass rounded-container border p-3 text-xs text-popover-foreground">
          {CONTROLS.map(({ key, label, min, max, step }) => (
            <div key={key} className="flex flex-col gap-2">
              <Label className="flex justify-between text-xs font-normal text-muted-foreground"><span>{label}</span><span className="tabular-nums text-foreground">{cfg[key]}</span></Label>
              <Slider min={min} max={max} step={step} value={[cfg[key]]} onValueChange={([value]) => setCfg((old) => ({ ...old, [key]: value }))} aria-label={label} />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
