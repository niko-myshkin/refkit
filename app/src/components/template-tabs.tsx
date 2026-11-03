import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { t } from '@/lib/i18n'
import { Button } from '@/components/ui/button'

// Шаблоны главной — текстовые табы как у Apple (macbook-pro/liquid-retina-xdr-display, .tabnav-line):
// линия под табами — отдельный элемент на всю ширину, подчёркивание активного — другой, он скользит по ней;
// зона стрелок у края 44 px, в ней маска прозрачна, поэтому текст не наезжает на стрелку; дальше 22 px затухания.
// Клик по табу ничего не создаёт: холст появляется только по кнопке под описанием.
const PADDLE = 44, FADE = 22, KEYLINE_OPAQUE = 12, KEYLINE_FADE = 20

// Полоса табов — управляемая: активный таб приходит снаружи. Её берут и главная приложения (TemplateTabs), и лендинг (там клик переключает сцену хиро)
export function TemplateStrip({ items, active, onSelect }: { items: Array<{ key: string; label: string }>; active: string; onSelect: (key: string) => void }) {
  const current = items.find((item) => item.key === active) ?? items[0]
  const strip = useRef<HTMLDivElement>(null)
  const labels = useRef(new Map<string, HTMLElement>())
  const [edges, setEdges] = useState({ left: false, right: false })
  const [mark, setMark] = useState({ left: 0, width: 0 })

  const measure = useCallback(() => {
    const node = strip.current
    if (node) setEdges({ left: node.scrollLeft > 4, right: node.scrollLeft + node.clientWidth < node.scrollWidth - 4 })
    const label = current && labels.current.get(current.key)
    if (label) setMark({ left: label.offsetLeft, width: label.offsetWidth })
  }, [current])
  useLayoutEffect(measure, [measure])
  useEffect(() => {
    const node = strip.current
    if (!node) return
    const watch = new ResizeObserver(measure)
    watch.observe(node)
    return () => watch.disconnect()
  }, [measure])

  if (!current) return null
  const scrollBy = (direction: 1 | -1) => strip.current?.scrollBy({ left: direction * strip.current.clientWidth * 0.6, behavior: 'smooth' })
  const select = (key: string) => { onSelect(key); labels.current.get(key)?.scrollIntoView({ inline: 'nearest', block: 'nearest', behavior: 'smooth' }) }
  const left = edges.left ? 'transparent' : '#000', right = edges.right ? 'transparent' : '#000'
  const mask = `linear-gradient(90deg, ${left} 0, ${left} ${PADDLE}px, #000 ${PADDLE + FADE}px, #000 calc(100% - ${PADDLE + FADE}px), ${right} calc(100% - ${PADDLE}px), ${right} 100%)`
  const keyline = `linear-gradient(90deg, ${left} 0, ${left} ${KEYLINE_OPAQUE}px, #000 ${KEYLINE_OPAQUE + KEYLINE_FADE}px, #000 calc(100% - ${KEYLINE_OPAQUE + KEYLINE_FADE}px), ${right} calc(100% - ${KEYLINE_OPAQUE}px), ${right} 100%)`

  return (
    <div className="relative w-fit max-w-full">
      <div ref={strip} onScroll={measure} style={{ maskImage: mask, WebkitMaskImage: mask }}
        className="scroll-px-16 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <div className="relative w-fit">
          <ul role="tablist" aria-label={t('Шаблоны')} className="flex">
            {items.map((item, index) => (
              <li key={item.key} role="presentation" className={index > 0 ? 'ml-11' : ''}>
                <button type="button" role="tab" aria-selected={item.key === current.key} aria-controls="hero-canvas" data-action={item.key} onClick={() => select(item.key)}
                  className="cursor-pointer outline-none focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring">
                  <span ref={(node) => { if (node) labels.current.set(item.key, node); else labels.current.delete(item.key) }}
                    className={`block py-3 text-base whitespace-nowrap transition-colors duration-120 ease-out hover:text-foreground ${item.key === current.key ? 'text-foreground' : 'text-foreground/80'}`}>{item.label}</span>
                </button>
              </li>
            ))}
          </ul>
          <span aria-hidden className="absolute bottom-0 h-px rounded-full bg-foreground transition-[left,width] duration-300 ease-out" style={{ left: mark.left, width: mark.width }} />
        </div>
      </div>
      <span aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 -z-10 h-px rounded-full bg-line" style={{ maskImage: keyline, WebkitMaskImage: keyline }} />
      <Button variant="ghost" size="icon-sm" aria-label={t('Назад')} tabIndex={-1} onClick={() => scrollBy(-1)}
        className={`absolute top-0 left-0 h-[calc(100%-1px)] w-11 rounded-none hover:bg-transparent ${edges.left ? '' : 'invisible opacity-0'}`}><ChevronLeft /></Button>
      <Button variant="ghost" size="icon-sm" aria-label={t('Далее')} tabIndex={-1} onClick={() => scrollBy(1)}
        className={`absolute top-0 right-0 h-[calc(100%-1px)] w-11 rounded-none hover:bg-transparent ${edges.right ? '' : 'invisible opacity-0'}`}><ChevronRight /></Button>
    </div>
  )
}

export function TemplateTabs({ items, onCreate }: { items: Array<{ key: string; label: string; hint: string; caption?: [string, string] }>; onCreate: (key: string) => void }) {
  const [active, setActive] = useState(items[0]?.key)
  const current = items.find((item) => item.key === active) ?? items[0]
  if (!current) return null
  return (
    <div className="flex w-full max-w-3xl flex-col items-center gap-6">
      <TemplateStrip items={items} active={current.key} onSelect={setActive} />
      <div className="flex max-w-xl flex-col items-center gap-4 text-center" role="tabpanel">
        {/* Описание: яркое начало + приглушённое пояснение (как на лендинге); у шаблона без своего описания — название и строка шагов */}
        <p className="text-lg leading-snug"><span className="font-medium">{current.caption?.[0] ?? `${current.label}.`}</span> <span className="text-muted-foreground">{current.caption?.[1] ?? current.hint}</span></p>
        <Button onClick={() => onCreate(current.key)}>{t('Создать холст')}</Button>
      </div>
    </div>
  )
}
