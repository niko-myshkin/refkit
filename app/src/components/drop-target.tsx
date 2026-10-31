import type { ReactNode } from 'react'
import { useDroppable } from '@dnd-kit/core'

// Куда можно бросить плитку (dnd-kit): подборка в панели, «Новая подборка», полка. Сам бросок разбирает
// DndContext в LibraryWireframe по id цели; здесь — только «над целью ли курсор» и ref для узла
export function DropTarget({ id, children }: { id: string; children: (over: boolean, ref: (node: HTMLElement | null) => void) => ReactNode }) {
  const { isOver, setNodeRef } = useDroppable({ id })
  return children(isOver, setNodeRef)
}
