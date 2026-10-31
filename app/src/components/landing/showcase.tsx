import { Bot, FileText, FolderOpen, Image as ImageIcon, Link2, MonitorPlay, Play, Scale, StickyNote } from 'lucide-react'
import { Section, display } from './page'

// Секции показа продукта (2026-10-29): не сырой снимок приложения, а сочинённая композиция, как у Weave и Magnific.
// Показывается результат, а не процесс; без хрома приложения; у рамки свой фон в оттенке акцента направления.
const TINT = 'color-mix(in oklab, var(--lp-accent) 14%, var(--lp-raised))'


// Узел в языке интерфейса Refkit: название капсом над рамкой, карточка со скруглением, порты кружками, внизу модель и круглая кнопка запуска.
const ICONS = { note: StickyNote, article: FileText, image: ImageIcon, folder: FolderOpen, agent: Bot, screen: MonitorPlay, verdict: Scale, link: Link2 }
export interface NodeShotProps {
  /** Тип узла: задаёт значок */
  kind: keyof typeof ICONS
  /** Название над рамкой (капсом), например Idea, Verdict, Landing */
  title: string
  /** Строки внутри: первая заметнее остальных */
  lines?: string[]
  /** Кадр результата из ассетов страницы (assets.<имя>) вместо строк */
  image?: string
  /** Метки-чипы под строками */
  chips?: string[]
  /** Подпись модели внизу (у агентных узлов), например GPT-6 Sol */
  model?: string
  /** Порты: слева, справа, оба или без */
  ports?: 'left' | 'right' | 'both' | 'none'
  /** Обрезать кадр по пропорции сверху, например '16 / 10' (высокие кадры не раздувают узел) */
  ratio?: string
}
export function NodeShot({ kind, title, lines = [], image, chips = [], model, ports = 'both', ratio }: NodeShotProps) {
  const Icon = ICONS[kind]
  const dot = 'absolute top-1/2 size-2.5 -translate-y-1/2 rounded-full border border-[var(--lp-muted)] bg-[var(--lp-surface)]'
  return (
    <div className="relative w-full min-w-0">
      <div className="mb-2 flex items-center gap-1.5 px-1 text-[var(--lp-muted)]">
        <Icon className="size-3.5 shrink-0" />
        <span className="truncate text-xs font-semibold uppercase tracking-[0.06em] text-[var(--lp-text)]">{title}</span>
      </div>
      <div className="relative border border-[var(--lp-border)] bg-[var(--lp-surface)]" style={{ borderRadius: 'var(--lp-r-card)' }}>
        {ports === 'left' || ports === 'both' ? <span className={`${dot} -left-[6px]`} /> : null}
        {ports === 'right' || ports === 'both' ? <span className={`${dot} -right-[6px]`} /> : null}
        {image ? <div className="overflow-hidden" style={{ borderRadius: 'var(--lp-r-card)', ...(ratio ? { aspectRatio: ratio } : {}) }}><img src={image} alt={title} className={ratio ? 'block h-full w-full object-cover object-top' : 'block h-auto w-full'} /></div> : (
          <div className="flex flex-col gap-1.5 px-4 py-3.5">
            {lines.map((line, at) => <span key={line} className={at === 0 ? 'text-[length:var(--lp-fs-body)] leading-snug text-[var(--lp-text)]' : 'text-sm leading-snug text-[var(--lp-muted)]'}>{line}</span>)}
            {chips.length ? <div className="mt-1 flex flex-wrap gap-1.5">{chips.map((chip) => <span key={chip} className="border border-[var(--lp-border)] px-2 py-0.5 text-xs text-[var(--lp-muted)]" style={{ borderRadius: 'var(--lp-r-button)' }}>{chip}</span>)}</div> : null}
          </div>
        )}
        {model ? (
          <div className="flex items-center justify-between border-t border-[var(--lp-border-soft)] px-3 py-2">
            <span className="text-xs text-[var(--lp-muted)]">{model}</span>
            <span className="flex size-7 items-center justify-center rounded-full bg-[var(--lp-text)] text-[var(--lp-surface)]"><Play className="size-3.5 fill-current" /></span>
          </div>
        ) : null}
      </div>
    </div>
  )
}

