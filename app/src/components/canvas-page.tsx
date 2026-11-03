import { shownCanvasData } from '@/lib/canvas-view'
import { AgentCopyIcon } from '@/components/agent-copy-icon'
import { createPortal } from 'react-dom'
import { compact, useMinWidth } from '@/lib/breakpoints'
import { createElement, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CodeBlock, CodeBlockCopyButton } from '@/components/ai-elements/code-block'
import { DropdownMenuItem, DropdownMenuShortcut } from '@/components/ui/dropdown-menu'
import { Canvas } from '@/components/ai-elements/canvas'
import { Connection } from '@/components/ai-elements/connection'
import { Panel } from '@/components/ai-elements/panel'
import dagre from '@dagrejs/dagre'
import { X, Library, LocateFixed, Map as MapIcon, Redo2, FolderOpen, Layers, ListPlus, Scissors, AlignHorizontalDistributeCenter, ArrowLeft, ChevronRight, Undo2, Bot, Plus, Play, Square, Copy, Image as ImageIcon, Images, ListChecks, PanelTop, MousePointer2, Shapes, Trash2, Type, MessageSquarePlus, Download } from 'lucide-react'
import { Toolbar } from '@/components/ai-elements/toolbar'
import { applyEdgeChanges, applyNodeChanges, MiniMap, Position, useKeyPress, useStore, useViewport, ReactFlowProvider, SelectionMode, useNodesInitialized, useReactFlow, type Edge, type EdgeChange, type Node, type NodeChange } from '@xyflow/react'
import '@xyflow/react/dist/base.css'
import { Button } from '@/components/ui/button'
import { NodePreview } from '@/components/canvas/node-preview'
import { Command, CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { ViewerShell } from '@/components/viewer-shell'
import { ZoomIsland } from '@/components/zoom-island'
import { MemoryPanel } from '@/components/canvas/memory-panel'
import { CommentsPanel, type CommentGroup } from '@/components/canvas/comments-panel'
import { CARDS_MIME, MaterialPicker } from '@/components/canvas/material-picker'
import { Island } from '@/components/ui/island'
import { type CardComment } from '@/components/comment-feed'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Kbd } from '@/components/ui/kbd'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { library, SNAPSHOT, type ActionItem, type CanvasData, type ModelSettings } from '@/lib/library'
import { notify } from '@/lib/notify'
import { cn } from '@/lib/utils'
import { applyOps } from '../../shared/canvas-graph.mjs'
import { hypothesisChain } from '../../shared/hypothesis-template.mjs'
import { productLandingChain } from '../../shared/product-landing-template.mjs'
import { landingReferenceChain } from '../../shared/landing-reference-template.mjs'
import { brandbookChain } from '../../shared/brandbook-template.mjs'
import { accepts, connectionError, derivedFields, stripDerived } from '../../shared/canvas-nodes.mjs'
import { t } from '@/lib/i18n'
import { Tip, barButton, barClass, type CanvasItem, cardWidth, portOf, PORT_VAR, ratioOf, type Env, CanvasEnv, PRESETS, SCREEN_INSTR, TEMPLATES, TEMPLATE_STAGES, edgeTypes, nodeTypes, edgeOptions } from './canvas/nodes'
// Страница холста (grill-canvas.md): доска на React Flow. Карточки — живые ссылки на материалы (название и обложка берутся
// из библиотеки, на доске хранятся только id, место и размер), рамки и текст — свои. Стрелку тянут от точки на краю
// карточки. Управление как в Figma: два пальца — сдвиг, щипок или ⌘ + колесо — масштаб, рамка выделения по пустому месту.
// Доска сохраняется сама (через паузу после правки); ни агент, ни фон её не меняют
type Props = {
  // Комментарии холста живут во вкладке окна агента справа (как у Doop): окно даёт слот, холст кладёт туда панель порталом
  memorySlot?: HTMLElement | null; commentsSlot?: HTMLElement | null; commentsActive?: boolean; onCommentsCount?: (count: number) => void; onOpenComments?: () => void; onHideComments?: () => void
  agentButton?: React.ReactNode // молния агента библиотеки: общая для приложения, на холсте стоит последней в панели инструментов
  onSettings?: () => void // «Подключить агента» в шапке — страница «Настройки»
  id: string; title: string; items: CanvasItem[]
  onManageActions?: () => void
  onAddToFolder?: (folderId: string) => void
  onMoveToFolder?: (refIds: string[], folderId: string) => void
  onRemoveFromBoard?: (refId: string, board: string) => void
  onBack: () => void; onRename: (title: string) => void; onOpenCard: (id: string) => void
  onBoxes: (boxes: Array<{ x: number; y: number; w: number; h: number; k: string }>) => void
  // ⌘V: файл или ссылка из буфера — в библиотеку (во «Входящие») и карточкой на доску; возвращает id новых материалов
  onAddMaterial?: (input: { files?: File[]; link?: string }) => Promise<string[]>
}

const CLIP_MARK = 'refkit-canvas-nodes'
type Tool = 'select' | 'text' | 'comment' | 'cut'
// Иконка ноды в палитре — по ключу записи
const SPOT_ICON: Record<string, React.ComponentType> = { agent: Bot, screen: PanelTop, image: ImageIcon, choice: ListChecks, text: Type }
const sizeOf = (node: Node) => ({ w: node.width ?? (node.measured?.width ?? cardWidth), h: node.height ?? (node.measured?.height ?? 150) })
// Что уходит на сервер: только данные узла, без служебных полей React Flow (выделение, замеры, перетаскивание)
const isGhost = (node: Node) => (node.data as { ghost?: boolean } | undefined)?.ghost === true
const plain = (node: Node) => ({ id: node.id, type: node.type, position: node.position, width: node.width ?? node.measured?.width, height: node.height ?? node.measured?.height, zIndex: node.zIndex, data: stripDerived(node.type, { ...node.data, fresh: undefined }) })
const plainEdge = (edge: Edge) => ({ id: edge.id, source: edge.source, target: edge.target })

// Масштаб снизу справа, как у Magnific: проценты открывают меню (приблизить, отдалить, 100 %, вместить D, к выбранному F); рядом кнопка миникарты
function ZoomMenu({ map, onMap }: { map: boolean; onMap: () => void }) {
  const { zoom } = useViewport()
  const { zoomIn, zoomOut, zoomTo, fitView } = useReactFlow()
  const selected = useStore((state) => [...state.nodeLookup.values()].filter((node) => node.selected).map((node) => ({ id: node.id })))
  return (
    <Panel position="bottom-right" className="!m-4 !border-0 !bg-transparent !p-0 !shadow-none !overflow-visible !right-[var(--agent-overlay-w,0px)]">
      <ZoomIsland percent={Math.round(zoom * 100)} onZoomIn={() => void zoomIn({ duration: 200 })} onZoomOut={() => void zoomOut({ duration: 200 })} onReset={() => void zoomTo(1, { duration: 200 })}
        leading={<Tooltip><TooltipTrigger asChild><Button variant={map ? 'secondary' : 'ghost'} size="icon" aria-label={t('Миникарта')} aria-pressed={map} onClick={onMap}><MapIcon /></Button></TooltipTrigger><TooltipContent>{t('Миникарта')}</TooltipContent></Tooltip>}>
          <DropdownMenuItem onSelect={() => void fitView({ maxZoom: 1, padding: 0.2, duration: 300 })}>{t('Вместить всё')}<DropdownMenuShortcut>D</DropdownMenuShortcut></DropdownMenuItem>
          <DropdownMenuItem disabled={!selected.length} onSelect={() => void fitView({ nodes: selected, maxZoom: 1.5, padding: 0.3, duration: 300 })}>{t('К выбранному')}<DropdownMenuShortcut>F</DropdownMenuShortcut></DropdownMenuItem>
      </ZoomIsland>
    </Panel>
  )
}
// «К доске» — появляется внизу по центру, когда все ноды ушли за кадр (как Recenter у Magnific)
function Recenter() {
  const { fitView } = useReactFlow()
  const away = useStore((state) => {
    if (!state.nodeLookup.size) return false
    const [tx, ty, zoom] = state.transform
    for (const node of state.nodeLookup.values()) {
      const x = node.internals.positionAbsolute.x * zoom + tx, y = node.internals.positionAbsolute.y * zoom + ty
      const w = (node.measured.width ?? 0) * zoom, h = (node.measured.height ?? 0) * zoom
      if (x < state.width && x + w > 0 && y < state.height && y + h > 0) return false
    }
    return true
  })
  if (!away) return null
  return <Panel position="bottom-center" className="!mb-20 !p-1"><Button variant="ghost" size="sm" className="gap-1.5" onClick={() => void fitView({ maxZoom: 1, padding: 0.2, duration: 300 })}><LocateFixed />{t('К доске')}</Button></Panel>
}
export const CanvasPage = (props: Props) => <ReactFlowProvider><Board key={props.id} {...props} /></ReactFlowProvider>

// Нож (как у Magnific): тянешь линию поперёк холста, все связи, которые она пересекла, обрываются одним шагом истории. Геометрию связей берём из
// их SVG-путей на экране: точки пути сравниваются с отрезками следа курсора
function Knife({ onCut }: { onCut: (edgeIds: string[]) => void }) {
  const layer = useRef<HTMLDivElement>(null)
  // Колесо и жесты масштаба проходят сквозь оверлей к холсту: иначе с включённым ножом нельзя ни приблизить, ни отдалить
  useEffect(() => {
    const node = layer.current
    if (!node) return
    const forward = (event: WheelEvent) => {
      event.preventDefault()
      const pane = document.querySelector('.react-flow__pane')
      pane?.dispatchEvent(new WheelEvent('wheel', { deltaX: event.deltaX, deltaY: event.deltaY, deltaMode: event.deltaMode, ctrlKey: event.ctrlKey, metaKey: event.metaKey, shiftKey: event.shiftKey, altKey: event.altKey, clientX: event.clientX, clientY: event.clientY, bubbles: true, cancelable: true }))
    }
    node.addEventListener('wheel', forward, { passive: false })
    return () => node.removeEventListener('wheel', forward)
  }, [])
  const [trail, setTrail] = useState<Array<[number, number]>>([])
  const points = useRef<Array<[number, number]>>([])
  const down = useRef(false)
  const finish = (points: Array<[number, number]>) => {
    const cross = (a: [number, number], b: [number, number], c: [number, number], d: [number, number]) => {
      const o = (p: [number, number], q: [number, number], r: [number, number]) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0])
      return o(a, b, c) * o(a, b, d) < 0 && o(c, d, a) * o(c, d, b) < 0
    }
    const hit: string[] = []
    document.querySelectorAll<SVGGElement>('.react-flow__edge').forEach((group) => {
      const path = group.querySelector<SVGPathElement>('path.react-flow__edge-path')
      const matrix = path?.getScreenCTM()
      if (!path || !matrix) return
      const length = path.getTotalLength(), samples: Array<[number, number]> = []
      for (let at = 0; at <= 48; at++) { const spot = path.getPointAtLength((length * at) / 48), p = new DOMPoint(spot.x, spot.y).matrixTransform(matrix); samples.push([p.x, p.y]) }
      const cut = samples.some((point, at) => at > 0 && points.some((spot, index) => index > 0 && cross(samples[at - 1], point, points[index - 1], spot)))
      if (cut) hit.push((group.getAttribute('data-id') ?? group.id.replace(/^rf__edge-/, '')))
    })
    if (hit.length) onCut(hit)
  }
  return (
    <div ref={layer} className="absolute inset-0 z-20 cursor-crosshair touch-none" role="presentation"
      onPointerDown={(event) => { try { event.currentTarget.setPointerCapture(event.pointerId) } catch { /* без захвата след всё равно рисуется, пока курсор над холстом */ } down.current = true; points.current = [[event.clientX, event.clientY]]; setTrail(points.current) }}
      onPointerMove={(event) => { if (down.current) { points.current = [...points.current, [event.clientX, event.clientY]]; setTrail(points.current) } }}
      onPointerUp={(event) => { down.current = false; finish([...points.current, [event.clientX, event.clientY]]); points.current = []; setTrail([]) }}>
      {trail.length > 1 && (
        <svg className="pointer-events-none fixed inset-0 size-full" aria-hidden>
          <polyline points={trail.map(([x, y]) => `${x},${y}`).join(' ')} fill="none" stroke="white" strokeWidth="2" strokeDasharray="6 5" strokeLinecap="round" />
        </svg>
      )}
    </div>
  )
}

