import { useEffect, useState } from 'react'
import { TooltipProvider } from '@/components/ui/tooltip'
import { CanvasThumb } from '@/components/canvas-thumb'
import type { CanvasItem } from '@/components/canvas/nodes'
import { library } from '@/lib/library'

// Страница для съёмки превью холста: «?thumb=<id>». Её открывает сервер в headless Chrome (library-plugin.ts, scheduleThumb) —
// только мини-холст на весь экран, без интерфейса. Тот же CanvasThumb, что был на плитке, поэтому экраны в iframe рисуются как на доске
export function ThumbPage({ id }: { id: string }) {
  const [items, setItems] = useState<CanvasItem[]>([])
  useEffect(() => { void library.list<CanvasItem>().then(setItems).catch(() => {}) }, [])
  return (
    <TooltipProvider>
      <div className="fixed inset-0 bg-card"><CanvasThumb id={id} items={items} /></div>
    </TooltipProvider>
  )
}
