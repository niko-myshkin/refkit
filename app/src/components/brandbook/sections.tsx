import { useId, type CSSProperties } from 'react'
import { FONT_PAIRS } from '../../../shared/font-pairs.mjs'
import { cleanSymbol } from '../../../shared/symbol.mjs'
import { Section, contrast, display, label } from '../landing/page'

// Набор секций «Брендбук» v2 (2026-11-01, grill-templates.md): одна страница про готовый бренд. Агент не верстает, а переносит значения из текста
// «Система и голос» в свойства секций. Знак — SVG из фигур на сетке 4 px (он приходит в тексте выбранного маршрута; здесь проходит очистку и рисуется
// цветом currentColor, поэтому перекрашивается под любой фон). Вордмарк — картинка из ноды «Картинка» (чёрные буквы на белом): на тёмном её инвертируют,
// на светлом и на акценте умножают. Всё, что показывает правила знака (охранное поле, сетка построения, варианты, «чего нельзя», применения),
// рисуется здесь кодом из знака; контраст цветов считает код (WCAG), модель чисел не выдумывает. Тема направления и шрифты — те же, что у остальных наборов (Page).

const SURFACE = '#141414', WHITE = '#ffffff'
type Tone = 'dark' | 'light' | 'accent'

/** Старые брендбуки сохраняют свой SVG или прозрачную монограмму; новые берут первую букву из вордмарка. */
function Sym({ svg, mark, wordmark, size, style }: { svg?: string; mark?: string; wordmark?: string; size: number; style?: CSSProperties }) {
  if (mark) return <span aria-hidden className="block shrink-0 bg-current" style={{ width: size, height: size, maskImage: `url("${mark}")`, maskSize: 'contain', maskRepeat: 'no-repeat', maskPosition: 'center', ...style }} />
  const clean = cleanSymbol(svg)
  if (clean) return <span aria-hidden className="block shrink-0 [&>svg]:size-full" style={{ width: size, height: size, ...style }} dangerouslySetInnerHTML={{ __html: clean }} />
  if (!wordmark) return null
  return <span aria-hidden className="relative block shrink-0 overflow-hidden" style={{ width: size, height: size, ...style }}><span className="absolute top-0 bottom-0 overflow-hidden" style={{ left: size * 0.12, width: size * 0.76 }}><span className="absolute top-1/2 block" style={{ transform: `translate(${-size * 0.18}px, -50%)` }}><Word name="" src={wordmark} height={size * 1.25} /></span></span></span>
}

/** Вордмарк: картинка из ассетов (чёрные буквы на белом) перекрашивается в цвет родителя SVG-фильтром: яркость картинки становится прозрачностью,
 *  поэтому на тёмном, светлом и на акценте буквы лежат без плашки. Белый в JPEG не ровно 255, поэтому прозрачность подтянута (всё почти белое становится прозрачным) и крайние пиксели срезаны. Область фильтра ровно по картинке: по умолчанию она шире на 10%, и в этой каёмке «прозрачный чёрный» стал бы белой рамкой. Нет картинки — название шрифтом заголовка направления */
function Word({ name, src, height }: { name: string; src?: string; height: number; tone?: Tone }) {
  const id = useId().replace(/:/g, '')
  if (!src) return <span className={`${display} inline-block whitespace-nowrap`} style={{ fontSize: height * 0.8, lineHeight: 1 }}>{name}</span>
  return (
    <span className="inline-block">
      <svg width="0" height="0" aria-hidden className="absolute"><filter id={`wm-${id}`} x="0" y="0" width="1" height="1" colorInterpolationFilters="sRGB"><feColorMatrix type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  -0.33 -0.33 -0.33 0 1" result="raw" /><feComponentTransfer in="raw" result="ink"><feFuncA type="linear" slope="1.6" intercept="-0.3" /></feComponentTransfer><feFlood floodColor="currentColor" /><feComposite in2="ink" operator="in" /></filter></svg>
      <img src={src} alt={name} draggable={false} className="block max-w-none" style={{ height, width: 'auto', filter: `url(#wm-${id})`, clipPath: 'inset(2px)' }} />
    </span>
  )
}

