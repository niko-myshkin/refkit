// Сборка набора иконок Solar для приложения: берёт из @iconify-json/solar только те иконки, что перечислены в scripts/solar-map.json
// (имя Lucide → кандидаты Solar, берётся первая существующая), пишет src/icons/solar-data.ts и перегенерирует список экспортов в
// src/icons/lucide-shim.tsx. Запуск: node scripts/build-solar.mjs. Пакет @iconify-json/solar нужен только для этой сборки (devDependency)
import { readFileSync, writeFileSync } from 'node:fs'

const solar = JSON.parse(readFileSync('node_modules/@iconify-json/solar/icons.json', 'utf8')).icons
const map = JSON.parse(readFileSync('scripts/solar-map.json', 'utf8'))
const aliases = { BookIcon: 'Book', CheckIcon: 'Check', ChevronDownIcon: 'ChevronDown', ChevronLeftIcon: 'ChevronLeft', ChevronRightIcon: 'ChevronRight', ChevronUpIcon: 'ChevronUp', CopyIcon: 'Copy', Loader2Icon: 'Loader2', OctagonXIcon: 'OctagonX', PanelLeftIcon: 'PanelLeft', SearchIcon: 'Search', XIcon: 'X' }
const data = {}
const missing = []
for (const [name, candidates] of Object.entries(map)) {
  // Префиксы кандидата: flip: — зеркально по горизонтали (RotateCcw из restart), slash: — иконка с диагональной чертой (PinOff из pin)
  const plain = (candidate) => candidate.replace(/^(flip|slash):/, '')
  const hit = candidates.find((candidate) => solar[plain(candidate)])
  if (hit) {
    const body = solar[plain(hit)].body
    data[name] = hit.startsWith('flip:') ? `<g transform="matrix(-1 0 0 1 24 0)">${body}</g>` : hit.startsWith('slash:') ? `${body}<path stroke="currentColor" stroke-linecap="round" stroke-width="1.5" d="M3.5 3.5L20.5 20.5"/>` : body
  }
  else missing.push(name)
}
for (const [alias, base] of Object.entries(aliases)) if (data[base]) data[alias] = data[base]
const body = Object.entries(data).sort(([a], [b]) => a.localeCompare(b)).map(([name, svg]) => `  ${name}: ${JSON.stringify(svg)},`).join('\n')
writeFileSync('src/icons/solar-data.ts', `// Сгенерировано scripts/build-solar.mjs из @iconify-json/solar (Solar, linear). Не править руками: правится scripts/solar-map.json\nexport const SOLAR: Record<string, string> = {\n${body}\n}\n`)

const shimPath = 'src/icons/lucide-shim.tsx'
const shim = readFileSync(shimPath, 'utf8')
const head = shim.slice(0, shim.indexOf('export const AlignHorizontalDistributeCenter'))
const names = [...new Set([...Object.keys(data), ...(shim.match(/export const (\w+) = soft/g) ?? []).map((line) => line.split(' ')[2])])].sort()
writeFileSync(shimPath, head + names.map((name) => `export const ${name} = soft('${name}', Real.${name})`).join('\n') + '\n')
console.log(`Solar: ${Object.keys(data).length} иконок, без пары: ${missing.join(', ') || 'нет'}`)
