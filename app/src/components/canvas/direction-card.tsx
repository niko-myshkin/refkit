import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { MessageResponse } from '@/components/ai-elements/message'
import { cn } from '@/lib/utils'
import { t } from '@/lib/i18n'

// Карточка направления бренда для ноды «Выбор» (2026-10-27, владелец: «не хочется читать абзацы, хочу видеть направления заранее»).
// Агент «Brand directions» отдаёт вариант полями «Accent / Pair / Headline / Verdict»; здесь из них рисуется образец: цвет, шрифтовая пара, заголовок
// реальным шрифтом и кнопка в акценте. Знак на этом этапе не рисуем: модель пишет контур вслепую, выходит шаблонно (решение 2026-10-27). Вариант без таких полей (старый ответ, чужая нода) рисуется как раньше текстом — parseDirection вернёт null.
import { FONT_PAIRS, PAIR_NAMES, cssFamily, findPair } from '../../../shared/font-pairs.mjs'

// Шрифтовые пары — в shared/font-pairs.mjs (там же сборка лендинга); вне списка — Inter
export const DIRECTION_PAIRS = Object.fromEntries(Object.entries(FONT_PAIRS).map(([name, pair]) => [name, { display: cssFamily(pair.display), text: cssFamily(pair.text), label: cssFamily(pair.label), weight: pair.weight }])) as Record<string, { display: string; text: string; label: string; weight: number }>
const INTER = "'Inter Variable', sans-serif"
export const DIRECTION_PAIR_NAMES = PAIR_NAMES

export type Direction = { layout: 'centered' | 'split' | 'left'; corners: 'sharp' | 'soft' | 'pill'; name: string; idea: string; accent: string; pair: string; headline: string; verdict: string }

// Поле ищется где угодно в пункте: модель иногда кладёт «Accent:» в ту же строку, что и идею
const field = (text: string, key: string) => text.match(new RegExp(`(?:^|\\s)${key}:[ \\t]*([^\\n]*)`, 'i'))?.[1].trim() ?? ''

export function parseDirection(item: string): Direction | null {
  const text = item.replace(/^(?:[-*]\s+|\d+[.)]\s+)/, '').trim()
  const accent = field(text, 'Accent').match(/#[0-9a-f]{6}\b/i)?.[0]
  if (!accent) return null
  const head = text.split('\n')[0]
  const name = head.match(/\*\*([^*]+)\*\*/)?.[1].replace(/[.:]$/, '').trim() ?? head.slice(0, 24)
  const idea = head.replace(/\*\*[^*]+\*\*/, '').replace(/\s*Accent:.*$/i, '').replace(/^[\s—–:.-]+/, '').trim()
  const pair = findPair(field(text, 'Pair'))
  return { layout: /center/i.test(field(text, 'Layout')) ? 'centered' : /split/i.test(field(text, 'Layout')) ? 'split' : 'left', corners: /pill/i.test(field(text, 'Corners')) ? 'pill' : /sharp/i.test(field(text, 'Corners')) ? 'sharp' : 'soft', name, idea, accent, pair, headline: field(text, 'Headline') || 'Drop anything. Get the gist.', verdict: field(text, 'Verdict') }
}

