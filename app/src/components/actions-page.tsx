import { useState } from 'react'
import { t } from '@/lib/i18n'
import { Plus, Trash2, Zap } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { CreateTile } from '@/components/create-tile'
import { TileBlock } from '@/components/tile'
import { tileGridStyle, tileMin } from '@/lib/tile-grid'
import { useTileScale } from '@/lib/tile-scale'
import { ActionDialog } from '@/components/actions-menu'
import { memoryChanged, useActions } from '@/components/agent-memory'
import { library, type ActionItem } from '@/lib/library'

// Страница Actions (v2): карточки в сетке, как материалы в папке. Клик — правка в окне, корзина — удалить,
// последняя плитка — «Новый Action». Агент на этой странице предлагает новые Actions по описанию
export function ActionsPage() {
  const actions = useActions()
  const [editing, setEditing] = useState<ActionItem | null>(null)
  const [creating, setCreating] = useState(false)
  const tileScale = useTileScale()
  return (
    <div className="flex flex-col gap-4 pb-24">
      <h2 className="pt-6 text-3xl font-semibold tracking-tight">{t('Действия')}</h2>
      <div style={tileGridStyle(tileMin * tileScale)} role="list" aria-label={t('Действия')}>
        {actions.map((item) => (
          // Та же плитка, что у Spaces и материалов: превью с иконкой, под ним «/название» и просьба
          <TileBlock key={item.id} title={`/${item.name || item.text}`} meta={item.text}
            preview={<span className="absolute inset-0 grid place-items-center text-muted-foreground"><Zap className="size-2/5 stroke-1" /></span>}>
            <button type="button" className="absolute inset-0 rounded-container" aria-label={t('Изменить действие {text}', { text: item.name || item.text })} onClick={() => setEditing(item)} />
            <Button variant="secondary" size="icon-sm" aria-label={t('Удалить действие {text}', { text: item.name || item.text })} className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
              onClick={() => void library.deleteAction(item.id).then(memoryChanged)}><Trash2 /></Button>
          </TileBlock>
        ))}
        <CreateTile icon={Plus} label={t('Новое действие')} onClick={() => setCreating(true)} />
      </div>
      <ActionDialog open={creating || editing !== null} item={editing ?? undefined} onClose={() => { setCreating(false); setEditing(null) }} />
    </div>
  )
}
