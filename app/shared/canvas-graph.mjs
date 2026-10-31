// Чистая логика графа холста — без чтения файлов и без модели, поэтому проверяется тестами.
// Ноды и правила берутся из реестра (shared/canvas-nodes.mjs); library-plugin.ts держит только ввод-вывод и запуск.
import { accepts, connectionError, isRunnable, nodeDef, portOf, runnableTypes, serverFields, stripDerived } from './canvas-nodes.mjs'


export const AGENT_TYPES = runnableTypes()

// Варианты результата («Концепты»): верхние пункты списка; владелец выбирает один — дальше по цепочке идёт только он
export const splitBy = (text, start) => text.split(new RegExp(`^(?=${start.source})`, 'm')).map((part) => part.trim()).filter((part) => start.test(part))
// Если модель не поставила номера или маркеры, вариантом считается абзац, что начинается с жирного заголовка
export const splitItems = (text) => { const listed = splitBy(text, /(?:[-*]\s+|\*{0,2}\d+[.)]\s+)/); return listed.length >= 2 ? listed : splitBy(text, /\*\*[^*\n]+\*\*/) }

export const canvasNode = (data, id) => data.nodes.find((node) => String(node.id) === id)

// Входы ноды: материалы-источники (карточка, подпись, подборка) — по связи в любую сторону; остальные — только если связь идёт в эту ноду
// и реестр разрешает такой вход
export function canvasInputs(data, nodeId) {
  const self = canvasNode(data, nodeId)
  const found = []
  for (const edge of data.edges) {
    const other = edge.source === nodeId ? edge.target : edge.target === nodeId ? edge.source : undefined
    const node = data.nodes.find((item) => item.id === other)
    if (!node || found.includes(node)) continue
    if (nodeDef(node.type)?.source) found.push(node)
    else if (edge.target === nodeId && self && accepts(self, node)) found.push(node)
  }
  // «Список» прозрачен для остальных нод: вместо него на вход идут его участники (любые ноды), и результаты, и очередь запуска видят их напрямую
  const expanded = []
  const seen = new Set()
  const take = (node) => {
    if (seen.has(node.id) || node.id === nodeId) return
    seen.add(node.id)
    if (node.type === 'group' && node.data?.groupKind === 'list') {
      for (const memberId of node.data.contains ?? []) { const member = data.nodes.find((item) => item.id === memberId); if (member) take(member) }
    } else expanded.push(node)
  }
  found.forEach(take)
  const at = (node) => [node.position?.y ?? 0, node.position?.x ?? 0]
  return expanded.sort((a, b) => at(a)[1] - at(b)[1] || at(a)[0] - at(b)[0]).map(withActive)
}

// Версии результата: хронологически history[0…n-1] и текущий (последний) запуск. activeAt — какую версию читают соседи по цепочке; без него (или
// указывает на последнюю) — последний запуск. Так стрелки версий на ноде и есть «сделать текущей»: показанная версия — та, что идёт дальше
export const ACTIVE_FIELDS = ['result', 'screenSource', 'imageFile', 'ranAt', 'ranHash', 'usage']
export function activeData(node) {
  const data = node.data ?? {}
  const history = data.history
  const at = data.activeAt
  if (!Array.isArray(history) || typeof at !== 'number' || at < 0 || at >= history.length) return data
  const version = history[at] ?? {}
  return { ...data, ...Object.fromEntries(ACTIVE_FIELDS.map((key) => [key, version[key]])) }
}
export const withActive = (node) => (typeof node.data?.activeAt === 'number' ? { ...node, data: activeData(node) } : node)

// Нода «Результат» ничего не хранит: это окно на результат агентной ноды, что подключена к ней слева
export const actionOf = (data, result) => canvasInputs(data, String(result.id)).find((node) => isRunnable(node.type))

// Варианты для ноды «Выбор»: пункты списка из результата агентной ноды, что подключена к ней слева
export function choiceItems(data, choice) {
  const input = canvasInputs(data, String(choice.id)).find((node) => isRunnable(node.type) || node.type === 'result')
  const source = input?.type === 'result' ? actionOf(data, input) : input
  return source?.data?.result ? splitItems(String(source.data.result)) : []
}

// Какие ноды-действия стоят выше по цепочке (через результаты и «Выбор»): по ним строится очередь запуска
export function upstreamActions(data, node) {
  const found = []
  const visit = (current, depth) => {
    for (const input of canvasInputs(data, String(current.id))) {
      if (isRunnable(input.type)) found.push(String(input.id))
      else if (input.type === 'result') { const from = actionOf(data, input); if (from) found.push(String(from.id)) }
      else if (input.type === 'choice' && depth < 3) visit(input, depth + 1)
    }
  }
  visit(node, 0)
  return found
}

