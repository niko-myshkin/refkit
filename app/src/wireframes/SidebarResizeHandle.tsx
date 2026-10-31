import { useRef, type KeyboardEvent, type PointerEvent } from 'react'
import { t } from '@/lib/i18n'
import { useSidebar } from '@/components/ui/sidebar'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

// Край боковой панели — только для ширины. Правило проекта: клик по краю ничего не делает, сворачивание — кнопкой и ⌘B.
// Механика Fluid Sidebar (ветка fluid, sidebar-core.tsx), без их вида:
// — пока тянешь, панель идёт за курсором 1:1 (пружина выключена). Ширина во время тяги пишется прямо в CSS-переменную
//   --sidebar-width (ширина панели, навигация v3), без состояния React: иначе каждый сдвиг мыши перерисовывал всю сетку и шторка шла тяжело;
//   в состояние (и в память браузера) ширина уходит один раз — когда отпустил;
// — правее максимума (360 px) край тянется с сопротивлением, как резинка; отпустил — пружина возвращает к границе;
// — левее минимума промежуточного «сжатого» состояния нет (решение владельца 2026-09-26): ушёл за минимум — панель сразу
//   щёлкает в полоску с иконками прямо во время тяги, вернул курсор — раскрывается; из полоски вытягивается тем же движением.
//   Переходы между полоской и панелью — с пружиной.

export const SIDEBAR_MIN = 160
export const SIDEBAR_MAX = 360
const COLLAPSE_SLOP = 24 // небольшой запас за минимумом, чтобы панель не схлопывалась от случайного движения
const ICON_STRIP = 56 // ширина колонки в свёрнутом виде: полоса иконок (рейка 40 + поля), с неё начинается тяга
const RUBBER = 0.3 // за границей край проходит 30% пути курсора
const FLIP_MS = 240 // столько держим пружину включённой после перехода «полоска ↔ панель» (как spring.slow у Fluid)

const clamp = (width: number) => Math.round(Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, width)))
// Резинка только за максимумом; ниже минимума ширина не опускается — там сразу полоска
const rubber = (width: number) => width > SIDEBAR_MAX ? SIDEBAR_MAX + (width - SIDEBAR_MAX) * RUBBER : Math.max(SIDEBAR_MIN, width)

export function SidebarResizeHandle({ width, onWidth }: { width: number; onWidth: (width: number) => void }) {
  const { open, setOpen } = useSidebar()
  const drag = useRef<{ moved: boolean; x: number; from: number; restore: number; open: boolean; live: number; wrapper: HTMLElement | null; flipTimer?: ReturnType<typeof setTimeout> } | null>(null)

  // Флаг на панели выключает пружину на время тяги (sidebar.tsx: group-data-[resizing=true]:duration-0)
  const setResizing = (element: Element, on: boolean) => {
    const sidebar = element.closest<HTMLElement>('[data-slot="sidebar"]')
    if (sidebar) sidebar.dataset.resizing = String(on)
  }
  // Переход «полоска ↔ панель» посреди тяги едет на пружине, потом край снова идёт за курсором 1:1
  const flip = (element: Element, nextOpen: boolean) => {
    const state = drag.current!
    state.open = nextOpen
    setResizing(element, false)
    setOpen(nextOpen)
    clearTimeout(state.flipTimer)
    state.flipTimer = setTimeout(() => { if (drag.current) setResizing(element, true) }, FLIP_MS)
  }

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    event.currentTarget.setPointerCapture(event.pointerId)
    drag.current = { moved: false, x: event.clientX, from: open ? width : ICON_STRIP, restore: width, open, live: width, wrapper: event.currentTarget.closest<HTMLElement>('[data-slot="sidebar-wrapper"]') }
    setResizing(event.currentTarget, true)
  }
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const state = drag.current
    if (!state) return
    if (!state.moved && Math.abs(event.clientX - state.x) < 4) return // дрожь руки при клике — не тяга
    state.moved = true
    const raw = state.from + event.clientX - state.x
    const collapse = raw < SIDEBAR_MIN - COLLAPSE_SLOP
    if (collapse && state.open) flip(event.currentTarget, false)
    else if (!collapse && !state.open) flip(event.currentTarget, true)
    if (!collapse) { state.live = Math.round(rubber(raw)); state.wrapper?.style.setProperty('--sidebar-width', `${state.live}px`) }
  }
  const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    const state = drag.current
    if (!state) return
    clearTimeout(state.flipTimer)
    drag.current = null
    setResizing(event.currentTarget, false)
    // Клик без движения (владелец 2026-10-29, как у Fabric): рейка выезжает или уезжает; тяга меняет ширину
    if (!state.moved) { setOpen(!state.open); return }
    // дальше — с пружиной: резинка возвращается к границе
    const final = state.open ? clamp(state.live) : state.restore // свернули — раскроется к прежней ширине
    state.wrapper?.style.setProperty('--sidebar-width', `${final}px`)
    onWidth(final)
  }

  // Клавиатура: стрелки меняют ширину — край доступен не только мыши
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!open || (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight')) return
    event.preventDefault()
    onWidth(clamp(width + (event.key === 'ArrowRight' ? 16 : -16)))
  }

  return (
    <Tooltip><TooltipTrigger asChild><div
      role="separator" aria-orientation="vertical" aria-label={t('Ширина панели')} tabIndex={0}
      aria-valuemin={SIDEBAR_MIN} aria-valuemax={SIDEBAR_MAX} aria-valuenow={open ? width : ICON_STRIP}
      onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}
      onKeyDown={onKeyDown}
      className="absolute inset-y-0 -right-3 z-20 w-3 cursor-col-resize touch-none outline-none after:absolute after:top-1/2 after:left-1/2 after:h-12 after:w-1 after:-translate-x-1/2 after:-translate-y-1/2 after:rounded-full after:transition-colors hover:after:bg-foreground/30 focus-visible:after:bg-sidebar-ring"
    /></TooltipTrigger><TooltipContent side="right">{open ? t('Свернуть панель · потяните, чтобы изменить ширину') : t('Развернуть панель')}</TooltipContent></Tooltip>
  )
}
