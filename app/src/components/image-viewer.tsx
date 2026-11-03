import { useEffect, useState, type ReactNode } from 'react'
import { t } from '@/lib/i18n'
import { DropdownMenuItem, DropdownMenuShortcut } from '@/components/ui/dropdown-menu'
import { ViewerShell } from '@/components/viewer-shell'
import { ZoomIsland } from '@/components/zoom-island'

// Просмотр картинки на весь экран в общем каркасе ViewerShell: колесо — масштаб к курсору (щипок на тачпаде приходит так же),
// перетаскивание — сдвиг, двойной клик — «вписать» / 100%. Масштаб null — картинка вписана в окно.
const MIN = 0.1, MAX = 8
const clamp = (value: number) => Math.min(MAX, Math.max(MIN, value))

export function ImageViewer({ src, title, topActions, wrap, onClose }: { src: string; title: string; topActions?: ReactNode; wrap?: (stage: ReactNode) => ReactNode; onClose: () => void }) {
  const [box, setBox] = useState<HTMLDivElement | null>(null) // состояние, а не ref: окно диалога монтируется порталом уже после первого рендера
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })
  const [zoom, setZoom] = useState<number | null>(null)
  const [pan, setPan] = useState({ x: 0, y: 0 }) // сдвиг центра картинки от центра окна, px
  const [dragging, setDragging] = useState<{ x: number; y: number; px: number; py: number } | null>(null)

  useEffect(() => { const image = new Image(); image.onload = () => setNatural({ w: image.naturalWidth, h: image.naturalHeight }); image.src = src }, [src])
  useEffect(() => {
    if (!box) return
    const measure = () => setSize({ w: box.clientWidth, h: box.clientHeight })
    measure()
    const watch = new ResizeObserver(measure)
    watch.observe(box)
    return () => watch.disconnect()
  }, [box])

  const fit = natural && size.w ? Math.min(1, (size.w - 96) / natural.w, (size.h - 160) / natural.h) : 1
  const scale = zoom ?? fit
  // Точечное поле как у холста (ai-elements/canvas): точки 1,5 px, шаг 20–40 px по степеням двойки, привязаны к центру картинки —
  // двигаются и меняют шаг вместе с ней, поэтому сразу видно, что поле можно зумить и тянуть
  const dotGap = 20 * scale * 2 ** Math.ceil(-Math.log2(scale))
  const dotColor = 'color-mix(in oklab, var(--foreground) 14%, transparent)'
  const field = { backgroundColor: 'var(--canvas-bg)', backgroundImage: `radial-gradient(circle, ${dotColor} 0.75px, transparent 1.25px)`, backgroundSize: `${dotGap}px ${dotGap}px`, backgroundPosition: `${size.w / 2 + pan.x - dotGap / 2}px ${size.h / 2 + pan.y - dotGap / 2}px` }
  // Точка под курсором остаётся на месте: считаем, как должен сдвинуться центр картинки при новом масштабе
  const zoomAt = (next: number, at?: { x: number; y: number }) => {
    const target = clamp(next)
    const dx = at ? at.x - size.w / 2 : 0, dy = at ? at.y - size.h / 2 : 0
    setPan({ x: dx - (dx - pan.x) * (target / scale), y: dy - (dy - pan.y) * (target / scale) })
    setZoom(target)
  }
  const setFit = () => { setZoom(null); setPan({ x: 0, y: 0 }) }
  const step = (factor: number) => zoomAt(Math.round(scale * factor * 100) / 100)

  useEffect(() => {
    if (!box) return
    const onWheel = (event: WheelEvent) => {
      event.preventDefault()
      const rect = box.getBoundingClientRect()
      zoomAt(scale * Math.exp(-event.deltaY * (event.ctrlKey ? 0.01 : 0.0015)), { x: event.clientX - rect.left, y: event.clientY - rect.top })
    }
    box.addEventListener('wheel', onWheel, { passive: false })
    return () => box.removeEventListener('wheel', onWheel)
  })
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey) {
        if (event.key === '=' || event.key === '+') { event.preventDefault(); step(1.25) }
        else if (event.key === '-') { event.preventDefault(); step(0.8) }
        else if (event.key === '0') { event.preventDefault(); zoomAt(1) }
      } else if (event.shiftKey && event.key === '!') { event.preventDefault(); setFit() }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  })

  return (
    <ViewerShell open onClose={onClose} title={title} topActions={topActions} description={t('Колесо — масштаб, перетаскивание — сдвиг, двойной клик — 100%.')}
      corner={<ZoomIsland percent={Math.round(scale * 100)} onZoomIn={() => step(1.25)} onZoomOut={() => step(0.8)} onReset={() => zoomAt(1)}>
        <DropdownMenuItem onSelect={setFit}>{t('Вписать')}<DropdownMenuShortcut>⇧ 1</DropdownMenuShortcut></DropdownMenuItem>
      </ZoomIsland>}>
      {(wrap ?? ((stage: ReactNode) => stage))(
      <div ref={setBox} style={field} className={`absolute inset-0 touch-none overflow-hidden select-none ${dragging ? 'cursor-grabbing' : 'cursor-grab'}`}
        onPointerDown={(event) => { if (event.button !== 0) return; event.currentTarget.setPointerCapture(event.pointerId); setDragging({ x: event.clientX, y: event.clientY, px: pan.x, py: pan.y }) }}
        onPointerMove={(event) => { if (dragging) setPan({ x: dragging.px + event.clientX - dragging.x, y: dragging.py + event.clientY - dragging.y }) }}
        onPointerUp={() => setDragging(null)} onPointerCancel={() => setDragging(null)}
        onDoubleClick={(event) => { const rect = event.currentTarget.getBoundingClientRect(); if (zoom === null || Math.abs(scale - 1) > 0.01) zoomAt(1, { x: event.clientX - rect.left, y: event.clientY - rect.top }); else setFit() }}>
        {natural && (
          <div className="absolute max-w-none" style={{ left: size.w / 2 + pan.x, top: size.h / 2 + pan.y, width: natural.w * scale, height: natural.h * scale, transform: 'translate(-50%, -50%)' }}>
            <img src={src} alt={title} draggable={false} className="block size-full max-w-none" />
          </div>
        )}
      </div>
      )}
    </ViewerShell>
  )
}