// Сохранение доски клиентом: у каждой ноды вычисляемые поля убираем, серверные (результат, статус, история) берём с диска,
// чтобы устаревшая копия страницы не затёрла результат запуска
export function mergeIncoming(disk, incoming) { return mergeWithTrash(disk, incoming, {}).nodes }

// Корзина серверных полей: удалили ноду на доске — результат, версии и статус уходят в «корзину» холста, а не в никуда. Клиент присылает ноду без этих
// полей (их ему принадлежать не должно), поэтому «удалил → ⌘Z» раньше возвращал пустую ноду. Теперь нода с тем же id получает свои поля обратно
const TRASH_LIMIT = 12
export function mergeWithTrash(disk, incoming, trash = {}) {
  const ids = new Set(incoming.map((node) => String(node.id)))
  const next = { ...trash }
  for (const old of disk) {
    if (ids.has(String(old.id)) || !nodeDef(old.type)) continue
    const keep = {}
    for (const key of serverFields(old.type)) if (old.data?.[key] !== undefined) keep[key] = old.data[key]
    if (Object.keys(keep).length) next[String(old.id)] = { type: old.type, at: Date.now(), keep }
  }
  const nodes = incoming.map((node) => {
    if (!nodeDef(node.type)) return node
    const data = stripDerived(node.type, node.data ?? {})
    const old = disk.find((item) => item.id === node.id)
    for (const key of serverFields(node.type)) if (old?.data?.[key] !== undefined) data[key] = old.data[key]
    // Копия ноды: у новой ноды с copyOf серверные поля (результат, история, цена…) берутся у источника, а не пустыми
    const from = !old && data.copyOf ? disk.find((item) => String(item.id) === String(data.copyOf) && item.type === node.type) : undefined
    if (from) for (const key of serverFields(node.type)) if (from.data?.[key] !== undefined) data[key] = JSON.parse(JSON.stringify(from.data[key]))
    delete data.copyOf
    const back = !old ? next[String(node.id)] : undefined
    if (back && back.type === node.type) { Object.assign(data, back.keep); delete next[String(node.id)] }
    return { ...node, data }
  })
  const kept = Object.entries(next).sort((a, b) => b[1].at - a[1].at).slice(0, TRASH_LIMIT)
  return { nodes, trash: Object.fromEntries(kept) }
}

