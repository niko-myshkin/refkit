import { FONT_PAIRS, cssFamily, findPair } from './font-pairs.mjs'

// Тема экрана из ответа ноды «Токены» (цепочка «Рефы → правила и токены»): последний блок :root { … } с переменными темы
// shadcn и пара шрифтов из списка. Сервер кладёт её поверх темы проекта — компоненты экрана берут цвета сами, код экрана их не задаёт.
// Берём только известные имена и простые значения: ответ модели не может протащить в страницу чужой CSS
const NAMES = ['background', 'foreground', 'card', 'card-foreground', 'popover', 'popover-foreground', 'primary', 'primary-foreground', 'secondary', 'secondary-foreground', 'muted', 'muted-foreground', 'accent', 'accent-foreground', 'border', 'input', 'ring', 'radius']
const VALUE = /^(#[0-9a-f]{3,8}|\d*\.?\d+(rem|px)|0)$/i

export function tokensCss(text) {
  const blocks = [...String(text).matchAll(/:root\s*\{([^}]*)\}/g)]
  const vars = []
  for (const line of (blocks.at(-1)?.[1] ?? '').split(/[;\n]/)) {
    const match = line.trim().match(/^--([a-z-]+)\s*:\s*(.+)$/i)
    if (match && NAMES.includes(match[1]) && VALUE.test(match[2].trim())) vars.push(`--${match[1]}:${match[2].trim()}`)
  }
  const pair = FONT_PAIRS[findPair(text)]
  const fonts = pair ? `\nbody{font-family:${cssFamily(pair.text)}}\nh1,h2,h3{font-family:${cssFamily(pair.display)};font-weight:${pair.weight}}` : ''
  return vars.length || fonts ? `${vars.length ? `:root,.dark{${vars.join(';')}}` : ''}${fonts}\n` : ''
}
