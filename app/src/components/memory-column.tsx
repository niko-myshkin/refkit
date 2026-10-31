import { useEffect, useState } from 'react'
import { t } from '@/lib/i18n'
import { Plus, Search, X } from 'lucide-react'
import { DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from '@/components/ui/sidebar'
import { library, type MemoryItem } from '@/lib/library'
import { memoryChanged } from '@/components/agent-memory'
import { isToneLine, useStyle } from '@/components/agent-style'
import { cn } from '@/lib/utils'

// Область правила (grill-memory-page.md): нет/«all» — видят все агенты, «app» — только агент Refkit, иначе — агент в этой папке проекта
// Подписи различаются: «только агент Refkit» (свой агент) и «только в проекте Refkit» (Claude Code в папке Refkit) — разные вещи (приёмка 2026-10-14)
const scopeName = (scope?: string) => !scope || scope === 'all' ? t('везде') : scope === 'app' ? t('только агент Refkit') : t('только в проекте {scope}', { scope })
// Источник — коротко: из пути к файлу остаётся имя файла, без «~/.claude/projects/…»
const sourceName = (from: string) => from.includes('/') ? from.split('/').pop() ?? from : from
import { ago } from '@/components/agent-chats'

// Память о тебе колонкой — вид Chats у Figma (владелец 2026-10-10): поиск, строки с текстом и пометкой «откуда · когда».
// Клик по тексту правит строку на месте, × при наведении — забыть, «Новая запись» внизу — добавить руками.
// Предложенное внешним агентом (MCP, refkit_suggest_memory) — сверху, запомнится после «Да»
// plain — на странице «Память»: без своей прокрутки и отступов, страница листается целиком
export function MemoryColumn({ plain = false }: { plain?: boolean }) {
  const { active, isStyled } = useStyle()
  const [items, setItems] = useState<MemoryItem[]>([])
  const [offers, setOffers] = useState<MemoryItem[]>([])
  const [query, setQuery] = useState('')
  const [editing, setEditing] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState('')
  // Проекты, из которых агенты уже брали память, — варианты области
  const [projects, setProjects] = useState<string[]>([])
  useEffect(() => { library.mcpLog().then((calls) => setProjects([...new Set(calls.map((call) => call.project))].slice(0, 8))).catch(() => {}) }, [])
  useEffect(() => {
    const load = () => library.memory().then(setItems).catch(() => {})
    load()
    window.addEventListener('refkit:memory', load)
    return () => window.removeEventListener('refkit:memory', load)
  }, [])
  useEffect(() => { library.memoryOffers().then(setOffers).catch(() => {}) }, [items.length])
  const answer = async (id: string, accept: boolean) => { setOffers(await library.answerMemoryOffer(id, accept)); if (accept) setItems(await library.memory()); memoryChanged() }
  const save = async (id: string) => { const text = draft.trim(); setEditing(null); if (text) setItems(await library.editMemory(id, text)) }
  const create = async () => { const text = draft.trim(); setAdding(false); if (text) setItems(await library.addMemory(text)) }
  const needle = query.trim().toLowerCase()
  const shown = [...items].sort((a, b) => b.at - a.at).filter((item) => !needle || `${item.text} ${item.from ?? ''}`.toLowerCase().includes(needle))
  return (
    <div className={plain ? 'flex flex-col gap-2' : 'flex min-h-0 flex-1 flex-col gap-2 p-2'}>
      <div className="relative">
        <Search aria-hidden className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input aria-label={t('Поиск по памяти')} value={query} onChange={(event) => setQuery(event.target.value)} className="pl-8" />
      </div>
      <ScrollArea className={plain ? '[&_[data-slot=scroll-area-viewport]>div]:!block' : 'min-h-0 flex-1 [&_[data-slot=scroll-area-viewport]>div]:!block'}>
        {offers.length > 0 && (
          <section aria-label={t('Предложено запомнить')} className="mb-3 flex flex-col gap-1">
            <span className="px-2 caption">{t('Предложено запомнить')}</span>
            {offers.map((item) => (
              <div key={item.id} className="flex items-start gap-2 rounded-control border border-dashed border-line px-2 py-2">
                <span className="min-w-0 flex-1 text-body">{item.text}</span>
                <Button variant="secondary" size="xs" onClick={() => void answer(item.id, true)}>{t('Запомнить')}</Button>
                <Button variant="ghost" size="icon-xs" aria-label={t('Не запоминать: {text}', { text: item.text })} onClick={() => void answer(item.id, false)}><X /></Button>
              </div>
            ))}
          </section>
        )}
        <section aria-label={t('Память о тебе')} className="flex flex-col gap-1">
          {shown.map((item) => editing === item.id ? (
            <Textarea key={item.id} autoFocus aria-label={t('Поправить строку памяти')} value={draft} rows={1} className="min-h-9 resize-none text-body md:text-body" onChange={(event) => setDraft(event.target.value)} onBlur={() => void save(item.id)}
              onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void save(item.id) } if (event.key === 'Escape') { event.stopPropagation(); setEditing(null) } }} />
          ) : (
            <div key={item.id} id={`memory-${item.id}`} className="group/memory relative flex flex-col gap-0.5 rounded-control px-2 py-2 hover:bg-muted">
              <button type="button" className="line-clamp-3 min-h-6 pr-6 text-left text-body outline-none focus-visible:underline" onClick={() => { setDraft(item.text); setEditing(item.id) }}>{item.text}</button>
              <span className="flex flex-wrap items-center gap-x-1 text-xs text-muted-foreground"><span className="min-w-0 break-all">{item.from ? t('из «{from}» · ', { from: sourceName(item.from) }) : ''}{ago(item.at)}</span>
                {isStyled && isToneLine(item.text) && <span className="rounded-control bg-muted px-1.5">{t('перекрыто стилем «{name}»', { name: active?.name })}</span>}
                {/* «Везде» — по умолчанию, не подписываем (скептик 2026-10-14): метка видна, только когда область особая; у «везде» — при наведении и фокусе, чтобы было где поменять */}
                <DropdownMenu>
                  <DropdownMenuTrigger className={cn('rounded-control text-left underline-offset-2 outline-none hover:text-foreground hover:underline focus-visible:ring-2 focus-visible:ring-ring', (!item.scope || item.scope === 'all') && 'opacity-0 group-hover/memory:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100 [@media(hover:none)]:opacity-100')}>· {scopeName(item.scope)}</DropdownMenuTrigger>
                  <DropdownMenuContent align="start">
                    <DropdownMenuRadioGroup value={item.scope ?? 'all'} onValueChange={(scope) => void library.memoryScope(item.id, scope).then(setItems)}>
                      {['all', 'app', ...projects.filter((name) => name !== 'all' && name !== 'app')].map((scope) => (
                        <DropdownMenuRadioItem key={scope} value={scope}>{scopeName(scope)}</DropdownMenuRadioItem>
                      ))}
                    </DropdownMenuRadioGroup>
                  </DropdownMenuContent>
                </DropdownMenu>
              </span>
              <Button variant="ghost" size="icon-xs" aria-label={t('Забыть: {text}', { text: item.text })} className="absolute right-1 top-1 opacity-0 group-hover/memory:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100"
                onClick={() => void library.deleteMemory(item.id).then(setItems)}><X /></Button>
            </div>
          ))}
        </section>
        {/* Новая запись — внизу списка, как «Новый space» в колонке папок */}
        <SidebarMenu className="mt-2">
          <SidebarMenuItem>
            {adding ? (
              <Input autoFocus aria-label={t('Новая строка памяти')} placeholder={t('Что запомнить')} value={draft} onChange={(event) => setDraft(event.target.value)} onBlur={() => void create()}
                onKeyDown={(event) => { if (event.key === 'Enter') void create(); if (event.key === 'Escape') { event.stopPropagation(); setDraft(''); setAdding(false) } }} />
            ) : (
              <SidebarMenuButton onClick={() => { setDraft(''); setAdding(true) }}><Plus /><span>{t('Новая запись')}</span></SidebarMenuButton>
            )}
          </SidebarMenuItem>
        </SidebarMenu>
      </ScrollArea>
    </div>
  )
}