// ── Правки одним языком для людей и агентов ──────────────────────────────────
// Операции применяются к копии доски по порядку; первая неверная останавливает всё и возвращается причиной — частично применённых правок нет.
// Те же проверки соединений, что и в интерфейсе (реестр)
// Размер и позиция: add_node и update_node принимают width, height (в пикселях доски) и position. Без размера карточка
// материала рисуется плашкой в одну строку — картинкой она становится только с размером (у ручных карточек это 260×170)
const clampSize = (value, min, max) => Math.min(max, Math.max(min, Math.round(value)))
const sizeOf = (op) => ({
  ...(Number.isFinite(op.width) ? { width: clampSize(op.width, 60, 2000) } : {}),
  ...(Number.isFinite(op.height) ? { height: clampSize(op.height, 20, 2000) } : {}),
})
const validPosition = (position) => position && Number.isFinite(position.x) && Number.isFinite(position.y)
export function applyOps(data, ops) {
  const next = { ...data, nodes: data.nodes.map((node) => ({ ...node, data: { ...node.data } })), edges: data.edges.map((edge) => ({ ...edge })) }
  let counter = 0
  const newId = (type) => `ag-${type}-${Date.now().toString(36)}${(counter++).toString(36)}`
  for (const [index, op] of ops.entries()) {
    const at = `правка ${index + 1} (${op.op})`
    if (op.op === 'add_node') {
      if (!nodeDef(op.type)) return { data, error: `${at}: нет типа «${op.type}»` }
      if (nodeDef(op.type).legacy) return { data, error: `${at}: отдельной ноды «${nodeDef(op.type).label}» больше нет — результат лежит внутри ноды-действия` }
      const id = op.id ?? newId(op.type)
      if (canvasNode(next, id)) return { data, error: `${at}: нода «${id}» уже есть` }
      const def = nodeDef(op.type)
      next.nodes.push({ id, type: op.type, position: op.position ?? { x: 0, y: 0 }, ...sizeOf(op), data: stripDerived(op.type, op.data ?? (def.runnable ? { title: def.label, instr: '' } : {})) })
    } else if (op.op === 'update_node') {
      const node = canvasNode(next, op.id)
      if (!node) return { data, error: `${at}: нет ноды «${op.id}»` }
      const allowed = new Set(nodeDef(node.type)?.fields.client ?? [])
      const bad = Object.keys(op.data ?? {}).find((key) => !allowed.has(key))
      if (bad) return { data, error: `${at}: поле «${bad}» у «${node.type}» менять нельзя` }
      if (op.position !== undefined && !validPosition(op.position)) return { data, error: `${at}: position должна быть { x, y } числами` }
      if (op.data === undefined && op.position === undefined && !Object.keys(sizeOf(op)).length) return { data, error: `${at}: нечего менять (нужны data, position, width или height)` }
      node.data = { ...node.data, ...(op.data ?? {}) }
      if (op.position) node.position = { x: op.position.x, y: op.position.y }
      Object.assign(node, sizeOf(op))
    } else if (op.op === 'delete_node') {
      if (!canvasNode(next, op.id)) return { data, error: `${at}: нет ноды «${op.id}»` }
      next.nodes = next.nodes.filter((node) => node.id !== op.id)
      next.edges = next.edges.filter((edge) => edge.source !== op.id && edge.target !== op.id)
    } else if (op.op === 'connect') {
      const reason = connectionError(canvasNode(next, op.source), canvasNode(next, op.target), next.edges)
      if (reason) return { data, error: `${at}: ${reason}` }
      const target = canvasNode(next, op.target)
      if (nodeDef(target.type)?.single) next.edges = next.edges.filter((edge) => edge.target !== op.target)
      next.edges.push({ id: `e-${op.source}-${op.target}`, source: op.source, target: op.target })
    } else if (op.op === 'disconnect') {
      const before = next.edges.length
      next.edges = next.edges.filter((edge) => !(edge.source === op.source && edge.target === op.target))
      if (next.edges.length === before) return { data, error: `${at}: такой связи нет` }
    } else return { data, error: `${at}: неизвестная правка` }
  }
  return { data: next }
}

export { accepts, portOf }

// Старые доски: результат был отдельной нодой справа от действия. Теперь результат внутри самого действия — убираем такие ноды,
// а связи «результат → дальше» переводим на само действие. Идемпотентно: на новых досках ничего не делает
// Старые списки хранили состав как id материалов (items) и сами были «плиткой» без нод. Теперь список держит живые ноды (contains):
// для каждого материала заводится карточка-участник, список остаётся с тем же id и теми же связями
export function migrateLists(data) {
  const old = data.nodes.filter((node) => node.type === 'group' && node.data?.groupKind === 'list' && Array.isArray(node.data.items) && !node.data.contains)
  if (!old.length) return data
  const made = []
  const nodes = data.nodes.map((node) => {
    if (!old.includes(node)) return node
    const refs = node.data.items.map(String)
    const ids = refs.map((ref, at) => {
      const id = `${node.id}-m${at}`
      made.push({ id, type: 'card', position: { x: (node.position?.x ?? 0) + (at % 4) * 280, y: (node.position?.y ?? 0) + Math.floor(at / 4) * 200 }, width: 260, height: 170, data: { ref } })
      return id
    })
    const { items, ...rest } = node.data
    return { ...node, data: { ...rest, contains: ids, open: false } }
  })
  return { ...data, nodes: [...nodes, ...made] }
}
export function migrateResults(data) {
  const results = data.nodes.filter((node) => node.type === 'result')
  if (!results.length) return data
  const edges = data.edges.map((edge) => ({ ...edge }))
  const drop = new Set(results.map((node) => String(node.id)))
  const source = new Map()
  for (const result of results) {
    const from = edges.find((edge) => edge.target === result.id && data.nodes.find((node) => node.id === edge.source && isRunnable(node.type)))
    if (from) source.set(String(result.id), from.source)
  }
  const out = []
  const seen = new Set()
  for (const edge of edges) {
    let { source: from, target: to } = edge
    if (drop.has(String(to))) continue // действие → результат: связь исчезает вместе с нодой
    if (drop.has(String(from))) from = source.get(String(from))
    if (!from || drop.has(String(to))) continue
    const key = `${from}>${to}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ ...edge, source: from, target: to, id: edge.id && !drop.has(String(edge.source)) ? edge.id : `e-${from}-${to}` })
  }
  return { ...data, nodes: data.nodes.filter((node) => !drop.has(String(node.id))), edges: out }
}
