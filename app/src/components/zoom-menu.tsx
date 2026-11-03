import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { t } from '@/lib/i18n'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuShortcut, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'

// Меню масштаба по образцу Figma: в кнопке только проценты; сверху поле — ввёл число и Enter; ниже действия с сочетаниями
export function ZoomMenu({ scale, onZoom, onStep }: { scale: number; onZoom: (zoom: number | null) => void; onStep: (step: number) => void }) {
  const percent = Math.round(scale * 100)
  const [draft, setDraft] = useState('')
  return (
    <DropdownMenu onOpenChange={(open) => { if (open) setDraft(`${percent}%`) }}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="sm" className="gap-1 tabular-nums text-muted-foreground" aria-label={t('Масштаб {percent}%', { percent })}>{percent}%<ChevronDown className="opacity-60" /></Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="center" className="w-56" onEscapeKeyDown={(event) => event.stopPropagation()}>
        <div className="p-1">
          <Input aria-label={t('Масштаб в процентах')} value={draft} autoFocus onFocus={(event) => event.currentTarget.select()}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              event.stopPropagation() // буквы и цифры — в поле, а не в навигацию меню
              if (event.key !== 'Enter') return
              const value = Number.parseFloat(draft.replace(',', '.'))
              if (value > 0) onZoom(Math.min(8, Math.max(0.1, value / 100)))
              setDraft(`${Math.round(value > 0 ? Math.min(800, Math.max(10, value)) : percent)}%`)
            }} className="h-8 tabular-nums" />
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={(event) => { event.preventDefault(); onStep(1.25) }}>{t('Приблизить')}<DropdownMenuShortcut>⌘+</DropdownMenuShortcut></DropdownMenuItem>
        <DropdownMenuItem onSelect={(event) => { event.preventDefault(); onStep(0.8) }}>{t('Отдалить')}<DropdownMenuShortcut>⌘−</DropdownMenuShortcut></DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onZoom(null)}>{t('Вписать')}<DropdownMenuShortcut>⇧1</DropdownMenuShortcut></DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onZoom(0.5)}>50%</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onZoom(1)}>100%<DropdownMenuShortcut>⌘0</DropdownMenuShortcut></DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onZoom(2)}>200%</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
