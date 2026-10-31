// Раскладка графа: силовая (Fruchterman–Reingold) — узлы отталкиваются, связи пружинят, лёгкая тяжесть к центру
// держит несвязанные куски рядом (параметры подобраны на графе из 32 узлов: ~800×800 при минимуме наложений). Считается один раз при изменении набора узлов; детерминированная (старт по спирали),
// чтобы граф не прыгал при каждом открытии. Для сотен узлов хватает, зависимости не нужны (d3-force не ставим).
export type LayoutNode = { id: string }
export type LayoutLink = { source: string; target: string }

export function layout(nodes: LayoutNode[], links: LayoutLink[], { spacing = 130, gravity = 0.3, reach = 2, iterations = 320 } = {}) {
  const n = nodes.length
  const index = new Map(nodes.map((node, i) => [node.id, i]))
  const x = new Float64Array(n), y = new Float64Array(n)
  // Золотой угол: ровная спираль, соседние по номеру узлы не стартуют в одной точке
  for (let i = 0; i < n; i++) { const radius = spacing * 0.6 * Math.sqrt(i + 1), angle = i * 2.399963; x[i] = Math.cos(angle) * radius; y[i] = Math.sin(angle) * radius }
  const pairs = links.map((link) => [index.get(link.source), index.get(link.target)] as const).filter((pair): pair is [number, number] => pair[0] !== undefined && pair[1] !== undefined)
  const k = spacing
  for (let step = 0; step < iterations; step++) {
    const temperature = (1 - step / iterations) * k * 0.6 + 1
    const dx = new Float64Array(n), dy = new Float64Array(n)
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
      let ex = x[i] - x[j], ey = y[i] - y[j]
      let distance = Math.hypot(ex, ey)
      if (distance < 0.01) { ex = 0.01; ey = 0.01; distance = 0.0141 }
      if (distance > k * reach) continue // далеко — не отталкиваем: иначе несвязанные куски разлетаются
      const push = (k * k) / distance / distance
      dx[i] += ex * push; dy[i] += ey * push; dx[j] -= ex * push; dy[j] -= ey * push
    }
    for (const [a, b] of pairs) {
      const ex = x[a] - x[b], ey = y[a] - y[b]
      const distance = Math.hypot(ex, ey) || 0.01
      const pull = distance / k
      dx[a] -= ex * pull; dy[a] -= ey * pull; dx[b] += ex * pull; dy[b] += ey * pull
    }
    for (let i = 0; i < n; i++) {
      dx[i] -= x[i] * gravity; dy[i] -= y[i] * gravity
      const length = Math.hypot(dx[i], dy[i]) || 1
      const move = Math.min(length, temperature)
      x[i] += (dx[i] / length) * move; y[i] += (dy[i] / length) * move
    }
  }
  return new Map(nodes.map((node, i) => [node.id, { x: x[i], y: y[i] }]))
}
