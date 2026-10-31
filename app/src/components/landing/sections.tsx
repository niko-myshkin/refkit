import { Frame, PrimaryButton, Section, display, label } from './page'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'

export interface HeaderProps {
  /** Название продукта словом, как в брифе: без логотипа и символов */
  name: string
  /** Короткая строка справа: чем является продукт */
  tagline?: string
}
export function Header({ name, tagline }: HeaderProps) {
  return (
    <header className="border-b border-[var(--lp-border-soft)]">
      <div className="mx-auto flex h-16 max-w-[var(--lp-max)] items-center justify-between px-[var(--lp-gutter)]">
        <span className={`${display} text-[length:var(--lp-fs-h3)]`}>{name}</span>
        {tagline ? <span className="hidden text-[length:var(--lp-fs-small)] text-[var(--lp-subtle)] sm:inline">{tagline}</span> : null}
      </div>
    </header>
  )
}

export interface HeroProps {
  /** Композиция: center (текст по центру над кадром), split (текст рядом с кадром) или left (крупный текст слева над кадром) */
  layout: 'center' | 'split' | 'left'
  headline: string
  /** Вторая фраза заголовка приглушённым цветом, как у Doop («Approve it once. The rest runs itself.») */
  headlineMuted?: string
  sub: string
  /** Текст главной кнопки */
  cta: string
  /** Кадр продукта: картинка из assets, например assets.img1; без неё пустая рамка */
  image?: string
  imageAlt?: string
  /** Подпись в строке окна над кадром (адрес или название холста); без неё кадр без рамки окна */
  imageWindow?: string
  /** Небольшая надпись над заголовком */
  kicker?: string
}
const Muted = ({ text }: { text?: string }) => text ? <> <span className="text-[var(--lp-subtle)]">{text}</span></> : null
export function Hero({ layout, headline, headlineMuted, sub, cta, image, imageAlt, imageWindow, kicker }: HeroProps) {
  const text = (
    <div className={layout === 'center' ? 'mx-auto max-w-[820px] text-center' : 'max-w-[760px]'}>
      {kicker ? <p className={`${label} mb-6`}>{kicker}</p> : null}
      <h1 className={`${display} ${layout === 'left' ? 'text-[length:var(--lp-fs-hero-lg)]' : 'text-[length:var(--lp-fs-hero)]'}`}>{headline}<Muted text={headlineMuted} /></h1>
      <p className={`mt-6 text-[length:var(--lp-fs-lead)] leading-relaxed text-[var(--lp-muted)] ${layout === 'center' ? 'mx-auto max-w-[620px]' : 'max-w-[560px]'}`}>{sub}</p>
      <div className="mt-9"><a href="#request" className="inline-block no-underline"><PrimaryButton>{cta}</PrimaryButton></a></div>
    </div>
  )
  return (
    <Section>
      {layout === 'split'
        ? <div className="grid grid-cols-1 md:grid-cols-[1fr_1.15fr] items-center gap-[var(--lp-gap)]">{text}<Frame image={image} alt={imageAlt} window={imageWindow} /></div>
        : <div className="flex flex-col gap-[var(--lp-gap)]">{text}{image ? <Frame image={image} alt={imageAlt} window={imageWindow} /> : null}</div>}
    </Section>
  )
}

export interface StepsProps {
  title: string
  /** Ровно три шага: название и одна строка, без картинок */
  items: Array<{ title: string; text: string }>
  /** Один широкий кадр продукта под лентой шагов; без него секция остаётся лентой */
  image?: string
  imageAlt?: string
  kicker?: string
}
export function Steps({ title, items, image, imageAlt, kicker }: StepsProps) {
  return (
    <Section tone="raised">
      {kicker ? <p className={`${label} mb-5`}>{kicker}</p> : null}
      <h2 className={`${display} max-w-[760px] text-[length:var(--lp-fs-h2)]`}>{title}</h2>
      <div className="mt-14 grid grid-cols-1 gap-8 md:grid-cols-3">
        {items.map((item, at) => (
          <div key={item.title} className="flex flex-col gap-4">
            <div className="flex items-center gap-3"><span className="font-[family-name:var(--lp-label-face)] text-[length:var(--lp-fs-small)] text-[var(--lp-subtle)]">{String(at + 1).padStart(2, '0')}</span><span className="h-px flex-1 bg-[var(--lp-border)]" /></div>
            <h3 className={`${display} text-[length:var(--lp-fs-h3)]`}>{item.title}</h3>
            <p className="text-[length:var(--lp-fs-body)] leading-relaxed text-[var(--lp-muted)]">{item.text}</p>
          </div>
        ))}
      </div>
      {image ? <div className="mt-16"><Frame image={image} alt={imageAlt} /></div> : null}
    </Section>
  )
}

