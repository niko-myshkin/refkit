import { useState } from 'react'
import { t } from '@/lib/i18n'
import { MapPin, MessageSquare, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'

// Метка на картинке (№28, grill-fabric-findings.md): один жест на два случая. Ткнул точку → поле:
// написал для себя — метка осталась; спросил — агент отвечает про этот фрагмент (вырезка вокруг точки уходит в запрос).
// Координаты — доли картинки (0–1): метки стоят на месте при любом размере карточки
export type Mark = { id: string; x: number; y: number; text: string; at: number }

// Вырезка вокруг точки: квадрат в 40% меньшей стороны, не больше 768 px — агенту видно место и немного вокруг
async function crop(src: string, x: number, y: number): Promise<string> {
  const image = new Image()
  image.crossOrigin = 'anonymous'
  image.src = src
  await image.decode()
  const side = Math.round(Math.min(image.naturalWidth, image.naturalHeight) * 0.4)
  const left = Math.min(Math.max(0, x * image.naturalWidth - side / 2), image.naturalWidth - side)
  const top = Math.min(Math.max(0, y * image.naturalHeight - side / 2), image.naturalHeight - side)
  const size = Math.min(side, 768)
  const canvas = document.createElement('canvas')
  canvas.width = size; canvas.height = size
  canvas.getContext('2d')?.drawImage(image, left, top, side, side, 0, 0, size, size)
  return canvas.toDataURL('image/png')
}

export function ImageMarks({ image, marks = [], onChange, onAsk }: {
  image: string; marks?: Mark[]
  onChange: (marks: Mark[]) => void
  onAsk: (command: string, files: Array<{ name: string; data: string }>) => void
}) {
  const [placing, setPlacing] = useState(false)
  const [draft, setDraft] = useState<{ x: number; y: number; id?: string } | null>(null)
  const [text, setText] = useState('')
  const open = (mark: { x: number; y: number; id?: string }, value = '') => { setDraft(mark); setText(value) }
  const save = () => {
    if (!draft || !text.trim()) { setDraft(null); return }
    onChange(draft.id ? marks.map((mark) => mark.id === draft.id ? { ...mark, text: text.trim() } : mark) : [...marks, { id: `k-${Date.now()}`, x: draft.x, y: draft.y, text: text.trim(), at: Date.now() }])
    setDraft(null)
  }
  const ask = async () => {
    if (!draft) return
    const question = text.trim() || t('Что здесь и зачем это так сделано?')
    save()
    onAsk(t('Про отмеченное место: {question}', { question }), [{ name: t('фрагмент.png'), data: await crop(image, draft.x, draft.y).catch(() => image) }])
  }
  return (
    <div className={cn('group/marks absolute inset-0 z-1', placing && 'cursor-crosshair')}
      onClick={(event) => {
        if (!placing) return
        const box = event.currentTarget.getBoundingClientRect()
        open({ x: (event.clientX - box.left) / box.width, y: (event.clientY - box.top) / box.height })
        setPlacing(false)
      }}>
      {/* Режим метки — кнопкой в углу при наведении; клик по картинке без режима работает как раньше */}
      <Button variant="secondary" size="icon-sm" aria-label={placing ? t('Отменить метку') : t('Поставить метку')} aria-pressed={placing}
        className={cn('absolute right-2 top-2 transition-opacity', placing ? 'opacity-100' : 'opacity-0 group-hover/marks:opacity-100 focus-visible:opacity-100')}
        onClick={(event) => { event.stopPropagation(); setPlacing(!placing) }}><MapPin /></Button>
      {marks.map((mark, index) => (
        <button key={mark.id} type="button" aria-label={t('Метка {index}: {text}', { index: index + 1, text: mark.text })} title={mark.text}
          className="absolute grid size-6 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-primary text-xs font-medium text-primary-foreground shadow-md ring-2 ring-background"
          style={{ left: `${mark.x * 100}%`, top: `${mark.y * 100}%` }}
          onClick={(event) => { event.stopPropagation(); open(mark, mark.text) }}>{index + 1}</button>
      ))}
      <Popover open={Boolean(draft)} onOpenChange={(value) => { if (!value) setDraft(null) }}>
        {draft && <PopoverAnchor className="absolute size-0" style={{ left: `${draft.x * 100}%`, top: `${draft.y * 100}%` }} />}
        {/* Esc закрывает только поповер, не карточку */}
        <PopoverContent className="w-72 p-2" onClick={(event) => event.stopPropagation()} onEscapeKeyDown={(event) => event.stopPropagation()}>
          <Textarea autoFocus rows={2} value={text} aria-label={t('Текст метки')} placeholder={t('Что здесь важно')} className="min-h-0 resize-none text-sm"
            onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) { event.preventDefault(); void ask() }
              else if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); save() }
            }} />
          <div className="mt-2 flex items-center gap-1">
            <Button size="xs" onClick={() => void ask()}><MessageSquare />{t('Спросить агента')}</Button>
            <Button size="xs" variant="ghost" disabled={!text.trim()} onClick={save}>{t('Сохранить')}</Button>
            {draft?.id && <Button size="icon-xs" variant="ghost" className="ml-auto" aria-label={t('Удалить метку')} onClick={() => { onChange(marks.filter((mark) => mark.id !== draft.id)); setDraft(null) }}><X /></Button>}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  )
}
