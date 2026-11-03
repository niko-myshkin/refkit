import { cleanSymbol } from './symbol.mjs'

export const routeField = (text, key) => String(text).match(new RegExp(`(?:^|\\n)[ \\t]*${key}:[ \\t]*([^\\n]*)`, 'i'))?.[1]?.trim() ?? ''
export const conceptAsset = (text, key) => {
  const value = routeField(text, key)
  return /^\/library\/[\w-]+\/[\w-]+\.(png|jpe?g|webp)$/i.test(value) ? value : ''
}
export const conceptWordmark = (text) => conceptAsset(text, 'Wordmark')
export const routeSymbol = (text) => routeField(text, 'Symbol') || String(text).match(/<svg\b[^\n]*<\/svg>/i)?.[0]?.trim() || ''
export function simpleBrandSymbol(text) {
  if (!symbolOnBrandGrid(text)) return false
  const svg = cleanSymbol(routeSymbol(text))
  const shapes = [...svg.matchAll(/<(circle|rect|polygon)\b/g)]
  return shapes.length >= 2 && shapes.length <= 3
}
// В этой версии знаки строятся только из примитивов; проверяем реальную геометрию,
// а не наличие декоративной сетки на странице брендбука.
export function symbolOnBrandGrid(text) {
  const svg = cleanSymbol(routeSymbol(text))
  if (!svg || /<(path|line|polyline)\b/.test(svg)) return false
  const attrs = [...svg.matchAll(/(?:points|x|y|cx|cy|r|rx|ry|width|height)="([^"]*)"/g)]
  return attrs.length > 0 && attrs.every((attr) => [...attr[1].matchAll(/-?\d+(?:\.\d+)?/g)].every((number) => Number(number[0]) % 4 === 0))
}
