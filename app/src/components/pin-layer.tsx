import { useEffect, useState } from 'react'
import { t } from '@/lib/i18n'
import { createPortal } from 'react-dom'
import { Input } from '@/components/ui/input'
import { pinNumber, type CardComment } from '@/components/comment-feed'
import { cn } from '@/lib/utils'

// Точки комментариев поверх картинки. Вне режима — только кружки (наведение связывает с лентой); в режиме — прицел,
// клик ставит точку и поле рядом: Enter сохраняет, Esc отменяет. Координаты — доли 0…1 от картинки
export function PinLayer({ comments, active, onHover, onSave, onCancel }: {
  comments: CardComment[]; active: boolean; onHover: (id: string | null) => void
  onSave: (text: string, x: number, y: number) => void; onCancel: () => void
}) {
  const [draft, setDraft] = useState<{ x: number; y: number; text: string } | null>(null)
  useEffect(() => { if (!active) setDraft(null) }, [active])
  const pins = comments.filter((item) => item.x !== undefined && item.y !== undefined)
  const pin = 'absolute z-10 grid size-7 -translate-y-full place-items-center rounded-full rounded-bl-none text-xs font-medium tabular-nums shadow-md ring-2 ring-background'
  return (
    <div className={cn('absolute inset-0', active ? 'cursor-crosshair' : 'pointer-events-none')}
      onPointerDown={(event) => { if (active) event.stopPropagation() }}
      onClick={(event) => {
        if (!active || draft) return
        const box = event.currentTarget.getBoundingClientRect()
        setDraft({ x: (event.clientX - box.left) / box.width, y: (event.clientY - box.top) / box.height, text: '' })
      }}>
      {pins.map((item) => (
        <button key={item.id} type="button" aria-label={t('Комментарий {id}: {text}', { id: pinNumber(comments, item.id), text: item.text })} title={item.text}
          className={cn(pin, 'pointer-events-auto bg-primary text-primary-foreground')}
          style={{ left: `${item.x! * 100}%`, top: `${item.y! * 100}%` }} onMouseEnter={() => onHover(item.id)} onMouseLeave={() => onHover(null)}>
          {pinNumber(comments, item.id)}
        </button>
      ))}
      {draft && (
        <div className="absolute z-20" style={{ left: `${draft.x * 100}%`, top: `${draft.y * 100}%` }} onClick={(event) => event.stopPropagation()}>
          <span className={cn(pin, 'left-0 top-0 bg-primary')} />
          <div className={cn('absolute top-0 w-64 -translate-y-1/2', draft.x > 0.6 ? 'right-9' : 'left-9')}>
            <Input autoFocus aria-label={t('Комментарий в этой точке')} placeholder={t('Комментарий…')} value={draft.text} className="glass h-9 shadow-lg dark:bg-(--glass-bg)"
              onChange={(event) => setDraft({ ...draft, text: event.target.value })}
              onKeyDown={(event) => {
                if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); setDraft(null); onCancel() }
                if (event.key === 'Enter' && draft.text.trim()) { event.preventDefault(); onSave(draft.text.trim(), draft.x, draft.y); setDraft(null) }
              }} />
          </div>
        </div>
      )}
    </div>
  )
}

// Поле комментария к выбранному элементу: плавает рядом с ним поверх всего (экран живёт в уменьшенной ноде, внутри неё поле не поместилось бы).
// Enter — сохранить, Esc или клик мимо — отменить. Координаты — в окне браузера; у высокого элемента поле ставится у его верхнего края (под нижним оно уезжало за экран на панель инструментов)
export function CommentComposer({ left, top, label, onSave, onCancel }: { left: number; top: number; label: string; onSave: (text: string) => void; onCancel: () => void }) {
  const [text, setText] = useState('')
  useEffect(() => {
    const away = (event: PointerEvent) => { if (!(event.target as HTMLElement | null)?.closest('[data-composer]')) onCancel() }
    window.addEventListener('pointerdown', away, true)
    return () => window.removeEventListener('pointerdown', away, true)
  }, [onCancel])
  const x = Math.min(Math.max(8, left), window.innerWidth - 280)
  const y = Math.min(Math.max(8, top), window.innerHeight - 168) // выше нижней панели инструментов: у высоких элементов поле не должно ложиться на неё
  return createPortal(
    <div data-composer className="glass fixed z-[70] w-64 rounded-lg p-1.5 shadow-lg dark:bg-(--glass-bg)" style={{ left: x, top: y }}>
      <p className="px-1.5 pb-1 text-micro text-muted-foreground">{label}</p>
      <Input autoFocus aria-label={t('Комментарий к элементу')} placeholder={t('Что поправить…')} value={text} className="h-9"
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          event.stopPropagation()
          if (event.key === 'Escape') { event.preventDefault(); onCancel() }
          if (event.key === 'Enter' && text.trim() && !event.nativeEvent.isComposing) { event.preventDefault(); onSave(text.trim()) }
        }} />
    </div>,
    document.body,
  )
}
