import type { Collection } from './collections'
import { t } from '@/lib/i18n'

// Запросы к библиотеке на диске (library-plugin.ts) и перевод файлов браузера в вид, который можно отправить серверу.

// Загруженный файл живёт в браузере как blob:-ссылка — серверу отдаём сами данные (data:-URL).
export async function toSendable(url: string): Promise<string> {
  if (!url.startsWith('blob:')) return url
  const blob = await (await fetch(url)).blob()
  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.readAsDataURL(blob)
  })
}

// Режим снимка (VITE_SNAPSHOT=1): сайт без сервера. Чтение — из snapshot.json рядом со страницей, запись и запуск агентов отключены.
// Автосохранение холста (PUT) молча отвечает тем же снимком, чтобы страница не падала на пустом месте.
export const SNAPSHOT = import.meta.env.VITE_SNAPSHOT === '1'
let snapshotData: Promise<Record<string, unknown>> | undefined
const readSnapshot = () => (snapshotData ??= fetch('snapshot.json').then((response) => response.json()))
async function callSnapshot<T>(path: string, method: string): Promise<T> {
  const data = await readSnapshot()
  const key = path.replace(/\?.*$/, '')
  if (method === 'GET' || (method === 'PUT' && key.startsWith('/canvas/'))) {
    if (!(key in data)) throw new Error(`Snapshot has no ${key}`)
    return data[key] as T
  }
  throw new Error('This is a recorded run: snapshot is read-only')
}

async function call<T>(path: string, method: string, body?: unknown): Promise<T> {
  if (SNAPSHOT) return callSnapshot<T>(path, method)
  const response = await fetch(`/api/library${path}`, { method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) })
  const data = await response.json()
  if (!response.ok) throw new Error(data.error)
  return data as T
}

// Граф понятий (grill-graph.md): состояние и действия; модель работает только по кнопке владельца
export type GraphState = {
  items: Record<string, { at: number; concepts: string[]; relations?: Array<{ from: string; to: string; label: string }>; usage?: { input: number; output: number } }>
  report?: { at: number; text: string; model: string }
  run: { kind: 'idle' | 'build' | 'report'; done: number; total: number; startedAt: number; error: string }
  pending: number; stale: number; estimate: { cards: number; inputTokens: number }
}

