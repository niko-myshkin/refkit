import { Search } from 'lucide-react'
import { t } from '@/lib/i18n'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
import { rowFocus } from '@/lib/shell'
import type { Turn } from '@/lib/library'

// Список разговоров агента — вид Chats у Figma (владелец 2026-10-10): поиск, группы по давности, у строки заголовок,
// время справа и превью в две строки. Клик — разговор открывается в той же колонке

const plain = (text: string) => text.replace(/\[([^\]]+)\]\(card:[^)]+\)/g, '$1').replace(/[*_`#>|-]/g, ' ').replace(/\s+/g, ' ').trim()

// Давность одним коротким словом: «сейчас», «5 мин», «3 ч», «2 д», «3 нед», «1 мес»
// Число и единица — через неразрывный пробел: «2 нед» не разъезжается по строкам (аудит 2026-10-13)
export const ago = (at: number) => {
  const minutes = Math.max(0, Math.round((Date.now() - at) / 60000))
  if (minutes < 1) return t('сейчас')
  if (minutes < 60) return t('{minutes}\u00a0мин', { minutes })
  const hours = Math.round(minutes / 60)
  if (hours < 24) return t('{hours}\u00a0ч', { hours })
  const days = Math.round(hours / 24)
  if (days < 7) return t('{days}\u00a0д', { days })
  if (days < 30) return t('{days}\u00a0нед', { days: Math.round(days / 7) })
  return t('{days}\u00a0мес', { days: Math.round(days / 30) })
}

const sameDay = (a: number, b: number) => new Date(a).toDateString() === new Date(b).toDateString()

export type ChatRow = { id: number; title: string; preview: string; at: number }

export function chatRows(thread: Turn[]): ChatRow[] {
  const real = thread.filter((turn) => turn.via !== 'digest')
  return [...new Set(real.map((turn) => turn.conversation ?? 0))]
    .map((id) => {
      const turns = real.filter((turn) => (turn.conversation ?? 0) === id)
      const last = turns[turns.length - 1]
      return { id, title: turns[0].command, preview: plain(last.answer), at: last.at }
    })
    .sort((a, b) => b.at - a.at)
}

export function AgentChats({ thread, current, query, onQuery, onOpen }: { thread: Turn[]; current: number; query: string; onQuery: (value: string) => void; onOpen: (id: number) => void }) {
  const needle = query.trim().toLowerCase()
  const rows = chatRows(thread).filter((row) => !needle || `${row.title} ${row.preview}`.toLowerCase().includes(needle))
  const now = Date.now()
  const groups = [
    { label: t('Сегодня'), rows: rows.filter((row) => sameDay(row.at, now)) },
    { label: t('Раньше'), rows: rows.filter((row) => !sameDay(row.at, now)) },
  ].filter((group) => group.rows.length)
  return (
    <>
      <div className="relative">
        <Search aria-hidden className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input aria-label={t('Поиск по разговорам')} value={query} onChange={(event) => onQuery(event.target.value)} className="pl-8" />
      </div>
      <ScrollArea className="min-h-0 flex-1 [&_[data-slot=scroll-area-viewport]>div]:!block">
        <nav aria-label={t('Разговоры')} className="flex flex-col gap-3">
          {groups.map((group) => (
            <section key={group.label} className="flex flex-col gap-1">
              <span className="px-2 caption">{group.label}</span>
              {group.rows.map((row) => (
                <button key={row.id} type="button" aria-current={row.id === current || undefined} onClick={() => onOpen(row.id)}
                  className={cn('flex flex-col gap-0.5 rounded-control px-2 py-2 text-left hover:bg-muted', rowFocus, row.id === current && 'bg-muted')}>
                  <span className="flex items-baseline gap-2">
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">{row.title}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">{ago(row.at)}</span>
                  </span>
                  <span className="line-clamp-2 text-xs text-muted-foreground">{row.preview}</span>
                </button>
              ))}
            </section>
          ))}
        </nav>
      </ScrollArea>
    </>
  )
}