export interface SplitProps {
  title: string
  /** Два-три коротких тезиса */
  points: string[]
  /** Честная оговорка под тезисами, мелким шрифтом */
  note?: string
  image?: string
  imageAlt?: string
  /** С какой стороны кадр */
  imageSide: 'left' | 'right'
  /** Подпись в строке окна над кадром; без неё кадр без рамки окна */
  imageWindow?: string
  /** Вторая фраза заголовка приглушённым цветом */
  titleMuted?: string
  kicker?: string
}
export function Split({ title, titleMuted, points, note, image, imageAlt, imageSide, imageWindow, kicker }: SplitProps) {
  const frame = <Frame image={image} alt={imageAlt} window={imageWindow} />
  const text = (
    <div className="max-w-[460px]">
      {kicker ? <p className={`${label} mb-5`}>{kicker}</p> : null}
      <h2 className={`${display} text-[length:var(--lp-fs-h2)]`}>{title}<Muted text={titleMuted} /></h2>
      <ul className="mt-8 flex flex-col gap-4">{points.map((point) => <li key={point} className="border-t border-[var(--lp-border)] pt-4 text-[length:var(--lp-fs-body)] leading-relaxed text-[var(--lp-muted)]">{point}</li>)}</ul>
      {note ? <p className="mt-6 text-[length:var(--lp-fs-small)] text-[var(--lp-subtle)]">{note}</p> : null}
    </div>
  )
  return <Section><div className="grid grid-cols-1 md:grid-cols-[5fr_7fr] items-center gap-[var(--lp-gap)]">{imageSide === 'left' ? <>{frame}{text}</> : <>{text}{frame}</>}</div></Section>
}

export interface WideProps {
  title: string
  /** Одна-две строки под заголовком */
  text?: string
  image?: string
  imageAlt?: string
  /** Подпись в строке окна над кадром; без неё кадр без рамки окна */
  imageWindow?: string
  /** Вторая фраза заголовка приглушённым цветом */
  titleMuted?: string
  /** До трёх коротких «что умеет» под кадром: название и одна строка (как у Doop под «Bring your own agent») */
  items?: Array<{ title: string; text: string }>
  kicker?: string
}
/** Главная функция крупно: текст сверху в две колонки, кадр на всю ширину под ним, под кадром до трёх пунктов */
export function Wide({ title, titleMuted, text, image, imageAlt, imageWindow, items = [], kicker }: WideProps) {
  return (
    <Section>
      <div className="grid grid-cols-1 md:grid-cols-2 items-end gap-[var(--lp-gap)]">
        <div>
          {kicker ? <p className={`${label} mb-5`}>{kicker}</p> : null}
          <h2 className={`${display} text-[length:var(--lp-fs-h2-lg)]`}>{title}<Muted text={titleMuted} /></h2>
        </div>
        {text ? <p className="max-w-[460px] text-[length:var(--lp-fs-lead)] leading-relaxed text-[var(--lp-muted)]">{text}</p> : null}
      </div>
      <div className="mt-14"><Frame image={image} alt={imageAlt} window={imageWindow} /></div>
      {items.length ? (
        <div className="mt-10 grid grid-cols-1 gap-8 md:grid-cols-3">
          {items.slice(0, 3).map((item) => <div key={item.title} className="border-t border-[var(--lp-border)] pt-5"><h3 className="text-[length:var(--lp-fs-body)] font-medium">{item.title}</h3><p className="mt-2 text-[length:var(--lp-fs-body)] leading-relaxed text-[var(--lp-muted)]">{item.text}</p></div>)}
        </div>
      ) : null}
    </Section>
  )
}