export type ProviderState = { loggedIn: boolean; method?: string; email?: string; limitAt?: number; authFailAt?: number; lastOkAt?: number }
export type Providers = { claude: ProviderState; codex: ProviderState }
export interface CanvasMemory { refs: Array<{ node: string; title: string; at: number }>; rules: Array<{ id: string; text: string; at: number }>; decisions: Array<{ id: string; text: string; at: number }> }
export const library = {
  graph: () => call<GraphState>('/graph', 'GET'),
  graphOp: (op: 'build' | 'rebuild' | 'stop' | 'report' | 'note' | 'export') => call<GraphState & { noteId?: string }>('/graph', 'POST', { op }),
  graphTag: (name: string, ids: string[]) => call<{ tag: string; created: boolean; changed: number; collections: Collection[] }>('/graph', 'POST', { op: 'tag', name, ids }),
  list: <T>() => call<T[]>('', 'GET'),
  add: async <T>(fields: Record<string, unknown> & { image: string; video?: string }) =>
    call<T>('', 'POST', { ...fields, image: await toSendable(fields.image), video: fields.video ? await toSendable(fields.video) : undefined }),
  update: (id: string, patch: Record<string, unknown>) => call(`/${id}`, 'PUT', patch),
  // Комментарии владельца: add / edit / remove — сервер пишет ленту и зеркало meaning, возвращает карточку целиком
  comment: (id: string, body: { op: 'add'; text: string; x?: number; y?: number } | { op: 'edit'; id: string; text: string } | { op: 'remove'; id: string }) => call<{ comments: Array<{ id: string; text: string; at: number; editedAt?: number }>; meaning: string }>(`/${id}/comments`, 'POST', body),
  remove: (id: string) => call<{ ok: boolean; trashName: string }>(`/${id}`, 'DELETE'),
  convert: (id: string, feedback?: string) => call(`/${id}/convert`, 'POST', { feedback }),
  code: async (id: string) => (await fetch(`/library/${id}/code.html?t=${Date.now()}`)).text(),
  prompt: async (id: string) => (await call<{ prompt: string }>(`/${id}/prompt`, 'GET')).prompt,
  // Ссылка: сервер сам достаёт ролик, статью или пин (library-plugin.ts → ingest).
  // Холст (grill-canvas.md): доска целиком — узлы и стрелки; материал создаётся пустым, без агента
  createCanvas: <T>(fields: Record<string, unknown> = {}) => call<T>('/canvas', 'POST', fields),
  // Агентные ноды холста: запуск по кнопке, остановка, результат в библиотеку (grill-canvas-chain.md)
  runCanvasNode: (id: string, node: string, mode: 'node' | 'all' | 'downstream' | 'after' | 'edit' | 'item' | 'refine' = 'node', item?: number, text?: string) => call<{ ok: boolean }>(`/canvas/${id}/run`, 'POST', { node, mode, item, text }),
  canvasMemory: (id: string, body: { op: 'get' | 'rule-add' | 'rule-remove' | 'ref-add' | 'ref-remove' | 'decision-remove'; text?: string; id?: string; node?: string }) => call<CanvasMemory>(`/canvas/${id}/memory`, 'POST', body),
  editCanvasText: (id: string, node: string, from: string, to: string) => call<{ ok: boolean }>(`/canvas/${id}/edit-text`, 'POST', { node, from, to }),
  editCanvasResult: (id: string, node: string, result: string) => call<{ ok: boolean }>(`/canvas/${id}/result`, 'POST', { node, result }),
  stopCanvasNode: (id: string, node: string) => call<{ ok: boolean }>(`/canvas/${id}/stop`, 'POST', { node }),
  resolveCanvasProposal: (id: string, proposal: string, action: 'accept' | 'decline') => call<CanvasData>(`/canvas/${id}/proposal`, 'POST', { proposal, action }),
  activateCanvasVersion: (id: string, node: string, index: number) => call<{ ok: boolean }>(`/canvas/${id}/activate`, 'POST', { node, index }),
  restoreCanvasVersion: (id: string, node: string, index: number) => call<{ ok: boolean }>(`/canvas/${id}/restore`, 'POST', { node, index }),
  saveCanvasNode: <T>(id: string, node: string) => call<T>(`/canvas/${id}/save`, 'POST', { node }),
  exportCanvasNode: (id: string, node: string) => call<{ path: string; size: number; sourcePath?: string }>(`/canvas/${id}/export`, 'POST', { node }),
  canvasPrompt: (id: string, node: string) => call<{ prompt: string; images: string[]; model: string }>(`/canvas/${id}/prompt`, 'POST', { node }),
  // Просим сервер пересъёмку превью холста (старые холсты без картинки догоняются по мере показа)
  canvasThumb: (id: string) => call<{ ok: boolean }>(`/canvas/${id}/thumb`, 'POST', {}),
  canvas: (id: string) => call<CanvasData>(`/canvas/${id}`, 'GET'),
  saveCanvas: (id: string, data: CanvasData) => call<CanvasData>(`/canvas/${id}`, 'PUT', data),
  addNote: <T>(text: string, fields: Record<string, unknown> = {}) => call<T>('/note', 'POST', { text, ...fields }),
  addLink: <T>(url: string, fields: Record<string, unknown> = {}) => call<T>('/link', 'POST', { url, ...fields }),
  digest: (id: string) => call(`/${id}/digest`, 'POST'),
  describe: (id: string) => call(`/${id}/describe`, 'POST'), // «Описать» в карточке
  suggestName: (id: string) => call<{ title: string }>(`/${id}/name`, 'POST').then((result) => result.title), // «Назвать за меня»
  suggestFolderName: (id: string) => call<{ name: string }>('/folders', 'POST', { suggest: true, id }).then((result) => result.name),
  ytInfo: <T>(id: string) => call<T>(`/${id}/yt-info`, 'POST'), // описание, просмотры и дата ролика
  refetch: (id: string) => call(`/${id}/refetch`, 'POST'),
  stop: (id: string) => call(`/${id}/stop`, 'POST'),
  conversation: <T,>(id: string, to?: number) => call<T>(`/${id}/conversation`, 'POST', { to }),
  progress: () => call<Record<string, AgentProgress>>('/progress', 'GET'),
  opened: (id: string) => call(`/${id}/open`, 'POST'),
  // Просьба агенту из карточки — ответ текстом ляжет в историю (thread)
  // cards — другие карточки, files — файлы только для этого вопроса (data:-URL), подкинутые через «+»
  ask: (id: string, command: string, extra: { cards?: string[]; files?: Array<{ name: string; data: string }>; web?: 'yes' | 'no'; actionId?: string } = {}) => call(`/${id}/ask`, 'POST', { command, ...extra }),
  remember: <T,>(id: string, at: number, accept: boolean) => call<T>(`/${id}/remember`, 'POST', { at, accept }),
  // Подключение к своему агенту (MCP) и импорт из Are.na
  mcpCommands: () => call<{ claude: string; codex: string }>('/mcp', 'GET'),
  arenaCheck: (channel: string) => call<{ title: string; total: number; fresh: number }>(`/import?arena=${encodeURIComponent(channel)}`, 'GET'),
  arenaImport: (channel: string) => call('/import', 'POST', { arena: channel }),
  // Поиск по речи роликов (идея 59): фрагменты субтитров с таймкодом
  speech: (query: string) => call<SpeechHit[]>(`/speech?q=${encodeURIComponent(query)}`, 'GET'),
  // Строки памяти, предложенные внешним агентом через MCP — ждут подтверждения
  memoryOffers: () => call<MemoryItem[]>('/memory-offers', 'GET'),
  answerMemoryOffer: (id: string, accept: boolean) => call<MemoryItem[]>('/memory-offers', 'POST', { id, accept }),
  // Права агента (идея 53) — library/permissions.json
  permissions: () => call<Permissions>('/permissions', 'GET'),
  setPermissions: (patch: Partial<Permissions>) => call<Permissions>('/permissions', 'PUT', patch),
  // Правка текста из ответа: принять, отклонить или отменить принятое
  editAt: <T,>(id: string, at: number, action: 'apply' | 'reject' | 'undo') => call<T>(`/${id}/edit`, 'POST', { at, action }),
  // Предложенный агентом новый тег: принять — в словарь и в карточку
  tagOffer: <T,>(id: string, accept: boolean) => call<T>(`/${id}/tag-offer`, 'POST', { accept }),
  // Свои действия — library/actions.json
  actions: () => call<ActionItem[]>('/actions', 'GET'),
  deleteAction: (id: string) => call<ActionItem[]>('/actions', 'DELETE', { id }),
  addAction: (name: string, text: string, extra: { how?: string; about?: string } = {}) => call<ActionItem[]>('/actions', 'POST', { name, text, ...extra }),
  updateAction: (id: string, patch: { name?: string; text?: string; how?: string; about?: string }) => call<ActionItem[]>('/actions', 'PUT', { id, ...patch }),
  makeAction: <T,>(id: string, at: number, accept: boolean) => call<T>(`/${id}/make-action`, 'POST', { at, accept }),
  // Стиль ответов (grill-agent-style.md) — library/style.json: активный, готовые и свои
  style: () => call<StyleState>('/style', 'GET'),
  setStyle: (active: string) => call<StyleState>('/style', 'PUT', { active }),
  addStyle: (name: string, text: string, select = false) => call<StyleState>('/style', 'POST', { name, text, select }),
  deleteStyle: (id: string) => call<StyleState>('/style', 'DELETE', { id }),
  editStyle: (id: string, text: string) => call<StyleState>('/style', 'PUT', { id, text }),
  resetStyle: (id: string) => call<StyleState>('/style', 'PUT', { id, reset: true }),
  // Память о владельце — library/memory.json
  memory: () => call<MemoryItem[]>('/memory', 'GET'),
  addMemory: (text: string) => call<MemoryItem[]>('/memory', 'POST', { text }),
  editMemory: (id: string, text: string) => call<MemoryItem[]>('/memory', 'PUT', { id, text }),
  memoryScope: (id: string, scope: string) => call<MemoryItem[]>('/memory', 'PUT', { id, scope }),
  mcpLog: () => call<McpCall[]>('/mcp-log', 'GET'),
  insights: () => call<Insights | null>('/insights', 'GET'),
  makeInsights: () => call<Insights>('/insights', 'POST', {}),
  deleteMemory: (id: string) => call<MemoryItem[]>('/memory', 'DELETE', { id }),
  saveFound: <T,>(id: string, at: number, index: number) => call<T>(`/${id}/save-found`, 'POST', { at, index }),
  // Ответ агента → заметка (идея 58): сервер заводит заметку со ссылками на источники
  saveNote: <T,>(id: string, at: number) => call<T>(`/${id}/save-note`, 'POST', { at }),
  // Подборки живут в library/collections.json: список и создание новой из карточки
  collections: () => call<Collection[]>('/collections', 'GET'),
  createCollection: (name: string) => call<Collection[]>('/collections', 'POST', { name }),
  // Словарь тегов (исторически «подборки»): переименовать — во всех карточках; в существующий тег — слияние
  renameCollection: (from: string, to: string) => call<Collection[]>('/collections', 'PUT', { from, to }),
  deleteCollection: (name: string) => call<Collection[]>('/collections', 'DELETE', { name }),
  // Разобрать полку вместе — новая заметка-синтез (library-plugin.ts → synthesize)
  synthesize: <T>(ids: string[], question?: string) => call<T>('/synthesize', 'POST', { ids, question }),
  // Открыть полку — её заметка: заводится или обновляет состав по полке
  shelf: <T>() => call<T>('/shelf', 'POST'),
  // Корзина: удалённые, вернуть, очистить насовсем
  trash: <T>() => call<T[]>('/trash', 'GET'),
  restore: <T>(name: string) => call<T>('/trash', 'POST', { name }),
  emptyTrash: () => call('/trash', 'DELETE'),
  // Общий агент библиотеки: состояние, просьба, применить / отклонить / отменить правки, разговоры, стоп
  agent: () => call<AgentState>('/agent', 'GET'),
  agentAct: (body: { action: 'ask' | 'apply' | 'reject' | 'undo' | 'conversation' | 'stop' | 'save-found' | 'save-note' | 'remember' | 'make-action'; command?: string; actionId?: string; at?: number; ids?: string[]; to?: number; web?: 'yes' | 'no'; index?: number; accept?: boolean }) => call<AgentState>('/agent', 'POST', body),
  // Авторские подборки — собираются руками (library/boards.json); у элемента — boards
  // Свой порядок в сетке — список id (library/order.json)
  order: () => call<string[]>('/order', 'GET'),
  setOrder: (order: string[]) => call<string[]>('/order', 'PUT', { order }),
  boards: () => call<Board[]>('/boards', 'GET'),
  createBoard: (name: string) => call<Board[]>('/boards', 'POST', { name }),
  renameBoard: (from: string, to: string) => call<Board[]>('/boards', 'PUT', { from, to }),
  deleteBoard: (name: string) => call<Board[]>('/boards', 'DELETE', { name }),
  orderBoard: (name: string, order: string[]) => call<Board[]>('/boards', 'PUT', { name, order }),
  describeBoard: (name: string, description: string) => call<Board[]>('/boards', 'PUT', { name, description }),
  // Папки (v2, как Spaces у Fabric): материал лежит в одной — meta.folder; папки вкладываются (parent)
  folders: () => call<{ folders: Folder[] }>('/folders', 'GET').then((result) => result.folders),
  createFolder: (name: string, parent?: string) => call<{ folders: Folder[]; id: string }>('/folders', 'POST', { name, parent }),
  updateFolder: (id: string, patch: { name?: string; description?: string; parent?: string | null; icon?: string }) => call<{ folders: Folder[] }>('/folders', 'PUT', { id, ...patch }).then((result) => result.folders),
  // Порядок и уровень: встать в parent (null — верхний уровень) сразу после соседа after (null — первой)
  moveFolder: (id: string, parent: string | null, after: string | null) => call<{ folders: Folder[] }>('/folders', 'PUT', { id, move: { parent, after } }).then((result) => result.folders),
  deleteFolder: (id: string) => call<{ folders: Folder[] }>('/folders', 'DELETE', { id }).then((result) => result.folders),
  // Настройки (library/settings.json): какая модель на каком действии и одна глубина на всё приложение
  settings: () => call<ModelSettings>('/settings', 'GET'),
  login: (provider: 'claude' | 'codex') => call<{ ok: boolean }>('/providers', 'POST', { provider }),
  signingIn: () => call<{ claude: boolean; codex: boolean }>('/login', 'GET'),
  providers: (fresh = false) => call<Providers>(`/providers${fresh ? '?fresh=1' : ''}`, 'GET'),
  setModel: (model: string) => call<ModelSettings>('/settings', 'PUT', { model }),
  setModels: (models: Partial<Record<Action, string>>) => call<ModelSettings>('/settings', 'PUT', { models }),
  setDepth: (depth: Depth) => call<ModelSettings>('/settings', 'PUT', { depth }),
}

