import { useEffect, useState } from 'react'
import { t } from '@/lib/i18n'
import { ChevronRight, Plus, RotateCcw, Trash2 } from 'lucide-react'
import { HoverSlide } from '@/components/ui/slide-highlight'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Textarea } from '@/components/ui/textarea'
import { library, type StyleItem, type StyleState } from '@/lib/library'
import { cn } from '@/lib/utils'

// Стиль ответов агента (прожарка grill-agent-style.md): набор строк памяти с переключателем. Один активный; действует только на ответы
// в разговоре, выжимки и описания остаются нейтральными. Выбор — в поповере у поля, рядом с «Глубиной»
export const styleChanged = () => window.dispatchEvent(new Event('refkit:style'))

export function useStyle() {
  const [state, setState] = useState<StyleState>()
  useEffect(() => {
    const load = () => library.style().then(setState).catch(() => {})
    load()
    window.addEventListener('refkit:style', load)
    return () => window.removeEventListener('refkit:style', load)
  }, [])
  const active = state && [...state.presets, ...state.custom].find((item) => item.id === state.active)
  return { state, active, isStyled: Boolean(active?.text) }
}

// Строка памяти «про тон ответа» — простой список слов, без модели: по нему под «Запомнить» появляется «Стилем», а на странице «Память» —
// пометка «перекрыто стилем», пока включён стиль
export const isToneLine = (text: string) => /кратк|коротк|подробн|прост|длинн|тон\b|стил|шутк|ёмк|емк|развёрнут|лаконич|сухо|мягк|груб|язвит|формальн/i.test(text)

// editable — на странице «Память»: у каждого стиля раскрывается текст, по которому агент отвечает, и его можно править
export function StyleSection({ onPicked, bare, editable }: { onPicked?: () => void; bare?: boolean; editable?: boolean }) {
  const { state } = useStyle()
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const [text, setText] = useState('')
  const [open, setOpen] = useState<string | null>(null)
  if (!state) return null
  const items: StyleItem[] = [...state.presets, ...state.custom]
  const pick = (id: string) => { void library.setStyle(id).then(() => { styleChanged(); onPicked?.() }) }
  const save = () => {
    if (!name.trim() || !text.trim()) return
    void library.addStyle(name, text, true).then(() => { styleChanged(); setAdding(false); setName(''); setText('') })
  }
  return (
    <div className="flex flex-col gap-2">
      {!bare && <div className="flex items-center justify-between text-sm"><span className="text-muted-foreground">{t('Стиль')}</span></div>}
      <RadioGroup value={state.active} onValueChange={pick} className="relative gap-0.5" aria-label={t('Стиль ответов')}>
        <HoverSlide selector="label" className="rounded-control bg-muted/60" />
        {items.map((item) => {
          const own = state.custom.some((custom) => custom.id === item.id)
          const edited = item.original !== undefined && item.original !== item.text
          const shown = open === item.id
          return (
            <div key={item.id} className="flex flex-col">
              <label className="group/style flex h-8 cursor-pointer items-center gap-2.5 rounded-control px-2 text-sm">
                <RadioGroupItem value={item.id} />
                <span className="min-w-0 flex-1 truncate">{item.name}{edited && <span className="ml-1.5 text-xs text-muted-foreground">{t('· изменён')}</span>}</span>
                {own && <Button variant="ghost" size="icon-xs" aria-label={t('Удалить стиль «{name}»', { name: item.name })} className="opacity-0 group-hover/style:opacity-100 focus-visible:opacity-100"
                  onClick={(event) => { event.preventDefault(); void library.deleteStyle(item.id).then(styleChanged) }}><Trash2 /></Button>}
                {editable && item.text && (
                  <Button variant="ghost" size="icon-xs" aria-label={shown ? t('Скрыть текст стиля «{name}»', { name: item.name }) : t('Показать текст стиля «{name}»', { name: item.name })} aria-expanded={shown}
                    onClick={(event) => { event.preventDefault(); setOpen(shown ? null : item.id) }}><ChevronRight className={cn('transition-transform', shown && 'rotate-90')} /></Button>
                )}
              </label>
              {editable && shown && (
                <div className="mb-1 ml-8 flex flex-col gap-1.5">
                  {/* Это и есть вся инструкция стиля: агент получает её как есть вместе с правилом «важнее памяти, меняет только тон и длину». Правка сохраняется по уходу из поля */}
                  <Textarea key={item.text} aria-label={t('Текст стиля «{name}»', { name: item.name })} defaultValue={item.text} rows={6} className="resize-y text-sm"
                    onBlur={(event) => { const next = event.target.value.trim(); if (next && next !== item.text) void library.editStyle(item.id, next).then(styleChanged) }} />
                  {edited && <Button variant="ghost" size="xs" className="self-start" onClick={() => void library.resetStyle(item.id).then(styleChanged)}><RotateCcw />{t('Вернуть исходный')}</Button>}
                </div>
              )}
            </div>
          )
        })}
      </RadioGroup>
      {adding ? (
        <div className="flex flex-col gap-1.5">
          <Input autoFocus aria-label={t('Название стиля')} placeholder={t('Название')} value={name} onChange={(event) => setName(event.target.value)} className="h-8 text-sm" />
          <Textarea aria-label={t('Как отвечать')} placeholder={t('Как отвечать: тон, длина, манера')} rows={3} value={text} onChange={(event) => setText(event.target.value)} className="min-h-0 resize-none text-sm" />
          <div className="flex justify-end gap-1.5">
            <Button variant="ghost" size="xs" onClick={() => setAdding(false)}>{t('Отмена')}</Button>
            <Button size="xs" disabled={!name.trim() || !text.trim()} onClick={save}>{t('Сохранить')}</Button>
          </div>
        </div>
      ) : (
        <Button variant="ghost" size="sm" className="justify-start text-muted-foreground" onClick={() => setAdding(true)}><Plus />{t('Своё…')}</Button>
      )}
    </div>
  )
}
