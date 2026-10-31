import { CornerDownRight } from 'lucide-react'
import { Item, ItemContent, ItemGroup, ItemMedia, ItemTitle } from '@/components/ui/item'

// Подсказки агенту — тихие строки со стрелкой ↳ слева, в тоне Claude (решение владельца, прожарка
// 01_strategy/grill-agent-hints.md): мелкий приглушённый текст, без заливки; при наведении текст темнеет.
// Длинный текст переносится — это строка, не кнопка. Один элемент на карточку и окно полки
export function SuggestionList({ items, label, disabled, onPick }: { items: string[]; label: string; disabled?: boolean; onPick: (text: string) => void }) {
  if (!items.length) return null
  return (
    <ItemGroup aria-label={label} className="w-full gap-0">
      {items.map((text) => (
        <Item key={text} asChild size="xs" className="cursor-pointer items-start gap-1.5 px-0 py-1 text-left text-muted-foreground hover:text-foreground disabled:pointer-events-none disabled:opacity-50">
          <button type="button" disabled={disabled} onClick={() => onPick(text)}>
            <ItemMedia className="mt-0.5"><CornerDownRight className="size-3.5" /></ItemMedia>
            <ItemContent><ItemTitle className="line-clamp-none text-xs font-normal text-inherit">{text}</ItemTitle></ItemContent>
          </button>
        </Item>
      ))}
    </ItemGroup>
  )
}
