// Реестр нод холста — единственное место, где описано, какие бывают ноды, что они принимают и чьи у них поля.
// Обычный ESM без зависимостей, чтобы его читали все: клиент (Vite), серверный плагин и MCP на чистом Node.
// Ноду добавляют записью сюда; списки серверных полей, правила соединений и подписи выводятся отсюда.
//
// fields: client — хранит и правит владелец (сохраняется с доской); server — пишет сервер при запуске (клиент не затирает);
//         computed — считается на лету при отдаче доски клиенту и на диск не пишется.
// inputs — типы нод, которые эта нода принимает на вход; single — вход только один (новая связь заменяет старую).
// legacyInputs — старые доски соединяли действия напрямую (без «Результата»): сервер такой вход читает, а новые связи интерфейс так не создаёт;
// source — материал-источник: подключается к входу в любом направлении (у него только выход);
// runnable — нода запускается моделью; output — что отдаёт запуск.

/** @typedef {'material' | 'text' | 'screen' | 'image'} Port */

const AGENT_FIELDS = {
  client: ['brandConcepts', 'brandVisual', 'brandSeed', 'brandWordmark', 'brandMonogram', 'title', 'instr', 'actionId', 'model', 'designSystem', 'web', 'gate', 'autoPick', 'asAsset', 'asFrame', 'frameIndex', 'frameTitle', 'frameFolder', 'pick', 'choice', 'sized', 'comments', 'closedComments', 'review', 'remember'],
  server: ['status', 'result', 'screenSource', 'imageFile', 'error', 'ranAt', 'ranHash', 'usage', 'runStartedAt', 'history', 'appliedEdits', 'activeAt', 'frameRef', 'actions', 'held'],
  computed: ['stale', 'estimateK', 'estimateMin', 'modelLabel', 'inputNames', 'inputRefs', 'context', 'items', 'needsChoice', 'productName'],
}

export const NODE_TYPES = {
  card: { source: true, label: 'Материал', mcpLabel: 'карточка', group: 'Материалы', port: 'material', inputs: [], fields: { client: ['ref'], server: [], computed: [] }, thumb: 'box' },
  text: { source: true, label: 'Подпись', mcpLabel: 'подпись', group: 'Ноды', port: 'text', inputs: [], fields: { client: ['text', 'fresh'], server: [], computed: [] }, thumb: 'text' },
  frame: { label: 'Рамка', mcpLabel: 'рамка', group: 'Ноды', port: 'text', inputs: [], fields: { client: ['label', 'members', 'hue'], server: [], computed: [] }, thumb: 'frame' },
  group: { source: true, label: 'Подборка', mcpLabel: 'подборка', group: 'Библиотека', port: 'material', inputs: [], fields: { client: ['groupKind', 'key', 'name', 'contains', 'open', 'sized', 'view', 'filter'], server: [], computed: ['count', 'members'] }, thumb: 'box' },
  agent: { label: 'Агент', mcpLabel: 'агент', group: 'Ноды', port: 'text', inputs: ['card', 'group', 'text', 'agent', 'screen', 'image', 'choice'], runnable: true, output: 'text', fields: AGENT_FIELDS, thumb: 'box' },
  screen: { label: 'Экран', mcpLabel: 'экран', group: 'Ноды', port: 'screen', inputs: ['card', 'group', 'text', 'agent', 'screen', 'image', 'choice'], runnable: true, output: 'html', fields: AGENT_FIELDS, thumb: 'box' },
  // Картинка: Codex (подписка ChatGPT) рисует одну картинку по инструкции и входам; файл — в imageFile, в библиотеку — кнопкой «Сохранить»
  image: { label: 'Картинка', mcpLabel: 'картинка', group: 'Ноды', port: 'image', inputs: ['card', 'group', 'text', 'agent', 'screen', 'image', 'choice'], runnable: true, output: 'image', fields: AGENT_FIELDS, thumb: 'box' },
  choice: { label: 'Выбор', mcpLabel: 'выбор', group: 'Ноды', port: 'text', inputs: ['agent', 'screen'], single: true, fields: { client: ['title', 'choice', 'sized'], server: [], computed: ['items', 'sourceId', 'sourceRunning', 'productName'] }, thumb: 'box' },
  // Старый тип: раньше результат жил отдельной нодой справа. Теперь результат внутри самой ноды-действия (как у Magnific: нода = промпт + результат);
  // старые доски при чтении переводятся (migrateResults), новые такие ноды не создаются
  result: { label: 'Результат', mcpLabel: 'результат', group: 'Ноды', port: 'text', inputs: ['agent', 'screen'], single: true, viewOnly: true, legacy: true, fields: { client: [], server: [], computed: ['from', 'kind', 'title', 'status', 'result', 'error', 'ranAt', 'usage', 'runStartedAt', 'stale', 'modelLabel', 'history'] }, thumb: 'box' },
}

export const typeIds = () => Object.keys(NODE_TYPES)
export const nodeDef = (type) => NODE_TYPES[String(type)]
export const isRunnable = (type) => Boolean(nodeDef(type)?.runnable)
export const runnableTypes = () => typeIds().filter(isRunnable)
export const serverFields = (type) => nodeDef(type)?.fields.server ?? []
export const derivedFields = (type) => [...(nodeDef(type)?.fields.server ?? []), ...(nodeDef(type)?.fields.computed ?? [])]

/** Тип порта у выхода ноды: материал, текст или экран. У «Результата» — по виду ноды-источника (kind). */
export function portOf(node) {
  if (!node) return 'text'
  if (node.type === 'result') return node.data?.kind === 'screen' ? 'screen' : 'text'
  return nodeDef(node.type)?.port ?? 'text'
}

/** Можно ли подать выход `source` на вход `target` (только по типу ноды, без учёта циклов и числа связей). */
export const accepts = (target, source) => Boolean(nodeDef(target?.type)?.inputs.includes(String(source?.type)))

/** Новая связь source → target замыкает цикл? Идём от target вниз по связям: если дошли до source — цикл. */
export function wouldCycle(source, target, edges) {
  const seen = new Set()
  const stack = [String(target)]
  while (stack.length) {
    const id = stack.pop()
    if (id === String(source)) return true
    if (seen.has(id)) continue
    seen.add(id)
    for (const edge of edges) if (String(edge.source) === id) stack.push(String(edge.target))
  }
  return false
}

/** Полная проверка новой связи: типы, не на себя, без цикла. Возвращает причину отказа или null. */
export function connectionError(source, target, edges) {
  if (!source || !target) return 'нет такой ноды'
  if (source.id === target.id) return 'нода не может быть связана сама с собой'
  if (!accepts(target, source)) return `«${nodeDef(target.type)?.label ?? target.type}» не принимает «${nodeDef(source.type)?.label ?? source.type}» на вход`
  if (wouldCycle(source.id, target.id, edges)) return 'связь замкнёт цикл'
  return null
}

/** Данные ноды без серверных и вычисляемых полей — то, что клиент сохраняет на диск (у viewOnly-нод — пусто). */
export function stripDerived(type, data) {
  const def = nodeDef(type)
  if (!def) return { ...data }
  if (def.viewOnly) return {}
  const drop = new Set(derivedFields(type))
  return Object.fromEntries(Object.entries(data ?? {}).filter(([key]) => !drop.has(key)))
}

/** Вид миниатюры в плитке: рамка, подпись или ящик. */
export const thumbOf = (type) => nodeDef(type)?.thumb ?? 'box'
/** Подпись типа для агента (MCP). */
export const mcpLabel = (type) => nodeDef(type)?.mcpLabel ?? String(type ?? 'нода')
