import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { t } from '@/lib/i18n'
import { animate, cubicBezier, useReducedMotion } from 'framer-motion'
import { springClose, springOpen } from '@/lib/springs'
import { ChevronRight } from 'lucide-react'
import { getViewportForBounds, Handle, Position, ReactFlow, ReactFlowProvider, SelectionMode, useReactFlow, type Edge, type Node, type NodeChange, type NodeProps } from '@xyflow/react'
import '@xyflow/react/dist/base.css'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { buildMap, type MapNode, type MapSection } from '@/lib/mindmap'

// Вид «Карта» (grill-mindmap.md): дерево слева направо, как в NotebookLM. Ветки раскрываются по клику,
// лист открывает карточку. Холст, масштаб и связи — React Flow (владелец 2026-09-28), узлы — shadcn,
// координаты — своя раскладка: лист — строка, раскрытая ветка — по середине своих детей
type Item = { id: string; title: string; image: string }
type Data = { node: MapNode<Item>; open: boolean; onToggle: (id: string) => void; onOpen: (id: string) => void; leaf?: (item: Item, face: ReactNode, path: string) => ReactNode }
type Placed = { node: MapNode<Item>; x: number; y: number; open: boolean; parent?: string }

const column = 232 // ширина узла
const gap = 56 // между уровнями — под кривую
const row = 40 // высота строки
// Пружины — как у сайдбара (lib/springs.ts). Узлы двигаем в JS, а не CSS-переходом: связи React Flow считаются от позиций и иначе отстают
// Камера — кривая окна карточки (ImageModal): 320 мс, быстрый старт и мягкая остановка
// Своей анимацией, а не fitBounds с duration: переход React Flow прерывался, пока узлы едут
const camera = { duration: 0.32, ease: cubicBezier(0.22, 1, 0.36, 1) }

function place(node: MapNode<Item>, depth: number, open: Set<string>, rows: { n: number }, out: Placed[], parent?: string): number {
  const x = depth * (column + gap)
  const isOpen = node.kind !== 'item' && open.has(node.id)
  if (node.kind === 'item' || !isOpen || !node.children.length) {
    const y = rows.n++ * row
    out.push({ node, x, y, open: false, parent })
    return y
  }
  const self: Placed = { node, x, y: 0, open: true, parent }
  out.push(self)
  const ys = node.children.map((child) => place(child, depth + 1, open, rows, out, node.id))
  self.y = (ys[0] + ys[ys.length - 1]) / 2
  return self.y
}

// Точки связи невидимы: карта только для просмотра, тянуть связи нельзя
const hidden = '!size-0 !min-h-0 !min-w-0 !border-0 !bg-transparent'

function MapNodeView({ data, selected }: NodeProps<Node<Data>>) {
  const { node, open, onToggle, onOpen, leaf } = data
  return (
    // Ветка — по ширине кнопки, чтобы связь выходила вплотную к ней; лист — на всю колонку
    <div className="flex items-center" style={{ width: node.kind === 'item' ? column : undefined, maxWidth: column, height: row }}>
      {node.kind !== 'root' && <Handle type="target" position={Position.Left} className={hidden} />}
      {node.kind === 'item' ? (
        (leaf ?? ((_, face) => face))(node.item,
          <Button variant="ghost" size="sm" className={cn('h-8 w-full justify-start gap-2 px-1.5 font-normal', selected && 'bg-accent ring-2 ring-primary')} onClick={(event) => { if (!event.metaKey && !event.shiftKey) onOpen(node.item.id) }}>
            {node.item.image ? <img src={node.item.image} alt="" className="size-6 shrink-0 rounded-sm object-cover" /> : <span className="size-6 shrink-0 rounded-sm bg-muted" />}
            <span className="truncate">{node.label}</span>
          </Button>, node.id)
      ) : (
        <Button variant={node.kind === 'root' ? 'default' : 'secondary'} size="sm" aria-expanded={open} className={'h-8 max-w-full justify-start gap-1.5'} onClick={() => onToggle(node.id)}>
          <span className="truncate">{node.label}</span>
          <Badge variant={node.kind === 'root' ? 'secondary' : 'outline'} className="tabular-nums">{node.count}</Badge>
          <ChevronRight className={cn('transition-transform', open && 'rotate-180')} />
        </Button>
      )}
      {node.kind !== 'item' && <Handle type="source" position={Position.Right} className={hidden} />}
    </div>
  )
}

const nodeTypes = { map: MapNodeView }

// sections — разделы у корня (Типы, Теги, Подборки); leaf — обёртка листа, через неё лента делает его перетаскиваемым;
// path — путь листа в дереве: одна карточка бывает в нескольких ветках, а перетаскиванию нужен уникальный id
// selected / onSelect — общее выделение с лентой: панель «Выбрано: N», перенос пачкой на подборку и полку
type Props = { items: Item[]; rootLabel: string; sections: MapSection<Item>[]; onOpen: (id: string) => void; leaf?: (item: Item, face: ReactNode, path: string) => ReactNode; selected: string[]; onSelect: (ids: string[]) => void; reveal?: string | null }