export interface DuoProps {
  title: string
  /** Вторая фраза заголовка приглушённым цветом */
  titleMuted?: string
  /** Одна-две строки справа от заголовка */
  text?: string
  /** Левый кадр (обычно окно продукта) и подпись его окна */
  image: string
  imageWindow?: string
  /** Правый кадр (обычно терминал агента) и подпись его окна */
  side: string
  sideWindow?: string
  /** До трёх пунктов под кадрами: название и одна строка */
  items?: Array<{ title: string; text: string }>
  kicker?: string
}
/** Два кадра рядом — продукт и агент, который к нему подключён (как «Bring your own agent» у Doop): заголовок слева, текст справа, кадры, три пункта */
export function Duo({ title, titleMuted, text, image, imageWindow, side, sideWindow, items = [], kicker }: DuoProps) {
  return (
    <Section>
      <div className="grid grid-cols-1 md:grid-cols-2 items-end gap-[var(--lp-gap)]">
        <div>
          {kicker ? <p className={`${label} mb-5`}>{kicker}</p> : null}
          <h2 className={`${display} text-[length:var(--lp-fs-h2-lg)]`}>{title}<Muted text={titleMuted} /></h2>
        </div>
        {text ? <p className="max-w-[460px] text-[length:var(--lp-fs-lead)] leading-relaxed text-[var(--lp-muted)]">{text}</p> : null}
      </div>
      <div className="mt-14 grid grid-cols-1 items-center gap-6 md:grid-cols-[7fr_5fr]"><Frame image={image} window={imageWindow} /><Frame image={side} window={sideWindow} /></div>
      {items.length ? (
        <div className="mt-10 grid grid-cols-1 gap-8 md:grid-cols-3">
          {items.slice(0, 3).map((item) => <div key={item.title} className="border-t border-[var(--lp-border)] pt-5"><h3 className="text-[length:var(--lp-fs-body)] font-medium">{item.title}</h3><p className="mt-2 text-[length:var(--lp-fs-body)] leading-relaxed text-[var(--lp-muted)]">{item.text}</p></div>)}
        </div>
      ) : null}
    </Section>
  )
}

export interface StatementProps {
  /** Одна широкая строка из коротких фактов, разделённых « · » */
  text: string
  kicker?: string
}
export function Statement({ text, kicker }: StatementProps) {
  return (
    <Section tone="raised">
      {kicker ? <p className={`${label} mb-5`}>{kicker}</p> : null}
      <p className={`${display} max-w-[1000px] text-[length:var(--lp-fs-statement)] !leading-[1.25]`}>{text}</p>
    </Section>
  )
}

export interface CtaProps {
  title: string
  /** Поля формы запроса: подпись и подсказка (макет формы; у страницы без сервера отправки нет, тогда используй href) */
  fields?: Array<{ label: string; placeholder: string }>
  button: string
  /** Честная строка под кнопкой: это запрос, а не регистрация */
  note?: string
  /** Если задан, кнопка становится настоящей ссылкой (например mailto:…), а поля формы не рисуются */
  href?: string
}
export function Cta({ title, fields = [], button, note, href }: CtaProps) {
  // Без полей формы — по центру: заголовок, кнопка, строка под ней (кнопка не уезжает в угол под длинный заголовок)
  if (!fields.length || href) return (
    <Section>
      <div id="request" className="mx-auto flex max-w-[820px] flex-col items-center gap-8 text-center">
        <h2 className={`${display} text-[length:var(--lp-fs-h2-lg)]`}>{title}</h2>
        {href ? <a href={href} className="inline-block no-underline"><PrimaryButton>{button}</PrimaryButton></a> : <PrimaryButton>{button}</PrimaryButton>}
        {note ? <p className="text-[length:var(--lp-fs-small)] text-[var(--lp-subtle)]">{note}</p> : null}
      </div>
    </Section>
  )
  return (
    <Section>
      <div id="request" className="grid grid-cols-1 md:grid-cols-2 items-end gap-[var(--lp-gap)]">
        <h2 className={`${display} text-[length:var(--lp-fs-h2-lg)]`}>{title}</h2>
        <div className="flex flex-col gap-5">
          {href ? null : fields.map((field) => (
            <label key={field.label} className="flex flex-col gap-2"><span className="text-[length:var(--lp-fs-small)] text-[var(--lp-muted)]">{field.label}</span><span className="flex h-12 items-center border border-[var(--lp-border)] bg-[var(--lp-fill)] px-4 text-[length:var(--lp-fs-body)] text-[var(--lp-subtle)]" style={{ borderRadius: 'var(--lp-r-button)' }}>{field.placeholder}</span></label>
          ))}
          <div>{href ? <a href={href} className="inline-block no-underline"><PrimaryButton>{button}</PrimaryButton></a> : <PrimaryButton>{button}</PrimaryButton>}</div>
          {note ? <p className="text-[length:var(--lp-fs-small)] text-[var(--lp-subtle)]">{note}</p> : null}
        </div>
      </div>
    </Section>
  )
}

