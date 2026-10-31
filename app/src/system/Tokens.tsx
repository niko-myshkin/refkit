import { byNames, byPrefix, themeTokens, type Token } from './tokens-source'
import { Group, Section, useComputed } from './Section'

const colorGroups: { title: string; names: string[] }[] = [
  { title: 'Поверхности', names: ['background', 'card', 'popover', 'muted', 'secondary', 'accent', 'sidebar', 'sidebar-accent', 'paper', 'paper-fold'] },
  { title: 'Текст', names: ['foreground', 'card-foreground', 'popover-foreground', 'muted-foreground', 'secondary-foreground', 'accent-foreground', 'primary-foreground', 'sidebar-foreground', 'sidebar-accent-foreground', 'sidebar-primary-foreground', 'paper-foreground', 'paper-muted'] },
  { title: 'Действие и состояния', names: ['primary', 'sidebar-primary', 'destructive', 'success'] },
  { title: 'Линии и фокус', names: ['border', 'input', 'ring', 'sidebar-border', 'sidebar-ring'] },
  { title: 'Граф: сообщества', names: ['community-1', 'community-2', 'community-3', 'community-4', 'community-5'] },
]

// Образец красится значением из index.css, а не классом темы: светлая колонка остаётся светлой, даже когда приложение в тёмной теме
function Chip({ value }: { value?: string }) {
  const unset = !value || value === '—'
  return (
    <span className="flex min-w-0 items-center gap-2">
      <span aria-hidden className={`size-6 shrink-0 rounded-md border border-line ${unset ? 'border-dashed border-line' : ''}`} style={unset ? undefined : { background: value }} />
      <span className="truncate font-mono text-xs text-muted-foreground">{unset ? 'не задан' : value}</span>
    </span>
  )
}

function ColorRow({ token }: { token: Token }) {
  return (
    <li className="grid grid-cols-[minmax(6rem,12rem)_minmax(0,1fr)_minmax(0,1fr)] items-center gap-3 py-1.5">
      <code className="truncate text-xs">--{token.name}</code>
      <Chip value={token.light} />
      <Chip value={token.dark ?? token.light} />
    </li>
  )
}

function Radius({ cls, role }: { cls: string; role: string }) {
  const [ref, px] = useComputed<HTMLDivElement>('borderTopLeftRadius')
  return (
    <div className="flex w-36 flex-col items-start gap-1.5">
      <div ref={ref} className={`size-16 border bg-muted ${cls}`} />
      <code className="text-xs">{cls}</code>
      <span className="font-mono text-xs text-muted-foreground">{parseFloat(px) > 1000 ? 'полное' : px}</span>
      <span className="text-xs text-muted-foreground">{role}</span>
    </div>
  )
}

function TextSize({ cls }: { cls: string }) {
  const [ref, size] = useComputed<HTMLSpanElement>('fontSize')
  return (
    <li className="grid grid-cols-[6rem_5rem_1fr] items-baseline gap-3">
      <code className="text-xs">{cls}</code>
      <span className="font-mono text-xs text-muted-foreground">{size}</span>
      <span ref={ref} className={cls}>Кинь что угодно — получи суть</span>
    </li>
  )
}

const spacing = [0.5, 1, 1.5, 2, 3, 4, 6, 8, 10, 16, 24]

export default function Tokens() {
  const layers = [...byPrefix('z-')].sort((a, b) => Number(a.light) - Number(b.light))
  return (
    <Section id="tokens" title="Токены" hint="Читаются из index.css. Слева светлая тема, справа тёмная. «Не задан» — токена в этой теме нет в источнике.">
      {colorGroups.map(({ title, names }) => (
        <Group key={title} title={title}>
          <ul className="divide-y">{byNames(names).map((t) => <ColorRow key={t.name} token={t} />)}</ul>
        </Group>
      ))}

      <Group title="Скругления — роли">
        <div className="flex flex-wrap gap-6">
          {themeTokens.filter((t) => ['control', 'surface', 'container'].some((r) => t.name === `radius-${r}`)).map((t) => <Radius key={t.name} cls={`rounded-${t.name.slice(7)}`} role={t.note ?? ''} />)}
          <Radius cls="rounded-full" role="только круглое по смыслу: аватар, точка, порт, ползунок. Кнопки и чипы — rounded-lg (10px)" />
          <Radius cls="rounded-sm" role="мелкие метки: подсветка в диффе, рамка выделения" />
        </div>
      </Group>

      <Group title="Размеры текста (последняя строка — подпись: размер и цвет вместе)">
        <ul className="flex flex-col gap-2">{['text-micro', 'text-xs', 'text-note-body', 'text-body', 'text-sm', 'text-base', 'text-note', 'text-xl', 'text-3xl'].map((c) => <TextSize key={c} cls={c} />)}
          <TextSize cls="caption" /></ul>
      </Group>

      <Group title="Отступы (ступень × 4 px)">
        <ul className="flex flex-col gap-1.5">
          {spacing.map((n) => (
            <li key={n} className="grid grid-cols-[6rem_1fr] items-center gap-3">
              <code className="text-xs">{n} · {n * 4} px</code>
              <span className="h-3 rounded-sm bg-muted-foreground/40" style={{ width: n * 4 }} />
            </li>
          ))}
        </ul>
      </Group>

      <Group title="Слои (снизу вверх)">
        <ol className="divide-y">
          {layers.map((t) => (
            <li key={t.name} className="grid grid-cols-[minmax(8rem,12rem)_3rem_1fr] items-baseline gap-3 py-1.5">
              <code className="text-xs">--{t.name}</code>
              <span className="font-mono text-xs">{t.light}</span>
              <span className="text-xs text-muted-foreground">{t.note}</span>
            </li>
          ))}
        </ol>
      </Group>
    </Section>
  )
}
