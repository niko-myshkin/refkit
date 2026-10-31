import type { LucideIcon } from 'lucide-react'
import { t } from '@/lib/i18n'
import { X } from 'lucide-react'
import { Toggle } from '@/components/ui/toggle'

// Чип тега или подборки — один элемент на всё приложение (решение владельца: всё собирается из одних и тех же деталей).
// Крупная «таблетка» с заливкой, как в mymind; у включённого справа выезжает × — чип шире, соседи отъезжают.
// Над лентой — фильтр (ToggleGroupItem с этими классами), в карточке — всегда включён, нажатие убирает подборку.
export const chipClassName = "group/chip h-8 gap-2 rounded-lg bg-muted/50 px-3 text-sm font-medium text-muted-foreground transition-[background-color,color] hover:bg-muted hover:text-foreground data-[state=on]:bg-muted data-[state=on]:pr-2 data-[state=on]:text-foreground [&_svg:not([class*='size-'])]:size-4"

export function ChipClose() {
  return (
    <span aria-hidden className="grid max-w-0 place-items-center overflow-hidden rounded-lg bg-background/60 opacity-0 transition-[max-width,opacity,margin] duration-200 ease-out group-data-[state=on]/chip:ml-0.5 group-data-[state=on]/chip:max-w-6 group-data-[state=on]/chip:opacity-100">
      <X className="m-1 size-3.5" />
    </span>
  )
}

// Подборка в карточке: включённый чип; нажал — подборка снята
// size sm — на плитке ленты: та же таблетка, ниже и мельче
export function CollectionChip({ icon: Icon, name, onRemove, size = 'default' }: { icon: LucideIcon; name: string; onRemove: () => void; size?: 'default' | 'sm' }) {
  return (
    <Toggle pressed onPressedChange={onRemove} aria-label={t('Убрать «{name}»', { name })} className={size === 'sm' ? `${chipClassName} h-8 gap-1.5 px-3 text-xs` : chipClassName}>
      <Icon />{name}<ChipClose />
    </Toggle>
  )
}