// Материал — то, что читают, а не разглядывают: ролик YouTube, статья или заметка. У него выжимка вместо разбора картинки.
// link — закладка: страница без текста статьи (Spotify, SoundCloud, Vimeo), обложка и плеер сайта, без выжимки
export type CanvasOp = { op: 'add_node'; id?: string; type: string; position?: { x: number; y: number }; data?: Record<string, unknown> } | { op: 'update_node'; id: string; data: Record<string, unknown> } | { op: 'delete_node'; id: string } | { op: 'connect'; source: string; target: string } | { op: 'disconnect'; source: string; target: string }
export type CanvasProposal = { id: string; by: string; at: number; note?: string; ops: CanvasOp[] }
export type CanvasData = { nodes: Array<Record<string, unknown>>; edges: Array<Record<string, unknown>>; rev?: number; proposals?: CanvasProposal[] }
export type Kind = 'youtube' | 'article' | 'note' | 'link' | 'music' | 'canvas'
export type Digest = { summary: string[]; apply: string[] }
// Расход одного запуска модели — как его пишет сервер (agents.ts → Usage)
export type Usage = { kind: string; model: string; seconds: number; input: number; cached: number; output: number }
// via: 'digest' — выжимка или разбор (ответ на первую подсказку), остальное — просьбы владельца
export type AgentQuestion = { title: string; options: Array<{ label: string; hint?: string }> } // вопрос агента с вариантами (grill-agent-skills.md)
export type Turn = { command: string; answer: string; at: number; question?: AgentQuestion; usage?: Usage[]; via?: 'hint' | 'typed' | 'test' | 'digest'; attached?: string[]; steps?: { thought: number; looked: number }; conversation?: number
  // Поиск в сети (grill-web-search.md): webAsk — агенту нужна сеть, лента спрашивает разрешения; found — найденное плитками под ответом
  webAsk?: string; found?: Found[]
  // Память (grill-agent-memory.md): remember — агент предлагает запомнить пожелание, remembered — владелец подтвердил
  remember?: string; remembered?: string
  // Пометка памяти (grill-skeptic.md): строки памяти, которые агент применил в этом ответе
  usedMemory?: string[]
  // Свои действия (№22): makeAction — агент заметил повтор просьбы и предлагает сделать её действием, madeAction — принято
  makeAction?: string; makeActionName?: string; madeAction?: string
  // Правка текста диффом (идея 55): новая выжимка или текст заметки на принятие; memoryUpdate — какую строку памяти уточняет remember
  edit?: TextEdit; memoryUpdate?: string }
