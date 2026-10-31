import type { ComponentProps } from 'react'
import { cn } from '@/lib/utils'

// Остров (план 01_strategy/islands-plan-2026-10-29.md): плавающая панель поверх холста. Одна поверхность и одно скругление (14) на все:
// название, действия, инструменты, масштаб. Сам остров ловит клики (pointer-events-auto), а слой, в котором он лежит, их пропускает сквозь себя
export function Island({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('pointer-events-auto flex items-center gap-1 rounded-container bg-card p-1 shadow-lg ring-1 ring-foreground/10', className)} {...props} />
}
