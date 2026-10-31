import { useEffect, useState } from 'react'
import { form, t } from '@/lib/i18n'
import Markdown, { defaultUrlTransform } from 'react-markdown'
import remarkBreaks from 'remark-breaks'
import { Check, ChevronDown, ChevronRight, Copy, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
import type { Usage } from '@/lib/library'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'

// Копировать — иконка без подписи; после нажатия на секунду ✓, как в Claude
// Иконка-кнопка с подсказкой, как «Copy response» в ChatGPT: значок без подписи, но по наведению — что именно делает (стеклянная подсказка)
function ActionIcon({ label, onClick, compact, children }: { label: string; onClick: () => void; compact?: boolean; children: React.ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild><Button variant="ghost" size={compact ? 'icon-xs' : 'icon-sm'} aria-label={label} onClick={onClick}>{children}</Button></TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}

export function CopyButton({ text, label, compact }: { text: string; label: string; compact?: boolean }) {
  const [copied, setCopied] = useState(false)
  const copy = () => { void navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1000) }
  return <ActionIcon label={copied ? t('Скопировано') : label} onClick={copy} compact={compact}>{copied ? <Check /> : <Copy />}</ActionIcon>
}

// Ответ → заметка (идея 58): значок рядом с «Копировать»; после — галочка и «Сохранено во Входящих», заметка уже в библиотеке
export function SaveNoteButton({ onSave }: { onSave: () => Promise<unknown> }) {
  const [saved, setSaved] = useState(false)
  const save = () => { if (saved) return; void onSave().then(() => { setSaved(true); setTimeout(() => setSaved(false), 2500) }) }
  return <ActionIcon label={saved ? t('Добавлено') : t('В заметки')} onClick={save}>{saved ? <Check /> : <Plus />}</ActionIcon>
}

// Окно кода: сверху язык и «копировать», ниже код с подсветкой Shiki — тема на переменных, цвета из токенов (index.css), тихо.
// Длиннее 12 строк — свёрнут с затуханием, под ним «Ещё N строк» (решение владельца, как в Cursor): лента не тонет в коде
const foldAfter = 12
const linesWord = (n: number) => form(n) === 'one' ? t('строка') : form(n) === 'few' ? t('строки') : t('строк')
function CodeBlock({ language, code }: { language: string; code: string }) {
  const [html, setHtml] = useState('')
  const [open, setOpen] = useState(false)
  useEffect(() => {
    let alive = true
    // Shiki грузим при первом блоке кода, язык — по требованию; незнакомый язык — остаётся без подсветки
    import('shiki').then(({ codeToHtml, createCssVariablesTheme }) => codeToHtml(code, { lang: language || 'text', theme: createCssVariablesTheme({ name: 'refkit', variablePrefix: '--code-' }) }))
      .then((result) => { if (alive) setHtml(result) }).catch(() => {})
    return () => { alive = false }
  }, [code, language])
  const lines = code.split('\n').length
  const folded = lines > foldAfter && !open
  return (
    <div className="my-3 overflow-hidden rounded-surface border bg-muted/50 first:mt-0 last:mb-0">
      <div className="flex h-8 items-center justify-between border-b pl-3 pr-1 caption">
        {language || t('текст')}
        <CopyButton text={code} label={t('Копировать код')} compact />
      </div>
      <div className="relative">
        {/* Прокрутка вбок — ScrollArea из shadcn: тонкая полоса в тон, не системная. Свёрнут — высота у самой ScrollArea,
            чтобы полоса была внизу видимой части (вертикальная полоса shadcn и прокрутка вниз — выключены: свёрнутое раскрывается кнопкой) */}
        <ScrollArea className={cn('[&>[data-slot=scroll-area-viewport]>div]:!block [&>[data-orientation=vertical]]:hidden [&>[data-slot=scroll-area-viewport]]:!overflow-y-hidden', folded && 'h-60')}>
          {html
            ? <div className="code-highlight p-3 font-mono text-xs leading-relaxed" dangerouslySetInnerHTML={{ __html: html }} />
            : <pre className="p-3 font-mono text-xs leading-relaxed"><code>{code}</code></pre>}
          <ScrollBar orientation="horizontal" />
        </ScrollArea>
        {folded && <div className="pointer-events-none absolute inset-x-0 bottom-2.5 h-16 bg-gradient-to-t from-muted to-transparent" />}
      </div>
      {lines > foldAfter && (
        <Button variant="ghost" size="xs" className="w-full rounded-none border-t caption" onClick={() => setOpen(!open)}>
          <ChevronDown className={cn('transition-transform', open && 'rotate-180')} />{open ? t('Свернуть') : t('Ещё {foldAfter} {foldAfter2}', { foldAfter: lines - foldAfter, foldAfter2: linesWord(lines - foldAfter) })}
        </Button>
      )}
    </div>
  )
}

// Ответ агента — markdown нашими стилями: абзацы с отступом, списки с маркерами, подзаголовок полужирным.
// Одиночный перенос — перенос (remark-breaks): старые ответы простым текстом не слипаются.
// Ссылка card:<id> — карточка библиотеки: onCard открывает её; где открыть нечем — остаётся просто текстом
export function AgentAnswer({ text, onCard }: { text: string; onCard?: (id: string) => void }) {
  return (
    <div className="text-body" data-text>
      <Markdown
        remarkPlugins={[remarkBreaks]}
        // По умолчанию Markdown вычищает незнакомые схемы ссылок — card: пропускаем
        urlTransform={(url) => url.startsWith('card:') ? url : defaultUrlTransform(url)}
        components={{
          p: ({ children }) => <p className="my-4 first:mt-0 last:mb-0">{children}</p>,
          ul: ({ children }) => <ul className="my-4 list-disc space-y-2.5 pl-5 first:mt-0 last:mb-0">{children}</ul>,
          ol: ({ children }) => <ol className="my-4 list-decimal space-y-2.5 pl-5 first:mt-0 last:mb-0">{children}</ol>,
          h1: ({ children }) => <h3 className="mb-2 mt-5 font-semibold first:mt-0">{children}</h3>,
          h2: ({ children }) => <h3 className="mb-2 mt-5 font-semibold first:mt-0">{children}</h3>,
          h3: ({ children }) => <h3 className="mb-2 mt-5 font-semibold first:mt-0">{children}</h3>,
          a: ({ children, href }) => href?.startsWith('card:')
            // ссылкой, а не кнопкой: кнопка в Chrome всегда inline-block и рвёт строку длинным названием
            ? onCard ? <a href={`#${href.slice(5)}`} className="underline decoration-muted-foreground/60 underline-offset-2 hover:decoration-foreground" onClick={(event) => { event.preventDefault(); onCard(href.slice(5)) }}>{children}</a> : <>{children}</>
            : <a href={href} target="_blank" rel="noreferrer" className="underline underline-offset-2">{children}</a>,
          // Блок кода: react-markdown отдаёт pre > code с классом language-*; строчный код — просто code
          pre: ({ children }) => <>{children}</>,
          code: ({ className, children }) => {
            const language = /language-(\w+)/.exec(className ?? '')?.[1]
            const code = String(children).replace(/\n$/, '')
            return language || code.includes('\n')
              ? <CodeBlock language={language ?? ''} code={code} />
              : <code className="rounded-sm bg-muted px-1 py-0.5 font-mono text-xs">{children}</code>
          },
        }}
      >{text}</Markdown>
    </div>
  )
}

// «Работал 39 с ›» между вопросом и ответом, как «Worked for 39s ›» в Codex: тонкая строка с линией; по клику — что делал (подумал, посмотрел)
// и модель · токены. Сюда переехал расход, который раньше стоял серой строкой под ответом. Нечего показать — строки нет
export function WorkedFor({ steps, usage, model }: { steps?: { thought: number; looked: number }; usage?: Usage[]; model?: string }) {
  const seconds = usage?.reduce((sum, run) => sum + run.seconds, 0) ?? 0
  const items = [
    steps && steps.thought >= 1 && t('Подумал {thought} с', { thought: steps.thought }),
    steps && steps.looked > 0 && (steps.looked > 1 ? t('Посмотрел картинку ×{looked}', { looked: steps.looked }) : t('Посмотрел картинку')),
    usage?.length && t('{model} · {output} тыс. токенов', { model: model ?? usage[0].model, output: Math.max(1, Math.round(usage.reduce((sum, run) => sum + run.input + run.output, 0) / 1000)) }),
  ].filter(Boolean) as string[]
  if (!items.length) return null
  return (
    <Collapsible className="border-b border-foreground/10 pb-2">
      <CollapsibleTrigger className="group flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        {seconds > 0 ? t('Работал {seconds} с', { seconds }) : items[0]}<ChevronRight className="size-3.5 transition-transform group-data-[state=open]:rotate-90" />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <ul className="mt-2 space-y-1 caption">{items.map((item) => <li key={item}>{item}</li>)}</ul>
      </CollapsibleContent>
    </Collapsible>
  )
}

