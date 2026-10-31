import { useEffect, useState } from 'react'
import { t } from '@/lib/i18n'
import { AnimatePresence, motion } from 'framer-motion'
import { Trash2, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

// Удаление с подтверждением на месте, без окна (по мотивам Delete button из Rare UI, собрано на Button shadcn):
// первый клик по корзине — она краснеет, слева выезжает ✕; второй клик по корзине удаляет. Escape или ✕ отменяют.
export function DeleteButton({ onConfirm, label = t('Удалить'), className }: { onConfirm: () => void; label?: string; className?: string }) {
  const [asking, setAsking] = useState(false)
  useEffect(() => {
    if (!asking) return
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') { event.stopPropagation(); setAsking(false) } }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [asking])

  return (
    <div className={cn('flex items-center gap-1 rounded-control', asking && 'bg-secondary', className)} onClick={(event) => event.stopPropagation()}>
      <AnimatePresence initial={false}>
        {asking && (
          <motion.div className="flex" initial={{ opacity: 0, width: 0 }} animate={{ opacity: 1, width: 'auto' }} exit={{ opacity: 0, width: 0 }} transition={{ duration: 0.15, ease: 'easeOut' }}>
            <Button variant="ghost" size="icon-sm" aria-label={t('Не удалять')} onClick={() => setAsking(false)}><X /></Button>
          </motion.div>
        )}
      </AnimatePresence>
      <Button
        variant={asking ? 'destructive' : 'secondary'} size="icon-sm" aria-label={asking ? t('Нажмите ещё раз, чтобы удалить') : label}
        onClick={() => { if (asking) { setAsking(false); onConfirm() } else setAsking(true) }}
      >
        <motion.span className="grid place-items-center" animate={{ rotate: asking ? -12 : 0, y: asking ? -1 : 0 }} transition={{ type: 'spring', stiffness: 500, damping: 20 }}><Trash2 /></motion.span>
      </Button>
    </div>
  )
}