export type TextEdit = { target: 'note' | 'digest'; from: string; to: string; status: 'pending' | 'applied' | 'rejected' }
export type MemoryItem = { id: string; text: string; at: number; from?: string; scope?: string } // scope: нет/«all» — везде, «app» — только агент Refkit, иначе папка проекта
export type Insights = { at: number; summary: string; topics: Array<{ topic: string; text: string }> }
export type McpCall = { at: number; tool: string; client: string; project: string }
export type SpeechHit = { id: string; t: number; text: string }
export type StyleItem = { id: string; name: string; text: string; original?: string } // original — наш исходный текст готового пресета (если правили)
export type StyleState = { active: string; custom: StyleItem[]; presets: StyleItem[] }
export type ActionItem = { id: string; text: string; at: number; name?: string; how?: string; about?: string } // how — инструкция «как делать» (умение), about — строка описания для меню «+»
export type Permission = 'ask' | 'allow'
export type Permissions = { library: Permission; web: Permission }
export type Found = { url: string; title: string; image: string; ratio: string }
export const digestTurn = (thread: Turn[] = []) => thread.filter((turn) => turn.via === 'digest').at(-1)
// Суть материала — первая мысль выжимки: выжимка живёт в ленте (via: 'digest'), у старых материалов — в поле digest
export function firstThought(item: { thread?: Turn[]; digest?: Digest }) {
  const line = digestTurn(item.thread)?.answer.split('\n').find((text) => text.startsWith('- '))
  return line ? line.slice(2).trim() : item.digest?.summary?.[0]
}
// Подборка владельца: order — порядок карточек (сервер держит его в согласии с составом), shelf — это полка «Под рукой»
// (grill-taxonomy.md: полка — особая подборка, показана над лентой)
export type Folder = { id: string; name: string; parent?: string; inbox?: boolean; description?: string; icon?: string }
export type Board = { name: string; order?: string[]; shelf?: boolean; inbox?: boolean; description?: string }
export const shelfName = 'Под рукой' // имя полки зашито и на сервере: по нему её находят, переводить нельзя
export type Action = 'sort' | 'digest' | 'ask'
export type Depth = 'low' | 'medium' | 'high' | 'xhigh' | 'max'
export type ModelSettings = { model: string; models: Array<{ key: string; label: string; note: string; id: string; context: number; efforts?: Depth[]; badge?: string; more?: boolean; provider: 'claude' | 'codex' }>; assigned: Record<Action, string>; depth: Depth }
// Оценка цены действия — диапазон токенов для текущих модели и глубины (сервер: estimates)
export type Estimate = { digest: [number, number]; ask: [number, number] }

