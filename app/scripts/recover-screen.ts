// Вернуть экран в ноду из сырого ответа модели (JSON с полем code) — когда результат ноды потерялся, а лог Codex остался.
// node --experimental-strip-types scripts/recover-screen.ts <ответ.json> <холст> <нода> <fluid|shadcn> [папка-ассетов]
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { compileScreen, parseScreen, type DesignSystem } from '../screen-renderer.ts'

const [answerFile, canvasId, nodeId, system, assetFolder] = process.argv.slice(2)
const library = join(import.meta.dirname, '..', '..', 'library')
// Ассеты — как при запуске ноды: материалы папки в порядке библиотеки (новые сверху), картинки ужаты до 1200 px
const metas = assetFolder ? readdirSync(library).filter((name) => existsSync(join(library, name, 'meta.json'))).map((name) => JSON.parse(readFileSync(join(library, name, 'meta.json'), 'utf8'))).filter((meta) => meta.folder === assetFolder && meta.kind !== 'canvas' && String(meta.image ?? '').startsWith('/library/')).sort((a, b) => b.createdAt - a.createdAt) : []
const assets = metas.map((meta, at) => {
  const out = join(mkdtempSync(join(tmpdir(), 'recover-')), 'a.jpg')
  execFileSync('ffmpeg', ['-y', '-v', 'error', '-i', join(library, String(meta.image).replace(/^\/library\//, '')), '-vf', "scale='min(1200,iw)':-2", '-frames:v', '1', '-q:v', '4', out])
  return { name: `img${at + 1}`, dataUrl: `data:image/jpeg;base64,${readFileSync(out).toString('base64')}` }
})
const source = parseScreen(readFileSync(answerFile, 'utf8'), system as DesignSystem)
const html = await compileScreen(source, assets)
const file = join(library, canvasId, 'canvas.json')
const data = JSON.parse(readFileSync(file, 'utf8'))
const node = data.nodes.find((item: { id: string }) => item.id === nodeId)
if (!node) throw new Error('Нет такой ноды')
node.data = { ...node.data, status: 'ready', result: html, screenSource: source, error: undefined, ranAt: Date.now() }
writeFileSync(file, JSON.stringify(data, null, 2))
console.log(`ok: ${nodeId} ← ${html.length} символов, ассетов ${assets.length}`)
