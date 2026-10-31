import { Shapes } from 'lucide-react'
import { t } from '@/lib/i18n'
import { useContext, useEffect, useMemo, useRef, useState } from 'react'
import { ReactFlow, type Edge, type Node } from '@xyflow/react'
import { library, type CanvasData } from '@/lib/library'
import { CanvasEnv, nodeTypes, portOf, PORT_VAR, type CanvasItem } from './canvas/nodes'
import { thumbOf } from '../../shared/canvas-nodes.mjs'

type Boxes = Array<{ x: number; y: number; w: number; h: number; k: string }>

// Те же ноды, что на доске, но без редактирования и сохранения. За пределами экрана не монтируем тяжёлое содержимое.
// Плитка холста: картинка thumb.jpg. Пока её нет — лёгкая заглушка из прямоугольников (BoxThumb): плитка лежит внутри <button>, а живой мини-холст
// рисует настоящие кнопки нод, и «кнопка в кнопке» — некорректный HTML. Сервер снимает превью по просьбе (library.canvasThumb); плитка раз в 4 с
// спрашивает, не появился ли свежий файл, и подставляет его без перезагрузки. Живой CanvasThumb остаётся только для страницы съёмки (thumb-page)
export function CanvasCover({ id, updatedAt, thumbAt, boxes }: { id: string; updatedAt?: number; thumbAt?: number; boxes?: Boxes }) {
  const fresh = Boolean(thumbAt && thumbAt >= (updatedAt ?? 0))
  const [version, setVersion] = useState<number | null>(thumbAt ?? null)
  const [broken, setBroken] = useState(false)
  useEffect(() => {
    if (fresh) return
    void library.canvasThumb(id).catch(() => {})
    let tries = 0
    const timer = window.setInterval(async () => {
      tries += 1
      try {
        const reply = await fetch(`/library/${id}/thumb.jpg`, { method: 'HEAD', cache: 'no-store' })
        const made = Date.parse(reply.headers.get('last-modified') ?? '')
        if (reply.ok && made >= (updatedAt ?? 0)) { setVersion(made); setBroken(false); window.clearInterval(timer) }
      } catch { /* сервер занят — следующая попытка */ }
      if (tries >= 20) window.clearInterval(timer)
    }, 4000)
    return () => window.clearInterval(timer)
  }, [id, fresh, updatedAt])
  if (version !== null && !broken) return <img src={`/library/${id}/thumb.jpg?v=${version}`} alt="" draggable={false} onError={() => setBroken(true)} className="pointer-events-none absolute inset-0 size-full bg-card object-cover" />
  return <BoxThumb boxes={boxes} />
}

export function CanvasThumb({ id, updatedAt, items, boxes }: { id: string; updatedAt?: number; items: CanvasItem[]; boxes?: Boxes }) {
  const host = useRef<HTMLDivElement>(null)
  const [visible, setVisible] = useState(false)
  const [board, setBoard] = useState<CanvasData | null>(null)
  const defaults = useContext(CanvasEnv)
  const env = useMemo(() => ({ ...defaults, items: new Map(items.map((item) => [item.id, item])) }), [defaults, items])
  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting))
    if (host.current) observer.observe(host.current)
    return () => observer.disconnect()
  }, [])
  useEffect(() => {
    if (!visible) return
    let cancelled = false
    void library.canvas(id).then((data) => { if (!cancelled) setBoard(data) }).catch((error) => console.warn(t('Превью холста:'), id, error))
    return () => { cancelled = true }
  }, [id, updatedAt, visible])
  const nodes = useMemo(() => (board?.nodes ?? []).map((node) => ({ ...node, selected: false, style: { width: node.width, height: node.height } })) as Node[], [board])
  const edges = useMemo(() => (board?.edges ?? []).map((edge) => ({ ...edge, type: 'default', animated: false, style: { stroke: PORT_VAR[portOf(nodes.find((node) => node.id === edge.source))], strokeWidth: 3 } })) as Edge[], [board, nodes])
  return (
    <div ref={host} aria-hidden inert className="pointer-events-none absolute inset-0 overflow-hidden bg-card">
      <BoxThumb boxes={boxes} />
      {visible && board && nodes.length > 0 && (
        <CanvasEnv.Provider value={env}>
          <ReactFlow key={`${id}-${board.rev ?? 0}`} nodes={nodes} edges={edges} nodeTypes={nodeTypes}
            fitView fitViewOptions={{ padding: 0.16, maxZoom: 1 }} minZoom={0.001} maxZoom={1}
            nodesDraggable={false} nodesConnectable={false} elementsSelectable={false} nodesFocusable={false} edgesFocusable={false}
            panOnDrag={false} panOnScroll={false} zoomOnScroll={false} zoomOnPinch={false} zoomOnDoubleClick={false}
            preventScrolling={false} deleteKeyCode={null} selectionKeyCode={null} multiSelectionKeyCode={null}
            proOptions={{ hideAttribution: true }} className="bg-card" />
        </CanvasEnv.Provider>
      )}
    </div>
  )
}

// Плитка холста в ленте: мини-доска из коробок (позиция и размер приходят в meta при каждом сохранении, холст не открывается).
// Карточки — залитые, рамки — пунктиром, текст — тонкими. Пустой холст — значок типа
function BoxThumb({ boxes }: { boxes?: Boxes }) {
  if (!boxes?.length) return <span aria-hidden className="absolute inset-0 grid place-items-center bg-card text-muted-foreground"><Shapes className="size-6" /></span>
  const left = Math.min(...boxes.map((box) => box.x)), top = Math.min(...boxes.map((box) => box.y))
  const right = Math.max(...boxes.map((box) => box.x + box.w)), bottom = Math.max(...boxes.map((box) => box.y + box.h))
  const pad = Math.max(right - left, bottom - top) * 0.08
  return (
    <svg aria-hidden viewBox={`${left - pad} ${top - pad} ${right - left + pad * 2} ${bottom - top + pad * 2}`} preserveAspectRatio="xMidYMid meet" className="absolute inset-0 size-full bg-card p-3">
      {boxes.map((box, index) => thumbOf(box.k) === 'frame'
        ? <rect key={index} x={box.x} y={box.y} width={box.w} height={box.h} rx={12} fill="none" strokeWidth={3} strokeDasharray="10 8" className="stroke-muted-foreground/60" vectorEffect="non-scaling-stroke" />
        : thumbOf(box.k) === 'text'
          ? <rect key={index} x={box.x} y={box.y + box.h / 2 - 3} width={box.w} height={6} rx={3} className="fill-muted-foreground/50" />
          : <rect key={index} x={box.x} y={box.y} width={box.w} height={box.h} rx={8} className="fill-muted-foreground/35" />)}
    </svg>
  )
}
