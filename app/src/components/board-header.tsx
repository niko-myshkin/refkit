import { useEffect, useState, type ReactNode } from 'react'
import { t } from '@/lib/i18n'
import { Input } from '@/components/ui/input'
import { NameButton, nameInline } from '@/components/name-button'
import { Textarea } from '@/components/ui/textarea'

// Подборка как место (v2, каркас Fabric: шапка пространства): крупное название и описание. Числа материалов нет нигде (владелец 2026-10-03).
// Название и описание правятся по месту — выглядят как текст, при наведении и фокусе подсвечиваются; рамки у поля нет, на месте ввода
// мигает курсор (решение владельца 2026-10-02, поля тут «не нужны»). Enter или уход фокуса — сохранить, Esc — отменить.
// Полку не переименовать (сервер не даст), её название — просто текст
// Поле без вида поля: shadcn Input и Textarea, но без рамки, фона и кольца фокуса (в тёмной теме у них свой фон — перекрыт dark:)
const inline = 'rounded-control border-0 bg-transparent px-3 shadow-none hover:bg-muted/40 focus-visible:border-transparent focus-visible:bg-muted/40 focus-visible:ring-0 dark:bg-transparent dark:hover:bg-muted/40 dark:focus-visible:bg-muted/40'

export function BoardHeader({ name, description, locked, action, onRename, onDescribe, onSuggest }: {
  name: string; description?: string; locked?: boolean
  action?: ReactNode // кнопка справа от названия (у «Входящих» — «Разобрать»)
  onRename: (to: string) => void; onDescribe: (text: string) => void
  onSuggest?: () => Promise<string> // «Назвать за меня»
}) {
  const [title, setTitle] = useState(name)
  const [about, setAbout] = useState(description ?? '')
  useEffect(() => setTitle(name), [name])
  useEffect(() => setAbout(description ?? ''), [description, name])
  const saveTitle = () => { const to = title.trim(); if (to && to !== name) onRename(to); else setTitle(name) }
  const saveAbout = () => { if (about.trim() !== (description ?? '')) onDescribe(about) }
  return (
    <header className="flex flex-col gap-1 pt-6 pb-2">
      {locked
        ? <div className="flex items-center justify-between gap-3"><h1 className="text-3xl font-semibold tracking-tight">{name}</h1>{action}</div>
        : (
          // Поле обнимает название (field-sizing: content), а не тянется на всю ширину (владелец 2026-10-02)
          <div className="group relative -ml-3 w-fit max-w-[calc(100%-2.5rem)]">
            <Input aria-label={t('Название подборки')} value={title} onChange={(event) => setTitle(event.target.value)} onBlur={saveTitle}
              onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur(); if (event.key === 'Escape') { setTitle(name); event.currentTarget.blur() } }}
              className={`${inline} field-sizing-content h-auto w-auto min-w-24 max-w-full py-1 text-3xl font-semibold tracking-tight md:text-3xl`} />
            {/* «Назвать за меня» — всплывает под названием при наведении; предложенное имя сразу сохраняется */}
            {onSuggest && <NameButton className={nameInline} current={name} suggest={onSuggest} onName={(next) => { setTitle(next); onRename(next) }} />}
          </div>
        )}
      {/* У «Входящих» описания нет: это не подборка, а место, куда всё попадает (владелец 2026-10-15) */}
      {!locked && <Textarea aria-label={t('Описание подборки — что в ней и зачем')} placeholder={t('Что здесь и зачем')} value={about} rows={1} onChange={(event) => setAbout(event.target.value)} onBlur={saveAbout}
        onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); event.currentTarget.blur() } if (event.key === 'Escape') { setAbout(description ?? ''); event.currentTarget.blur() } }}
        className={`${inline} -ml-3 w-auto min-w-24 max-w-full min-h-0 resize-none self-start py-1 text-sm text-muted-foreground md:text-sm`} />}
    </header>
  )
}