// Провайдер — чтобы внутри карты был доступ к камере холста (сдвиг к раскрытой ветке)
export const MindMap = (props: Props) => <ReactFlowProvider><Canvas {...props} /></ReactFlowProvider>

function Canvas({ items, rootLabel, sections, onOpen, leaf, selected, onSelect, reveal }: Props) {
  const tree = useMemo(() => buildMap(items, rootLabel, sections), [items, rootLabel, sections])
  // Сразу раскрыт первый уровень — видно типы; глубже — по клику
  const [open, setOpen] = useState<Set<string>>(() => new Set(['root']))
  // Последний нажатый узел: камера плавно едет к нему (у раскрытой ветки — вместе с детьми), как в NotebookLM
  // n — номер нажатия: камера едет только по клику, а не при любой перерисовке (иначе ехала под рамкой выделения)
  const [focus, setFocus] = useState<{ id: string; n: number } | null>(null)
  const press = (id: string | null) => { if (id) setFocus((old) => ({ id, n: (old?.n ?? 0) + 1 })) }
  const { getViewport, setViewport } = useReactFlow()
  // «Уменьшить движение»: узлы встают на место и камера переезжает сразу — MotionConfig ручной animate не касается
  const still = useReducedMotion()
  const frame = useRef<HTMLDivElement>(null)
  // Кадр, в который помещаются узлы: у раскрытой ветки — вместе с детьми; не меньше 640×420, чтобы на одном листе
  // камера подъезжала, а не утыкалась в него. Целимся в конечные места из раскладки — узлы в это время ещё едут
  const viewFor = (ids: Set<string>, list: Node<Data>[]) => {
    const box = list.filter((node) => ids.has(node.id)).map((node) => node.position)
    const el = frame.current
    if (!box.length || !el) return null
    const x0 = Math.min(...box.map((p) => p.x)), x1 = Math.max(...box.map((p) => p.x)) + column
    const y0 = Math.min(...box.map((p) => p.y)), y1 = Math.max(...box.map((p) => p.y)) + row
    const w = Math.max(x1 - x0, 640), h = Math.max(y1 - y0, 420)
    return getViewportForBounds({ x: (x0 + x1 - w) / 2, y: (y0 + y1 - h) / 2, width: w, height: h }, el.clientWidth, el.clientHeight, 0.2, 1, 0.2)
  }
  const { nodes, edges } = useMemo(() => {
    const onToggle = (id: string) => { setOpen((old) => { const next = new Set(old); if (next.has(id)) next.delete(id); else next.add(id); return next }); press(id) }
    const openCard = (id: string) => { onOpen(id); press(placed.find((item) => item.node.kind === 'item' && item.node.item.id === id)?.node.id ?? null) }
    const placed: Placed[] = []
    place(tree, 0, open, { n: 0 }, placed)
    const nodes: Node<Data>[] = placed.map(({ node, x, y, open }) => ({
      // Узлы не выделяются и не тянутся — React Flow тогда глушит им мышь; кнопкам внутри она нужна
      // Выделяются только листья — ветки и корень лишь раскрываются
      id: node.id, type: 'map', position: { x, y }, style: { pointerEvents: 'all' }, selectable: node.kind === 'item', data: { node, open, onToggle, onOpen: openCard, leaf },
    }))
    const edges: Edge[] = placed.filter((item) => item.parent).map((item) => ({ id: `${item.parent}→${item.node.id}`, source: item.parent!, target: item.node.id }))
    return { nodes, edges }
  }, [tree, open, onOpen, leaf])
  // Узлы разъезжаются пружиной: каждый едет от прошлого места к новому, новый — вылетает из родителя.
  // Только когда раскладка правда поменялась (подпись id:x:y) и не при первом показе — иначе пружина перезапускалась
  // на каждую перерисовку ленты и карта мигала
  const [shown, setShown] = useState(nodes)
  const last = useRef(new Map(nodes.map((node) => [node.id, node.position])))
  const signature = nodes.map((node) => `${node.id}:${node.position.x}:${node.position.y}`).join('|')
  const laid = useRef(signature)
  useEffect(() => {
    // Раскладка та же и на экране те же узлы — обновить только данные. Если прошлую пружину прервали на полпути
    // (два пересчёта подряд), на экране старые узлы — тогда едем дальше, а не выходим
    const onScreen = [...last.current.keys()]
    const same = onScreen.length === nodes.length && nodes.every((node) => { const at = last.current.get(node.id); return at?.x === node.position.x && at.y === node.position.y })
    if (laid.current === signature && same) { setShown((old) => old.map((node, i) => nodes[i]?.id === node.id ? { ...nodes[i], position: node.position } : node)); return }
    laid.current = signature
    const from = new Map(last.current)
    const parentOf = new Map(edges.map((edge) => [edge.target, edge.source]))
    const start = (id: string) => from.get(id) ?? from.get(parentOf.get(id) ?? '') ?? nodes.find((node) => node.id === (parentOf.get(id) ?? id))?.position
    const opening = nodes.length >= from.size
    const controls = animate(0, 1, { ...(still ? { duration: 0 } : opening ? springOpen : springClose), onUpdate: (t) => {
      const frame = nodes.map((node) => {
        const a = start(node.id) ?? node.position, b = node.position
        return { ...node, position: { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t } }
      })
      last.current = new Map(frame.map((node) => [node.id, node.position]))
      setShown(frame)
    } })
    return () => controls.stop()
  }, [nodes, edges, signature, still])
  // Тип выбран в меню — раскрываем его ветку и едем к ней; остальное дерево на месте
  useEffect(() => {
    if (!reveal) return
    // reveal — путь группы («types/youtube»): раскрываем и раздел, и группу
    setOpen((old) => new Set([...old, 'root', ...reveal.split('/').map((_, i, parts) => parts.slice(0, i + 1).join('/'))]))
    press(reveal)
  }, [reveal]) // eslint-disable-line react-hooks/exhaustive-deps
  const layout = useRef({ nodes, edges })
  layout.current = { nodes, edges }
  useEffect(() => {
    if (!focus) return
    const { nodes, edges } = layout.current
    const to = viewFor(new Set([focus.id, ...edges.filter((edge) => edge.source === focus.id).map((edge) => edge.target)]), nodes)
    if (!to) return
    const from = getViewport()
    const controls = animate(0, 1, { ...camera, ...(still && { duration: 0 }), onUpdate: (t) => setViewport({ x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t, zoom: from.zoom + (to.zoom - from.zoom) * t }) })
    return () => controls.stop()
  }, [focus]) // eslint-disable-line react-hooks/exhaustive-deps

  // Рамка и ⌘-клик выделяют листья; одна карточка может висеть в двух ветках — выделение по её id, не по узлу
  // Пока тянется рамка, выделение живёт внутри карты и уходит в ленту, когда кнопку отпустили: иначе лента
  // перерисовывалась на каждое движение, карта пересобиралась, и рамка захватывала всю ветку
  const [picked, setPicked] = useState(() => new Set(selected))
  useEffect(() => setPicked(new Set(selected)), [selected])
  const framing = useRef(false)
  const latest = useRef(picked)
  latest.current = picked
  const withSelection = useMemo(() => shown.map((node) => ({ ...node, selected: node.data.node.kind === 'item' && picked.has(node.data.node.item.id) })), [shown, picked])
  const onNodesChange = (changes: NodeChange<Node<Data>>[]) => {
    const next = new Set(picked)
    for (const change of changes) {
      if (change.type !== 'select') continue
      const node = shown.find((item) => item.id === change.id)?.data.node
      if (node?.kind !== 'item') continue
      if (change.selected) next.add(node.item.id); else next.delete(node.item.id)
    }
    if (next.size === picked.size && [...next].every((id) => picked.has(id))) return
    setPicked(next)
    latest.current = next
    if (!framing.current) onSelect([...next])
  }

  return (
    // Высота — до низа окна. Управление как в Figma (владелец 2026-09-28, тачпад): два пальца двигают холст, щипок
    // и ⌘ + колесо — масштаб, мышь по пустому рисует рамку выделения; ещё холст двигают пробел с мышью и средняя кнопка
    <div ref={frame} className="mind-map h-[calc(100vh-220px)] min-h-[480px]" role="region" aria-label={t('Карта библиотеки')}>
      <ReactFlow nodes={withSelection} edges={edges} onNodesChange={onNodesChange}
        onSelectionStart={() => { framing.current = true }} onSelectionEnd={() => { framing.current = false; onSelect([...latest.current]) }} nodeTypes={nodeTypes}
        // Первый кадр — один раз при запуске. Проп fitView перекадрировал при каждом появлении новых узлов и сбивал подъезд камеры
        onInit={() => { const to = viewFor(new Set(nodes.map((node) => node.id)), nodes); if (to) void setViewport(to) }} minZoom={0.2} maxZoom={1.5}
        nodesDraggable={false} nodesConnectable={false} edgesFocusable={false} panOnScroll zoomOnScroll={false}
        selectionOnDrag panOnDrag={[1]} selectionMode={SelectionMode.Partial} multiSelectionKeyCode={['Meta', 'Shift']} proOptions={{ hideAttribution: true }} />
    </div>
  )
}
