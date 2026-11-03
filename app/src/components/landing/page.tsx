import type { CSSProperties, ReactNode } from 'react'
import { FONT_PAIRS, cssFamily } from '../../../shared/font-pairs.mjs'

// Набор секций лендинга (2026-10-27): агент не верстает страницу, а собирает её из этих секций, подставляя текст, кадры и тему из выбранного направления.
// Вёрстка (сетка, отступы, ритм) зашита здесь, поэтому страница каждый раз ровная, а токенов на неё уходит меньше. Все цвета, шрифты и скругления — из темы <Page>.
const luminance = (hex: string) => { const [r, g, b] = [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * r + 0.7152 * g + 0.0722 * b }
const inkOn = (hex: string) => { const l = luminance(hex); return 1.05 / (l + 0.05) >= (l + 0.05) / 0.057 ? '#ffffff' : '#141414' }
/** Контраст двух цветов #RRGGBB по WCAG (от 1 до 21): для плашек цвета в брендбуке, считается кодом, а не моделью */
export const contrast = (a: string, b: string) => { const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05) }

export interface PageProps {
  /** Акцентный цвет направления, #RRGGBB: используется один раз на экран, на главной кнопке */
  accent: string
  /** Шрифтовая пара направления, строкой из списка: например "Newsreader + Hanken Grotesk" */
  pair: string
  /** Скругление кнопок и карточек: sharp, soft или pill */
  corners: 'sharp' | 'soft' | 'pill'
  /** Полная палитра брендбука; остальные страницы сохраняют свою стандартную тёмную тему. */
  palette?: { background: string; surface: string; text: string; support: string }
  children: ReactNode
}

const RADIUS = { sharp: ['2px', '4px'], soft: ['8px', '14px'], pill: ['999px', '20px'] } as const

// Токены лендинга — единственное место со значениями: секции берут только var(--lp-*). Тема направления заполняет их и токены shadcn,
// поэтому и макеты приложения (компоненты ui внутри Page) выглядят в цветах и шрифтах выбранного направления.
// Телефон (≤640 px): крупные размеры и поля сжимаются; !important нужен, потому что токены Page заданы инлайном
const PHONE = '@media(max-width:640px){.lp-page{--lp-fs-hero:40px!important;--lp-fs-hero-lg:44px!important;--lp-fs-h2:30px!important;--lp-fs-h2-lg:36px!important;--lp-fs-statement:22px!important;--lp-gutter:20px!important;--lp-section-y:56px!important;--lp-gap:32px!important}}'
export function Page({ accent, pair, corners, palette, children }: PageProps) {
  const faces = FONT_PAIRS[pair] ?? FONT_PAIRS['Newsreader + Hanken Grotesk']
  const [button, card] = RADIUS[corners] ?? RADIUS.soft
  const ink = inkOn(accent)
  const tokens: Record<string, string> = {
    // тема направления
    '--lp-accent': accent, '--lp-ink': ink, '--lp-display': cssFamily(faces.display), '--lp-text-face': cssFamily(faces.text), '--lp-label-face': cssFamily(faces.label),
    '--lp-display-weight': String(faces.weight), '--lp-r-button': button, '--lp-r-card': card,
    // поверхности и текст (тёмная тема)
    '--lp-surface': palette?.background ?? '#141414', '--lp-raised': palette?.surface ?? '#1a1a1a', '--lp-text': palette?.text ?? '#f2f2f2',
    '--lp-muted': palette ? 'color-mix(in srgb, var(--lp-text) 65%, var(--lp-surface))' : 'rgb(255 255 255 / 0.65)',
    '--lp-subtle': palette ? 'color-mix(in srgb, var(--lp-text) 55%, var(--lp-surface))' : 'rgb(255 255 255 / 0.55)',
    '--lp-border': palette ? 'color-mix(in srgb, var(--lp-text) 18%, var(--lp-surface))' : 'rgb(255 255 255 / 0.12)',
    '--lp-border-soft': palette ? 'color-mix(in srgb, var(--lp-text) 10%, var(--lp-surface))' : 'rgb(255 255 255 / 0.08)',
    '--lp-fill': palette ? 'color-mix(in srgb, var(--lp-support) 12%, var(--lp-surface))' : 'rgb(255 255 255 / 0.03)',
    '--lp-support': palette?.support ?? '#f2f2f2',
    // шкала шрифтов и ритм
    '--lp-fs-hero': '68px', '--lp-fs-hero-lg': '84px', '--lp-fs-h2': '46px', '--lp-fs-h2-lg': '64px', '--lp-fs-h3': '24px', '--lp-fs-statement': '34px', '--lp-fs-lead': '18px', '--lp-fs-body': '16px', '--lp-fs-small': '13px', '--lp-fs-label': '12px',
    '--lp-max': '1200px', '--lp-gutter': '40px', '--lp-section-y': '96px', '--lp-gap': '64px',
    // токены shadcn: компоненты ui внутри Page берут тему направления
    '--background': 'var(--lp-surface)', '--foreground': 'var(--lp-text)', '--card': 'var(--lp-raised)', '--card-foreground': 'var(--lp-text)', '--muted': 'var(--lp-fill)', '--muted-foreground': 'var(--lp-muted)',
    '--primary': accent, '--primary-foreground': ink, '--line': 'var(--lp-border)', '--radius': card, '--font-sans': 'var(--lp-text-face)',
  }
  return <div style={{ ...(tokens as CSSProperties), fontFamily: 'var(--lp-text-face)' }} className="lp-page min-h-screen w-full bg-[var(--lp-surface)] text-[var(--lp-text)] antialiased"><style>{PHONE}</style>{children}</div>
}