/** Лок-ап: знак и вордмарк вместе, в строку или столбиком */
function Lockup({ name, symbol, mark, wordmark, size, tone, stacked }: { name: string; symbol?: string; mark?: string; wordmark?: string; size: number; tone: Tone; stacked?: boolean }) {
  const has = Boolean(mark || cleanSymbol(symbol) || wordmark)
  return (
    <span className={`inline-flex items-center ${stacked ? 'flex-col' : ''}`} style={{ gap: size * 0.28 }}>
      {has && <Sym svg={symbol} mark={mark} wordmark={wordmark} size={size} />}
      <Word name={name} src={wordmark} height={has ? size * 0.9 : size} tone={tone} />
    </span>
  )
}

export interface BookCoverProps {
  /** Название бренда словом, как в брифе */
  name: string
  /** Идея бренда одним-двумя предложениями */
  idea: string
  /** Три черты личности, по слову */
  traits: string[]
  /** Дата, например 1 Nov 2026 */
  date: string
  /** SVG знака из поля Symbol системы, строкой без изменений */
  symbol?: string
  /** Прозрачная монограмма из ноды «Картинка» */
  mark?: string
  /** Картинка вордмарка из ассетов страницы (assets.<имя>) */
  wordmark?: string
}
export function BookCover({ name, idea, traits, date, symbol, mark, wordmark }: BookCoverProps) {
  const has = Boolean(mark || cleanSymbol(symbol) || wordmark)
  return (
    <Section>
      <div className="grid grid-cols-[1fr_380px] items-center gap-[var(--lp-gap)]">
        <div>
          <p className={`${label} mb-8`}>Brand book · {date}</p>
          <Lockup name={name} symbol={symbol} mark={mark} wordmark={wordmark} size={72} tone="dark" />
          <p className="mt-8 max-w-[640px] text-[length:var(--lp-fs-lead)] leading-relaxed text-[var(--lp-muted)]">{idea}</p>
          <ul className="mt-10 flex flex-wrap gap-3">
            {traits.map((trait) => (
              <li key={trait} className="border border-[var(--lp-border)] px-5 py-2 text-[length:var(--lp-fs-body)] text-[var(--lp-text)]" style={{ borderRadius: 'var(--lp-r-button)' }}>{trait.charAt(0).toUpperCase() + trait.slice(1)}</li>
            ))}
          </ul>
        </div>
        {has && <div className="grid aspect-square place-items-center" style={{ borderRadius: 'var(--lp-r-card)', background: 'var(--lp-accent)', color: 'var(--lp-ink)' }}><Sym svg={symbol} mark={mark} wordmark={wordmark} size={200} /></div>}
      </div>
    </Section>
  )
}

