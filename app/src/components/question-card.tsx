import { useState } from 'react'
import { t } from '@/lib/i18n'
import { Button } from '@/components/ui/button'
import { Kbd } from '@/components/ui/kbd'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Textarea } from '@/components/ui/textarea'

// Вопрос агента с вариантами — один на приложение: заголовок, варианты с пояснением (первый — рекомендованный), «Отправить».
// Как карточка вопроса в Claude Code: агент не гадает, а спрашивает; ответ — один выбор и одно нажатие
export type QuestionOption = { value: string; label: string; hint?: string }
export function QuestionCard({ title, options, submit = t('Отправить'), other, onSubmit, onSkip }: {
  title: string
  options: QuestionOption[]
  submit?: string
  other?: boolean // последняя строка «Другое…» со своим текстом; в onSubmit уходит этот текст
  onSubmit: (value: string) => void
  onSkip?: () => void
}) {
  const [value, setValue] = useState(options[0]?.value ?? '')
  const [typed, setTyped] = useState('')
  const OTHER = '__other'
  const answer = value === OTHER ? typed.trim() : value
  return (
    <div role="group" aria-label={title} className="overflow-hidden rounded-container bg-muted/60" onKeyDown={(event) => { if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') { event.preventDefault(); if (answer) onSubmit(answer) } }}>
      <p className="border-b border-foreground/10 px-4 py-2.5 text-sm">{title}</p>
      <RadioGroup value={value} onValueChange={setValue} className="gap-0">
        {options.map((option) => (
          <label key={option.value} className="flex cursor-pointer items-start gap-3 border-b border-foreground/10 px-4 py-3 last:border-b-0 hover:bg-muted/60">
            <RadioGroupItem value={option.value} className="mt-0.5" />
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="text-sm">{option.label}</span>
              {option.hint && <span className="text-xs text-muted-foreground">{option.hint}</span>}
            </span>
          </label>
        ))}
        {other && (
          <label className="flex cursor-pointer items-start gap-3 border-b border-foreground/10 px-4 py-3 last:border-b-0 hover:bg-muted/60">
            <RadioGroupItem value={OTHER} className="mt-0.5" />
            <span className="flex min-w-0 flex-1 flex-col gap-1.5">
              <span className="text-sm">{t('Другое…')}</span>
              {value === OTHER && <Textarea autoFocus aria-label={t('Свой ответ')} rows={2} value={typed} onChange={(event) => setTyped(event.target.value)} className="min-h-0 resize-none text-sm" />}
            </span>
          </label>
        )}
      </RadioGroup>
      <div className="flex justify-end gap-2 px-3 py-2.5">
        {onSkip && <Button variant="secondary" size="sm" onClick={onSkip}>{t('Пропустить')}</Button>}
        <Button size="sm" disabled={!answer} onClick={() => onSubmit(answer)}>{submit}<Kbd>⌘↵</Kbd></Button>
      </div>
    </div>
  )
}