export interface CanvasTextNode {
  /** Короткая служебная метка узла, например Note, Article, Agent */
  label: string
  title: string
  /** Одна короткая строка пояснения, необязательно */
  text?: string
  /** Тип узла для значка (у входов): note, article, image; у агента не нужен */
  kind?: 'note' | 'article' | 'image' | 'folder'
  /** Подпись модели внизу (у агента) */
  model?: string
}
export interface CanvasResultNode {
  /** Короткая метка результата, например Brand directions */
  label: string
  /** Кадр результата из ассетов страницы (assets.<имя>) */
  image?: string
  /** Подпись под кадром */
  caption: string
}
export interface ProductCanvasProps {
  /** Что кладёшь в продукт: 2–3 узла слева */
  inputs: CanvasTextNode[]
  /** Агент посередине: что он делает одной строкой */
  agent: CanvasTextNode
  /** Что получаешь: 1–3 результата справа, с кадрами из ассетов */
  results: CanvasResultNode[]
}

// Позиции узлов в процентах холста 16:8; столбцы: входы 3–27, агент 38–62, результаты 73–97
const place = (count: number, height: number) => Array.from({ length: count }, (_, at) => ((100 - count * height) / (count + 1)) * (at + 1) + at * height)
const curve = (x1: number, y1: number, x2: number, y2: number) => `M ${x1} ${y1} C ${x1 + 6} ${y1}, ${x2 - 6} ${y2}, ${x2} ${y2}`

/** Сочинённый кадр холста: материалы → агент → результаты, с изогнутыми связями. На телефоне те же узлы идут столбиком. */
export function ProductCanvas({ inputs, agent, results }: ProductCanvasProps) {
  const inH = 24, resH = results.length === 1 ? 64 : results.length === 2 ? 44 : 30, agentH = 30
  const inTops = place(inputs.length, inH), resTops = place(results.length, resH), agentTop = (100 - agentH) / 2
  const agentMid = agentTop + agentH / 2
  return (
    <Section flush>
      <div className="hidden lg:block">
        <div className="relative w-full overflow-hidden" style={{ aspectRatio: '16 / 8', background: TINT, borderRadius: 'var(--lp-r-card)' }}>
          <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
            {inputs.map((_, at) => <path key={`i${at}`} d={curve(27, inTops[at] + inH / 2, 38, agentMid)} fill="none" stroke="var(--lp-accent)" strokeWidth="2" vectorEffect="non-scaling-stroke" opacity="0.8" />)}
            {results.map((_, at) => <path key={`r${at}`} d={curve(62, agentMid, 73, resTops[at] + resH / 2)} fill="none" stroke="var(--lp-accent)" strokeWidth="2" vectorEffect="non-scaling-stroke" opacity="0.8" />)}
          </svg>
          {inputs.map((node, at) => <div key={node.title} className="absolute" style={{ left: '3%', width: '24%', top: `${inTops[at] + inH / 2}%`, transform: 'translateY(-50%)' }}><NodeShot kind={node.kind ?? 'note'} title={node.label} lines={[node.title, ...(node.text ? [node.text] : [])]} ports="right" /></div>)}
          <div className="absolute" style={{ left: '38%', width: '24%', top: `${agentMid}%`, transform: 'translateY(-50%)' }}><NodeShot kind="agent" title={agent.label} lines={[agent.title, ...(agent.text ? [agent.text] : [])]} model={agent.model} /></div>
          {results.map((node, at) => <div key={node.caption} className="absolute" style={{ left: '73%', width: '24%', top: `${resTops[at] + resH / 2}%`, transform: 'translateY(-50%)' }}><NodeShot kind="screen" title={node.label} image={node.image} lines={node.image ? [] : [node.caption]} ports="left" ratio="16 / 10" /></div>)}
        </div>
      </div>
      <div className="flex flex-col gap-6 lg:hidden">
        {inputs.map((node) => <NodeShot key={node.title} kind={node.kind ?? 'note'} title={node.label} lines={[node.title, ...(node.text ? [node.text] : [])]} ports="none" />)}
        <NodeShot kind="agent" title={agent.label} lines={[agent.title, ...(agent.text ? [agent.text] : [])]} model={agent.model} ports="none" />
        {results.map((node) => <NodeShot key={node.caption} kind="screen" title={node.label} image={node.image} lines={node.image ? [] : [node.caption]} ports="none" ratio="16 / 10" />)}
      </div>
    </Section>
  )
}