// Цвет текста на акценте: белый или графит, смотря где контраст выше (WCAG); на тёмно-синем и фиолетовом чёрный текст нечитаем, на светлом оранжевом — белый
const luminance = (hex: string) => { const [r, g, b] = [1, 3, 5].map((at) => parseInt(hex.slice(at, at + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * r + 0.7152 * g + 0.0722 * b }
export const onAccent = (hex: string) => { const l = luminance(hex); return 1.05 / (l + 0.05) >= (l + 0.05) / 0.057 ? '#ffffff' : '#141414' }

// Скругление кнопок и плитки направления: острое, мягкое, «таблетка»
const RADIUS = { sharp: { button: '2px', tile: '4px' }, soft: { button: '8px', tile: '12px' }, pill: { button: '999px', tile: '999px' } }

// Мини-hero направления (2026-10-27, владелец: «хочу видеть, как это смотрится в hero, а не карточку с иконками»): название продукта словом в шрифте
// заголовка, заголовок, строка поддержки, кнопка и рамка под кадр — в цвете, паре и скруглении направления; раскладка из поля Layout.
// Логотип не рисуем: имя продукта берётся из брифа, название направления на странице не встречается
function MiniHero({ direction, product }: { direction: Direction; product: string }) {
  const radius = RADIUS[direction.corners]
  const faces = DIRECTION_PAIRS[direction.pair] ?? { display: INTER, text: INTER, label: INTER }
  const weight = DIRECTION_PAIRS[direction.pair]?.weight ?? 600
  const ink = onAccent(direction.accent)
  const button = <span className="inline-block px-2.5 py-1 text-[9px] font-medium" style={{ borderRadius: radius.button, backgroundColor: direction.accent, color: ink, fontFamily: faces.text }}>{t('Запросить доступ')}</span>
  const headline = <span className={cn('block leading-[1.08]', direction.layout === 'left' ? 'text-[22px]' : 'text-[19px]')} style={{ fontFamily: faces.display, fontWeight: weight }}>{direction.headline}</span>
  const sub = <span className="mt-1.5 block text-[9px] leading-snug text-white/60" style={{ fontFamily: faces.text }}>{t('Картинки, ролики, статьи, заметки. Агент разбирает, ты правишь.')}</span>
  // Рамка под кадр продукта: три «ноды» со связью акцентным цветом
  const frame = (
    <span className="relative block h-full min-h-[44px] w-full overflow-hidden border border-white/10 bg-white/[0.04]" style={{ borderRadius: radius.tile === '999px' ? '14px' : radius.tile }}>
      <span className="absolute top-1/2 left-[14%] h-px w-[72%]" style={{ backgroundColor: direction.accent }} />
      {[14, 44, 74].map((x) => <span key={x} className="absolute top-1/2 h-4 w-[12%] -translate-y-1/2 border border-white/20 bg-[#1c1c1c]" style={{ left: `${x}%`, borderRadius: radius.tile === '999px' ? '6px' : '3px' }} />)}
    </span>
  )
  return (
    <span className="flex aspect-[16/10] w-full flex-col overflow-hidden rounded-lg border border-white/10 bg-[#141414] p-3 text-white">
      <span className="flex items-center justify-between">
        <span className="text-[11px]" style={{ fontFamily: faces.display, fontWeight: weight }}>{product}</span>
        <span className="flex gap-2 text-[8px] text-white/50" style={{ fontFamily: faces.label }}><span>{t('Как это работает')}</span><span>{t('Память')}</span></span>
      </span>
      {direction.layout === 'split' ? (
        <span className="mt-2 grid min-h-0 flex-1 grid-cols-2 items-center gap-3"><span>{headline}{sub}<span className="mt-2 block">{button}</span></span><span className="block h-[70%]">{frame}</span></span>
      ) : direction.layout === 'centered' ? (
        <span className="mt-2 flex min-h-0 flex-1 flex-col items-center text-center"><span className="mt-1 block max-w-[85%]">{headline}{sub}<span className="mt-2 block">{button}</span></span><span className="mt-2 block min-h-0 w-full flex-1">{frame}</span></span>
      ) : (
        <span className="mt-2 flex min-h-0 flex-1 flex-col"><span className="block max-w-[80%]">{headline}{sub}<span className="mt-2 block">{button}</span></span><span className="mt-2 block min-h-0 w-full flex-1">{frame}</span></span>
      )}
    </span>
  )
}

export function DirectionCard({ direction, selected, product }: { direction: Direction; selected: boolean; product: string }) {
  const [more, setMore] = useState(false)
  return (
    <span className="flex min-w-0 flex-1 flex-col gap-2">
      <MiniHero direction={direction} product={product} />
      <span className="flex items-center gap-2 text-[11px] text-muted-foreground">
        <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: direction.accent }} />
        <span className="min-w-0 truncate">{direction.accent.toUpperCase()}{direction.pair && ` · ${direction.pair}`} · {direction.corners}</span>
      </span>
      {direction.idea && <span className="text-xs text-muted-foreground">{direction.idea}</span>}
      {direction.verdict && (
        <>
          <button type="button" className="nodrag inline-flex w-fit items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground" aria-expanded={more} onClick={(event) => { event.preventDefault(); setMore(!more) }}>
            {t('Подробнее')}<ChevronDown className={cn('size-3 transition-transform', more && 'rotate-180')} />
          </button>
          {more && <span className="text-xs"><MessageResponse>{direction.verdict}</MessageResponse></span>}
        </>
      )}
      {selected && <span className="sr-only">{t('выбрано')}</span>}
    </span>
  )
}
