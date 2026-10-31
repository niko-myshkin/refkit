import css from '@/index.css?raw'

// Токены читаются из самого index.css — второго списка нет, правишь источник, и страница обновляется сама.
export type Token = { name: string; light: string; dark?: string; note?: string }

const line = /^\s*--([\w-]+):\s*([^;]+);(?:\s*\/\*\s*(.*?)\s*\*\/)?/gm

function parse(block: string) {
  const out = new Map<string, { value: string; note?: string }>()
  for (const m of block.matchAll(line)) out.set(m[1], { value: m[2].trim(), note: m[3] })
  return out
}

// Содержимое блока по селектору: первая «{» после него и до закрывающей «}» этого же блока (вложенных блоков в :root и .dark нет)
function block(selector: RegExp) {
  const m = selector.exec(css)
  if (!m) return ''
  const start = css.indexOf('{', m.index)
  return css.slice(start + 1, css.indexOf('}', start))
}

// Токены темы (@theme inline) — здесь роли скругления
const theme = parse(block(/^@theme inline\s*\{/m))
const light = parse(block(/^:root\s*\{/m))
const dark = parse(block(/^\.dark\s*\{/m))

export const tokens: Token[] = [...light].map(([name, { value, note }]) => ({ name, light: value, dark: dark.get(name)?.value, note }))
// Токены, которые есть только в тёмной теме (в светлой берутся по умолчанию)
for (const [name, { value }] of dark) if (!light.has(name)) tokens.push({ name, light: '—', dark: value })

export const byPrefix = (prefix: string) => tokens.filter((t) => t.name.startsWith(prefix))
export const byNames = (names: string[]) => names.flatMap((n) => tokens.filter((t) => t.name === n))

export const themeTokens: Token[] = [...theme].map(([name, { value, note }]) => ({ name, light: value, note }))
