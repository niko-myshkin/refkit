import { useEffect, useRef, useState } from 'react'
import { Slider } from '@/components/ui/slider'
import { cn } from '@/lib/utils'

// Ползунок со ступенями — ОДИН на всё приложение (глубина агента, размер плиток): тёмная дорожка-таблетка, заливка тоном светлее до бегунка,
// светлый круглый бегунок с тёмным ободком, на каждой ступени точка (заливка закрывает пройденные). Менять вид — только здесь.
// Бегунок за пальцем идёт свободно (как у «Effort» в Claude), а ступень меняется, когда он проходит середину между точками;
// отпустили — плавно доезжает до ближайшей точки. Пока тянут, переходов нет (бегунок точно под курсором).
// Radix не пускает бегунок за края: его центр на краях — в половине ширины бегунка (THUMB / 2) от края, точки ставим по той же формуле
const THUMB = 24
export function StepSlider({ steps, index, onIndexChange, label, className }: {
  steps: number // сколько ступеней (≥ 2)
  index: number
  onIndexChange: (index: number) => void
  label: string
  className?: string
}) {
  const last = Math.max(1, steps - 1)
  const [position, setPosition] = useState(index) // дробное положение бегунка, пока тянут
  const [dragging, setDragging] = useState(false)
  const lastIndex = useRef(index)
  const draggingNow = useRef(false)
  // Значение снаружи изменилось (колесо, другая вкладка, ответ родителя) — подтягиваем и положение; пока тянут, не мешаем:
  // родитель обновляется на следующем кадре и отстаёт от нашего lastIndex
  useEffect(() => { if (!draggingNow.current) { lastIndex.current = index; setPosition(index) } }, [index])
  const move = (to: number) => {
    const next = Math.min(last, Math.max(0, to))
    if (next !== lastIndex.current) { lastIndex.current = next; onIndexChange(next) }
    setPosition(next)
  }
  return (
    <div className={cn('step-slider relative h-7 rounded-full bg-background', className)} data-dragging={dragging || undefined}
      onPointerDown={() => { draggingNow.current = true; setDragging(true) }} onPointerUp={() => { draggingNow.current = false; setDragging(false) }} onPointerCancel={() => { draggingNow.current = false; setDragging(false) }}
      onKeyDownCapture={(event) => {
        // Клавиши — по целой ступени (у Radix шаг мелкий, он нужен только для плавного хода)
        const delta = event.key === 'ArrowRight' || event.key === 'ArrowUp' ? 1 : event.key === 'ArrowLeft' || event.key === 'ArrowDown' ? -1 : 0
        if (!delta) return
        event.preventDefault(); event.stopPropagation()
        move(Math.round(lastIndex.current) + delta)
      }}>
      {Array.from({ length: steps }, (_, step) => (
        <span key={step} aria-hidden className="pointer-events-none absolute top-1/2 size-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-foreground/30"
          style={{ left: `calc(${THUMB / 2}px + (100% - ${THUMB}px) * ${step / last})` }} />
      ))}
      <Slider aria-label={label} min={0} max={last} step={0.01} value={[position]}
        onValueChange={([value]) => { setPosition(value); const rounded = Math.round(value); if (rounded !== lastIndex.current) { lastIndex.current = rounded; onIndexChange(rounded) } }}
        onValueCommit={() => { draggingNow.current = false; setDragging(false); setPosition(lastIndex.current) }}
        className="absolute inset-0 h-7 [&_[data-slot=slider-range]]:bg-muted [&_[data-slot=slider-track]]:h-7 [&_[data-slot=slider-track]]:bg-transparent [&_[data-slot=slider-thumb]]:size-6 [&_[data-slot=slider-thumb]]:border-0 [&_[data-slot=slider-thumb]]:bg-foreground/70 [&_[data-slot=slider-thumb]]:ring-[5px]! [&_[data-slot=slider-thumb]]:ring-muted! [&_[data-slot=slider-thumb]]:z-10" />
    </div>
  )
}
