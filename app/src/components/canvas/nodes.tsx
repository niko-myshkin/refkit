import { materialMosaic, type MosaicBox } from '@/lib/material-mosaic'
import { ViewerShell } from '@/components/viewer-shell'
import { AgentCopyIcon } from '@/components/agent-copy-icon'
import { createContext, memo, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { PaperNote } from '@/components/paper-note'
import { DirectionCard, parseDirection } from '@/components/canvas/direction-card'
import { form, t } from '@/lib/i18n'
import { MessageResponse } from '@/components/ai-elements/message'
import { WebPreview, WebPreviewBody } from '@/components/ai-elements/web-preview'
import { Shimmer } from '@/components/ai-elements/shimmer'
import { BaseNode } from '@/components/base-node'
import { ButtonEdge } from '@/components/button-edge'
import { AnimatedSvgEdge } from '@/components/animated-svg-edge'
import { type NodeStatus } from '@/components/node-status-indicator'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Toolbar } from '@/components/ai-elements/toolbar'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { RotateCcw, Expand, SquareArrowUpRight, SquareX, FolderOpen, Layers, ChevronLeft, ChevronRight, Bot, Plus, Play, Square, X, Eye, FileText, Maximize2, BookmarkPlus, ChevronDown, Copy, Images, ListChecks, PanelTop, Ungroup, Minimize2, Image as ImageIcon, Shapes, Trash2, Type, Pencil, Download, MessageSquarePlus, ZoomIn, ZoomOut, Ellipsis, List as ListIcon, LayoutGrid, type LucideIcon } from 'lucide-react'
import { BaseEdge, getBezierPath, Handle, NodeResizeControl, Position, useReactFlow, useStore, type EdgeProps, type Node, type NodeProps } from '@xyflow/react'
import { splitItems } from '../../../shared/canvas-graph.mjs'
import { conceptAsset, routeField } from '../../../shared/brand-concepts.mjs'
import { cleanSymbol } from '../../../shared/symbol.mjs'
import { PAIR_NAMES } from '../../../shared/font-pairs.mjs'
import '@xyflow/react/dist/base.css'
import { Button } from '@/components/ui/button'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuTrigger } from '@/components/ui/context-menu'
import { Input } from '@/components/ui/input'
import { Kbd } from '@/components/ui/kbd'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { SNAPSHOT, type ActionItem } from '@/lib/library'
import { type CardComment } from '@/components/comment-feed'
import { withPicker, type PickedElement } from '@/components/canvas/screen-pick'
import { CommentComposer, PinLayer } from '@/components/pin-layer'
import { cn } from '@/lib/utils'
import { portOf as portOfNode } from '../../../shared/canvas-nodes.mjs'
export type CanvasItem = { id: string; title: string; image: string; ratio: string; kind?: string; text?: string; folder?: string; boards?: string[] }

export const cardWidth = 220
// Выделение: рамка 2 px акцентом, ручки 8 px (чётные, без нечётных от рамки)
export const resizer = { lineClassName: '!border-2 !border-primary', handleClassName: '!size-2 !rounded-sm !border-primary !bg-background' }
// Пробел двигает холст (панорама), а в поле ввода его не должно быть «лишнего»: пробел в начале поля или после пробела никому не нужен,
// поэтому он выходит из редактирования и сразу работает как обычный пробел для сдвига. Пробелы между словами печатаются как раньше
export const spaceToPan = (event: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
  if (event.code !== 'Space' || event.metaKey || event.ctrlKey || event.altKey) return
  const field = event.currentTarget
  const before = field.value.slice(0, field.selectionStart ?? 0)
  if (before && !/\s$/.test(before)) return
  event.preventDefault()
  field.blur()
  document.body.dispatchEvent(new KeyboardEvent('keydown', { code: 'Space', key: ' ', bubbles: true }))
}
// Растягивание как у Magnific: у выбранной ноды в каждом углу при наведении появляется белая дуга по скруглению; тянешь за неё — размер меняется
const ARC: Record<'top-left' | 'top-right' | 'bottom-left' | 'bottom-right', string> = {
  'top-left': 'top-1 left-1 rounded-tl-[18px] border-t-[3px] border-l-[3px] cursor-nwse-resize',
  'top-right': 'top-1 right-1 rounded-tr-[18px] border-t-[3px] border-r-[3px] cursor-nesw-resize',
  'bottom-left': 'bottom-1 left-1 rounded-bl-[18px] border-b-[3px] border-l-[3px] cursor-nesw-resize',
  'bottom-right': 'bottom-1 right-1 rounded-br-[18px] border-b-[3px] border-r-[3px] cursor-nwse-resize',
}
export function ResizeArcs({ selected, minWidth, minHeight, onEnd }: { selected?: boolean; minWidth: number; minHeight: number; onEnd?: () => void }) {
  if (!selected) return null
  return (
    <>
      {(Object.keys(ARC) as Array<keyof typeof ARC>).map((position) => (
        <NodeResizeControl key={position} position={position} minWidth={minWidth} minHeight={minHeight} className="group/arc !size-7 !border-0 !bg-transparent" onResizeEnd={onEnd}>
          <span aria-hidden className={cn('absolute block size-6 border-foreground/80 opacity-0 transition-opacity group-hover/arc:opacity-100', ARC[position])} />
        </NodeResizeControl>
      ))}
    </>
  )
}
// Типы портов (как в Magnific): материал — янтарный, текст — синий, экран — фиолетовый. Соединить можно только совместимое, циклов нет
export type Port = 'material' | 'text' | 'screen' | 'image'
export const portOf = (node?: Node): Port => portOfNode(node as never)
export const PORT_VAR: Record<Port, string> = { material: 'var(--port-material)', text: 'var(--port-text)', screen: 'var(--port-screen)', image: 'var(--port-image)' }
// Порт как у Weave (2026-10-27, по просьбе владельца): круглая точка 12 px прямо на краю карточки. Тип выхода — цвет заливки
// (значка нет, для скринридера — подпись), вход общий и нейтральный; у выхода — «+» для следующей ноды. Зона попадания больше точки (before)
export const PORT_ICON: Record<Port, typeof Images> = { material: Images, text: Type, screen: PanelTop, image: ImageIcon }
const PORT_LABEL: Record<Port, () => string> = { material: () => t('Материал'), text: () => t('текст'), screen: () => t('экран'), image: () => t('картинка') }
export function PortHandle({ type, port, add, label }: { type: 'source' | 'target'; port: Port; add?: () => void; label?: string }) {
  const out = type === 'source'
  return (
    <Handle type={type} position={out ? Position.Right : Position.Left} aria-label={out ? PORT_LABEL[port]() : t('вход')}
      style={{ borderColor: out ? PORT_VAR[port] : 'var(--muted-foreground)', backgroundColor: out ? PORT_VAR[port] : 'var(--card)', transform: out ? 'translate(50%, -50%)' : 'translate(-50%, -50%)' }}
      className="!size-3 !rounded-full !border-2 transition-transform before:absolute before:-inset-2 before:content-[''] hover:!scale-125">
      {out && add && (
        <Tooltip><TooltipTrigger asChild><Button size="icon-xs" variant="secondary" className="nodrag nopan absolute top-1/2 left-full ml-3 size-6 -translate-y-1/2 rounded-lg" aria-label={label ?? t('Добавить следующую ноду')} onPointerDown={(event) => event.stopPropagation()} onClick={add}><Plus /></Button></TooltipTrigger><TooltipContent>{label ?? t('Добавить следующую ноду')}</TooltipContent></Tooltip>
      )}
    </Handle>
  )
}
export const ratioOf = (ratio: string) => { const [a, b] = ratio.split('/').map((part) => Number(part.trim())); return a > 0 && b > 0 ? b / a : 3 / 4 }

export type Env = { expandedId?: string | null; collapse?: () => void; toggleComment?: () => void; editText?: (id: string, from: string, to: string) => void; fitHeight: (nodeId: string, height: number) => void; downloadPdf: (nodeId: string) => void; runAfter: (nodeId: string) => void; refine: (nodeId: string, text: string) => void; activate: (nodeId: string, index: number) => void; redoItem: (nodeId: string, index: number) => void; commenting: boolean; apply: (id: string) => void; items: Map<string, CanvasItem>; open: (id: string) => void; patch: (id: string, data: Record<string, unknown>) => void; remove: (id: string) => void; duplicate: (id: string) => void; showPrompt: (id: string) => void; expand: (id: string) => void; addNext: (id: string) => void; insertBetween: (edgeId: string) => void; outgoing: Set<string>; run: (id: string) => void; runFrom: (id: string) => void; runAll: () => void; stop: (id: string) => void; save: (id: string) => void; download: (id: string) => void; copyForAgent: (id: string) => void; multi: boolean; placeCard: (groupId: string, ref: string) => void; removeFromGroup: (groupId: string, itemId: string) => void; ungroup: (listId: string) => void; toggleList: (listId: string) => void; addToFolder: (folderId: string) => void; addInput: (id: string) => void; restore: (id: string, index: number) => void; setKind: (id: string, kind: 'agent' | 'screen') => void; models: Array<{ key: string; label: string }>; defaultModel: string; actions: ActionItem[]; manage: () => void }
export const CanvasEnv = createContext<Env>({ fitHeight: () => {}, downloadPdf: () => {}, runAfter: () => {}, refine: () => {}, activate: () => {}, redoItem: () => {}, commenting: false, apply: () => {}, items: new Map(), open: () => {}, patch: () => {}, remove: () => {}, duplicate: () => {}, showPrompt: () => {}, expand: () => {}, addNext: () => {}, insertBetween: () => {}, outgoing: new Set<string>(), run: () => {}, runFrom: () => {}, runAll: () => {}, stop: () => {}, save: () => {}, download: () => {}, copyForAgent: () => {}, multi: false, placeCard: () => {}, removeFromGroup: () => {}, ungroup: () => {}, toggleList: () => {}, addToFolder: () => {}, addInput: () => {}, restore: () => {}, setKind: () => {}, models: [], defaultModel: '', actions: [], manage: () => {} })
// Поля агентных нод, которыми владеет сервер (статус, результат, цена): клиент их не сохраняет, а подтягивает из ответов
// Серверные и вычисляемые поля нод (результат, статус, цена…) описаны в реестре shared/canvas-nodes.mjs: derivedFields(type) / stripDerived(type, data)

// Точки связи: на каждой стороне, видны при наведении на узел; ConnectionMode.Loose — тянуть можно от любой к любой

// Мини-панель над выделенным узлом: открыть (карточке) и удалить — рабочее и на тач-экране, где нет Backspace
// Кнопка с подсказкой при наведении: у действий в панелях над нодами подписи нужны (иконки там разные и редкие)
export function Tip({ label, children }: { label: string; children: React.ReactElement }) {
  return <Tooltip><TooltipTrigger asChild>{children}</TooltipTrigger><TooltipContent>{label}</TooltipContent></Tooltip>
}
export const barButton = 'size-7 rounded-lg [&_svg]:size-3.5'
export const barClass = 'gap-0.5 rounded-lg border bg-background p-1 shadow-sm'
export function NodeActions({ id, selected }: { id: string; selected: boolean; open?: () => void }) {
  return <NodeBar id={id} selected={selected} />
}

