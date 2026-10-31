import { useRef, useState } from 'react'
import { t } from '@/lib/i18n'
import { Loader2, Zap } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { notify } from '@/lib/notify'
import { cn } from '@/lib/utils'

// «Назвать за меня» (как у Fabric): иконка справа от названия, видна при наведении или фокусе (владелец 2026-10-03:
// плашкой под названием она закрывала описание и жалась случайно). Пока агент думает — спиннер, клик по нему отменяет
// (ответ сервера просто не применяется). Готовое название ставится сразу, в уведомлении — «Отменить»
// Кнопка агента как у Fabric («⚡ Name this for me», владелец 2026-10-03): таблетка с молнией и текстом. Одна на «Назвать» и «Переписать»
export const agentPill = 'h-7 gap-1.5 rounded-lg border-line px-2.5 text-xs font-normal whitespace-nowrap dark:border-line'
export const nameInline = 'absolute left-full top-1/2 ml-2 -translate-y-1/2 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100'

export function NameButton({ current, suggest, onName, className }: { current: string; suggest: () => Promise<string>; onName: (name: string) => void; className?: string }) {
  const [busy, setBusy] = useState(false)
  const run = useRef(0)
  const start = () => {
    const ticket = ++run.current
    setBusy(true)
    suggest()
      .then((next) => {
        if (run.current !== ticket) return
        onName(next)
        notify(t('Название: «{next}»', { next }), { undo: () => onName(current) })
      })
      .catch(() => { if (run.current === ticket) notify(t('Не получилось придумать название')) })
      .finally(() => { if (run.current === ticket) setBusy(false) })
  }
  const cancel = () => { run.current++; setBusy(false) }
  return (
    <Button type="button" variant="outline" size="xs" className={cn(agentPill, className, busy && 'opacity-100')} aria-label={busy ? t('Отменить — агент придумывает название') : undefined} onClick={busy ? cancel : start}>
      {busy ? <Loader2 className="animate-spin" /> : <Zap />}{busy ? t('Отменить') : t('Назвать за меня')}
    </Button>
  )
}