export interface AgentsProps {
  title: string
  /** Одна-две строки: как агент подключается и чей это аккаунт */
  text?: string
  /** Названия агентов словом, без логотипов: только проверенные */
  items: string[]
  /** Честная оговорка: что не проверено */
  note?: string
}
/** Строка «работает с»: заголовок слева, названия агентов справа плашками */
export function Agents({ title, text, items, note }: AgentsProps) {
  return (
    <Section>
      <div className="grid grid-cols-1 md:grid-cols-[5fr_7fr] items-start gap-[var(--lp-gap)]">
        <div className="max-w-[460px]">
          <h2 className={`${display} text-[length:var(--lp-fs-h2)]`}>{title}</h2>
          {text ? <p className="mt-6 text-[length:var(--lp-fs-lead)] leading-relaxed text-[var(--lp-muted)]">{text}</p> : null}
        </div>
        <div className="flex flex-col gap-6">
          <ul className="flex flex-wrap gap-3">{items.map((item) => <li key={item} className={`${display} border border-[var(--lp-border)] bg-[var(--lp-fill)] px-6 py-4 text-[length:var(--lp-fs-h3)]`} style={{ borderRadius: 'var(--lp-r-card)' }}>{item}</li>)}</ul>
          {note ? <p className="text-[length:var(--lp-fs-small)] text-[var(--lp-subtle)]">{note}</p> : null}
        </div>
      </div>
    </Section>
  )
}

export interface FaqProps {
  title: string
  /** 4–8 вопросов; ответы только по фактам из входов */
  items: Array<{ question: string; answer: string }>
}
/** Вопросы и ответы: каждый раскрывается сам (Collapsible из shadcn держит состояние внутри, обработчики не нужны) */
export function Faq({ title, items }: FaqProps) {
  return (
    <Section>
      <div className="grid grid-cols-1 md:grid-cols-[5fr_7fr] items-start gap-[var(--lp-gap)]">
        <h2 className={`${display} max-w-[460px] text-[length:var(--lp-fs-h2)]`}>{title}</h2>
        <div className="flex flex-col">
          {items.map((item) => (
            <Collapsible key={item.question} className="group border-t border-[var(--lp-border)] py-5 last:border-b">
              <CollapsibleTrigger className="flex w-full cursor-pointer items-center justify-between gap-6 text-left text-[length:var(--lp-fs-lead)]">{item.question}<span aria-hidden className="text-[var(--lp-subtle)] transition-transform group-data-[state=open]:rotate-45">+</span></CollapsibleTrigger>
              <CollapsibleContent><p className="mt-4 max-w-[640px] text-[length:var(--lp-fs-body)] leading-relaxed text-[var(--lp-muted)]">{item.answer}</p></CollapsibleContent>
            </Collapsible>
          ))}
        </div>
      </div>
    </Section>
  )
}

export interface FooterProps {
  name: string
  tagline?: string
}
export function Footer({ name, tagline }: FooterProps) {
  return (
    <footer className="border-t border-[var(--lp-border-soft)]">
      <div className="mx-auto flex h-20 max-w-[var(--lp-max)] items-center justify-between px-[var(--lp-gutter)]"><span className={`${display} text-[length:var(--lp-fs-lead)]`}>{name}</span>{tagline ? <span className="hidden text-[length:var(--lp-fs-small)] text-[var(--lp-subtle)] sm:inline">{tagline}</span> : null}</div>
    </footer>
  )
}
