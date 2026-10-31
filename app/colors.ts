import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// Главные цвета картинки (№18, grill-fabric-findings.md) — кодом, без модели: sips (есть в macOS) уменьшает до 24×24 BMP,
// пиксели раскладываем по корзинам 4 бита на канал, соседние корзины сливаем, берём до 6 самых частых.
// Почти белое и почти чёрное фоновое не выкидываем: у интерфейсов это и есть их цвет
export function mainColors(image: string, count = 6): string[] {
  const dir = mkdtempSync(join(tmpdir(), 'refkit-colors-'))
  try {
    const bmp = join(dir, 'small.bmp')
    execFileSync('sips', ['-s', 'format', 'bmp', '-z', '24', '24', image, '--out', bmp], { stdio: 'ignore' })
    return quantize(pixels(readFileSync(bmp)), count)
  } catch { return [] }
  finally { rmSync(dir, { recursive: true, force: true }) }
}

// Несжатый BMP: смещение данных, ширина, высота (плюс — снизу вверх), бит на пиксель; строки выровнены по 4 байта, порядок BGR(A)
function pixels(file: Buffer): Array<[number, number, number]> {
  const offset = file.readUInt32LE(10), width = file.readInt32LE(18), height = Math.abs(file.readInt32LE(22)), bits = file.readUInt16LE(28)
  const step = bits / 8
  if (step < 3) return []
  const row = Math.ceil((width * step) / 4) * 4
  const out: Array<[number, number, number]> = []
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const at = offset + y * row + x * step
    out.push([file[at + 2], file[at + 1], file[at]])
  }
  return out
}

const hex = ([r, g, b]: number[]) => `#${[r, g, b].map((value) => Math.round(value).toString(16).padStart(2, '0')).join('')}`
export const distance = (a: number[], b: number[]) => Math.sqrt(2 * (a[0] - b[0]) ** 2 + 4 * (a[1] - b[1]) ** 2 + 3 * (a[2] - b[2]) ** 2) // глаз к зелёному чувствительнее

function quantize(list: Array<[number, number, number]>, count: number) {
  const buckets = new Map<number, { sum: number[]; n: number }>()
  for (const [r, g, b] of list) {
    const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4)
    const bucket = buckets.get(key) ?? { sum: [0, 0, 0], n: 0 }
    bucket.sum[0] += r; bucket.sum[1] += g; bucket.sum[2] += b; bucket.n++
    buckets.set(key, bucket)
  }
  const colors = [...buckets.values()].map(({ sum, n }) => ({ rgb: sum.map((value) => value / n), n })).sort((a, b) => b.n - a.n)
  const picked: typeof colors = []
  for (const color of colors) {
    const near = picked.find((item) => distance(item.rgb, color.rgb) < 90)
    if (near) { near.rgb = near.rgb.map((value, index) => (value * near.n + color.rgb[index] * color.n) / (near.n + color.n)); near.n += color.n }
    else picked.push({ ...color })
  }
  // Меньше 2% картинки — шум, не цвет
  return picked.sort((a, b) => b.n - a.n).filter((item) => item.n / list.length >= 0.02).slice(0, count).map((item) => hex(item.rgb))
}
