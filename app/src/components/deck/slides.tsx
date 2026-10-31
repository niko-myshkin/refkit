import type { ReactNode } from 'react'
import { Frame, display, label } from '../landing/page'

// Набор слайдов для презентации заказчику (2026-10-28): та же тема направления (<Page> из набора лендинга), слайд — фиксированный кадр 1280×720.
// Агент не верстает, а выбирает порядок слайдов и заполняет их свойства. Печать в PDF: одна страница на слайд (@page 1280×720).
const PRINT = '@media print{@page{size:1280px 720px;margin:0}html,body{margin:0;background:var(--lp-surface)}.lp-deck{padding:0!important;gap:0!important}.lp-slide{break-after:page;break-inside:avoid;margin:0!important;border:0!important}}'

/** Контейнер презентации: слайды друг под другом; в PDF каждый уходит на свою страницу */
export function Deck({ children }: { children: ReactNode }) {
  return <div className="lp-deck flex flex-col items-center gap-8 py-10"><style>{PRINT}</style>{children}</div>
}

function Slide({ children, tone = 'plain' }: { children: ReactNode; tone?: 'plain' | 'raised' }) {
  return <section className={`lp-slide flex h-[720px] w-[1280px] shrink-0 flex-col overflow-hidden p-[72px] ${tone === 'raised' ? 'bg-[var(--lp-raised)]' : 'bg-[var(--lp-surface)]'} border border-[var(--lp-border-soft)]`}>{children}</section>
}

export interface TitleSlideProps {
  /** Название продукта словом, как в брифе, без логотипа */
  name: string
  /** Одна фраза: что это */
  tagline: string
  kicker?: string
}
export function TitleSlide({ name, tagline, kicker }: TitleSlideProps) {
  return (
    <Slide>
      <div className="flex flex-1 flex-col justify-end gap-6">
        {kicker ? <p className={label}>{kicker}</p> : null}
        <h1 className={`${display} text-[120px]`}>{name}</h1>
        <p className="max-w-[760px] text-[length:var(--lp-fs-h3)] leading-snug text-[var(--lp-muted)]">{tagline}</p>
      </div>
    </Slide>
  )
}

export interface StatementSlideProps {
  /** Одна крупная мысль слайда */
  text: string
  kicker?: string
}
export function StatementSlide({ text, kicker }: StatementSlideProps) {
  return (
    <Slide tone="raised">
      <div className="flex flex-1 flex-col justify-center gap-6">
        {kicker ? <p className={label}>{kicker}</p> : null}
        <p className={`${display} max-w-[1000px] text-[64px] !leading-[1.12]`}>{text}</p>
      </div>
    </Slide>
  )
}

export interface PointsSlideProps {
  title: string
  /** Три-четыре коротких тезиса */
  points: string[]
  kicker?: string
}
export function PointsSlide({ title, points, kicker }: PointsSlideProps) {
  return (
    <Slide>
      {kicker ? <p className={`${label} mb-5`}>{kicker}</p> : null}
      <h2 className={`${display} max-w-[900px] text-[56px]`}>{title}</h2>
      <ul className="mt-auto grid grid-cols-2 gap-x-12 gap-y-6">
        {points.map((point) => <li key={point} className="border-t border-[var(--lp-border)] pt-4 text-[length:var(--lp-fs-lead)] leading-relaxed text-[var(--lp-muted)]">{point}</li>)}
      </ul>
    </Slide>
  )
}

export interface FrameSlideProps {
  title: string
  /** Подпись под кадром: что на нём видно */
  caption: string
  /** Кадр продукта из ассетов, например assets.img1 */
  image?: string
  imageAlt?: string
}
export function FrameSlide({ title, caption, image, imageAlt }: FrameSlideProps) {
  return (
    <Slide>
      <div className="flex items-baseline justify-between gap-10">
        <h2 className={`${display} text-[44px]`}>{title}</h2>
        <p className="max-w-[420px] text-right text-[length:var(--lp-fs-body)] text-[var(--lp-subtle)]">{caption}</p>
      </div>
      <div className="mt-8 flex min-h-0 flex-1 items-center justify-center"><div className="max-h-full w-[760px]"><Frame image={image} alt={imageAlt} /></div></div>
    </Slide>
  )
}

export interface StepsSlideProps {
  title: string
  /** Ровно три шага: название и одна строка */
  items: Array<{ title: string; text: string }>
}
export function StepsSlide({ title, items }: StepsSlideProps) {
  return (
    <Slide tone="raised">
      <h2 className={`${display} text-[56px]`}>{title}</h2>
      <div className="mt-auto grid grid-cols-3 gap-10">
        {items.map((item, at) => (
          <div key={item.title} className="flex flex-col gap-4">
            <div className="flex items-center gap-3"><span className="font-[family-name:var(--lp-label-face)] text-[length:var(--lp-fs-small)] text-[var(--lp-subtle)]">{String(at + 1).padStart(2, '0')}</span><span className="h-px flex-1 bg-[var(--lp-border)]" /></div>
            <h3 className={`${display} text-[32px]`}>{item.title}</h3>
            <p className="text-[length:var(--lp-fs-lead)] leading-relaxed text-[var(--lp-muted)]">{item.text}</p>
          </div>
        ))}
      </div>
    </Slide>
  )
}

export interface ClosingSlideProps {
  /** Призыв или следующий шаг */
  title: string
  /** Как связаться или что произойдёт дальше */
  note?: string
}
export function ClosingSlide({ title, note }: ClosingSlideProps) {
  return (
    <Slide>
      <div className="flex flex-1 flex-col justify-end gap-6">
        <h2 className={`${display} max-w-[1000px] text-[96px]`}>{title}</h2>
        {note ? <p className="text-[length:var(--lp-fs-h3)] text-[var(--lp-muted)]">{note}</p> : null}
      </div>
    </Slide>
  )
}
