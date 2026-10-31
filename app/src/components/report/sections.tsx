import type { ReactNode } from 'react'
import { Frame, Section, display, label } from '../landing/page'

// Набор секций «Итог гипотезы» (2026-10-28): одна страница про результат проверки идеи — вердикт, доказательства, как выглядит продукт, что дальше.
// Агент не верстает, а переносит найденное по рынку в свойства секций. Тема направления, токены и шрифты — те же, что у лендинга (<Page>).
export type Rating = 'attractive' | 'mixed' | 'weak'
// Печать в PDF: страница 1280×1800 без полей, секции не рвутся посередине и уходят на следующую страницу целиком, фон и рамки печатаются
const PRINT = '@media print{@page{size:1280px 1800px;margin:0}html,body{margin:0;background:var(--lp-surface);-webkit-print-color-adjust:exact;print-color-adjust:exact}section{break-inside:avoid}}'
const RATING_LABEL: Record<Rating, string> = { attractive: 'Attractive', mixed: 'Mixed', weak: 'Weak' }

export interface ReportHeaderProps {
  /** Название продукта словом, как в брифе */
  name: string
  /** Идея в одно-два предложения */
  idea: string
  /** Дата проверки, например 28 Oct 2026 */
  date: string
}
export function ReportHeader({ name, idea, date }: ReportHeaderProps) {
  return (
    <Section>
      <style>{PRINT}</style>
      <p className={`${label} mb-6`}>Hypothesis check · {date}</p>
      <h1 className={`${display} text-[length:var(--lp-fs-hero)]`}>{name}</h1>
      <p className="mt-6 max-w-[760px] text-[length:var(--lp-fs-lead)] leading-relaxed text-[var(--lp-muted)]">{idea}</p>
    </Section>
  )
}

export interface VerdictProps {
  rating: Rating
  /** Вердикт одним предложением */
  summary: string
  /** Три причины, каждая с опорой на найденное */
  reasons: string[]
  /** Главный риск одним предложением */
  risk: string
  /** Что проверить первым */
  check: string
}
export function Verdict({ rating, summary, reasons, risk, check }: VerdictProps) {
  return (
    <Section tone="raised">
      <div className="grid grid-cols-[320px_1fr] gap-[var(--lp-gap)]">
        <div>
          <p className={`${label} mb-4`}>Verdict</p>
          <div className="flex items-center gap-3"><span className="size-3 rounded-full" style={{ backgroundColor: 'var(--lp-accent)', opacity: rating === 'weak' ? 0.35 : rating === 'mixed' ? 0.7 : 1 }} /><span className={`${display} text-[length:var(--lp-fs-h2)]`}>{RATING_LABEL[rating]}</span></div>
        </div>
        <div className="flex flex-col gap-6">
          <p className={`${display} text-[length:var(--lp-fs-h3)] !leading-[1.3]`}>{summary}</p>
          <ul className="flex flex-col gap-3">{reasons.map((reason) => <li key={reason} className="border-t border-[var(--lp-border)] pt-3 text-[length:var(--lp-fs-body)] leading-relaxed text-[var(--lp-muted)]">{reason}</li>)}</ul>
          <div className="grid grid-cols-2 gap-8">
            <div><p className={`${label} mb-2`}>Main risk</p><p className="text-[length:var(--lp-fs-body)] leading-relaxed text-[var(--lp-muted)]">{risk}</p></div>
            <div><p className={`${label} mb-2`}>Check first</p><p className="text-[length:var(--lp-fs-body)] leading-relaxed text-[var(--lp-muted)]">{check}</p></div>
          </div>
        </div>
      </div>
    </Section>
  )
}

export interface CompetitorsProps {
  title: string
  /** Пять продуктов: название, адрес сайта, цена, что делает и чего не хватает */
  rows: Array<{ name: string; url: string; price: string; what: string; gap: string }>
}
export function Competitors({ title, rows }: CompetitorsProps) {
  return (
    <Section>
      <h2 className={`${display} mb-10 text-[length:var(--lp-fs-h2)]`}>{title}</h2>
      <div className="flex flex-col">
        {rows.map((row) => (
          <div key={row.name} className="grid grid-cols-[180px_150px_1fr_1fr] gap-8 border-t border-[var(--lp-border)] py-5">
            <div><p className={`${display} text-[length:var(--lp-fs-lead)]`}>{row.name}</p><p className="mt-1 text-[length:var(--lp-fs-small)] text-[var(--lp-subtle)]">{row.url}</p></div>
            <p className="text-[length:var(--lp-fs-body)] text-[var(--lp-muted)]">{row.price}</p>
            <p className="text-[length:var(--lp-fs-body)] leading-relaxed text-[var(--lp-muted)]">{row.what}</p>
            <p className="text-[length:var(--lp-fs-body)] leading-relaxed text-[var(--lp-text)]">{row.gap}</p>
          </div>
        ))}
      </div>
    </Section>
  )
}

export interface SignalsProps {
  title: string
  /** Сигналы спроса: дата, число (голосов, звёзд), текст и адрес источника */
  items: Array<{ date: string; figure: string; text: string; url: string }>
}
export function Signals({ title, items }: SignalsProps) {
  return (
    <Section tone="raised">
      <h2 className={`${display} mb-10 text-[length:var(--lp-fs-h2)]`}>{title}</h2>
      <div className="grid grid-cols-2 gap-x-[var(--lp-gap)]">
        {items.map((item) => (
          <div key={item.text} className="flex flex-col gap-2 border-t border-[var(--lp-border)] py-5">
            <p className={label}>{item.date} · {item.figure}</p>
            <p className="text-[length:var(--lp-fs-body)] leading-relaxed text-[var(--lp-text)]">{item.text}</p>
            <p className="break-all text-[length:var(--lp-fs-small)] text-[var(--lp-subtle)]">{item.url}</p>
          </div>
        ))}
      </div>
    </Section>
  )
}

export interface FramesProps {
  title: string
  /** Кадры продукта из ассетов с подписями */
  images: Array<{ src: string; caption: string }>
}
export function Frames({ title, images }: FramesProps) {
  return (
    <Section>
      <h2 className={`${display} mb-10 text-[length:var(--lp-fs-h2)]`}>{title}</h2>
      <div className="grid grid-cols-3 gap-8">
        {images.map((image) => <div key={image.caption} className="flex flex-col gap-3"><Frame image={image.src} alt={image.caption} /><p className="text-[length:var(--lp-fs-small)] text-[var(--lp-subtle)]">{image.caption}</p></div>)}
      </div>
    </Section>
  )
}

export interface NextStepsProps {
  title: string
  /** Три шага: что делать дальше, по порядку */
  items: string[]
}
export function NextSteps({ title, items }: NextStepsProps) {
  return (
    <Section tone="raised">
      <h2 className={`${display} mb-10 text-[length:var(--lp-fs-h2)]`}>{title}</h2>
      <ol className="grid grid-cols-3 gap-8">
        {items.map((item, at) => <li key={item} className="flex flex-col gap-3"><span className="font-[family-name:var(--lp-label-face)] text-[length:var(--lp-fs-small)] text-[var(--lp-subtle)]">{String(at + 1).padStart(2, '0')}</span><span className="text-[length:var(--lp-fs-lead)] leading-snug">{item}</span></li>)}
      </ol>
    </Section>
  )
}

export type { ReactNode }
