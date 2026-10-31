import { ChevronDown, type LucideIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'

// Фильтр строкой над лентой (v2, каркас Fabric: «Any kind · Any tag»): кнопка показывает выбранное или «любой …»,
// внутри — «любой» и варианты со счётчиком . Повторный выбор того же снимает фильтр
export type FilterOption = { value: string; label: string; icon?: LucideIcon; count?: number }

export function FilterMenu({ any, icon: Icon, options, value, onChange }: {
  any: string; icon: LucideIcon; options: FilterOption[]; value: string | null; onChange: (value: string | null) => void
}) {
  const picked = options.find((item) => item.value === value)
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="glass" size="sm" className={picked ? 'bg-popover/90' : undefined}>
          {picked?.icon ? <picked.icon /> : <Icon />}{picked?.label ?? any}<ChevronDown className="opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-80 min-w-48">
        <DropdownMenuRadioGroup value={value ?? ''} onValueChange={(next) => onChange(next === value || next === '' ? null : next)}>
          <DropdownMenuRadioItem value="">{any}</DropdownMenuRadioItem>{options.length > 0 && <DropdownMenuSeparator />}
          {options.map((item) => (
            <DropdownMenuRadioItem key={item.value} value={item.value}>
              {item.icon && <item.icon />}{item.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