export interface LogoProps {
  name: string
  /** SVG знака из поля Symbol системы, строкой без изменений */
  symbol?: string
  mark?: string
  /** Картинка вордмарка из ассетов страницы (assets.<имя>) */
  wordmark?: string
  /** Охранное поле одной фразой: свободная зона вокруг лок-апа равна половине высоты знака, называется x */
  clearSpace: string
  /** Минимальный размер лок-апа на экране, например «96 px по ширине» */
  minDigital: string
  /** Минимальный размер знака-иконки, например «16 px» */
  minIcon: string
}
export function Logo({ name, symbol, mark, wordmark, clearSpace, minDigital, minIcon }: LogoProps) {
  const unit = 24 // x на схеме = половина высоты знака (48 px)
  return (
    <Section tone="raised">
      <h2 className={`${display} mb-10 text-[length:var(--lp-fs-h2)]`}>Logo</h2>
      <div className="grid grid-cols-[1fr_340px] gap-[var(--lp-gap)]">
        <div className="relative flex items-center justify-center border border-dashed border-[var(--lp-border)] bg-[var(--lp-surface)] p-16" style={{ borderRadius: 'var(--lp-r-card)' }}>
          <div className="relative outline outline-1 outline-dashed outline-[var(--lp-accent)]" style={{ padding: unit }}>
            <Lockup name={name} symbol={symbol} mark={mark} wordmark={wordmark} size={48} tone="dark" />
            <span aria-hidden className="absolute top-0 left-0 grid place-items-center bg-[var(--lp-accent)] text-[length:var(--lp-fs-small)] text-[var(--lp-ink)]" style={{ width: unit, height: unit }}>x</span>
            <span aria-hidden className="absolute right-0 bottom-0 grid place-items-center bg-[var(--lp-accent)] text-[length:var(--lp-fs-small)] text-[var(--lp-ink)]" style={{ width: unit, height: unit }}>x</span>
          </div>
        </div>
        <dl className="flex flex-col gap-6 self-center">
          <div><dt className={label}>Clear space</dt><dd className="mt-2 text-[length:var(--lp-fs-body)] leading-relaxed text-[var(--lp-text)]">{clearSpace}</dd></div>
          <div><dt className={label}>Minimum size</dt><dd className="mt-2 text-[length:var(--lp-fs-body)] leading-relaxed text-[var(--lp-text)]">Lockup: {minDigital}<br />Symbol: {minIcon}</dd></div>
          <div className="flex items-end gap-6"><Lockup name={name} symbol={symbol} mark={mark} wordmark={wordmark} size={16} tone="dark" /><Sym svg={symbol} mark={mark} wordmark={wordmark} size={16} /></div>
        </dl>
      </div>
      <div className="mt-12 grid grid-cols-4 gap-6">
        <div className="grid h-44 place-items-center border border-[var(--lp-border)] bg-[var(--lp-surface)]" style={{ borderRadius: 'var(--lp-r-card)' }}><Lockup name={name} symbol={symbol} mark={mark} wordmark={wordmark} size={36} tone="dark" /></div>
        <div className="grid h-44 place-items-center" style={{ borderRadius: 'var(--lp-r-card)', background: '#f2f2f2', color: SURFACE }}><Lockup name={name} symbol={symbol} mark={mark} wordmark={wordmark} size={36} tone="light" /></div>
        <div className="grid h-44 place-items-center" style={{ borderRadius: 'var(--lp-r-card)', background: 'var(--lp-accent)', color: 'var(--lp-ink)' }}><Lockup name={name} symbol={symbol} mark={mark} wordmark={wordmark} size={36} tone="accent" /></div>
        <div className="grid h-44 place-items-center border border-[var(--lp-border)] bg-[var(--lp-surface)]" style={{ borderRadius: 'var(--lp-r-card)' }}><Lockup name={name} symbol={symbol} mark={mark} wordmark={wordmark} size={44} tone="dark" stacked /></div>
        {['Primary', 'On light', 'Mono on accent', 'Stacked'].map((caption) => <p key={caption} className="text-[length:var(--lp-fs-small)] text-[var(--lp-subtle)]">{caption}</p>)}
      </div>
    </Section>
  )
}

