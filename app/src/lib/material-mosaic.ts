export type MosaicBox = { left: number; top: number; width: number; height: number }

// Перебираем раскладки рядами и колонками и выбираем ту, где сами изображения
// занимают больше площади. Размер каждой плитки точно сохраняет пропорции исходника.
export function materialMosaic(ratios: number[], width: number, height: number, gap: number): MosaicBox[] {
  if (!ratios.length || width <= 0 || height <= 0) return []
  const aspects = ratios.map((ratio) => Number.isFinite(ratio) && ratio > 0 ? ratio : 1)
  const n = aspects.length
  const partitions: number[][] = []
  if (n <= 10) {
    for (let mask = 0; mask < 2 ** (n - 1); mask++) {
      const groups = [1]
      for (let i = 0; i < n - 1; i++) {
        if (mask & (1 << i)) groups.push(1)
        else groups[groups.length - 1]++
      }
      partitions.push(groups)
    }
  } else {
    for (let count = 1; count <= n; count++) {
      const groups = []
      for (let left = n; left > 0; left -= count) groups.push(Math.min(left, count))
      partitions.push(groups)
    }
  }
  let best: MosaicBox[] = [], bestArea = -1
  for (const transpose of [false, true]) {
    const w = transpose ? height : width, h = transpose ? width : height
    const ar = transpose ? aspects.map((ratio) => 1 / ratio) : aspects
    for (const groups of partitions) {
      const boxes: MosaicBox[] = []
      let at = 0, y = 0
      for (const count of groups) {
        const room = w - gap * (count - 1)
        if (room <= 0) break
        const rowHeight = room / ar.slice(at, at + count).reduce((sum, ratio) => sum + ratio, 0)
        let x = 0
        for (let i = 0; i < count; i++, at++) {
          const itemWidth = rowHeight * ar[at]
          boxes.push({ left: x, top: y, width: itemWidth, height: rowHeight })
          x += itemWidth + gap
        }
        y += rowHeight + gap
      }
      if (boxes.length !== n) continue
      const totalHeight = y - gap
      const scale = Math.min(1, h / totalHeight)
      const area = boxes.reduce((sum, box) => sum + box.width * box.height, 0) * scale * scale
      if (area <= bestArea) continue
      bestArea = area
      const dx = transpose ? 0 : (w - w * scale) / 2
      const dy = transpose ? (h - totalHeight * scale) / 2 : 0
      best = boxes.map((box) => {
        const rect = { left: box.left * scale + dx, top: box.top * scale + dy, width: box.width * scale, height: box.height * scale }
        return transpose ? { left: rect.top, top: rect.left, width: rect.height, height: rect.width } : rect
      })
    }
  }
  return best
}
