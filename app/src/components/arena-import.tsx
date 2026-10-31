import { useState } from 'react'
import { t } from '@/lib/i18n'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { library } from '@/lib/library'

// Импорт из Are.na (идея 60): ссылка на публичный канал → сколько найдётся → «Импортировать».
// Каждый материал проходит обычную раскладку, поэтому сначала число, потом решение
export function ArenaImport({ link }: { link?: string }) {
  // link — канал уже вставлен в окно «Добавить»: своё поле не нужно
  const [typed, setChannel] = useState('')
  const channel = link ?? typed
  const [state, setState] = useState<{ checking?: boolean; error?: string; title?: string; fresh?: number; started?: boolean }>({})
  const check = async () => {
    if (!channel.trim()) return
    setState({ checking: true })
    try { const result = await library.arenaCheck(channel.trim()); setState({ title: result.title, fresh: result.fresh }) }
    catch (error) { setState({ error: (error as Error).message }) }
  }
  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        {link === undefined ? <Input value={channel} aria-label={t('Ссылка на канал Are.na')} placeholder={t('are.na/канал')}
          onChange={(event) => { setChannel(event.target.value); setState({}) }} onKeyDown={(event) => { if (event.key === 'Enter') void check() }} /> : <span className="min-w-0 flex-1 self-center text-sm text-muted-foreground">{t('Это канал Are.na — проверим, сколько в нём нового?')}</span>}
        <Button size="sm" variant="secondary" disabled={!channel.trim() || state.checking} onClick={() => void check()}>{state.checking ? <Loader2 className="animate-spin" /> : t('Проверить')}</Button>
      </div>
      {state.error && <p className="text-xs text-destructive">{state.error}</p>}
      {state.fresh !== undefined && !state.started && (
        <div className="flex items-center gap-2 text-xs">
          <span className="min-w-0 flex-1 text-muted-foreground">«{state.title}»: {state.fresh ? t('новых — {fresh}', { fresh: state.fresh }) : t('всё уже в библиотеке')}</span>
          {state.fresh > 0 && <Button size="xs" onClick={() => void library.arenaImport(channel.trim()).then(() => setState((old) => ({ ...old, started: true })))}>{t('Импортировать')}</Button>}
        </div>
      )}
      {state.started && <p className="caption">{t('Импорт идёт: материалы появятся в ленте по одному.')}</p>}
    </div>
  )
}