export interface ConstructionProps {
  /** SVG знака из поля Symbol системы, строкой без изменений */
  symbol?: string
  mark?: string
  wordmark?: string
  /** Одна фраза о том, как построен знак: из каких фигур и какая идея */
  note: string
}
export function Construction({ symbol, mark, wordmark, note }: ConstructionProps) {
  if (!mark && !wordmark && !cleanSymbol(symbol)) return null
  const lines = Array.from({ length: 9 }, (_, at) => at * 8)
  return (
    <Section>
      <h2 className={`${display} mb-10 text-[length:var(--lp-fs-h2)]`}>Construction</h2>
      <div className="grid grid-cols-[420px_1fr] items-center gap-[var(--lp-gap)]">
        <div className="relative aspect-square border border-[var(--lp-border)] bg-[var(--lp-surface)]" style={{ borderRadius: 'var(--lp-r-card)' }}>
          <div className="absolute inset-8 grid place-items-center" style={{ color: 'var(--lp-text)' }}><Sym svg={symbol} mark={mark} wordmark={wordmark} size={324} /></div>
          {!mark && !wordmark && <svg aria-hidden viewBox="0 0 64 64" className="absolute inset-8 size-[calc(100%-4rem)]" fill="none" stroke="var(--lp-accent)" strokeWidth={0.15}>
            {lines.map((at) => <g key={at}><line x1={at} y1={0} x2={at} y2={64} /><line x1={0} y1={at} x2={64} y2={at} /></g>)}
            <rect x={0} y={0} width={64} height={64} strokeWidth={0.3} />
          </svg>}
        </div>
        <div className="flex flex-col gap-6">
          <p className="max-w-[520px] text-[length:var(--lp-fs-lead)] leading-relaxed text-[var(--lp-text)]">{note}</p>
          <dl className="grid grid-cols-3 gap-6">
            <div><dt className={label}>{mark || wordmark ? 'Source' : 'Grid'}</dt><dd className="mt-2 text-[length:var(--lp-fs-body)] text-[var(--lp-muted)]">{mark || wordmark ? 'Wordmark' : '64 × 64'}</dd></div>
            <div><dt className={label}>{mark || wordmark ? 'Method' : 'Unit'}</dt><dd className="mt-2 text-[length:var(--lp-fs-body)] text-[var(--lp-muted)]">{mark || wordmark ? 'First letter' : '4 px'}</dd></div>
            <div><dt className={label}>Colors</dt><dd className="mt-2 text-[length:var(--lp-fs-body)] text-[var(--lp-muted)]">one, any</dd></div>
          </dl>
        </div>
      </div>
    </Section>
  )
}

export interface LogoMisuseProps {
  name: string
  /** SVG знака из поля Symbol системы, строкой без изменений */
  symbol?: string
  mark?: string
  /** Картинка вордмарка из ассетов страницы (assets.<имя>) */
  wordmark?: string
  /** Три коротких правила «чего нельзя», своими словами бренда */
  rules: string[]
}
export function LogoMisuse({ name, symbol, mark, wordmark, rules }: LogoMisuseProps) {
  const cases: Array<{ caption: string; style: CSSProperties; tile?: CSSProperties }> = [
    { caption: 'Do not stretch', style: { transform: 'scaleX(1.7)' } },
    { caption: 'Do not rotate', style: { transform: 'rotate(-14deg)' } },
    { caption: 'Do not recolor', style: { filter: 'hue-rotate(150deg) saturate(3)', color: '#ff3df2' } },
    { caption: 'Do not put on busy backgrounds', style: {}, tile: { background: 'repeating-linear-gradient(45deg, #f2f2f2 0 10px, #141414 10px 20px)' } },
  ]
  return (
    <Section tone="raised">
      <h2 className={`${display} mb-10 text-[length:var(--lp-fs-h2)]`}>Do not</h2>
      <div className="grid grid-cols-4 gap-6">
        {cases.map((item) => (
          <div key={item.caption} className="flex flex-col gap-3">
            <div className="grid h-36 place-items-center overflow-hidden border border-[var(--lp-border)] bg-[var(--lp-fill)]" style={{ borderRadius: 'var(--lp-r-card)', ...item.tile }}>
              <span style={item.style}><Lockup name={name} symbol={symbol} mark={mark} wordmark={wordmark} size={28} tone="dark" /></span>
            </div>
            <p className="text-[length:var(--lp-fs-small)] text-[var(--lp-subtle)]">× {item.caption}</p>
          </div>
        ))}
      </div>
      <ul className="mt-10 grid max-w-[760px] gap-3">
        {rules.map((rule) => <li key={rule} className="border-t border-[var(--lp-border)] pt-3 text-[length:var(--lp-fs-body)] leading-relaxed text-[var(--lp-muted)]">{rule}</li>)}
      </ul>
    </Section>
  )
}

