import { useState } from 'react'
import { t, locale } from '@/lib/i18n'
import { Check, RotateCcw, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { pinNumber, type CardComment } from '@/components/comment-feed'
import { cn } from '@/lib/utils'

// Панель «Комментарии» холста (сверка с Doop, 2026-10-26): все комментарии всех нод одним списком, «Открытые» и «Закрытые».
// Применённая правка закрывается сама и остаётся в «Закрытых»; закрыть можно и руками, вернуть тоже. Клик по строке — к ноде
export type CommentGroup = { id: string; title: string; applicable: boolean; open: CardComment[]; closed: CardComment[] }

const when = (at: number) => new Date(at).toLocaleString(locale, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

export function CommentsPanel({ groups, onFocus, onApply, onClose, onReopen, onHide }: {
  groups: CommentGroup[]; onFocus: (nodeId: string) => void; onApply: (nodeId: string) => void
  onClose: (nodeId: string, commentId: string) => void; onReopen: (nodeId: string, commentId: string) => void; onHide?: () => void
}) {
  const [tab, setTab] = useState<'open' | 'closed'>('open')
  const shown = groups.filter((group) => (tab === 'open' ? group.open : group.closed).length > 0)
  const tabClass = (on: boolean) => cn('rounded-lg px-2.5 py-1 text-xs transition-colors', on ? 'bg-muted text-foreground' : 'text-muted-foreground hover:text-foreground')
  return (
    <div className="flex min-h-0 flex-1 flex-col" role="region" aria-label={t('Правки холста')}>
      <div className="flex items-center gap-1 p-2">
        <button type="button" className={tabClass(tab === 'open')} onClick={() => setTab('open')}>{t('Открытые')}</button>
        <button type="button" className={tabClass(tab === 'closed')} onClick={() => setTab('closed')}>{t('Закрытые')}</button>
        {onHide && <Button variant="ghost" size="icon-xs" className="ml-auto" aria-label={t('Скрыть панель')} onClick={onHide}><X /></Button>}
      </div>
      <div className="nowheel flex min-h-0 flex-1 flex-col gap-3 overflow-auto p-2">
        {shown.length === 0 && <p className="px-2 py-6 text-center text-xs text-muted-foreground">{tab === 'open' ? t('Открытых комментариев нет. Включи «Комментарий» (C) и кликни по экрану или картинке.') : t('Здесь появятся применённые и закрытые правки.')}</p>}
        {shown.map((group) => {
          const list = tab === 'open' ? group.open : group.closed
          return (
            <section key={group.id} className="flex flex-col gap-1" aria-label={group.title}>
              <div className="flex items-center gap-2 px-2">
                <button type="button" className="min-w-0 flex-1 truncate text-left text-xs font-medium hover:underline" onClick={() => onFocus(group.id)}>{group.title}</button>
                {tab === 'open' && group.applicable && <Button size="xs" className="shrink-0 rounded-lg" onClick={() => onApply(group.id)}>{t('Применить ({n})', { n: list.length })}</Button>}
              </div>
              <ul className="flex flex-col">
                {list.map((item) => {
                  const number = pinNumber(list, item.id)
                  return (
                    <li key={item.id} className="group/c flex items-start gap-2 rounded-md px-2 py-1.5 hover:bg-muted/60">
                      {item.x !== undefined && <span className="mt-0.5 inline-grid size-5 shrink-0 place-items-center rounded-full bg-primary text-micro font-medium text-primary-foreground tabular-nums">{number}</span>}
                      <button type="button" className="flex min-w-0 flex-1 flex-col text-left" onClick={() => onFocus(group.id)}>
                        <span className="text-sm leading-snug break-words">{item.text}</span>
                        <span className="text-xs text-muted-foreground">{item.el?.tag ? `<${item.el.tag}> · ` : ''}{tab === 'closed' && item.closedAt ? `${item.closedBy === 'applied' ? t('применено') : t('закрыто')} ${when(item.closedAt)}` : when(item.at)}</span>
                      </button>
                      {tab === 'open'
                        ? <Button variant="ghost" size="icon-xs" className="shrink-0 opacity-0 group-hover/c:opacity-100 focus-visible:opacity-100" aria-label={t('Закрыть комментарий')} onClick={() => onClose(group.id, item.id)}><Check /></Button>
                        : <Button variant="ghost" size="icon-xs" className="shrink-0 opacity-0 group-hover/c:opacity-100 focus-visible:opacity-100" aria-label={t('Вернуть в открытые')} onClick={() => onReopen(group.id, item.id)}><RotateCcw /></Button>}
                    </li>
                  )
                })}
              </ul>
            </section>
          )
        })}
      </div>
    </div>
  )
}
