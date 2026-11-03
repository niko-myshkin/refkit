import type { ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'
import { t } from '@/lib/i18n'
import { Button } from '@/components/ui/button'
import { Island } from '@/components/ui/island'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuShortcut, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'

// Масштаб снизу справа — один на холст и на просмотр картинки (как у Magnific): проценты открывают меню, слева можно поставить свои кнопки
// (на холсте — миникарта). Свои пункты меню (вместить всё, к выбранному) — children.
export function ZoomIsland({ percent, onZoomIn, onZoomOut, onReset, leading, children }: {
  percent: number; onZoomIn: () => void; onZoomOut: () => void; onReset: () => void; leading?: ReactNode; children?: ReactNode
}) {
  return (
    <Island>
      {leading}
      <DropdownMenu>
        <DropdownMenuTrigger asChild><Button variant="ghost" size="lg" className="h-8 gap-1 px-2 text-xs tabular-nums" aria-label={t('Масштаб')}>{percent}%<ChevronDown /></Button></DropdownMenuTrigger>
        <DropdownMenuContent align="end" side="top" className="min-w-48">
          <DropdownMenuItem onSelect={onZoomIn}>{t('Приблизить')}<DropdownMenuShortcut>⌘ +</DropdownMenuShortcut></DropdownMenuItem>
          <DropdownMenuItem onSelect={onZoomOut}>{t('Отдалить')}<DropdownMenuShortcut>⌘ −</DropdownMenuShortcut></DropdownMenuItem>
          <DropdownMenuItem onSelect={onReset}>{t('Масштаб 100 %')}<DropdownMenuShortcut>⌘ 0</DropdownMenuShortcut></DropdownMenuItem>
          {children}
        </DropdownMenuContent>
      </DropdownMenu>
    </Island>
  )
}