export interface ColorsProps {
  /** Цвета с ролью: роль словом (Background, Text, Accent…), значение #RRGGBB ровно как в системе, где использовать (у цвета из референса — из какого) */
  colors: Array<{ role: string; hex: string; usage: string }>
}
export function Colors({ colors }: ColorsProps) {
  const grade = (ratio: number) => ratio >= 7 ? 'AAA' : ratio >= 4.5 ? 'AA' : ratio >= 3 ? 'large text only' : 'fails'
  return (
    <Section>
      <h2 className={`${display} mb-10 text-[length:var(--lp-fs-h2)]`}>Color</h2>
      <div className="grid grid-cols-3 gap-6">
        {colors.map((color) => {
          // Контраст считает код: лучший из белого и графита на этом цвете (WCAG), модель чисел не выдумывает
          const onWhite = contrast(color.hex, WHITE), onInk = contrast(color.hex, SURFACE)
          const ink = onWhite >= onInk ? WHITE : SURFACE, ratio = Math.max(onWhite, onInk)
          return (
            <div key={color.role} className="overflow-hidden border border-[var(--lp-border)]" style={{ borderRadius: 'var(--lp-r-card)' }}>
              <div className="flex h-36 flex-col justify-end p-5" style={{ background: color.hex, color: ink }}>
                <p className={`${display} text-[length:var(--lp-fs-h3)]`}>{color.role}</p>
                <p className="mt-1 text-[length:var(--lp-fs-small)] uppercase tracking-[0.08em]">{color.hex}</p>
              </div>
              <div className="flex flex-col gap-2 bg-[var(--lp-raised)] p-5">
                <p className="text-[length:var(--lp-fs-body)] leading-relaxed text-[var(--lp-text)]">{color.usage}</p>
                <p className="text-[length:var(--lp-fs-small)] text-[var(--lp-subtle)]">{ink === WHITE ? 'White' : 'Graphite'} text: {ratio.toFixed(1)}:1 · {grade(ratio)}</p>
              </div>
            </div>
          )
        })}
      </div>
    </Section>
  )
}

export interface TypographyProps {
  /** Шрифтовая пара направления строкой из списка, ровно как в Page */
  pair: string
  /** Образец текста для шкалы: одна короткая фраза бренда */
  sample: string
}
export function Typography({ pair, sample }: TypographyProps) {
  const faces = FONT_PAIRS[pair]
  const names = faces ? { head: faces.display.family.replace(' Variable', ''), text: faces.text.family.replace(' Variable', '') } : { head: pair.split(' + ')[0], text: pair.split(' + ')[1] ?? '' }
  const scale: Array<{ name: string; size: string; headline: boolean }> = [
    { name: 'Hero', size: 'var(--lp-fs-hero)', headline: true }, { name: 'Heading', size: 'var(--lp-fs-h2)', headline: true }, { name: 'Subheading', size: 'var(--lp-fs-h3)', headline: true },
    { name: 'Body', size: 'var(--lp-fs-body)', headline: false },
  ]
  return (
    <Section tone="raised">
      <h2 className={`${display} mb-10 text-[length:var(--lp-fs-h2)]`}>Type</h2>
      <p className="mb-8 max-w-[640px] text-[length:var(--lp-fs-body)] leading-relaxed text-[var(--lp-muted)]">The name itself is custom lettering. This pair is for everything around it: headlines, text and interface.</p>
      <div className="mb-10 grid grid-cols-2 gap-6">
        <div className="border border-[var(--lp-border)] p-6" style={{ borderRadius: 'var(--lp-r-card)' }}><p className={label}>Headlines</p><p className={`${display} mt-3 text-[length:var(--lp-fs-h3)]`}>{names.head}</p></div>
        <div className="border border-[var(--lp-border)] p-6" style={{ borderRadius: 'var(--lp-r-card)' }}><p className={label}>Text</p><p className="mt-3 text-[length:var(--lp-fs-h3)]">{names.text}</p></div>
      </div>
      <div className="flex flex-col">
        {scale.map((row) => (
          <div key={row.name} className="grid grid-cols-[160px_1fr] items-baseline gap-8 border-t border-[var(--lp-border)] py-5">
            <p className={label}>{row.name}</p>
            <p className={row.headline ? display : 'leading-relaxed text-[var(--lp-muted)]'} style={{ fontSize: row.size }}>{sample}</p>
          </div>
        ))}
      </div>
    </Section>
  )
}

