import { useDragging } from '@/lib/drag-state'
import type { ReactNode } from 'react'
import { Island } from '@/components/ui/island'
import { useContentCenter } from '@/lib/use-content-center'

// Плавающая панель внизу по центру ОСНОВНОЙ области (центр — useContentCenter).
// Действия / выделение. Одна на экране: пока что-то выделено, на месте панели действий стоит панель выделения — их показывает
// вызывающий, слой общий (--z-toolbar)
export function FloatingBar({ label, children }: { label: string; children: ReactNode }) {
  const center = useContentCenter()
  if (useDragging()) return null // пока тащат плитку, панели не мешают
  return (
    <Island role="toolbar" aria-label={label} style={center === null ? undefined : { left: center }} className="fixed bottom-4 left-1/2 z-(--z-toolbar) -translate-x-1/2 text-sm text-popover-foreground">
      {children}
    </Island>
  )
}
