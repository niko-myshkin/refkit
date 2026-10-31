import type { LucideIcon } from 'lucide-react'
import { TileButton } from '@/components/tile'

// Плитка «создать» в конце сетки (Spaces, Actions): та же плитка, превью — пунктирный квадрат с иконкой.
export function CreateTile({ icon: Icon, label, centered, onClick }: { icon: LucideIcon; label: string; centered?: boolean; onClick: () => void }) {
  return (
    <TileButton onClick={onClick} title={label} centered={centered} className="text-muted-foreground"
      preview={<span className="absolute inset-0 grid place-items-center rounded-surface border border-dashed border-line"><Icon className="size-2/5 stroke-1" /></span>} />
  )
}