export interface VoiceProps {
  /** Тон одним предложением: какой он и каким не бывает */
  tone: string
  /** Три пары фраз: как говорит бренд и как никогда не говорит */
  phrases: Array<{ say: string; avoid: string }>
}
export function Voice({ tone, phrases }: VoiceProps) {
  return (
    <Section>
      <h2 className={`${display} mb-6 text-[length:var(--lp-fs-h2)]`}>Voice</h2>
      <p className="mb-10 max-w-[760px] text-[length:var(--lp-fs-lead)] leading-relaxed text-[var(--lp-muted)]">{tone}</p>
      <div className="grid grid-cols-2 gap-x-[var(--lp-gap)]">
        <p className={`${label} pb-3`}>We say</p><p className={`${label} pb-3`}>We never say</p>
        {phrases.map((item) => (
          <div key={item.say} className="contents">
            <p className="border-t border-[var(--lp-border)] py-4 text-[length:var(--lp-fs-body)] leading-relaxed text-[var(--lp-text)]">{item.say}</p>
            <p className="border-t border-[var(--lp-border)] py-4 text-[length:var(--lp-fs-body)] leading-relaxed text-[var(--lp-subtle)] line-through">{item.avoid}</p>
          </div>
        ))}
      </div>
    </Section>
  )
}

export interface ApplicationsProps {
  name: string
  /** SVG знака из поля Symbol системы, строкой без изменений */
  symbol?: string
  mark?: string
  /** Картинка вордмарка из ассетов страницы (assets.<имя>) */
  wordmark?: string
}
export function Applications({ name, symbol, mark, wordmark }: ApplicationsProps) {
  const tile = 'flex h-56 flex-col items-center justify-center gap-5 border border-[var(--lp-border)] bg-[var(--lp-surface)]'
  const radius = { borderRadius: 'var(--lp-r-card)' }
  return (
    <Section tone="raised">
      <h2 className={`${display} mb-10 text-[length:var(--lp-fs-h2)]`}>In the world</h2>
      <div className="grid grid-cols-4 gap-6">
        <div className="flex flex-col gap-3">
          <div className={tile} style={radius}>
            <div className="flex items-end gap-4">
              {[96, 56, 32].map((size) => <span key={size} className="grid place-items-center" style={{ width: size, height: size, borderRadius: size * 0.22, background: 'var(--lp-accent)', color: 'var(--lp-ink)' }}><Sym svg={symbol} mark={mark} wordmark={wordmark} size={size * 0.6} /></span>)}
            </div>
          </div>
          <p className="text-[length:var(--lp-fs-small)] text-[var(--lp-subtle)]">App icon</p>
        </div>
        <div className="flex flex-col gap-3">
          <div className={tile} style={radius}>
            <div className="flex w-52 items-center gap-2 border border-[var(--lp-border)] bg-[var(--lp-raised)] px-3 py-2" style={{ borderRadius: 10 }}>
              <Sym svg={symbol} mark={mark} wordmark={wordmark} size={16} style={{ color: 'var(--lp-accent)' }} /><span className="truncate text-[length:var(--lp-fs-small)] text-[var(--lp-muted)]">{name}</span>
            </div>
            <div className="flex items-center gap-3 text-[var(--lp-accent)]"><Sym svg={symbol} mark={mark} wordmark={wordmark} size={32} /><Sym svg={symbol} mark={mark} wordmark={wordmark} size={16} /></div>
          </div>
          <p className="text-[length:var(--lp-fs-small)] text-[var(--lp-subtle)]">Favicon, 32 and 16 px</p>
        </div>
        <div className="flex flex-col gap-3">
          <div className={tile} style={radius}>
            <span className="grid size-28 place-items-center rounded-full border border-[var(--lp-border)] bg-[var(--lp-raised)]" style={{ color: 'var(--lp-accent)' }}><Sym svg={symbol} mark={mark} wordmark={wordmark} size={60} /></span>
          </div>
          <p className="text-[length:var(--lp-fs-small)] text-[var(--lp-subtle)]">Avatar</p>
        </div>
        <div className="flex flex-col gap-3">
          <div className={tile} style={radius}>
            <Lockup name={name} symbol={symbol} mark={mark} wordmark={wordmark} size={32} tone="dark" />
            <span className="px-5 py-2 text-[length:var(--lp-fs-small)] font-medium" style={{ borderRadius: 'var(--lp-r-button)', background: 'var(--lp-accent)', color: 'var(--lp-ink)' }}>Get started</span>
          </div>
          <p className="text-[length:var(--lp-fs-small)] text-[var(--lp-subtle)]">Header and button</p>
        </div>
      </div>
    </Section>
  )
}

