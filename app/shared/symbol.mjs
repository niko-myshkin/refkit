// Знак бренда от модели приходит SVG-разметкой в тексте ноды. Рисуем его только после очистки: сетка 64×64, шесть видов фигур, цвет только currentColor
// (поэтому знак перекрашивается под любой фон: светлый, моно на акценте), никаких скриптов, ссылок, градиентов и фильтров. Не прошло очистку — знака нет, вместо него название.
const SHAPES = new Set(['circle', 'rect', 'line', 'polygon', 'path', 'polyline'])
const NUMBER_ATTRS = new Set(['x', 'y', 'cx', 'cy', 'r', 'rx', 'ry', 'width', 'height', 'x1', 'y1', 'x2', 'y2', 'stroke-width'])
const KEEP_FILL = new Set(['currentColor', 'none'])
const PATH_OK = /^[MmLlHhVvAaZz0-9 ,.\-]+$/
const POINTS_OK = /^[0-9 ,.\-]+$/

function cleanShape(tag, rawAttrs) {
  if (!SHAPES.has(tag)) return null
  const out = []
  for (const match of rawAttrs.matchAll(/([a-z-]+)\s*=\s*"([^"]*)"/gi)) {
    const name = match[1], value = match[2].trim()
    if (NUMBER_ATTRS.has(name)) { if (!/^-?\d+(\.\d+)?$/.test(value)) return null; out.push(`${name}="${value}"`) }
    else if (name === 'd') { if (!PATH_OK.test(value)) return null; out.push(`d="${value}"`) }
    else if (name === 'points') { if (!POINTS_OK.test(value)) return null; out.push(`points="${value}"`) }
    else if (name === 'fill' || name === 'stroke') { if (!KEEP_FILL.has(value)) return null; out.push(`${name}="${value}"`) }
    else if (name === 'stroke-linecap' || name === 'stroke-linejoin') { if (!/^(butt|round|square|miter|bevel)$/.test(value)) return null; out.push(`${name}="${value}"`) }
    else if (name === 'fill-rule' || name === 'clip-rule') { if (!/^(evenodd|nonzero)$/.test(value)) return null; out.push(`${name}="${value}"`) }
    else return null // любой другой атрибут (style, on*, href, transform…) — знак отбрасывается целиком
  }
  return `<${tag} ${out.join(' ')}/>`
}

export function cleanSymbol(svg) {
  if (typeof svg !== 'string') return ''
  // Модель иногда оборачивает разметку в обратные кавычки или кавычки: снимаем обёртку, остальное проверяется строго
  const text = svg.trim().replace(/^[`'"]+|[`'"]+$/g, '').trim()
  const open = text.match(/^<svg\s+([^>]*)>/i)
  if (!open || !/viewBox="0 0 64 64"/.test(open[1]) || !/<\/svg>\s*$/i.test(text)) return ''
  const inner = text.slice(open[0].length, text.search(/<\/svg>\s*$/i))
  const shapes = []
  let rest = inner.trim()
  while (rest.length) {
    const tag = rest.match(/^<([a-z]+)\s+([^>]*?)\s*\/?>(?:<\/\1>)?/i)
    if (!tag) return ''
    const shape = cleanShape(tag[1].toLowerCase(), tag[2])
    if (!shape) return ''
    shapes.push(shape)
    rest = rest.slice(tag[0].length).trim()
  }
  if (shapes.length < 1 || shapes.length > 12) return ''
  return `<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" fill="currentColor">${shapes.join('')}</svg>`
}
