// Расстановка графа: точки на поверхности шара (как «Brain explorer» у Fabric, 02_research/teardowns/fabric/explorer/explorer.md) и дуги по ней.
// «Собрать по…», фигуры и решётка убраны 2026-10-08 (в истории git). Только координаты — рисует страница.
// Детерминировано: один и тот же набор встаёт одинаково при каждом открытии
export type Pt3 = { x: number; y: number; z: number }

// pull — сила притяжения связанных (в приложении 0,05; на лендинге слабее: точки ложатся ровнее, без куч и пустот).
// Узлы на поверхности шара, как у Fabric: все точки лежат на сфере (задние просвечивают через шар), связанные — рядом.
// Старт — спираль Фибоначчи (ровная россыпь, ids упорядочены по кластерам), дальше силовая релаксация прямо на сфере:
// несвязанные отталкиваются, связанные притягиваются, после каждого шага точка возвращается на поверхность.
// Детерминировано: один и тот же граф раскладывается одинаково при каждом открытии
export function sphere(ids: string[], links: Array<{ a: string; b: string; score: number }> = [], iterations = 260, pull = 0.05): Map<string, Pt3> {
  const n = ids.length, golden = Math.PI * (3 - Math.sqrt(5))
  const x = new Float64Array(n), y = new Float64Array(n), z = new Float64Array(n)
  for (let i = 0; i < n; i++) { const h = 1 - (2 * (i + 0.5)) / Math.max(n, 1), r = Math.sqrt(Math.max(0, 1 - h * h)), a = i * golden; x[i] = Math.cos(a) * r; y[i] = h; z[i] = Math.sin(a) * r }
  const index = new Map(ids.map((id, i) => [id, i]))
  const edges = links.map((link) => [index.get(link.a), index.get(link.b), link.score] as const).filter((edge): edge is [number, number, number] => edge[0] !== undefined && edge[1] !== undefined)
  const push = 0.0045 // сила отталкивания: подобрана так, чтобы точки не слипались при ~100 узлах
  for (let step = 0; step < iterations; step++) {
    const fx = new Float64Array(n), fy = new Float64Array(n), fz = new Float64Array(n)
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
      const dx = x[i] - x[j], dy = y[i] - y[j], dz = z[i] - z[j]
      const d2 = dx * dx + dy * dy + dz * dz + 1e-6, f = push / (d2 * Math.sqrt(d2))
      fx[i] += dx * f; fy[i] += dy * f; fz[i] += dz * f; fx[j] -= dx * f; fy[j] -= dy * f; fz[j] -= dz * f
    }
    for (const [a, b, w] of edges) {
      const dx = x[b] - x[a], dy = y[b] - y[a], dz = z[b] - z[a], k = pull * Math.min(1 + w, 3)
      fx[a] += dx * k; fy[a] += dy * k; fz[a] += dz * k; fx[b] -= dx * k; fy[b] -= dy * k; fz[b] -= dz * k
    }
    const cap = 0.06 * (1 - step / iterations) + 0.002
    for (let i = 0; i < n; i++) {
      const length = Math.hypot(fx[i], fy[i], fz[i]) || 1, move = Math.min(length, cap)
      x[i] += (fx[i] / length) * move; y[i] += (fy[i] / length) * move; z[i] += (fz[i] / length) * move
      const norm = Math.hypot(x[i], y[i], z[i]) || 1
      x[i] /= norm; y[i] /= norm; z[i] /= norm
    }
  }
  return new Map(ids.map((id, i) => [id, { x: x[i], y: y[i], z: z[i] }] as const))
}

// Точки дуги по поверхности шара между двумя узлами (большой круг), чуть приподнятые над поверхностью посередине
export function arc(a: Pt3, b: Pt3, steps = 14, lift = 0.07): Pt3[] {
  const dot = Math.max(-1, Math.min(1, a.x * b.x + a.y * b.y + a.z * b.z)), omega = Math.acos(dot), sin = Math.sin(omega)
  return Array.from({ length: steps + 1 }, (_, i) => {
    const t = i / steps
    const k1 = sin < 1e-5 ? 1 - t : Math.sin((1 - t) * omega) / sin, k2 = sin < 1e-5 ? t : Math.sin(t * omega) / sin
    const raise = 1 + lift * Math.sin(Math.PI * t) * (omega / Math.PI)
    return { x: (a.x * k1 + b.x * k2) * raise, y: (a.y * k1 + b.y * k2) * raise, z: (a.z * k1 + b.z * k2) * raise }
  })
}