export interface MoodboardProps {
  /** Референсы, из которых вырос бренд, до четырёх: картинка из ассетов страницы и одно предложение о том, что бренд берёт у неё */
  items: Array<{ src: string; caption: string }>
}
export function Moodboard({ items }: MoodboardProps) {
  return (
    <Section>
      <h2 className={`${display} mb-10 text-[length:var(--lp-fs-h2)]`}>Where it comes from</h2>
      <div className="grid grid-cols-4 gap-6">
        {items.slice(0, 4).map((item) => (
          <figure key={item.caption} className="flex flex-col gap-3">
            <div className="aspect-square overflow-hidden border border-[var(--lp-border)] bg-[var(--lp-fill)]" style={{ borderRadius: 'var(--lp-r-card)' }}><img src={item.src} alt="" className="size-full object-contain" /></div>
            <figcaption className="text-[length:var(--lp-fs-small)] leading-relaxed text-[var(--lp-muted)]">{item.caption}</figcaption>
          </figure>
        ))}
      </div>
    </Section>
  )
}

export interface InUseProps {
  /** Заголовок hero в голосе бренда, до 8 слов */
  headline: string
  /** Одно предложение под заголовком */
  sub: string
  /** Текст главной кнопки, 2–3 слова */
  button: string
  /** Карточка: заголовок и одно предложение */
  card: { title: string; text: string }
}
export function InUse({ headline, sub, button, card }: InUseProps) {
  return (
    <Section tone="raised">
      <h2 className={`${display} mb-10 text-[length:var(--lp-fs-h2)]`}>In use</h2>
      <div className="grid grid-cols-[1.4fr_1fr] gap-6">
        <div className="flex flex-col justify-center border border-[var(--lp-border)] bg-[var(--lp-surface)] p-12" style={{ borderRadius: 'var(--lp-r-card)' }}>
          <p className={`${display} text-[length:var(--lp-fs-h2)]`}>{headline}</p>
          <p className="mt-4 max-w-[480px] text-[length:var(--lp-fs-lead)] leading-relaxed text-[var(--lp-muted)]">{sub}</p>
          <div className="mt-8 flex gap-3">
            <span className="px-6 py-3 text-[length:var(--lp-fs-body)] font-medium" style={{ borderRadius: 'var(--lp-r-button)', background: 'var(--lp-accent)', color: 'var(--lp-ink)' }}>{button}</span>
            <span className="border border-[var(--lp-border)] px-6 py-3 text-[length:var(--lp-fs-body)] text-[var(--lp-text)]" style={{ borderRadius: 'var(--lp-r-button)' }}>Learn more</span>
          </div>
        </div>
        <div className="flex flex-col justify-end border border-[var(--lp-border)] bg-[var(--lp-surface)] p-8" style={{ borderRadius: 'var(--lp-r-card)' }}>
          <p className={`${display} text-[length:var(--lp-fs-h3)]`}>{card.title}</p>
          <p className="mt-3 text-[length:var(--lp-fs-body)] leading-relaxed text-[var(--lp-muted)]">{card.text}</p>
        </div>
      </div>
    </Section>
  )
}
