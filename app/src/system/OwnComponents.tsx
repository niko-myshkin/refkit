import { useState } from 'react'
import { FolderPlus, MessageCircle, Plus, Search, Zap } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { CommentFeed, type CardComment } from '@/components/comment-feed'
import { CreateTile } from '@/components/create-tile'
import { FolderGlyph, SpaceGlyph, SpaceTile } from '@/components/space-tile'
import { TileBlock } from '@/components/tile'
import { spaceTileMin, tileGridStyle } from '@/lib/tile-grid'
import { Group, Section } from './Section'

// Настоящие компоненты из components/, не копии: поправил компонент — страница показывает правку.
export default function OwnComponents() {
  // Образец ленты живёт в локальном состоянии: на сервер не пишет
  const [comments, setComments] = useState<CardComment[]>([{ id: 'c0', text: 'разобрать приёмы и научиться делать такие же анимации у нас', at: Date.now() - 86_400_000 }])
  return (
    <Section id="own" title="Свои компоненты" hint="Собраны из токенов и shadcn там, где готового компонента в shadcn нет.">
      <Group title="Плитка — tile.tsx: превью-квадрат, подпись под ним; фон только при наведении (одна на контент, Spaces и Actions)">
        <div className="max-w-3xl" style={tileGridStyle(spaceTileMin)}>
          <SpaceTile glyph={<SpaceGlyph fallback={<FolderGlyph className="w-1/2" />} />} name="Design" onClick={() => {}} />
          <SpaceTile glyph={<SpaceGlyph emoji="🎵" fallback={null} />} name="Music" onClick={() => {}} />
          <TileBlock title="/Суть" meta="Коротко: в чём суть — 3 пункта"
            preview={<span className="absolute inset-0 grid place-items-center text-muted-foreground"><Zap className="size-2/5 stroke-1" /></span>} />
        </div>
      </Group>

      <Group title="Лента комментариев — comment-feed.tsx (Enter сохраняет, Shift+Enter — перенос; здесь на сервер не пишет)">
        <div className="max-w-sm">
          <CommentFeed comments={comments}
            onAdd={(text) => setComments((list) => [...list, { id: `c${Date.now()}`, text, at: Date.now() }])}
            onEdit={(id, text) => setComments((list) => list.map((item) => item.id === id ? { ...item, text, editedAt: Date.now() } : item))}
            onRemove={(id) => setComments((list) => list.filter((item) => item.id !== id))} />
        </div>
      </Group>

      <Group title="Плитка «создать» — create-tile.tsx">
        <div className="max-w-xs">
          <CreateTile icon={FolderPlus} label="Новая папка" onClick={() => {}} />
        </div>
      </Group>

      <Group title="Плавающая панель — floating-bar.tsx (здесь в потоке страницы, в приложении закреплена внизу по центру)">
        <div role="toolbar" aria-label="Образец панели" className="flex w-fit items-center gap-1 rounded-container border bg-popover p-1 text-sm text-popover-foreground shadow-lg">
          <Button variant="ghost" size="icon" aria-label="Добавить"><Plus /></Button>
          <Button variant="ghost" size="icon" aria-label="Найти"><Search /></Button>
          <Button variant="ghost" size="icon" aria-label="Агент"><MessageCircle /></Button>
        </div>
      </Group>
    </Section>
  )
}
