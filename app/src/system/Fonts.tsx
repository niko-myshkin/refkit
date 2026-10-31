import { DIRECTION_PAIRS } from '@/components/canvas/direction-card'
import { Section } from './Section'

// Образец шрифтовых пар для лендинга (2026-10-27): выбираем глазами, на настоящем заголовке. Список берётся из direction-card.tsx — тот же, что в промпте агента

const PAIRS = Object.entries(DIRECTION_PAIRS).map(([name, pair]) => ({ name, ...pair, weight: pair.weight ?? 600 }))

export default function Fonts() {
  return (
    <Section id="fonts" title="Пары шрифтов" hint="Для лендинга и маркетинга; в самом продукте остаётся Inter. Один и тот же заголовок, чтобы сравнивать пары глазами.">
      <div className="grid gap-4 md:grid-cols-2">
        {PAIRS.map((pair) => (
          <div key={pair.name} className="flex flex-col gap-3 rounded-lg border bg-card p-6">
            <span className="text-xs text-muted-foreground">{pair.name}</span>
            <span className="text-[40px] leading-[1.05] tracking-[-0.01em]" style={{ fontFamily: pair.display, fontWeight: pair.weight }}>Drop anything. Get the gist the way you need it.</span>
            <span className="text-base text-muted-foreground" style={{ fontFamily: pair.text }}>Images, videos, articles, notes. The agent reads, you correct, and it remembers.</span>
            <span className="flex items-center gap-3">
              <span className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground" style={{ fontFamily: pair.text }}>Request access</span>
              <span className="text-xs uppercase tracking-[0.08em] text-muted-foreground" style={{ fontFamily: pair.label }}>Memory · 12 cards · on your Mac</span>
            </span>
          </div>
        ))}
      </div>
    </Section>
  )
}