export interface BentoTile {
  title: string
  /** Одна-две строки */
  text: string
  /** Кадр из ассетов страницы (assets.<имя>): крупный кроп одного блока интерфейса */
  image?: string
  /** Узлы в стиле интерфейса вместо кадра: 1–3 штуки, идут рядом со связью */
  nodes?: NodeShotProps[]
  /** Ширина плитки: wide — две колонки, full — три */
  span?: 'wide' | 'full'
}
export interface BentoProps {
  title?: string
  /** Плитки: одна мысль в каждой, в сетке из трёх колонок */
  tiles: BentoTile[]
}

/** Плитки: заголовок, одна строка и один кадр или узлы в рамке с тонированным фоном. */
export function Bento({ title, tiles }: BentoProps) {
  return (
    <Section>
      {title ? <h2 className={`${display} mb-12 max-w-[760px] text-[length:var(--lp-fs-h2)]`}>{title}</h2> : null}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {tiles.map((tile) => (
          <div key={tile.title} className={`flex flex-col justify-start gap-8 p-8 ${tile.span === 'full' ? 'lg:col-span-3' : tile.span === 'wide' ? 'lg:col-span-2' : ''}`} style={{ background: TINT, borderRadius: 'var(--lp-r-card)' }}>
            {tile.nodes?.length ? (
              <div className={`flex items-center gap-4 flex-col ${tile.span && tile.nodes.length > 1 ? 'lg:flex-row' : ''}`}>
                {tile.nodes.map((node, at) => (
                  <div key={node.title} className="contents">
                    {at ? <span className={`h-5 w-px shrink-0 bg-[var(--lp-accent)] ${tile.span ? 'lg:h-px lg:w-6' : ''}`} /> : null}
                    <NodeShot {...node} ports={tile.nodes!.length === 1 ? 'none' : at === 0 ? 'right' : at === tile.nodes!.length - 1 ? 'left' : 'both'} />
                  </div>
                ))}
              </div>
            ) : tile.image ? <div className="overflow-hidden border border-[var(--lp-border)] bg-[var(--lp-surface)]" style={{ borderRadius: 'var(--lp-r-card)' }}><img src={tile.image} alt={tile.title} className="block h-auto w-full" /></div> : null}
            <div className="flex flex-col gap-2">
              <h3 className={`${display} text-[length:var(--lp-fs-h3)]`}>{tile.title}</h3>
              <p className="max-w-[560px] text-[length:var(--lp-fs-body)] leading-relaxed text-[var(--lp-muted)]">{tile.text}</p>
            </div>
          </div>
        ))}
      </div>
    </Section>
  )
}

export interface FeatureGridProps {
  title: string
  /** Мелкие возможности: название и одна строка, 6–12 штук */
  items: Array<{ title: string; text: string }>
}

/** Сетка «и ещё»: компактные строки без кадров, для возможностей, которым не нужна плитка. */
export function FeatureGrid({ title, items }: FeatureGridProps) {
  return (
    <Section tone="raised">
      <h2 className={`${display} max-w-[760px] text-[length:var(--lp-fs-h2)]`}>{title}</h2>
      <div className="mt-14 grid grid-cols-1 gap-x-8 gap-y-10 md:grid-cols-3">
        {items.map((item) => (
          <div key={item.title} className="flex flex-col gap-2 border-t border-[var(--lp-border)] pt-4">
            <h3 className={`${display} text-[length:var(--lp-fs-lead)]`}>{item.title}</h3>
            <p className="text-[length:var(--lp-fs-body)] leading-relaxed text-[var(--lp-muted)]">{item.text}</p>
          </div>
        ))}
      </div>
    </Section>
  )
}
