import type { CSSProperties, PointerEvent, ReactNode } from 'react'
import { motion, useReducedMotion, useSpring } from 'framer-motion'

// Лёгкий наклон в 3D от курсора (ТОЛЬКО плитки ленты): превью чуть поворачивается к указателю, на выходе плавно выравнивается.
// Без увеличения; только мышь (на касании и при «уменьшить движение» эффекта нет); пока что-то тащат (кнопка зажата) — стоит ровно.
// Наклон — на внутренней обёртке, а не на кнопке превью: у той свой layoutId для перехода «карточка вырастает из плитки», он не должен измеряться под поворотом.
const MAX = 5 // градусов в каждую сторону
const PERSPECTIVE = 900
const SPRING = { stiffness: 260, damping: 26, mass: 0.6 } as const

export function Tilt({ children, className, style }: { children: ReactNode; className?: string; style?: CSSProperties }) {
  const still = useReducedMotion()
  const rotateX = useSpring(0, SPRING), rotateY = useSpring(0, SPRING)
  const level = () => { rotateX.set(0); rotateY.set(0) }
  const move = (event: PointerEvent<HTMLDivElement>) => {
    if (still || event.pointerType !== 'mouse' || event.buttons !== 0) return level()
    const rect = event.currentTarget.getBoundingClientRect()
    const x = (event.clientX - rect.left) / rect.width - 0.5, y = (event.clientY - rect.top) / rect.height - 0.5
    rotateY.set(x * 2 * MAX); rotateX.set(-y * 2 * MAX)
  }
  return (
    <div className={className} style={{ ...style, perspective: PERSPECTIVE }} onPointerMove={move} onPointerLeave={level} onPointerDown={() => { rotateX.jump(0); rotateY.jump(0) }}>
      <motion.div className="relative size-full overflow-hidden rounded-surface" style={{ rotateX, rotateY }}>{children}</motion.div>
    </div>
  )
}
