#!/usr/bin/env node
// Локальный MCP Refkit (R16, прожарка 01_strategy/grill-mcp.md): твой агент (Claude Code, Codex, любой MCP-клиент)
// получает библиотеку и память о тебе. Читает папку библиотеки напрямую — работает и без запущенного Refkit.
// Меняет библиотеку только по правам (library/permissions.json, идея 53): добавление — в очередь, Refkit разложит сам;
// строки памяти и правки — предложением, подтверждаешь в Refkit.
//
// Подключить:
//   claude mcp add refkit -- node /путь/к/Refkit/app/mcp/server.mjs
//   codex mcp add refkit -- node /путь/к/Refkit/app/mcp/server.mjs
// Другая папка библиотеки — переменная REFKIT_LIBRARY.
import { isRunnable, mcpLabel, typeIds } from '../shared/canvas-nodes.mjs'
import { applyOps } from '../shared/canvas-graph.mjs'
import { resultForAgent } from '../shared/canvas-result.mjs'
import { appendFileSync, copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { basename, extname, join } from 'node:path'
import { imageFileProblem, withBoard } from '../shared/inbox-file.mjs'
import { addSpace, canvasMeta, findSpace, freeId } from '../shared/spaces.mjs'
import { queryStems } from '../src/lib/stem.mjs'
import { conceptKey, derive, find as findInGraph, neighbours, path as graphPath } from '../src/lib/graph-core.mjs'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'

const library = process.env.REFKIT_LIBRARY ?? join(import.meta.dirname, '..', '..', 'library')
const readJson = (file, fallback) => { try { return JSON.parse(readFileSync(join(library, file), 'utf8')) } catch { return fallback } }
const writeJson = (file, value) => writeFileSync(join(library, file), JSON.stringify(value, null, 2) + '\n')

// ── Чтение ──────────────────────────────────────────────────────────────────
// v2: материал лежит в одном space (folders.json, meta.folder; без папки — «Входящие»); старые подборки (boards) — для v1.
// «Места» материала — его space и подборки; поиск и refkit_board понимают и то и другое
const spaceOf = (meta) => { const folders = readJson('folders.json', []); return (folders.find((item) => item.id === meta.folder) ?? folders.find((item) => item.inbox))?.name }
const placesOf = (meta) => [...new Set([spaceOf(meta), ...(meta.boards ?? [])].filter(Boolean))]
function items() {
  return readdirSync(library, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.') && existsSync(join(library, entry.name, 'meta.json')))
    .map((entry) => { try { return JSON.parse(readFileSync(join(library, entry.name, 'meta.json'), 'utf8')) } catch { return null } })
    .filter(Boolean)
    .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))
}
// Комментарии владельца (идея 62): лента comments; пока её нет — «зачем сохранил» (meaning) как единственный комментарий
const commentsOf = (meta) => Array.isArray(meta.comments) ? meta.comments : meta.meaning ? [{ text: meta.meaning, at: meta.createdAt }] : []
const commentsText = (meta) => commentsOf(meta).map((item) => `${new Date(item.at).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}: ${item.text}`).join('\n')
const typeOf = (meta) => meta.kind === 'canvas' ? 'холст' : meta.kind === 'youtube' ? 'ролик' : meta.kind === 'article' ? 'статья' : meta.kind === 'note' ? (meta.sources?.length ? 'набор' : 'заметка') : meta.kind === 'music' ? 'музыка' : meta.kind === 'link' ? 'закладка' : meta.format === 'video' ? 'видео' : 'картинка'
const digestOf = (meta) => (meta.thread ?? []).filter((turn) => turn.via === 'digest').at(-1)?.answer
const essenceOf = (meta) => digestOf(meta)?.split('\n').find((line) => line.startsWith('- '))?.slice(2) ?? meta.description ?? ''
const tagsOf = (meta) => meta.collections ?? []
const line = (meta) => [meta.id, typeOf(meta), meta.title, essenceOf(meta).replace(/\s+/g, ' ').slice(0, 220), tagsOf(meta).join(', '), placesOf(meta).join(', ')].join(' | ')
const header = 'id | тип | название | суть | теги | подборки'
const norm = (text) => String(text ?? '').toLowerCase().replace(/ё/g, 'е')
const text = (value) => ({ content: [{ type: 'text', text: value }] })
const imageTypes = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif' }
const readPermissions = () => ({ library: 'ask', web: 'ask', ...readJson('permissions.json', {}) })
// Ссылку холста из «Скопировать для агента» (refkit:canvas/<id>) понимаем целиком, не только голый id
const find = (id) => { const bare = String(id).replace(/^refkit:canvas\//, '').split('#')[0].trim(); return items().find((meta) => meta.id === bare) }

const server = new McpServer({ name: 'refkit', version: '0.1.0' }, {
  instructions: 'Refkit — личная библиотека владельца: картинки, ролики, статьи, заметки, музыка и холсты (доски, где владелец разложил материалы, рамки, подписи и стрелки; ссылка refkit:canvas/<id> читается через refkit_read), с выжимками и тегами, и память о том, как ему отвечать. Сначала вызови refkit_memory и соблюдай пожелания. Ищи в библиотеке, прежде чем предлагать своё: refkit_search (по словам), refkit_graph (по смыслу, через понятия), refkit_read. Опёрся на материал или заметку из библиотеки — скажи одной строкой: «Взял из Refkit: <название>». Сохранять — refkit_save. Менять библиотеку сам не можешь: правки и новые строки памяти только предлагаешь, владелец подтверждает в Refkit.',
})

// Журнал обращений (страница «Память», блок «Кто брал память», grill-memory-page.md): строка на каждый вызов —
// инструмент, клиент (Claude Code, Codex), проект (папка, из которой агент запустил сервер) и время. Только чтение для владельца
const project = basename(process.cwd())
const clientName = () => server.server.getClientVersion()?.name ?? 'агент'
const registerTool = server.registerTool.bind(server)
server.registerTool = (name, config, handler) => registerTool(name, config, async (...args) => {
  try { appendFileSync(join(library, '.mcp-log.jsonl'), JSON.stringify({ at: Date.now(), tool: name, client: clientName(), project }) + '\n') } catch { /* журнал не важнее ответа */ }
  return handler(...args)
})
// Область правила памяти: нет или «all» — везде; «app» — только агент внутри Refkit (наружу не отдаётся); иначе — имя папки проекта
const forThisProject = (item) => !item.scope || item.scope === 'all' || item.scope === project

server.registerTool('refkit_memory', {
  title: 'Память о владельце',
  description: 'Что владелец подтвердил о том, как ему отвечать (длина, тон, формат, как называть). Соблюдай всегда. Плюс права агента: что можно менять без спроса.',
  inputSchema: {},
  annotations: { readOnlyHint: true },
}, async () => {
  const memory = (readJson('memory.json', { user: [] }).user ?? []).filter(forThisProject)
  const permissions = readPermissions()
  return text([
    memory.length ? `Пожелания владельца (соблюдай всегда):\n${memory.map((item) => `- ${item.text}`).join('\n')}` : 'Пожеланий пока нет.',
    `\nПрава: менять библиотеку — ${permissions.library === 'allow' ? 'можно' : 'только предложением'}; искать в сети — ${permissions.web === 'allow' ? 'можно' : 'спросить владельца'}.`,
  ].join('\n'))
})

server.registerTool('refkit_overview', {
  title: 'Что в библиотеке',
  description: 'Обзор библиотеки: сколько чего по типам, словарь тегов, подборки владельца, 10 последних материалов. Начни отсюда, если не знаешь, что искать.',
  inputSchema: {},
  annotations: { readOnlyHint: true },
}, async () => {
  const all = items()
  const count = (list) => Object.entries(list.reduce((acc, key) => ({ ...acc, [key]: (acc[key] ?? 0) + 1 }), {})).sort((a, b) => b[1] - a[1])
  const tags = readJson('collections.json', [])
  const boards = readJson('boards.json', [])
  return text([
    `Материалов: ${all.length}. По типам: ${count(all.map(typeOf)).map(([key, value]) => `${key} ${value}`).join(', ')}.`,
    `Теги: ${tags.map((tag) => `${tag.name} (${all.filter((meta) => tagsOf(meta).includes(tag.name)).length})${tag.hint && tag.hint !== tag.name ? ` — ${tag.hint}` : ''}`).join('; ') || 'нет'}.`,
    `Spaces: ${readJson('folders.json', []).map((folder) => `${folder.name} (${all.filter((meta) => spaceOf(meta) === folder.name).length})`).join('; ') || 'нет'}.`,
    `Подборки владельца: ${boards.map((board) => `${board.name} (${all.filter((meta) => meta.boards?.includes(board.name)).length})`).join('; ') || 'нет'}.`,
    `\nПоследние 10:\n${header}\n${all.slice(0, 10).map(line).join('\n')}`,
  ].join('\n'))
})

server.registerTool('refkit_search', {
  title: 'Найти в библиотеке',
  description: 'Поиск по названию, сути, выжимке, тегам и заметке владельца. Все слова запроса должны найтись; окончания не важны («шрифты» найдёт «шрифт»). Можно сузить типом, тегом или подборкой. Возвращает строки: id | тип | название | суть | теги | подборки.',
  inputSchema: {
    query: z.string().optional().describe('Слова для поиска, например «онбординг прогресс»'),
    type: z.enum(['картинка', 'видео', 'ролик', 'статья', 'заметка', 'набор', 'музыка', 'закладка']).optional(),
    tag: z.string().optional().describe('Тег из словаря'),
    board: z.string().optional().describe('Подборка владельца'),
    limit: z.number().int().min(1).max(100).optional(),
  },
  annotations: { readOnlyHint: true },
}, async ({ query, type, tag, board, limit = 20 }) => {
  const words = queryStems(query)
  const found = items().filter((meta) => {
    if (type && typeOf(meta) !== type) return false
    if (tag && !tagsOf(meta).some((name) => norm(name) === norm(tag))) return false
    if (board && !placesOf(meta).some((name) => norm(name) === norm(board))) return false
    const haystack = norm([meta.title, meta.description, digestOf(meta), ...commentsOf(meta).map((item) => item.text), meta.author, ...tagsOf(meta), ...(meta.tags ?? [])].join(' '))
    return words.every((word) => haystack.includes(word))
  })
  return text(found.length ? `Нашлось ${found.length}${found.length > limit ? `, показаны ${limit}` : ''}:\n${header}\n${found.slice(0, limit).map(line).join('\n')}` : 'Ничего не нашлось. Попробуй другие слова или refkit_overview.')
})

server.registerTool('refkit_graph', {
  title: 'Найти по смыслу (граф понятий)',
  description: 'Поиск по смыслу через граф понятий, который владелец построил по своим материалам. Находит то, чего нет в словах названия и выжимки: «обратная связь» найдёт материал про отклик интерфейса. Слова запроса сопоставляются с понятиями; в ответе материалы с понятиями, по которым нашлись, и «рядом» — материалы соседних понятий. Без запроса — обзор: главные понятия графа и находки владельца о себе. С параметрами from и to — «как связаны А и Б»: кратчайший путь между двумя понятиями через общие материалы. У каждого понятия метка происхождения: [модель] — вытащила модель из текста, [тег владельца] — владелец подтвердил своим тегом. Дополняет refkit_search, не заменяет: точное название лучше ищет он.',
  inputSchema: {
    query: z.string().optional().describe('Тема или идея своими словами, например «обратная связь» или «анимация с пружинами»'),
    from: z.string().optional().describe('Для пути: первое понятие, например «медиаплеер»'),
    to: z.string().optional().describe('Для пути: второе понятие, например «обратная связь»'),
    limit: z.number().int().min(1).max(50).optional(),
  },
  annotations: { readOnlyHint: true },
}, async ({ query, from, to, limit = 12 }) => {
  const file = readJson('graph.json', { items: {} })
  const all = items()
  const present = new Set(all.map((meta) => meta.id))
  const graph = derive(file.items, present)
  if (!graph.byId.size) return text('Графа понятий ещё нет: владелец строит его в Refkit (страница «Граф», кнопка «Построить граф»). Ищи через refkit_search.')
  const notIn = all.filter((meta) => !file.items?.[meta.id]).length
  const note = notIn ? `\n(В графе ${graph.byId.size} материалов; ещё ${notIn} не разобраны — часть может не найтись.)` : ''
  // Метка происхождения: понятие совпало с тегом владельца → подтверждено им, иначе его вытащила модель
  const provenance = (meta, name) => tagsOf(meta).some((tag) => conceptKey(tag) === conceptKey(name)) ? 'тег владельца' : 'модель'
  if (from && to) {
    const a = findInGraph(graph, from).matched[0]?.concept, b = findInGraph(graph, to).matched[0]?.concept
    if (!a || !b) return text(`В графе нет понятия «${!a ? from : to}». Посмотри refkit_graph без запроса — обзор понятий.${note}`)
    const steps = graphPath(graph, a.key, b.key)
    if (!steps) return text(`«${a.name}» и «${b.name}» не связаны через общие материалы.${note}`)
    const title = (id) => all.find((meta) => meta.id === id)?.title ?? id
    return text([`Путь: «${a.name}»${steps.map((step) => ` → [${title(step.via)}] → «${step.concept.name}»`).join('')}`, 'Каждый шаг — материал, где встречаются оба соседних понятия (id через refkit_search по названию).'].join('\n') + note)
  }
  if (!query || !queryStems(query).length) {
    const top = graph.hubs.slice(0, 25).map((concept) => `${concept.name} ×${concept.count}`).join(' · ')
    // Выводы модели о владельце («Находки о тебе») наружу не отдаются: страница «Память» обещает, что наблюдения видит только агент Refkit (скептик 2026-10-14)
    return text([`Граф: ${graph.byId.size} материалов, ${graph.concepts.length} понятий, общих (из ≥2 материалов) ${graph.hubs.length}.`, `Главные: ${top || 'пока нет общих понятий'}`].filter(Boolean).join('\n') + note)
  }
  const result = findInGraph(graph, query)
  if (!result.direct.length) return text(`По смыслу «${query}» в графе ничего. Попробуй другие слова, refkit_search или refkit_graph без запроса — обзор понятий.${note}`)
  const row = (hit, why) => { const meta = all.find((item) => item.id === hit.id); return meta ? `${line(meta)}  ← ${why}` : null }
  const direct = result.direct.slice(0, limit).map((hit) => { const meta = all.find((item) => item.id === hit.id); return row(hit, `понятия: ${hit.via.slice(0, 3).map((name) => `${name} [${meta ? provenance(meta, name) : 'модель'}]`).join(', ')}`) }).filter(Boolean)
  const near = result.near.slice(0, Math.max(3, Math.floor(limit / 3))).map((hit) => row(hit, `рядом с «${hit.from}»: ${hit.via[0]}`)).filter(Boolean)
  const concepts = result.matched.slice(0, 6).map(({ concept }) => `${concept.name} ×${concept.count}${neighbours(graph, concept.key).slice(0, 3).length ? ` (соседи: ${neighbours(graph, concept.key).slice(0, 3).map((next) => next.concept.name).join(', ')})` : ''}`)
  return text([`Понятия по запросу: ${concepts.join('; ')}`, `Нашлось ${direct.length}:`, header, ...direct, near.length ? `\nРядом (по соседним понятиям):\n${header}\n${near.join('\n')}` : ''].filter(Boolean).join('\n') + note)
})

// Холст (grill-canvas.md): доска словами — рамки с тем, что внутри, карточки вне рамок, подписи и стрелки «откуда → куда».
// Агент читает смысл расположения: что сгруппировано владельцем и что с чем связано; общей картинки доски пока нет —
// отдаём обложки до шести карточек
function canvasText(meta) {
  const data = readJson(join(meta.id, 'canvas.json'), { nodes: [], edges: [] })
  const nodes = data.nodes ?? []
  const size = (node) => ({ w: Number(node.width ?? 220), h: Number(node.height ?? 150) })
  const label = (node) => {
    const data = node.data ?? {}
    if (node.type === 'frame') return `рамка «${data.label || 'без названия'}»`
    if (node.type === 'text') return `подпись «${String(data.text ?? '').replace(/\s+/g, ' ').trim() || 'пусто'}»`
    if (isRunnable(node.type)) return `нода-${mcpLabel(node.type)} «${data.title || 'без названия'}» (${data.status === 'ready' ? 'есть результат' : 'не запускалась'}${data.model ? `; модель: ${data.model}` : ''})`
    if (node.type === 'choice') return `выбор «${data.title || 'без названия'}» (${typeof data.choice === 'number' ? `отмечен вариант ${data.choice + 1}` : 'вариант не выбран'})`
    if (node.type === 'group') return `${data.groupKind === 'folder' ? 'папка' : 'подборка'} «${data.name || 'без названия'}» целиком`
    if (node.type === 'result') return 'результат ноды слева'
    const card = find(data.ref)
    return card ? `карточка «${card.title}» (${card.id}, ${typeOf(card)})` : 'карточка удалена из библиотеки'
  }
  const frames = nodes.filter((node) => node.type === 'frame')
  const inside = (node, frame) => { const { w, h } = size(node), cx = (node.position?.x ?? 0) + w / 2, cy = (node.position?.y ?? 0) + h / 2; const f = size(frame); return cx >= frame.position.x && cx <= frame.position.x + f.w && cy >= frame.position.y && cy <= frame.position.y + f.h }
  const placed = new Set()
  const sections = frames.map((frame) => {
    const members = nodes.filter((node) => node.type !== 'frame' && inside(node, frame))
    members.forEach((node) => placed.add(node.id))
    return `## ${label(frame)}\n${members.map((node) => `- ${label(node)}`).join('\n') || '(пусто)'}`
  })
  const loose = nodes.filter((node) => node.type !== 'frame' && !placed.has(node.id))
  const arrows = (data.edges ?? []).map((edge) => { const from = nodes.find((node) => node.id === edge.source), to = nodes.find((node) => node.id === edge.target); return from && to ? `- ${label(from)} → ${label(to)}` : '' }).filter(Boolean)
  // Результаты агентных нод: что агент ноды уже выдал по входам (текст — целиком, экран — только пометка: это HTML)
  const results = nodes.filter((node) => isRunnable(node.type) && node.data?.result).map((node) => { const full = resultForAgent(node); const link = `refkit_read refkit:canvas/${meta.id}#${node.id}`; return node.type === 'screen' ? `### ${node.data.title ?? 'Экран'}\n(${node.data.screenSource ? 'React/shadcn, TSX' : 'HTML-экран'}, ${full.length} символов; код целиком: ${link})` : `### ${node.data.title ?? 'Агент'}\nИнструкция: ${node.data.instr ?? ''}\n\n${full.slice(0, 6000)}${full.length > 6000 ? `\n… (показано 6000 из ${full.length} символов; целиком: ${link})` : ''}` })
  const body = [
    `# Холст «${meta.title}» (${meta.id})`,
    `Узлов: ${nodes.length}, стрелок: ${arrows.length}. Расположение осмысленно: рамка — группа владельца, стрелка — «бери отсюда / связано с», подпись — его слова.`,
    ...sections,
    loose.length ? `## Вне рамок\n${loose.map((node) => `- ${label(node)}`).join('\n')}` : '',
    arrows.length ? `## Стрелки\n${arrows.join('\n')}` : '',
    results.length ? `## Результаты нод\n${results.join('\n\n')}` : '',
    '\nСодержимое карточек — через refkit_read по id; картинки отдаются ниже (до шести).',
  ].filter(Boolean).join('\n\n')
  // Память холста (library/<id>/memory.json): правила и образцы владельца, видны агенту только здесь
  const memory = readJson(join(meta.id, 'memory.json'), { refs: [], rules: [], decisions: [] })
  const memoryText = [
    memory.rules?.length ? `## Правила холста (владелец их задал, соблюдай)\n${memory.rules.map((rule) => `- ${rule.text}`).join('\n')}` : '',
    memory.refs?.length ? `## Образцы (закреплены владельцем)\n${memory.refs.map((ref) => `- «${ref.title}» (${ref.node})`).join('\n')}` : '',
    memory.decisions?.length ? `## Последние решения владельца\n${memory.decisions.slice(-8).reverse().map((item) => `- ${item.text}`).join('\n')}` : '',
  ].filter(Boolean).join('\n\n')
  const content = [{ type: 'text', text: [body, memoryText].filter(Boolean).join('\n\n') }]
  for (const node of nodes.filter((item) => item.type === 'card').slice(0, 6)) {
    const card = find(node.data?.ref)
    const image = card && typeof card.image === 'string' && card.image.startsWith('/library/') ? join(library, card.image.replace(/^\/library\//, '')) : ''
    if (image && existsSync(image) && imageTypes[extname(image).toLowerCase()]) content.push({ type: 'image', data: readFileSync(image).toString('base64'), mimeType: imageTypes[extname(image).toLowerCase()] })
  }
  return { content }
}

// Правки холста от агента — только предложением (по правилу Refkit «агент предлагает, владелец подтверждает» и «запуск нод только кнопкой владельца»):
// доска не меняется, предложение ложится в canvas.json (proposals) и ждёт «Принять / Отклонить» на самом холсте.
// Правки проверяются теми же правилами, что и в интерфейсе (shared/canvas-graph.mjs), поэтому неверное отклоняется сразу
server.registerTool('refkit_propose_canvas', {
  title: 'Предложить правки холста',
  description: `Предложить владельцу правки холста-цепочки. Доска не меняется: правки ждут «Принять» на холсте. Запускать ноды нельзя — только кнопкой владельца. Читать холст — refkit_read по id холста (refkit:canvas/<id>).
Цепочка строится так: материал или подпись → действие (agent/screen; результат лежит внутри самой ноды) → следующее действие → … ; «choice» — остановка человека между действиями. Типы нод: ${typeIds().join(', ')}.
Операции: add_node {type, id?, position?, width?, height?, data?} · update_node {id, data?, position?, width?, height?} (data — только поля владельца: title, instr, model, text, ref…) · delete_node {id} · connect {source, target} · disconnect {source, target}. connect проверяет типы и циклы: card/text/group/agent/screen/choice → agent|screen, agent|screen → choice.`,
  inputSchema: {
    canvas: z.string().describe('id холста'),
    why: z.string().describe('Что и зачем — одной-двумя фразами, владелец увидит над холстом'),
    ops: z.array(z.object({
      op: z.enum(['add_node', 'update_node', 'delete_node', 'connect', 'disconnect']),
      id: z.string().optional(), type: z.string().optional(),
      position: z.object({ x: z.number(), y: z.number() }).optional(),
      width: z.number().optional().describe('Ширина ноды; у карточки материала без размера будет плашка, для картинки ставь ≈260×170'),
      height: z.number().optional(),
      data: z.record(z.string(), z.any()).optional(),
      source: z.string().optional(), target: z.string().optional(),
    })).min(1).describe('Список правок по порядку'),
  },
}, async ({ canvas, why, ops }) => {
  const meta = find(canvas)
  if (!meta || meta.kind !== 'canvas') return { ...text(`Холста ${canvas} нет.`), isError: true }
  const file = join(meta.id, 'canvas.json')
  const data = readJson(file, { nodes: [], edges: [] })
  const at = Date.now()
  // Свободные id нужны сразу: «Показать» на холсте и «Принять» должны сходиться
  const filled = ops.map((op, index) => op.op === 'add_node' && !op.id ? { ...op, id: `ag-${op.type ?? 'node'}-${at.toString(36)}${index}` } : op)
  const check = applyOps({ nodes: data.nodes ?? [], edges: data.edges ?? [] }, filled)
  if (check.error) return { ...text(`Не предложено: ${check.error}`), isError: true }
  const proposals = [...(data.proposals ?? []), { id: `p-${at.toString(36)}`, by: clientName() || 'агент', at, note: why, ops: filled }]
  writeJson(file, { ...data, proposals })
  return text(`Предложено правок: ${filled.length}. Владелец увидит их над холстом «${meta.title}» и примет или отклонит. Запустить ноды можно только ему.`)
})

server.registerTool('refkit_read', {
  title: 'Прочитать материал',
  description: 'Материал целиком: источник, суть, выжимка «главное / как применить», текст (статья, расшифровка, заметка), теги, подборки. У картинки — сама картинка.',
  inputSchema: { id: z.string().describe('id из refkit_search или ссылка холста refkit:canvas/<id>') },
  annotations: { readOnlyHint: true },
}, async ({ id }) => {
  const meta = find(id)
  if (!meta) return { ...text(`Материала ${id} нет. Найди id через refkit_search.`), isError: true }
  if (meta.kind === 'canvas') {
    // refkit:canvas/<id>#<нода> — результат одной ноды целиком (текст как есть, экран — HTML в блоке кода)
    const nodeId = String(id).split('#')[1]?.trim()
    if (nodeId) {
      const node = (readJson(join(meta.id, 'canvas.json'), { nodes: [] }).nodes ?? []).find((item) => item.id === nodeId)
      if (!node || !node.data?.result) return { ...text(`В ноде ${nodeId} холста «${meta.title}» нет результата. Список нод — refkit_read refkit:canvas/${meta.id}.`), isError: true }
      const body = resultForAgent(node)
      const react = Boolean(node.data.screenSource)
      return text([`# ${node.data.title ?? nodeId} (холст «${meta.title}»)`, node.data.instr ? `Инструкция: ${node.data.instr}` : '', node.type === 'screen' ? `${react ? 'React/shadcn, исходник TSX' : 'HTML экрана'} (${body.length} символов):\n\n\`\`\`${react ? 'tsx' : 'html'}\n${body}\n\`\`\`` : body].filter(Boolean).join('\n\n'))
    }
    return canvasText(meta)
  }
  const file = join(library, meta.id, 'text.txt')
  const body = existsSync(file) ? readFileSync(file, 'utf8') : ''
  const content = [{ type: 'text', text: [
    `# ${meta.title}`,
    `Тип: ${typeOf(meta)}${meta.source ? ` · источник: ${meta.source}` : ''}${meta.author ? ` · ${meta.author}` : ''}`,
    tagsOf(meta).length ? `Теги: ${tagsOf(meta).join(', ')}` : '',
    placesOf(meta).length ? `Space и подборки: ${placesOf(meta).join(', ')}` : '',
    commentsOf(meta).length > 1 ? `Комментарии владельца:\n${commentsText(meta)}` : commentsOf(meta).length ? `Заметка владельца: ${commentsOf(meta)[0].text}` : '',
    meta.description ? `Описание: ${meta.description}` : '',
    digestOf(meta) ? `\nВыжимка:\n${digestOf(meta)}` : '\nВыжимки пока нет.',
    meta.sources?.length ? `\nСобрано из: ${meta.sources.map((source) => `${find(source)?.title ?? source} (${source})`).join(', ')}` : '',
    body ? `\nТекст:\n${body.slice(0, 30000)}` : '',
  ].filter(Boolean).join('\n') }]
  const image = typeof meta.image === 'string' && meta.image.startsWith('/library/') ? join(library, meta.image.replace(/^\/library\//, '')) : ''
  if (image && existsSync(image) && imageTypes[extname(image).toLowerCase()]) content.push({ type: 'image', data: readFileSync(image).toString('base64'), mimeType: imageTypes[extname(image).toLowerCase()] })
  return { content }
})

server.registerTool('refkit_board', {
  title: 'Space или подборка как контекст',
  description: 'Все материалы space или подборки владельца с сутью и выжимками — чтобы работать в своём проекте с учётом этой подборки («подключи мой „Моушен“»).',
  inputSchema: { name: z.string().describe('Название space (например «Fabric Ideas») или подборки владельца') },
  annotations: { readOnlyHint: true },
}, async ({ name }) => {
  // Сначала space (v2), потом старая подборка
  const space = readJson('folders.json', []).find((item) => norm(item.name) === norm(name))
  if (space) {
    const inSpace = items().filter((meta) => spaceOf(meta) === space.name)
    return text(`Space «${space.name}»${space.description ? ` — ${space.description}` : ''}, ${inSpace.length} материалов:\n\n${inSpace.map((meta) => `## ${meta.title} (${meta.id}, ${typeOf(meta)})\n${digestOf(meta) || essenceOf(meta)}`).join('\n\n')}\n\nКартинки смотри через refkit_read по id.`)
  }
  const boards = readJson('boards.json', [])
  const board = boards.find((item) => norm(item.name) === norm(name))
  if (!board) return { ...text(`Ни space, ни подборки «${name}» нет. Spaces: ${readJson('folders.json', []).map((item) => item.name).join(', ') || 'нет'}. Подборки: ${boards.map((item) => item.name).join(', ') || 'нет'}.`), isError: true }
  const all = items()
  // Состав — по полю boards у материала (как в Refkit); order — только порядок, в нём бывают устаревшие id
  const inBoard = all.filter((meta) => meta.boards?.includes(board.name))
  const members = (board.order ?? []).map((id) => inBoard.find((meta) => meta.id === id)).filter(Boolean)
  const rest = inBoard.filter((meta) => !members.includes(meta))
  return text(`Подборка «${board.name}», ${members.length + rest.length} материалов:\n\n${[...members, ...rest].map((meta) => `## ${meta.title} (${meta.id}, ${typeOf(meta)})\n${digestOf(meta) ?? meta.description ?? ''}`).join('\n\n')}`)
})

// ── Изменения: только очередь и предложения ─────────────────────────────────
server.registerTool('refkit_save', {
  title: 'Сохранить в Refkit',
  description: 'Положить ссылку, заметку или локальную картинку в библиотеку. Уходит в очередь: Refkit разложит (название, теги) при запуске или в течение минуты. Картинка — file: абсолютный путь к png/jpg/webp/gif до 20 МБ; копия остаётся в библиотеке, исходник можно удалять. Пачку шли подряд, по одному вызову на файл; потом refkit_search найдёт их по названию, а refkit_propose_board предложит положить всю пачку в подборку одним подтверждением.',
  inputSchema: {
    url: z.string().url().optional().describe('Ссылка: статья, ролик, пин, трек'),
    text: z.string().optional().describe('Текст заметки, пояснение к ссылке или описание картинки'),
    file: z.string().optional().describe('Абсолютный путь к картинке на этом компьютере'),
  },
}, async ({ url, text: note, file }) => {
  if (file) {
    const stat = (() => { try { const info = statSync(file); return { isFile: info.isFile(), size: info.size } } catch { return null } })()
    const problem = imageFileProblem(file, extname(file), stat)
    if (problem) return { ...text(problem), isError: true }
    // Путь агента может исчезнуть (временная папка) — копия в библиотеку; Refkit заберёт её и удалит
    const folder = join(library, '.inbox-files')
    mkdirSync(folder, { recursive: true })
    const copy = join(folder, `${Date.now()}-${Math.random().toString(36).slice(2, 6)}-${basename(file).replace(/[^\w.\-а-яё]+/gi, '_')}`)
    copyFileSync(file, copy)
    appendFileSync(join(library, '.queue.jsonl'), JSON.stringify({ file: copy, ...(note?.trim() ? { text: note.trim() } : {}), via: 'mcp', at: new Date().toISOString() }) + '\n')
    return text(`В очереди Refkit: картинка ${basename(file)}. Название и теги появятся в течение минуты (Refkit должен быть запущен).`)
  }
  if (!url && !note?.trim()) return { ...text('Нужна ссылка, текст или file.'), isError: true }
  appendFileSync(join(library, '.queue.jsonl'), JSON.stringify({ ...(url ? { url, text: note } : { text: note }), via: 'mcp', at: new Date().toISOString() }) + '\n')
  return text(`В очереди Refkit: ${url ?? note.slice(0, 80)}`)
})

server.registerTool('refkit_suggest_memory', {
  title: 'Предложить строку памяти',
  description: 'Владелец поправил тебя или сказал, как ему удобнее (длина, тон, формат, как называть)? Предложи это строкой памяти — одной фразой, в повелительном наклонении. Запомнится после подтверждения владельца в Refkit и дальше будет работать у любого его агента.',
  inputSchema: { text: z.string().min(3).max(200) },
}, async ({ text: value }) => {
  const offers = readJson('memory-offers.json', [])
  if (!offers.some((item) => norm(item.text) === norm(value))) writeJson('memory-offers.json', [...offers, { id: `o-${Date.now()}`, text: value.trim(), at: Date.now(), from: 'внешний агент' }])
  return text('Предложено. Владелец подтвердит в Refkit — «Память → О тебе».')
})

server.registerTool('refkit_propose_change', {
  title: 'Предложить правку',
  description: 'Предложить новое название, описание, теги или подборки материала. По правам владельца: «спрашивать» — правка ждёт его ✓ в Refkit (панель агента библиотеки); «можно» — применяется сразу, с отменой. Удалять нельзя.',
  inputSchema: {
    id: z.string(),
    field: z.enum(['title', 'description', 'tags', 'boards']),
    value: z.string().describe('Новое значение; теги и подборки — через «; »'),
    why: z.string().describe('Почему — одной фразой, владелец увидит'),
  },
}, async ({ id, field, value, why }) => {
  const meta = find(id)
  if (!meta) return { ...text(`Материала ${id} нет.`), isError: true }
  const key = field === 'tags' ? 'collections' : field
  const many = key === 'collections' || key === 'boards'
  const to = many ? value.split(';').map((item) => item.trim()).filter(Boolean) : value.trim()
  // Новый тег — только через ✓ владельца (идея 54), даже при «можно»: принятие в Refkit заодно заведёт его в словарь
  const dictionary = readJson('collections.json', []).map((tag) => norm(tag.name))
  const newTag = key === 'collections' && to.some((name) => !dictionary.includes(norm(name)))
  const allowed = readPermissions().library === 'allow' && !newTag
  const at = Date.now()
  const change = { id: `${at}-0`, card: id, field: key, from: meta[key] ?? (many ? [] : ''), to, status: allowed ? 'applied' : 'pending' }
  if (allowed) writeFileSync(join(library, id, 'meta.json'), JSON.stringify({ ...meta, [key]: to, ...(key === 'title' ? { titleEdited: true } : {}) }, null, 2) + '\n')
  // Правка ложится ответом в ленту агента библиотеки — там те же ✓ ×, «Отменить»
  const state = { conversation: 0, thread: [], ...readJson('agent.json', {}) }
  writeJson('agent.json', { ...state, thread: [...state.thread, { command: 'Правка от внешнего агента', answer: `[${meta.title}](card:${id}): ${why}`, at, conversation: state.conversation, changes: [change] }] })
  return text(allowed ? 'Применено (владелец может отменить в Refkit).' : 'Предложено: ждёт подтверждения владельца в Refkit.')
})

// Пачка материалов → одна подборка: один ответ в ленте агента, внутри правка на каждый материал, группа с одним ✓ (панель агента)
server.registerTool('refkit_propose_board', {
  title: 'Предложить положить материалы в подборку',
  description: 'Положить несколько материалов (список id) в существующую подборку владельца одним предложением: он подтверждает всю группу одним ✓ в Refkit. По правам: «спрашивать» — ждёт ✓, «можно» — применяется сразу, с отменой. Новую подборку завести нельзя, удалять нельзя.',
  inputSchema: {
    ids: z.array(z.string()).min(1).max(100).describe('id материалов'),
    board: z.string().describe('Название существующей подборки'),
    why: z.string().describe('Почему — одной фразой, владелец увидит'),
  },
}, async ({ ids, board, why }) => {
  const target = readJson('boards.json', []).find((item) => norm(item.name) === norm(board))
  if (!target) return { ...text(`Подборки «${board}» нет. Есть: ${readJson('boards.json', []).filter((item) => !item.shelf).map((item) => item.name).join(', ') || 'нет'}. Новую заводит владелец.`), isError: true }
  if (target.shelf) return { ...text('«Под рукой» — полка владельца, туда предлагать нельзя.'), isError: true }
  const found = [...new Set(ids)].map((id) => find(id)).filter(Boolean)
  const missing = [...new Set(ids)].filter((id) => !find(id))
  if (!found.length) return { ...text(`Ни одного материала не нашёл: ${missing.join(', ')}`), isError: true }
  const allowed = readPermissions().library === 'allow'
  const at = Date.now()
  const changes = found.map((meta, index) => {
    const to = withBoard(meta.boards, target.name)
    if (allowed) writeFileSync(join(library, meta.id, 'meta.json'), JSON.stringify({ ...meta, boards: to }, null, 2) + '\n')
    return { id: `${at}-${index}`, card: meta.id, field: 'boards', from: meta.boards ?? [], to, label: target.name, status: allowed ? 'applied' : 'pending' }
  })
  const state = { conversation: 0, thread: [], ...readJson('agent.json', {}) }
  writeJson('agent.json', { ...state, thread: [...state.thread, { command: 'Правка от внешнего агента', answer: `В подборку «${target.name}» — ${found.length} материалов: ${why}`, at, conversation: state.conversation, changes }] })
  return text(`${allowed ? 'Применено' : 'Предложено: ждёт одного подтверждения владельца в Refkit'} — ${found.length} в «${target.name}».${missing.length ? ` Не найдены: ${missing.join(', ')}.` : ''}`)
})

// ── Создание: только при праве «можно» (library/permissions.json → library: allow) ──────────────────
// Что агент может завести сам: папку, пустой холст, перенос материалов в папку. Удалять и переименовывать он по-прежнему не может.
// Право «спрашивать» (по умолчанию) — инструмент отказывает и подсказывает, что включить.
const needAllow = () => readPermissions().library === 'allow' ? null : { ...text('Права агента сейчас «спрашивать»: сам завести или перенести ничего не могу. Включи «можно» в Refkit (Права агента) или сделай сам и назови мне.'), isError: true }
const foldersOrError = () => {
  if (!existsSync(join(library, 'folders.json'))) return { error: { ...text('В библиотеке ещё нет папок: запусти Refkit один раз, он создаст «Входящие».'), isError: true } }
  return { folders: readJson('folders.json', []) }
}
const spaceNames = (folders) => folders.map((folder) => folder.name).join(', ')

server.registerTool('refkit_create_space', {
  title: 'Завести папку',
  description: 'Создать папку (space) в библиотеке владельца; parent — имя папки, куда вложить. Уже есть папка с таким именем — вернёт её, дубль не создаст. Работает только при праве агента «можно».',
  inputSchema: { name: z.string().min(1).max(80), parent: z.string().optional().describe('Имя родительской папки (не «Входящие»)') },
}, async ({ name, parent }) => {
  const denied = needAllow(); if (denied) return denied
  const { folders, error } = foldersOrError(); if (error) return error
  const result = addSpace(folders, name, parent)
  if (result.error) return { ...text(result.error), isError: true }
  if (result.created) writeJson('folders.json', result.folders)
  return text(`${result.created ? 'Создана' : 'Уже есть'} папка «${result.folder.name}».`)
})

server.registerTool('refkit_create_canvas', {
  title: 'Завести пустой холст',
  description: 'Создать пустой холст в папке владельца (по умолчанию «Входящие») и вернуть его id: дальше его наполняют через refkit_propose_canvas. Работает только при праве агента «можно».',
  inputSchema: { title: z.string().min(1).max(80), space: z.string().optional().describe('Имя папки, куда положить холст') },
}, async ({ title, space }) => {
  const denied = needAllow(); if (denied) return denied
  const { folders, error } = foldersOrError(); if (error) return error
  const target = space ? findSpace(folders, space) : folders.find((folder) => folder.inbox)
  if (!target) return { ...text(`Папки «${space}» нет. Есть: ${spaceNames(folders)}.`), isError: true }
  const id = freeId((candidate) => existsSync(join(library, candidate)))
  mkdirSync(join(library, id), { recursive: true })
  writeJson(`${id}/meta.json`, canvasMeta({ id, title, folderId: target.id }))
  writeJson(`${id}/canvas.json`, { nodes: [], edges: [] })
  return text(`Создан холст «${title.trim()}» в «${target.name}»: refkit:canvas/${id}`)
})

server.registerTool('refkit_move', {
  title: 'Перенести материалы в папку',
  description: 'Перенести материалы (список id) в существующую папку владельца: у материала меняется папка, теги и подборки остаются. Работает только при праве агента «можно». Новую папку заводит refkit_create_space.',
  inputSchema: { ids: z.array(z.string()).min(1).max(100), space: z.string().describe('Имя существующей папки') },
}, async ({ ids, space }) => {
  const denied = needAllow(); if (denied) return denied
  const { folders, error } = foldersOrError(); if (error) return error
  const target = findSpace(folders, space)
  if (!target) return { ...text(`Папки «${space}» нет. Есть: ${spaceNames(folders)}.`), isError: true }
  const unique = [...new Set(ids)]
  const found = unique.map((id) => find(id)).filter(Boolean)
  const missing = unique.filter((id) => !find(id))
  if (!found.length) return { ...text(`Ни одного материала не нашёл: ${missing.join(', ')}`), isError: true }
  for (const meta of found) writeJson(`${meta.id}/meta.json`, { ...meta, folder: target.id })
  return text(`Перенесено в «${target.name}»: ${found.length}.${missing.length ? ` Не найдены: ${missing.join(', ')}.` : ''}`)
})

await server.connect(new StdioServerTransport())
