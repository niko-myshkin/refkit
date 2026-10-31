import type { ReactNode, Ref } from 'react'
import { TileButton } from '@/components/tile'

// Папка по умолчанию — своя заливка из токенов (цвет — currentColor, задаёт вызывающий), без чужих картинок.
export function FolderGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" aria-hidden className={className}>
      <path d="M6 16a5 5 0 0 1 5-5h13.5a5 5 0 0 1 3.5 1.5L32 16h21a5 5 0 0 1 5 5v5H6z" fill="currentColor" opacity=".45" />
      <rect x="6" y="22" width="52" height="31" rx="5" fill="currentColor" opacity=".8" />
    </svg>
  )
}

// Превью space: эмодзи владельца или заготовка (папка, лоток «Входящих», пины) в квадрате превью, без фона.
// Размеры — доли квадрата (эмодзи — в единицах контейнера cqw), чтобы иконка росла и уменьшалась вместе с плиткой при зуме колесом
export function SpaceGlyph({ emoji, fallback }: { emoji?: string; fallback: ReactNode }) {
  return (
    <span className="@container absolute inset-0 grid place-items-center text-muted-foreground">
      {emoji ? <span aria-hidden className="text-[40cqw] leading-none">{emoji}</span> : fallback}
    </span>
  )
}

// Плитка space на странице Spaces: та же плитка, что у контента, подпись по центру. Числа материалов нет — решение владельца
export function SpaceTile({ glyph, name, over, onClick, buttonRef, className }: {
  glyph: ReactNode; name: string; over?: boolean; onClick: () => void; buttonRef?: Ref<HTMLButtonElement>; className?: string
}) {
  return <TileButton buttonRef={buttonRef} over={over} onClick={onClick} preview={glyph} title={name} centered className={className} />
}