// Панель над выбранной нодой, как у Magnific: тёмная таблетка с мелкими иконками — запуск с режимами (эта / отсюда / всё), «подключить дальше»,
// развернуть, дубль, удалить; редкое (запрос, в библиотеку, скопировать для агента, скачать) — в меню «…». Подписей у иконок нет
const Divider = () => <span aria-hidden className="mx-0.5 h-4 w-px bg-line" />
export function NodeBar({ id, selected, runnable, hasOut, hasResult, screen }: { id: string; selected: boolean; runnable?: boolean; hasOut?: boolean; hasResult?: boolean; screen?: boolean }) {
  const { run, runFrom, runAll, duplicate, showPrompt, save, download, downloadPdf, copyForAgent, expand, multi, expandedId, commenting, toggleComment } = useContext(CanvasEnv)
  const { deleteElements, getNode } = useReactFlow()
  const expanded = expandedId === id
  const data = getNode(id)?.data as AgentData | undefined
  const historical = typeof data?.activeAt === 'number' && Boolean(data.history?.[data.activeAt])
  const result = Boolean(runnable && hasResult)
  const deck = Boolean(screen && (getNode(id)?.data as { designSystem?: string } | undefined)?.designSystem === 'deck')
  const buttons = (
    <>
      {runnable && (
        <DropdownMenu>
          <Tip label={t('Запустить')}><Button variant="ghost" size="icon-sm" className={barButton} aria-label={t('Запустить')} disabled={SNAPSHOT} onClick={() => run(id)}><Play /></Button></Tip>
          <Tip label={t('Режимы запуска')}><DropdownMenuTrigger asChild><Button variant="ghost" size="icon-sm" className="-ml-1 h-7 w-5 rounded-lg [&_svg]:size-3.5" aria-label={t('Режимы запуска')}><ChevronDown /></Button></DropdownMenuTrigger></Tip>
          <DropdownMenuContent align="start">
            <DropdownMenuItem disabled={SNAPSHOT} onSelect={() => run(id)}>{t('Запустить эту')}</DropdownMenuItem>
            <DropdownMenuItem disabled={SNAPSHOT} onSelect={() => runFrom(id)}>{t('Запустить отсюда')}</DropdownMenuItem>
            <DropdownMenuItem disabled={SNAPSHOT} onSelect={() => runAll()}>{t('Запустить всё')}</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      {runnable && (hasOut || result) && <Divider />}
      {!expanded && <Tip label={screen ? t('Развернуть экран') : t('Развернуть')}><Button variant="ghost" size="icon-sm" className={barButton} aria-label={screen ? t('Развернуть экран') : t('Развернуть')} onClick={() => expand(id)}><Maximize2 /></Button></Tip>}
      <Tip label={t('Скопировать для агента')}><Button variant="ghost" size="icon-sm" className={barButton} aria-label={t('Скопировать для агента')} onClick={() => copyForAgent(id)}><AgentCopyIcon /></Button></Tip>
      {expanded && <Tip label={t('Скачать')}><Button variant="ghost" size="icon-sm" className={barButton} aria-label={t('Скачать')} onClick={() => download(id)}><Download /></Button></Tip>}
      {expanded && !historical && (screen || getNode(id)?.type === 'image') && <Tip label={t('Правки')}><Button variant={commenting ? 'secondary' : 'ghost'} size="icon-sm" className={barButton} aria-label={t('Правки')} aria-pressed={commenting} onClick={toggleComment}><MessageSquarePlus /></Button></Tip>}
      {(hasOut || result || runnable) && <Divider />}
      <Tip label={t('Дублировать')}><Button variant="ghost" size="icon-sm" className={barButton} aria-label={t('Дублировать')} onClick={() => duplicate(id)}><Copy /></Button></Tip>
      <Tip label={t('Удалить')}><Button variant="ghost" size="icon-sm" className={barButton} aria-label={t('Удалить')} onClick={() => void deleteElements({ nodes: [{ id }] })}><Trash2 /></Button></Tip>
      {runnable && (
        <DropdownMenu>
          <Tip label={t('Ещё')}><DropdownMenuTrigger asChild><Button variant="ghost" size="icon-sm" className={barButton} aria-label={t('Ещё')}><Ellipsis /></Button></DropdownMenuTrigger></Tip>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => showPrompt(id)}><FileText />{t('Показать запрос')}</DropdownMenuItem>
            {result && !historical && <DropdownMenuItem onSelect={() => save(id)}><BookmarkPlus />{screen ? t('Картинкой в библиотеку') : t('В библиотеку')}</DropdownMenuItem>}
            {result && <DropdownMenuItem onSelect={() => download(id)}><Download />{screen ? t('Скачать HTML') : getNode(id)?.type === 'image' ? t('Скачать') : t('Скачать .md')}</DropdownMenuItem>}
            {result && !historical && deck && <DropdownMenuItem onSelect={() => downloadPdf(id)}><Download />{t('Скачать PDF')}</DropdownMenuItem>}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </>
  )
  if (expanded) return <div className="flex flex-wrap items-center gap-0.5" role="toolbar" aria-label={data?.title ?? t('Результат ноды')}>{buttons}</div>
  return <Toolbar isVisible={selected && !multi} position={Position.Top} offset={44} className={barClass}>{buttons}</Toolbar>
}

// Контекстное меню ноды (как у Tersa): Дублировать, Показать (камера едет к ноде), Удалить; правый клик заодно выделяет ноду
export function NodeMenu({ id, children }: { id: string; children: React.ReactNode }) {
  const { duplicate, showPrompt, run, runFrom, runAll, expand, copyForAgent, save, download, downloadPdf } = useContext(CanvasEnv)
  const { deleteElements, setCenter, getNode, updateNode } = useReactFlow()
  const focus = () => {
    const node = getNode(id)
    if (node) void setCenter(node.position.x + (node.measured?.width ?? node.width ?? 0) / 2, node.position.y + (node.measured?.height ?? node.height ?? 0) / 2, { duration: 600 })
  }
  // Правый клик — то же, что панель над нодой, но полным списком (как у Magnific): запуск, связи, результат, экспорт, дубль, удаление
  const node = getNode(id)
  const runnable = node?.type === 'agent' || node?.type === 'screen' || node?.type === 'image'
  const screen = node?.type === 'screen'
  const data = node?.data as AgentData | undefined
  const historical = typeof data?.activeAt === 'number' && Boolean(data.history?.[data.activeAt])
  const result = runnable && Boolean((node?.data as { result?: string; imageFile?: string } | undefined)?.result || node?.data.imageFile)
  return (
    <ContextMenu onOpenChange={(open) => { if (open && !getNode(id)?.selected) updateNode(id, { selected: true }) }}>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent className="min-w-52">
        {runnable && <ContextMenuItem disabled={SNAPSHOT} onSelect={() => run(id)}><Play />{t('Запустить')}</ContextMenuItem>}
        {runnable && <ContextMenuItem disabled={SNAPSHOT} onSelect={() => runFrom(id)}><Play />{t('Запустить отсюда')}</ContextMenuItem>}
        {runnable && <ContextMenuItem disabled={SNAPSHOT} onSelect={() => runAll()}><Play />{t('Запустить всё')}</ContextMenuItem>}
        {runnable && <ContextMenuSeparator />}
        <ContextMenuItem onSelect={() => expand(id)}><Maximize2 />{t('Развернуть')}</ContextMenuItem>
        {runnable && <ContextMenuItem onSelect={() => showPrompt(id)}><FileText />{t('Показать запрос')}</ContextMenuItem>}
        {result && <ContextMenuSeparator />}
        <ContextMenuItem onSelect={() => copyForAgent(id)}><AgentCopyIcon />{t('Скопировать для агента')}</ContextMenuItem>
        {result && !historical && <ContextMenuItem onSelect={() => save(id)}><BookmarkPlus />{screen ? t('Картинкой в библиотеку') : t('В библиотеку')}</ContextMenuItem>}
        {result && <ContextMenuItem onSelect={() => download(id)}><Download />{screen ? t('Скачать HTML') : getNode(id)?.type === 'image' ? t('Скачать') : t('Скачать .md')}</ContextMenuItem>}
        {result && !historical && (getNode(id)?.data as { designSystem?: string } | undefined)?.designSystem === 'deck' && <ContextMenuItem onSelect={() => downloadPdf(id)}><Download />{t('Скачать PDF')}</ContextMenuItem>}
        <ContextMenuSeparator />
        <ContextMenuItem onSelect={focus}><Eye />{t('Показать на холсте')}</ContextMenuItem>
        <ContextMenuItem onSelect={() => duplicate(id)}><Copy />{t('Дублировать')}</ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem variant="destructive" onSelect={() => void deleteElements({ nodes: [{ id }] })}><Trash2 />{t('Удалить')}</ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}

// Общий каркас ноды (2026-10-27: подпись выбивалась из семьи — без заголовка, без видимого «править», с обрезанным текстом).
// Каркас держит всё одинаковое: меню по правому клику, рамка выбора, уголки, порты, заголовок над рамкой (иконка типа, название,
// справа подпись и инструменты). Нода передаёт только содержимое. Новая нода начинается с него; галерея — страница «Система»
export function NodeFrame({ id, selected, icon: Icon, title, meta, tools, bar, ports, resize, onDoubleClick, className, bodyClassName, ring, children }: {
  id: string; selected?: boolean; icon: LucideIcon; title: React.ReactNode; meta?: React.ReactNode; tools?: React.ReactNode
  bar: React.ReactNode; ports: React.ReactNode; resize: { minWidth: number; minHeight: number; onEnd?: () => void }
  onDoubleClick?: () => void; className?: string; bodyClassName?: string; ring?: string; children: React.ReactNode
}) {
  const { expandedId, collapse, expand } = useContext(CanvasEnv)
  const { getNode } = useReactFlow()
  const nodeData = getNode(id)?.data
  const label = String(nodeData?.title ?? nodeData?.name ?? nodeData?.label ?? t('Нода'))
  const expanded = expandedId === id
  const header = (
      <div className={cn('flex min-w-0 items-center px-1', expanded ? 'h-8 gap-2' : 'absolute bottom-full left-0 right-0 mb-2 gap-1.5')}>
        <Icon className={cn('shrink-0 text-muted-foreground', expanded ? 'size-4' : 'size-3.5')} />
        {title ? <span className={cn('min-w-0 flex-1 truncate', expanded ? 'text-sm font-medium [&_input]:text-sm [&_input]:font-medium [&_input]:normal-case [&_input]:tracking-normal' : 'text-[11px] font-semibold uppercase tracking-[0.06em]')}>{title}</span> : <span className="flex-1" />}
        {meta && <span className="shrink-0 text-[11px] uppercase tracking-[0.06em] text-muted-foreground">{meta}</span>}
        {!expanded && tools}
      </div>
  )
  const content = (
    <NodeMenu id={id}><div data-selected={selected || undefined} className={cn('group/node relative', expanded ? 'flex size-full min-h-0 flex-col gap-2 p-4 pt-16 max-compact:pt-28' : className ?? 'size-full')} onDoubleClick={onDoubleClick}>
      {!expanded && bar}
      {!expanded && <ResizeArcs selected={selected} minWidth={resize.minWidth} minHeight={resize.minHeight} onEnd={resize.onEnd} />}
      {!expanded && ports}
      {!expanded && header}
      <BaseNode className={cn('flex min-h-0 w-full flex-col overflow-hidden rounded-lg', expanded ? 'flex-1' : 'h-full', ring ?? (selected && 'ring-1 ring-port-text'), bodyClassName, !expanded && !['agent', 'screen', 'image', 'card'].includes(String(getNode(id)?.type)) && 'pt-10')}>
        {!expanded && <Tip label={t('Развернуть')}><Button variant="ghost" size="icon-sm" className="nodrag absolute top-3 right-3 z-20 size-8 rounded-lg bg-card/90" aria-label={t('Открыть')} onClick={(event) => { event.stopPropagation(); expand(id) }}><Maximize2 /></Button></Tip>}
        {children}
      </BaseNode>
    </div></NodeMenu>
  )
  if (!expanded) return content
  return <>
    <div aria-hidden className={className ?? 'size-full'} />
    <ViewerShell open onClose={() => collapse?.()} title={label} heading={header} topActions={<>{tools}{bar}</>} description={t('Результат ноды целиком.')}>
      {content}
    </ViewerShell>
  </>
}

// Длинное содержимое прокручивается внутри ноды, снизу затухание — видно, что есть ещё. Колесо мыши прокручивает текст только когда
// есть что прокручивать, иначе оно по-прежнему двигает холст
export function ScrollFade({ className, children }: { className?: string; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const [state, setState] = useState({ over: false, more: false })
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = () => {
      const over = el.scrollHeight > el.clientHeight + 1
      const more = el.scrollHeight - el.scrollTop - el.clientHeight > 4
      setState((prev) => (prev.over === over && prev.more === more ? prev : { over, more }))
    }
    measure()
    const watch = new ResizeObserver(measure)
    watch.observe(el)
    el.addEventListener('scroll', measure, { passive: true })
    return () => { watch.disconnect(); el.removeEventListener('scroll', measure) }
  })
  return <div ref={ref} className={cn('min-h-0 flex-1 overflow-y-auto [scrollbar-width:thin]', state.over && 'nowheel', className)} style={state.more ? { maskImage: 'linear-gradient(to bottom, black calc(100% - 28px), transparent)' } : undefined}>{children}</div>
}

export function CardNode({ id, data, selected }: NodeProps<Node<{ ref: string }>>) {
  const { items, open } = useContext(CanvasEnv)
  const item = items.get(data.ref)
  return (
    <NodeFrame id={id} selected={selected} icon={item?.kind === 'note' ? FileText : Images} title={item ? item.title : t('Материала нет')} resize={{ minWidth: 140, minHeight: 100 }} onDoubleClick={() => item && open(item.id)}
      bar={<NodeActions id={id} selected={selected} open={item ? () => open(item.id) : undefined} />} ports={<PortHandle type="source" port="material" />} bodyClassName="relative p-0">
      {item?.image ? <img src={item.image} alt={item.title} draggable={false} className="absolute inset-0 size-full object-cover" /> : item && (item.kind === 'note' || item.kind === 'article') ? <PaperNote title={item.title} text={item.text} size="full" /> : <span aria-hidden className="absolute inset-0 grid place-items-center bg-muted text-muted-foreground"><Shapes className="size-5" /></span>}
    </NodeFrame>
  )
}

// Рамка-этап как у Weave (2026-10-27): широкая рамка с цветной подложкой и подписью-табом слева сверху; ноды внутри (members) двигаются вместе с ней.
// Цвет — один из приглушённых оттенков (hue — индекс в FRAME_HUES), выбирается точками справа сверху, пока рамка выделена; без hue — нейтральная
export const FRAME_HUES = [150, 100, 230, 300, 30, 0] as const
// Подпись ноды меняется двойным кликом (владелец 2026-10-30): обычное нажатие и перетаскивание двигают ноду, а не ставят курсор
const titleClick = {
  // Фаза захвата: перетаскивание ноды (d3-drag) глушит обычное всплытие нажатия, и обработчик без захвата до нас не доходит — фокус ставился сам
  onMouseDownCapture: (event: React.MouseEvent<HTMLInputElement>) => { if (document.activeElement !== event.currentTarget) event.preventDefault() }, // без фокуса на нажатии нода тащится, курсор не остаётся
  onDoubleClick: (event: React.MouseEvent<HTMLInputElement>) => { event.stopPropagation(); event.currentTarget.focus(); event.currentTarget.select() },
}

export function FrameNode({ id, data, selected }: NodeProps<Node<{ label?: string; hue?: number }>>) {
  const { patch } = useContext(CanvasEnv)
  // Название рамки тащится вместе с рамкой, пока в него не кликнули: тогда фокус и nodrag, иначе рамку не схватить за подпись
  const [typing, setTyping] = useState(false)
  const hue = typeof data.hue === 'number' ? FRAME_HUES[data.hue % FRAME_HUES.length] : undefined
  const tint = (alpha: number, l: number, c: number) => hue === undefined ? undefined : `oklch(${l} ${c} ${hue} / ${alpha})`
  return (
    <NodeMenu id={id}><div data-selected={selected || undefined} style={{ backgroundColor: tint(0.32, 0.3, 0.035), borderColor: tint(0.7, 0.42, 0.05) }}
      className={cn('group/node relative size-full rounded-container border bg-muted/20', selected && 'ring-1 ring-primary')}>
      <ResizeArcs selected={selected} minWidth={160} minHeight={120} />
      <NodeActions id={id} selected={selected} />
      <div style={{ backgroundColor: tint(1, 0.42, 0.06) }} className="absolute -top-10 left-3 inline-grid h-7 max-w-full rounded-md bg-muted">
        <span aria-hidden className="invisible col-start-1 row-start-1 whitespace-pre px-3 text-xs font-medium leading-7">{data.label || t('Название')}</span>
        <Input aria-label={t('Название рамки')} placeholder={t('Название')} value={data.label ?? ''} onChange={(event) => patch(id, { label: event.target.value })} onKeyDown={(event) => { event.stopPropagation(); spaceToPan(event) }} {...titleClick} onFocus={() => setTyping(true)} onBlur={() => setTyping(false)}
          className={cn(typing ? 'nodrag cursor-text' : 'cursor-grab', 'absolute inset-0 h-7 w-full min-w-0 rounded-md border-0 bg-transparent px-3 text-xs font-medium text-foreground shadow-none placeholder:text-muted-foreground/60 focus-visible:ring-1 md:text-xs')} />
      </div>
      {selected && (
        <div className="nodrag absolute -top-9 right-3 flex items-center gap-1.5" role="group" aria-label={t('Цвет рамки')}>
          {FRAME_HUES.map((value, index) => (
            <button key={value + '-' + index} type="button" aria-label={index === FRAME_HUES.length - 1 ? t('Без цвета') : t('Цвет {n}', { n: index + 1 })} aria-pressed={data.hue === index}
              onClick={() => patch(id, { hue: index === FRAME_HUES.length - 1 ? undefined : index })}
              style={{ backgroundColor: index === FRAME_HUES.length - 1 ? 'var(--muted)' : `oklch(0.5 0.08 ${value})` }}
              className={cn('size-3.5 rounded-full border border-line transition-transform hover:scale-125', (data.hue === index || (index === FRAME_HUES.length - 1 && data.hue === undefined)) && 'ring-1 ring-foreground')} />
          ))}
        </div>
      )}
    </div></NodeMenu>
  )
}

export function TextNode({ id, data, selected }: NodeProps<Node<{ text?: string; title?: string; fresh?: boolean }>>) {
  const { patch, remove } = useContext(CanvasEnv)
  const [editing, setEditing] = useState(Boolean(data.fresh))
  const [titleTyping, setTitleTyping] = useState(false) // подпись тащится вместе с нодой, пока в неё не кликнули
  return (
    <NodeFrame id={id} selected={selected} icon={Type} title={(data.title !== undefined || selected) ? <input aria-label={t('Название ноды')} placeholder={t('Название')} value={data.title ?? ''} onChange={(event) => patch(id, { title: event.target.value })} onKeyDown={(event) => { event.stopPropagation(); spaceToPan(event) }} {...titleClick} onFocus={() => setTitleTyping(true)} onBlur={() => setTitleTyping(false)}
        className={cn(titleTyping ? 'nodrag cursor-text' : 'cursor-grab', 'w-full min-w-0 truncate border-0 bg-transparent p-0 text-[11px] font-semibold uppercase tracking-[0.06em] text-foreground outline-none placeholder:text-muted-foreground/60 placeholder:normal-case')} /> : null} resize={{ minWidth: 120, minHeight: 48 }} onDoubleClick={() => setEditing(true)}
      bar={<NodeActions id={id} selected={selected} />} ports={<PortHandle type="source" port="text" />}
      tools={!editing && <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon-xs" className="nodrag" aria-label={t('Править текст')} onClick={() => setEditing(true)}><Pencil /></Button></TooltipTrigger><TooltipContent>{t('Править')}</TooltipContent></Tooltip>}>
      {editing
        ? <Textarea autoFocus aria-label={t('Текст на холсте')} value={data.text ?? ''} onChange={(event) => patch(id, { text: event.target.value, fresh: undefined })} onBlur={() => { setEditing(false); if (!data.text?.trim()) remove(id) }} onKeyDown={(event) => { event.stopPropagation(); spaceToPan(event); if (event.key === 'Escape') setEditing(false) }}
            className="nodrag nowheel size-full min-h-0 flex-1 resize-none rounded-none border-0 bg-transparent p-3 text-body font-normal text-foreground/85 shadow-none md:text-body focus-visible:ring-0 dark:bg-transparent" />
        : <ScrollFade><p className="p-3 text-body font-normal text-foreground/85 whitespace-pre-wrap">{data.text || <span className="text-muted-foreground">{t('Текст')}</span>}</p></ScrollFade>}
    </NodeFrame>
  )
}

// Длинный текст ноды без простыни: вывод (всё до первого заголовка) виден, разделы свёрнуты, по клику раскрываются.
// Нет заголовков — показываем как есть
// Streamdown рисует списки с list-inside: у пункта из нескольких абзацев номер остаётся отдельной строкой, а текст ниже липнет к левому краю.
// В ноде ставим маркер снаружи и отступ слева — абзацы пункта встают под текстом
// Таблицы в узкой ноде: колонки не сжимаются до слова в строке, а получают свою ширину, таблица прокручивается вбок; текст в ячейке сверху
const listFix = '[&_ol]:list-outside [&_ul]:list-outside [&_ol]:pl-5 [&_ul]:pl-5 [&_li>p]:my-1.5 [&_table]:w-max [&_table]:min-w-full [&_td]:min-w-44 [&_th]:min-w-44 [&_td]:max-w-72 [&_td]:align-top [&_td]:text-xs [&_th]:text-xs [&_td]:leading-snug'
export function FoldedResult({ text }: { text: string }) {
  const parts = text.split(/\n(?=#{1,3} )/)
  const hasLead = !/^#{1,3} /.test(parts[0])
  const lead = hasLead ? parts.shift()! : ''
  if (!parts.length) return <MessageResponse className={listFix}>{text}</MessageResponse>
  return (
    <div className="flex flex-col gap-2">
      {lead.trim() && <MessageResponse className={listFix}>{lead}</MessageResponse>}
      {parts.map((part, index) => {
        const [head, ...rest] = part.split('\n')
        return (
          <Collapsible key={index} className="rounded-lg bg-muted/40">
            <CollapsibleTrigger className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-body font-normal [&[data-state=open]>svg]:rotate-180">
              <span className="truncate">{head.replace(/^#+\s*/, '')}</span><ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform" />
            </CollapsibleTrigger>
            <CollapsibleContent className="px-3 pb-2"><MessageResponse className={listFix}>{rest.join('\n')}</MessageResponse></CollapsibleContent>
          </Collapsible>
        )
      })}
    </div>
  )
}

// Старый HTML — без скриптов; собранный React — с JS в отдельном origin, внутри него ещё sandbox и CSP без сети.
// Размер кадра — по метке модели в <body data-screen>: телефон 390×844, иначе веб 1440×900 (старые результаты без метки — веб)
export const screenSize = (html: string): [number, number] => /<body[^>]*data-screen="phone"/i.test(html) ? [390, 844] : [1440, 900]
// maxH — потолок высоты для телефона: число (px) или 'fill' (вся высота родителя); веб по высоте не ограничиваем, как раньше.
// Телефон вписывается целиком и стоит по центру. Страница (лендинг) сообщает свою высоту сама и везде вписывается по ширине: в ноде ('fill') она крутится колесом внутри, в диалоге (число) — прокруткой диалога
export type PickEvent = { info: PickedElement; page: [number, number]; box: DOMRect; scale: number; size: [number, number] }
export function ScaledFrame({ html, maxH, interactive = false, overlay, onPageHeight, commenting = false, onPick, editing = false, onEdited }: { editing?: boolean; onEdited?: (edit: { from: string; to: string }) => void; html: string; maxH?: number | 'fill'; interactive?: boolean; overlay?: React.ReactNode; onPageHeight?: (height: number) => void; commenting?: boolean; onPick?: (event: PickEvent) => void }) {
  // scrollbar-gutter: stable у обёртки страницы — место под полосу занято всегда: иначе её появление сужает обёртку, масштаб и высота меняются,
  // полоса исчезает, и экран дёргается по кругу
  const wrap = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(0.2)
  const page = /<body[^>]*data-screen="page"/i.test(html)
  const [pageH, setPageH] = useState<number | null>(null)
  const [w, baseH] = screenSize(html)
  const h = page ? pageH ?? baseH : baseH
  const [hover, setHover] = useState<PickedElement | null>(null)
  const shownHtml = useMemo(() => withPicker(html), [html])
  const frameOf = () => wrap.current?.querySelector('iframe') ?? null
  // Режим комментария: включаем слежение за мышью внутри экрана и слушаем, что он пришлёт
  useEffect(() => {
    const frame = frameOf()
    const send = () => frame?.contentWindow?.postMessage({ refkitPickMode: commenting }, '*')
    send()
    if (!commenting) { setHover(null); return }
    const again = window.setTimeout(send, 400) // внутренний документ мог ещё не загрузиться
    const listen = (event: MessageEvent) => {
      if (!frame || event.source !== frame.contentWindow) return
      if (event.data?.refkitHover !== undefined) setHover(event.data.refkitHover)
      if (event.data?.refkitPicked && wrap.current) {
        const box = wrap.current.querySelector<HTMLElement>('[data-pick-box]')?.getBoundingClientRect() ?? wrap.current.getBoundingClientRect()
        onPick?.({ info: event.data.refkitPicked, page: event.data.refkitPage ?? [w, h], box, scale, size: [w, h] })
      }
    }
    window.addEventListener('message', listen)
    return () => { window.clearTimeout(again); window.removeEventListener('message', listen) }
  }, [commenting, html, scale, w, h, onPick])
  // Режим правки текста руками: внутри экрана клик по тексту включает редактирование, Enter сохраняет, Esc отменяет
  useEffect(() => {
    const frame = frameOf()
    const send = () => frame?.contentWindow?.postMessage({ refkitEditMode: editing }, '*')
    send()
    if (!editing) return
    const again = window.setTimeout(send, 400)
    const listen = (event: MessageEvent) => { if (frame && event.source === frame.contentWindow && event.data?.refkitEdited) onEdited?.(event.data.refkitEdited) }
    window.addEventListener('message', listen)
    return () => { window.clearTimeout(again); window.removeEventListener('message', listen) }
  }, [editing, html, onEdited])
  const phone = w === 390
  useEffect(() => {
    if (!page) return
    const listen = (event: MessageEvent) => {
      const frame = wrap.current?.querySelector('iframe')
      if (frame && event.source === frame.contentWindow && typeof event.data?.refkitScreenHeight === 'number') { setPageH(event.data.refkitScreenHeight); onPageHeight?.(event.data.refkitScreenHeight) }
    }
    window.addEventListener('message', listen)
    return () => window.removeEventListener('message', listen)
  }, [page])
  useEffect(() => {
    const el = wrap.current
    if (!el) return
    const fit = () => {
      const limit = maxH === undefined || page ? Infinity : !phone ? Infinity : maxH === 'fill' ? el.clientHeight : maxH
      setScale(Math.min(el.clientWidth / w, limit / h))
    }
    const watch = new ResizeObserver(fit)
    watch.observe(el); fit()
    return () => watch.disconnect()
  }, [w, h, phone, page, maxH])
  return (
    <div ref={wrap} className={cn('w-full', (phone || page) && maxH === 'fill' && 'h-full', page && maxH === 'fill' && 'nowheel overflow-y-auto [scrollbar-gutter:stable] [scrollbar-width:thin]')}>
    <div data-pick-box className="relative mx-auto" style={{ width: w * scale, height: h * scale }}>
      <WebPreview className="absolute inset-0 overflow-hidden rounded-md">
        <WebPreviewBody sandbox={html.includes('data-refkit-screen="react"') ? 'allow-scripts' : ''} srcDoc={shownHtml} tabIndex={interactive ? 0 : -1} className={cn('!max-w-none !flex-none', !interactive && !commenting && 'pointer-events-none')} style={{ width: w, height: h, transform: `scale(${scale})`, transformOrigin: 'top left' }} />
      </WebPreview>
      {commenting && hover && (
        <div className="pointer-events-none absolute z-10 rounded-[2px] border border-blue-500 bg-blue-500/10" style={{ left: hover.rect[0] * scale, top: hover.rect[1] * scale, width: hover.rect[2] * scale, height: hover.rect[3] * scale }}>
          <span className="absolute bottom-full left-0 rounded-[2px] bg-blue-500 px-1 text-[10px] leading-4 font-medium text-white">{hover.tag}</span>
        </div>
      )}
      {overlay}
    </div>
    </div>
  )
}

// Стартовый набор умений для цепочки: при первом открытии холста добавляются в «Действия» (если их там нет) и дальше живут там — правятся и импортируются как любые другие
export const PRESETS = [
  { title: t('Правила стиля'), instr: t('Выведи 5–7 коротких правил стиля из этих рефов: что держит единство, что стоит взять, чего избегать. Списком, без вступлений.') },
  { title: t('Концепты'), instr: t('Придумай 3 разных концепта по этим правилам. Нумерованным списком, каждому — название и два предложения.') },
]
export const SCREEN_INSTR = t('Собери главный экран по выбранному концепту из входа на React, наших компонентах и токенах проекта. Без придуманных брендов и значков-искр.')

// Шаблоны цепочек (группа «Шаблоны» в «+»): шаги идут слева направо и соединяются подряд; выделенные карточки, подборки и подписи
// подключаются ко входу первого шага. preset — индекс в PRESETS: шаг связывается с умением из «Действий», если оно там есть.
export type TemplateStage = 'analysis' | 'decision' | 'result'
// refs — шаг тоже получает выбранные рефы (токенам нужны их главные цвета); from — входы от шагов с этими индексами, а не от предыдущего;
// remember — пункты ответа уходят владельцу в «Запомнить?» общей памяти
export type TemplateStep = { type: 'agent' | 'screen' | 'image' | 'choice'; title: string; instr?: string; preset?: number; pick?: boolean; refs?: boolean; from?: number[]; remember?: boolean; stage: TemplateStage }
// Этапы шаблона: рамка вокруг шагов этапа; цвет — индекс в FRAME_HUES (анализ — оливковый, решение — синий, результат — нейтральный)
export const TEMPLATE_STAGES: Record<TemplateStage, { label: () => string; hue?: number }> = { analysis: { label: () => t('Анализ'), hue: 1 }, decision: { label: () => t('Решение'), hue: 2 }, result: { label: () => t('Результат') } }
// graph — шаблон-граф: узлы, связи и рамки берутся из shared/*-template.mjs (параллельные ветки), а не из линейных steps
export const TEMPLATES: { key: string; label: string; hint: string; caption?: [string, string]; steps: TemplateStep[]; graph?: boolean }[] = [
  { key: 'hypothesis', label: t('Проверка гипотезы'), hint: t('идея → рынок → бренд → лендинг → промпт для сборки'), caption: [t('Проверь идею, прежде чем строить.'), t('Конкуренты, сигналы спроса и вердикт с источниками. Слабый вердикт останавливает дорогие шаги; хороший ведёт к брифу, бренду, экранам и промпту для сборки.')], steps: [], graph: true },
  { key: 'landing-reference', label: t('Лендинг из снимков'), hint: t('заметки и снимки → паспорт → направления → текст → страница'), steps: [], graph: true },
  { key: 'product-landing', label: t('Лендинг продукта'), hint: t('факты и снимки → план → куски интерфейса → лендинг → проверка'), steps: [], graph: true },
  { key: 'rules-concepts', label: t('Правила → концепты → экран'), hint: t('правила → концепты → выбор → экран'), steps: [
    { type: 'agent', title: PRESETS[0].title, instr: PRESETS[0].instr, preset: 0, stage: 'analysis' },
    { type: 'agent', title: PRESETS[1].title, instr: PRESETS[1].instr, preset: 1, stage: 'analysis' },
    { type: 'choice', title: t('Выбор концепта'), stage: 'decision' },
    { type: 'screen', title: t('Экран'), instr: SCREEN_INSTR, stage: 'decision' },
  ] },
  { key: 'brand-directions', label: t('Бренд-направления'), hint: t('мудборд → правила → 4 направления → выбор → экран'), caption: [t('Четыре направления из одного мудборда.'), t('Правила стиля из референсов становятся брендовыми направлениями и экраном лендинга, каждый шаг на виду.')], steps: [
    { type: 'agent', title: t('Правила стиля'), instr: t('По мудборду выведи 5–7 коротких правил стиля: что держит эти рефы вместе, что стоит взять, чего избегать. Каждое правило — механика («как сделано»), а не «нравится». Заметку владельца к каждому рефу читай как главный сигнал. Всё из анти-референсов — то, чего избегать: превращай в правила вида «не …». Списком, без вступлений.'), stage: 'analysis' },
    { type: 'agent', title: t('Направления'), instr: t('Придумай 4 по-настоящему разных направления бренда в рамках этих правил и позиционирования. Меняй только то, что ещё открыто: оттенок акцента, характер заголовочного шрифта, скругление углов, композицию hero. Ответ — нумерованный список, один пункт на направление, ровно в такой форме (владелец выбирает по карточке, собранной из полей, поэтому названия полей не менять):\n1. **Короткое имя** — идея одной фразой.\nAccent: #RRGGBB\nPair: ровно одна из этих пар, шрифт заголовка + шрифт текста, у разных направлений пары разные: Newsreader + Hanken Grotesk; Funnel Display + Funnel Sans; Host Grotesk + IBM Plex Mono; Young Serif + Onest; Schibsted Grotesk + Newsreader; Brygada 1918 + Albert Sans; Literata + Familjen Grotesk; Gloock + Public Sans; Atkinson Hyperlegible Next + DM Mono; Libre Caslon Display + Radio Canada Big; Radio Canada Big + Newsreader; Hanken Grotesk + Literata\nHeadline: заголовок hero в голосе направления, до 8 слов\nLayout: одно из centered, split, left (композиция hero: текст по центру над кадром, текст рядом с кадром или крупный текст слева над ним; у разных направлений разная)\nCorners: одно из sharp, soft, pill (скругление кнопок и карточек в этом направлении; у разных направлений разное)\nVerdict: читается ли за 5 секунд, живёт ли знак на 16 px, чем отличается от ближайших продуктов. Другого текста нет.'), stage: 'decision', pick: true },
    { type: 'screen', title: t('Hero направления'), instr: t('Нарисуй hero лендинга 1440×900 в тёмной теме для выбранного направления: графит и один акцент выбранного оттенка на главной кнопке, место под логотип, заголовок, одна строка, одна кнопка и широкая пустая область под кадр продукта. Наши компоненты, без выдуманных брендов и значков-искр.'), stage: 'decision' },
  ] },
  { key: 'brandbook', label: t('Брендбук'), hint: t('бриф и референсы → начертание → цвета и шрифты → брендбук'), caption: [t('От референсов до брендбука.'), t('Выбери начертание, затем палитру и пару шрифтов. Брендбук соберёт голос и применения, а знаком станет первая буква вордмарка.')], steps: [], graph: true },
  { key: 'technique-recipe', label: t('Приём → рецепт'), hint: t('разбор приёма → рецепт в токенах → экран'), caption: [t('Преврати приём в рецепт.'), t('Посмотри, что делают референсы, и получи рецепт в токенах проекта и экран, собранный по нему.')], steps: [
    { type: 'agent', title: t('Разбор приёма'), instr: t('Разбери, на чём держится приём в этих рефах: что именно сделано, сколько шагов, где подсказка и где действие. Начни с вывода в 1–3 предложения.'), stage: 'analysis' },
    { type: 'agent', title: t('Рецепт в токенах'), instr: t('Преврати приём в рецепт для нашего проекта: какие наши компоненты и токены взять, в каком порядке собрать, чего избегать. Нумерованными шагами, без вступлений.'), stage: 'analysis' },
    { type: 'screen', title: t('Экран по рецепту'), instr: t('Собери экран по рецепту из входа на React, наших компонентах и токенах проекта. Без придуманных брендов и значков-искр.'), stage: 'result' },
  ] },
  { key: 'refs-tokens', label: t('Рефы → правила и токены'), hint: t('приёмы → правила стиля → токены → пример экрана → запомнить'), steps: [
    { type: 'agent', title: t('Приёмы'), instr: t('Выпиши 5–7 визуальных приёмов, которые повторяются в этих рефах: цвет, шрифт, сетка и плотность, картинки, форма (скругления, рамки). Что именно сделано и на каких рефах это видно. Тексты и слоганы на рефах не разбирай. Списком, один приём — одно предложение, без оценок вроде «красиво».'), stage: 'analysis' },
    { type: 'agent', title: PRESETS[0].title, instr: PRESETS[0].instr, preset: 0, stage: 'analysis' },
    { type: 'agent', title: t('Токены'), instr: t('Преврати правила в тему экрана. Цвета бери только из «Главных цветов» рефов во входе: фон и текст — из самых частых, акцент — один насыщенный цвет из редких, не серый. Выдай один блок CSS ровно с этими переменными: :root { --background; --foreground; --card; --card-foreground; --primary; --primary-foreground; --secondary; --secondary-foreground; --muted; --muted-foreground; --accent; --accent-foreground; --border; --input; --ring; --radius }. Акцент кладётся в --primary и --ring, а --accent — тихий фон наведения рядом с --muted. Цвета — HEX, --radius — в rem; текст на акценте читается (контраст не ниже 4.5:1). Под блоком одной строкой «Pair: <пара>» — пара шрифтов, ближе всего к характеру рефов, строго из списка:') + ' ' + PAIR_NAMES.join(', ') + '.', refs: true, stage: 'decision' },
    { type: 'screen', title: t('Пример экрана'), instr: t('Собери один типовой экран продукта (список с поиском и одной главной кнопкой), чтобы глазами проверить вкус. Тема из «Токенов» подставится сама: цвета и шрифты вручную не задавай, бери классы темы (bg-primary, text-muted-foreground, border-border); акцент (text-primary или bg-primary) — на одном маленьком элементе: значке, метке, выделении. Без придуманных брендов, значков-искр и градиентов.'), stage: 'result' },
    { type: 'agent', title: t('Запомнить'), instr: t('Сожми правила стиля и токены в 1–2 строки памяти, чтобы агент применил их в любом другом проекте: «В моих интерфейсах: …». Назови фон, акцент HEX и пару шрифтов из токенов. Каждая строка короче 200 знаков, с новой строки через «- », без вступления и примечаний.'), from: [1, 2], remember: true, stage: 'result' },
  ] },
  { key: 'style-image', label: t('Правила стиля → картинка'), hint: t('правила стиля → картинка в этом стиле'), caption: [t('Сначала правила стиля, потом картинка.'), t('Выдели правила из референсов и передай их шагу с картинкой.')], steps: [
    { type: 'agent', title: PRESETS[0].title, instr: PRESETS[0].instr, preset: 0, stage: 'analysis' },
    { type: 'image', title: t('Картинка в стиле'), instr: t('Нарисуй иллюстрацию в духе этих правил: спокойная композиция, один акцентный цвет, без текста на картинке.'), stage: 'result' },
  ] },
  { key: 'collection-gaps', label: t('Сводка → пробелы → шаги'), hint: t('что общего → чего не хватает → что применить'), steps: [
    { type: 'agent', title: t('Что общего'), instr: t('Что общего у этих материалов: 3–5 пунктов — приёмы, паттерны, вкус. Коротко, без вступлений.'), stage: 'analysis' },
    { type: 'agent', title: t('Чего не хватает'), instr: t('Чего в этой подборке не хватает: какие приёмы, примеры и контрасты стоит добавить. Списком до 5 пунктов.'), stage: 'analysis' },
    { type: 'agent', title: t('Что применить'), instr: t('Что из этого применить на этой неделе: три шага, каждый — одно действие в проекте.'), stage: 'result' },
  ] },
  { key: 'compare-choose', label: t('Сравни и выбери'), hint: t('сравнение → выбор → как применить'), caption: [t('Сравни подходы и выбери.'), t('Сравни варианты, выбери один и получи, как его применить.')], steps: [
    { type: 'agent', title: t('Сравнение'), instr: t('Сравни эти материалы по критериям: механика, ясность, плотность, работа акцента. Нумерованным списком, по одному материалу на пункт: название и два предложения о сильных и слабых сторонах.'), stage: 'analysis' },
    { type: 'choice', title: t('Выбор варианта'), stage: 'decision' },
    { type: 'agent', title: t('Как применить'), instr: t('Объясни, как применить выбранный вариант в нашем проекте: 3–5 конкретных шагов.'), stage: 'decision' },
  ] },
]

export type AgentUsage = { input?: number; output?: number; cached?: number; seconds?: number }
export type AgentData = { held?: boolean; actions?: string[]; autoPick?: boolean; activeAt?: number; productName?: string; comments?: CardComment[]; imageFile?: string; brandMonogram?: boolean; sized?: boolean; fit?: boolean; context?: Array<{ kind: 'card' | 'text' | 'result' | 'group'; id?: string; image?: string; images?: string[]; label: string }>; inputRefs?: string[]; history?: Array<{ result?: string; imageFile?: string; ranAt?: number }>; title?: string; instr?: string; status?: string; result?: string; error?: string; ranAt?: number; stale?: boolean; estimateK?: number; estimateMin?: number; modelLabel?: string; inputNames?: string[]; usage?: AgentUsage[]; pick?: boolean; choice?: number; items?: string[]; needsChoice?: string }
// Состояние ноды для строки и индикатора: общее у компактной ноды и у панели результата
export function agentState(data: AgentData) {
  const status = data.status ?? 'idle'
  const running = status === 'running'
  const inputs = data.inputNames ?? []
  const again = status === 'ready' || status === 'error'
  const pending = status === 'pending'
  const pill = running ? t('работает…') : pending ? t('в очереди') : status === 'error' ? t('ошибка') : ''
  const tip = running ? t('Остановить') : !inputs.length ? t('Подключи слева карточки, подписи или другие ноды') : t('{run} · ≈ {k} тыс. токенов · ~{min} мин', { run: again ? t('Перезапуск') : t('Запуск'), k: data.estimateK ?? '—', min: data.estimateMin ?? 1 })
  const indicator: NodeStatus = running ? 'loading' : status === 'error' ? 'error' : status === 'ready' && !data.stale ? 'success' : 'initial'
  const last = (data.usage ?? []).at(-1)
  const footerLine = last ? t('Входы: {n} · {k} тыс. токенов · {s} с', { n: inputs.length, k: Math.round(((last.input ?? 0) + (last.output ?? 0)) / 1000), s: last.seconds ?? '—' }) : inputs.length ? t('Входы: {n} · ≈ {k} тыс. токенов', { n: inputs.length, k: data.estimateK ?? '—' }) : t('Нет входов')
  return { status, running, inputs, again, pill, tip, indicator, footerLine, blocked: !running && (pending || !inputs.length || Boolean(data.needsChoice)), pending }
}

// Агентная нода — как в Magnific: инструкция, результат и круглая кнопка запуска прямо в ноде, порты цветные по типу (материал — янтарный, текст — синий).
// Запуск — только кнопкой владельца (⌘ ↵ в поле тоже запускает; Enter — перенос строки)
// «В контексте»: миниатюры 24 px в одну строку, крутится вбок. Затухание только у того края, куда ещё есть что крутить
type ContextItem = NonNullable<AgentData['context']>[number]
function ContextStrip({ items }: { items: ContextItem[] }) {
  const row = useRef<HTMLDivElement>(null)
  const [edge, setEdge] = useState({ start: false, end: false })
  const measure = () => {
    const node = row.current
    if (node) setEdge({ start: node.scrollLeft > 1, end: node.scrollLeft + node.clientWidth < node.scrollWidth - 1 })
  }
  useEffect(() => {
    measure()
    const node = row.current
    if (!node || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(measure)
    observer.observe(node)
    return () => observer.disconnect()
  }, [items.length])
  const fade = (on: boolean) => on ? 'transparent' : '#000'
  const mask = `linear-gradient(90deg, ${fade(edge.start)}, #000 20px, #000 calc(100% - 20px), ${fade(edge.end)})`
  return (
    <div ref={row} onScroll={measure} style={{ maskImage: mask, WebkitMaskImage: mask }}
      className={cn('nodrag nowheel ml-auto flex min-w-0 items-center gap-1 overflow-x-auto rounded-lg [scrollbar-width:none] [&::-webkit-scrollbar]:hidden', items.length > 0 && 'bg-muted/40 p-1')} role="list" aria-label={t('В контексте')}>
      {items.map((item, index) => <Tooltip key={index}><TooltipTrigger asChild>{item.image
        ? <img role="listitem" src={item.image} alt={item.label} draggable={false} className="size-6 shrink-0 rounded-control object-cover" />
        : item.kind === 'group'
          ? <span role="listitem" aria-label={item.label} className="relative size-6 shrink-0">{(item.images ?? []).slice(0, 3).map((src, at) => <img key={at} src={src} alt="" draggable={false} className="absolute size-4 rounded-sm border border-card object-cover" style={{ left: at * 4, top: at * 4 }} />)}</span>
          : <span role="listitem" aria-label={item.label} className="grid size-6 shrink-0 place-items-center rounded-control bg-muted text-muted-foreground">{item.kind === 'text' ? <Type className="size-3.5" /> : <FileText className="size-3.5" />}</span>}</TooltipTrigger><TooltipContent>{item.label}</TooltipContent></Tooltip>)}
    </div>
  )
}

export function AgentNode({ id, data, selected, type }: NodeProps<Node<AgentData>>) {
  // Поля тащатся вместе с нодой, пока в них не печатаешь: клик ставит фокус (и только тогда nodrag), иначе за любое место ноды её можно двигать
  const [typing, setTyping] = useState<'title' | 'instr' | null>(null)
  const { fitHeight, patch, run, stop, addNext, outgoing, models, defaultModel, activate, refine, runAfter, addInput, commenting, apply, editText } = useContext(CanvasEnv)
  const expanded = useContext(CanvasEnv).expandedId === id
  const [zoomed, setZoomed] = useState(false)
  const [editingScreen, setEditingScreen] = useState(false)
  const [compose, setCompose] = useState<PickEvent | null>(null)
  useEffect(() => { if (!commenting) setCompose(null) }, [commenting])
  const screen = type === 'screen'
  const image = type === 'image'
  const { status, running, again, pill, tip, blocked } = agentState(data)
  // Одна поверхность, как у Magnific: на карточке либо результат (главное), либо инструкция — переключатель в левом верхнем углу.
  // Сверху чипы входов, снизу только модель, версии и круглая кнопка запуска; всё остальное — в панели над выбранной нодой
  const past = data.history ?? []
  const total = past.length + 1
  const [view, setView] = useState<'result' | 'instr' | null>(null)
  useEffect(() => { setView(null) }, [data.ranAt, running])
  // Показанная версия и есть текущая: стрелки меняют activeAt, и дальше по цепочке идёт именно она
  const at = typeof data.activeAt === 'number' && data.activeAt < total - 1 ? data.activeAt : total - 1
  const old = at < total - 1
  const shown: { result?: string; imageFile?: string } = old ? past[at] : { result: data.result, imageFile: data.imageFile }
  const waiting = Boolean(data.needsChoice && !old)
  const hasResult = !waiting && Boolean(shown.result || shown.imageFile)
  // Режим pick: результат читается как список вариантов, владелец отмечает один, дальше идёт только он; у прошлой версии отметка недоступна
  const pickItems = data.pick && shown.result ? (old ? splitItems(shown.result) : (data.items ?? splitItems(shown.result))) : []
  const mode = view ?? (hasResult || waiting || running || status === 'error' ? 'result' : 'instr')
  // Нода из шаблона (fit) облегает свой результат: высота подбирается под содержимое, без прокрутки внутри и без ручного растягивания;
  // потянул размер руками — нода выходит из автоподбора (fit: false). Следим за размером содержимого: у экрана-страницы высота приходит позже
  const resultRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = resultRef.current
    if (expanded || !data.fit || !el || mode !== 'result' || running || !hasResult || image || old) return
    const measure = () => {
      const scroller = el.scrollHeight > el.clientHeight + 1 ? el : el.querySelector<HTMLElement>('.overflow-y-auto') ?? el
      const node = el.closest<HTMLElement>('.react-flow__node')
      let extra = scroller.scrollHeight - scroller.clientHeight
      // Контента меньше окна — нода подтягивается к нему (scrollHeight меньше clientHeight не бывает, поэтому считаем по детям)
      if (extra <= 4 && scroller === el) {
        const css = getComputedStyle(el), natural = [...el.children].reduce((sum, child) => sum + (child as HTMLElement).offsetHeight, 0) + parseFloat(css.paddingTop) + parseFloat(css.paddingBottom)
        if (natural > 0 && natural < el.clientHeight - 24) extra = natural - el.clientHeight
      }
      // Потолок, чтобы длинный ответ не растягивал ноду на тысячи пикселей: текст — 720, страница экрана — 3000; дальше обычная прокрутка внутри
      if (node && Math.abs(extra) > 4) fitHeight(id, Math.min(node.offsetHeight + extra, screen ? 3000 : 720))
    }
    const watch = new ResizeObserver(measure)
    watch.observe(el); if (el.firstElementChild) watch.observe(el.firstElementChild)
    measure()
    return () => watch.disconnect()
  }, [expanded, data.fit, mode, running, hasResult, shown.result, image, old, id, fitHeight])
  const ring = status === 'error' ? 'ring-2 ring-destructive' : running ? 'ring-2 ring-port-text animate-pulse' : selected ? 'ring-1 ring-port-text' : ''
  const body = (
    <>
      <div className={cn("flex items-center gap-2 px-3 pt-3", !expanded && "pr-14")}>
        {/* Как у Magnific: таблетка «Промт | Результат» (сначала промт), круглая «+» добавить в контекст, дальше миниатюры того, что реально в контексте */}
        <div className="flex h-8 shrink-0 items-center gap-0.5 rounded-lg bg-muted/60 p-0.5" role="tablist" aria-label={t('Что показывать')}>
          <Button variant={mode === 'instr' ? 'secondary' : 'ghost'} size="icon-xs" className="nodrag rounded-lg" role="tab" aria-selected={mode === 'instr'} aria-label={t('Инструкция')} onClick={() => setView('instr')}><Pencil /></Button>
          <Button variant={mode === 'result' ? 'secondary' : 'ghost'} size="icon-xs" className="nodrag rounded-lg" role="tab" aria-selected={mode === 'result'} aria-label={t('Результат')} onClick={() => setView('result')}>{screen ? <PanelTop /> : image ? <ImageIcon /> : <FileText />}</Button>
        </div>
        <span className="min-w-0 flex-1" />
        {total > 1 && !running && (
          <div className="flex h-8 shrink-0 items-center gap-0.5 rounded-lg bg-muted/60 px-0.5">
            <Button variant="ghost" size="icon-xs" className="nodrag size-7 rounded-md" aria-label={t('Прошлая версия')} disabled={at === 0} onClick={() => activate(id, at - 1)}><ChevronLeft /></Button>
            <span className="min-w-8 text-center text-xs tabular-nums text-muted-foreground">{at + 1}/{total}</span>
            <Button variant="ghost" size="icon-xs" className="nodrag size-7 rounded-md" aria-label={t('Следующая версия')} disabled={!old} onClick={() => activate(id, at + 1)}><ChevronRight /></Button>
          </div>
        )}
        {(screen || image) && !running && !old && Boolean(data.comments?.length) && <Button size="xs" className="nodrag shrink-0 rounded-lg" onClick={() => apply(id)}>{t('Применить ({n})', { n: data.comments!.length })}</Button>}
        {expanded && mode === 'result' && screen && hasResult && !old && <Tip label={t('Править текст')}><Button variant={editingScreen ? 'secondary' : 'ghost'} size="icon-sm" aria-label={t('Править текст')} aria-pressed={editingScreen} onClick={() => setEditingScreen(!editingScreen)}><Type /></Button></Tip>}
        {expanded && mode === 'result' && image && hasResult && <Tip label={zoomed ? t('Вписать') : t('Увеличить')}><Button variant="ghost" size="icon-sm" aria-label={zoomed ? t('Вписать') : t('Увеличить')} onClick={() => setZoomed(!zoomed)}>{zoomed ? <ZoomOut /> : <ZoomIn />}</Button></Tip>}
        {/* В контексте: всё подключённое одной строкой с прокруткой вбок. Картинка — миниатюра (название по наведению), текст и результат ноды — иконка с названием. «+» стоит в правом углу и не прячется при прокрутке */}
      </div>
      <div className="relative min-h-0 flex-1 px-3 pt-3 pb-1">
        {mode === 'result' ? (
          <div ref={resultRef} className={cn('nowheel min-h-16 overflow-auto text-body font-normal text-foreground/85', 'h-full', !screen && !image && 'rounded-md bg-background/60 p-3')}>
            {running ? <Shimmer>{t('Работает над ответом…')}</Shimmer>
              : status === 'error' ? <p className="text-destructive">{data.error ?? t('Запуск не удался')}</p>
              : hasResult ? (screen
                ? <><ScaledFrame key={at} html={shown.result!} maxH="fill" interactive={expanded && !commenting && !editingScreen} editing={expanded && editingScreen && !old} onEdited={(edit) => editText?.(id, edit.from, edit.to)} commenting={commenting && !old && !editingScreen} onPick={(event) => setCompose(event)} overlay={!old && data.comments?.some((item) => item.x !== undefined) ? <PinLayer comments={data.comments} active={false} onHover={() => {}} onSave={() => {}} onCancel={() => {}} /> : undefined} />
                  {compose && (
                    <CommentComposer left={compose.box.left + (compose.info.rect[0] + compose.info.rect[2] / 2) * compose.scale + 12} top={compose.info.rect[3] * compose.scale < 80 ? compose.box.top + (compose.info.rect[1] + compose.info.rect[3]) * compose.scale + 8 : compose.box.top + compose.info.rect[1] * compose.scale + 8}
                      label={`${compose.info.tag}${compose.info.text ? ` · ${compose.info.text.slice(0, 40)}` : ''}`} onCancel={() => setCompose(null)}
                      onSave={(text) => { patch(id, { comments: [...(data.comments ?? []), { id: `c-${Date.now()}`, text, at: Date.now(), x: Math.min(1, (compose.info.rect[0] + compose.info.rect[2] / 2) / compose.size[0]), y: Math.min(1, compose.info.rect[1] / compose.size[1]), h: compose.size[1], el: compose.info }] }); setCompose(null) }} />
                  )}</>
                : image && shown.imageFile
                  ? <div className={cn('relative mx-auto w-fit', expanded && zoomed ? '' : 'h-full max-w-full')}><img src={shown.imageFile} alt={data.title ?? t('Картинка')} className={cn(expanded && zoomed ? 'block max-w-none rounded-md' : 'block h-full w-auto max-w-full rounded-md object-contain', data.brandMonogram ? 'bg-white' : 'bg-background/60')} />{!old && <PinLayer comments={data.comments ?? []} active={commenting} onHover={() => {}} onCancel={() => {}} onSave={(text, x, y) => patch(id, { comments: [...(data.comments ?? []), { id: `c-${Date.now()}`, text, at: Date.now(), x, y }] })} />}</div>
                  : data.pick && pickItems.length >= 2
                    ? <VariantList nodeId={id} items={pickItems} choice={data.choice ?? (data.autoPick ? 0 : undefined)} old={old} busy={running} product={data.productName} canRedo onChoose={(index) => patch(id, { choice: index })} />
                    : <FoldedResult text={shown.result!} />)
              : <p className="text-muted-foreground">{waiting ? t('Ожидает выбора в ноде «{name}»', { name: data.needsChoice! }) : t('Результата ещё нет. Напиши инструкцию и запусти.')}</p>}
          </div>
        ) : (
          <Textarea aria-label={t('Инструкция')} value={data.instr ?? ''} placeholder={image ? t('Опиши картинку, которую нужно нарисовать. Подключённые картинки — референсы приёма и стиля. ⌘↵ — запустить.') : screen ? t('Опиши экран, который нужно нарисовать по подключённым входам. ⌘↵ — запустить.') : t('Агент — твой помощник по материалам: напиши, что сделать с подключёнными входами (например, «выведи 5 правил стиля из этих рефов»). ⌘↵ — запустить.')} onChange={(event) => patch(id, { instr: event.target.value })}
            onKeyDown={(event) => { event.stopPropagation(); spaceToPan(event); if (event.key === 'Enter' && (event.metaKey || event.ctrlKey) && !running && !blocked) run(id) }}
            onClick={(event) => event.currentTarget.focus()} onFocus={() => setTyping('instr')} onBlur={() => { setTyping(null); const clean = (data.instr ?? '').trimEnd(); if (clean !== data.instr) patch(id, { instr: clean }) }}
            className={cn(typing === 'instr' ? 'nodrag nowheel' : 'cursor-grab', 'resize-none rounded-md border-0 bg-background/60 p-3 text-body font-normal text-foreground/85 shadow-none md:text-body focus-visible:ring-0 dark:bg-background/60', 'h-full')} />
        )}
      </div>
      {/* Страж на вердикте: слабая идея остановила запуск, дорогие шаги ниже не запускались; владелец решает продолжать ли */}
      {data.held && !running && (
        <div className="mx-3 mb-2 flex items-center gap-2 rounded-lg bg-muted/60 p-2 text-xs">
          <span className="min-w-0 flex-1">{t('Слабая идея: дальше не запускал, чтобы не тратить на неё макеты и страницу.')}</span>
          <Button size="xs" className="nodrag shrink-0 rounded-md" disabled={SNAPSHOT} onClick={() => runAfter(id)}>{t('Продолжить всё равно')}</Button>
        </div>
      )}
      {/* Подсказки к действиям: что агент предлагает сделать с этим результатом; нажатие перезапускает ноду с уточнением, прошлая версия остаётся в истории */}
      {!running && !old && mode === 'result' && Boolean(data.actions?.length) && (
        <div className="flex flex-wrap gap-1.5 px-3 pb-2" role="group" aria-label={t('Что сделать дальше')}>
          {data.actions!.map((action) => <Button key={action} variant="secondary" size="xs" className="nodrag h-7 max-w-full rounded-lg text-xs font-normal" onClick={() => refine(id, action)}><span className="truncate">{action}</span></Button>)}
        </div>
      )}
      <div className="@container/foot flex items-center gap-1.5 px-3 pb-3">
        <ContextStrip items={data.context ?? []} />
        <Button variant="ghost" size="icon-sm" className="nodrag size-8 shrink-0 rounded-lg bg-muted/60 [&_svg]:size-4" aria-label={t('Добавить в контекст')} onClick={() => addInput(id)}><Plus /></Button>
        <span className="min-w-0 flex-1" />
        {!image && <Select value={(data as { model?: string }).model ?? 'default'} onValueChange={(value) => patch(id, { model: value === 'default' ? undefined : value })}>
          <SelectTrigger aria-label={t('Модель ноды')} size="sm" className="nodrag h-7 max-w-[160px] shrink-0 gap-1 rounded-lg border-0 bg-muted/60 px-3 text-xs shadow-none"><SelectValue>{data.modelLabel ?? t('Модель')}</SelectValue></SelectTrigger>
          <SelectContent align="start">
            <SelectItem className="text-xs" value="default">{t('По умолчанию')}{defaultModel ? ` · ${defaultModel}` : ''}</SelectItem>
            {models.map((model) => <SelectItem className="text-xs" key={model.key} value={model.key}>{model.label}</SelectItem>)}
          </SelectContent>
        </Select>}
        {screen && <Select value={['fluid', 'landing'].includes(String((data as { designSystem?: string }).designSystem)) ? String((data as { designSystem?: string }).designSystem) : 'shadcn'} disabled={running} onValueChange={(value) => patch(id, { designSystem: value })}>
          <SelectTrigger aria-label={t('Компоненты экрана')} size="sm" className="nodrag h-7 min-w-0 shrink gap-1 rounded-lg border-0 bg-muted/60 px-3 text-xs shadow-none"><SelectValue /></SelectTrigger>
          <SelectContent align="start">
            <SelectItem className="text-xs" value="shadcn">shadcn</SelectItem>
            <SelectItem className="text-xs" value="fluid">Fluid</SelectItem>
            <SelectItem className="text-xs" value="landing">{t('Секции лендинга')}</SelectItem>
          </SelectContent>
        </Select>}
        <Tooltip><TooltipTrigger asChild>
          <span className="inline-flex"><Button size="icon" className={cn('nodrag size-8 rounded-lg', running && 'border-2 border-port-text bg-transparent text-port-text hover:bg-transparent')} aria-label={running ? t('Остановить') : again ? t('Перезапустить') : t('Запустить')} disabled={blocked || SNAPSHOT} onClick={() => (running ? stop(id) : run(id))}>{running ? <Square /> : <Play />}</Button></span>
        </TooltipTrigger><TooltipContent>{tip} <Kbd>⌘ ↵</Kbd></TooltipContent></Tooltip>
      </div>
    </>
  )
  // Четыре угла — растянуть или уменьшить (как у заметки); без растягивания нода квадратная 320 px, размер запоминается за нодой
  return (
    <NodeFrame id={id} selected={selected} icon={screen ? PanelTop : image ? ImageIcon : Bot} ring={ring}
      title={<Input aria-label={t('Название ноды')} value={data.title ?? ''} onChange={(event) => patch(id, { title: event.target.value })} onKeyDown={(event) => { event.stopPropagation(); spaceToPan(event) }} {...titleClick} onFocus={() => setTyping('title')} onBlur={() => { setTyping(null); const clean = (data.title ?? '').trimEnd(); if (clean !== data.title) patch(id, { title: clean }) }}
        className={cn(typing === 'title' ? 'nodrag cursor-text' : 'cursor-grab', 'h-6 min-w-0 flex-1 rounded-control border-0 bg-transparent px-1 text-[11px] font-semibold uppercase tracking-[0.06em] shadow-none md:text-[11px] hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:ring-0 dark:bg-transparent')} />}
      meta={(data.needsChoice || pill) && <span className={cn(data.stale && 'font-medium text-foreground', status === 'error' && 'text-destructive')}>{data.needsChoice ? t('ждёт «{name}»', { name: data.needsChoice }) : pill}</span>}
      className={cn('min-h-[200px] min-w-[240px]', data.sized ? 'size-full' : 'h-[320px] w-[320px]')} bodyClassName="gap-0 p-0"
      resize={{ minWidth: 240, minHeight: 200, onEnd: () => patch(id, { sized: true, fit: false }) }}
      bar={<NodeBar id={id} selected={selected} runnable hasOut hasResult={hasResult} screen={screen} />}
      ports={<><PortHandle type="target" port="material" /><PortHandle type="source" port={screen ? 'screen' : image ? 'image' : 'text'} add={outgoing.has(id) ? undefined : () => addNext(id)} /></>}>
      {body}
    </NodeFrame>
  )
}


// Нода «Подборка» — папка или подборка целиком как один вход для действий: на холст не раскладываются десятки карточек, состав читает сервер при запуске.
// Вид как у List в Magnific: название над нодой, внутри квадратные плитки состава с прокруткой, при наведении снизу маленькая таблетка
// («Открыть», «На холст»), нижняя панель плавает поверх сетки. Подписей у кнопок нет — иконки понятны сами
export function GroupNode({ id, data, selected }: NodeProps<Node<{ groupKind?: string; name?: string; count?: number; sized?: boolean; view?: 'grid' | 'list'; filter?: string; key?: string; asAssets?: boolean; open?: boolean; members?: Array<{ id: string; title: string; image?: string; text?: string; node?: string; kind?: string; cat?: string }> }>>) {
  const { addNext, outgoing, open, placeCard, patch, addToFolder, ungroup, toggleList, removeFromGroup } = useContext(CanvasEnv)
  const only = data.filter ?? 'all'
  const members = (data.members ?? []).filter((item) => only === 'all' || item.cat === only)
  const list = data.view === 'list'
  // На дальнем плане действия по наведению не показываем: они не масштабируются вместе с нодой, мимо них легко попасть в карточку
  const zoom = useStore((state) => state.transform[2])
  const expanded = useContext(CanvasEnv).expandedId === id
  const [gridElement, setGridElement] = useState<HTMLUListElement | null>(null)
  const [mosaic, setMosaic] = useState<MosaicBox[]>([])
  const memberKey = members.map((item) => `${item.id}:${item.image ?? ''}`).join('|')
  useEffect(() => {
    const el = gridElement
    if (!el || list || !members.length) return
    const measure = () => {
      const css = getComputedStyle(el)
      const width = el.clientWidth - parseFloat(css.paddingLeft) - parseFloat(css.paddingRight)
      const height = el.clientHeight - parseFloat(css.paddingTop) - parseFloat(css.paddingBottom)
      const ratios = [...el.children].map((item) => {
        const img = item.querySelector('img')
        return img?.naturalWidth && img.naturalHeight ? img.naturalWidth / img.naturalHeight : 1
      })
      const next = materialMosaic(ratios, width, height, parseFloat(css.gap) || 0).map((box) => ({ ...box, left: box.left + parseFloat(css.paddingLeft), top: box.top + parseFloat(css.paddingTop) }))
      setMosaic((previous) => JSON.stringify(previous) === JSON.stringify(next) ? previous : next)
    }
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    el.addEventListener('load', measure, true)
    measure()
    return () => { observer.disconnect(); el.removeEventListener('load', measure, true) }
  }, [gridElement, list, data.open, memberKey])
  const low = !expanded && zoom < 0.6
  const isList = data.groupKind === 'list'
  // Кнопки плитки (Solar): открыть — «развернуть» в рамке, на холст — квадрат со стрелкой ↗, убрать — крестик в рамке; все по 14 px, убрать — крестик (из папки, подборки или списка)
  const tool = expanded ? 'nodrag rounded-lg [&_svg]:size-4' : 'nodrag size-[18px] rounded-md [&_svg]:size-[14px]'
  const pill = (item: { id: string; title: string }, className: string) => low ? null : (
    <span className={cn('flex items-center rounded-lg bg-background', expanded ? 'gap-1 p-1' : 'gap-px p-0.5', className)}>
      {!isList && <Tip label={t('Открыть')}><Button variant="ghost" size={expanded ? 'icon' : 'icon-xs'} className={tool} aria-label={t('Открыть: {title}', { title: item.title })} onClick={() => open(item.id)}><Expand /></Button></Tip>}
      {!isList && <Tip label={t('На холст')}><Button variant="ghost" size={expanded ? 'icon' : 'icon-xs'} className={tool} aria-label={t('На холст: {title}', { title: item.title })} onClick={() => placeCard(id, item.id)}><SquareArrowUpRight /></Button></Tip>}
      <Tip label={t('Убрать')}><Button variant="ghost" size={expanded ? 'icon' : 'icon-xs'} className={tool} aria-label={t('Убрать: {title}', { title: item.title })} onClick={() => removeFromGroup(id, item.id)}><SquareX /></Button></Tip>
    </span>
  )
  const round = 'nodrag size-7 rounded-lg bg-background hover:bg-background/70 [&_svg]:size-3.5'
  // Развёрнутый список — рамка под своими участниками: название, свернуть, разобрать и общий выход
  if (isList && data.open && !expanded) return (
    <NodeMenu id={id}><div data-selected={selected || undefined} className={cn('group/node relative size-full rounded-container border bg-muted/20', selected && 'border-primary ring-1 ring-primary')}>
      <NodeBar id={id} selected={selected} hasOut />
      <div className="absolute top-2 left-3 flex items-center gap-1.5 text-xs text-muted-foreground">
        <Layers className="size-4" /><span className="max-w-48 truncate text-sm font-medium text-foreground">{data.name ?? t('Список')}</span>
        <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon-xs" className="nodrag" aria-label={t('Свернуть список')} onClick={() => toggleList(id)}><Minimize2 /></Button></TooltipTrigger><TooltipContent>{t('Свернуть в плитки')}</TooltipContent></Tooltip>
        <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon-xs" className="nodrag" aria-label={t('Разобрать список')} onClick={() => ungroup(id)}><Ungroup /></Button></TooltipTrigger><TooltipContent>{t('Разобрать список')}</TooltipContent></Tooltip>
      </div>
      <PortHandle type="source" port="material" add={outgoing.has(id) ? undefined : () => addNext(id)} />
    </div></NodeMenu>
  )
  const controls = (<>
          {data.groupKind === 'folder' && <Button variant="ghost" size="icon-sm" className={round} aria-label={t('Добавить материал в папку')} onClick={() => addToFolder(String(data.key ?? ''))}><Plus /></Button>}
          {!isList && <>
          <Tooltip><TooltipTrigger asChild><Button variant={data.asAssets ? 'secondary' : 'ghost'} size="icon-sm" className={round} aria-label={t('Картинки для страницы')} aria-pressed={Boolean(data.asAssets)} onClick={() => patch(id, { asAssets: !data.asAssets || undefined })}><Images /></Button></TooltipTrigger><TooltipContent>{data.asAssets ? t('Картинки для страницы: вшиваются в экран') : t('Отдавать как картинки для страницы')}</TooltipContent></Tooltip>
          <Select value={only} onValueChange={(value) => patch(id, { filter: value === 'all' ? undefined : value })}>
            <SelectTrigger aria-label={t('Какие материалы показывать и отдавать действиям')} size="sm" className="nodrag h-7 gap-1 rounded-lg border-0 bg-background px-3 text-xs shadow-none"><SelectValue /></SelectTrigger>
            <SelectContent align="start">
              <SelectItem value="all">{t('Все')}</SelectItem>
              <SelectItem value="image">{t('Картинки')}</SelectItem>
              <SelectItem value="video">{t('Видео')}</SelectItem>
              <SelectItem value="article">{t('Статьи')}</SelectItem>
              <SelectItem value="note">{t('Заметки')}</SelectItem>
            </SelectContent>
          </Select>
          </>}
          {!expanded && <span className="flex-1" />}
          {isList && <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon-sm" className={round} aria-label={t('Развернуть список')} onClick={() => toggleList(id)}><Maximize2 /></Button></TooltipTrigger><TooltipContent>{t('Развернуть: ноды внутри станут видны и живы')}</TooltipContent></Tooltip>}
          {data.groupKind === 'list' && <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon-sm" className={round} aria-label={t('Разобрать список')} onClick={() => ungroup(id)}><Ungroup /></Button></TooltipTrigger><TooltipContent>{t('Разобрать список')}</TooltipContent></Tooltip>}
          <div className="nodrag flex gap-0.5 rounded-lg bg-background p-0.5" role="group" aria-label={t('Вид состава')}>
            <Button variant={list ? 'secondary' : 'ghost'} size="icon-xs" className="size-6 rounded-lg [&_svg]:size-3.5" aria-pressed={list} aria-label={t('Список')} onClick={() => patch(id, { view: 'list' })}><ListIcon /></Button>
            <Button variant={list ? 'ghost' : 'secondary'} size="icon-xs" className="size-6 rounded-lg [&_svg]:size-3.5" aria-pressed={!list} aria-label={t('Сетка')} onClick={() => patch(id, { view: 'grid' })}><LayoutGrid /></Button>
          </div>

  </>)
  return (
    <NodeFrame id={id} selected={selected} icon={data.groupKind === 'folder' ? FolderOpen : Layers} title={data.name ?? (data.groupKind === 'list' ? t('Список') : t('Подборка'))}
      className={cn('min-h-[200px] min-w-[240px]', data.sized ? 'size-full' : 'h-[400px] w-[400px]')} bodyClassName="relative p-0"
      resize={{ minWidth: 240, minHeight: 200, onEnd: () => patch(id, { sized: true, fit: false }) }}
      bar={<NodeBar id={id} selected={selected} hasOut />}
      ports={<PortHandle type="source" port="material" add={outgoing.has(id) ? undefined : () => addNext(id)} />}>
        {members.length > 0 && (
          <ul ref={setGridElement} className={cn('nowheel size-full min-h-0 overflow-auto p-2 [scrollbar-width:thin]', !expanded && 'pb-14', list ? 'flex flex-col gap-1.5' : 'relative block gap-2')} aria-label={t('Состав')}>
            {members.map((item, index) => list ? (
              <li key={item.id} className="flex shrink-0 items-center gap-2 rounded-md bg-muted/50 p-1.5">
                <span className="size-9 shrink-0 overflow-hidden rounded-lg bg-muted">{item.image && <img src={item.image} alt="" loading="lazy" draggable={false} className="size-full object-cover" />}</span>
                <span className="min-w-0 flex-1 truncate text-xs">{item.title}</span>
                {pill(item, '')}
              </li>
            ) : (
              <li key={item.id} style={mosaic[index]} className="group/thumb absolute min-h-0 min-w-0 overflow-hidden rounded-md bg-muted/50">
                <span className="flex size-full items-center justify-center overflow-hidden rounded-sm bg-muted">
                  {item.image ? <img src={item.image} alt={item.title} loading="lazy" draggable={false} className="block size-full object-contain" /> : <span className="flex size-full items-center p-2 text-[10px] leading-tight text-muted-foreground"><span className="line-clamp-4">{item.text ?? item.title}</span></span>}
                </span>
                {pill(item, 'absolute bottom-3 left-1/2 -translate-x-1/2 opacity-0 transition-opacity group-hover/thumb:opacity-100 focus-within:opacity-100')}
              </li>
            ))}
          </ul>
        )}
        {!expanded && <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center gap-1.5 bg-gradient-to-t from-card via-card/85 to-transparent px-2 pt-8 pb-2 [&>*]:pointer-events-auto">{controls}</div>}
    </NodeFrame>
  )
}
export const plural = (n: number) => (form(n) === 'one' ? t('материал') : form(n) === 'few' ? t('материала') : t('материалов'))

// Нода «Выбор» — отдельное действие человека: показывает варианты из ноды слева, владелец отмечает один, дальше идёт только он. Модель не зовёт, ничего не стоит
// Список вариантов с выбором одного: общий для ноды «Выбор» и для агентной ноды в режиме pick. Направления бренда рисуются мини-hero, остальное текстом
export function VariantList({ nodeId, items, choice, old, busy, product, onChoose, canRedo }: { nodeId: string; items: string[]; choice?: number; old: boolean; busy: boolean; product?: string; onChoose: (index: number) => void; canRedo: boolean }) {
  const { redoItem, expandedId } = useContext(CanvasEnv)
  return (
    <RadioGroup value={!old && choice !== undefined ? String(choice) : ''} onValueChange={(value) => { if (!old) onChoose(Number(value)) }} className={cn('nodrag nowheel min-h-0 flex-1 content-start gap-1.5 overflow-auto', expandedId === nodeId && items.some((item) => /(?:^|\n)(?:Wordmark|Symbol|Background):/.test(item)) && 'compact:grid-cols-3')}>
      {items.map((item, index) => (
        <label key={index} className={cn('group/option relative flex items-start gap-2 rounded-lg border border-line p-2 text-xs', old ? 'cursor-default' : 'cursor-pointer', !old && choice === index && 'border-primary bg-muted/40', busy && 'opacity-60')}>
          <RadioGroupItem value={String(index)} disabled={old} className="mt-0.5" />
          {canRedo && !old && <Tip label={t('Другой вариант')}><Button type="button" variant="ghost" size="icon-xs" className="nodrag absolute top-1.5 right-1.5 size-6 opacity-0 transition-opacity group-hover/option:opacity-100 focus-visible:opacity-100" aria-label={t('Другой вариант')} disabled={busy} onClick={(event) => { event.preventDefault(); redoItem(nodeId, index) }}><RotateCcw /></Button></Tip>}
          {(() => { const direction = parseDirection(item); const image = conceptAsset(item, 'Wordmark') || conceptAsset(item, 'Sign'); const symbol = cleanSymbol(routeField(item, 'Symbol')); const title = item.match(/\*\*([^*]+)\*\*/)?.[1] ?? `${index + 1}`; const idea = item.split('\n')[0].replace(/^(?:[-*]\s+|\d+[.)]\s+)/, '').replace(/\*\*[^*]+\*\*/, '').replace(/^[\s—–:.-]+/, ''); return symbol ? <span className="flex min-w-0 flex-1 flex-col gap-3"><span className="text-sm font-medium">{title}</span><span className="flex min-h-48 w-full flex-col items-center justify-center gap-5 rounded-lg bg-white p-4 text-black"><span className="block size-32 [&>svg]:size-full" dangerouslySetInnerHTML={{ __html: symbol }} /><span className="flex items-end gap-5"><span className="block size-8 [&>svg]:size-full" dangerouslySetInnerHTML={{ __html: symbol }} /><span className="block size-4 [&>svg]:size-full" dangerouslySetInnerHTML={{ __html: symbol }} /></span></span><span className="text-sm leading-snug text-muted-foreground">{idea}</span></span> : image ? <span className="flex min-w-0 flex-1 flex-col gap-3"><span className="text-sm font-medium">{title}</span><img src={image} alt={item.includes('Sign:') ? `Sign ${index + 1}` : `Wordmark ${index + 1}`} className="block aspect-[3/2] w-full rounded-lg bg-white object-contain" /><span className="text-sm leading-snug text-muted-foreground">{idea}</span></span> : direction ? <DirectionCard direction={direction} product={product ?? 'Refkit'} selected={!old && choice === index} /> : <span className="min-w-0 flex-1"><MessageResponse>{item.replace(/^(?:[-*]\s+|\d+[.)]\s+)/, '')}</MessageResponse></span> })()}
        </label>
      ))}
    </RadioGroup>
  )
}

export function ChoiceNode({ id, data, selected }: NodeProps<Node<{ title?: string; choice?: number; items?: string[]; sourceId?: string; sourceRunning?: boolean; productName?: string }>>) {
  const { patch, addNext, outgoing, run, activate, models, defaultModel } = useContext(CanvasEnv)
  const { deleteElements } = useReactFlow()
  // Нода-источник вариантов: из неё берём модель, статус и прошлые версии, чтобы выбор можно было перегенерировать, не уходя к ней
  const source = useStore((state) => (data.sourceId ? state.nodeLookup.get(data.sourceId)?.internals.userNode.data : undefined)) as { model?: string; modelLabel?: string; status?: string; activeAt?: number; history?: Array<{ result?: string }> } | undefined
  const past = source?.history ?? []
  const total = past.length + 1
  const at = typeof source?.activeAt === 'number' && source.activeAt < total - 1 ? source.activeAt : total - 1
  const old = at < total - 1
  const items = old ? splitItems(String(past[at]?.result ?? '')) : (data.items ?? [])
  const busy = Boolean(data.sourceRunning || source?.status === 'running')
  return (
    <NodeFrame id={id} selected={selected} icon={ListChecks} title={data.title ?? t('Выбор')} meta={items.length < 2 ? t('нет вариантов') : busy ? t('считается…') : data.choice === undefined ? t('выбери один') : t('выбрано')}
      className={cn('min-h-[200px] min-w-[240px]', (data as { sized?: boolean }).sized ? 'size-full' : 'h-[320px] w-[320px]')} bodyClassName="p-3"
      resize={{ minWidth: 240, minHeight: 200, onEnd: () => patch(id, { sized: true, fit: false }) }} bar={<NodeBar id={id} selected={selected} hasOut />}
      ports={<><PortHandle type="target" port="text" /><PortHandle type="source" port="text" add={outgoing.has(id) ? undefined : () => addNext(id)} /></>}
      tools={<Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon-xs" className="nodrag" aria-label={t('Удалить')} onClick={() => void deleteElements({ nodes: [{ id }] })}><Trash2 /></Button></TooltipTrigger><TooltipContent>{t('Удалить')}</TooltipContent></Tooltip>}>
      {items.length < 2 ? <p className="text-xs text-muted-foreground">{t('Подключи слева ноду, которая отдаёт список вариантов, и запусти её')}</p> : (
        <VariantList nodeId={id} items={items} choice={data.choice} old={old} busy={busy} product={data.productName} canRedo={Boolean(data.sourceId)} onChoose={(index) => patch(id, { choice: index })} />
      )}
      {/* Подвал как у нод-агентов: модель источника, версии, перегенерировать весь набор */}
      {data.sourceId && (
        <div className="mt-2 flex shrink-0 items-center gap-1.5">
          <Select value={source?.model ?? 'default'} disabled={busy} onValueChange={(value) => patch(data.sourceId!, { model: value === 'default' ? undefined : value })}>
            <SelectTrigger aria-label={t('Модель ноды')} size="sm" className="nodrag h-7 max-w-[160px] shrink-0 gap-1 rounded-lg border-0 bg-muted/60 px-3 text-xs shadow-none"><SelectValue>{source?.modelLabel ?? defaultModel ?? t('Модель')}</SelectValue></SelectTrigger>
            <SelectContent align="start">
              <SelectItem className="text-xs" value="default">{t('По умолчанию')}{defaultModel ? ` · ${defaultModel}` : ''}</SelectItem>
              {models.map((model) => <SelectItem className="text-xs" key={model.key} value={model.key}>{model.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <span className="min-w-0 flex-1" />
          {total > 1 && !busy && (
            <div className="flex h-8 shrink-0 items-center gap-0.5 rounded-lg bg-muted/60 px-0.5">
              <Button variant="ghost" size="icon-xs" className="nodrag size-7 rounded-md" aria-label={t('Прошлая версия')} disabled={at === 0} onClick={() => activate(data.sourceId!, at - 1)}><ChevronLeft /></Button>
              <span className="min-w-8 text-center text-xs tabular-nums text-muted-foreground">{at + 1}/{total}</span>
              <Button variant="ghost" size="icon-xs" className="nodrag size-7 rounded-md" aria-label={t('Следующая версия')} disabled={!old} onClick={() => activate(data.sourceId!, at + 1)}><ChevronRight /></Button>
            </div>
          )}
          <Tip label={busy ? t('Считается…') : t('Другой набор')}><Button size="icon" className="nodrag size-8 rounded-lg" aria-label={t('Другой набор')} disabled={busy || SNAPSHOT} onClick={() => run(data.sourceId!)}><Play /></Button></Tip>
        </div>
      )}
    </NodeFrame>
  )
}

// Связи как в шаблоне Workflow Editor (React Flow UI): пунктир, у выбранной — кнопка «удалить»; пока запускается следующая нода, по связи бежит точка
export function FlowEdge(props: EdgeProps) {
  const { deleteElements } = useReactFlow()
  const { insertBetween } = useContext(CanvasEnv)
  return (
    <ButtonEdge {...props} style={{ ...props.style, transition: 'opacity 0.2s ease-in-out, stroke-width 0.2s ease-in-out' }}>
      {/* Кнопки видны только когда связь выбрана или курсор у её середины: иначе на густой цепочке десятки плюсов */}
      <div className={cn('flex items-center gap-1 transition-opacity focus-within:opacity-100 hover:opacity-100', props.selected ? 'opacity-100' : 'opacity-0')}>
        <Button size="icon-xs" variant="outline" className="size-5 rounded-md" aria-label={t('Вставить ноду между')} onClick={() => insertBetween(props.id)}><Plus className="size-3" /></Button>
        {props.selected && <Button size="icon-xs" variant="outline" className="size-5 rounded-md" aria-label={t('Удалить связь')} onClick={() => void deleteElements({ edges: [{ id: props.id }] })}><X className="size-3" /></Button>}
      </div>
    </ButtonEdge>
  )
}
// Связь-призрак предложения агента: пунктир без кнопок
export function GhostEdge({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition }: EdgeProps) {
  const [path] = getBezierPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition })
  return <BaseEdge path={path} style={{ strokeWidth: 2, strokeDasharray: '6 5', opacity: 0.7, stroke: 'var(--port-text)' }} />
}
export const edgeTypes = { flow: FlowEdge, running: AnimatedSvgEdge, ghost: GhostEdge }
export const nodeTypes = { card: memo(CardNode), frame: memo(FrameNode), text: memo(TextNode), agent: memo(AgentNode), screen: memo(AgentNode), image: memo(AgentNode), choice: memo(ChoiceNode), group: memo(GroupNode) }
export const edgeOptions = { type: 'default', style: { strokeWidth: 2, stroke: 'var(--muted-foreground)' } } as const