// Глубина — одна на приложение: подписи для ползунка и множитель цены, как на сервере (estimates → depth)
export const depthLevels: Array<{ value: Depth; label: string; factor: number }> = [
  { value: 'low', label: t('Быстро'), factor: 0.9 },
  { value: 'medium', label: t('Обычно'), factor: 1 },
  { value: 'high', label: t('Глубоко'), factor: 1.3 },
  { value: 'xhigh', label: t('Очень глубоко'), factor: 1.6 },
  { value: 'max', label: t('Максимум'), factor: 2 },
]
// «15–31 тыс.» — цена действия; пересчёт под другую глубину — по множителю
export function tokens([low, high]: [number, number], from: Depth = 'medium', to: Depth = from) {
  const factor = (depthLevels.find((level) => level.value === to)?.factor ?? 1) / (depthLevels.find((level) => level.value === from)?.factor ?? 1)
  const k = (value: number) => Math.max(1, Math.round(value * factor / 1000))
  return t('{low}–{high} тыс.', { low: k(low), high: k(high) })
}
// Факт после действия: «Claude Haiku · 12 тыс. · 24 с» — без кэша, как в оценке
export function spent(runs: Usage[] | undefined, settings?: ModelSettings) {
  if (!runs?.length) return ''
  const model = settings?.models.find((item) => item.id === runs[0].model)?.label ?? runs[0].model
  const total = runs.reduce((sum, run) => sum + run.input + run.output, 0)
  return t('{model} · {total} тыс. · {seconds} с', { model, total: Math.max(1, Math.round(total / 1000)), seconds: runs.reduce((sum, run) => sum + run.seconds, 0) })
}
// Ход работы агента для строки статуса, как в Claude: «1 мин 35 с · 2,6 тыс. токенов · думает…»
export type AgentChange = { id: string; card: string; field: 'title' | 'description' | 'collections' | 'boards' | 'folder' | 'delete'; from: unknown; to: unknown; status: 'pending' | 'applied' | 'rejected'; label?: string; created?: string }
export type AgentState = { conversation: number; thread: Array<Turn & { changes?: AgentChange[] }>; suggestions?: string[]; asking?: boolean; askError?: string; progress?: AgentProgress }
export type AgentProgress = { startedAt: number; step: string; tokens: number }
// Время и токены без названия шага: «1 мин 35 с · 2,6 тыс. токенов»; шаг приходит с сервера русской строкой, переводим здесь
export function progressMeta({ startedAt, tokens }: AgentProgress, now: number) {
  const seconds = Math.max(0, Math.round((now - startedAt) / 1000))
  const time = seconds >= 60 ? t('{seconds} мин {seconds2} с', { seconds: Math.floor(seconds / 60), seconds2: seconds % 60 }) : t('{seconds} с', { seconds })
  const count = tokens >= 1000 ? t('{replace} тыс.', { replace: (tokens / 1000).toFixed(1).replace('.', ',') }) : String(tokens)
  return [time, tokens ? t('{n} токенов', { n: count }) : ''].filter(Boolean).join(' · ')
}
export function progressLine(progress: AgentProgress, now: number) {
  return [progressMeta(progress, now), `${t(progress.step)}…`].filter(Boolean).join(' · ')
}
export const isMaterial = (kind?: string): kind is Kind => kind === 'youtube' || kind === 'article' || kind === 'note' || kind === 'link' || kind === 'music' || kind === 'canvas'

