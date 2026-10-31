import { useEffect, useState } from 'react'
import { t } from '@/lib/i18n'
import { History } from 'lucide-react'
import { library, type McpCall } from '@/lib/library'
import { ConnectAgent } from '@/components/connect-agent'
import { ago } from '@/components/agent-chats'
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'
import { MemoryColumn } from '@/components/memory-column'
import { StyleSection } from '@/components/agent-style'
import { MemoryScheme } from '@/components/memory-scheme'

// Страница «Память» — пульт агента (прожарки grill-memory-page.md и grill-agent-style.md, 2026-10-15): как он отвечает (стиль),
// что о тебе помнит (правила и предложения «запомнить»), кто его память читал. Статистика библиотеки и чек-лист «Настрой агента»
// убраны: первая — про вкус, а не про настройку, второй дублировал то, что и так видно ниже. Снимок до — тег snapshot-2026-10-15-before-memory-page-redesign

const clientNames: Record<string, string> = { 'claude-code': 'Claude Code', 'codex-mcp-client': 'Codex', codex: 'Codex', cursor: 'Cursor' }
const clientName = (name: string) => clientNames[name] ?? name

export function MemoryPage({ embedded = false }: { embedded?: boolean }) {
  // Кто брал память: последние обращения из журнала MCP, по одной строке на «клиент · проект»
  const [calls, setCalls] = useState<McpCall[]>([])
  useEffect(() => { library.mcpLog().then(setCalls).catch(() => {}) }, [])
  const readers = [...new Map(calls.map((call) => [`${call.client}·${call.project}`, call])).values()].slice(0, 5)
  return (
    <div className={embedded ? 'flex flex-col gap-10' : 'mx-auto flex w-full max-w-3xl flex-col gap-10 px-(--canvas-gutter) pt-6 pb-24'}>
      {/* Сверху то, что меняешь чаще всего — стиль; дальше правила «о тебе»; внизу — кто читал. У каждого блока сказано, кто его читает:
          доверие через видимость (grill-memory-page.md) */}
      <MemoryScheme />

      <section aria-labelledby="memory-style" className="flex flex-col gap-3">
        <div className="flex flex-col gap-0.5">
          <h2 id="memory-style" className="text-sm font-medium">{t('Как отвечать')}</h2>
          <p className="text-xs text-muted-foreground">{t('Стиль действует на ответы в разговоре; выжимки и описания остаются нейтральными. Стрелка справа — текст стиля, его можно править')}</p>
        </div>
        <StyleSection bare editable />
      </section>

      <section aria-labelledby="memory-you" className="flex flex-col gap-3">
        <div className="flex flex-col gap-0.5">
          <h2 id="memory-you" className="text-sm font-medium">{t('О тебе')}</h2>
          <p className="text-xs text-muted-foreground">{t('Читают все подключённые агенты — с учётом области правила')}</p>
        </div>
        <MemoryColumn plain />
      </section>

      <section aria-labelledby="memory-readers" className="flex flex-col gap-3">
        <h2 id="memory-readers" className="text-sm font-medium">{t('Кто брал память')}</h2>
        {readers.length > 0 ? (<>
          <ul className="flex flex-col gap-1">
            {readers.map((call) => (
              <li key={`${call.client}·${call.project}`} className="flex items-baseline justify-between gap-3 rounded-control px-2 py-2 text-body">
                <span className="flex min-w-0 gap-1"><span className="max-w-[50%] truncate">{clientName(call.client)}</span><span className="shrink-0 text-muted-foreground">· {call.project}</span></span>
                <span className="shrink-0 text-xs text-muted-foreground">{ago(call.at)}</span>
              </li>
            ))}
          </ul>
          {!embedded && <ConnectAgent />}
        </>) : <Empty className="border border-dashed py-8">
          <EmptyHeader>
            <EmptyMedia variant="icon"><History /></EmptyMedia>
            <EmptyTitle>{t('Обращений пока нет')}</EmptyTitle>
            <EmptyDescription>{t('Когда подключённый агент — Claude Code или Codex — прочитает память, здесь будет видно кто и когда.')}</EmptyDescription>
          </EmptyHeader>
          {!embedded && <EmptyContent className="max-w-md"><ConnectAgent /></EmptyContent>}
        </Empty>}
      </section>
    </div>
  )
}
