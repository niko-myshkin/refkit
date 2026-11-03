import { useState, type KeyboardEvent } from 'react'
import { t, locale } from '@/lib/i18n'
import { fieldTitle } from '@/components/field-title'
import { ArrowUp, Brain, Ellipsis, Pencil, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupTextarea } from '@/components/ui/input-group'
import { Textarea } from '@/components/ui/textarea'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

// Комментарии владельца к карточке (идея 62, grill-card-comments.md): журнал мыслей, не чат. «Сохранить» только сохраняет —
// агент молчит и читает всю ленту, когда его позовут. Первый комментарий — «зачем сохранил» из окна добавления.
export type CardComment = { id: string; text: string; at: number; editedAt?: number; closedAt?: number; closedBy?: 'applied' | 'manual'; x?: number; y?: number; h?: number; el?: { tag: string; sel: string; text: string; rect: [number, number, number, number] } }
// Номер точки на картинке — порядок среди комментариев с точкой (тот же, что на кружке)
export const pinNumber = (comments: CardComment[], id: string) => comments.filter((item) => item.x !== undefined).findIndex((item) => item.id === id) + 1

const when = (item: CardComment) =>
  `${new Date(item.at).toLocaleString(locale, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}${item.editedAt ? t(' · изменён') : ''}`

// Enter сохраняет, Shift+Enter — перенос строки; во время набора через IME Enter подтверждает слово, а не сохраняет
const onEnter = (event: KeyboardEvent, done: () => void) => {
  if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return
  event.preventDefault()
  done()
}

export function CommentFeed({ comments, onAdd, onEdit, onRemove, onRemember, hovered, onHover, placeholder = t('Зачем сохранил, что взять'), title = t('Заметки') }: {
  comments: CardComment[]; onAdd: (text: string) => void; onEdit: (id: string, text: string) => void; onRemove: (id: string) => void
  onRemember?: (text: string) => Promise<unknown> // «Запомнить» в меню заметки: строка уходит в память о владельце (grill-comments-system.md); без пропа пункта нет
  hovered?: string | null; onHover?: (id: string | null) => void; placeholder?: string; title?: string // связь с точкой на картинке: навёл здесь — подсветилась там
}) {
  const [draft, setDraft] = useState('')
  const [editing, setEditing] = useState<{ id: string; text: string } | null>(null)
  const save = () => { const text = draft.trim(); if (!text) return; onAdd(text); setDraft('') }
  const commit = () => { if (editing?.text.trim()) onEdit(editing.id, editing.text.trim()); setEditing(null) }
  // «Запомнить»: заметка открывается в поле (строку можно поправить), «Да» кладёт её в память — владелец решает сам, агент в фоне ничего не делает
  const [remembering, setRemembering] = useState<{ id: string; text: string } | null>(null)
  const [remembered, setRemembered] = useState<string | null>(null)
  const remember = async () => {
    const text = remembering?.text.trim(); if (!remembering || !text || !onRemember) return
    try { await onRemember(text); setRemembered(remembering.id); setRemembering(null) } catch { /* сервер недоступен — поле остаётся, можно повторить */ }
  }
  return (
    <section className="flex flex-col gap-2">
      <h3 className={fieldTitle}>{title}</h3>
      {comments.length > 0 && (
        <ul className="flex flex-col gap-2">
          {comments.map((item) => (
            <li key={item.id} onMouseEnter={() => onHover?.(item.id)} onMouseLeave={() => onHover?.(null)}
              className={cn('group/comment relative flex flex-col gap-0.5 rounded-control bg-muted/40 px-3 py-2 transition-colors', hovered === item.id && 'bg-muted')}>
              {remembering?.id === item.id ? (
                <>
                  <Textarea aria-label={t('Запомнить')} autoFocus value={remembering.text} rows={1} onFocus={(event) => { const end = event.currentTarget.value.length; event.currentTarget.setSelectionRange(end, end) }} onChange={(event) => setRemembering({ id: item.id, text: event.target.value })}
                    onKeyDown={(event) => { if (event.key === 'Escape') { event.stopPropagation(); setRemembering(null) } else onEnter(event, () => void remember()) }}
                    className="min-h-9 resize-none text-body md:text-body" />
                  <div className="flex items-center justify-end gap-2 pt-1">
                    <span className="mr-auto caption">{t('Запомнить: ')}</span>
                    <Button variant="ghost" size="xs" onClick={() => setRemembering(null)}>{t('Отмена')}</Button>
                    <Button size="xs" disabled={!remembering.text.trim()} onClick={() => void remember()}>{t('Да')}</Button>
                  </div>
                </>
              ) : editing?.id === item.id ? (
                <>
                  <Textarea aria-label={t('Правка комментария')} autoFocus value={editing.text} rows={1} onFocus={(event) => { const end = event.currentTarget.value.length; event.currentTarget.setSelectionRange(end, end) }} onChange={(event) => setEditing({ id: item.id, text: event.target.value })}
                    onKeyDown={(event) => { if (event.key === 'Escape') { event.stopPropagation(); setEditing(null) } else onEnter(event, commit) }}
                    className="min-h-9 resize-none text-body md:text-body" />
                  <div className="flex justify-end gap-2 pt-1">
                    <Button variant="ghost" size="xs" onClick={() => setEditing(null)}>{t('Отмена')}</Button>
                    <Button size="xs" disabled={!editing.text.trim()} onClick={commit}>{t('Сохранить')}</Button>
                  </div>
                </>
              ) : (
                <>
                  <p className="pr-7 text-body break-words whitespace-pre-wrap">
                    {item.x !== undefined && <span className="mr-1.5 inline-grid size-5 place-items-center rounded-full bg-primary align-[1px] text-micro font-medium text-primary-foreground tabular-nums">{pinNumber(comments, item.id)}</span>}
                    {item.text}
                  </p>
                  <span className="caption">{when(item)}{remembered === item.id ? t(' · в памяти') : ''}</span>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon-xs" aria-label={t('Действия с комментарием')} className="absolute top-1 right-1 opacity-0 group-hover/comment:opacity-100 focus-visible:opacity-100 aria-expanded:opacity-100"><Ellipsis /></Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onSelect={() => setEditing({ id: item.id, text: item.text })}><Pencil />{t('Изменить')}</DropdownMenuItem>
                      {onRemember && <DropdownMenuItem onSelect={() => { setRemembered(null); setRemembering({ id: item.id, text: item.text }) }}><Brain />{t('Запомнить')}</DropdownMenuItem>}
                      <DropdownMenuItem variant="destructive" onSelect={() => onRemove(item.id)}><Trash2 />{t('Удалить')}</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
      <InputGroup>
        <InputGroupTextarea aria-label={t('Новый комментарий')} placeholder={placeholder} value={draft} rows={1} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => onEnter(event, save)} className="min-h-9 max-h-40 text-body md:text-body" />
        <InputGroupAddon align="inline-end" className="self-end pb-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <InputGroupButton variant="default" size="icon-xs" aria-label={t('Сохранить комментарий')} disabled={!draft.trim()} onClick={save} className="ml-auto rounded-lg"><ArrowUp /></InputGroupButton>
            </TooltipTrigger>
            <TooltipContent>{t('Сохранить · Enter')}</TooltipContent>
          </Tooltip>
        </InputGroupAddon>
      </InputGroup>
    </section>
  )
}