// Сборка в код 1:1 скрыта (прожарка 2026-09-25, 01_strategy/grill-direction.md): дорого и пока не нужно.
// Код сборки не удалён — true возвращает «В код», вкладку «Код» и «Переделать».
export const buildEnabled = false

// Пропорции исходника и кадр-миниатюра для видео — до отправки на сервер.
export function probe(url: string, format: 'image' | 'video'): Promise<{ poster: string; ratio: string }> {
  return new Promise((resolve) => {
    if (format === 'image') {
      const img = new Image()
      img.onload = () => resolve({ poster: url, ratio: `${img.naturalWidth} / ${img.naturalHeight}` })
      img.onerror = () => resolve({ poster: url, ratio: '4 / 3' })
      img.src = url
      return
    }
    const video = document.createElement('video')
    video.muted = true
    video.src = url
    video.onloadeddata = () => { video.currentTime = Math.min(0.1, video.duration || 0) }
    video.onseeked = () => {
      const canvas = document.createElement('canvas')
      canvas.width = video.videoWidth
      canvas.height = video.videoHeight
      canvas.getContext('2d')?.drawImage(video, 0, 0)
      resolve({ poster: canvas.toDataURL('image/jpeg', 0.8), ratio: `${video.videoWidth} / ${video.videoHeight}` })
    }
    video.onerror = () => resolve({ poster: '', ratio: '16 / 9' })
  })
}

