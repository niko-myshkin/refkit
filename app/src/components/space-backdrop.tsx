import { useEffect, useRef } from 'react'

// Общий фон графа и полёта: неподвижные звёзды, большая часть заметно, но мягко мерцает, раз в 8–16 с пролетает комета.
// Только цвет текста темы (звёзды не вводят новых цветов), под «уменьшить движение» — статичные звёзды без комет.
const lcg = (start: number) => { let seed = start; return () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296 }
const STARS = (() => { const rand = lcg(9); return Array.from({ length: 320 }, () => ({ x: rand(), y: rand(), a: 0.15 + rand() * 0.5, r: rand() < 0.1 ? 1.3 : 0.7, twinkle: rand() < 0.6, speed: 0.8 + rand() * 1.6, phase: rand() * 6.28 })) })()
const COMET = { tail: 110, life: 1400, first: [3000, 6000], gap: [8000, 16000] } as const

// comets — лететь ли комете; bright — множитель яркости и размера звёзд (на лендинге звёзды нужны заметнее, чем в приложении). Вне экрана рисование стоит.
export function SpaceBackdrop({ comets = true, bright = 1 }: { comets?: boolean; bright?: number } = {}) {
  const canvas = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const el = canvas.current, ctx = el?.getContext('2d')
    if (!el || !ctx) return
    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let w = 0, h = 0, dpr = 1, frame = 0, color = '#fff', colorAt = -1e9, comet: { x: number; y: number; dx: number; dy: number; at: number } | null = null
    let nextComet = performance.now() + COMET.first[0] + Math.random() * (COMET.first[1] - COMET.first[0])
    const fit = () => { const rect = el.getBoundingClientRect(); dpr = window.devicePixelRatio || 1; w = rect.width; h = rect.height; el.width = w * dpr; el.height = h * dpr }
    fit()
    const observer = new ResizeObserver(fit)
    observer.observe(el)
    const step = (now: number) => {
      if (now - colorAt > 500) { color = getComputedStyle(document.documentElement).getPropertyValue('--foreground').trim() || '#fff'; colorAt = now } // тема могла смениться
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, w, h)
      ctx.fillStyle = color
      for (const s of STARS) {
        ctx.globalAlpha = Math.min(1, (s.twinkle && !still ? s.a * (0.55 + 0.45 * Math.sin(now / 1000 * s.speed + s.phase)) : s.a) * bright)
        const size = s.r * (bright > 1 ? 1.4 : 1)
        ctx.fillRect(s.x * w, s.y * h, size, size)
      }
      if (!still && comets) {
        if (!comet && now > nextComet) {
          // стартует у верхней или боковой кромки, летит по диагонали вниз в случайную сторону
          const dir = Math.random() < 0.5 ? 1 : -1, slope = 0.25 + Math.random() * 0.3, speed = 0.45 + Math.random() * 0.25
          comet = { x: dir > 0 ? -COMET.tail * 0.2 + Math.random() * w * 0.4 : w * 0.6 + Math.random() * w * 0.4, y: Math.random() * h * 0.4, dx: dir * speed, dy: speed * slope, at: now }
        }
        if (comet) {
          const t = now - comet.at
          if (t > COMET.life) { comet = null; nextComet = now + COMET.gap[0] + Math.random() * (COMET.gap[1] - COMET.gap[0]) }
          else {
            const hx = comet.x + comet.dx * t, hy = comet.y + comet.dy * t, len = Math.hypot(comet.dx, comet.dy), tx = hx - (comet.dx / len) * COMET.tail, ty = hy - (comet.dy / len) * COMET.tail
            const fade = Math.sin(Math.PI * (t / COMET.life)) // проявляется и гаснет
            const gradient = ctx.createLinearGradient(hx, hy, tx, ty)
            gradient.addColorStop(0, color); gradient.addColorStop(1, 'transparent')
            ctx.globalAlpha = 0.55 * fade; ctx.strokeStyle = gradient; ctx.lineWidth = 1.2; ctx.lineCap = 'round'
            ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(tx, ty); ctx.stroke()
            ctx.globalAlpha = 0.8 * fade; ctx.fillRect(hx - 0.8, hy - 0.8, 1.6, 1.6)
          }
        }
      }
      ctx.globalAlpha = 1
      frame = requestAnimationFrame(step)
    }
    frame = requestAnimationFrame(step)
    const watch = new IntersectionObserver(([entry]) => { cancelAnimationFrame(frame); if (entry.isIntersecting) frame = requestAnimationFrame(step) })
    watch.observe(el)
    return () => { cancelAnimationFrame(frame); observer.disconnect(); watch.disconnect() }
  }, [comets, bright])
  return <canvas ref={canvas} aria-hidden className="pointer-events-none absolute inset-0 size-full" />
}
