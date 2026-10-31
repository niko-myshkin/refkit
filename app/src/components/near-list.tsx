import { useEffect, useMemo, useState } from 'react'
import { t } from '@/lib/i18n'
import { fieldTitle } from '@/components/field-title'
import { FileText } from 'lucide-react'
import { derive, nearby } from '@/lib/graph-core.mjs'
import { library, type GraphState } from '@/lib/library'

// «Рядом» в карточке: материалы с общими понятиями из графа (grill-graph.md; «Похожее на это» — самое подтверждённое
// применение графа у других: mymind, Pinterest). Нет графа или соседей — строки нет совсем, экран не нагружаем.
// Граф читаем один раз на минуту и держим в модуле: карточки листают часто (←/→), каждый раз тянуть файл незачем
let cache: { at: number; state: GraphState } | undefined
async function readGraph() {
  if (cache && Date.now() - cache.at < 60_000) return cache.state
  const state = await library.graph()
  cache = { at: Date.now(), state }
  return state
}

export function NearList({ id, items, onOpen }: { id: string; items: Array<{ id: string; title: string; image: string }>; onOpen: (id: string) => void }) {
  const [state, setState] = useState<GraphState | undefined>(cache?.state)
  useEffect(() => { let alive = true; void readGraph().then((next) => { if (alive) setState(next) }).catch(() => {}); return () => { alive = false } }, [])
  const byId = useMemo(() => new Map(items.map((item) => [item.id, item])), [items])
  const near = useMemo(() => {
    if (!state) return []
    return nearby(derive(state.items, new Set(items.map((item) => item.id))), id, 5).filter((hit) => byId.has(hit.id))
  }, [state, id, items, byId])
  if (!near.length) return null
  return (
    <section className="flex flex-col gap-2">
      <h3 className={fieldTitle}>{t('Рядом')}</h3>
      <ul className="flex flex-col gap-1">
        {near.map((hit) => {
          const item = byId.get(hit.id)!
          return (
            <li key={hit.id}>
              <button type="button" className="flex w-full items-center gap-2 rounded-control p-1 text-left hover:bg-muted" onClick={() => onOpen(hit.id)}>
                <span className="grid size-8 shrink-0 place-items-center overflow-hidden rounded-control border bg-muted text-muted-foreground">{item.image ? <img src={item.image} alt="" className="size-full object-cover" /> : <FileText className="size-4" />}</span>
                <span className="min-w-0 flex-1"><span className="block truncate text-sm">{item.title}</span><span className="caption block truncate">{hit.via.slice(0, 2).join(' · ')}</span></span>
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
