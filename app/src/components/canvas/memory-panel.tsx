import { useEffect, useState } from 'react'
import { BookmarkPlus, Pin, Plus, X } from 'lucide-react'
import { t } from '@/lib/i18n'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { library, type CanvasMemory } from '@/lib/library'

// Память холста (2026-10-29, по Doop): образцы, правила и журнал решений. Видна агенту только на этом холсте.
// Образец — закреплённая нода (кнопка «Закрепить» берёт выбранные на холсте); правило — строка, которую агент читает перед работой;
// решения копятся сами из правок владельца. Общая память о владельце живёт в Settings
export function MemoryPanel({ canvasId, selected, onFocus }: { canvasId: string; selected: string[]; onFocus: (nodeId: string) => void }) {
  const [memory, setMemory] = useState<CanvasMemory | null>(null)
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState('')
  const act = (body: Parameters<typeof library.canvasMemory>[1]) => library.canvasMemory(canvasId, body).then(setMemory).catch(() => {})
  useEffect(() => { void act({ op: 'get' }) }, [canvasId]) // eslint-disable-line react-hooks/exhaustive-deps
  const pinned = new Set(memory?.refs.map((ref) => ref.node))
  const toPin = selected.filter((id) => !pinned.has(id))
  const submit = () => { const text = draft.trim(); if (text) void act({ op: 'rule-add', text }); setDraft(''); setAdding(false) }
  const label = 'text-xs font-medium uppercase tracking-wide text-muted-foreground'
  const empty = 'px-1 text-sm text-muted-foreground'
  return (
    <div className="nowheel flex min-h-0 flex-1 flex-col gap-6 overflow-auto px-1 pt-2 pb-4" role="region" aria-label={t('Память холста')}>
      <section className="flex flex-col gap-2" aria-label={t('Образцы')}>
        <div className="flex items-center justify-between px-1">
          <h3 className={label}>{t('Образцы')}</h3>
          <Button variant="ghost" size="xs" disabled={!toPin.length} onClick={() => toPin.forEach((node) => void act({ op: 'ref-add', node }))}><Pin />{t('Закрепить')}</Button>
        </div>
        {memory?.refs.length ? (
          <ul className="flex flex-col">
            {memory.refs.map((ref) => (
              <li key={ref.node} className="group/m flex items-center gap-2 rounded-md px-1 hover:bg-muted/60">
                <button type="button" className="min-w-0 flex-1 truncate py-1.5 text-left text-sm" onClick={() => onFocus(ref.node)}>{ref.title}</button>
                <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon-xs" className="opacity-0 group-hover/m:opacity-100 focus-visible:opacity-100" aria-label={t('Открепить')} onClick={() => void act({ op: 'ref-remove', node: ref.node })}><X /></Button></TooltipTrigger><TooltipContent>{t('Открепить')}</TooltipContent></Tooltip>
              </li>
            ))}
          </ul>
        ) : <p className={empty}>{t('Выбери ноду на холсте и закрепи её: агент возьмёт из неё цвета, шрифты и раскладку.')}</p>}
      </section>
      <section className="flex flex-col gap-2" aria-label={t('Правила')}>
        <div className="flex items-center justify-between px-1">
          <h3 className={label}>{t('Правила')}</h3>
          <Button variant="ghost" size="xs" onClick={() => setAdding(true)}><Plus />{t('Добавить')}</Button>
        </div>
        {adding && <Input autoFocus aria-label={t('Новое правило')} value={draft} onChange={(event) => setDraft(event.target.value)} onBlur={submit}
          onKeyDown={(event) => { if (event.key === 'Enter') submit(); if (event.key === 'Escape') { setDraft(''); setAdding(false) } }} />}
        {memory?.rules.length ? (
          <ul className="flex flex-col">
            {memory.rules.map((rule) => (
              <li key={rule.id} className="group/m flex items-start gap-2 rounded-md px-1 hover:bg-muted/60">
                <span className="min-w-0 flex-1 py-1.5 text-sm leading-snug break-words">{rule.text}</span>
                <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon-xs" className="mt-1 opacity-0 group-hover/m:opacity-100 focus-visible:opacity-100" aria-label={t('Удалить правило')} onClick={() => void act({ op: 'rule-remove', id: rule.id })}><X /></Button></TooltipTrigger><TooltipContent>{t('Удалить правило')}</TooltipContent></Tooltip>
              </li>
            ))}
          </ul>
        ) : !adding && <p className={empty}>{t('Правила стиля, которые агент читает перед работой на этом холсте.')}</p>}
      </section>
      <section className="flex flex-col gap-2" aria-label={t('Решения')}>
        <h3 className={`${label} px-1`}>{t('Решения')}</h3>
        {memory?.decisions.length ? (
          <ul className="flex flex-col">
            {memory.decisions.slice(0, 30).map((item) => (
              <li key={item.id} className="group/m flex items-start gap-2 rounded-md px-1 hover:bg-muted/60">
                <span className="flex min-w-0 flex-1 flex-col py-1.5">
                  <span className="text-sm leading-snug break-words">{item.text}</span>
                  <span className="text-xs text-muted-foreground">{new Date(item.at).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                </span>
                {!memory.rules.some((rule) => rule.text === item.text) && <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon-xs" className="mt-1 opacity-0 group-hover/m:opacity-100 focus-visible:opacity-100" aria-label={t('Запомнить как правило')} onClick={() => void act({ op: 'rule-add', text: item.text })}><BookmarkPlus /></Button></TooltipTrigger><TooltipContent>{t('Запомнить как правило')}</TooltipContent></Tooltip>}
                <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon-xs" className="mt-1 opacity-0 group-hover/m:opacity-100 focus-visible:opacity-100" aria-label={t('Убрать из журнала')} onClick={() => void act({ op: 'decision-remove', id: item.id })}><X /></Button></TooltipTrigger><TooltipContent>{t('Убрать из журнала')}</TooltipContent></Tooltip>
              </li>
            ))}
          </ul>
        ) : <p className={empty}>{t('Здесь копятся твои правки на этом холсте.')}</p>}
      </section>
    </div>
  )
}
