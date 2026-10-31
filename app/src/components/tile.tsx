import type { ReactNode, Ref } from 'react'
import { motion } from 'framer-motion'
import { cn } from '@/lib/utils'
import { tileCaption, tileInset, tileRatio, tileSpring } from '@/lib/tile-grid'

// Один вид плитки на всё приложение: превью-квадрат с отступом, под ним подпись; рамки и фона нет, подложка — только при
// фокусе с клавиатуры (при наведении убрана владельцем, db7f9bf). Контент (LibraryWireframe) рисует плитку своей раскладкой, но берёт отсюда ту же подложку и те же числа
// (lib/tile-grid.ts); страницы-сетки (Spaces, Actions) — готовые компоненты ниже.
export const tileSurface = 'rounded-container border border-transparent transition-colors focus-visible:bg-muted/60'

// Превью и подпись — общее нутро плитки. Высота плитки = отступ + превью + подпись, как у раскладки контента
function TileBody({ preview, title, meta, centered }: { preview: ReactNode; title: ReactNode; meta?: ReactNode; centered?: boolean }) {
  return (
    <>
      <span className="relative block overflow-hidden rounded-surface" style={{ aspectRatio: tileRatio }}>{preview}</span>
      <span className={cn('flex w-full min-w-0 flex-col justify-center', centered && 'items-center text-center')} style={{ height: tileCaption }}>
        {/* Шрифт растёт с плиткой (cqw от ширины плитки, 10–14px): при зуме название не вылезает за подложку. Без второй строки (meta) — до двух строк, иначе одна с многоточием */}
        <span className={cn('max-w-full text-[clamp(0.625rem,12cqw,0.875rem)] leading-snug font-medium', meta ? 'truncate' : 'line-clamp-2 break-words')}>{title}</span>
        {meta && <span className="truncate caption">{meta}</span>}
      </span>
    </>
  )
}

type TileProps = { preview: ReactNode; title: ReactNode; meta?: ReactNode; className?: string; centered?: boolean }

// Плитка-кнопка: целиком нажимается (Spaces, «создать»). Контекстное меню и приём перетаскивания вешает вызывающий.
// layout="position": при смене числа колонок (зум колесом, ширина окна) плитка плавно переезжает, а не прыгает; размер не анимируется (внутри иконки и текст)
export function TileButton({ preview, title, meta, centered, over, onClick, buttonRef, className }: TileProps & { over?: boolean; onClick: () => void; buttonRef?: Ref<HTMLButtonElement> }) {
  return (
    <motion.button ref={buttonRef} layout="position" transition={tileSpring} type="button" role="listitem" onClick={onClick} style={{ padding: tileInset, paddingBottom: 0 }}
      className={cn('@container flex min-w-0 flex-col text-left outline-none focus-visible:ring-2 focus-visible:ring-ring', tileSurface, over && 'ring-2 ring-ring', className)}>
      <TileBody preview={preview} title={title} meta={meta} centered={centered} />
    </motion.button>
  )
}

// Плитка-блок: внутри свои кнопки (Actions: накладка «изменить» и «удалить» поверх). Кнопка в кнопке недопустима,
// поэтому корень — div; вызывающий кладёт в children абсолютно расположенные кнопки
export function TileBlock({ preview, title, meta, centered, className, children }: TileProps & { children?: ReactNode }) {
  return (
    <motion.div layout="position" transition={tileSpring} role="listitem" style={{ padding: tileInset, paddingBottom: 0 }} className={cn('@container group relative flex min-w-0 flex-col', tileSurface, className)}>
      <TileBody preview={preview} title={title} meta={meta} centered={centered} />
      {children}
    </motion.div>
  )
}
