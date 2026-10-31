import { useState } from 'react'
import { t } from '@/lib/i18n'
import { EllipsisVertical, Pencil, Plus, Search, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group'

// Страница «Теги» (как у Fabric): по алфавиту с буквами-разделителями, фильтр, «Новый тег»; клик — материалы с тегом,
// «⋮» — переименовать (по месту) или удалить из словаря
export function TagsPage({ tags, onOpen, onCreate, onRename, onDelete }: {
  tags: Array<{ name: string; count: number }>; onOpen: (name: string) => void; onCreate: (name: string) => Promise<void>
  onRename: (from: string, to: string) => void; onDelete: (name: string) => void
}) {
  const [filter, setFilter] = useState('')
  const [renaming, setRenaming] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const query = filter.trim().toLowerCase()
  const shown = tags.filter((tag) => tag.name.toLowerCase().includes(query)).sort((a, b) => a.name.localeCompare(b.name, 'ru'))
  const letters = [...new Set(shown.map((tag) => tag.name[0].toUpperCase()))]
  const exists = tags.some((tag) => tag.name.toLowerCase() === query)
  const finish = () => { const to = draft.trim(); if (renaming && to && to !== renaming) onRename(renaming, to); setRenaming(null) }
  return (
    <div className="flex flex-col gap-6 pt-2 pb-6">
      <div className="flex items-center gap-2">
        <InputGroup className="w-64">
          <InputGroupAddon><Search /></InputGroupAddon>
          <InputGroupInput aria-label={t('Найти тег')} value={filter} onChange={(event) => setFilter(event.target.value)} />
        </InputGroup>
        {/* Новый тег — из того, что набрано в фильтре */}
        <Button disabled={!query || exists} onClick={() => void onCreate(filter.trim()).then(() => setFilter(''))}><Plus />{t('Новый тег')}</Button>
      </div>
      {letters.map((letter) => (
        <section key={letter} className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold text-muted-foreground">{letter}</h3>
          <div className="flex flex-wrap gap-2">
            {shown.filter((tag) => tag.name[0].toUpperCase() === letter).map((tag) => renaming === tag.name ? (
              <Input key={tag.name} autoFocus aria-label={t('Новое название тега')} value={draft} className="w-48" onChange={(event) => setDraft(event.target.value)} onBlur={finish}
                onFocus={(event) => event.currentTarget.select()} onKeyDown={(event) => { if (event.key === 'Enter') finish(); if (event.key === 'Escape') setRenaming(null) }} />
            ) : (
              <span key={tag.name} className="flex items-center rounded-control bg-muted/60">
                <button type="button" className="flex items-center gap-2 rounded-control py-2 pl-3 text-sm hover:text-foreground" onClick={() => onOpen(tag.name)}>
                  {tag.name}
                </button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild><Button variant="ghost" size="icon-sm" aria-label={t('Действия с тегом {name}', { name: tag.name })}><EllipsisVertical /></Button></DropdownMenuTrigger>
                  <DropdownMenuContent align="start">
                    <DropdownMenuItem onSelect={() => { setDraft(tag.name); setRenaming(tag.name) }}><Pencil />{t('Переименовать')}</DropdownMenuItem>
                    <DropdownMenuItem variant="destructive" onSelect={() => onDelete(tag.name)}><Trash2 />{t('Удалить тег')}</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </span>
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}
