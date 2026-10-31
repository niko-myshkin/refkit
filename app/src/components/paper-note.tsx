import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

// Заметка без картинки — карточка-превью (владелец 2026-10-13, вариант A «загнутый уголок»): заголовок и начало текста тем же шрифтом, что
// весь интерфейс, приглушённым цветом; строки обрезаются многоточием, без затухания. Что это заметка, говорит форма — срезанный верхний
// правый угол листа, без иконки и подписи. Размеры — токены text-note и text-note-body; поверхность и цвета — токены paper, загиб — secondary,
// вырез — настоящий (clip-path): у обёртки с заметкой фон прозрачный (has-[[data-note]]), иначе сквозь вырез виден её цвет и угол сливается с загибом. mini — полоска полки, ячейка набора, миниатюра; shelf — полка и сильное приближение в графе; tile — плитка мозаики.
export function PaperNote({ title, text, size, children }: { title: string; text?: string; size: 'mini' | 'shelf' | 'tile' | 'full'; children?: ReactNode }) {
  const mini = size === 'mini'
  // Корень — контейнер (@container): угол, поля и размеры текста считаются от его ширины в cqw; сами поля — на внутренней обёртке:
  // у самого контейнера cqw считается от родителя, а не от него
  return (
    <span data-note className="@container absolute inset-0 overflow-hidden text-left text-paper-foreground">
      {/* Лист с настоящим вырезом: сквозь угол просвечивает то, что за плиткой (фон, плашка выделения), а не залитый цветом треугольник */}
      <span aria-hidden className="absolute inset-0 bg-paper [clip-path:polygon(0_0,calc(100%-max(8.67cqw,0.5rem))_0,100%_max(8.67cqw,0.5rem),100%_100%,0_100%)]" />
      <span aria-hidden className="absolute right-0 top-0 size-[max(8.67cqw,0.5rem)] rounded-bl-[1.6cqw] bg-secondary [clip-path:polygon(0_0,0_100%,100%_100%)]" />
      <span className={cn('absolute inset-0 flex flex-col', mini ? 'gap-0.5 p-1' : size === 'shelf' ? 'gap-2 p-3' : 'gap-[clamp(0.5rem,3.33cqw,0.625rem)] p-[clamp(0.75rem,6.67cqw,1.25rem)]')}>
        <span className={cn('min-w-0 shrink-0 break-words font-medium', mini ? 'line-clamp-4 pr-[9cqw] text-note-mini' : size === 'shelf' ? 'line-clamp-3 pr-[9cqw] text-sm leading-snug' : 'line-clamp-2 pr-[9cqw] text-note')}>{title}</span>
        {/* Строк описания столько, сколько помещается: от трёх на узкой плитке до шести на широкой */}
        {text && size === 'full' ? <span className="nowheel nodrag min-h-0 flex-1 overflow-y-auto whitespace-pre-line break-words text-note-body text-paper-muted">{text}</span> : text && <span className={cn('min-h-0 overflow-hidden break-words text-paper-muted', size === 'shelf' ? 'line-clamp-3 text-xs leading-relaxed' : 'line-clamp-3 text-note-body @min-[200px]:line-clamp-4 @min-[250px]:line-clamp-5 @min-[290px]:line-clamp-6')}>{text}</span>}
        {children}
      </span>
    </span>
  )
}
