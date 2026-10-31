// Аудит иконок: измеряет реальный «чернильный» габарит каждой иконки Solar из src/icons/solar-data.ts (getBBox в Chrome)
// и печатает выбросы по размеру и смещению от центра. Запуск: node --experimental-strip-types scripts/icon-audit.mjs
import { readFileSync } from 'node:fs'
import { withChrome } from './cdp.mjs'
const src = readFileSync(new URL('../src/icons/solar-data.ts', import.meta.url), 'utf8')
const data = JSON.parse('{' + src.slice(src.indexOf('= {') + 3, src.lastIndexOf('}')).replace(/,\s*$/, '').replace(/^\s*(\w+):/gm, '"$1":') + '}')
const html = '<body>' + Object.entries(data).map(([n, b]) => `<svg id="${n}" width="24" height="24" viewBox="0 0 24 24">${b}</svg>`).join('') + '</body>'
await withChrome(async (c) => {
  await c.open('data:text/html;charset=utf-8,' + encodeURIComponent(html))
  const rows = JSON.parse(await c.eval(`JSON.stringify([...document.querySelectorAll('svg')].map(s => { const g = s.firstElementChild; const b = s.getBBox(); return [s.id, +b.x.toFixed(2), +b.y.toFixed(2), +b.width.toFixed(2), +b.height.toFixed(2)] }))`))
  const med = (a) => a.sort((x, y) => x - y)[a.length >> 1]
  const sizes = rows.map(([, , , w, h]) => Math.max(w, h)); const m = med([...sizes])
  console.log('медиана большей стороны:', m.toFixed(1), 'из 24; иконок:', rows.length)
  const bad = rows.map(([n, x, y, w, h]) => ({ n, size: Math.max(w, h), cx: x + w / 2 - 12, cy: y + h / 2 - 12 })).filter((r) => Math.abs(r.size - m) > 3.5 || Math.abs(r.cx) > 1.6 || Math.abs(r.cy) > 1.6)
  for (const r of bad.sort((a, b) => a.size - b.size)) console.log(r.n.padEnd(34), 'размер', r.size.toFixed(1).padStart(5), ' сдвиг', r.cx.toFixed(1), r.cy.toFixed(1))
  console.log('выбросов:', bad.length)
  // NAMES=Maximize2,X — печатает габариты указанных иконок (для подбора размера по видимому весу)
  for (const name of (process.env.NAMES ?? '').split(',').filter(Boolean)) { const r = rows.find((row) => row[0] === name); if (r) console.log(name.padEnd(20), 'ширина', r[3], 'высота', r[4]) }
})