/** Контейнер секции: единая ширина и вертикальный ритм; внутри — любая из секций набора */
export function Section({ children, tone = 'plain', flush = false }: { children: ReactNode; tone?: 'plain' | 'raised'; flush?: boolean }) {
  return <section className={tone === 'raised' ? 'border-y border-[var(--lp-border-soft)] bg-[var(--lp-raised)]' : ''}><div className={`mx-auto w-full max-w-[var(--lp-max)] px-[var(--lp-gutter)] pb-[var(--lp-section-y)] ${flush ? 'pt-0' : 'pt-[var(--lp-section-y)]'}`}>{children}</div></section>
}

export const display = 'font-[family-name:var(--lp-display)] [font-weight:var(--lp-display-weight)] tracking-[-0.015em] leading-[1.05]'
export const label = 'font-[family-name:var(--lp-label-face)] text-[length:var(--lp-fs-label)] uppercase tracking-[0.12em] text-[var(--lp-subtle)]'

/** Кадр продукта: картинка из ассетов страницы в рамке 1 px; без картинки — пустая рамка */
// window — подпись в строке окна (адрес или название, как у Doop): снимок продукта читается как живое приложение, а не картинка
export function Frame({ image, alt = '', ratio = '16 / 10', window }: { image?: string; alt?: string; ratio?: string; window?: string }) {
  return (
    <div className="w-full overflow-hidden border border-[var(--lp-border)] bg-[var(--lp-fill)]" style={{ borderRadius: 'var(--lp-r-card)', aspectRatio: image || window ? undefined : ratio }}>
      {window ? (
        <div className="relative flex h-10 items-center border-b border-[var(--lp-border)] px-4">
          <span className="flex gap-2" aria-hidden>{[0, 1, 2].map((dot) => <span key={dot} className="size-3 rounded-full bg-[var(--lp-border)]" />)}</span>
          <span className="absolute inset-x-0 text-center font-[family-name:var(--lp-label-face)] text-[length:var(--lp-fs-small)] text-[var(--lp-subtle)]">{window}</span>
        </div>
      ) : null}
      {image ? <img src={image} alt={alt} className="block h-auto w-full" /> : null}
    </div>
  )
}

/** Главная кнопка: акцент направления, текст — самый контрастный на нём */
export function PrimaryButton({ children }: { children: ReactNode }) {
  return <span className="inline-flex h-11 items-center px-6 text-[length:var(--lp-fs-small)] font-medium" style={{ borderRadius: 'var(--lp-r-button)', backgroundColor: 'var(--lp-accent)', color: 'var(--lp-ink)' }}>{children}</span>
}
