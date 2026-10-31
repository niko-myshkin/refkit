// Экспорт холста в статический снимок «только просмотр» (01_strategy/snapshot-share-plan-2026-10-28.md).
// Запуск (из app/, сервер библиотеки должен работать): node scripts/export-snapshot.mjs <id холста> [--port 5198] [--library <папка library>] [--out <папка>] [--lang en|ru] [--allow-personal]
// В снимок попадают только сам холст и материалы, на которые он ссылается; память, настройки аккаунтов, корзина и остальная библиотека не копируются.
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const appDir = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)
const flag = (name, fallback) => { const at = args.indexOf(name); return at >= 0 ? args[at + 1] : fallback }
const canvasId = args.find((item) => !item.startsWith('--') && item !== flag('--port') && item !== flag('--library') && item !== flag('--out'))
if (!canvasId) throw new Error('Укажи id холста: node scripts/export-snapshot.mjs ref-…')
const port = flag('--port', '5198')
const library = resolve(flag('--library', join(appDir, '../05_experiments/demo-library-2026-10-23/library')))
const allowPersonal = args.includes('--allow-personal')
if (!allowPersonal && !/demo-library/.test(library)) throw new Error('Библиотека не демо: личные материалы публиковать нельзя. Если это сделано сознательно, добавь --allow-personal.')

const api = async (path) => { const response = await fetch(`http://localhost:${port}/api/library${path}`); if (!response.ok) throw new Error(`${path}: ${response.status}`); return response.json() }
const canvas = await api(`/canvas/${canvasId}`)
const everything = await api('')
const meta = everything.find((item) => item.id === canvasId)
if (!meta || meta.kind !== 'canvas') throw new Error('Это не холст: ' + canvasId)

// Что на холсте: материалы, упомянутые в его данных по id, и участники папок и подборок, лежащих на нём
const text = JSON.stringify(canvas)
const ids = new Set(everything.filter((item) => item.id !== canvasId && text.includes(item.id)).map((item) => item.id))
for (const node of canvas.nodes) {
  if (node.type !== 'group') continue
  const key = String(node.data?.key ?? '')
  for (const item of everything) if (item.kind !== 'canvas' && (node.data?.groupKind === 'folder' ? item.folder === key : item.boards?.includes(key) || item.collections?.includes(key))) ids.add(item.id)
}
const included = [meta, ...everything.filter((item) => ids.has(item.id) && item.kind !== 'canvas')]
const folderIds = new Set(included.map((item) => item.folder).filter(Boolean))
const folders = (await api('/folders')).folders.filter((folder) => folder.inbox || folderIds.has(folder.id))
const settings = await api('/settings')

const outDir = resolve(flag('--out', join(appDir, '../snapshots', String(meta.title ?? canvasId).toLowerCase().replace(/[^a-z0-9а-я]+/g, '-').replace(/^-|-$/g, '') || canvasId)))
console.log(`Холст «${meta.title}», материалов: ${included.length - 1}, папок: ${folders.length}`)
for (const item of included.slice(1)) console.log(`  · ${item.title ?? item.id}`)

// Сборка приложения в режиме снимка
rmSync(outDir, { recursive: true, force: true })
const build = spawnSync('npx', ['vite', 'build', '--outDir', outDir, '--emptyOutDir', '--base', './'], { cwd: appDir, env: { ...process.env, VITE_SNAPSHOT: '1', VITE_LANG: flag('--lang', 'en') }, stdio: 'inherit' })
if (build.status !== 0) throw new Error('Сборка не удалась')

const data = { '': included, '/boards': [], '/folders': { folders }, '/trash': [], '/collections': [], '/actions': await api('/actions'), '/settings': settings, [`/canvas/${canvasId}`]: canvas }
writeFileSync(join(outDir, 'snapshot.json'), JSON.stringify(data))
// Файлы материалов без журналов запусков и без самих досок (доска уже внутри snapshot.json)
let bytes = 0
for (const item of included) {
  const from = join(library, item.id)
  if (!existsSync(from)) continue
  const to = join(outDir, 'library', item.id)
  cpSync(from, to, { recursive: true, filter: (source) => !/(^|\/)(runs|canvas\.json)$/.test(source) })
  for (const file of readdirSync(to, { recursive: true })) { const path = join(to, String(file)); if (statSync(path).isFile()) bytes += statSync(path).size }
}
// PDF презентаций: в снимке нет сервера, поэтому «Скачать PDF» отдаёт готовый файл из pdf/<id ноды>.pdf; собираем его сейчас через работающий сервер
const decks = canvas.nodes.filter((node) => node.type === 'screen' && node.data?.designSystem === 'deck' && node.data?.result)
if (decks.length) mkdirSync(join(outDir, 'pdf'), { recursive: true })
for (const node of decks) {
  const response = await fetch(`http://localhost:${port}/api/library/canvas/${canvasId}/pdf`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ node: node.id }) })
  if (response.ok) { writeFileSync(join(outDir, 'pdf', `${node.id}.pdf`), Buffer.from(await response.arrayBuffer())); console.log(`PDF презентации: pdf/${node.id}.pdf`) }
  else console.warn(`PDF для ${node.id} не собрался (${response.status}): кнопка «Скачать PDF» в снимке будет пустой`)
}
// Страница сразу открывается на холсте
const indexPath = join(outDir, 'index.html')
writeFileSync(indexPath, readFileSync(indexPath, 'utf8').replace('<head>', `<head><script>if(!location.hash)location.hash='#/card/${canvasId}'</script>`))
console.log(`Готово: ${outDir} (материалы ${(bytes / 1048576).toFixed(1)} МБ)`)
