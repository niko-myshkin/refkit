import { useState } from 'react'
import { t } from '@/lib/i18n'
import { FileText, RotateCcw, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Empty, EmptyHeader, EmptyMedia, EmptyTitle } from '@/components/ui/empty'

export type TrashItem = { id: string; title: string; image?: string; ratio?: string; kind?: string; description?: string; trashName: string; deletedAt: number }

// Корзина (решение владельца): удалённые карточки — плитками, как на главной; «Вернуть» при наведении.
// Очищается только вручную: «Очистить корзину» в два нажатия, как «Удалить» в карточке
export function TrashView({ items, onRestore, onEmpty }: { items: TrashItem[]; onRestore: (name: string) => void; onEmpty: () => void }) {
  const [confirming, setConfirming] = useState(false)
  if (!items.length) return <Empty><EmptyHeader><EmptyMedia variant="icon"><Trash2 /></EmptyMedia><EmptyTitle>{t('Корзина пуста')}</EmptyTitle></EmptyHeader></Empty>
  return (
    <div className="flex flex-col gap-4 pt-4">
      <div className="flex justify-end">
        <Button variant={confirming ? 'destructive' : 'ghost'} size="sm" onClick={() => { if (confirming) { onEmpty(); setConfirming(false) } else setConfirming(true) }} onBlur={() => setConfirming(false)}>
          <Trash2 />{confirming ? t('Нажмите ещё раз — удалить насовсем') : t('Очистить корзину')}
        </Button>
      </div>
      <div className="columns-2 gap-3 lg:columns-3 xl:columns-4" role="list" aria-label={t('Корзина')}>
        {items.map((item) => (
          <div key={item.trashName} role="listitem" className="group relative mb-3 break-inside-avoid overflow-hidden rounded-surface" style={item.image ? { aspectRatio: item.ratio || '4 / 3' } : undefined}>
            {item.image
              ? <img src={item.image} alt={item.title} className="absolute inset-0 h-full w-full object-cover opacity-70" />
              : <div className="flex flex-col gap-2 border bg-card p-4 pt-10"><FileText className="size-4 text-muted-foreground" /><span className="line-clamp-2 text-sm font-medium">{item.title}</span>{item.description && <span className="line-clamp-3 caption">{item.description}</span>}</div>}
            {item.image && <span className="absolute inset-x-0 top-0 line-clamp-2 bg-gradient-to-b from-black/60 to-transparent p-2 text-xs text-white opacity-0 transition-opacity group-hover:opacity-100">{item.title}</span>}
            <Button variant="secondary" size="xs" className="absolute bottom-2 right-2 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100" aria-label={t('Вернуть «{title}»', { title: item.title })} onClick={() => onRestore(item.trashName)}>
              <RotateCcw />{t('Вернуть')}
            </Button>
          </div>
        ))}
      </div>
    </div>
  )
}
