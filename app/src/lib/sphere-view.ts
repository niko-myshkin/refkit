// Вращение шара графа «как у глобуса Atlas» (Portfolio Product 2026/Portfolio_Codex/atlas-app/assets/js/globe.js):
// инерция с трением 0,94 за кадр (не зависит от частоты кадров), медленный дрейф в покое. Но вместо углов yaw/pitch с
// потолком наклона — матрица поворота: шар крутится свободно во все стороны, а точка, за которую взялся, едет под курсором
// (у Atlas поворот пропорционален сдвигу пальца и точка под пальцем «уезжает»; здесь шар поворачивают так, чтобы точка
// осталась под указателем). Система координат вида: x вправо, y вниз, z к зрителю; камера на оси z.
export type Mat = number[] // 3×3 построчно
export type V3 = { x: number; y: number; z: number }

export const mul = (a: Mat, b: Mat): Mat => {
  const out: number[] = []
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) out.push(a[r * 3] * b[c] + a[r * 3 + 1] * b[3 + c] + a[r * 3 + 2] * b[6 + c])
  return out
}
export const rotX = (t: number): Mat => [1, 0, 0, 0, Math.cos(t), -Math.sin(t), 0, Math.sin(t), Math.cos(t)]
export const rotY = (t: number): Mat => [Math.cos(t), 0, Math.sin(t), 0, 1, 0, -Math.sin(t), 0, Math.cos(t)]
// Стартовый поворот: слегка наклонён и довёрнут, чтобы шар не смотрел строго в «полюс»
export const initialView = (): Mat => mul(rotX(-0.3), rotY(0.6))
export const apply = (m: Mat, p: V3): V3 => ({ x: m[0] * p.x + m[1] * p.y + m[2] * p.z, y: m[3] * p.x + m[4] * p.y + m[5] * p.z, z: m[6] * p.x + m[7] * p.y + m[8] * p.z })

const cross = (a: V3, b: V3): V3 => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x })
const dot = (a: V3, b: V3) => a.x * b.x + a.y * b.y + a.z * b.z
const norm = (v: V3): V3 => { const l = Math.hypot(v.x, v.y, v.z) || 1; return { x: v.x / l, y: v.y / l, z: v.z / l } }

// Поворот на угол вокруг оси (Родриг)
export const axisAngle = (axis: V3, angle: number): Mat => {
  const { x, y, z } = norm(axis), c = Math.cos(angle), s = Math.sin(angle), t = 1 - c
  return [t * x * x + c, t * x * y - s * z, t * x * z + s * y, t * x * y + s * z, t * y * y + c, t * y * z - s * x, t * x * z - s * y, t * y * z + s * x, t * z * z + c]
}
// Много малых поворотов копят ошибку — возвращаем матрицу к настоящему повороту (Грамм–Шмидт по строкам)
export const orthonormalize = (m: Mat): Mat => {
  const r0 = norm({ x: m[0], y: m[1], z: m[2] })
  let r1 = { x: m[3], y: m[4], z: m[5] }
  const k = dot(r1, r0)
  r1 = norm({ x: r1.x - r0.x * k, y: r1.y - r0.y * k, z: r1.z - r0.z * k })
  const r2 = cross(r0, r1)
  return [r0.x, r0.y, r0.z, r1.x, r1.y, r1.z, r2.x, r2.y, r2.z]
}

// Точка шара под указателем: луч из камеры (на расстоянии d от центра, в долях радиуса) через пиксель (u, v — от центра шара,
// в долях радиуса, v вниз) и ближайшее пересечение со сферой. Мимо шара — точка на его контуре в сторону указателя
export function underPointer(u: number, v: number, d: number): V3 {
  const a = u * u + v * v + d * d, b = -2 * d * d, c = d * d - 1
  const disc = b * b - 4 * a * c
  if (disc <= 0) return norm({ x: u, y: v, z: 0 })
  const t = (-b - Math.sqrt(disc)) / (2 * a)
  return { x: t * u, y: t * v, z: d - t * d }
}
// Поворот, переводящий направление from в to; null — если они почти совпадают
export function between(from: V3, to: V3): { axis: V3; angle: number } | null {
  const axis = cross(from, to), length = Math.hypot(axis.x, axis.y, axis.z)
  if (length < 1e-9) return null
  return { axis: { x: axis.x / length, y: axis.y / length, z: axis.z / length }, angle: Math.atan2(length, dot(from, to)) }
}