function Board(props: Props) {
  const { agentButton, id, title, items, onManageActions, onAddToFolder, onMoveToFolder, onRemoveFromBoard, onBack, onRename, onOpenCard, onBoxes, onAddMaterial } = props
  const [actions, setActions] = useState<ActionItem[]>([])
  // Модели для выбора на ноде: те же, что в настройках; «по умолчанию» — модель «Просьбы агенту»
  const [modelList, setModelList] = useState<ModelSettings | null>(null)
  useEffect(() => { void library.settings().then(setModelList).catch(() => {}) }, [])
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [frameView, setFrameView] = useState<{ id: string; title: string; members: Array<{ id: string; title: string; image?: string; node?: boolean }> } | null>(null)
  const [promptView, setPromptView] = useState<{ title: string; prompt: string; images: string[]; model: string } | null>(null)
  // Стартовые умения добавляем один раз за сессию: два параллельных вызова (двойной монтаж) иначе создали бы дубли
  useEffect(() => {
    seeding ??= (async () => {
      let list = await library.actions()
      for (const preset of PRESETS) if (!list.some((action) => action.name === preset.title)) list = await library.addAction(preset.title, preset.instr, { about: t('Шаг цепочки на холсте') })
      return list
    })()
    seeding.then(setActions).catch(() => { seeding = null })
  }, [])
  const [nodes, setNodes] = useState<Node[]>([])
  // Применённые правки сервер называет в appliedEdits: такие комментарии закрываются сами и остаются в «Закрытых» панели комментариев
  useEffect(() => {
    type D = { comments?: CardComment[]; closedComments?: CardComment[]; appliedEdits?: string[] }
    const done = (node: Node) => { const data = node.data as D; return Boolean(data.appliedEdits?.length && data.comments?.some((item) => data.appliedEdits!.includes(item.id))) }
    if (!nodes.some(done)) return
    setNodes((list) => list.map((node) => {
      if (!done(node)) return node
      const data = node.data as D
      const applied = data.comments!.filter((item) => data.appliedEdits!.includes(item.id)).map((item) => ({ ...item, closedAt: Date.now(), closedBy: 'applied' as const }))
      return { ...node, data: { ...data, comments: data.comments!.filter((item) => !data.appliedEdits!.includes(item.id)), closedComments: [...(data.closedComments ?? []), ...applied].slice(-200) } }
    }))
  }, [nodes])
  // Панель комментариев: закрыть/вернуть руками, перейти к ноде
  const commentGroups = useMemo<CommentGroup[]>(() => nodes.filter((node) => node.type === 'screen' || node.type === 'image').map((node) => {
    const data = node.data as { title?: string; comments?: CardComment[]; closedComments?: CardComment[] }
    return { id: node.id, title: data.title || (node.type === 'screen' ? t('Экран') : t('Картинка')), applicable: true, open: data.comments ?? [], closed: data.closedComments ?? [] }
  }).filter((group) => group.open.length || group.closed.length), [nodes])
  const openComments = commentGroups.reduce((sum, group) => sum + group.open.length, 0)
  const { onCommentsCount } = props
  useEffect(() => { onCommentsCount?.(openComments); return () => onCommentsCount?.(0) }, [openComments, onCommentsCount])
  const moveComment = (nodeId: string, commentId: string, to: 'closed' | 'open') => {
    const data = nodesRef.current.find((node) => node.id === nodeId)?.data as { comments?: CardComment[]; closedComments?: CardComment[] } | undefined
    if (!data) return
    const from = (to === 'closed' ? data.comments : data.closedComments) ?? []
    const item = from.find((entry) => entry.id === commentId)
    if (!item) return
    const rest = from.filter((entry) => entry.id !== commentId)
    if (to === 'closed') patch(nodeId, { comments: rest, closedComments: [...(data.closedComments ?? []), { ...item, closedAt: Date.now(), closedBy: 'manual' as const }] })
    else { const { closedAt: _closedAt, closedBy: _closedBy, ...back } = item; patch(nodeId, { closedComments: rest, comments: [...(data.comments ?? []), back] }) }
  }
  const nodesRef = useRef<Node[]>([])
  nodesRef.current = nodes
  const [edges, setEdges] = useState<Edge[]>([])
  const edgesRef = useRef<Edge[]>([])
  edgesRef.current = edges
  // Отмена и повтор (⌘Z / ⇧⌘Z): снимок доски перед каждой правкой — перетаскиванием, удалением, добавлением, связью; до 50 шагов. Печать в полях в историю не идёт
  const history = useRef<{ past: Array<{ nodes: Node[]; edges: Edge[] }>; future: Array<{ nodes: Node[]; edges: Edge[] }>; at: number }>({ past: [], future: [], at: 0 })
  const mark = useCallback(() => {
    const h = history.current
    if (Date.now() - h.at < 300) return // удаление шлёт правки узлов и связей подряд — один шаг
    h.at = Date.now(); h.past.push({ nodes: nodesRef.current.filter((node) => !isGhost(node)), edges: edgesRef.current.filter((edge) => !edge.id.startsWith('ghost-')) }); if (h.past.length > 50) h.past.shift(); h.future = []
  }, [])
  const travel = useCallback((direction: 'undo' | 'redo') => {
    const h = history.current
    const target = (direction === 'undo' ? h.past : h.future).pop()
    if (!target) return
    ;(direction === 'undo' ? h.future : h.past).push({ nodes: nodesRef.current.filter((node) => !isGhost(node)), edges: edgesRef.current.filter((edge) => !edge.id.startsWith('ghost-')) })
    setNodes(target.nodes); setEdges(target.edges)
  }, [])
  // Копирование и вставка (⌘C / ⌘V): выбранные ноды и связи между ними; результаты запусков не копируются — у копии они свои
  const clip = useRef<{ nodes: Node[]; edges: Edge[] } | null>(null)
  const copySelected = useCallback(() => {
    const picked = nodesRef.current.filter((node) => node.selected)
    if (!picked.length) return false
    const ids = new Set(picked.map((node) => node.id))
    clip.current = { nodes: picked, edges: edgesRef.current.filter((edge) => ids.has(edge.source) && ids.has(edge.target)) }
    return true
  }, [])
  const paste = useCallback(() => {
    const source = clip.current
    if (!source) return
    mark()
    const stamp = Date.now().toString(36), map = new Map(source.nodes.map((node, index) => [node.id, `n-${stamp}${index}`]))
    const copies = source.nodes.map((node) => ({ ...node, id: map.get(node.id)!, position: { x: node.position.x + 40, y: node.position.y + 40 }, selected: true, data: stripDerived(node.type, node.data) }) as Node)
    setNodes((list) => [...list.map((node) => ({ ...node, selected: false })), ...copies])
    setEdges((list) => [...list, ...source.edges.map((edge) => ({ ...edge, id: `e-${stamp}-${map.get(edge.source)}-${map.get(edge.target)}`, source: map.get(edge.source)!, target: map.get(edge.target)! }) as Edge)])
    clip.current = { nodes: source.nodes.map((node) => ({ ...node, position: { x: node.position.x + 40, y: node.position.y + 40 } })), edges: source.edges } // следующая вставка — ещё правее
  }, [mark])
  // Авто-раскладка слева направо (dagre): связанные ноды выстраиваются в цепочку по ходу связей; рамки остаются как есть
  const layout = useCallback(() => {
    const list = nodesRef.current.filter((node) => node.type !== 'frame' && !isGhost(node))
    if (!list.length) return
    mark()
    const graph = new dagre.graphlib.Graph().setGraph({ rankdir: 'LR', nodesep: 40, ranksep: 90 }).setDefaultEdgeLabel(() => ({}))
    for (const node of list) graph.setNode(node.id, { width: sizeOf(node).w, height: sizeOf(node).h })
    for (const edge of edgesRef.current) if (graph.hasNode(edge.source) && graph.hasNode(edge.target)) graph.setEdge(edge.source, edge.target)
    dagre.layout(graph)
    setNodes((all) => all.map((node) => { const at = graph.node(node.id); return at ? { ...node, position: { x: Math.round(at.x - at.width / 2), y: Math.round(at.y - at.height / 2) } } : node }))
    setTimeout(() => { void fitRef.current({ maxZoom: 1, padding: 0.2, duration: 300 }) }, 50)
  }, [mark])
  // «Упорядочить» одной кнопкой: выделенные ноды сами собираются в колонки (те, что перекрываются по горизонтали, — одна колонка), внутри колонки
  // выравниваются по левому краю и встают друг под другом с одним зазором, колонки идут слева направо с одним зазором и по общему верху. Что стояло
  // в строку, становится строкой: каждая нода — своя колонка. Рамка-этап раскладывается как одна единица вместе со своими нодами; один шаг в истории
  const tidySelected = useCallback(() => {
    const chosen = nodesRef.current.filter((node) => node.selected && !isGhost(node))
    // Рамка — одна единица вместе со своими нодами: выделенные внутри неё сами не двигаются, едут с ней
    const inside = new Set(chosen.filter((node) => node.type === 'frame').flatMap((node) => (node.data as { members?: string[] }).members ?? []))
    const picked = chosen.filter((node) => !inside.has(node.id))
    if (picked.length < 2) return
    const GAP = 40, COLUMN_GAP = 80
    const box = (node: Node) => ({ node, x: node.position.x, y: node.position.y, w: sizeOf(node).w, h: sizeOf(node).h })
    const columns: Array<{ items: ReturnType<typeof box>[]; from: number; to: number }> = []
    for (const item of picked.map(box).sort((a, b) => a.x - b.x)) {
      const column = columns.find((c) => Math.min(c.to, item.x + item.w) - Math.max(c.from, item.x) > 0.4 * Math.min(c.to - c.from, item.w))
      if (column) { column.items.push(item); column.from = Math.min(column.from, item.x); column.to = Math.max(column.to, item.x + item.w) }
      else columns.push({ items: [item], from: item.x, to: item.x + item.w })
    }
    columns.sort((a, b) => a.from - b.from)
    const top = Math.min(...picked.map((node) => node.position.y)), left = Math.min(...picked.map((node) => node.position.x))
    const target = new Map<string, { x: number; y: number }>()
    let x = left
    for (const column of columns) {
      let y = top
      for (const item of column.items.sort((a, b) => a.y - b.y)) { target.set(item.node.id, { x, y }); y += item.h + GAP }
      x += Math.max(...column.items.map((item) => item.w)) + COLUMN_GAP
    }
    const moved = new Map<string, { x: number; y: number }>()
    for (const [id, at] of target) {
      const node = nodesRef.current.find((item) => item.id === id)!, d = { x: at.x - node.position.x, y: at.y - node.position.y }
      moved.set(id, d)
      if (node.type === 'frame') for (const member of ((node.data as { members?: string[] }).members ?? [])) moved.set(member, d)
    }
    mark()
    setNodes((list) => list.map((node) => { const d = moved.get(node.id); return d && (d.x || d.y) ? { ...node, position: { x: Math.round(node.position.x + d.x), y: Math.round(node.position.y + d.y) } } : node }))
  }, [mark])
  // ⌘V на холсте: что в буфере, то и кладём. Скопированные ноды доски (метка CLIP_MARK) — вставить их; файл или ссылка — стать материалом и карточкой;
  // обычный текст — подписью. Слушаем раньше библиотеки (она открыла бы окно «Добавить») и забираем событие себе
  const pasteRef = useRef<(event: ClipboardEvent) => void>(() => {})
  pasteRef.current = (event) => {
    if (document.querySelector('[role="dialog"]')) { event.stopImmediatePropagation(); return }
    if ((event.target as HTMLElement | null)?.closest('input, textarea, [contenteditable="true"]')) return
    event.stopImmediatePropagation()
    event.preventDefault()
    const text = event.clipboardData?.getData('text/plain').trim() ?? ''
    const files = [...(event.clipboardData?.files ?? [])].filter((file) => /^(image|video)\//.test(file.type))
    if (text === CLIP_MARK) { paste(); return }
    const link = !files.length && /^https?:\/\/\S+$/.test(text) ? text : undefined
    if ((files.length || link) && onAddMaterial) {
      notify(files.length ? t('Добавляю в библиотеку…') : t('Добавляю ссылку в библиотеку…'))
      void onAddMaterial({ files, link }).then((ids) => { for (const refId of ids) addCard(refId, nudge(center())) })
    } else if (text) add({ type: 'text', position: (() => { const at = nudge(center()); return { x: at.x - 100, y: at.y - 24 } })(), width: 240, height: 90, data: { text } })
  }
  useEffect(() => {
    const on = (event: ClipboardEvent) => pasteRef.current(event)
    window.addEventListener('paste', on, true)
    return () => window.removeEventListener('paste', on, true)
  }, [])
  useEffect(() => {
    const on = (event: KeyboardEvent) => {
      if (document.querySelector('[role="dialog"]') || !(event.metaKey || event.ctrlKey) || event.altKey || (event.target as HTMLElement | null)?.closest('input, textarea, [contenteditable="true"]')) return
      const key = event.key.toLowerCase()
      if (key === '0') { event.preventDefault(); void zoomToRef.current(1, { duration: 200 }) }
      else if (key === '=' || key === '+') { event.preventDefault(); void zoomInRef.current({ duration: 200 }) }
      else if (key === '-') { event.preventDefault(); void zoomOutRef.current({ duration: 200 }) }
      else if (key === 'a') { event.preventDefault(); setNodes((list) => list.map((node) => ({ ...node, selected: true }))) }
      else if (key === 'g') { event.preventDefault(); groupRef.current() }
      else if (key === 'c') { if (copySelected()) void navigator.clipboard?.writeText(CLIP_MARK).catch(() => {}) }
      else if (key === 'z') { event.preventDefault(); travel(event.shiftKey ? 'redo' : 'undo') }
      else if (key === 'y') { event.preventDefault(); travel('redo') }
    }
    window.addEventListener('keydown', on)
    return () => window.removeEventListener('keydown', on)
  }, [travel, copySelected, paste])
  // ⌘G: сгруппировать выделенное. Функция живёт ниже (ей нужны add и размеры нод), обработчик клавиш берёт её через ref
  const groupRef = useRef<() => void>(() => {})
  const ungroupRef = useRef<(listId: string) => void>(() => {})
  const removeFromGroupRef = useRef<(groupId: string, itemId: string) => void>(() => {})
  const toggleListRef = useRef<(listId: string) => void>(() => {})
  const addChainRef = useRef<(point?: { x: number; y: number }, key?: string) => void>(() => {})
  const [loaded, setLoaded] = useState(false)
  const [tool, setTool] = useState<Tool>('select')
  // Пока зажат пробел, ноды не ловят мышь: у перетаскиваемых нод React Flow ставит класс nopan, и без этого протянуть холст, начав над большой нодой (группой), нельзя
  const spaceHeld = useKeyPress('Space')
  // На macOS пока зажат ⌘, браузер не шлёт keyup других клавиш: пробел «залипает» в React Flow, и пока он залип, колесо двигает холст, а не масштабирует.
  // Отпустили ⌘ — досылаем отпускание пробела; потеряли фокус окна — тоже
  useEffect(() => {
    const release = () => { document.dispatchEvent(new KeyboardEvent('keyup', { code: 'Space', key: ' ', bubbles: true })) }
    const onKeyUp = (event: KeyboardEvent) => { if (event.key === 'Meta' || event.key === 'Control') release() }
    window.addEventListener('keyup', onKeyUp); window.addEventListener('blur', release)
    return () => { window.removeEventListener('keyup', onKeyUp); window.removeEventListener('blur', release) }
  }, [])
  const wideScreen = useMinWidth(compact)
  const [phoneHint, setPhoneHint] = useState(true) // в снимке на телефоне: холст из нод неудобен, подсказываем
  const [pickerOpen, setPickerOpen] = useState(false) // окно «Материал из библиотеки» (из «+», клавиша M)
  const [map, setMap] = useState(false)
  // Папки и подборки для полки: по клику или перетаскиванием попадают на холст одной нодой
  // Spotlight (N, / или правый клик; Space занят навигацией, как в Figma): палитра нод; открывается и «потянул связь в пустое место» — тогда в ней только совместимые ноды, выбранная ставится и соединяется
  const [spot, setSpot] = useState<{ at?: { x: number; y: number }; from?: string; to?: string } | null>(null)
  // Палитра как у Magnific: вид «все» с категориями-чипами или подпалитра («Материалы ›», «Папки ›», «Подборки ›») со своей стрелкой назад
  // В палитре нод нет поля поиска: фокус кладём на сам список, чтобы стрелки и Enter работали
  useEffect(() => {
    if (!spot) return
    const timer = setInterval(() => {
      const root = document.querySelector<HTMLElement>('[cmdk-root]')
      if (!root) return
      if (!root.querySelector('[cmdk-input]')) root.focus()
      clearInterval(timer)
    }, 50)
    return () => clearInterval(timer)
  }, [spot])
  const [spotView, setSpotView] = useState<'root' | 'materials' | 'folders' | 'boards'>('root')
  useEffect(() => { if (!spot) setSpotView('root') }, [spot])
  const [groups, setGroups] = useState<Array<{ kind: 'folder' | 'board'; key: string; name: string }>>([])
  useEffect(() => {
    if (!pickerOpen && !spot) return
    void Promise.all([library.folders(), library.boards()]).then(([folders, boards]) => setGroups([
      ...folders.map((folder) => ({ kind: 'folder' as const, key: folder.id, name: folder.name })),
      ...boards.filter((board) => !board.shelf && !board.inbox && !folders.some((folder) => folder.name === board.name)).map((board) => ({ kind: 'board' as const, key: board.name, name: board.name })),
    ])).catch(() => {})
  }, [pickerOpen, spot])
  const [name, setName] = useState(title)
  const { screenToFlowPosition, fitView, zoomIn, zoomOut, zoomTo, getViewport, setViewport } = useReactFlow()
  // Родитель передаёт новую функцию на каждую перерисовку — держим её в ссылке, иначе сохранение зациклится
  const boxesTo = useRef(onBoxes)
  boxesTo.current = onBoxes
  const frame = useRef<HTMLDivElement>(null)
  // ⌘/Ctrl + колесо всегда масштабирует холст — считаем сами, а не через zoomActivationKeyCode: React Flow помнит нажатие ⌘ по keydown/keyup,
  // и после ⌘+Tab или ввода в поле это состояние сбивалось — колесо листало вместо масштаба. Здесь смотрим флаг самого события, и над .nowheel
  // (мозаика папки, результат, поле инструкции) тоже работает. Щипок трекпада приходит так же — колесо с ctrlKey. Точка под курсором стоит на месте
  useEffect(() => {
    const el = frame.current
    if (!el) return
    const onWheel = (event: WheelEvent) => {
      if (!(event.metaKey || event.ctrlKey)) return
      event.preventDefault()
      event.stopPropagation()
      const box = el.getBoundingClientRect(), { x, y, zoom } = getViewport()
      const step = Math.max(-30, Math.min(30, event.deltaY)) // мышь шлёт ~100 за щелчок, щипок — единицы
      const next = Math.min(2, Math.max(0.1, zoom * Math.exp(-step * 0.01)))
      const px = event.clientX - box.left, py = event.clientY - box.top
      void setViewport({ x: px - ((px - x) / zoom) * next, y: py - ((py - y) / zoom) * next, zoom: next })
    }
    el.addEventListener('wheel', onWheel, { capture: true, passive: false })
    return () => el.removeEventListener('wheel', onWheel, { capture: true })
  }, [])
  // На телефоне и планшете палец двигает доску, а не тянет рамку выделения
  const coarse = useMemo(() => typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches, [])
  const byId = useMemo(() => new Map(items.map((item) => [item.id, item])), [items])

  useEffect(() => { setName(title) }, [title])
  // Узлы промеряются уже после первого кадра — подгоняем вид ещё раз, когда доска загрузилась и они отрисованы
  const fitRef = useRef(fitView)
  fitRef.current = fitView
  const zoomInRef = useRef(zoomIn), zoomOutRef = useRef(zoomOut)
  const zoomToRef = useRef(zoomTo)
  zoomInRef.current = zoomIn; zoomOutRef.current = zoomOut; zoomToRef.current = zoomTo
  // Первая подгонка вида — когда React Flow измерил все ноды (раньше размеры нулевые и камера целится мимо)
  const measured = useNodesInitialized()
  const fitted = useRef(false)
  useEffect(() => {
    if (!loaded || !measured || fitted.current) return
    fitted.current = true
    void fitRef.current({ maxZoom: 1, padding: 0.2 })
  }, [loaded, measured])
  // Новый холст «из шаблона»: библиотека оставляет метку, здесь шаблон раскладывается один раз, когда доска загружена
  useEffect(() => {
    if (!loaded) return
    try {
      const raw = sessionStorage.getItem('refkit.pendingTemplate'), pending = raw ? JSON.parse(raw) as { id: string; key: string } : null
      if (!pending || pending.id !== id) return
      sessionStorage.removeItem('refkit.pendingTemplate')
      setTimeout(() => addChainRef.current(undefined, pending.key), 200)
    } catch { /* нет метки — обычный холст */ }
  }, [loaded, id])
  // Доска целиком с сервера (при открытии и после «Принять» предложения агента)
  const [proposals, setProposals] = useState<NonNullable<CanvasData['proposals']>>([])
  const [ghostOn, setGhostOn] = useState(false)
  const applyBoard = (data: CanvasData) => {
    rev.current = data.rev
    setProposals(data.proposals ?? [])
    // агентные ноды — компактные таблетки: размер задаёт сама нода, а не сохранённые 340×340
    setNodes(data.nodes.map((node) => { const agent = (node.type === 'agent' || node.type === 'screen' || node.type === 'image' || node.type === 'choice' || node.type === 'group') && !(node.data as { sized?: boolean } | undefined)?.sized; return { ...node, type: String(node.type ?? 'card'), ...(agent ? { width: undefined, height: undefined } : {}) } }) as Node[])
    // у нод по одной точке входа и выхода (как в AI Elements): старые id точек (right, out, in) отбрасываем
    setEdges(data.edges.map((edge) => ({ ...edge, ...edgeOptions, sourceHandle: undefined, targetHandle: undefined })) as Edge[])
  }
  useEffect(() => {
    let live = true
    library.canvas(id).then((data) => {
      if (!live) return
      applyBoard(data)
      setLoaded(true)
    }).catch(() => notify(t('Не удалось открыть холст')))
    return () => { live = false }
  }, [id])

  // Сохранение через паузу после правки; при уходе со страницы — сразу, чтобы последняя правка не потерялась.
  // Сравниваем с тем, что уже на диске: выделение и перетаскивание без сдвига ничего не пишут и не перерисовывают ленту
  const latest = useRef<CanvasData | null>(null)
  const rev = useRef<number | undefined>(undefined) // версия доски, с которой работаем: сервер отклонит сохранение, если доску уже поменяли в другом окне
  const store = (data: CanvasData) => library.saveCanvas(id, { ...data, rev: rev.current }).then((fresh) => { rev.current = fresh.rev; return fresh })
  const stale = (error: unknown) => { if ((error as Error)?.message === 'stale') { notify(t('Холст изменили в другом окне, загружаю свежую версию')); setTimeout(() => window.location.reload(), 1200); return true } return false }
  const latestBoxes = useRef<Array<{ x: number; y: number; w: number; h: number; k: string }>>([])
  const saved = useRef<string | null>(null)
  const dirty = useRef(false)
  const flush = useCallback(() => {
    if (!dirty.current || !latest.current) return
    dirty.current = false
    saved.current = JSON.stringify(latest.current)
    boxesTo.current(latestBoxes.current)
    void store(latest.current).then((data) => mergeServer(data.nodes)).catch((error) => { if (!stale(error)) notify(t('Не удалось сохранить холст')) })
  }, [id])
  // Снимок доски считаем не на каждый кадр перетаскивания, а один раз после паузы (или при уходе со страницы): на большой доске это главная трата
  const commit = useCallback(() => {
    if (saved.current === null) return // доска ещё не загружена: пустое состояние нельзя писать поверх сохранённого
    const realNodes = nodesRef.current.filter((node) => !isGhost(node)), realEdges = edgesRef.current.filter((edge) => !edge.id.startsWith('ghost-'))
    const data = { nodes: realNodes.map(plain), edges: realEdges.map(plainEdge) }
    if (JSON.stringify(data) === saved.current) return
    latest.current = data
    latestBoxes.current = realNodes.slice(0, 60).map((node) => ({ x: Math.round(node.position.x), y: Math.round(node.position.y), w: Math.round(sizeOf(node).w), h: Math.round(sizeOf(node).h), k: String(node.type ?? 'card') }))
    dirty.current = true
  }, [])
  useEffect(() => {
    if (!loaded) return
    if (saved.current === null) { saved.current = JSON.stringify({ nodes: nodes.filter((node) => !isGhost(node)).map(plain), edges: edges.filter((edge) => !edge.id.startsWith('ghost-')).map(plainEdge) }); return } // первый кадр после загрузки — то же, что на диске
    const timer = setTimeout(() => { commit(); flush() }, 700)
    return () => clearTimeout(timer)
  }, [nodes, edges, loaded, flush, commit])
  useEffect(() => () => { commit(); flush() }, [flush, commit])

  const patch = useCallback((nodeId: string, data: Record<string, unknown>) => setNodes((list) => list.map((node) => node.id === nodeId ? { ...node, data: { ...node.data, ...data } } : node)), [])
  // Рамка этапа (hug) облегает своих участников: сдвинули, растянули или удалили ноду — границы подгоняются сами (поле 40).
  // Пока что-то тащат, не трогаем: рамка в это время едет вместе с участниками
  useEffect(() => {
    if (nodes.some((node) => node.dragging)) return
    const hugs = nodes.filter((node) => node.type === 'frame' && (node.data as { hug?: boolean; members?: string[] }).hug && (node.data as { members?: string[] }).members?.length)
    if (!hugs.length) return
    const sizeOf3 = (node: Node) => ({ w: node.width ?? node.measured?.width ?? 0, h: node.height ?? node.measured?.height ?? 0 })
    const next = new Map<string, { x: number; y: number; w: number; h: number }>()
    for (const frame of hugs) {
      const own = nodes.filter((node) => (frame.data as { members: string[] }).members.includes(node.id))
      if (!own.length || own.some((node) => !sizeOf3(node).w)) continue
      const left = Math.min(...own.map((node) => node.position.x)) - 40, top = Math.min(...own.map((node) => node.position.y)) - 40
      const right = Math.max(...own.map((node) => node.position.x + sizeOf3(node).w)) + 40, bottom = Math.max(...own.map((node) => node.position.y + sizeOf3(node).h)) + 40
      const now = { x: frame.position.x, y: frame.position.y, ...sizeOf3(frame) }
      if (Math.abs(now.x - left) > 2 || Math.abs(now.y - top) > 2 || Math.abs(now.w - (right - left)) > 2 || Math.abs(now.h - (bottom - top)) > 2) next.set(frame.id, { x: Math.round(left), y: Math.round(top), w: Math.round(right - left), h: Math.round(bottom - top) })
    }
    if (next.size) setNodes((list) => list.map((node) => { const box = next.get(node.id); return box ? { ...node, position: { x: box.x, y: box.y }, width: box.w, height: box.h } : node }))
  }, [nodes])
  // Нода облегает контент: меняем высоту, а всё, что стоит ниже в той же колонке, сдвигаем вниз с прежним зазором; рамки этапов (members) подгоняем под участников
  const fitHeight = useCallback((nodeId: string, wanted: number) => {
    setNodes((list) => {
      const target = list.find((node) => node.id === nodeId)
      if (!target) return list
      const sizeOf2 = (node: Node) => ({ w: node.width ?? node.measured?.width ?? 0, h: node.height ?? node.measured?.height ?? 0 })
      const height = Math.round(Math.min(6000, Math.max(200, wanted)))
      if (Math.abs(height - sizeOf2(target).h) < 4) return list
      const before = new Map(list.filter((node) => node.type !== 'frame').map((node) => [node.id, { x: node.position.x, y: node.position.y, ...sizeOf2(node) }]))
      const after = new Map([...before].map(([key, box]) => [key, { ...box }]))
      after.get(nodeId)!.h = height
      const order = [...before.keys()].sort((a, b) => before.get(a)!.y - before.get(b)!.y)
      for (const id of order) {
        const me = before.get(id)!, mine = after.get(id)!
        for (const other of order) {
          if (other === id) continue
          const up = before.get(other)!, upNow = after.get(other)!
          const overlapX = me.x < up.x + up.w && up.x < me.x + me.w
          const wasBelow = me.y >= up.y + up.h
          if (overlapX && wasBelow) mine.y = Math.max(mine.y, upNow.y + upNow.h + (me.y - up.y - up.h))
        }
      }
      const moved = list.map((node) => {
        const box = after.get(node.id)
        return box && node.type !== 'frame' ? { ...node, position: { x: node.position.x, y: Math.round(box.y) }, height: Math.round(box.h) } : node
      })
      return moved.map((node) => {
        const members = node.type === 'frame' ? (node.data as { members?: string[] }).members : undefined
        if (!members?.length) return node
        const own = moved.filter((item) => members.includes(item.id))
        if (!own.length) return node
        const left = Math.min(...own.map((item) => item.position.x)) - 40, top = Math.min(...own.map((item) => item.position.y)) - 40
        const right = Math.max(...own.map((item) => item.position.x + sizeOf2(item).w)) + 40, bottom = Math.max(...own.map((item) => item.position.y + sizeOf2(item).h)) + 40
        return { ...node, position: { x: left, y: top }, width: right - left, height: bottom - top }
      })
    })
  }, [])
  const remove = useCallback((nodeId: string) => { setNodes((list) => list.filter((node) => node.id !== nodeId)); setEdges((list) => list.filter((edge) => edge.source !== nodeId && edge.target !== nodeId)) }, [])
  // Серверные поля агентных нод (статус, результат, цена, «устарело») — из ответов сервера; свои правки клиента не трогаем
  const mergeServer = useCallback((incoming: CanvasData['nodes']) => {
    setNodes((list) => list.map((node) => {
      if (!derivedFields(node.type).length) return node
      const fresh = incoming.find((item) => item.id === node.id)
      if (!fresh) return node
      const data = { ...node.data } as Record<string, unknown>
      for (const key of derivedFields(node.type)) data[key] = (fresh.data as Record<string, unknown> | undefined)?.[key]
      return { ...node, data }
    }))
  }, [])
  // Пока идёт запуск — раз в полторы секунды спрашиваем сервер, что с нодой
  // Нода-папка, над которой сейчас держат карточку (подсвечивается кольцом)
  const [dropFolder, setDropFolder] = useState<string | null>(null)
  const selectedIds = nodes.filter((node) => node.selected).map((node) => node.id)
  // Участники свёрнутого списка прячутся (вместе с их связями — это делает сама доска); развёрнутого — видны
  const shownNodes = useMemo(() => {
    const hidden = new Set(nodes.flatMap((node) => node.type === 'group' && (node.data as { groupKind?: string; open?: boolean }).groupKind === 'list' && !(node.data as { open?: boolean }).open ? ((node.data as { contains?: string[] }).contains ?? []) : []))
    const base = hidden.size ? nodes.map((node) => hidden.has(node.id) ? { ...node, hidden: true } : node) : nodes
    return dropFolder ? base.map((node) => node.id === dropFolder ? { ...node, className: 'rounded-lg ring-2 ring-primary' } : node) : base
  }, [nodes, dropFolder])
  const multi = selectedIds.length > 1
  const anyRunning = nodes.some((node) => (node.type === 'agent' || node.type === 'screen' || node.type === 'image') && (node.data.status === 'running' || node.data.status === 'pending'))
  useEffect(() => {
    if (!anyRunning) return
    const timer = setInterval(() => { void library.canvas(id).then((data) => mergeServer(data.nodes)).catch(() => {}) }, 1500)
    return () => clearInterval(timer)
  }, [anyRunning, id, mergeServer])
  // Запуск: сначала сохраняем инструкцию и связи, потом просим сервер; запуск — только по кнопке владельца
  const saveNow = async () => {
    commit() // правка, набранная секунду назад, ещё не посчитана: без этого запуск уйдёт со старой инструкцией
    if (!dirty.current || !latest.current) return
    dirty.current = false
    saved.current = JSON.stringify(latest.current)
    mergeServer((await store(latest.current)).nodes)
  }
  const applyEdits = async (nodeId: string) => {
    try {
      await saveNow()
      await library.runCanvasNode(id, nodeId, 'edit')
      patch(nodeId, { status: 'running', error: undefined })
    } catch (error) { if (!stale(error)) notify(t('Не удалось применить правки')) }
  }
  const runNode = async (nodeId: string) => {
    try {
      await saveNow()
      await library.runCanvasNode(id, nodeId)
      patch(nodeId, { status: 'running', error: undefined })
    } catch (error) { if (!stale(error)) notify(t('Не удалось запустить ноду')) }
  }
  // «Запустить всё» / «Запустить отсюда»: сервер ведёт очередь, свежие ноды пропускает; кнопка владельца остаётся единственным способом запуска
  const runPlan = async (mode: 'all' | 'downstream', nodeId = '') => {
    try { await saveNow(); await library.runCanvasNode(id, nodeId, mode); await library.canvas(id).then((data) => mergeServer(data.nodes)) }
    catch (error) { if (!stale(error)) notify(t('Не удалось запустить цепочку')) }
  }
  // «Другой вариант» на плитке ноды «Выбор»: сервер перегенерирует только этот пункт в ноде-источнике, остальные не трогает
  const redoItem = async (choiceId: string, index: number) => {
    // Нода «Выбор» перегенерирует источник, агентная нода в режиме pick — саму себя
    const owner = nodesRef.current.find((node) => node.id === choiceId)?.data as { sourceId?: string; pick?: boolean } | undefined
    const sourceId = owner?.sourceId ?? (owner?.pick ? choiceId : undefined)
    if (!sourceId) return
    try {
      await saveNow()
      await library.runCanvasNode(id, sourceId, 'item', index)
      patch(sourceId, { status: 'running', error: undefined })
    } catch (error) { if (!stale(error)) notify(t('Не удалось перегенерировать вариант')) }
  }
  // Стрелки версий: показанная версия сразу становится той, что идёт дальше по цепочке (activeAt на сервере); локально обновляем сразу, чтобы не ждать ответа
  const activate = (nodeId: string, index: number) => {
    const total = ((nodesRef.current.find((node) => node.id === nodeId)?.data as { history?: unknown[] } | undefined)?.history?.length ?? 0) + 1
    patch(nodeId, { activeAt: index >= total - 1 ? undefined : index })
    void library.activateCanvasVersion(id, nodeId, index).then(() => library.canvas(id)).then((data) => mergeServer(data.nodes)).catch(() => notify(t('Не удалось переключить версию')))
  }
  // Подсказка к действию на ноде: перезапуск с уточнением владельца; прошлая версия остаётся в истории
  const refine = async (nodeId: string, text: string) => {
    try { await saveNow(); await library.runCanvasNode(id, nodeId, 'refine', undefined, text); patch(nodeId, { status: 'running', error: undefined }) }
    catch (error) { if (!stale(error)) notify(t('Не удалось уточнить ответ')) }
  }
  // «Продолжить всё равно» на вердикте: запускаем всё, что ниже ноды, саму ноду не трогаем
  const runAfter = async (nodeId: string) => {
    try { await saveNow(); await library.runCanvasNode(id, nodeId, 'after'); await library.canvas(id).then((data) => mergeServer(data.nodes)) }
    catch (error) { if (!stale(error)) notify(t('Не удалось запустить цепочку')) }
  }
  const stopAll = () => { void library.stopCanvasNode(id, 'all').then(() => library.canvas(id)).then((data) => mergeServer(data.nodes)).catch(() => {}) }
  const stopNode = (nodeId: string) => { void library.stopCanvasNode(id, nodeId).then(() => library.canvas(id)).then((data) => mergeServer(data.nodes)).catch(() => {}) }
  const restoreVersion = (nodeId: string, index: number) => { void library.restoreCanvasVersion(id, nodeId, index).then(() => library.canvas(id)).then((data) => mergeServer(data.nodes)).catch(() => notify(t('Не удалось вернуть версию'))) }
  const nodeContent = (nodeId: string) => {
    const node = nodesRef.current.find((item) => item.id === nodeId)
    const data = shownCanvasData((node?.data ?? {}) as { activeAt?: number; history?: Array<{ result?: string; imageFile?: string }>; title?: string; name?: string; label?: string; text?: string; result?: string; imageFile?: string; ref?: string; instr?: string; items?: string[]; filter?: string; members?: Array<{ id: string; title: string; image?: string; text?: string; cat?: string }>; contains?: string[] })
    const card = data.ref ? byId.get(data.ref) : undefined
    const members = node?.type === 'frame' || (node?.type === 'group' && data.contains)
      ? ((node?.type === 'frame' ? (node.data.members as string[] | undefined) : data.contains) ?? []).flatMap((memberId) => {
          const child = nodesRef.current.find((item) => item.id === memberId)
          return child ? [{ id: child.id, title: String(child.data.title ?? child.data.name ?? child.data.label ?? child.type), node: true }] : []
        })
      : node?.type === 'group' ? (data.members ?? []).filter((item) => !data.filter || data.filter === 'all' || item.cat === data.filter).map((item) => ({ id: item.id, title: item.title, image: item.image, node: false })) : undefined
    const title = data.title || data.name || data.label || card?.title || t('Результат ноды')
    const text = data.result || data.text || card?.text || (node?.type === 'choice' ? (data.items ?? []).join('\n\n---\n\n') : '') || (members ? members.map((item) => `- ${item.title} (${item.node ? `refkit:canvas/${id}#${item.id}` : `refkit:card/${item.id}`})`).join('\n') : '') || data.instr || ''
    return { node, data, title, text, members, card }
  }
  const expandNode = (nodeId: string) => {
    const { node, title, members, card } = nodeContent(nodeId)
    if (card) { onOpenCard(card.id); return }
    if (node?.type === 'frame') { setFrameView({ id: nodeId, title, members: members ?? [] }); return }
    if (node) setExpandedId(nodeId)
  }
  const downloadScreen = (nodeId: string) => {
    const { node, data, title, text } = nodeContent(nodeId)
    const link = document.createElement('a')
    if (node?.type === 'image' && data.imageFile) {
      link.href = data.imageFile
      link.download = data.imageFile.split('/').pop() ?? title
      link.click()
      return
    }
    const screen = node?.type === 'screen'
    link.href = URL.createObjectURL(new Blob([text], { type: screen ? 'text/html' : 'text/markdown' }))
    link.download = `${title.replace(/[\\/:*?"<>|]+/g, ' ').trim()}.${screen ? 'html' : 'md'}`
    link.click(); URL.revokeObjectURL(link.href)
  }
  // PDF презентации: сервер печатает страницу в Chrome, браузер сохраняет файл
  const downloadPdf = async (nodeId: string) => {
    try {
      // В снимке (только просмотр) PDF собран заранее при экспорте и лежит рядом со страницей
      const response = SNAPSHOT ? await fetch(`pdf/${nodeId}.pdf`) : await fetch(`/api/library/canvas/${id}/pdf`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ node: nodeId }) })
      if (!response.ok) throw new Error('pdf')
      const link = document.createElement('a')
      link.href = URL.createObjectURL(await response.blob())
      link.download = `${String((nodesRef.current.find((node) => node.id === nodeId)?.data as { title?: string } | undefined)?.title || t('экран')).replace(/[\\/:*?"<>|]+/g, ' ').trim()}.pdf`
      link.click(); URL.revokeObjectURL(link.href)
    } catch { notify(t('Не удалось собрать PDF')) }
  }
  const copyForAgent = (nodeId: string) => {
    const { node, data, title, text, card } = nodeContent(nodeId)
    if (!node) return
    const sources = ((node.data.inputRefs as string[] | undefined) ?? []).map((ref) => byId.get(ref)).filter(Boolean).map((item) => `- ${item!.title} (refkit:card/${item!.id})`)
    const tail = [sources.length ? t('Источники:') + `\n${sources.join('\n')}` : '', t('Холст: refkit:canvas/{id} · эта нода: refkit:canvas/{id}#{nodeId}', { id, nodeId })]
    const put = (parts: string[]) => void navigator.clipboard.writeText(parts.filter((line, index, list) => line !== '' || list[index - 1] !== '').join('\n')).then(() => notify(t('Скопировано — вставь агенту'))).catch(() => notify(t('Не удалось скопировать')))
    // Экран — это HTML на тысячи токенов: файлом в папке холста, агенту путь и ссылка (по MCP код читается целиком); текст отдаём как есть
    if (node?.type === 'screen' && data.result && !(typeof data.activeAt === 'number' && data.history?.[data.activeAt])) {
      void library.exportCanvasNode(id, nodeId).then(({ path, size, sourcePath }) => put([`# ${data.title || t('Экран')}`, '', ...(sourcePath ? [t('Исходник React/shadcn: {path}', { path: sourcePath }), t('Прочитай TSX целиком; используй компоненты и токены Refkit.')] : []), t('Автономный HTML экрана ({size} символов): {path}', { size, path }), t('Через MCP исходник доступен по refkit_read с ссылкой ниже.'), '', ...tail])).catch(() => notify(t('Не удалось сохранить экран файлом')))
      return
    }
    put([`# ${title}`, '', text.trim(), ...(data.imageFile ? ['', t('Картинка') + ': ' + new URL(data.imageFile, window.location.origin).href] : []), ...(card ? ['', `refkit:card/${card.id}`] : []), '', ...tail])
  }
  // «На холст» из ноды-папки: материал отдельной карточкой справа от неё, каждый следующий — ниже
  const placeCard = (groupId: string, ref: string) => {
    const group = nodesRef.current.find((node) => node.id === groupId)
    if (!group) return
    const placed = nodesRef.current.filter((node) => node.type === 'card' && node.data.placedFrom === groupId).length
    add({ type: 'card', position: { x: group.position.x + (group.measured?.width ?? 300) + 80, y: group.position.y + placed * 40 }, width: cardWidth, height: Math.round(cardWidth * ratioOf(items.find((item) => item.id === ref)?.ratio ?? '4 / 3')), data: { ref, placedFrom: groupId } })
  }
  const saveNode = (nodeId: string) => { const kind = nodesRef.current.find((node) => node.id === nodeId)?.type; const screen = kind === 'screen'; void library.saveCanvasNode<{ title: string }>(id, nodeId).then(() => notify(kind === 'image' ? t('Картинка добавлена в библиотеку') : screen ? t('Экран добавлен в библиотеку картинкой') : t('Результат добавлен в библиотеку как заметка'))).catch(() => notify(t('Не удалось сохранить в библиотеку'))) }
  // Дублирование (одной ноды или нескольких): копия держит свои входы. Связи внутри выделенного повторяются между копиями, входящие связи от нод вне
  // выделения подключаются и к копии; исходящие наружу не копируем, чтобы копия не кормила чужие ноды вторым результатом. У рамки в копии свой набор
  // members. Один шаг в истории
  const duplicateMany = useCallback((ids: string[]) => {
    const chosen = nodesRef.current.filter((node) => ids.includes(node.id) && !isGhost(node))
    if (!chosen.length) return
    mark()
    const stamp = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`
    const rename = new Map(chosen.map((node, at) => [node.id, `n-${stamp}${at}`]))
    const copies = chosen.map((source) => {
      const data = stripDerived(source.type, source.data) as Record<string, unknown>
      data.copyOf = source.id // сервер при сохранении перенесёт в копию результат и историю источника (клиент ими не владеет)
      if (source.type === 'frame' && Array.isArray(data.members)) data.members = (data.members as string[]).map((member) => rename.get(member) ?? member).filter((member) => [...rename.values()].includes(member))
      return { ...source, id: rename.get(source.id)!, position: { x: source.position.x + 40, y: source.position.y + 40 }, selected: true, data } as Node
    })
    const links = edgesRef.current.filter((edge) => rename.has(edge.target) && !edge.id.startsWith('ghost-')).map((edge) => ({ ...edge, id: `e-${stamp}-${edge.source}-${edge.target}`, source: rename.get(edge.source) ?? edge.source, target: rename.get(edge.target)!, selected: false }) as Edge)
    setNodes((list) => [...list.map((node) => ({ ...node, selected: false })), ...copies])
    setEdges((list) => [...list, ...links])
  }, [mark])
  const duplicate = useCallback((nodeId: string) => duplicateMany([nodeId]), [duplicateMany])
  // «+» у выхода ноды (ButtonHandle из React Flow UI): новая агентная нода справа, уже соединённая
  const addNext = useCallback((nodeId: string) => {
    mark()
    const source = nodesRef.current.find((node) => node.id === nodeId)
    if (!source) return
    const stamp = Date.now().toString(36)
    const next = `a-${stamp}`
    setNodes((list) => [...list.map((node) => ({ ...node, selected: false })), { id: next, type: 'agent', position: { x: source.position.x + (source.measured?.width ?? source.width ?? 280) + 90, y: source.position.y }, selected: true, data: { title: t('Агент'), instr: '' } } as Node])
    setEdges((list) => [...list, { ...edgeOptions, id: `e-${stamp}-${nodeId}`, source: nodeId, target: next } as Edge])
  }, [])
  // «+» посередине связи: новая агентная нода между двумя, связь делится надвое
  const insertBetween = useCallback((edgeId: string) => {
    mark()
    const edge = edgesRef.current.find((item) => item.id === edgeId)
    const from = nodesRef.current.find((node) => node.id === edge?.source), to = nodesRef.current.find((node) => node.id === edge?.target)
    if (!edge || !from || !to) return
    const stamp = Date.now().toString(36), next = `a-${stamp}`
    const x = (from.position.x + (from.measured?.width ?? 280) + to.position.x) / 2 - 140, y = (from.position.y + to.position.y) / 2
    setNodes((list) => [...list.map((node) => ({ ...node, selected: false })), { id: next, type: 'agent', position: { x, y }, selected: true, data: { title: t('Агент'), instr: '' } } as Node])
    setEdges((list) => [...list.filter((item) => item.id !== edgeId), { ...edgeOptions, id: `e-${stamp}-a`, source: edge.source, target: next } as Edge, { ...edgeOptions, id: `e-${stamp}-b`, source: next, target: edge.target } as Edge])
  }, [])
  const outgoing = useMemo(() => new Set(edges.map((edge) => edge.source)), [edges])
  const showPrompt = useCallback((nodeId: string) => {
    void (async () => {
      try {
        await saveNow()
        const view = await library.canvasPrompt(id, nodeId)
        setPromptView({ ...view, title: String((nodesRef.current.find((node) => node.id === nodeId)?.data as { title?: string } | undefined)?.title ?? t('Нода')) })
      } catch { notify(t('Не удалось показать запрос')) }
    })()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  const env = useMemo<Env>(() => ({ expandedId, collapse: () => { setExpandedId(null); setTool('select') }, editText: (nodeId, from, to) => { void saveNow().then(() => library.editCanvasText(id, nodeId, from, to)).then(() => library.canvas(id)).then((data) => mergeServer(data.nodes)).catch((error) => notify((error as Error).message)) }, toggleComment: () => setTool(tool === 'comment' ? 'select' : 'comment'), fitHeight, downloadPdf: (nodeId) => void downloadPdf(nodeId), runAfter: (nodeId) => void runAfter(nodeId), refine: (nodeId, text) => void refine(nodeId, text), activate: (nodeId, index) => activate(nodeId, index), redoItem: (choiceId, index) => void redoItem(choiceId, index), commenting: tool === 'comment', apply: (nodeId) => void applyEdits(nodeId), items: byId, open: onOpenCard, patch, remove, duplicate, showPrompt, addNext, insertBetween, outgoing, models: modelList?.models ?? [], defaultModel: modelList?.models.find((model) => model.key === modelList.assigned.ask)?.label ?? '', expand: expandNode, copyForAgent, multi, addInput: (nodeId) => { const node = nodesRef.current.find((item) => item.id === nodeId); if (node) setSpot({ to: nodeId, at: { x: node.position.x - 180, y: node.position.y + (node.measured?.height ?? 320) / 2 } }) }, placeCard, removeFromGroup: (groupId, itemId) => removeFromGroupRef.current(groupId, itemId), ungroup: (listId) => ungroupRef.current(listId), toggleList: (listId) => toggleListRef.current(listId), addToFolder: (folderId) => onAddToFolder?.(folderId), run: (nodeId) => void runNode(nodeId), runFrom: (nodeId) => void runPlan('downstream', nodeId), runAll: () => void runPlan('all'), stop: stopNode, save: saveNode, download: downloadScreen, restore: restoreVersion, setKind: (nodeId, kind) => { mark(); setNodes((list) => list.map((node) => node.id === nodeId ? { ...node, type: kind, data: kind === 'screen' ? { designSystem: 'fluid', ...node.data, ...((node.data as { instr?: string }).instr ? {} : { instr: SCREEN_INSTR }) } : node.data } : node)) }, actions, manage: () => { flush(); onManageActions?.() } }), [byId, onOpenCard, patch, remove, duplicate, showPrompt, addNext, insertBetween, outgoing, actions, onManageActions, modelList, multi, tool, expandedId]) // eslint-disable-line react-hooks/exhaustive-deps

  const add = (node: Omit<Node, 'id'>) => { mark(); setNodes((list) => [...list.map((item) => ({ ...item, selected: false })), { ...node, id: `n-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`, selected: true } as Node]) }
  // Бросить материал на ноду-папку: он переезжает в эту папку (как «Переместить в…» в библиотеке). Работает и для карточки на холсте, и для материала с полки
  const folderAt = (x: number, y: number) => nodesRef.current.find((node) => node.type === 'group' && (node.data as { groupKind?: string }).groupKind === 'folder' && x >= node.position.x && x <= node.position.x + (node.measured?.width ?? node.width ?? 400) && y >= node.position.y && y <= node.position.y + (node.measured?.height ?? node.height ?? 400))
  const sendToFolder = (refs: string[], folder: Node) => {
    onMoveToFolder?.(refs, String((folder.data as { key?: string }).key))
    // Состав ноды-папки считает сервер: подтягиваем свежий через мгновение, когда перенос уже записан
    setTimeout(() => { void library.canvas(id).then((data) => mergeServer(data.nodes)).catch(() => {}) }, 700)
  }
  // Куда бросили — по курсору: если он над нодой-папкой, карточки (все перетаскиваемые) уходят в неё
  const pointerFolder = (event: MouseEvent | TouchEvent) => { const point = 'changedTouches' in event ? event.changedTouches[0] : event; const at = screenToFlowPosition({ x: point.clientX, y: point.clientY }); return folderAt(at.x, at.y) }
  // «Убрать» на плитке ноды: из папки материал уходит во «Входящие», из подборки — выпадает из неё, из списка — ноде возвращается свобода (остаётся на доске)
  const removeFromGroup = (groupId: string, itemId: string) => {
    const group = nodesRef.current.find((node) => node.id === groupId)
    if (!group) return
    const data = group.data as { groupKind?: string; key?: string; contains?: string[] }
    mark()
    if (data.groupKind === 'folder') onMoveToFolder?.([itemId], 'inbox')
    else if (data.groupKind === 'board') onRemoveFromBoard?.(itemId, String(data.key))
    else if (data.groupKind === 'list') {
      const member = nodesRef.current.find((node) => (data.contains ?? []).includes(node.id) && (node.id === itemId || (node.data as { ref?: string }).ref === itemId))
      if (member) setNodes((all) => all.map((node) => node.id === groupId ? { ...node, data: { ...node.data, contains: (data.contains ?? []).filter((memberId) => memberId !== member.id) } } : node))
    }
    setTimeout(() => { void library.canvas(id).then((fresh) => mergeServer(fresh.nodes)).catch(() => {}) }, 700)
  }
  removeFromGroupRef.current = removeFromGroup
  const dropCards = (dragged: Node[], folder: Node | undefined) => {
    const cards = folder ? dragged.filter((node) => node.type === 'card') : []
    const moves = folder ? cards.map((card) => ({ card, folder })) : []
    setDropFolder(null)
    if (!moves.length) return
    mark()
    const gone = new Set(moves.map((move) => move.card.id))
    for (const folder of new Set(moves.map((move) => move.folder))) sendToFolder(moves.filter((move) => move.folder === folder).map((move) => String((move.card.data as { ref?: string }).ref)), folder)
    setNodes((all) => all.filter((node) => !gone.has(node.id)))
    // Связи карточки переезжают на папку: она теперь держит материал вместо неё
    setEdges((all) => {
      const seen = new Set<string>()
      const owner = new Map(moves.map((move) => [move.card.id, move.folder.id]))
      return all.map((edge) => owner.has(edge.source) ? { ...edge, id: `e-${owner.get(edge.source)}-${edge.target}`, source: owner.get(edge.source)! } : edge).filter((edge) => { const key = `${edge.source}>${edge.target}`; if (gone.has(edge.target) || edge.source === edge.target || seen.has(key)) return false; seen.add(key); return true })
    })
  }
  // Список — одна сущность для «собрать вместе»: любые ноды (карточки, агенты, картинки, экраны, подписи) уходят в одну ноду с одним выходом.
  // Участники остаются живыми нодами доски: свёрнутый список показывает их плитками, развёрнутый — рамкой вокруг них. Следующие ноды получают всех участников
  const groupSelected = () => {
    // Выделена рамка-этап — это «вся доска» (⌘A), а не набор материалов: список проглотил бы ноды из рамок, и рамки остались бы пустыми
    if (nodesRef.current.some((node) => node.selected && node.type === 'frame')) return
    const picked = nodesRef.current.filter((node) => node.selected && node.type !== 'group' && node.type !== 'frame' && !isGhost(node))
    if (picked.length < 2) return
    mark()
    const inside = new Set(picked.map((node) => node.id))
    const listId = `n-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`
    const list = { id: listId, type: 'group', position: { x: Math.min(...picked.map((item) => item.position.x)), y: Math.min(...picked.map((item) => item.position.y)) }, data: { groupKind: 'list', name: t('Список'), contains: [...inside], open: false, view: 'grid' }, selected: true } as Node
    setNodes((all) => [...all.map((item) => ({ ...item, selected: false })), list])
    // Связи участников наружу переезжают на список: у него один выход вместо пачки линий
    setEdges((all) => {
      const seen = new Set<string>()
      return all.map((edge) => inside.has(edge.source) && !inside.has(edge.target) ? { ...edge, id: `e-${listId}-${edge.target}`, source: listId } : edge).filter((edge) => { const key = `${edge.source}>${edge.target}`; if (seen.has(key)) return false; seen.add(key); return true })
    })
  }
  groupRef.current = groupSelected
  // Развернуть/свернуть: развёрнутый список — рамка по участникам (лежит под ними), свёрнутый — плитки; участники при этом прячутся и показываются
  const toggleList = (listId: string) => {
    const list = nodesRef.current.find((node) => node.id === listId)
    if (!list) return
    const members = ((list.data as { contains?: string[] }).contains ?? []).map((memberId) => nodesRef.current.find((node) => node.id === memberId)).filter((node): node is Node => Boolean(node))
    const opening = !(list.data as { open?: boolean }).open
    mark()
    if (opening && members.length) {
      const pad = 24
      const box = members.map((node) => ({ x: node.position.x, y: node.position.y, w: node.measured?.width ?? node.width ?? 300, h: node.measured?.height ?? node.height ?? 140 }))
      const left = Math.min(...box.map((item) => item.x)) - pad
      const top = Math.min(...box.map((item) => item.y)) - pad - 24
      setNodes((all) => all.map((node) => node.id === listId ? { ...node, position: { x: left, y: top }, width: Math.max(...box.map((item) => item.x + item.w)) + pad - left, height: Math.max(...box.map((item) => item.y + item.h)) + pad - top, zIndex: -1, data: { ...node.data, open: true, sized: true } } : node))
    } else setNodes((all) => all.map((node) => node.id === listId ? { ...node, width: undefined, height: undefined, zIndex: undefined, data: { ...node.data, open: false, sized: false } } : node))
  }
  toggleListRef.current = toggleList
  // Разобрать: список исчезает, участники остаются как были, а его исходящие связи расходятся по каждому участнику
  const ungroupList = (listId: string) => {
    const list = nodesRef.current.find((node) => node.id === listId)
    const members = ((list?.data as { contains?: string[] } | undefined)?.contains ?? []).filter((memberId) => nodesRef.current.some((node) => node.id === memberId))
    if (!list) return
    mark()
    setNodes((all) => all.filter((node) => node.id !== listId).map((node) => ({ ...node, selected: false })))
    setEdges((all) => all.flatMap((edge) => edge.source === listId ? members.map((memberId) => ({ ...edge, id: `e-${memberId}-${edge.target}`, source: memberId })) : edge.target === listId ? [] : [edge]))
  }
  ungroupRef.current = ungroupList
  // Рамка с members двигается — её ноды получают тот же сдвиг (кроме тех, что и так двигаются вместе с ней в общем выделении)
  const withGroupMoves = (changes: NodeChange[], list: Node[]): NodeChange[] => {
    const extra: NodeChange[] = []
    for (const change of changes) {
      if (change.type !== 'position' || !change.position) continue
      const frame = list.find((node) => node.id === change.id)
      const data = frame?.data as { members?: string[]; contains?: string[]; groupKind?: string } | undefined
      const members = frame?.type === 'frame' ? (data?.members ?? []) : frame?.type === 'group' && data?.groupKind === 'list' ? (data.contains ?? []) : []
      if (!frame || !members.length) continue
      const dx = change.position.x - frame.position.x
      const dy = change.position.y - frame.position.y
      for (const id of members) {
        const node = list.find((item) => item.id === id)
        if (!node || changes.some((other) => other.type === 'position' && other.id === id)) continue
        extra.push({ type: 'position', id, position: { x: node.position.x + dx, y: node.position.y + dy }, dragging: change.dragging })
      }
    }
    return extra.length ? [...changes, ...extra] : changes
  }
  const addGroup = (group: { kind: string; key: string; name: string }, at: { x: number; y: number }) => add({ type: 'group', position: { x: at.x - 120, y: at.y - 40 }, data: { groupKind: group.kind, key: group.key, name: group.name } })
  const addCard = (refId: string, at: { x: number; y: number }) => {
    const item = byId.get(refId) // только что добавленный материал может ещё не дойти до списка — тогда берём привычные пропорции
    add({ type: 'card', position: { x: at.x - cardWidth / 2, y: at.y - 40 }, width: cardWidth, height: Math.round(cardWidth * ratioOf(item?.ratio ?? '4 / 3')), data: { ref: refId } })
  }
  const stack = useRef(0)
  // Шаблон цепочки (TEMPLATES): шаги слева направо, соединены подряд, шаги одного этапа — в общей цветной рамке (как у Weave);
  // выделенные карточки, подборки и подписи сразу подключаются ко входу первого шага
  // Шаблоны-графы («Проверка гипотезы», «Лендинг продукта»): целая цепочка из общего описания (узлы, связи, рамки этапов); папки шаблона заводятся новые для этой доски
  const addGraph = async (key: string, point?: { x: number; y: number }) => {
    const at = point ?? center(), stamp = Date.now().toString(36)
    const folder = async (name: string) => { const made = await library.createFolder(name); return { key: made.id, name } }
    // Референсы брендбука: полка «Под рукой», если на ней что-то лежит (материалы остаются на месте), иначе новая пустая папка
    const brandRefs = async () => { const shelf = (await library.boards().catch(() => [])).find((board) => board.shelf); return shelf?.order?.length ? { kind: 'board' as const, key: shelf.name, name: t('Пины') } : await folder(t('Референсы')) }
    let chain: ReturnType<typeof hypothesisChain>
    try {
      chain = key === 'brandbook'
        ? brandbookChain({ brief: t('Name: название бренда\nWhat it is: что это, два предложения\nFor whom: для кого\n\nПоложи референсы в папку «{refs}» слева. Выбери начертание, затем палитру и пару шрифтов. Брендбук использует первую букву выбранного вордмарка как знак.', { refs: t('Референсы') }), refs: await brandRefs() })
        : key === 'landing-reference'
        ? landingReferenceChain({ notes: t('Пара слов о продукте своими словами: что это, для кого и в каком порядке рассказывать. Документы положи рядом подписями и соедини с паспортом; в папку снимков — красивые кадры продукта, страница соберётся из них.'), shots: await folder(t('Снимки продукта')), refs: await folder(t('Референс лендинга')) })
        : key === 'product-landing'
        ? productLandingChain({ notes: t('Пара слов о продукте своими словами: что это и для кого. Документы (позиционирование, PRD) положи рядом подписями и соедини с паспортом — агент сам разделит, что видно на снимках, а что только обещано.'), shots: await folder(t('Снимки продукта')), refs: await folder(t('Референс лендинга')), fragments: await folder(t('Куски интерфейса')) })
        : hypothesisChain({ idea: t('Опиши идею в нескольких предложениях: что это, для кого, что делает.'), frames: await folder(t('Кадры продукта')) })
    } catch { notify(t('Не удалось создать папку для кадров')); return }
    mark()
    const ids = new Map(chain.nodes.map((node) => [node.id, `${node.id}-${stamp}`]))
    const placed = chain.nodes.map((node) => ({ id: ids.get(node.id)!, type: node.type, position: { x: at.x + node.position.x, y: at.y + node.position.y }, width: node.width, height: node.height, data: node.data })) as Node[]
    const frames = chain.stages.map((stage) => {
      const own = placed.filter((node) => stage.members.some((member) => ids.get(member) === node.id))
      const left = Math.min(...own.map((node) => node.position.x)) - 40, top = Math.min(...own.map((node) => node.position.y)) - 40
      const right = Math.max(...own.map((node) => node.position.x + (node.width ?? 0))) + 40, bottom = Math.max(...own.map((node) => node.position.y + (node.height ?? 0))) + 40
      return { id: `${stage.id}-${stamp}`, type: 'frame', position: { x: left, y: top }, width: right - left, height: bottom - top, data: { label: stage.label, hue: stage.hue, hug: true, members: stage.members.map((member) => ids.get(member)).filter(Boolean) } } as Node
    })
    setNodes((list) => [...list.map((item) => ({ ...item, selected: false })), ...frames, ...placed])
    setEdges((list) => [...list, ...chain.edges.map(([source, target]) => ({ ...edgeOptions, id: `e-${stamp}-${source}-${target}`, source: ids.get(source)!, target: ids.get(target)! }) as Edge)])
    setTimeout(() => { void fitRef.current({ maxZoom: 0.5, padding: 0.1, duration: 400 }) }, 120)
  }
  const addChain = (point?: { x: number; y: number }, key = 'rules-concepts') => {
    const template = TEMPLATES.find((item) => item.key === key) ?? TEMPLATES[0]
    if (template.graph) { void addGraph(template.key, point); return }
    mark()
    const at = point ?? center(), stamp = Date.now().toString(36)
    const ids = template.steps.map((_, index) => `a-${stamp}${index}`)
    const inputs = nodes.filter((node) => node.selected && (node.type === 'card' || node.type === 'text' || node.type === 'group'))
    const W = 320, H = 320, GAP = 48, PAD = 32, STAGE_GAP = 112 // ширина и высота обычной ноды, зазор между нодами, поле рамки, зазор между рамками
    let x = at.x - 340
    const placed = template.steps.map((step, index) => {
      if (index > 0 && step.stage !== template.steps[index - 1].stage) x += STAGE_GAP - GAP
      const position = { x, y: at.y - 40 }
      x += W + GAP
      return { id: ids[index], type: step.type, position, data: { title: step.title, ...(step.pick ? { pick: true } : {}), ...(step.type === 'choice' ? {} : { instr: step.instr ?? '' }), ...(step.type === 'screen' ? { designSystem: 'fluid' } : {}), ...(step.remember ? { remember: true } : {}), ...(step.preset === undefined ? {} : { actionId: actions.find((action) => action.name === PRESETS[step.preset!].title)?.id }) } }
    })
    const frames = [...new Set(template.steps.map((step) => step.stage))].map((stage) => {
      const own = placed.filter((_, index) => template.steps[index].stage === stage)
      const left = Math.min(...own.map((node) => node.position.x)), right = Math.max(...own.map((node) => node.position.x)) + W
      const { label, hue } = TEMPLATE_STAGES[stage]
      return { id: `f-${stamp}-${stage}`, type: 'frame', position: { x: left - PAD, y: at.y - 40 - PAD }, width: right - left + 2 * PAD, height: H + 2 * PAD, data: { label: label(), hue, members: own.map((node) => node.id) } }
    })
    setNodes((list) => [...list.map((item) => ({ ...item, selected: false })), ...frames, ...placed] as Node[])
    const link = (source: string, target: string) => ({ ...edgeOptions, id: `e-${stamp}-${source}-${target}`, source, target }) as Edge
    setEdges((list) => [...list, ...ids.slice(1).flatMap((id, index) => (template.steps[index + 1].from ?? [index]).map((from) => link(ids[from], id))), ...template.steps.flatMap((step, index) => index === 0 || step.refs ? inputs.map((node) => link(node.id, ids[index])) : [])])
  }
  addChainRef.current = addChain
  const addAgent = (kind: 'agent' | 'screen' | 'image' | 'choice', point?: { x: number; y: number }) => {
    const entry = spotEntries().find((item) => item.key === kind)
    if (entry) placeSpot(entry, point ?? center())
  }
  const center = () => { const box = frame.current?.getBoundingClientRect(); return screenToFlowPosition({ x: (box?.left ?? 0) + (box?.width ?? 0) / 2, y: (box?.top ?? 0) + (box?.height ?? 0) / 2 }) }

  type SpotEntry = { key: string; group: string; label: string; hint?: string; image?: string; type: string; data?: Record<string, unknown>; width?: number; height?: number }
  // Новые ноды не должны появляться за краем экрана: если вышли за кадр, камера плавно подъезжает (масштаб не меняется)
  const reveal = (ids: string[]) => setTimeout(() => {
    const box = frame.current?.getBoundingClientRect()
    const vp = getViewport()
    const picked = nodesRef.current.filter((node) => ids.includes(node.id))
    if (!box || !picked.length) return
    const out = picked.some((node) => { const x = node.position.x * vp.zoom + vp.x, y = node.position.y * vp.zoom + vp.y, w = (node.measured?.width ?? 300) * vp.zoom, h = (node.measured?.height ?? 140) * vp.zoom; return x < 0 || y < 0 || x + w > box.width || y + h > box.height })
    if (out) void fitRef.current({ nodes: picked.map((node) => ({ id: node.id })), minZoom: vp.zoom, maxZoom: vp.zoom, padding: 0.4, duration: 300 })
  }, 150)
  const spotEntries = (): SpotEntry[] => [
    { key: 'agent', group: t('Ноды'), label: t('Агент'), hint: t('делает по инструкции, отвечает текстом'), type: 'agent', data: { title: t('Агент'), instr: '' } },
    { key: 'screen', group: t('Ноды'), label: t('Экран'), hint: t('рисует страницу по входам'), type: 'screen', data: { title: t('Экран'), instr: SCREEN_INSTR, designSystem: 'fluid' } },
    { key: 'image', group: t('Ноды'), label: t('Картинка'), hint: t('рисует картинку по входам (ChatGPT)'), type: 'image', data: { title: t('Картинка'), instr: '' } },
    { key: 'choice', group: t('Ноды'), label: t('Выбор'), hint: t('ты отмечаешь вариант, дальше только он'), type: 'choice', data: { title: t('Выбор') } },
    { key: 'text', group: t('Ноды'), label: t('Подпись'), hint: t('твой текст на вход'), type: 'text', width: 200, height: 80, data: { text: '', fresh: true } },
    ...TEMPLATES.map((template) => ({ key: `template-${template.key}`, group: t('Шаблоны'), label: template.label, hint: template.hint, type: 'chain', data: { template: template.key } })),
    ...actions.map((action) => ({ key: `skill-${action.id}`, group: t('Умения'), label: action.name ?? action.text.slice(0, 32), hint: t('агент с этой инструкцией'), type: 'agent', data: { title: action.name ?? t('Умение'), instr: action.text, actionId: action.id } })),
    ...groups.map((group) => ({ key: `group-${group.kind}-${group.key}`, group: t('Папки и подборки'), label: group.name, hint: group.kind === 'folder' ? t('папка целиком') : t('подборка целиком'), type: 'group', data: { groupKind: group.kind, key: group.key, name: group.name } })),
    ...items.filter((item) => item.id !== id && item.kind !== 'canvas').slice(0, 400).map((item) => ({ key: `card-${item.id}`, group: t('Материалы'), label: item.title, type: 'card', image: item.image, width: cardWidth, height: Math.round(cardWidth * ratioOf(item.ratio)), data: { ref: item.id } })),
  ]
  const placeSpot = (entry: SpotEntry, where?: { x: number; y: number }) => {
    const at = where ?? spot?.at ?? center(), from = where ? undefined : spot?.from, to = where ? undefined : spot?.to
    if (entry.type === 'chain') { setSpot(null); addChain(at, String(entry.data?.template ?? '')); return }
    mark()
    const stamp = Date.now().toString(36), made = `n-${stamp}${Math.random().toString(36).slice(2, 5)}`
    reveal([made])
    setNodes((list) => [...list.map((node) => ({ ...node, selected: false })), { id: made, type: entry.type, position: { x: at.x - (entry.width ?? 280) / 2, y: at.y - 40 }, ...(entry.width ? { width: entry.width, height: entry.height } : {}), ...(entry.type === 'frame' ? { zIndex: -1 } : {}), selected: true, data: entry.data ?? {} } as Node])
    if (from) setEdges((list) => [...list, { ...edgeOptions, id: `e-${stamp}-${from}`, source: from, target: made } as Edge])
    if (to) setEdges((list) => [...list, { ...edgeOptions, id: `e-${stamp}-in-${to}`, source: made, target: to } as Edge])
    setSpot(null)
  }
  useEffect(() => {
    const on = (event: KeyboardEvent) => {
      if (event.key !== '/' || event.metaKey || event.ctrlKey || event.altKey || (event.target as HTMLElement | null)?.closest('input, textarea, select, [contenteditable="true"], [role="dialog"], [cmdk-root]')) return
      event.preventDefault(); setSpot({})
    }
    window.addEventListener('keydown', on)
    return () => window.removeEventListener('keydown', on)
  }, [])

  // Удаление без возврата — риск для доски, которую собирали долго: снимок до удаления и «Вернуть» в уведомлении.
  // Удаление узла шлёт правки и узлов, и стрелок подряд — одно уведомление на пачку
  const before = useRef({ nodes, edges, at: 0 })
  before.current = Date.now() - before.current.at < 300 ? before.current : { nodes, edges, at: 0 }
  const undoable = () => {
    if (Date.now() - before.current.at < 300) return
    const snapshot = { nodes: before.current.nodes, edges: before.current.edges }
    before.current = { ...before.current, at: Date.now() }
    notify(t('Удалено'), { undo: () => { setNodes(snapshot.nodes); setEdges(snapshot.edges) } })
  }

  // Рамка и текст — выбрал инструмент, кликнул по доске; после одного клика инструмент возвращается в «выбор»
  const place = (event: React.MouseEvent) => {
    if (tool !== 'text') return
    const at = screenToFlowPosition({ x: event.clientX, y: event.clientY })
    add({ type: 'text', position: at, width: 200, height: 48, data: { text: '', fresh: true } })
    setTool('select')
  }

  // V / F / T — выбор, рамка, текст (не в полях ввода); Esc — снять инструмент
  useEffect(() => {
    const keys: Record<string, Tool> = { v: 'select', t: 'text', c: 'comment', k: 'cut' }
    const on = (event: KeyboardEvent) => {
      if (document.querySelector('[role="dialog"]') || event.metaKey || event.ctrlKey || event.altKey || (event.target as HTMLElement | null)?.closest('input, textarea, [contenteditable="true"]')) return
      const key = event.key.toLowerCase()
      const next = keys[key]
      if (next) { setTool(next); if (next === 'comment') props.onOpenComments?.() }
      else if (key === 'd') void fitRef.current({ maxZoom: 1, padding: 0.2, duration: 300 })
      else if (key === 'f') { const picked = nodesRef.current.filter((node) => node.selected).map((node) => ({ id: node.id })); if (picked.length) void fitRef.current({ nodes: picked, maxZoom: 1.5, padding: 0.3, duration: 300 }) }
      else if (key === 'n') { event.preventDefault(); setSpot({}) }
      else if (key === 'm') { event.preventDefault(); setPickerOpen((on) => !on) }
    }
    window.addEventListener('keydown', on)
    return () => window.removeEventListener('keydown', on)
  }, [])
  useEffect(() => {
    if (tool === 'select') return
    // Esc только снимает инструмент: в фазе перехвата и с preventDefault, иначе страница библиотеки заодно закроет сам холст
    const off = (event: KeyboardEvent) => { if (event.key === 'Escape' && !(event.target as HTMLElement | null)?.closest('input, textarea')) { event.preventDefault(); setTool('select') } }
    window.addEventListener('keydown', off, true)
    return () => window.removeEventListener('keydown', off, true)
  }, [tool])

  // Предложение агента (MCP): над холстом строка с «Показать / Принять / Отклонить»; «Показать» рисует новые ноды и связи призраками поверх доски,
  // «Принять» применяет правки на сервере одним шагом (⌘Z возвращает прежнюю доску), «Отклонить» убирает предложение
  const proposal = proposals[0]
  useEffect(() => {
    if (!loaded) return
    const timer = setInterval(() => { if (!document.hidden) void library.canvas(id).then((data) => setProposals((was) => (JSON.stringify(was.map((item) => item.id)) === JSON.stringify((data.proposals ?? []).map((item) => item.id)) ? was : data.proposals ?? []))).catch(() => {}) }, 4000)
    return () => clearInterval(timer)
  }, [loaded, id])
  // Призраки живут в самой доске (чтобы React Flow измерил их и нарисовал связи), но на диск и в историю не попадают
  useEffect(() => {
    setNodes((list) => {
      const real = list.filter((node) => !isGhost(node))
      if (!ghostOn || !proposal) return real
      const base = { nodes: real.map((node) => ({ id: node.id, type: node.type, position: node.position, data: node.data as Record<string, unknown> })), edges: edgesRef.current.filter((edge) => !edge.id.startsWith('ghost-')).map((edge) => ({ source: edge.source, target: edge.target })) }
      const result = applyOps(base as never, proposal.ops as never)
      if (result.error) return real
      const known = new Set(real.map((node) => node.id))
      return [...real, ...result.data.nodes.filter((node) => !known.has(node.id)).map((node) => ({ ...node, type: String(node.type), draggable: false, selectable: false, connectable: false, deletable: false, focusable: false, className: 'pointer-events-none opacity-60 [&>div]:outline-2 [&>div]:outline-dashed [&>div]:outline-port-text/60', data: { ...node.data, ghost: true } }) as Node)]
    })
    setEdges((list) => {
      const real = list.filter((edge) => !edge.id.startsWith('ghost-'))
      if (!ghostOn || !proposal) return real
      const base = { nodes: nodesRef.current.filter((node) => !isGhost(node)).map((node) => ({ id: node.id, type: node.type, position: node.position, data: node.data as Record<string, unknown> })), edges: real.map((edge) => ({ source: edge.source, target: edge.target })) }
      const result = applyOps(base as never, proposal.ops as never)
      if (result.error) return real
      const known = new Set(real.map((edge) => `${edge.source}>${edge.target}`))
      return [...real, ...result.data.edges.filter((edge) => !known.has(`${edge.source}>${edge.target}`)).map((edge) => ({ id: `ghost-${edge.source}-${edge.target}`, source: String(edge.source), target: String(edge.target), type: 'ghost', selectable: false, focusable: false }) as Edge)]
    })
  }, [ghostOn, proposal?.id]) // eslint-disable-line react-hooks/exhaustive-deps
  const resolveProposal = async (action: 'accept' | 'decline') => {
    if (!proposal) return
    try {
      if (action === 'accept') { await saveNow(); mark() }
      const data = await library.resolveCanvasProposal(id, proposal.id, action)
      if (action === 'accept') { saved.current = null; applyBoard(data); notify(t('Правки агента применены. ⌘Z отменит')) } else setProposals(data.proposals ?? [])
      setGhostOn(false)
    } catch (error) { if (!stale(error)) notify((error as Error).message || t('Не удалось применить предложение')) }
  }
  // Связь показывает состояние: бежит точка, пока запускается следующая нода; пунктир, пока вход ещё не получил результат
  // Проверка соединения при протягивании: совместимые типы, не на себя, без циклов (приём из документации React Flow: getOutgoers)
  const isValid = (link: Edge | { source: string; target: string }) =>
    !connectionError(nodesRef.current.find((node) => node.id === link.source), nodesRef.current.find((node) => node.id === link.target), edgesRef.current)
  const live = (node?: Node) => node?.type === 'agent' || node?.type === 'screen' || node?.type === 'image'
  const hasSelection = nodes.some((node) => node.selected)
  const shownEdges = edges.map((edge) => {
    if (edge.id.startsWith('ghost-')) return edge
    const from = nodes.find((node) => node.id === edge.source), to = nodes.find((node) => node.id === edge.target)
    const dim = live(from) && (from!.data.status !== 'ready' || from!.data.stale)
    const touches = hasSelection && (from?.selected || to?.selected)
    return { ...edge, type: live(to) && to!.data.status === 'running' ? 'running' : 'flow', style: { ...(edge.style ?? {}), stroke: PORT_VAR[portOf(from)], strokeWidth: touches ? 3 : 2, opacity: dim ? 0.4 : hasSelection && !touches ? 0.3 : 1 } }
  })
  const nudge = (at: { x: number; y: number }) => { const step = (stack.current++ % 6) * 24; return { x: at.x + step, y: at.y + step } }
  const copyLink = () => { void navigator.clipboard.writeText(`refkit:canvas/${id}`); notify(t('Ссылка на холст скопирована — вставь её агенту')) }

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      {/* Шапка холста — два острова поверх него (план 01_strategy/islands-plan-2026-10-29.md): название слева, действия справа; из потока вышла, холст занимает всю высоту */}
      <header className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-start justify-between gap-2 p-4" style={{ paddingLeft: 'var(--canvas-inset, 16px)', paddingRight: '16px' }}>
        <Island className="max-w-[60%] min-w-0">
        <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" aria-label={t('Холсты')} onClick={() => { flush(); onBack() }}><ArrowLeft /></Button></TooltipTrigger><TooltipContent>{t('Холсты')}</TooltipContent></Tooltip>
        <Input aria-label={t('Название холста')} value={name} onChange={(event) => setName(event.target.value)} onBlur={() => { const next = name.trim(); if (next && next !== title) onRename(next); else setName(title) }}
          onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); if (event.key === 'Escape') { setName(title); event.currentTarget.blur() } }}
          className="h-8 min-w-16 max-w-full [field-sizing:content] border-0 bg-transparent px-2 text-sm font-medium shadow-none hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:ring-0 dark:bg-transparent" />
        </Island>
        <Island role="toolbar" aria-label={t('Действия холста')}>
          <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" aria-label={t('Отменить')} onClick={() => travel('undo')}><Undo2 /></Button></TooltipTrigger><TooltipContent>{t('Отменить')} <Kbd>⌘ Z</Kbd></TooltipContent></Tooltip>
          <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" aria-label={t('Повторить')} onClick={() => travel('redo')}><Redo2 /></Button></TooltipTrigger><TooltipContent>{t('Повторить')} <Kbd>⇧ ⌘ Z</Kbd></TooltipContent></Tooltip>
          <span aria-hidden className="mx-1 h-4 w-px bg-line" />
          <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" aria-label={t('Выровнять цепочку')} onClick={layout}><AlignHorizontalDistributeCenter /></Button></TooltipTrigger><TooltipContent>{t('Выровнять цепочку')}</TooltipContent></Tooltip>
          <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" aria-label={anyRunning ? t('Остановить всё') : t('Запустить всё')} disabled={SNAPSHOT} onClick={() => (anyRunning ? stopAll() : void runPlan('all'))}>{anyRunning ? <Square /> : <Play />}</Button></TooltipTrigger><TooltipContent>{anyRunning ? t('Остановить всё') : t('Запустить всё: свежие ноды пропускаются')}</TooltipContent></Tooltip>
          <span aria-hidden className="mx-1 h-4 w-px bg-line" />
          <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" aria-label={t('Скопировать для агента')} onClick={copyLink}><AgentCopyIcon /></Button></TooltipTrigger><TooltipContent>{t('Скопировать для агента')}</TooltipContent></Tooltip>
        </Island>
      </header>
      <div className="flex min-h-0 flex-1">
      <div ref={frame} className="relative min-h-0 min-w-0 flex-1" onDragOver={(event) => { if (event.dataTransfer.types.includes('application/x-refkit-card') || event.dataTransfer.types.includes(CARDS_MIME) || event.dataTransfer.types.includes('application/x-refkit-node')) event.preventDefault() }}
        onDrop={(event) => { const kind = event.dataTransfer.getData('application/x-refkit-node'); if (kind) { event.preventDefault(); const at = screenToFlowPosition({ x: event.clientX, y: event.clientY }); if (kind === 'chain') addChain(at); else if (kind === 'agent' || kind === 'screen' || kind === 'choice') addAgent(kind, at); else if (kind === 'frame') add({ type: 'frame', position: at, width: 360, height: 260, zIndex: -1, data: { label: '' } }); else add({ type: 'text', position: at, width: 200, height: 80, data: { text: '', fresh: true } }); return }
          const groupRaw = event.dataTransfer.getData('application/x-refkit-group'); if (groupRaw) { event.preventDefault(); addGroup(JSON.parse(groupRaw), screenToFlowPosition({ x: event.clientX, y: event.clientY })); return }
          const cardsRaw = event.dataTransfer.getData(CARDS_MIME)
          if (cardsRaw) { // пачка из панели «Материал из библиотеки»: на папку — отправить в неё, иначе разложить сеткой от точки сброса
            event.preventDefault(); const ids = JSON.parse(cardsRaw) as string[]; const dropAt = screenToFlowPosition({ x: event.clientX, y: event.clientY }); const folder = folderAt(dropAt.x, dropAt.y)
            if (folder) { sendToFolder(ids, folder); return }
            ids.forEach((refId, at) => addCard(refId, { x: dropAt.x + (at % 3) * (cardWidth + 24), y: dropAt.y + Math.floor(at / 3) * 200 })); return
          }
          const refId = event.dataTransfer.getData('application/x-refkit-card'); if (!refId) return; event.preventDefault(); const dropAt = screenToFlowPosition({ x: event.clientX, y: event.clientY }); const folder = folderAt(dropAt.x, dropAt.y); if (folder) { sendToFolder([refId], folder); return } addCard(refId, dropAt) }}>
        {SNAPSHOT && !wideScreen && phoneHint && (
          <div className="absolute inset-x-3 top-3 z-30 flex items-start gap-2 rounded-xl border border-line bg-card p-3 text-xs shadow-lg" role="note">
            <span className="flex-1 leading-snug">{t('Это холст из нод: удобнее смотреть на компьютере. Ноды открываются по одной кнопкой «Открыть».')}</span>
            <Button variant="ghost" size="icon-xs" aria-label={t('Закрыть')} onClick={() => setPhoneHint(false)}><X /></Button>
          </div>
        )}
        {/* Пустой холст: пять шаблонов цепочек чипами по центру (решение владельца 2026-10-27); с первой нодой пропадают. Подписей нет: чип — это название шаблона, подсказка — по наведению */}
        {loaded && !nodes.length && (
          <div className="pointer-events-none absolute inset-0 z-10 grid place-items-center p-6">
            <div className="pointer-events-auto flex max-w-xl flex-wrap justify-center gap-2" role="group" aria-label={t('Шаблоны')}>
              {TEMPLATES.map((template) => <Tooltip key={template.key}><TooltipTrigger asChild><Button variant="outline" size="sm" onClick={() => addChain(center(), template.key)}>{template.label}</Button></TooltipTrigger><TooltipContent>{template.hint}</TooltipContent></Tooltip>)}
            </div>
          </div>
        )}
        <CanvasEnv.Provider value={env}>
          <Canvas nodes={shownNodes} edges={shownEdges} nodeTypes={nodeTypes} edgeTypes={edgeTypes} connectionLineComponent={Connection} defaultEdgeOptions={edgeOptions}
            nodeDragThreshold={4}
            onNodeDoubleClick={(event, node) => {
              // Двойной клик по ноде с результатом открывает просмотр — то же, что «Развернуть». Поля ввода, кнопки и ссылки внутри ноды двойной клик не перехватывают
              const data = node.data as { result?: string; imageFile?: string } | undefined
              if (!data?.result && !data?.imageFile) return
              if ((event.target as HTMLElement).closest('input, textarea, select, button, a, [contenteditable="true"]')) return
              env.expand(node.id)
            }}
            onNodesChange={(changes: NodeChange[]) => {
              if (changes.some((change) => change.type === 'remove')) { mark(); undoable() } setNodes((list) => applyNodeChanges(withGroupMoves(changes, list), list)) }}
            onEdgesChange={(changes: EdgeChange[]) => { if (changes.some((change) => change.type === 'remove')) { mark(); undoable() } setEdges((list) => applyEdgeChanges(changes, list)) }}
            isValidConnection={isValid}
            onConnectEnd={(event, state) => {
              if (state.isValid || state.toNode || !state.fromNode) return
              const point = 'changedTouches' in event ? event.changedTouches[0] : event
              setSpot({ at: screenToFlowPosition({ x: point.clientX, y: point.clientY }), from: state.fromNode.id })
            }}
            onConnect={(link) => { mark(); const single = ['choice'].includes(String(nodesRef.current.find((node) => node.id === link.target)?.type)); setEdges((list) => [...(single ? list.filter((edge) => edge.target !== link.target) : list), { ...edgeOptions, id: `e-${Date.now().toString(36)}`, source: link.source, target: link.target } as Edge]) }}
            onNodeDragStart={mark} onSelectionDragStart={mark}
            onNodeDrag={(event, node) => { if (node.type !== 'card') return; setDropFolder(pointerFolder(event as unknown as MouseEvent)?.id ?? null) }}
            onNodeDragStop={(event, __, dragged) => dropCards(dragged, pointerFolder(event as unknown as MouseEvent))}
            onPaneContextMenu={(event) => { event.preventDefault(); const point = 'clientX' in event ? event : null; if (point) setSpot({ at: screenToFlowPosition({ x: point.clientX, y: point.clientY }) }) }}
            deleteKeyCode={expandedId ? null : 'Backspace'}
            {...(SNAPSHOT ? { nodesDraggable: false, nodesConnectable: false, edgesReconnectable: false, deleteKeyCode: null } : {})}
            onPaneClick={place} fitView fitViewOptions={{ maxZoom: 1, padding: 0.2 }} minZoom={0.1} maxZoom={2}
            panActivationKeyCode="Space" panOnScroll zoomOnScroll={false} zoomActivationKeyCode={['Meta', 'Control']} selectionOnDrag={!coarse} panOnDrag={coarse ? true : [1]} selectionMode={SelectionMode.Partial} multiSelectionKeyCode={['Meta', 'Shift']}
            className={cn('[&_.react-flow__edge.selected_path]:stroke-primary', tool !== 'select' && 'cursor-crosshair')} data-space-pan={spaceHeld || undefined} proOptions={{ hideAttribution: true }}>
          {/* Выделено несколько нод — одна рамка и одно меню над всей группой (как у Magnific), а не меню у каждой ноды */}
          {selectedIds.length > 1 && (
            <Toolbar nodeId={selectedIds} isVisible position={Position.Top} offset={24} className={barClass}>
              {selectedIds.some((id) => live(nodesRef.current.find((node) => node.id === id))) && <Tip label={t('Запустить выделенные')}><Button variant="ghost" size="icon-sm" className={barButton} aria-label={t('Запустить выделенные')} disabled={SNAPSHOT} onClick={() => { for (const id of selectedIds) if (live(nodesRef.current.find((node) => node.id === id))) void runNode(id) }}><Play /></Button></Tip>}
              {!selectedIds.some((nodeId) => nodesRef.current.find((node) => node.id === nodeId)?.type === 'frame') && selectedIds.filter((nodeId) => { const type = nodesRef.current.find((node) => node.id === nodeId)?.type; return type !== 'group' && type !== 'frame' }).length > 1 && <Tip label={t('Собрать в список ⌘G')}><Button variant="ghost" size="icon-sm" className={barButton} aria-label={t('Собрать в список')} onClick={groupSelected}><ListPlus /></Button></Tip>}
              <Tip label={t('Упорядочить выделенные')}><Button variant="ghost" size="icon-sm" className={barButton} aria-label={t('Упорядочить выделенные')} onClick={tidySelected}><AlignHorizontalDistributeCenter /></Button></Tip>
              <Tip label={t('Дублировать выделенные')}><Button variant="ghost" size="icon-sm" className={barButton} aria-label={t('Дублировать выделенные')} onClick={() => duplicateMany(selectedIds)}><Copy /></Button></Tip>
              <Tip label={t('Удалить выделенные')}><Button variant="ghost" size="icon-sm" className={barButton} aria-label={t('Удалить выделенные')} onClick={() => { mark(); setNodes((list) => list.filter((node) => !selectedIds.includes(node.id))); setEdges((list) => list.filter((edge) => !selectedIds.includes(edge.source) && !selectedIds.includes(edge.target))) }}><Trash2 /></Button></Tip>
            </Toolbar>
          )}
          {/* Инструменты справа — вертикальная плавающая панель: добавить, выбор, библиотека, рамка, подпись · отмена, повтор · запуск, раскладка, ссылка агенту */}
          <ZoomMenu map={map} onMap={() => setMap(!map)} />
          {map && <MiniMap pannable zoomable position="bottom-right" style={{ marginBottom: 72, width: 160, height: 100 }} className="!rounded-lg !border !border-line !bg-card" maskColor="var(--muted)" nodeColor="var(--muted-foreground)" nodeStrokeWidth={0} ariaLabel={t('Миникарта')} />}
          <Recenter />
          {proposal && (
            <Panel position="top-center" className="flex max-w-[640px] items-center gap-2 !p-2" role="region" aria-label={t('Предложение агента')}>
              <Bot className="size-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate text-sm">{proposal.by}: {proposal.note || t('правки холста')} · {proposal.ops.length} {proposal.ops.length === 1 ? t('правка') : t('правок')}{proposals.length > 1 ? t(' · ещё {n}', { n: proposals.length - 1 }) : ''}</span>
              <Button variant={ghostOn ? 'secondary' : 'ghost'} size="xs" onClick={() => setGhostOn(!ghostOn)}>{ghostOn ? t('Скрыть') : t('Показать')}</Button>
              <Button size="xs" onClick={() => void resolveProposal('accept')}>{t('Принять')}</Button>
              <Button variant="ghost" size="xs" onClick={() => void resolveProposal('decline')}>{t('Отклонить')}</Button>
            </Panel>
          )}
          </Canvas>
        </CanvasEnv.Provider>
        {spot && (() => {
          const source = spot.from ? nodes.find((node) => node.id === spot.from) : undefined
          const all = spotEntries().filter((entry) => (!source || accepts({ type: entry.type } as Node, source)) && (!spot.to || entry.type === 'card' || entry.type === 'group'))
          const inView = (entry: SpotEntry) => spotView === 'materials' ? entry.type === 'card' : spotView === 'folders' ? entry.type === 'group' && entry.data?.groupKind === 'folder' : spotView === 'boards' ? entry.type === 'group' && entry.data?.groupKind === 'board' : false
          const drilled = spotView !== 'root'
          const title = spotView === 'materials' ? t('Материалы') : spotView === 'folders' ? t('Папки') : t('Подборки')
          // Палитра — только ноды: умения и шаблоны уходят в память агента, материалы тут не нужны; библиотека остаётся лишь там, где ноде выбирают вход («+» у ноды)
          const rootEntries = all.filter((entry) => entry.type !== 'card' && entry.type !== 'group' && entry.group === t('Ноды'))
          type View = 'materials' | 'folders' | 'boards'
          const library = ([
            { view: 'materials', label: t('Материалы'), hint: t('картинки, заметки, статьи'), Icon: Images },
            { view: 'folders', label: t('Папки'), hint: t('папка целиком'), Icon: FolderOpen },
            { view: 'boards', label: t('Подборки'), hint: t('подборка целиком'), Icon: Layers },
          ] as Array<{ view: View; label: string; hint: string; Icon: typeof Images }>).filter((item) => all.some((entry) => item.view === 'materials' ? entry.type === 'card' : entry.type === 'group' && entry.data?.groupKind === (item.view === 'folders' ? 'folder' : 'board')))
          const showLibrary = !drilled && Boolean(spot.to)
          const nodesOnly = !drilled && !spot.to
          return (
            <CommandDialog open onOpenChange={(open) => { if (!open) setSpot(null) }} title={t('Добавить')} description={t('Найти ноду, умение или материал')} className={nodesOnly ? 'sm:max-w-2xl' : 'sm:max-w-md'}>
              <div className="flex">
              <Command className="min-w-0 flex-1" tabIndex={-1}>
                {!nodesOnly && (<CommandInput placeholder={drilled ? t('Найти: {title}', { title: title.toLowerCase() }) : source ? t('Что подключить дальше') : spot.to ? t('Найти материал') : t('Найти ноду')} />)}
                {drilled ? (
                  <button type="button" className="mx-1 mt-1 flex items-center gap-1.5 rounded-md px-2 py-1.5 text-left text-sm font-medium hover:bg-muted" onClick={() => setSpotView('root')}><ArrowLeft className="size-4" />{title}</button>
                ) : null}
                <CommandList className={nodesOnly ? 'max-h-none p-2' : 'max-h-80'}>
                  <CommandEmpty>{t('Ничего не найдено')}</CommandEmpty>
                  {drilled ? (
                    <CommandGroup>
                      {all.filter(inView).map((entry) => (
                        <CommandItem key={entry.key} value={`${entry.label} ${entry.hint ?? ''}`} onSelect={() => placeSpot(entry)}>
                          {entry.type === 'card' && entry.image ? <img src={entry.image} alt="" className="size-6 shrink-0 rounded-sm object-cover" /> : null}
                          <span className="min-w-0 flex-1 truncate">{entry.label}</span>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  ) : (
                    <>
                      {!spot.to && !spot.from && (
                        <CommandGroup>
                          <CommandItem value={`${t('Материал из библиотеки')} ${t('библиотека')} materials`} onSelect={() => { setSpot(null); setPickerOpen(true) }}>
                            <span className="grid size-8 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground [&_svg]:size-4"><Images /></span>
                            <span className="flex min-w-0 flex-1 flex-col"><span className="truncate text-sm">{t('Материал из библиотеки')}</span><span className="text-xs text-muted-foreground">{t('картинки, ролики, статьи, заметки, папки')}</span></span>
                            <Kbd>M</Kbd>
                          </CommandItem>
                        </CommandGroup>
                      )}
                      {[t('Ноды'), t('Шаблоны'), t('Умения')].map((group) => rootEntries.some((entry) => entry.group === group) && (
                        <CommandGroup key={group} heading={nodesOnly ? undefined : group} className={nodesOnly ? 'p-0 [&_[cmdk-group-items]]:grid [&_[cmdk-group-items]]:grid-cols-3 [&_[cmdk-group-items]]:gap-2' : undefined}>
                          {rootEntries.filter((entry) => entry.group === group).map((entry) => (
                            <CommandItem key={entry.key} value={`${entry.label} ${entry.hint ?? ''} ${entry.group}`} onSelect={() => placeSpot(entry)} className={nodesOnly ? 'flex-col items-start gap-2 rounded-xl p-2 hover:bg-foreground/10 data-[selected=true]:bg-foreground/10' : undefined}>
                              {nodesOnly ? <span className="block h-28 w-full"><NodePreview kind={entry.key} /></span> : <span className="grid size-8 shrink-0 place-items-center rounded-md bg-muted text-muted-foreground [&_svg]:size-4">{SPOT_ICON[entry.key] ? createElement(SPOT_ICON[entry.key]) : <Shapes />}</span>}
                              {nodesOnly ? <span className="flex w-full min-w-0 flex-col gap-0.5"><span className="truncate text-sm">{entry.label}</span>{entry.hint && <span className="text-xs text-muted-foreground">{entry.hint}</span>}</span> : <span className="flex min-w-0 flex-1 flex-col"><span className="truncate text-sm">{entry.label}</span>{entry.hint && <span className="truncate text-xs text-muted-foreground">{entry.hint}</span>}</span>}
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      ))}
                      {showLibrary && library.length > 0 && (
                        <CommandGroup heading={t('Библиотека')}>
                          {library.map(({ view, label, hint, Icon }) => (
                            <CommandItem key={view} value={`${label} ${hint} ${t('библиотека')}`} onSelect={() => setSpotView(view)}>
                              <Icon className="text-muted-foreground" /><span className="min-w-0 flex-1 truncate">{label}</span><span className="shrink-0 text-xs text-muted-foreground">{hint}</span><ChevronRight className="size-4 text-muted-foreground" />
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      )}
                    </>
                  )}
                </CommandList>
                {!nodesOnly && (<div className="flex items-center gap-3 border-t border-line px-3 py-2 text-xs text-muted-foreground"><span><Kbd>N</Kbd> {t('открыть')}</span><span><Kbd>↑↓</Kbd> {t('выбрать')}</span><span><Kbd>↵</Kbd> {t('вставить')}</span></div>)}
              </Command>
              </div>
            </CommandDialog>
          )
        })()}
        <MaterialPicker open={pickerOpen} items={items.filter((item) => item.id !== id && item.kind !== 'canvas')} groups={groups} onCanvas={new Set(nodes.filter((node) => node.type === 'card').map((node) => String((node.data as { ref?: string }).ref ?? '')))} onClose={() => setPickerOpen(false)}
          onAddCards={(ids) => { const base = center(); ids.forEach((refId, at) => addCard(refId, { x: base.x + ((at % 3) - 1) * (cardWidth + 24), y: base.y + Math.floor(at / 3) * 200 })) }}
          onAddGroup={(group) => addGroup(group, nudge(center()))} />
        <ViewerShell open={frameView !== null} onClose={() => setFrameView(null)} title={frameView?.title ?? ''} description={t('Состав')}
          actions={frameView && <>
            <Tip label={t('Скопировать для агента')}><Button variant="ghost" size="icon" aria-label={t('Скопировать для агента')} onClick={() => copyForAgent(frameView.id)}><AgentCopyIcon /></Button></Tip>
            <Tip label={t('Скачать .md')}><Button variant="ghost" size="icon" aria-label={t('Скачать .md')} onClick={() => downloadScreen(frameView.id)}><Download /></Button></Tip>
          </>}>
          {frameView && <div className="h-full overflow-auto p-6 pb-28"><div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
            <h2 className="text-lg font-semibold">{frameView.title}</h2>
            <ul className="flex flex-col gap-2">{frameView.members.map((item) => <li key={item.id}><Button variant="ghost" className="h-auto w-full justify-start gap-3 whitespace-normal p-3 text-left" onClick={() => { setFrameView(null); if (item.node) expandNode(item.id); else onOpenCard(item.id) }}>{item.image && <img src={item.image} alt="" className="size-16 shrink-0 rounded-md object-cover" />}<span>{item.title}</span><ChevronRight className="ml-auto shrink-0" /></Button></li>)}</ul>
          </div></div>}
        </ViewerShell>
        <Dialog open={promptView !== null} onOpenChange={(open) => { if (!open) setPromptView(null) }}>
          <DialogContent className="max-h-[85vh] overflow-hidden sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle>{t('Запрос ноды «{title}»', { title: promptView?.title ?? '' })}</DialogTitle>
              <DialogDescription>{t('Это уходит модели ({model})', { model: promptView?.model ?? '' })}{promptView?.images.length ? t('; картинки: {list}', { list: promptView.images.join(', ') }) : ''}{t('. Запрос меняется вместе с инструкцией и входами.')}</DialogDescription>
            </DialogHeader>
            <div className="min-h-0 overflow-auto">
              <CodeBlock code={promptView?.prompt ?? ''} language="markdown" className="[&_code]:whitespace-pre-wrap [&_pre]:whitespace-pre-wrap"><div className="flex justify-end p-1"><CodeBlockCopyButton /></div></CodeBlock>
            </div>
          </DialogContent>
        </Dialog>



        {tool === 'cut' && <Knife onCut={(edgeIds) => { mark(); setEdges((list) => list.filter((edge) => !edgeIds.includes(edge.id))); setTool('select') }} />}
        {/* Инструменты холста — горизонтальная панель внизу по центру холста, одна на всё: инструменты, «+» и агент (нижней панели на холсте нет) */}
        <Island className="absolute top-18 z-10 flex-col" style={{ left: 'calc(var(--canvas-inset, 16px) + var(--agent-left-w, 0px))' }} role="toolbar" aria-orientation="vertical" aria-label={t('Инструменты холста')}>
            <Tooltip><TooltipTrigger asChild><Button variant={tool === 'select' ? 'default' : 'ghost'} size="icon" aria-label={t('Выбор')} onClick={() => setTool('select')}><MousePointer2 /></Button></TooltipTrigger><TooltipContent side="right">{t('Выбор')} <Kbd>V</Kbd></TooltipContent></Tooltip>
            <Tooltip><TooltipTrigger asChild><Button variant={pickerOpen ? 'secondary' : 'ghost'} size="icon" aria-label={t('Библиотека')} aria-pressed={pickerOpen} onClick={() => setPickerOpen(!pickerOpen)}><Library /></Button></TooltipTrigger><TooltipContent side="right">{t('Библиотека: материалы, папки и подборки')} <Kbd>M</Kbd></TooltipContent></Tooltip>
            <Tooltip><TooltipTrigger asChild><Button variant={tool === 'comment' || props.commentsActive ? 'secondary' : 'ghost'} size="icon" className="relative" aria-label={t('Правки')} aria-pressed={tool === 'comment' || Boolean(props.commentsActive)} onClick={() => { const on = tool === 'comment' && Boolean(props.commentsActive); setTool(on ? 'select' : 'comment'); if (on) props.onHideComments?.(); else props.onOpenComments?.() }}><MessageSquarePlus />{openComments > 0 && <span className="absolute -top-0.5 -right-0.5 grid min-w-4 place-items-center rounded-lg bg-primary px-1 text-[10px] leading-4 font-medium text-primary-foreground tabular-nums">{openComments}</span>}</Button></TooltipTrigger><TooltipContent side="right">{t('Правки')} <Kbd>C</Kbd></TooltipContent></Tooltip>
            <Tooltip><TooltipTrigger asChild><Button variant={tool === 'cut' ? 'secondary' : 'ghost'} size="icon" aria-label={t('Нож')} aria-pressed={tool === 'cut'} onClick={() => setTool(tool === 'cut' ? 'select' : 'cut')}><Scissors /></Button></TooltipTrigger><TooltipContent side="right">{t('Нож')} <Kbd>K</Kbd></TooltipContent></Tooltip>
            <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" aria-label={t('Добавить ноду')} onClick={() => setSpot({})}><Plus /></Button></TooltipTrigger><TooltipContent side="right">{t('Добавить ноду')} <Kbd>N</Kbd></TooltipContent></Tooltip>
        {agentButton}
        </Island>
      </div>
      {props.commentsSlot && createPortal(
        <CommentsPanel groups={commentGroups} onApply={(nodeId) => void applyEdits(nodeId)} onClose={(nodeId, commentId) => moveComment(nodeId, commentId, 'closed')} onReopen={(nodeId, commentId) => moveComment(nodeId, commentId, 'open')}
            onFocus={(nodeId) => { setNodes((list) => list.map((node) => ({ ...node, selected: node.id === nodeId }))); void fitRef.current({ nodes: [{ id: nodeId }], maxZoom: 1.2, padding: 0.4, duration: 300 }) }} />,
        props.commentsSlot)}
      {props.memorySlot && createPortal(
        <MemoryPanel canvasId={id} selected={nodes.filter((node) => node.selected).map((node) => node.id)}
          onFocus={(nodeId) => { setNodes((list) => list.map((node) => ({ ...node, selected: node.id === nodeId }))); void fitRef.current({ nodes: [{ id: nodeId }], maxZoom: 1.2, padding: 0.4, duration: 300 }) }} />,
        props.memorySlot)}
      </div>
    </div>
  )
}

let seeding: Promise<ActionItem[]> | null = null
