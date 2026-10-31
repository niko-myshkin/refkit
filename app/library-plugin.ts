import { execFile, execFileSync, spawn } from 'node:child_process'
import { appendFileSync, copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import { extname, join, resolve, sep } from 'node:path'
import { Readability } from '@mozilla/readability'
import { JSDOM } from 'jsdom'
import type { Plugin } from 'vite'
import { t } from './src/lib/i18n-server.ts'
import { isolated, measureScreen, printPdf, runClaude, runCodex, screenshot, screenshotUrl, size, zoom, type Progress, type Steps, type Usage } from './agents.ts'
import { mainColors } from './colors.ts'
import { linkKey } from './src/lib/link-key.ts'
import { journalEntry, listEntries, seedEntries, type JournalEntry } from './shared/canvas-journal.mjs'
import { compileScreen, lintScreen, measureIssues, parseScreen, screenContract, screenSchema, SCREEN_VERSION, designSystemOf } from './screen-renderer.ts'
import { resultForAgent } from './shared/canvas-result.mjs'
import { reviewFixes } from './shared/canvas-review.mjs'
import { tokensCss } from './shared/screen-tokens.mjs'
import { derive, summary, type GraphItem } from './src/lib/graph-core.mjs'
import { toGraphify, toGraphNotes } from './src/lib/graphify-export.mjs'
import { AGENT_TYPES, actionOf, activeData, applyOps, canvasInputs, canvasNode, choiceItems, mergeWithTrash, migrateLists, migrateResults, splitItems, upstreamActions, type CanvasData, type CNode } from './shared/canvas-graph.mjs'
import { allTypes, collectionsOf, collectionsOfType, defaultCollections, type Collection, type TypeId } from './src/lib/collections.ts'

// Библиотека рефов — папка на диске, а не память страницы: переживает перезагрузку, её читает агент.
// library/<id>/meta.json — данные рефа; рядом source.<ext> (и source-video.<ext> у видео).
// Удаление — перенос в library/.trash/, откатывается. Только дев-сервер, как и агенты.
// «В код» — макет 1:1 по всей картинке (решение 2026-09-25, схема screenshot-to-code + сравнение пар UI2Code^N):
// сборка одним ходом, до 2 кругов правки точечными заменами; дешёвая модель сравнивает рендеры, проигравший откатывается.
// Результат — library/<id>/code.html, расход — code-usage.json.
// После добавления дешёвая модель в фоне пишет название, строку описания и теги — для поиска по механике (как в Mobbin).

// REFKIT_LIBRARY — другая папка данных (песочница для проверок без риска для настоящей библиотеки); обычно не задана
export const libraryDir = process.env.REFKIT_LIBRARY ?? join(import.meta.dirname, '..', 'library')

type Meta = Record<string, unknown> & { id: string; createdAt: number }

const types: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.mp4': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime' }
const extensions: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif', 'video/mp4': 'mp4', 'video/webm': 'webm', 'video/quicktime': 'mov' }

const safeId = (id: string) => id.replace(/[^\w-]/g, '')
const metaPath = (id: string) => join(libraryDir, safeId(id), 'meta.json')
const readMeta = (id: string) => JSON.parse(readFileSync(metaPath(id), 'utf8')) as Meta
const writeMeta = (meta: Meta) => { writeFileSync(metaPath(meta.id), JSON.stringify(meta, null, 2) + '\n'); scheduleIndex() }

// Лента комментариев владельца к карточке (идея 62, grill-card-comments.md). Пока ленты нет, «зачем сохранил» (meaning) читается
// как единственный комментарий — файлы не переписываются. meaning остаётся зеркалом первого комментария: его читают v1 и поиск
// x, y — точка на картинке в долях 0…1 (комментарий как в Figma, 2026-10-03). Старые метки (marks, идея 28) читаются как такие же
// комментарии; при первой записи ленты переезжают в неё насовсем
type Comment = { id: string; text: string; at: number; editedAt?: number; x?: number; y?: number }
const commentsOf = (meta: Meta): Comment[] => {
  const base: Comment[] = Array.isArray(meta.comments)
    ? meta.comments as Comment[]
    : typeof meta.meaning === 'string' && meta.meaning.trim() ? [{ id: 'c0', text: meta.meaning.trim(), at: meta.createdAt }] : []
  const marks = (Array.isArray(meta.marks) ? meta.marks : []) as Array<{ id: string; x: number; y: number; text: string; at: number }>
  return [...base, ...marks.filter((mark) => mark.text?.trim() && !base.some((item) => item.id === mark.id)).map((mark) => ({ id: mark.id, text: mark.text, at: mark.at, x: mark.x, y: mark.y }))]
}
// Номер точки — порядок среди комментариев с точкой, как на картинке
const pinLabel = (list: Comment[], item: Comment) => item.x === undefined ? '' : ` [точка ${list.filter((other) => other.x !== undefined).indexOf(item) + 1} на картинке: ${Math.round(item.x * 100)}% слева, ${Math.round((item.y ?? 0) * 100)}% сверху]`
// Что видит агент: один комментарий — тем же текстом, что был в meaning (промпты не меняются); несколько — датированные строки,
// новые внизу, последние 20 (лента не раздувает промпт)
const ownerNote = (meta: Meta) => {
  const list = commentsOf(meta)
  if (list.length <= 1) return list[0] ? list[0].text + pinLabel(list, list[0]) : ''
  return list.slice(-20).map((item) => `${new Date(item.at).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}: ${item.text}${pinLabel(list, item)}`).join('\n')
}

// ── Модель ─────────────────────────────────────────────────────────────────
// Какая модель что делает — в глобальных настройках (library/settings.json), у действия выбора модели нет, только глубина
// (прожарка grill-card-agent.md). Сборка в код (скрыта) остаётся на Codex.

// Меню модели — как в Claude: основные, more — в «Ещё модели»; badge — плашка только там, где есть оговорка.
// off — выключена: в меню не показывается, запросы на неё уходят на модель по умолчанию. Пока всё тестируем на Claude —
// Codex выключен (решение владельца 2026-09-26), включить — убрать off. ID — из справочника Claude API
// context — окно контекста в токенах (справочник Claude API): для полоски «Контекст» в кружке расхода
// efforts — какие уровни глубины модель принимает (справочник Claude API); нет — глубины у модели нет (Haiku 4.5)
type ModelOption = { key: string; label: string; note: string; provider: 'claude' | 'codex'; id: string; context: number; efforts?: readonly string[]; badge?: string; more?: boolean; off?: boolean }
const all5 = ['low', 'medium', 'high', 'xhigh', 'max'] as const
export const modelOptions: readonly ModelOption[] = [
  { key: 'claude-opus', label: 'Opus 5.5', note: t('сильнейшая · лимиты Claude'), context: 1_000_000, efforts: all5, provider: 'claude', id: 'claude-opus-5-5' },
  { key: 'claude-sonnet', label: 'Sonnet 5.5', note: t('умнее · лимиты Claude'), context: 1_000_000, efforts: all5, provider: 'claude', id: 'claude-sonnet-5-5' },
  { key: 'claude-fable', label: 'Fable 5.1', note: t('нужны кредиты Claude'), context: 1_000_000, efforts: all5, provider: 'claude', id: 'claude-fable-5-1', badge: t('нужны кредиты') },
  { key: 'claude-haiku', label: 'Haiku 4.5', note: t('быстрая · лимиты Claude'), context: 200_000, provider: 'claude', id: 'claude-haiku-4-5-20251001', badge: t('по умолчанию') },
  { key: 'claude-sonnet-5', label: 'Sonnet 5', note: t('лимиты Claude'), context: 1_000_000, efforts: all5, provider: 'claude', id: 'claude-sonnet-5', more: true },
  { key: 'claude-opus-5', label: 'Opus 5', note: t('лимиты Claude'), context: 1_000_000, efforts: all5, provider: 'claude', id: 'claude-opus-5', more: true },
  { key: 'claude-fable-5', label: 'Fable 5', note: t('нужны кредиты Claude'), context: 1_000_000, efforts: all5, provider: 'claude', id: 'claude-fable-5', badge: t('нужны кредиты'), more: true },
  { key: 'claude-opus-4-8', label: 'Opus 4.8', note: t('лимиты Claude'), context: 1_000_000, efforts: all5, provider: 'claude', id: 'claude-opus-4-8', more: true },
  { key: 'claude-opus-4-7', label: 'Opus 4.7', note: t('лимиты Claude'), context: 1_000_000, efforts: all5, provider: 'claude', id: 'claude-opus-4-7', more: true },
  { key: 'claude-opus-4-6', label: 'Opus 4.6', note: t('лимиты Claude'), context: 1_000_000, efforts: ['low', 'medium', 'high', 'max'], provider: 'claude', id: 'claude-opus-4-6', more: true },
  { key: 'claude-sonnet-4-6', label: 'Sonnet 4.6', note: t('лимиты Claude'), context: 1_000_000, efforts: ['low', 'medium', 'high', 'max'], provider: 'claude', id: 'claude-sonnet-4-6', more: true },
  // GPT — через Codex CLI по подписке ChatGPT; список и глубина — из ~/.codex/models_cache.json (ultra — вне нашей шкалы)
  { key: 'gpt6-astra', label: 'GPT-6 Astra', note: t('сильнейшая · подписка ChatGPT'), context: 272_000, efforts: all5, provider: 'codex', id: 'gpt-6-astra' },
  { key: 'gpt61-sol', label: 'GPT-6.1 Sol', note: t('рабочая · подписка ChatGPT'), context: 272_000, efforts: all5, provider: 'codex', id: 'gpt-6.1-sol' },
  { key: 'gpt6-sol', label: 'GPT-6 Sol', note: t('подписка ChatGPT'), context: 272_000, efforts: all5, provider: 'codex', id: 'gpt-6-sol', more: true },
  { key: 'gpt6-luna', label: 'GPT-6 Luna', note: t('быстрая · подписка ChatGPT'), context: 272_000, efforts: all5, provider: 'codex', id: 'gpt-6-luna' },
  { key: 'codex-sol', label: 'GPT-5.6 Sol', note: t('подписка ChatGPT'), context: 272_000, efforts: all5, provider: 'codex', id: 'gpt-5.6-sol', more: true },
  { key: 'gpt56-terra', label: 'GPT-5.6 Terra', note: t('подписка ChatGPT'), context: 272_000, efforts: all5, provider: 'codex', id: 'gpt-5.6-terra', more: true },
  { key: 'codex-luna', label: 'GPT-5.6 Luna', note: t('подписка ChatGPT'), context: 272_000, efforts: all5, provider: 'codex', id: 'gpt-5.6-luna', more: true },
  { key: 'gpt55', label: 'GPT-5.5', note: t('подписка ChatGPT'), context: 272_000, efforts: ['low', 'medium', 'high', 'xhigh'], provider: 'codex', id: 'gpt-5.5', more: true },
]
// Модель действия: выключенная или неизвестная — модель по умолчанию (Haiku)
const fallbackModel = modelOptions.find((item) => item.key === 'claude-haiku')!
const modelFor = (key: string) => { const model = modelOptions.find((item) => item.key === key); return model && !model.off ? model : fallbackModel }
// Действия: sort — фон при добавлении (название, теги, подборки); digest — выжимка материала и разбор рефа; ask — просьбы в карточке
export const actions = ['sort', 'digest', 'ask'] as const
type Action = typeof actions[number]
// Глубина — одна на приложение, это усилие модели. Сортировка всегда на low: фон должен быть дешёвым
export const depths = ['low', 'medium', 'high', 'xhigh', 'max'] as const
type Depth = typeof depths[number]
type Settings = { models: Record<Action, string>; depth: Depth }
const settingsFile = join(libraryDir, 'settings.json')
function readSettings(): Settings {
  const raw = existsSync(settingsFile) ? JSON.parse(readFileSync(settingsFile, 'utf8')) : {}
  // Старый формат { model } — одна модель на выжимку и просьбы
  const fallback = typeof raw.model === 'string' ? raw.model : 'claude-haiku'
  return { models: { sort: 'claude-haiku', digest: fallback, ask: fallback, ...raw.models }, depth: depths.includes(raw.depth) ? raw.depth : 'medium' }
}
const writeSettings = (settings: Settings) => writeFileSync(settingsFile, JSON.stringify(settings, null, 2) + '\n')
type ModelRun = { modelKey?: string; kind: string; prompt: string; images: string[]; cwd: string; web?: boolean; schema?: object; track?: Usage[]; signal?: AbortSignal; onProgress?: (progress: Progress) => void; steps?: Steps }
// Запущенные выжимки и просьбы по карточкам — чтобы «Стоп» мог их прервать
const running = new Map<string, AbortController>()
// Ход работы по карточкам — для строки статуса: с какого момента, шаг, токены
const progress = new Map<string, Progress & { startedAt: number }>()
const startRun = (id: string) => {
  const controller = new AbortController()
  running.set(id, controller)
  progress.set(id, { startedAt: Date.now(), step: 'думает', tokens: 0 })
  return { signal: controller.signal, onProgress: (next: Progress) => progress.set(id, { ...progress.get(id)!, ...next }) }
}
const endRun = (id: string) => { running.delete(id); progress.delete(id) }
function runModel(options: ModelRun, action: Action) {
  const settings = readSettings()
  const { modelKey, ...rest } = options
  options = rest
  const model = modelFor(modelKey ?? settings.models[action])
  // Глубина — только из тех, что модель принимает: нет такой — ближайшая ниже; у модели без глубины (Haiku) — флаг не передаём
  const wanted = action === 'sort' ? 'low' : settings.depth
  const effort = model.efforts ? [...depths].slice(0, depths.indexOf(wanted) + 1).reverse().find((level) => model.efforts!.includes(level)) ?? model.efforts[0] : undefined
  return trackProvider(model.provider, model.provider === 'claude' ? runClaude({ ...options, model: model.id, effort }) : runCodex({ ...options, model: model.id, effort }))
}

// ── Аккаунты моделей (страница «Настройки») ────────────────────────────────
// Вошёл ли Claude Code и Codex — спрашиваем у самих CLI (`claude auth status`, `codex login status`); про лимит CLI не говорит, поэтому
// запоминаем сами: запуск упал с «Лимит … исчерпан» — время пишем в library/provider-status.json, удачный запуск стирает пометку
type ProviderName = 'claude' | 'codex'
type ProviderNote = { limitAt?: number; authFailAt?: number; lastOkAt?: number }
const providerNotesFile = join(libraryDir, 'provider-status.json')
const readProviderNotes = (): Partial<Record<ProviderName, ProviderNote>> => { try { return JSON.parse(readFileSync(providerNotesFile, 'utf8')) } catch { return {} } }
function noteProvider(provider: ProviderName, error?: unknown) {
  const notes = readProviderNotes()
  const note: ProviderNote = { ...notes[provider] }
  const text = error instanceof Error ? error.message : String(error ?? '')
  if (!error) { delete note.limitAt; delete note.authFailAt; note.lastOkAt = Date.now() }
  else if (/Лимит .*исчерпан|limit .*reached/i.test(text)) note.limitAt = Date.now()
  else if (/не вошёл|not signed in/i.test(text)) note.authFailAt = Date.now()
  else return
  writeFileSync(providerNotesFile, JSON.stringify({ ...notes, [provider]: note }, null, 2) + '\n')
}
function trackProvider<T>(provider: ProviderName, run: Promise<T>) {
  run.then(() => noteProvider(provider), (error) => noteProvider(provider, error))
  return run
}
const cliOutput = (command: string, args: string[]) => new Promise<string>((done) => execFile(command, args, { timeout: 8000 }, (error, out, err) => done(error && !out ? '' : String(out || err))))
let providersCache: { at: number; value: unknown } | undefined
async function providerStatus(force = false) {
  if (!force && providersCache && Date.now() - providersCache.at < 15_000) return providersCache.value
  const [claudeRaw, codexRaw] = await Promise.all([cliOutput('claude', ['auth', 'status']), cliOutput('codex', ['login', 'status'])])
  let claude: { loggedIn: boolean; method?: string; email?: string } = { loggedIn: false }
  try { const data = JSON.parse(claudeRaw); claude = { loggedIn: Boolean(data.loggedIn), method: data.authMethod, email: data.email } } catch { /* CLI не найден или не вошёл */ }
  const codexLine = codexRaw.trim().split('\n')[0] ?? ''
  const codex = { loggedIn: /logged in/i.test(codexLine), method: codexLine.replace(/^logged in using\s*/i, '') || undefined }
  const notes = readProviderNotes()
  const value = { claude: { ...claude, ...notes.claude }, codex: { ...codex, ...notes.codex } }
  providersCache = { at: Date.now(), value }
  return value
}

// Вход в аккаунт прямо из «Настроек»: сам CLI открывает браузер на этой машине, ждёт подтверждения и записывает вход в свой HOME
// (у демо-сервера он свой, у основного — твой). Один вход за раз на провайдера; через 5 минут процесс убираем, статус обновит страница
const logins = new Map<string, ReturnType<typeof spawn>>()
function startLogin(provider: 'claude' | 'codex') {
  if (logins.has(provider)) return
  const child = spawn(provider, provider === 'claude' ? ['auth', 'login'] : ['login'], { stdio: 'ignore' })
  const stop = () => { clearTimeout(timer); logins.delete(provider); providersCache = undefined }
  const timer = setTimeout(() => child.kill(), 300_000)
  child.on('exit', stop)
  child.on('error', stop)
  logins.set(provider, child)
}

// ── Подборки ───────────────────────────────────────────────────────────────
// library/collections.json — список подборок; владелец создаёт новые из карточки. Нет файла — стартовый набор.
const collectionsFile = join(libraryDir, 'collections.json')
function readCollections(): Collection[] {
  if (!existsSync(collectionsFile)) { writeFileSync(collectionsFile, JSON.stringify(defaultCollections, null, 2) + '\n'); return defaultCollections }
  return JSON.parse(readFileSync(collectionsFile, 'utf8'))
}
const writeCollections = (list: Collection[]) => writeFileSync(collectionsFile, JSON.stringify(list, null, 2) + '\n')
// Авторские подборки — library/boards.json, порядок — как создавали
const boardsFile = join(libraryDir, 'boards.json')
type Board = { name: string; order?: string[]; shelf?: boolean; inbox?: boolean; description?: string }
const rawBoards = (): Board[] => existsSync(boardsFile) ? JSON.parse(readFileSync(boardsFile, 'utf8')) : []
const writeBoards = (boards: Board[]) => writeFileSync(boardsFile, JSON.stringify(boards, null, 2) + '\n')
// Порядок подборки — при чтении: из order только те, кто сейчас в подборке; новые участники — в конец. Так не надо
// ловить каждое место, где карточку кладут или вынимают (правка, агент, переименование)
const readBoards = (): Board[] => {
  const items = list()
  return rawBoards().map((board) => {
    const members = items.filter((item) => (item.boards as string[] | undefined)?.includes(board.name)).map((item) => String(item.id))
    const kept = (board.order ?? []).filter((id) => members.includes(id))
    return { ...board, order: [...kept, ...members.filter((id) => !kept.includes(id))] }
  })
}
// Язык ответов модели в промптах: в демо-сборке английский
const ansLang = t('по-русски')
const shelfName = 'Под рукой'
// Папки (v2, как Spaces у Fabric, grill-minimal.md): материал лежит в одной папке — meta.folder; папки вкладываются (parent).
// «Входящие» — папка с флагом inbox: туда падает всё, кинутое без выбора папки. Поле boards не трогаем — им живёт v1
type Folder = { id: string; name: string; parent?: string; inbox?: boolean; description?: string; icon?: string }
const foldersFile = join(libraryDir, 'folders.json')
const readFolders = (): Folder[] => existsSync(foldersFile) ? JSON.parse(readFileSync(foldersFile, 'utf8')) : []
const writeFolders = (folders: Folder[]) => writeFileSync(foldersFile, JSON.stringify(folders, null, 2) + '\n')
const inboxId = () => readFolders().find((folder) => folder.inbox)?.id ?? 'inbox'
const withInbox = (fields: Record<string, unknown>) => fields.folder || (fields.sources as unknown[] | undefined)?.length ? fields : { ...fields, folder: inboxId() }
// Один раз: папки из подборок (кроме полки), материал — в первую свою подборку, остальные подборки — в теги; без подборки — во «Входящие»
function migrateFolders() {
  if (existsSync(foldersFile)) return
  const boards = rawBoards().filter((board) => !board.shelf && !board.inbox)
  const folders: Folder[] = [{ id: 'inbox', name: t('Входящие'), inbox: true }, ...boards.map((board, index) => ({ id: `f-${index + 1}`, name: board.name, ...(board.description ? { description: board.description } : {}) }))]
  const idOf = new Map(folders.map((folder) => [folder.name, folder.id]))
  const dictionary = readCollections()
  for (const meta of list()) {
    if (meta.folder) continue
    const own = ((meta.boards as string[] | undefined) ?? []).filter((name) => idOf.has(name) && name !== 'Входящие')
    const rest = own.slice(1)
    for (const name of rest) if (!dictionary.some((item) => item.name === name)) dictionary.push({ name, types: allTypes, hint: name })
    writeFileSync(metaPath(meta.id), JSON.stringify({ ...meta, folder: own.length ? idOf.get(own[0]) : 'inbox', ...(rest.length ? { collections: [...new Set([...collectionsOf(meta as { collections?: string[] }), ...rest])] } : {}) }, null, 2) + '\n')
  }
  writeCollections(dictionary)
  writeFolders(folders)
  writeBoards(rawBoards().filter((board) => !board.inbox)) // подборка «Входящие» из прошлого шага — теперь папка
}
// Полка → подборка «Под рукой» (grill-taxonomy.md): один раз при запуске pinnedAt становится участием в подборке,
// порядок полки — по pinnedAt; поле pinnedAt уходит
function migrateShelf() {
  const boards = rawBoards()
  if (boards.some((board) => board.shelf)) return
  const items = list()
  const pinned = items.filter((item) => item.pinnedAt).sort((a, b) => Number(a.pinnedAt) - Number(b.pinnedAt)).map((item) => String(item.id))
  for (const meta of items) if ('pinnedAt' in meta) {
    const { pinnedAt, ...rest } = meta
    const own = (rest.boards as string[] | undefined) ?? []
    writeFileSync(metaPath(meta.id), JSON.stringify(pinnedAt ? { ...rest, boards: [...new Set([...own, shelfName])] } : rest, null, 2) + '\n')
  }
  const same = boards.find((board) => board.name === shelfName)
  writeBoards([{ ...same, name: shelfName, shelf: true, order: [...new Set([...pinned, ...(same?.order ?? [])])] }, ...boards.filter((board) => board.name !== shelfName)])
}
// Подсказки агенту: словарь тегов (исторически «системные подборки», grill-taxonomy.md) и о чём каждый; поперёк типов
const collectionChoice = (type: TypeId) => {
  const list = collectionsOfType(readCollections(), type)
  return { names: list.map((item) => item.name), hints: list.map((item) => `${item.name} — ${item.hint || item.name}`).join('; ') }
}
// Шаг 2 (grill-taxonomy.md): теги — из словаря, 2–4; новый — редко, один, сразу с описанием, и он уходит в словарь
const collectionsLine = (hints: string) => [
  `— collections: 2–4 тега из словаря, которые прямо подходят по теме. Словарь: ${hints}. Не натягивай: подходит один — ставь один, не подходит ни один — пустой список.`,
  '— newTags: обычно пустой. Только если ни один тег словаря не подходит по сути, даже с натяжкой шире, — один новый: name — одно-два слова, как в словаре; hint — до 10 слов, какие материалы им помечать.',
].join('\n')
// Права агента (идея 53, grill-fabric-findings.md): три группы. Читать — всегда; library — менять библиотеку (новый тег,
// название, перенос, удаление), web — сеть. 'ask' — спрашивать, 'allow' — можно. Файлом в папке библиотеки: те же права
// у внешнего агента через MCP. Исключения из «спрашивать»: теги из словаря и имя при добавлении — агент ставит сам
type Permission = 'ask' | 'allow'
type Permissions = { library: Permission; web: Permission }
const permissionsFile = join(libraryDir, 'permissions.json')
const readPermissions = (): Permissions => { try { return { library: 'ask', web: 'ask', ...JSON.parse(readFileSync(permissionsFile, 'utf8')) } } catch { return { library: 'ask', web: 'ask' } } }
const writePermissions = (value: Permissions) => writeFileSync(permissionsFile, JSON.stringify(value, null, 2) + '\n')
const newTagsSchema = { type: 'array', items: { type: 'object', additionalProperties: false, required: ['name', 'hint'], properties: { name: { type: 'string' }, hint: { type: 'string' } } } }
// Теги из ответа агента: из словаря — как есть, новый — в словарь (если такого ещё нет) и в теги материала.
// Ручное владельца не затираем: теги уже стоят — оставляем
function pickTags(fresh: Meta, result: { collections: string[]; newTags?: Array<{ name: string; hint: string }> }, names: string[]) {
  // Теги владельца (выбрал в окне добавления, кликнул подсказку) остаются первыми, агент дополняет из словаря до 5
  // (grill-tag-hints.md, 2026-10-03; раньше свой тег отключал автотеги). Новые теги в словарь — только когда своих нет
  const own = collectionsOf(fresh as { collections?: string[] })
  if (own.length) return [...new Set([...own, ...result.collections.filter((name) => names.includes(name))])].slice(0, Math.max(5, own.length))
  const fromDictionary = result.collections.filter((name) => names.includes(name))
  const dictionary = readCollections()
  const offered = (result.newTags ?? []).slice(0, 1).map((tag) => ({ name: tag.name.trim(), hint: tag.hint.trim() })).filter((tag) => tag.name)
  // Спрашивать (по умолчанию): новый тег — предложение на карточке (tagOffer), в словарь только после ✓ (идея 54)
  if (readPermissions().library === 'ask') {
    const known = offered.flatMap((tag) => dictionary.find((item) => item.name.toLowerCase() === tag.name.toLowerCase())?.name ?? [])
    return [...new Set([...fromDictionary, ...known])].slice(0, 4)
  }
  const added = offered.map((tag) => {
    const same = dictionary.find((item) => item.name.toLowerCase() === tag.name.toLowerCase())
    if (same) return same.name
    dictionary.push({ name: tag.name, types: allTypes, hint: tag.hint })
    return tag.name
  })
  if (added.length) writeCollections(dictionary)
  return [...new Set([...fromDictionary, ...added])].slice(0, 4)
}
// Новый тег, которого нет в словаре, — предложением (tagOffer), пока права «спрашивать»; own — теги владельца уже стоят
function offerTag(fresh: Meta, result: { newTags?: Array<{ name: string; hint: string }> }) {
  if (readPermissions().library !== 'ask' || collectionsOf(fresh as { collections?: string[] }).length) return undefined
  const tag = (result.newTags ?? []).map((item) => ({ name: item.name.trim(), hint: item.hint.trim() })).find((item) => item.name)
  return tag && !readCollections().some((item) => item.name.toLowerCase() === tag.name.toLowerCase()) ? tag : undefined
}
// Описание нового тега для агента пишет сам агент по названию; не вышло — описанием остаётся название
async function describeCollection(name: string) {
  try {
    const hint = (await runModel({ kind: 'collection-hint', prompt: `Тег в личной библиотеке продуктового дизайнера называется «${name}». Одной строкой до 10 слов перечисли, какие материалы им помечают — через запятую, без вступлений. Ничего не запускай.`, images: [], cwd: isolated('collection') }, 'sort')).trim()
    // Строка длиннее 120 знаков — не описание, а отказ или рассуждение модели («Я не имею доступа…»)
    if (!hint || hint.length > 120) return
    writeCollections(readCollections().map((item) => item.name === name ? { ...item, hint } : item))
  } catch { /* описанием останется название */ }
}
// Переезд со старого поля collection (одна строка) на collections (список) — один раз при запуске
function migrateCollections() {
  for (const meta of list()) if (typeof meta.collection === 'string' || !Array.isArray(meta.collections)) {
    const { collection: _old, ...rest } = meta
    writeFileSync(metaPath(meta.id), JSON.stringify({ ...rest, collections: collectionsOf(meta as { collection?: string }) }, null, 2) + '\n')
  }
}

// ── Индекс для агента ──────────────────────────────────────────────────────
// library/INDEX.md — то, что агент читает вместо старой ~/Claude/Library/INDEX.md: строка на элемент, по типам и подборкам.
// Пересобирается сам после изменений — с паузой в секунду, чтобы не переписывать его на каждый промежуточный флаг.

const typeTitles: Array<[string, string, (meta: Meta) => boolean]> = [
  ['Картинки', 'картинки интерфейсов и визуальные референсы', (meta) => !meta.kind && meta.format !== 'video'],
  ['Видео', 'закинутые видеофайлы: записи интерфейсов, анимации', (meta) => !meta.kind && meta.format === 'video'],
  ['Ролики', 'субтитры в text.txt', (meta) => meta.kind === 'youtube'],
  ['Статьи', 'текст в text.txt', (meta) => meta.kind === 'article'],
  ['Заметки', 'текст в text.txt', (meta) => meta.kind === 'note'],
]
function writeIndex() {
  const ready = list().filter((meta) => !meta.fetching && !meta.fetchError)
  const line = (meta: Meta) => {
    const gist = String(meta.description ?? ownerNote(meta))
    const tags = (meta.tags as string[] | undefined) ?? []
    return `- [${meta.title}](${meta.id}/)${[gist, tags.join(', ')].filter(Boolean).map((part, i) => (i ? ' · ' : ' — ') + part).join('')}`
  }
  const sections = typeTitles.map(([title, note, match]) => {
    const items = ready.filter(match)
    if (!items.length) return ''
    const groups = new Map<string, Meta[]>()
    for (const meta of items) { const name = collectionsOf(meta as { collections?: string[] })[0] ?? 'Без тега'; groups.set(name, [...(groups.get(name) ?? []), meta]) }
    return [`## ${title} · ${items.length} — ${note}`, ...[...groups].map(([name, metas]) => [`\n### ${name}`, ...metas.map(line)].join('\n'))].join('\n')
  }).filter(Boolean)
  writeFileSync(join(libraryDir, 'INDEX.md'), [
    '# Refkit — индекс библиотеки',
    '',
    'Генерируется сервером Refkit (app/library-plugin.ts), руками не править. Строка — элемент: название → папка, описание, теги.',
    'В папке элемента: `meta.json` (все поля; ответы агента — `thread`, выжимка — ответ с `via: \"digest\"`), `text.txt` (полный текст ролика, статьи, заметки), `source.*` (картинка, видео).',
    '',
    ...sections.flatMap((section) => [section, '']),
  ].join('\n'))
}
let indexTimer: ReturnType<typeof setTimeout> | undefined
function scheduleIndex() {
  clearTimeout(indexTimer)
  indexTimer = setTimeout(() => { try { writeIndex() } catch (error) { console.error('[refkit] индекс не записан:', (error as Error).message) } }, 1000)
}

function list(): Meta[] {
  if (!existsSync(libraryDir)) return []
  return readdirSync(libraryDir)
    .filter((name) => !name.startsWith('.') && existsSync(metaPath(name)))
    .map(readMeta)
    .sort((a, b) => b.createdAt - a.createdAt)
}

// Что агент видит у рефа. Картинка — как есть. Видео и гифка — кадры по эпизодам движения (начало и конец каждого, до 12)
// и журнал «движение 2,1–2,9 с»: микроанимации живут 0,2–0,9 с, равномерные 6 кадров их пропускали (замер 2026-10-18 —
// ловили 2–3 эпизода из 5–6). Нет движения — 6 кадров равномерно. 768 px по ширине; кадры кэшируются в library/<id>/.motion
// (точка — наружу не отдаётся).
// Файл библиотеки по адресу «/library/…»; путь, выходящий за папку библиотеки (../), не принимаем: адреса приходят из meta.json и canvas.json
const onDisk = (url: unknown) => {
  if (typeof url !== 'string' || !url.startsWith('/library/')) return ''
  const full = resolve(libraryDir, url.replace(/^\/library\//, ''))
  return full.startsWith(resolve(libraryDir) + sep) ? full : ''
}
const MOTION_FPS = 10
const MOTION_FRAMES = 12
function motionEpisodes(file: string, seconds: number): Array<[number, number]> {
  const side = 48
  const raw = execFileSync('ffmpeg', ['-v', 'error', '-i', file, '-vf', `fps=${MOTION_FPS},scale=${side}:${side},format=gray`, '-f', 'rawvideo', '-'], { maxBuffer: 256 * 1024 * 1024 })
  const area = side * side
  const count = Math.floor(raw.length / area)
  const active: number[] = []
  for (let index = 0; index < count - 1; index++) {
    let sum = 0
    for (let at = 0; at < area; at++) sum += Math.abs(raw[index * area + at] - raw[(index + 1) * area + at])
    if (sum / area > 2) active.push(index / MOTION_FPS)
  }
  const episodes: Array<[number, number]> = []
  for (const time of active) {
    const last = episodes[episodes.length - 1]
    if (last && time - last[1] <= 1.5 / MOTION_FPS) last[1] = time + 1 / MOTION_FPS
    else episodes.push([time, time + 1 / MOTION_FPS])
  }
  return episodes.map(([from, to]) => [from, Math.min(to, Math.max(0, seconds - 0.05))])
}
function visuals(meta: Meta): { images: string[]; note: string } {
  const image = onDisk(meta.image)
  const gif = !meta.video && /\.gif$/i.test(image) ? image : ''
  const video = onDisk(meta.video) || gif
  if (!video || !existsSync(video)) return { images: image && existsSync(image) ? [image] : [], note: '' }
  const dir = join(libraryDir, meta.id, '.motion')
  const plan = join(dir, 'plan.json')
  let times: number[]
  let seconds = 0
  let episodes: Array<[number, number]> = []
  if (existsSync(plan)) ({ times, seconds, episodes } = JSON.parse(readFileSync(plan, 'utf8')))
  else {
    seconds = Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', video]).toString()) || 1
    episodes = motionEpisodes(video, seconds)
    let marks = episodes.flatMap(([from, to]) => to - from > 0.15 ? [from, to] : [(from + to) / 2])
    if (marks.length > MOTION_FRAMES) marks = Array.from({ length: MOTION_FRAMES }, (_, index) => marks[Math.round(index * (marks.length - 1) / (MOTION_FRAMES - 1))])
    times = marks.length ? [...new Set(marks.map((time) => Math.max(0, Number(time.toFixed(2)))))] : Array.from({ length: 6 }, (_, index) => (seconds / 6) * (index + 0.5))
    mkdirSync(dir, { recursive: true })
    times.forEach((time, index) => execFileSync('ffmpeg', ['-y', '-v', 'error', '-ss', time.toFixed(2), '-i', video, '-frames:v', '1', '-vf', 'scale=768:-2', join(dir, `frame-${index + 1}.jpg`)]))
    writeFileSync(plan, JSON.stringify({ times, seconds, episodes }))
  }
  const frames = times.map((_, index) => join(dir, `frame-${index + 1}.jpg`))
  const log = episodes.length ? `Движение на экране: ${episodes.map(([from, to]) => `${from.toFixed(1)}–${to.toFixed(1)} с`).join(', ')}; между ними картинка стоит. ` : 'Заметного движения нет. '
  return { images: frames, note: `Это ${gif ? 'гифка' : 'видео'} ${seconds.toFixed(1)} с. ${log}Приложены ${frames.length} кадров по порядку (в секундах: ${times.map((time) => time.toFixed(1)).join(', ')}) — начало и конец каждого движения, по ним видно приём.` }
}

// ── Оценка цены ────────────────────────────────────────────────────────────
// Сколько токенов уйдёт на выжимку, разбор или просьбу — диапазоном, по прошлым запускам этой модели (прожарка grill-card-agent.md).
// Токены — вход и выход. Повторно прочитанный кэш не считаем: лимит он почти не ест, а цифру раздувает в разы (15–218 тыс. против 9–39). Выжимка материала = постоянная обвязка агента
// + часть, растущая с текстом (текст режется на 60 тыс. символов — как в digestPrompt); прямую подбираем по прошлым запускам.
// Разбор рефа и просьбы — медиана прошлых запусков.
type Estimate = [number, number]
const total = (runs: Usage[] = []) => runs.reduce((sum, run) => sum + run.input + run.output, 0)
const median = (values: number[]) => { const sorted = [...values].sort((a, b) => a - b); return sorted[Math.floor(sorted.length / 2)] }
const textLength = (id: string) => { const file = join(libraryDir, id, 'text.txt'); return existsSync(file) ? statSync(file).size / 2 : 0 } // UTF-8 кириллица — ~2 байта на символ
function estimates(items: Meta[]) {
  const settings = readSettings()
  const idOf = (action: Action) => modelFor(settings.models[action]).id
  const depth = ({ low: 0.9, medium: 1, high: 1.3, xhigh: 1.6, max: 2 } as Record<string, number>)[settings.depth] ?? 1
  const range = (value: number): Estimate => [Math.round(value * 0.7 * depth / 1000) * 1000, Math.round(value * 1.4 * depth / 1000) * 1000]
  const digestModel = idOf('digest')
  const askModel = idOf('ask')
  const points: Array<[number, number]> = [] // [символов в промпте, токенов]
  const refDigests: number[] = []
  const asks: number[] = []
  for (const item of items) {
    // Выжимки — ответы с via: 'digest' (перенесённые хранят и старый digestUsage); остальные ответы — просьбы
    for (const turn of threadOf(item)) {
      if (turn.via === 'digest') {
        const runs = turn.usage?.filter((run) => run.model === digestModel)
        if (!runs?.length || (item.sources as string[] | undefined)?.length) continue // синтез полки — другая цена, в прямую не берём
        if (item.kind && textLength(item.id)) points.push([Math.min(textLength(item.id), 60000), total(runs)])
        if (!item.kind) refDigests.push(total(runs))
      } else if (turn.usage?.some((run) => run.model === askModel)) asks.push(total(turn.usage))
    }
  }
  // Прямая «обвязка + токены на символ» методом наименьших квадратов; мало данных или прямая вышла кривой —
  // грубо: ~30 тыс. обвязки и ~3 символа на токен. Реф без истории — ~30 тыс.; просьба — ~25 тыс.
  let base = 30000
  let rate = 1 / 3
  if (points.length >= 3) {
    const n = points.length
    const mx = points.reduce((sum, [x]) => sum + x, 0) / n
    const my = points.reduce((sum, [, y]) => sum + y, 0) / n
    const spread = points.reduce((sum, [x]) => sum + (x - mx) ** 2, 0)
    const slope = spread ? points.reduce((sum, [x, y]) => sum + (x - mx) * (y - my), 0) / spread : 0
    if (slope > 0 && my - slope * mx > 0) { rate = slope; base = my - slope * mx }
  }
  const refDigest = refDigests.length ? median(refDigests) : 30000
  const ask = asks.length ? median(asks) : 25000
  return (item: Meta) => ({
    digest: range(item.kind ? base + rate * Math.min(textLength(item.id), 60000) : refDigest),
    ask: range(ask + (item.kind ? Math.min(textLength(item.id), 40000) / 3 : 0)), // просьба берёт до 40 тыс. символов текста
  })
}

// data:-URL из браузера → файл в папке рефа; возвращает публичный путь. Не data: — это ссылка, её и возвращаем.
function saveFile(id: string, name: string, dataUrl: string): string {
  const match = dataUrl.match(/^data:([\w/+.-]+);base64,(.+)$/)
  if (!match) return dataUrl // ссылка (например, на пин) — храним как есть, скачивание картинки со ссылки позже
  const file = `${name}.${extensions[match[1]] ?? 'bin'}`
  writeFileSync(join(libraryDir, id, file), Buffer.from(match[2], 'base64'))
  return `/library/${id}/${file}`
}

// Описание для поиска: что на картинке и какая механика. Пока идёт — describing: true, клиент опрашивает список.
const str = { type: 'string' }
// Предложения — 2–3 просьбы к агенту, которые напрашиваются; в карточке серой подсказкой в поле команды (Tab — взять).
// В фоне агент делает только то, что нужно для хранения и поиска (владелец, 2026-09-26): название, описание, теги, подборки.
// Подсказки — только вместе с выжимкой или разбором, которые владелец запускает сам.
const suggestionsLine = '— suggestions: 2–3 короткие просьбы к агенту, которые владелец, скорее всего, захочет сделать с этим (до 10 слов, повелительное наклонение: «Разложи…», «Собери…», «Сравни…»). Только то, что агент выполнит по этому материалу и своим знаниям, без поиска в интернете: не «покажи примеры из реальных проектов», если их нет в материале.'
const describeSchema = {
  type: 'object', additionalProperties: false, required: ['title', 'description', 'tags', 'collections', 'newTags'],
  properties: { title: str, description: str, tags: { type: 'array', items: str }, collections: { type: 'array', items: str }, newTags: newTagsSchema },
}
// Что известно о картинке, кроме неё самой (владелец, 2026-09-27: разбирать из контекста, а не только по графике):
// страница-источник, карточка, из которой найдено, название из поиска, пометка и подборки владельца
// Описание дал человек — автор поста или владелец при добавлении: агент его не переписывает
const keepsDescription = (meta: Meta) => Boolean((meta.descriptionFromPost || meta.descriptionByOwner) && meta.description)
function contextOf(meta: Meta) {
  const from = typeof meta.foundIn === 'string' && existsSync(metaPath(meta.foundIn)) ? (meta.foundIn === 'agent' ? undefined : readMeta(meta.foundIn)) : undefined
  const digest = from && digestTurn(from)
  return [
    meta.source ? `Источник: ${meta.source}` : '',
    meta.descriptionByOwner && meta.description ? `Владелец описал: «${meta.description}» — это главный сигнал, что здесь важно.` : '',
    meta.postText ? `Текст поста автора${meta.author ? ` ${meta.author}` : ''}: «${meta.postText}»` : '',
    meta.titleEdited ? `Владелец назвал: «${meta.title}».` : '',
    meta.foundIn ? `Найдено агентом по просьбе владельца${from ? ` в карточке «${from.title}»${from.description ? ` — ${from.description}` : ''}` : ' библиотеки'}. Название из поиска: «${meta.foundTitle ?? meta.title}».` : '',
    digest ? `Выжимка той карточки:\n${digest.answer.slice(0, 1500)}` : '',
    ownerNote(meta) ? `Владелец отметил: «${ownerNote(meta)}».` : '',
    [...((meta.collections as string[] | undefined) ?? []), ...((meta.boards as string[] | undefined) ?? [])].length ? [((meta.collections as string[] | undefined) ?? []).length ? `Теги: ${(meta.collections as string[]).join(', ')}` : '', ((meta.boards as string[] | undefined) ?? []).length ? `Подборки владельца: ${(meta.boards as string[]).join(', ')}` : ''].filter(Boolean).join('\n') : '',
  ].filter(Boolean).join('\n')
}
const describePrompt = (context: string, hints: string) => [
  'Приложена картинка для личной библиотеки дизайнера: интерфейс, предмет, фото, схема — что угодно. Ничего не запускай и не читай, кроме приложенной картинки.',
  context ? `Что о ней известно:\n${context}` : '',
  'Если из контекста ясно, что это конкретно (модель, человек, продукт, место), — называй прямо, а не общим словом.',
  // 2026-10-01: скрин карточки Fabric описывался как лендинг, который был внутри него
  'Сначала определи, что в кадре целиком. Скриншот приложения или сайта — описывай сам интерфейс: какой это экран, из какого продукта, какие на нём элементы и что они позволяют делать. Картинки, тексты и товары внутри интерфейса — только пример содержимого, не предмет описания.',
  'Название и комментарий владельца выше — главный сигнал, что ему здесь важно: описывай под это.',
  'Опиши так, чтобы реф потом находился поиском по механике и сценарию:',
  '— title: 2–5 слов, что это (например, «Шкала выбора суммы»);',
  '— description: одно предложение — что на экране и какая механика или сценарий (выбор даты, онбординг, прогресс, переключение тарифа…);',
  '— tags: 3–5 слов для поиска в нижнем регистре: тип элемента, механика, контекст (это не теги словаря);',
  collectionsLine(hints),
  namingLines(),
  t('По-русски.'),
].filter(Boolean).join('\n')

// byOwner — по кнопке «Описать» в карточке: подходящие теги словаря добавляются к уже стоящим (не больше 5)
// «Назвать за меня» (как у Fabric): агент предлагает название, подставляется в поле, сохраняет владелец. Только по кнопке, лёгкая модель
const nameSchema = { type: 'object', additionalProperties: false, required: ['title'], properties: { title: { type: 'string' } } }
async function suggestName(prompt: string, images: string[] = []) {
  const result = JSON.parse(await runModel({ kind: 'name', prompt, images, cwd: isolated('name'), schema: nameSchema }, 'sort')) as { title: string }
  return result.title.trim().replace(/^[«"“]+|[»"”.]+$/g, '')
}
async function nameCard(id: string) {
  const meta = readMeta(id)
  const image = String(meta.image ?? '').startsWith('/library/') ? join(libraryDir, String(meta.image).replace(/^\/library\//, '')) : ''
  const textFile = join(libraryDir, id, 'text.txt')
  return suggestName([
    'Придумай название для карточки в личной библиотеке дизайнера: 2–6 слов, по сути материала, без кавычек и точки в конце.',
    image && existsSync(image) ? 'Приложена картинка: если это скриншот приложения или сайта — назови сам интерфейс (экран, продукт, приём), а не то, что нарисовано внутри.' : '',
    meta.source ? `Источник: ${meta.source}` : '', meta.description ? `Описание: ${meta.description}` : '',
    ownerNote(meta) ? `Владелец отметил: «${ownerNote(meta)}» — название должно отражать это.` : '',
    `Сейчас карточка называется «${meta.title}» — предложи другой вариант, не повторяй его.`,
    existsSync(textFile) ? `Текст материала (начало):\n${readFileSync(textFile, 'utf8').slice(0, 1500)}` : '',
    namingLines(), t('По-русски.'),
  ].filter(Boolean).join('\n'), image && existsSync(image) ? [image] : [])
}
// Выводы «что ты сохраняешь» (страница «Память», grill-memory-page.md): по кнопке, не в фоне. Модель видит сжатую сводку
// библиотеки — счёт тем и типов, ритм по неделям, последние названия по главным темам — и пишет 1–2 фразы и строку на тему.
// Хранятся в library/insights.json; видит только агент Refkit (наблюдения, не правила), наружу через MCP не уходят
type Insights = { at: number; summary: string; topics: Array<{ topic: string; text: string }> }
const insightsFile = join(libraryDir, 'insights.json')
const readInsights = (): Insights | null => { try { return JSON.parse(readFileSync(insightsFile, 'utf8')) } catch { return null } }
const insightsSchema = { type: 'object', additionalProperties: false, required: ['summary', 'topics'], properties: {
  summary: { type: 'string' },
  topics: { type: 'array', maxItems: 5, items: { type: 'object', additionalProperties: false, required: ['topic', 'text'], properties: { topic: { type: 'string' }, text: { type: 'string' } } } },
} }
async function makeInsights(): Promise<Insights> {
  const all = list()
  const count = (values: string[]) => [...values.reduce((map, value) => map.set(value, (map.get(value) ?? 0) + 1), new Map<string, number>())].sort((a, b) => b[1] - a[1])
  const tags = count(all.flatMap((meta) => (meta.collections as string[] | undefined) ?? []))
  const kinds = count(all.map((meta) => String(meta.kind ?? meta.format ?? 'image')))
  const week = 7 * 864e5
  const weeks = [4, 3, 2, 1, 0].map((back) => all.filter((meta) => { const age = Date.now() - Number(meta.createdAt ?? Date.now()); return age >= back * week && age < (back + 1) * week }).length)
  const byTopic = tags.slice(0, 5).map(([tag, n]) => `${tag} (${n}): ${all.filter((meta) => ((meta.collections as string[] | undefined) ?? []).includes(tag)).slice(0, 10).map((meta) => meta.title).join('; ')}`)
  const result = JSON.parse(await runModel({ kind: 'insights', schema: insightsSchema, images: [], cwd: isolated('insights'), prompt: [
    'Ты — агент личной библиотеки дизайнера. По сводке ниже напиши, что владелец сохраняет: это зеркало для него самого, не отчёт и не оценка.',
    'summary — 1–2 короткие фразы ' + ansLang + ': главное в том, что и как он сохраняет (темы, типы, ритм). Без похвалы, без советов, без воды.',
    'topics — по одной строке на 3–5 главных тем: что именно внутри темы (какие приёмы, продукты, сюжеты), по названиям. Не пересказывай число.',
    `Всего материалов: ${all.length}. Типы: ${kinds.map(([k, n]) => `${k} ${n}`).join(', ')}.`,
    `По неделям, от старой к текущей: ${weeks.join(', ')}.`,
    `Главные темы и последние названия:\n${byTopic.join('\n')}`,
  ].join('\n') }, 'ask')) as { summary: string; topics: Array<{ topic: string; text: string }> }
  const insights = { at: Date.now(), summary: String(result.summary ?? '').trim(), topics: (result.topics ?? []).slice(0, 5) }
  writeFileSync(insightsFile, JSON.stringify(insights, null, 2) + '\n')
  return insights
}

async function nameFolder(id: string) {
  const folder = readFolders().find((item) => item.id === id)
  const inside = list().filter((meta) => (meta.folder ?? inboxId()) === id).slice(0, 40)
  return suggestName([
    'Придумай название для space (папки) в личной библиотеке дизайнера: 1–3 слова, по тому, что в нём лежит; без кавычек и точки.',
    folder ? `Сейчас space называется «${folder.name}» — предложи другой вариант, не повторяй его.` : '',
    folder?.description ? `Описание space: ${folder.description}` : '',
    inside.length ? `Что внутри (${inside.length}):\n${inside.map((meta) => `- ${meta.title}${meta.description ? ` — ${String(meta.description).slice(0, 80)}` : ''}`).join('\n')}` : 'Внутри пока пусто — предложи нейтральное название по описанию.',
    namingLines(), t('По-русски.'),
  ].filter(Boolean).join('\n'))
}
async function describe(id: string, byOwner = false) {
  const meta = readMeta(id)
  const choice = collectionChoice('refs')
  const image = join(libraryDir, String(meta.image).replace(/^\/library\//, ''))
  try {
    if (!String(meta.image).startsWith('/library/') || !existsSync(image)) throw new Error(t('Картинки нет на диске — описывать нечего'))
    // Пост с альбомом — агент смотрит все файлы (до 6), а не только обложку
    const album = ((meta.media as Array<{ image: string }> | undefined) ?? []).map((item) => onDisk(item.image)).filter((path): path is string => Boolean(path && existsSync(path)))
    const result = JSON.parse(await runModel({ kind: 'describe', prompt: describePrompt(contextOf(meta), choice.hints), images: album.length ? album.slice(0, 6) : [image], cwd: isolated('describe'), schema: describeSchema }, 'sort'))
    const fresh = readMeta(id) // пока модель думала, реф могли поправить руками — ручное не затираем
    // Описание из поста — оригинал автора, сам агент его не переписывает, только ставит теги; «Переписать» владельца — можно
    writeMeta({ ...fresh, title: fresh.titleEdited ? fresh.title : result.title, description: keepsDescription(fresh) && !byOwner ? fresh.description : result.description, descriptionFromPost: fresh.descriptionFromPost && !byOwner ? true : undefined, descriptionByOwner: fresh.descriptionByOwner && !byOwner ? true : undefined, tags: (fresh.tags as string[] | undefined)?.length ? fresh.tags : result.tags, collections: byOwner ? [...new Set([...collectionsOf(fresh as { collections?: string[] }), ...pickTags({ ...fresh, collections: [] }, result, choice.names)])].slice(0, 5) : pickTags(fresh, result, choice.names), tagOffer: offerTag(fresh, result), describing: false })
  } catch (error) {
    if (existsSync(metaPath(id))) writeMeta({ ...readMeta(id), describing: false, describeError: (error as Error).message })
  }
}

// ── Иконка источника ───────────────────────────────────────────────────────
// На плитке материала по ссылке — фавиконка сайта (гибрид, владелец 2026-10-03; без ссылки — иконка типа на клиенте).
// Ищем один раз на сайт: apple-touch-icon (крупная) → <link rel=icon> → /favicon.ico; кладём в library/favicons/<host>.<ext>.
// Не нашлась — метка <host>.none, чтобы не стучаться на каждом показе
const faviconDir = join(libraryDir, 'favicons')
const iconTypes: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif', 'image/svg+xml': 'svg', 'image/x-icon': 'ico', 'image/vnd.microsoft.icon': 'ico' }
const faviconBusy = new Map<string, Promise<string>>()
async function findFavicon(host: string) {
  const page = await fetch(`https://${host}/`, { headers: { 'User-Agent': userAgent }, signal: AbortSignal.timeout(8000) }).catch(() => undefined)
  const candidates: string[] = []
  if (page?.ok && /html/.test(page.headers.get('content-type') ?? '')) {
    const document = new JSDOM(await page.text(), { url: page.url }).window.document
    const links = [...document.querySelectorAll('link[rel~="apple-touch-icon"], link[rel~="icon"], link[rel="shortcut icon"]')]
    links.sort((a, b) => Number(b.getAttribute('rel')?.includes('apple')) - Number(a.getAttribute('rel')?.includes('apple')))
    for (const link of links) { const href = link.getAttribute('href'); if (href) candidates.push(new URL(href, page.url).href) }
  }
  candidates.push(`https://${host}/favicon.ico`)
  for (const url of candidates) {
    const response = await fetch(url, { headers: { 'User-Agent': userAgent }, signal: AbortSignal.timeout(8000) }).catch(() => undefined)
    const ext = iconTypes[response?.headers.get('content-type')?.split(';')[0].trim() ?? '']
    if (!response?.ok || !ext) continue
    const data = Buffer.from(await response.arrayBuffer())
    if (data.length < 100) continue
    const file = join(faviconDir, `${host}.${ext}`)
    writeFileSync(file, data)
    return file
  }
  writeFileSync(join(faviconDir, `${host}.none`), '')
  return ''
}
function favicon(host: string): Promise<string> {
  mkdirSync(faviconDir, { recursive: true })
  const known = readdirSync(faviconDir).find((name) => name.slice(0, name.lastIndexOf('.')) === host)
  if (known) return Promise.resolve(known.endsWith('.none') ? '' : join(faviconDir, known))
  if (!faviconBusy.has(host)) faviconBusy.set(host, findFavicon(host).catch(() => '').finally(() => faviconBusy.delete(host)))
  return faviconBusy.get(host)!
}

// ── Ссылки ─────────────────────────────────────────────────────────────────
// ⌘V со ссылкой: сервер сам достаёт содержимое (прожарка grill-everything.md).
// YouTube — обложка и субтитры, это материал для выжимки; Pinterest — картинка или видео пина, это обычный реф;
// остальное считаем статьёй — основной текст через Readability. Пока идёт — fetching: true, клиент опрашивает список.

const youtubeHost = /(^|\.)(youtube\.com|youtu\.be)$/
const pinterestHost = /(^|\.)pinterest\.[a-z.]+$|^pin\.it$/
const xHost = /(^|\.)(x\.com|twitter\.com)$/
// Пост X: без входа x.com отдаёт страницу логина — её текст попадал в карточку. Берём пост из публичного API встраивания
// (им пользуются виджеты твитов): текст, автор, фото и видео. Токен — формула из react-tweet
type XMedia = { type: string; media_url_https: string; video_info?: { variants: Array<{ content_type: string; url: string; bitrate?: number }> } }
type XPost = { text: string; created_at?: string; display_text_range?: [number, number]; user?: { name: string; screen_name: string }; mediaDetails?: XMedia[] }
async function xPost(link: string): Promise<XPost> {
  const id = new URL(link).pathname.match(/\/status(?:es)?\/(\d+)/)?.[1]
  if (!id) throw new Error(t('В ссылке X нет поста'))
  const token = ((Number(id) / 1e15) * Math.PI).toString(36).replace(/(0+|\.)/g, '')
  const response = await fetch(`https://cdn.syndication.twimg.com/tweet-result?id=${id}&token=${token}`, { headers: { 'User-Agent': userAgent } })
  if (!response.ok) throw new Error(t('Пост X не открылся: удалён, закрыт или только для подписчиков'))
  return await response.json() as XPost
}
const tgHost = /^(t\.me|telegram\.me)$/
// Пост Telegram: из приложения копируется только текст, без медиа. По ссылке на пост публичного канала t.me отдаёт
// виджет встраивания без входа: текст, канал, фото, видео. Закрытые каналы и личные чаты так не достать
async function tgPost(link: string) {
  const url = new URL(link)
  // t.me/c/… — ссылка на пост закрытого канала или группы: открывается только участникам, снаружи не достать
  if (url.pathname.startsWith('/c/')) throw new Error(t('Закрытый канал — по ссылке не забрать. Перетащите картинку или видео из Telegram сюда'))
  if (!/^\/(s\/)?[\w]+\/\d+/.test(url.pathname)) throw new Error(t('Это не ссылка на пост: нужна вида t.me/канал/123'))
  const response = await fetch(`https://t.me${url.pathname.replace(/^\/s\//, '/')}?embed=1&mode=tme`, { headers: { 'User-Agent': userAgent } })
  if (!response.ok) throw new Error(t('Пост Telegram не открылся'))
  const document = new JSDOM(await response.text()).window.document
  if (document.querySelector('.tgme_widget_message_error')) throw new Error(t('Пост Telegram недоступен: удалён или канал закрытый'))
  const textNode = document.querySelector('.tgme_widget_message_text')
  textNode?.querySelectorAll('br').forEach((br) => br.replaceWith('\n'))
  // Альбом — несколько фото и видео подряд; у видео обложка внутри плеера
  const items = [...document.querySelectorAll('.tgme_widget_message_photo_wrap, .tgme_widget_message_video_player')].map((node): PostItem => {
    const style = (element: Element | null) => element?.getAttribute('style')?.match(/url\(['"]?([^'")]+)/)?.[1] ?? ''
    return node.classList.contains('tgme_widget_message_photo_wrap')
      ? { image: style(node) }
      : { image: style(node.querySelector('.tgme_widget_message_video_thumb')), video: node.querySelector('video')?.getAttribute('src') ?? undefined }
  }).filter((item) => item.image)
  const time = document.querySelector('.tgme_widget_message_date time')?.getAttribute('datetime')
  return {
    text: textNode?.textContent?.trim() ?? '',
    author: document.querySelector('.tgme_widget_message_owner_name')?.textContent?.trim() ?? '',
    items, at: time ? Date.parse(time) : undefined,
  }
}
// Пост соцсети (X, Telegram) — одна карточка, как пост целиком (владелец 2026-10-02): название — первая строка поста,
// описание — его текст как есть; агент их не переписывает (titleEdited, descriptionFromPost), только ставит теги по всем файлам.
// Файлов несколько (альбом) — первый на плитке, все — лентой в карточке (media). Без медиа — текстовый материал
type PostItem = { image: string; video?: string }
type Post = { text: string; author: string; items: PostItem[]; at?: number }
const postTitle = (post: Post) => {
  const line = post.text.split('\n').map((item) => item.trim()).find(Boolean)
  if (line) return line.length > 80 ? `${line.slice(0, 80).trimEnd()}…` : line
  const date = post.at ? new Date(post.at).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }) : ''
  return [post.author.replace(/ \(@.*\)$/, '') || 'Пост', date].filter(Boolean).join(' · ')
}
// Обложка видео — кадр самого ролика: превью Telegram ~320px, на плитке мылится
function videoPoster(id: string, video: string, name: string) {
  const file = join(libraryDir, id, `${name}.jpg`)
  try {
    const path = onDisk(video)!
    const seconds = Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', path]).toString()) || 1
    execFileSync('ffmpeg', ['-y', '-v', 'error', '-ss', Math.min(1, seconds / 3).toFixed(2), '-i', path, '-frames:v', '1', file])
    const { w, h } = size(file)
    return { image: `/library/${id}/${name}.jpg`, ratio: w && h ? `${w} / ${h}` : '16 / 9' }
  } catch { return undefined }
}
async function savePost(id: string, post: Post) {
  const dir = join(libraryDir, id)
  const fresh = { title: postTitle(post), titleEdited: true, author: post.author, postText: post.text || undefined, media: undefined }
  if (post.items.length) {
    const media: Array<{ image: string; ratio: string; video?: string }> = []
    for (const [index, item] of post.items.entries()) {
      const name = index === 0 ? 'source' : `source-${index + 1}`
      const video = item.video ? await download(id, item.video, `${name}-video`).then((file) => file.image).catch(() => '') : '' // больше 20 МБ — останется обложка
      const cover = (video && videoPoster(id, video, name)) || await download(id, item.image, name)
      media.push({ ...cover, ...(video ? { video } : {}) })
    }
    rmSync(join(dir, 'text.txt'), { force: true }) // повторная загрузка: старый текст больше не нужен
    const [first] = media
    // Описание владельца из окна добавления главнее текста поста
    writeMeta({ ...readMeta(id), ...fresh, image: first.image, ratio: first.ratio, kind: undefined, ...(readMeta(id).descriptionByOwner ? {} : { description: post.text || undefined, descriptionFromPost: Boolean(post.text) }), format: first.video ? 'video' : 'image', video: first.video, media: media.length > 1 ? media : undefined, fetching: false, describing: true })
    void describe(id)
    return true
  }
  if (!post.text) throw new Error(t('В посте нет ни текста, ни медиа'))
  writeFileSync(join(dir, 'text.txt'), post.text + '\n')
  writeMeta({ ...readMeta(id), ...fresh, kind: 'article', fetching: false })
  return false
}
const userAgent = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36'

function ytDlp(args: string[]) {
  return new Promise<string>((resolve, reject) => {
    execFile('yt-dlp', args, { maxBuffer: 64 * 1024 * 1024, timeout: 180000 }, (error, stdout, stderr) =>
      error ? reject(new Error(stderr.trim().split('\n').pop() || error.message)) : resolve(stdout))
  })
}

// Картинку по адресу — в папку рефа. Возвращает публичный путь и пропорции.
async function download(id: string, url: string, name = 'source') {
  const response = await fetch(url, { headers: { 'User-Agent': userAgent }, signal: AbortSignal.timeout(15_000) })
  if (!response.ok) throw new Error(t('Картинка не скачалась: {status}', { status: response.status }))
  // Тип из заголовка; нет его (файлы Telegram приходят как octet-stream) — расширение из адреса, иначе jpg
  const fromUrl = new URL(url).pathname.match(/\.(jpe?g|png|webp|gif|mp4|webm|mov)$/i)?.[1].toLowerCase()
  const file = `${name}.${extensions[response.headers.get('content-type')?.split(';')[0] ?? ''] ?? fromUrl ?? 'jpg'}`
  writeFileSync(join(libraryDir, id, file), Buffer.from(await response.arrayBuffer()))
  let ratio = '16 / 9'
  try { const { w, h } = size(join(libraryDir, id, file)); if (w && h) ratio = `${w} / ${h}` } catch { /* sips не прочитал формат — оставляем 16:9 */ }
  return { image: `/library/${id}/${file}`, ratio }
}

// Субтитры YouTube: сначала ручные, потом автоматические — и те и другие на языке оригинала.
// Автоперевод не берём: YouTube отвечает на него 429 (опыт inbox-triage), а выжимка всё равно пишется по-русски.
// Формат json3 — чистый текст без разметки времени.
type Track = { ext: string; url: string }
type VideoInfo = { language?: string; subtitles?: Record<string, Track[]>; automatic_captions?: Record<string, Track[]> }
async function subtitles(info: VideoInfo) {
  const original = info.language?.split('-')[0]
  const pick = (tracks: Record<string, Track[]> = {}, order: string[]) => {
    const lang = order.map((code) => Object.keys(tracks).find((key) => key === code)).find(Boolean)
    return lang ? tracks[lang].find((track) => track.ext === 'json3')?.url : undefined
  }
  const manual = Object.keys(info.subtitles ?? {})
  const url = pick(info.subtitles, [original, 'ru', 'en', manual[0]].filter(Boolean) as string[])
    ?? pick(info.automatic_captions, [`${original}-orig`, original].filter(Boolean) as string[])
  if (!url) return ''
  const response = await fetch(url)
  if (!response.ok) throw new Error(t('YouTube не отдал субтитры: {status}', { status: response.status }))
  const data = await response.json() as { events?: Array<{ tStartMs?: number; segs?: Array<{ utf8: string }> }> }
  return (data.events ?? []).map((event) => (event.segs ?? []).map((seg) => seg.utf8).join('')).join(' ').replace(/\s+/g, ' ').trim()
}
// Таймкоды (идея 59): те же субтитры фрагментами по ~20 с — { t: секунда начала, text } → cues.json рядом с text.txt.
// Хранение, не работа агента: YouTube отдаёт готовые субтитры, модель не нужна
type Cue = { t: number; text: string }
async function timedCues(info: VideoInfo): Promise<Cue[]> {
  const original = info.language?.split('-')[0]
  const pick = (tracks: Record<string, Track[]> = {}, order: string[]) => {
    const lang = order.map((code) => Object.keys(tracks).find((key) => key === code)).find(Boolean)
    return lang ? tracks[lang].find((track) => track.ext === 'json3')?.url : undefined
  }
  const url = pick(info.subtitles, [original, 'ru', 'en', Object.keys(info.subtitles ?? {})[0]].filter(Boolean) as string[])
    ?? pick(info.automatic_captions, [`${original}-orig`, original].filter(Boolean) as string[])
  if (!url) return []
  const response = await fetch(url)
  if (!response.ok) return []
  const data = await response.json() as { events?: Array<{ tStartMs?: number; segs?: Array<{ utf8: string }> }> }
  const cues: Cue[] = []
  for (const event of data.events ?? []) {
    const text = (event.segs ?? []).map((seg) => seg.utf8).join('').replace(/\s+/g, ' ').trim()
    if (!text) continue
    const t = Math.floor((event.tStartMs ?? 0) / 1000)
    const last = cues.at(-1)
    if (last && t - last.t < 20) last.text = `${last.text} ${text}`
    else cues.push({ t, text })
  }
  return cues
}
// Ролики, добавленные до таймкодов, — по одному раз в 30 с, чтобы YouTube не ответил 429
let cuesBusy = false
async function backfillCues() {
  if (cuesBusy) return
  const meta = list().find((item) => item.kind === 'youtube' && !item.noCues && !existsSync(join(libraryDir, item.id, 'cues.json')) && typeof item.source === 'string')
  if (!meta) return
  cuesBusy = true
  try {
    const cues = await timedCues(JSON.parse(await ytDlp(['-J', '--no-playlist', String(meta.source)])))
    if (cues.length) writeFileSync(join(libraryDir, meta.id, 'cues.json'), JSON.stringify(cues) + '\n')
    else writeMeta({ ...readMeta(meta.id), noCues: true })
  } catch { writeMeta({ ...readMeta(meta.id), noCues: true }) } finally { cuesBusy = false }
}

// Что YouTube показывает под роликом: просмотры, дата, описание автора (со ссылками) — карточка выводит это под плеером
const ytInfo = (info: { description?: string; view_count?: number; upload_date?: string }) => ({
  ytDescription: String(info.description ?? '').trim(), views: info.view_count, uploaded: info.upload_date ? `${info.upload_date.slice(0, 4)}-${info.upload_date.slice(4, 6)}-${info.upload_date.slice(6, 8)}` : undefined, ytInfoAt: Date.now(),
})
async function ingest(id: string, link: string) {
  const dir = join(libraryDir, id)
  try {
    const host = new URL(link).hostname.replace(/^(www|m)\./, '')
    if (youtubeHost.test(host)) {
      const info = JSON.parse(await ytDlp(['-J', '--no-playlist', link]))
      const subs = await subtitles(info)
      // Без субтитров карточка всё равно создаётся (обложка, название, плеер) — раньше падала до обложки и оставалась пустой, не открываясь.
      // Для разбора берём описание ролика; нет и его — разбор честно скажет, что текста нет (noText)
      const text = subs || [info.title, info.description].filter(Boolean).join('\n\n')
      if (text) writeFileSync(join(dir, 'text.txt'), text + '\n')
      const cues = await timedCues(info).catch(() => [])
      if (cues.length) writeFileSync(join(dir, 'cues.json'), JSON.stringify(cues) + '\n')
      const cover = info.thumbnail ? await download(id, info.thumbnail) : { image: '', ratio: '16 / 9' }
      writeMeta({ ...readMeta(id), kind: 'youtube', title: info.title ?? host, author: info.channel ?? info.uploader ?? '', duration: info.duration, ...ytInfo(info), ...cover, fetching: false })
    } else if (pinterestHost.test(host)) {
      // Видео-пин yt-dlp скачивает целиком; у картинки-пина берём саму картинку, а если yt-dlp её не видит — превью страницы.
      let poster = ''
      let video = ''
      try {
        const info = JSON.parse(await ytDlp(['-J', '--no-playlist', link]))
        const isVideo = [info, ...(info.formats ?? [])].some((format: { vcodec?: string }) => format.vcodec && format.vcodec !== 'none')
        poster = !isVideo && /\.(jpe?g|png|webp|gif)(\?|$)/i.test(info.url ?? '') ? info.url : info.thumbnail ?? ''
        if (isVideo) {
          await ytDlp(['--no-playlist', '-o', join(dir, 'source-video.%(ext)s'), link])
          const file = readdirSync(dir).find((name) => name.startsWith('source-video.'))
          if (file) video = `/library/${id}/${file}`
        }
      } catch { /* картинка-пин — ниже возьмём превью страницы */ }
      if (!poster) poster = await pagePreview(link)
      if (!poster) throw new Error(t('На странице пина не нашлось ни картинки, ни видео'))
      const cover = await download(id, poster)
      writeMeta({ ...readMeta(id), ...cover, format: video ? 'video' : 'image', video: video || undefined, fetching: false, describing: true })
      void describe(id)
      return
    } else if (xHost.test(host)) {
      const post = await xPost(link)
      // Текст без хвоста из ссылок t.co на медиа; автор — «Имя (@ник)»
      const text = Array.from(post.text).slice(...(post.display_text_range ?? [0, Infinity])).join('').replace(/https:\/\/t\.co\/\S+/g, '').trim()
      const items = (post.mediaDetails ?? []).map((media): PostItem => ({
        image: media.media_url_https.replace(/(\.\w+)$/, '$1?name=large'),
        video: media.video_info?.variants.filter((item) => item.content_type === 'video/mp4').sort((a, b) => (b.bitrate ?? 0) - (a.bitrate ?? 0))[0]?.url,
      }))
      if (await savePost(id, { text, author: post.user ? `${post.user.name} (@${post.user.screen_name})` : '', items, at: post.created_at ? Date.parse(post.created_at) : undefined })) return
    } else if (tgHost.test(host)) {
      if (await savePost(id, await tgPost(link))) return
    } else {
      // Файл своей же библиотеки (картинку из карточки перетащили мышью) — копируем с диска: порт сервера мог смениться
      const own = /^(localhost|127\.0\.0\.1)$/.test(new URL(link).hostname) ? onDisk(decodeURIComponent(new URL(link).pathname)) : ''
      if (own && existsSync(own) && /\.(jpe?g|png|webp|gif|mp4|webm|mov)$/i.test(own)) {
        const ext = own.split('.').pop()!.toLowerCase()
        const video = /^(mp4|webm|mov)$/.test(ext)
        const file = join(libraryDir, id, `${video ? 'source-video' : 'source'}.${ext}`)
        copyFileSync(own, file)
        rmSync(join(libraryDir, id, 'text.txt'), { force: true })
        const local = `/library/${id}/${video ? 'source-video' : 'source'}.${ext}`
        const { w, h } = video ? { w: 0, h: 0 } : size(file)
        const cover = video ? videoPoster(id, local, 'source') : { image: local, ratio: w && h ? `${w} / ${h}` : '4 / 3' }
        writeMeta({ ...readMeta(id), ...cover, kind: undefined, format: video ? 'video' : 'image', video: video ? local : undefined, fetching: false, describing: true })
        void describe(id)
        return
      }
      const response = await fetch(link, { headers: { 'User-Agent': userAgent, 'Accept-Language': 'ru,en;q=0.8' } }).catch(() => undefined)
      if (!response?.ok) throw new Error(t('Страница не открылась'))
      // Ссылка прямо на файл (картинка из другой карточки, перетащенная мышью; видео): это реф, а не статья —
      // раньше байты картинки читались как текст. Другой не-HTML (PDF, архив) — честная ошибка
      const type = response.headers.get('content-type')?.split(';')[0].trim() ?? ''
      if (/^(image|video)\//.test(type)) {
        await response.body?.cancel()
        const dir = join(libraryDir, id)
        rmSync(join(dir, 'text.txt'), { force: true })
        const video = type.startsWith('video/') ? (await download(id, link, 'source-video')).image : ''
        const cover = video ? videoPoster(id, video, 'source') : await download(id, link)
        if (!cover) throw new Error(t('У видео не получилось взять кадр для обложки'))
        writeMeta({ ...readMeta(id), ...cover, kind: undefined, format: video ? 'video' : 'image', video: video || undefined, fetching: false, describing: true })
        void describe(id)
        return
      }
      if (type && !/html|xml|text\/plain/.test(type)) throw new Error(t('Это не страница, а файл ({type}) — перетащите сам файл', { type }))
      const html = await response.text()
      // Вместо страницы — капча или вход (Кинопоиск уводит на passport.yandex.ru): сохраняем закладкой без данных
      // и честно пишем, что сайт не пустил. Защиту не обходим (2026-10-04)
      if (isStub(link, response, html)) {
        const path = new URL(link).pathname.replace(/\/$/, '')
        writeFileSync(join(libraryDir, id, 'text.txt'), link + '\n')
        writeMeta({ ...readMeta(id), kind: 'link', title: host.replace(/^www\./, '') + path, image: '', ratio: '4 / 3', fetching: false, fetchError: t('Сайт не пустил — добавь описание или сохрани через расширение'), describing: true })
        void sortMaterial(id)
        return
      }
      const dom = new JSDOM(html, { url: link })
      const preview = previewOf(dom, link) // до Readability: он перекраивает документ
      const page = pageInfo(dom) // тоже до Readability — на случай закладки
      const article = new Readability(dom.window.document).parse()
      const text = article?.textContent?.replace(/\s+/g, ' ').trim()
      // Текста статьи нет (альбом, плейлист, приложение) — сохраняем закладкой, а не ошибкой
      if (!text) return await bookmark(id, link, host, dom, page)
      writeFileSync(join(dir, 'text.txt'), text + '\n')
      const cover = preview ? await download(id, preview).catch(() => ({ image: '', ratio: '4 / 3' })) : { image: '', ratio: '4 / 3' }
      writeMeta({ ...readMeta(id), kind: 'article', title: article?.title || host, author: article?.byline ?? '', ...cover, fetching: false })
    }
    writeMeta({ ...readMeta(id), describing: true }); void sortMaterial(id) // полная выжимка — по кнопке
  } catch (error) {
    if (existsSync(metaPath(id))) writeMeta({ ...readMeta(id), fetching: false, fetchError: (error as Error).message })
  }
}

// Заглушка вместо страницы: ушли на другой сайт (вход, капча), 403/429 или текст проверки на робота
const stubText = /smartcaptcha|showcaptcha|не\s+робот|just a moment|captcha|attention required|access denied/i
function isStub(link: string, response: Response, html: string) {
  const base = (host: string) => host.replace(/^www\./, '').split('.').slice(-2).join('.')
  const to = response.url ? new URL(response.url) : undefined
  if (to && base(to.hostname) !== base(new URL(link).hostname) && /passport|sso|login|signin|auth|captcha/i.test(to.hostname + to.pathname)) return true
  if (response.status === 403 || response.status === 429) return true
  return stubText.test(html.slice(0, 20_000)) && html.length < 200_000
}
// Для подсказки тегов: только <head> (первые 300 КБ), не дольше 3 с; ответ помним, пока работает сервер
const peeked = new Map<string, string>()
async function peek(link: string) {
  if (peeked.has(link)) return peeked.get(link)!
  try {
    const response = await fetch(link, { headers: { 'User-Agent': userAgent }, signal: AbortSignal.timeout(3000) })
    if (!response.ok || !/html/.test(response.headers.get('content-type') ?? '')) return ''
    if (isStub(link, response, '')) return ''
    const reader = response.body!.getReader()
    let html = ''
    const decoder = new TextDecoder()
    while (html.length < 300_000 && !/<\/head>/i.test(html)) { const { done, value } = await reader.read(); if (done) break; html += decoder.decode(value, { stream: true }) }
    void reader.cancel().catch(() => {})
    const meta = (name: string) => html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${name}["'][^>]*>`, 'i'))?.[0].match(/content=["']([^"']*)/i)?.[1] ?? ''
    if (stubText.test(html.slice(0, 20_000))) return ''
    const text = [meta('og:title') || html.match(/<title[^>]*>([^<]*)/i)?.[1] || '', meta('og:description') || meta('description'), meta('keywords')].join(' ')
    peeked.set(link, text)
    return text
  } catch { return '' }
}

const previewOf = (dom: JSDOM, link: string) => {
  const content = dom.window.document.querySelector('meta[property="og:image"], meta[name="twitter:image"]')?.getAttribute('content')
  return content ? new URL(content, link).href : ''
}
async function pagePreview(link: string) {
  const response = await fetch(link, { headers: { 'User-Agent': userAgent } })
  return response.ok ? previewOf(new JSDOM(await response.text(), { url: link }), link) : ''
}

// ── Закладка ───────────────────────────────────────────────────────────────
// Страница без текста статьи (Spotify, SoundCloud, Vimeo, приложения) — kind: 'link': название, описание и обложка
// из карточки встраивания (oEmbed) и тегов og:, плеер — если сайт его отдаёт. Выжимку не делаем: разбирать нечего
const tag = (dom: JSDOM, ...names: string[]) => names.map((name) => dom.window.document.querySelector(`meta[property="${name}"], meta[name="${name}"]`)?.getAttribute('content')?.trim()).find(Boolean) ?? ''
const pageInfo = (dom: JSDOM) => ({
  title: tag(dom, 'og:title', 'twitter:title') || dom.window.document.title.trim(),
  description: tag(dom, 'og:description', 'twitter:description', 'description'),
  oembed: dom.window.document.querySelector('link[type="application/json+oembed"]')?.getAttribute('href') ?? '',
})
// Сайты, которые отдают oEmbed, но не объявляют его на странице
const oembedHosts: Array<[RegExp, string]> = [
  [/(^|\.)spotify\.com$/, 'https://open.spotify.com/oembed'],
  [/(^|\.)soundcloud\.com$/, 'https://soundcloud.com/oembed?format=json'],
  [/(^|\.)vimeo\.com$/, 'https://vimeo.com/api/oembed.json'],
]
type OEmbed = { title?: string; author_name?: string; thumbnail_url?: string; html?: string; width?: number; height?: number }
async function oembedOf(link: string, host: string, declared: string): Promise<OEmbed> {
  const known = oembedHosts.find(([pattern]) => pattern.test(host))?.[1]
  const endpoint = declared || (known ? `${known}${known.includes('?') ? '&' : '?'}url=${encodeURIComponent(link)}` : '')
  if (!endpoint) return {}
  try {
    const response = await fetch(new URL(endpoint, link), { headers: { 'User-Agent': userAgent } })
    return response.ok ? await response.json() as OEmbed : {}
  } catch { return {} }
}
// Плеер — только адрес iframe по https из ответа oEmbed; остальную разметку сайта не берём
const spotifyHost = /(^|\.)spotify\.com$/
const embedOf = (html = '') => html.match(/<iframe[^>]+src="(https:\/\/[^"]+)"/i)?.[1]?.replace(/&amp;/g, '&') ?? ''
async function bookmark(id: string, link: string, host: string, dom: JSDOM, page: ReturnType<typeof pageInfo>) {
  // Часть сайтов (Spotify) отдаёт теги og: только ботам-превьюшникам — спрашиваем второй раз их голосом
  let info = page
  let preview = previewOf(dom, link)
  if (!info.description || !preview) {
    const again = await fetch(link, { headers: { 'User-Agent': 'facebookexternalhit/1.1' } }).catch(() => undefined)
    if (again?.ok) {
      const bot = new JSDOM(await again.text(), { url: link })
      const more = pageInfo(bot)
      info = { title: more.title || info.title, description: more.description || info.description, oembed: info.oembed || more.oembed }
      preview = preview || previewOf(bot, link)
    }
  }
  const oembed = await oembedOf(link, host, info.oembed)
  const embed = embedOf(oembed.html)
  const cover = oembed.thumbnail_url || preview
  const image = cover ? await download(id, cover).catch(() => ({ image: '', ratio: '4 / 3' })) : { image: '', ratio: '4 / 3' }
  const description = info.description || [oembed.author_name, oembed.title].filter(Boolean).join(' · ')
  writeFileSync(join(libraryDir, id, 'text.txt'), [oembed.title || info.title, description, link].filter(Boolean).join('\n') + '\n')
  writeMeta({
    // Spotify — музыка (grill-music.md): свой тип в меню, выжимка «кто это и откуда» с поиском по кнопке
    ...readMeta(id), kind: spotifyHost.test(host) ? 'music' : 'link', title: oembed.title || info.title || host, description, author: oembed.author_name ?? '',
    ...image, embed: embed || undefined, embedRatio: embed && oembed.width && oembed.height ? `${oembed.width} / ${oembed.height}` : undefined,
    fetching: false, fetchError: undefined, describing: true,
  })
  void sortMaterial(id) // подборки и теги по названию и описанию; название и описание сайта не трогаем
}

// ── Выжимка ────────────────────────────────────────────────────────────────
// Агент делает то же, что владелец просит в чате: «разбери и скажи, как применить».
// Только по кнопке, выбранной моделью (владелец решил 2026-09-26: не тратить токены сразу). При добавлении — сортировка ниже.

// Сортировка материала: самая дешёвая модель читает начало текста и раскладывает — название, строка описания, теги, подборки.
// ~6 тыс. токенов вместо 20–70 у полной выжимки; этого хватает, чтобы материал нашёлся поиском и лёг в нужную подборку.
const sortSchema = {
  type: 'object', additionalProperties: false, required: ['title', 'description', 'tags', 'collections', 'newTags'],
  properties: { title: str, description: str, tags: { type: 'array', items: str }, collections: { type: 'array', items: str }, newTags: newTagsSchema },
}
async function sortMaterial(id: string) {
  try {
    const meta = readMeta(id)
    const choice = collectionChoice(meta.kind === 'link' ? 'article' : meta.kind as TypeId) // у закладки подборки — как у статьи
    const text = readFileSync(join(libraryDir, id, 'text.txt'), 'utf8').slice(0, 4000)
    const kind = meta.kind === 'youtube' ? 'начало расшифровки ролика' : meta.kind === 'note' ? 'заметка' : meta.kind === 'music' ? 'музыка из Spotify (название, описание, адрес)' : meta.kind === 'link' ? 'закладка на страницу (название, описание, адрес)' : 'начало статьи'
    const prompt = [
      `Ниже — ${kind} «${meta.title}». Ничего не запускай и не читай — только этот текст.`,
      'Разложи для поиска, без разбора:',
      '— title: 2–6 слов, о чём материал;',
      '— description: одно предложение — о чём он;',
      '— tags: 3–5 слов для поиска в нижнем регистре (это не теги словаря);',
      collectionsLine(choice.hints),
      namingLines(),
      t('По-русски.'), '', '---', text,
    ].join('\n')
    const usage: Usage[] = []
    const result = JSON.parse(await runModel({ kind: 'sort', prompt, images: [], cwd: isolated('sort'), schema: sortSchema, track: usage }, 'sort'))
    const fresh = readMeta(id)
    writeMeta({
      ...fresh, title: fresh.titleEdited || ((fresh.kind === 'link' || fresh.kind === 'music') && fresh.title) ? fresh.title : result.title,
      description: keepsDescription(fresh) || ((fresh.kind === 'link' || fresh.kind === 'music') && fresh.description) ? fresh.description : result.description, // своё описание владельца не затираем (2026-10-04)
      tags: (fresh.tags as string[] | undefined)?.length ? fresh.tags : result.tags,
      collections: pickTags(fresh, result, choice.names), tagOffer: offerTag(fresh, result),
      describing: false, describeError: undefined, sortUsage: usage,
    })
  } catch (error) {
    if (existsSync(metaPath(id))) writeMeta({ ...readMeta(id), describing: false, describeError: (error as Error).message })
  }
}

// Выжимка — только ответ в ленту и подсказки: название, теги и подборки раскладывает дешёвая сортировка при добавлении,
// а менять карточку агент может лишь по просьбе владельца (прожарка grill-agent-column.md)
const digestSchema = {
  type: 'object', additionalProperties: false, required: ['summary', 'map', 'terms', 'apply', 'suggestions', 'memory'],
  properties: { summary: { type: 'array', items: str }, map: { type: 'array', items: str }, terms: { type: 'array', items: str }, apply: { type: 'array', items: str }, suggestions: { type: 'array', items: str }, memory: { type: 'array', items: { type: 'string' } } },
}
// Ролик для разбора: субтитры с таймкодами [м:сс] из cues.json (если есть), иначе text.txt — чтобы идеи можно было проверить в видео
function timedText(id: string, textFile: string) {
  const cuesFile = join(libraryDir, id, 'cues.json')
  if (existsSync(cuesFile)) {
    try {
      const cues = JSON.parse(readFileSync(cuesFile, 'utf8')) as Array<{ t: number; text: string }>
      if (cues.length) return cues.map((cue) => `[${Math.floor(cue.t / 60)}:${String(cue.t % 60).padStart(2, '0')}] ${cue.text}`).join('\n')
    } catch { /* битый файл — берём обычный текст */ }
  }
  return readFileSync(textFile, 'utf8')
}
// meaning — заметка владельца из окна добавления («зачем сохранил»): главный контекст разбора (grill-minimal.md)
const digestPrompt = (kind: string, title: string, text: string, meaning = '') => [
  `Ниже — ${kind === 'youtube' ? 'расшифровка ролика' : kind === 'note' ? 'заметка' : 'текст статьи'} «${title}». Ничего не запускай и не читай — только этот текст. ${ownContext}`,
  memoryLines(),
  ...(meaning ? [`Владелец сохранил это, потому что: «${meaning}». Разбирай под эту цель.`] : []),
  'Разбери его так, будто владелец кинул материал в чат с просьбой «разбери и скажи, как применить». Не выдумывай: каждая идея должна быть в тексте ниже; чего там нет — не приписывай, даже если звучит правдоподобно. Автогенерённые субтитры искажают названия: исправляй очевидное по смыслу и не придумывай то, что неясно.',
  // Короткой заметке не нужна «выжимка» длиннее её самой: на одно предложение модель писала шесть мыслей
  text.length < 600 ? '— summary: 1–2 мысли — суть заметки своими словами, без домыслов сверх текста;' : '— summary: 5–7 главных идей автора, каждая — одно предложение; у ролика в конце в скобках таймкод [м:сс], где это сказано; идеи из всего материала, не только из начала (в начале ролика часто нарезка-тизер); без воды, вступлений и рекламы; если автор продаёт продукт, а цифры не доказаны, последним пунктом одной строкой отметь «заявлено, не доказано: …»;',
  text.length < 600 ? '— map: пустой список;' : '— map: 8–15 разделов материала по порядку, по одной строке; у ролика «[м:сс] о чём раздел», у статьи — заголовок или первая фраза раздела; только то, что есть в тексте;',
  text.length < 600 ? '— terms: пустой список;' : '— terms: 5–12 понятий, методов и приёмов, которые автор называет по имени; строка «термин — что значит у автора»; общие слова не брать;',
  text.length < 600 ? '— apply: 1–2 шага, только если они прямо следуют из заметки;' : '— apply: 3–5 действий, которые можно сделать на этой неделе; каждое начинается с глагола, называет, что именно сделать и какой получится результат; бери только то, что следует из материала, а не общие советы;',
  suggestionsLine,
  t('По-русски, даже если материал на другом языке.'),
  '',
  '---',
  text.slice(0, 60000),
].join('\n')

// Разбор рефа — тот же формат, что выжимка материала: главное — в чём приём и какие детали его делают; как применить —
// где и как взять к себе. Агент смотрит картинку или кадры видео (visuals). Приём, а не копия: без брендов и чужих текстов.
// Разбор картинки — из контекста: что это, откуда и зачем владельцу; графика — только если это про неё (интерфейс, видео)
const refDigestPrompt = (meta: Meta, seen: string) => [
  `Приложена картинка «${meta.title}». Ничего не запускай и не читай, кроме приложенных картинок. ${ownContext}`,
  memoryLines(),
  seen,
  meta.description ? `Описание: ${meta.description}` : '',
  contextOf(meta),
  'Разбери, исходя из контекста: что это конкретно и зачем владелец это сохранил. Называй прямо (модель, человек, продукт), если это ясно из контекста или узнаваемо; чего не знаешь — не выдумывай.',
  '— summary: 4–6 пунктов — что это, чем примечательно и как связано с тем, откуда пришло. Разбор графики (композиция, типографика, цвет, состояния; у видео — движение и темп) — только если на картинке интерфейс или визуальный приём, ради которого её сохранили;',
  '— apply: 3–5 шагов, что с этим сделать дальше — в работе, в проекте или в той теме, откуда пришло; каждый начинается с глагола; интерфейс — приём, а не копия: без чужих логотипов, текстов и фирменных цветов;',
  '— map: пустой список;',
  '— terms: пустой список;',
  suggestionsLine,
  t('По-русски.'),
].filter(Boolean).join('\n')

// Выжимка музыки (grill-music.md): со страницы Spotify приходит только «album · 2026 · 12 songs», поэтому агент ищет
// в сети — это по кнопке «Разбери», то есть с разрешения владельца, как «Поискать в сети?». Ответ — «кто это и откуда»
const musicDigestPrompt = (meta: Meta, text: string) => [
  `Владелец сохранил музыку из Spotify: «${meta.title}». ${ownContext}`,
  memoryLines(),
  ownerNote(meta) ? `Владелец сохранил это, потому что: «${ownerNote(meta)}».` : '',
  text,
  'Владелец нажал «Разбери» — поиск в интернете разрешён (WebSearch, WebFetch или свой поиск). Найди, кто это и откуда.',
  '— summary: 3–5 коротких пунктов: кто артист (или группа), откуда (город, страна, сцена), с кем связан, чем известен; у альбома или трека — что это за релиз. Последний пункт — «Источники: …», 1–3 адреса страниц, где это нашлось. Чего не нашёл — так и скажи, не выдумывай;',
  '— apply: пустой список;',
  '— map: пустой список;',
  '— terms: пустой список;',
  suggestionsLine,
  t('По-русски.'),
].filter(Boolean).join('\n')

async function digest(id: string) {
  if ((readMeta(id).sources as string[] | undefined)?.length) return runSynthesis(id) // заметка-синтез: «Заново» — снова синтез
  const { signal, onProgress } = startRun(id)
  try {
    const meta = readMeta(id)
    const usage: Usage[] = []
    let request: ModelRun
    if (meta.kind === 'music') {
      const file = join(libraryDir, id, 'text.txt')
      request = { kind: 'digest', prompt: musicDigestPrompt(meta, existsSync(file) ? readFileSync(file, 'utf8') : String(meta.source ?? '')), images: [], cwd: isolated('digest'), web: true, schema: digestSchema, track: usage }
    } else if (!meta.kind) {
      const seen = visuals(meta)
      if (!seen.images.length) throw new Error(t('Картинки нет на диске — разбирать нечего'))
      request = { kind: 'digest', prompt: refDigestPrompt(meta, seen.note), images: seen.images, cwd: isolated('digest'), schema: digestSchema, track: usage }
    } else {
      const file = join(libraryDir, id, 'text.txt')
      if (!existsSync(file)) throw new Error(t('Текста нет на диске — разбирать нечего'))
      request = { kind: 'digest', prompt: digestPrompt(String(meta.kind), String(meta.title), timedText(id, file), ownerNote(meta)), images: [], cwd: isolated('digest'), schema: digestSchema, track: usage }
    }
    const result = JSON.parse(await runModel({ ...request, signal, onProgress }, 'digest'))
    const fresh = readMeta(id)
    // Уже не digesting — эту же выжимку успел записать другой запуск (перезапуск сервера, второй сервер): второй ответ не нужен
    if (!fresh.digesting) return
    const turn: Turn = { command: digestCommand(fresh), answer: digestAnswer(result), at: Date.now(), usage, via: 'digest', usedMemory: usedMemory(result.memory) }
    writeMeta({ ...fresh, thread: [...threadOf(fresh), turn], suggestions: result.suggestions, digesting: false, digestError: undefined })
  } catch (error) {
    // Остановлено владельцем — не ошибка
    if (existsSync(metaPath(id))) writeMeta({ ...readMeta(id), digesting: false, digestError: signal.aborted ? undefined : (error as Error).message })
  } finally { endRun(id) }
}

// ── Макет 1:1 ──────────────────────────────────────────────────────────────

const buildPrompt = (w: number, h: number, note: string) => [
  `Приложена картинка ${w}×${h} px — UI-референс. В папке она же: source.png.`,
  `Собери index.html, который выглядит в точности как эта картинка: холст ровно ${w}×${h} px (html, body без отступов и прокрутки), всё на своих местах, в своих размерах, цветах, шрифтах, скруглениях, тенях. Тексты — дословно, включая опечатки: ничего не исправляй и не додумывай.`,
  'Фото, аватары, 3D, сложные иллюстрации и фотореалистичные объекты не рисуй — вместо них серая заглушка #cfcfcf той же формы и размера с классом ph (class="ph"). Иконки — простым inline SVG.',
  note ? `Владелец отметил, что ему здесь важно: «${note}» — это должно получиться особенно точно.` : '',
  'Один самодостаточный файл: HTML + CSS + inline SVG, без внешних ресурсов и скриптов. Шрифт — ближайший системный.',
  'Работай одним ходом: не запускай команд и проверок — сразу запиши index.html.',
].filter(Boolean).join('\n')

const fixPrompt = () => [
  'Приложены две картинки: 1) референс source.png; 2) скриншот текущего index.html того же размера.',
  'Найди самые заметные расхождения (положение и размеры блоков, фоны, цвета, пропавшие или лишние элементы, тексты) и исправь их в index.html точечными заменами.',
  'Не переписывай файл целиком и не трогай то, что уже совпадает. Заглушки с классом ph оставь заглушками.',
  'Работай одним ходом: без команд и проверок.',
].join('\n')

const reworkPrompt = (feedback: string) => [
  'Приложены две картинки: 1) референс source.png; 2) скриншот текущего index.html того же размера.',
  `Владелец просит исправить: «${feedback}». Сделай именно это точечными заменами в index.html — остальное не трогай, файл целиком не переписывай.`,
  'Цель прежняя — один в один с референсом, без интерпретаций. Заглушки с классом ph оставь заглушками. Работай одним ходом: без команд и проверок.',
].join('\n')

const judgeSchema = { type: 'object', additionalProperties: false, required: ['closer', 'why'], properties: { closer: { type: 'string', enum: ['A', 'B'] }, why: str } }
const judgePrompt = 'Приложены три картинки: 1) референс; 2) вариант A; 3) вариант B. Какой вариант ближе к референсу по раскладке, размерам, цветам и текстам? Серые заглушки на месте фото не считаются ошибкой. Ответь A или B и коротко почему.'

async function convert(id: string, feedback = '') {
  const dir = join(libraryDir, id)
  const usage: Usage[] = []
  try {
    const meta = readMeta(id)
    const image = join(libraryDir, String(meta.image).replace(/^\/library\//, ''))
    if (!String(meta.image).startsWith('/library/') || !existsSync(image)) throw new Error(t('Картинки нет на диске'))
    const cwd = isolated('convert')
    // Мелкий исходник увеличиваем: на 200 px модель теряет детали (калибровка capsule-bars).
    execFileSync('sips', ['-s', 'format', 'png', image, '--out', join(cwd, 'original.png')], { stdio: 'ignore' })
    const { w, h } = zoom(join(cwd, 'original.png'), join(cwd, 'source.png'))
    const shot = (name: string) => { const out = join(cwd, name); screenshot(join(cwd, 'index.html'), out, w, h); return out }

    // «Переделать» с комментарием: правим прошлый код по словам владельца, один ход, без судьи — решает владелец.
    if (feedback && existsSync(join(dir, 'code.html'))) {
      copyFileSync(join(dir, 'code.html'), join(cwd, 'index.html'))
      copyFileSync(join(dir, 'code.html'), join(dir, 'code-prev.html'))
      await runCodex({ kind: 'rework', model: 'gpt-reserve', effort: 'medium', prompt: reworkPrompt(feedback), images: [join(cwd, 'source.png'), shot('render-0.png')], cwd, write: true, track: usage })
      copyFileSync(join(cwd, 'index.html'), join(cwd, 'best.html'))
    } else {
      await runCodex({ kind: 'build', model: 'gpt-reserve', effort: 'medium', prompt: buildPrompt(w, h, ownerNote(meta)), images: [join(cwd, 'source.png')], cwd, write: true, track: usage })
      if (!existsSync(join(cwd, 'index.html'))) throw new Error(t('Агент не записал index.html'))
      copyFileSync(join(cwd, 'index.html'), join(cwd, 'best.html'))
    }
    let best = shot('render-1.png')
    for (let round = 2; round <= 3 && !feedback; round++) {
      await runCodex({ kind: `fix-${round}`, model: 'gpt-reserve', effort: 'medium', prompt: fixPrompt(), images: [join(cwd, 'source.png'), best], cwd, write: true, track: usage })
      const next = shot(`render-${round}.png`)
      const verdict = JSON.parse(await runCodex({ kind: `judge-${round}`, model: 'gpt-5.6-luna', prompt: judgePrompt, images: [join(cwd, 'source.png'), best, next], cwd: isolated('judge'), schema: judgeSchema, track: usage }))
      if (verdict.closer !== 'B') { copyFileSync(join(cwd, 'best.html'), join(cwd, 'index.html')); break } // правка не лучше — откат и стоп
      best = next
      copyFileSync(join(cwd, 'index.html'), join(cwd, 'best.html'))
    }
    copyFileSync(join(cwd, 'best.html'), join(dir, 'code.html'))
    copyFileSync(best, join(dir, 'code-render.png'))
    writeFileSync(join(dir, 'code-usage.json'), JSON.stringify(usage, null, 2) + '\n')
    writeMeta({ ...readMeta(id), converting: false, hasCode: true, codeAt: Date.now(), convertError: undefined })
  } catch (error) {
    if (existsSync(metaPath(id))) writeMeta({ ...readMeta(id), converting: false, convertError: (error as Error).message })
  }
}

// ── Промпт для агента ──────────────────────────────────────────────────────
// Агент (Claude Code, Codex) работает на этом же компьютере и открывает файлы сам — поэтому в промпте пути к оригиналу,
// а не пересказ: по одному тексту геометрия теряется (калибровка semicircle-scale).

function prompt(meta: Meta) {
  if (meta.kind) return materialPrompt(meta)
  const image = onDisk(meta.image)
  const video = onDisk(meta.video)
  const code = join(libraryDir, meta.id, 'code.html')
  const source = String(meta.source ?? '')
  const tags = (meta.tags as string[] | undefined) ?? []
  const facts = [
    `Референс из Refkit: «${meta.title}»`,
    video ? `Видео: ${video} — движение смотри по кадрам (например, ffmpeg -vf fps=10)` : '',
    image ? `${video ? 'Первый кадр' : 'Картинка'}: ${image}` : '',
    meta.description ? `Что на нём: ${meta.description}` : '',
    ownerNote(meta) ? `Что здесь важно: ${ownerNote(meta)}` : '',
    tags.length ? `Теги: ${tags.join(', ')}` : '',
    existsSync(code) ? `Макет 1:1 в HTML (если пригодится): ${code}` : '',
    /^https?:\/\//.test(source) ? `Источник: ${source}` : '',
  ].filter(Boolean).join('\n')
  return `${facts}\n\nЗадача: собери этот приём в текущем проекте — в его токенах и компонентах. Тексты, логотипы и фирменные цвета оригинала не переноси.`
}

// Материал (ролик, статья): агенту — путь к полному тексту и готовая выжимка, чтобы не разбирать заново.
// ── Команда агенту из карточки ──────────────────────────────────────────────
// Владелец пишет просьбу (или берёт подсказку по Tab) — агент отвечает текстом, ответ ложится в историю карточки (thread).
// Пока только текст, вне Refkit ничего не пишет; режим «сразу меняет файлы» — позже, этим же адресом.

// via — откуда просьба: подсказка агента (Tab) или написана руками; test — прогон Claude, в замер не идёт. Нужно для замера идеи 8
// attached — что владелец подкинул через «+»: карточки (названия) и файлы (имена); сами файлы не храним
type Turn = { command: string; answer: string; at: number; usage?: Usage[]; via?: 'hint' | 'typed' | 'test' | 'digest'; attached?: string[]; question?: AgentQuestion; steps?: Steps; hints?: number; conversation?: number; webAsk?: string; cards?: string[]; found?: Found[]; remember?: string; remembered?: string; usedMemory?: string[]; makeAction?: string; makeActionName?: string; madeAction?: string; edit?: TextEdit; memoryUpdate?: string }
type TextEdit = { target: 'note' | 'digest'; from: string; to: string; status: 'pending' | 'applied' | 'rejected' }
// Найденное в сети: страница, подпись агента, копия картинки в папке карточки (прожарка grill-web-search.md)
type Found = { url: string; title: string; image: string; ratio: string }
// Выжимка и разбор — не блок под исходником, а ответ в ленте агента (прожарка grill-agent-column.md): просьба
// «Сделай выжимку» / «Разбери приём», ответ — «главное» строками и «как применить». via: 'digest' — в замер идеи 8 не идёт
// map и terms — для нод холста (разделы с таймкодами, названные понятия); apply остаётся в карточке и в ноды не уходит
type Digest = { summary: string[]; apply: string[]; map?: string[]; terms?: string[] }
const digestCommand = (meta: Meta) => (meta.sources as string[] | undefined)?.length ? String(meta.question || 'Разбери полку вместе') : 'Разбери'
// «Как применить» — только если есть что: у музыки его нет (grill-music.md)
const digestAnswer = (digest: Digest) => [
  ...digest.summary.map((line) => `- ${line}`),
  ...(digest.map?.length ? ['', t('Разделы:'), ...digest.map.map((line) => `- ${line}`)] : []),
  ...(digest.terms?.length ? ['', t('Термины:'), ...digest.terms.map((line) => `- ${line}`)] : []),
  ...(digest.apply.length ? ['', t('Как применить:'), ...digest.apply.map((line) => `- ${line}`)] : []),
].join('\n')
const threadOf = (meta: Meta) => (meta.thread as Turn[] | undefined) ?? []
// Последняя выжимка элемента — её агент получает в контекст всегда, а не только пока она среди трёх последних просьб
// Разговоры в карточке (прожарка grill-agent-panel.md): у ответа — номер разговора, у карточки — текущий; нет номера — первый (0).
// Выжимка — общая для всех разговоров
const conversationOf = (meta: Meta) => Number(meta.conversation ?? 0)
const turnsOf = (meta: Meta, conversation = conversationOf(meta)) => threadOf(meta).filter((turn) => turn.via !== 'digest' && !turn.webAsk && (turn.conversation ?? 0) === conversation)
const digestTurn = (meta: Meta) => threadOf(meta).filter((turn) => turn.via === 'digest').at(-1)
// Перенос: выжимки, сделанные до ленты, встают в неё первым ответом. Один раз на элемент — есть ответ с via: 'digest', пропускаем.
// Поле digest пока остаётся в meta.json (не читается) — удалить, когда владелец посмотрит ленту
function migrateDigests() {
  for (const meta of list()) {
    const digest = meta.digest as Digest | undefined
    if (!digest?.summary) continue
    // плитка без картинки, поиск и INDEX.md берут описание; у кого его не было (заметки-синтезы, часть материалов),
    // первая мысль жила только в digest — переносим её в описание
    const description = String(meta.description ?? '').trim() ? meta.description : digest.summary[0]
    const turn: Turn = { command: digestCommand(meta), answer: digestAnswer(digest), at: Number(meta.digestedAt ?? meta.createdAt), usage: meta.digestUsage as Usage[] | undefined, via: 'digest' }
    const moved = !!digestTurn(meta)
    if (moved && description === meta.description) continue
    writeMeta({ ...meta, description, thread: moved ? threadOf(meta) : [turn, ...threadOf(meta)] })
  }
}
// Просьба отвечает ответом и свежими подсказками — одним вызовом (прожарка 01_strategy/grill-agent-hints.md)
// Агент разбора не притягивает материал к Refkit (2026-09-27); к работе владельца — только через подтверждённую память (2026-10-01):
// ни Refkit, ни проекты и работа владельца — иначе он притягивает всё к ним («автопортрет рабочего метода», «карта принципов Refkit»)
// 2026-10-01 (grill-minimal.md): привязка к работе владельца разрешена — но только к тому, что он сам подтвердил в памяти
const ownContext = t('Опирайся на материалы ниже и общие знания о них. Не упоминай Refkit и эту библиотеку. «Как применить» и подсказки привязывай к тому, что владелец подтвердил о себе в памяти ниже; если о его работе там ничего нет — пиши в общем виде и не выдумывай его проекты.')
// Нода холста делает ровно то, о чём просит инструкция: советы «как применить» и привязка к проектам владельца — только если они в инструкции
const canvasContext = 'Опирайся на материалы ниже и общие знания о них. Не упоминай Refkit и эту библиотеку. Делай то, что просит инструкция, и не добавляй советов «как применить», пока об этом не просили. Память о владельце ниже учитывай только там, где она меняет ответ; его проекты не выдумывай. Если ответ длиннее абзаца, начни его с вывода в 1–3 предложения, затем раздели остальное заголовками «## …»: вывод должен читаться без раскрытия разделов.'
// ── Граф понятий (grill-graph.md, 2026-10-05) ──────────────────────────────
// library/graph.json: на материал — понятия и связи внутри него; пишется после каждого материала, «Стоп» ничего не теряет.
// Строит модель настройки «sort» ТОЛЬКО по кнопке владельца («Построить граф»); в фоне ничего не работает. Слияние
// синонимичных форм и выбор «хабов» (понятия из ≥2 материалов) — без модели, в src/lib/graph-core.mjs.
type GraphEntry = GraphItem & { at: number; model: string; hash?: string }
type GraphFile = { items: Record<string, GraphEntry>; report?: { at: number; text: string; model: string } }
const graphFile = join(libraryDir, 'graph.json')
const readGraph = (): GraphFile => { try { const raw = JSON.parse(readFileSync(graphFile, 'utf8')); return { items: raw.items ?? {}, report: raw.report } } catch { return { items: {} } } }
const writeGraph = (graph: GraphFile) => { const tmp = `${graphFile}.tmp`; writeFileSync(tmp, JSON.stringify(graph, null, 2) + '\n'); renameSync(tmp, graphFile) }
const graphTags = (meta: Meta) => (meta.collections as string[] | undefined) ?? []
const graphText = (meta: Meta) => { const file = join(libraryDir, meta.id, 'text.txt'); return existsSync(file) ? readFileSync(file, 'utf8').slice(0, 3500) : '' }
// В граф идут материалы, где есть что читать: текст или осмысленное описание
const graphCandidates = () => list().filter((meta) => graphText(meta).length > 200 || String(meta.description ?? '').length > 40)
// Хэш того, что читала модель: название, описание, теги и начало текста. Изменилось — понятия устарели («Обновить»).
// У записей, построенных до хэшей, его нет: пока не появится, они считаются свежими (graphState один раз проставляет)
const graphHash = (meta: Meta) => createHash('sha1').update(JSON.stringify([meta.title, meta.description ?? '', graphTags(meta), graphText(meta)])).digest('hex').slice(0, 16)
const graphTokens = 12_800 // входных токенов на материал — замер прототипа 2026-10-05 (почти всё служебный контекст модели, он кэшируется)
const graphRun: { kind: 'idle' | 'build' | 'report'; done: number; total: number; startedAt: number; error: string; controller?: AbortController } = { kind: 'idle', done: 0, total: 0, startedAt: 0, error: '' }
const graphSchema = {
  type: 'object', additionalProperties: false, required: ['concepts', 'relations'],
  properties: {
    concepts: { type: 'array', items: str },
    relations: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['from', 'to', 'label'], properties: { from: str, to: str, label: str } } },
  },
}
async function graphExtract(meta: Meta, vocabulary: string[], signal: AbortSignal) {
  const prompt = [
    `Материал личной библиотеки: «${meta.title}» (${meta.kind ?? meta.format}).`,
    meta.description ? `Описание: ${meta.description}` : '', graphTags(meta).length ? `Теги владельца: ${graphTags(meta).join(', ')}` : '',
    'Достань понятия, о которых этот материал: 3–8 штук. Понятие — тема, приём, инструмент или идея (не имя файла, не общее слово вроде «дизайн»).',
    t('Названия по-русски, в нижнем регистре, в единственном числе, 1–3 слова; английские термины, у которых нет русского, оставь как есть.'),
    vocabulary.length ? `Уже есть понятия в графе. Если смысл тот же — возьми ТОЧНО такое название, не придумывай синоним (так граф сшивается): ${vocabulary.join(' · ')}` : '',
    'Связи — только между понятиями ЭТОГО материала: from, to, label (1–3 слова: «часть», «нужен для», «пример»…). 0–6 связей.',
    'Ничего не запускай и не читай, только этот текст.', '', '---', graphText(meta) || String(meta.description ?? ''),
  ].filter(Boolean).join('\n')
  const usage: Usage[] = []
  const result = JSON.parse(await runModel({ kind: 'graph', prompt, images: [], cwd: isolated('graph'), schema: graphSchema, track: usage, signal }, 'sort')) as { concepts: string[]; relations: Array<{ from: string; to: string; label: string }> }
  const concepts = [...new Set(result.concepts.map((name) => name.trim().toLowerCase()).filter(Boolean))].slice(0, 10)
  return { concepts, relations: result.relations.filter((relation) => concepts.includes(relation.from.trim().toLowerCase()) && concepts.includes(relation.to.trim().toLowerCase())), usage: { input: usage.reduce((sum, item) => sum + item.input, 0), output: usage.reduce((sum, item) => sum + item.output, 0) } }
}
// rebuild — заново по всем (старые записи живут, пока не заменены); иначе только материалы без записи. Два потока:
// словарь понятий растёт по ходу, поэтому порядок не критичен, а время делится пополам
async function graphBuild(rebuild: boolean) {
  if (graphRun.kind !== 'idle') return
  const present = new Set(list().map((meta) => meta.id))
  const first = readGraph()
  for (const id of Object.keys(first.items)) if (!present.has(id)) delete first.items[id] // материал ушёл в корзину — понятия уходят с ним
  writeGraph(first)
  const targets = graphCandidates().filter((meta) => rebuild || !first.items[meta.id] || (first.items[meta.id].hash && first.items[meta.id].hash !== graphHash(meta)))
  const controller = new AbortController()
  Object.assign(graphRun, { kind: 'build', done: 0, total: targets.length, startedAt: Date.now(), error: '', controller })
  const model = modelFor(readSettings().models.sort).id
  let next = 0, failed = 0
  const worker = async () => {
    while (next < targets.length && !controller.signal.aborted && failed < 3) {
      const meta = targets[next++]
      try {
        const vocabulary = derive(readGraph().items).concepts.slice(0, 300).map((concept) => concept.name)
        const entry = await graphExtract(meta, vocabulary, controller.signal)
        const graph = readGraph()
        graph.items[meta.id] = { at: Date.now(), model, hash: graphHash(meta), ...entry }
        writeGraph(graph)
        failed = 0
      } catch (error) {
        if (controller.signal.aborted) return
        failed++; graphRun.error = (error as Error).message.slice(0, 200)
      }
      graphRun.done++
    }
  }
  try { await Promise.all([worker(), worker()]) } finally { Object.assign(graphRun, { kind: 'idle', controller: undefined }); try { graphExport() } catch { /* экспорт — дополнение, граф уже сохранён */ } }
}
// «Находки о себе»: одна просьба по сводке графа (не по текстам) и по памяти владельца
async function graphReport() {
  if (graphRun.kind !== 'idle') return
  const present = new Set(list().map((meta) => meta.id))
  const graph = readGraph()
  const derived = derive(graph.items, present)
  if (!derived.hubs.length) { graphRun.error = 'Сначала построй граф: общих понятий пока нет'; return }
  const controller = new AbortController()
  Object.assign(graphRun, { kind: 'report', done: 0, total: 1, startedAt: Date.now(), error: '', controller })
  try {
    const titles = new Map(list().map((meta) => [meta.id, String(meta.title)]))
    const prompt = [
      'Ты читаешь граф личной библиотеки владельца: понятия, которые повторяются в его материалах, и пары, которые идут вместе. Скажи ему о нём самом.',
      'Три коротких раздела: «Что ты копишь» (2–3 темы), «Чего не хватает» (1–2 пробела: соседние темы, о которых почти ничего нет), «Неожиданная связь» (1–2 пары, которые стоит заметить). Без пересказа материалов и без вступлений.',
      memoryLines(), '', 'Сводка графа (JSON):', JSON.stringify(summary(derived, (id) => titles.get(id) ?? id)),
      'Ничего не запускай и не читай, только эта сводка.',
    ].filter(Boolean).join('\n')
    const text = (await runModel({ kind: 'graph-report', prompt, images: [], cwd: isolated('graph'), signal: controller.signal }, 'ask')).trim()
    const fresh = readGraph()
    fresh.report = { at: Date.now(), text, model: modelFor(readSettings().models.ask).id }
    writeGraph(fresh)
    try { graphExport() } catch { /* см. выше */ }
    graphRun.done = 1
  } catch (error) { if (!controller.signal.aborted) graphRun.error = (error as Error).message.slice(0, 200) }
  finally { Object.assign(graphRun, { kind: 'idle', controller: undefined }) }
}
// Экспорт для агентов: library/graphify-out/graph.json (формат Graphify) и GRAPH.md (как читать и спрашивать). Пишется после
// каждого построения и отчёта — это часть того же действия владельца, не фон; в git не идёт (производное)
function graphExport() {
  const graph = readGraph()
  const metas = list().map((meta) => ({ id: meta.id, title: String(meta.title), kind: meta.kind as string | undefined, format: meta.format as string | undefined, collections: graphTags(meta) }))
  const entries = Object.values(graph.items)
  if (!entries.length) return false
  const dir = join(libraryDir, 'graphify-out')
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'graph.json'), JSON.stringify(toGraphify(graph.items, metas), null, 2) + '\n')
  writeFileSync(join(dir, 'GRAPH.md'), toGraphNotes(graph.items, metas, { builtAt: Math.max(...entries.map((entry) => entry.at)), model: entries.at(-1)?.model, report: graph.report?.text }))
  return true
}
function graphState() {
  const graph = readGraph()
  const metas = list()
  const present = new Set(metas.map((meta) => meta.id))
  // Одноразовая миграция: записям без хэша ставим текущий (граф считается построенным по тому, что есть сейчас)
  const unhashed = Object.entries(graph.items).filter(([id, item]) => !item.hash && present.has(id))
  if (unhashed.length) { for (const [id, item] of unhashed) item.hash = graphHash(metas.find((meta) => meta.id === id)!); writeGraph(graph) }
  const items = Object.fromEntries(Object.entries(graph.items).filter(([id]) => present.has(id)))
  const candidates = graphCandidates()
  const pending = candidates.filter((meta) => !graph.items[meta.id]).length
  const stale = candidates.filter((meta) => graph.items[meta.id]?.hash && graph.items[meta.id].hash !== graphHash(meta)).length
  const measured = Object.values(items).map((item) => item.usage?.input ?? 0).filter(Boolean)
  const perCard = measured.length ? Math.round(measured.reduce((sum, value) => sum + value, 0) / measured.length) : graphTokens
  const { controller: _controller, ...run } = graphRun
  return { items, report: graph.report, run, pending, stale, estimate: { cards: pending + stale, inputTokens: (pending + stale) * perCard } }
}
// «Сделать тегом»: понятие → тег словаря и на материалы с ним. Новый тег можно откатить удалением, существующий — нет
function graphTag(name: string, ids: string[]) {
  const collections = readCollections()
  const created = !collections.some((item) => item.name.toLowerCase() === name.toLowerCase())
  if (created) writeCollections([...collections, { name, types: allTypes, hint: name }])
  const tag = created ? name : collections.find((item) => item.name.toLowerCase() === name.toLowerCase())!.name
  let changed = 0
  for (const id of ids) {
    if (!existsSync(metaPath(id))) continue
    const meta = readMeta(id)
    const have = graphTags(meta)
    if (have.includes(tag)) continue
    writeMeta({ ...meta, collections: [...have, tag] }); changed++
  }
  return { tag, created, changed, collections: readCollections() }
}

// ── Память агента о владельце (прожарка grill-agent-memory.md) ─────────────
// library/memory.json — пожелания к ответам, которые владелец подтвердил («Запомнить: …? — Да»). Живёт в Refkit, а не
// в агенте: подкладывается любому подключённому агенту в каждый запрос. Пожелания к ответам и факты о владельце — не пересказ материалов
type MemoryItem = { id: string; text: string; at: number; from?: string; scope?: string } // scope: нет/«all» — везде, «app» — только агент Refkit, иначе папка проекта
const memoryFile = join(libraryDir, 'memory.json')
const readMemory = (): MemoryItem[] => { try { return JSON.parse(readFileSync(memoryFile, 'utf8')).user ?? [] } catch { return [] } }
const writeMemory = (user: MemoryItem[]) => writeFileSync(memoryFile, JSON.stringify({ user }, null, 2) + '\n')
// Своему агенту — правила «везде» и «только в Refkit»; правила других проектов (область = папка проекта) ему не нужны
const agentMemory = () => readMemory().filter((item) => !item.scope || item.scope === 'all' || item.scope === 'app')
const insightLines = () => { const insights = readInsights(); return insights ? `\nНаблюдения о том, что владелец сохраняет (не правила — контекст, владелец их видел):\n${insights.summary}\n${insights.topics.map((item) => `- ${item.topic}: ${item.text}`).join('\n')}` : '' }
const memoryLines = () => productRules + '\n' + memoryBlock()
const memoryBlock = () => { const items = agentMemory(); return items.length ? `Память о владельце — он её подтвердил, соблюдай всегда; пожелания важнее числа пунктов в схеме ответа:\n${items.map((item, index) => `${index + 1}. ${item.text}`).join('\n')}\nmemory — номера пожеланий, которые реально повлияли на этот ответ (владелец увидит их под ответом); не повлияли — пустой список.` : 'memory — пустой список.' }
// ── Стиль ответов (прожарка grill-agent-style.md) ──────────────────────────
// Стиль — набор строк памяти с переключателем: один активный, подкладывается ТОЛЬКО в ответы в разговоре (карточка и общий агент).
// Выжимки, описания, теги, разбор картинок, музыка и граф идут через memoryLines() без него: это данные библиотеки, не беседа.
// Готовые пресеты — наши (правила и промпты у Refkit, агент любой, идея 10); свои стили владельца — library/style.json
type StyleItem = { id: string; name: string; text: string }
// Тексты написаны заново по правилам открытых скиллов: caveman (JuliusBrussee/caveman, Apache-2.0; mattpocock/skills, MIT) — ответ первым,
// одна мысль на фразу, числа и пути как есть, исключение для опасного; Lii5/ELI5 — взрослым простым языком; roast-скиллы — бьют по идее,
// а не по человеку, каждая шпилька с причиной и ходом исправления. Чужие тексты не копировались (grill-agent-style.md, 2026-10-15)
const stylePresets: StyleItem[] = [
  { id: 'plain', name: t('Обычно'), text: '' },
  { id: 'simple', name: t('Просто'), text: t('Объясняй так, чтобы понял человек без подготовки: простым языком, но не детским и не сюсюкающим. Короткие фразы, одна мысль на фразу. Никакого жаргона; термин, без которого не обойтись, объясни в пять слов. Опирайся на конкретные действия и маленькие примеры или диалоги («ты нажимаешь — открывается…»), а не на определения. Сравнения бери из обычной жизни.') },
  { id: 'short', name: t('Коротко'), text: t('Сначала ответ, потом, если нужно, одно пояснение. До трёх строк. Без приветствий, без пересказа вопроса, без «давай посмотрим», без итога в конце. Список — не длиннее пяти пунктов по строке. Предупреждения об опасном или необратимом действии — полными фразами.') },
  { id: 'long', name: t('Подробно'), text: t('Отвечай развёрнуто: сначала вывод одной фразой, затем разбор по пунктам с доводами и примерами из библиотеки, затем оговорки и то, чего ты не знаешь. Не обрывай мысль ради краткости, но и не повторяйся.') },
  { id: 'caveman', name: t('Как пещерный человек'), text: t('Говори как пещерный человек, но мысль держи точной. Ответ первым: что — что делать — почему. Потом следующий шаг. Без приветствий, без «давай», без пересказа вопроса, без вежливости и «возможно». Рубленые фразы, одна мысль на фразу, связки и союзы выбрасывай, короткие слова вместо длинных. Числа, единицы, названия, ссылки на карточки, команды и тексты ошибок оставляй точно как есть. «Не», «никогда», «нет», «только» не выбрасывай. Про опасное или необратимое пиши обычными полными фразами.\nПримеры тона (слова не копируй):\n— «Как добавить ссылку?» → «Кинь ссылку в плюс. Агент разберёт сам. Ждать нечего.»\n— «Стоит делать раздел „Холсты“?» → «Рано. Хронология место уже занимает. Проверь на одном кейсе. Нужен — выноси потом.»') },
  { id: 'cynic', name: t('Едкий циник'), text: t('Ты едкий циник-критик, который разносит идеи. Пощады нет, но разносишь идею, а не человека. Порядок: сначала самое слабое место одной колкой фразой; затем две-три шпильки, каждая с причиной (почему не взлетит, на что похоже из уже провалившегося, куда уйдёт время); в конце одна фраза «что сделать, чтобы не было стыдно». Раздражайся вслух, шути сухо и зло, без пафоса. Не выдумывай факты: не знаешь — так и скажи, тоже едко. Если идея хорошая, не льсти: признай коротко и всё равно найди, где она хрустнет. Всего три-пять предложений.\nПримеры тона (слова не копируй):\n— «Стоит делать раздел „Холсты“?» → «Ещё одна кладовка с красивым названием. Карточки ты и так двигаешь руками, холст добавит лишь способ их не открывать. Начни с кнопки „Сравнить“ на выбранных; раздел заведёшь, когда начнёшь возвращаться к результатам.»\n— «Давай сделаем онбординг на пять экранов?» → «Пять экранов, чтобы человек добрался до первой карточки. Он уже ушёл на третьем. Покажи первую карточку сразу, остальное спросишь по ходу.»') },
]
const styleFile = join(libraryDir, 'style.json')
type StyleState = { active: string; custom: StyleItem[]; overrides: Record<string, string> } // overrides — свои тексты готовых пресетов (править можно, «Сбросить» возвращает наш)
const readStyle = (): StyleState => {
  try {
    const raw = JSON.parse(readFileSync(styleFile, 'utf8'))
    return { active: typeof raw.active === 'string' ? raw.active : 'plain', custom: Array.isArray(raw.custom) ? raw.custom : [], overrides: raw.overrides && typeof raw.overrides === 'object' ? raw.overrides : {} }
  } catch { return { active: 'plain', custom: [], overrides: {} } }
}
const writeStyle = (state: StyleState) => writeFileSync(styleFile, JSON.stringify(state, null, 2) + '\n')
// Готовые пресеты с учётом правок владельца: text — действующий, original — наш исходный (для «Сбросить»)
const presetsWithEdits = (state: StyleState) => stylePresets.map((item) => ({ ...item, original: item.text, text: state.overrides[item.id] ?? item.text }))
const activeStyle = () => { const state = readStyle(); return [...presetsWithEdits(state), ...state.custom].find((item) => item.id === state.active) ?? stylePresets[0] }
// Стиль меняет тон и длину, не метод: формат ответа (ссылки card:, markdown, поля схемы) остаётся нашим
const styleLine = () => { const style = activeStyle(); return style.text ? `Стиль ответа — владелец выбрал его сейчас, он важнее пожеланий памяти, если они спорят. Меняется только тон и длина; формат ответа (ссылки [название](card:id), markdown, поля схемы) не трогай. Стиль «${style.name}»: ${style.text}` : '' }
const styleState = () => { const state = readStyle(); return { active: state.active, custom: state.custom, presets: presetsWithEdits(state) } }

// Имена при добавлении (идея 57, grill-fabric-findings.md): правило «как называть» — строка той же памяти о тебе
const namingLines = () => { const items = agentMemory(); return items.length ? `Пожелания владельца (соблюдай, если какое-то — про названия):\n${items.map((item) => `- ${item.text}`).join('\n')}` : '' }
// Пометка памяти у ответа (grill-skeptic.md): номера из ответа модели → тексты строк памяти
const usedMemory = (numbers?: unknown) => { const items = agentMemory(); const texts = (Array.isArray(numbers) ? numbers : []).map((value) => items[Number(value) - 1]?.text).filter((text): text is string => Boolean(text)); return texts.length ? [...new Set(texts)] : undefined }
// Агент сам предлагает строку, когда его поправили; запоминается только после «Да» — без фона и лишних запросов
const rememberLine = 'remember — если в просьбе владелец поправил тебя, сказал, как ему удобнее получать ответы (длина, тон, формат, что для него важно) или как называть материалы, или рассказал о себе (кто он, над чем работает, что ему сейчас нужно), — это одна строка памяти, обобщённо: пожелание в повелительном наклонении («Отвечай короче, без вступлений») или факт о нём («Делает продуктовый кейс про личную библиотеку с агентом»). Не пересказ материала; не повторяй уже подтверждённое. Иначе — пустая строка.'
// scope: выученное агентом Refkit («Запомнить?» в колонке и карточке) — «app», только свой агент: поправка про разбор
// материалов не должна уезжать в Claude Code другого проекта (скептик 2026-10-14). «Везде» — осознанным переключением
const remember = (text: string, from: string, scope?: string) => {
  const items = readMemory()
  if (!items.some((item) => item.text.toLowerCase() === text.toLowerCase())) writeMemory([...items, { id: `m-${Date.now()}`, text, at: Date.now(), from, ...(scope ? { scope } : {}) }])
}
// Свои действия (№22, grill-fabric-findings.md): одна и та же просьба руками в третий раз — под ответом «Сделать действием?».
// Принятое — library/actions.json: подсказкой в карточке и пунктом в правом клике. Без фона: считаем при ответе
// name — короткое имя для «/» (v2, Actions как у Fabric); без него показываем сам текст просьбы
type ActionItem = { id: string; text: string; at: number; name?: string; how?: string; about?: string } // how — развёрнутая инструкция («умение», grill-agent-skills.md); about — строка описания для меню «+»
const actionsFile = join(libraryDir, 'actions.json')
const readActions = (): ActionItem[] => { try { return JSON.parse(readFileSync(actionsFile, 'utf8')) } catch { return [] } }
const writeActions = (items: ActionItem[]) => writeFileSync(actionsFile, JSON.stringify(items, null, 2) + '\n')
// Инструкция запущенного действия (grill-agent-skills.md): запуск только вручную; в промпт идёт одна строка именно этого действия.
// Ключ — карточка или «agent»; хранится до следующей просьбы (повтор «с поиском» уходит заново и должен нести ту же инструкцию)
const MAX_HOW = 20000
const actionHows = new Map<string, string>()
const setRunAction = (key: string, id: unknown) => {
  const item = typeof id === 'string' ? readActions().find((action) => action.id === id) : undefined
  if (item?.how) actionHows.set(key, item.how.slice(0, MAX_HOW)); else actionHows.delete(key)
}
const actionLine = (key: string) => { const how = actionHows.get(key); return how ? `Владелец запустил действие со своей инструкцией — выполни её для этой просьбы. Она меняет, что и как делать; формат ответа (ссылки [название](card:id), markdown, поля схемы) не меняй, права не расширяй. Инструкция действия:\n${how}` : '' }
const normalize = (text: string) => text.toLowerCase().replace(/ё/g, 'е').replace(/[^\p{L}\d ]+/gu, ' ').replace(/\s+/g, ' ').trim()
function offerAction(command: string) {
  const key = normalize(command)
  if (!key || command.length > 120 || readActions().some((item) => normalize(item.text) === key)) return undefined
  const typed = [...list().flatMap((meta) => threadOf(meta)), ...readAgent().thread].filter((turn) => turn.via !== 'digest' && turn.via !== 'hint' && normalize(turn.command) === key).length
  return typed >= 2 ? command.trim() : undefined // два раза уже было, этот — третий
}
const makeAction = (text: string, name?: string) => { if (!readActions().some((item) => normalize(item.text) === normalize(text))) writeActions([...readActions(), { id: `a-${Date.now()}`, text, at: Date.now(), ...(name ? { name } : {}) }]) }
// Правка текста из ответа: есть новый текст и он отличается — дифф на принятие
function textEdit(meta: Meta, rewrite?: string): TextEdit | undefined {
  const target = editTarget(meta)
  const to = rewrite?.trim()
  const from = target ? editSource(meta, target) : ''
  return target && to && to !== from ? { target, from, to, status: 'pending' } : undefined
}
// Стартовый набор памяти (владелец 2026-10-14, вместо импорта из CLAUDE.md): универсальные правила агента библиотеки.
// Не включаются молча — один раз приходят предложениями «Запомнить?» на страницу «Память»; похожее на уже записанное пропускается
const starterRules = [
  t('Говори, что именно видел: «смотрел обложку и описание» или «читал целиком». Не делай вид, что видел больше.'),
  t('Опираешься на материал из библиотеки — назови его. Нужного материала нет — так и скажи, не выдумывай.'),
  t('Не уверен — скажи, насколько, а не пиши уверенно.'),
  t('Сначала суть одной фразой, потом детали.'),
  t('Ищи приём и то, что можно взять в работу, а не описывай, что на картинке.'),
  t('Связывай с тем, что уже есть в библиотеке: «похоже на … из папки …».'),
]
// Правила продукта — всегда, не выбор владельца (7–8 из стартового набора)
const productRules = 'Правила библиотеки (всегда): ничего в библиотеке не меняй и не удаляй сам — только предлагай; отвечай на языке, на котором спросили.'
const starterSeeded = join(libraryDir, '.starter-memory')
const overlap = (a: string, b: string) => { const x = words(a), y = words(b); return [...x].filter((word) => y.has(word)).length / Math.max(1, Math.min(x.size, y.size)) }
function seedStarter() {
  if (existsSync(starterSeeded)) return
  const file = join(libraryDir, 'memory-offers.json')
  let offers: MemoryItem[] = []
  try { offers = JSON.parse(readFileSync(file, 'utf8')) } catch { /* пусто */ }
  const have = [...readMemory(), ...offers].map((item) => item.text)
  const fresh = starterRules.filter((rule) => !have.some((text) => overlap(rule, text) >= 0.3))
  writeFileSync(file, JSON.stringify([...offers, ...fresh.map((text, index) => ({ id: `s-${Date.now()}-${index}`, text, at: Date.now(), from: t('стартовый набор Refkit') }))], null, 2) + '\n')
  writeFileSync(starterSeeded, new Date().toISOString() + '\n')
}

// Новое пожелание уточняет старое (слова в основном те же) — это правка строки памяти диффом, а не вторая строка
const words = (text: string) => new Set(normalize(text).split(' ').filter((word) => word.length > 2))
function similarMemory(text?: string) {
  const value = text?.trim()
  if (!value) return undefined
  const next = words(value)
  return readMemory().find((item) => { const old = words(item.text); const common = [...next].filter((word) => old.has(word)).length; return item.text !== value && common / Math.max(1, Math.min(next.size, old.size)) >= 0.5 })?.text
}
const proposal = (text?: string) => { const value = text?.trim(); return value && !readMemory().some((item) => item.text.toLowerCase() === value.toLowerCase()) ? value : undefined }

// Вопрос с вариантами (grill-agent-skills.md): когда для продолжения нужен выбор владельца, агент просит его карточкой, а не списком в тексте.
// Пустой title — вопроса нет. Выбор уходит агенту следующим сообщением
type AgentQuestion = { title: string; options: Array<{ label: string; hint?: string }> }
const questionSchema = { type: 'object', additionalProperties: false, required: ['title', 'options'], properties: { title: { type: 'string' }, options: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['label', 'hint'], properties: { label: { type: 'string' }, hint: { type: 'string' } } } } } }
const cleanQuestion = (value: unknown): AgentQuestion | undefined => {
  const raw = value as { title?: unknown; options?: Array<{ label?: unknown; hint?: unknown }> } | undefined
  const title = typeof raw?.title === 'string' ? raw.title.trim().slice(0, 200) : ''
  const options = (Array.isArray(raw?.options) ? raw.options : []).map((item) => ({ label: String(item?.label ?? '').trim().slice(0, 120), hint: String(item?.hint ?? '').trim().slice(0, 200) })).filter((item) => item.label).slice(0, 4)
  return title && options.length >= 2 ? { title, options: options.map((item) => item.hint ? item : { label: item.label }) } : undefined
}
const questionLine = 'question — вопрос владельцу с вариантами, только когда без его выбора не продолжить (скилл или просьба велят вести допрос по одному вопросу; развилка, которую решает он). title — сам вопрос, options — 2–4 варианта: label коротко, hint — одна строка пояснения; рекомендованный — первым, в label с пометкой «(рекомендую)». Когда задаёшь question, в answer напиши только находки или вступление, а сам вопрос и варианты в answer не повторяй. В обычных ответах не спрашивай: title пустой, options пустой.'
const askSchema = {
  type: 'object', additionalProperties: false, required: ['answer', 'suggestions', 'web', 'found', 'remember', 'memory', 'rewrite', 'question'],
  properties: {
    question: questionSchema,
    answer: { type: 'string' }, suggestions: { type: 'array', items: { type: 'string' } }, web: { type: 'string' }, remember: { type: 'string' }, memory: { type: 'array', items: { type: 'string' } }, rewrite: { type: 'string' },
    found: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['url', 'title'], properties: { url: str, title: str } } },
  },
}
// Поиск в сети — только с разрешения владельца, на одну просьбу (прожарка grill-web-search.md).
// ask — в сеть не ходим; нужна — агент не отвечает по памяти, а называет, что искать, и лента спрашивает «Поискать в сети?»;
// yes — владелец разрешил, агент ищет и отдаёт найденное списком; no — отказал, отвечаем по знаниям
type Web = 'ask' | 'yes' | 'no'
const webLines: Record<Web, string> = {
  ask: 'В интернет ты сейчас не ходишь. Если просьбу нельзя выполнить без поиска в интернете (найти, показать фото или примеры, свежие данные) — не отвечай по памяти: answer и suggestions пустые, web — что искать, одной короткой строкой без глагола («фото гитар Курта Кобейна»). Иначе web — пустая строка. found — пустой список.',
  yes: 'Владелец разрешил на эту просьбу поиск в интернете (WebSearch, WebFetch или свой поиск). Найди нужное. found — 4–8 страниц, где это есть, лучше с фото: url — адрес страницы или прямая ссылка на картинку, title — что там, до 8 слов. В answer ссылки не дублируй — найденное покажется под ответом плитками. web — пустая строка.',
  no: 'Владелец не разрешил поиск в интернете: отвечай по своим знаниям и одной фразой скажи, что это без поиска. web — пустая строка, found — пустой список.',
}
// Версия подсказок в ответе — замер идеи 8 заново с даты смены: 2 — свежие после каждого ответа
const hintsVersion = 2
// Правка текста диффом (идея 55): просят переписать, сократить, поправить выжимку или текст заметки — агент возвращает
// новый текст целиком (rewrite), владелец принимает или отклоняет по диффу. Что правится: у заметки — её текст, у остального — выжимка
const editTarget = (meta: Meta): 'note' | 'digest' | undefined => meta.kind === 'note' && !(meta.sources as string[] | undefined)?.length ? 'note' : digestTurn(meta) ? 'digest' : undefined
const rewriteLine = (meta: Meta) => editTarget(meta)
  ? `rewrite — только если владелец просит изменить ${editTarget(meta) === 'note' ? 'текст заметки' : 'выжимку'} (сократить, переписать, поправить, добавить пункт): новый текст целиком, в том же формате; answer тогда — одной строкой, что поменял. Иначе — пустая строка.`
  : 'rewrite — пустая строка.'
const editSource = (meta: Meta, target: 'note' | 'digest') => target === 'note' ? (existsSync(join(libraryDir, meta.id, 'text.txt')) ? readFileSync(join(libraryDir, meta.id, 'text.txt'), 'utf8').trim() : '') : digestTurn(meta)?.answer ?? ''
function applyEdit(id: string, target: 'note' | 'digest', text: string) {
  if (target === 'note') { writeFileSync(join(libraryDir, id, 'text.txt'), text + '\n'); return }
  const meta = readMeta(id)
  const last = digestTurn(meta)
  if (last) writeMeta({ ...meta, thread: threadOf(meta).map((turn) => turn.at === last.at && turn.via === 'digest' ? { ...turn, answer: text } : turn) })
}
function askPrompt(meta: Meta, command: string, text: string, seen = '', extra = '', web: Web = 'ask') {
  const digest = digestTurn(meta)
  // Агент видит весь текущий разговор (не 3 последних) и выжимку; прошлые разговоры — нет
  const thread = turnsOf(meta)
  return [
    `Ниже — материал и просьба к нему. ${ownContext}`,
    'Ничего не запускай и не читай файлы, кроме приложенных картинок, — отвечай по этому материалу и своим знаниям. Ответ — ' + ansLang + ', по делу, без вступлений; в markdown: абзацы — через пустую строку, списки — «- » или «1. », подзаголовок — не крупнее «### », код — блоком ``` с языком (tsx, css, html…); без таблиц и без ** внутри текста. Чего нет в материале — не выдумывай, так и скажи. Не заканчивай встречным вопросом или предложением продолжить — это не чат, следующий шаг владелец выберет сам.',
    'Верни поля: answer — сам ответ (markdown по правилам выше);',
    suggestionsLine + ' Это следующие шаги после твоего ответа, не повторяй уже сделанное.',
    webLines[web],
    rewriteLine(meta),
    rememberLine,
    questionLine,
    memoryLines(),
    styleLine(),
    actionLine(meta.id),
    '',
    '---',
    `Элемент: «${meta.title}»${meta.kind ? ` (${kindName(meta)})` : ' (UI-референс, картинка приложена)'}${meta.source ? ` · ${meta.source}` : ''}`,
    seen,
    meta.description ? `Описание: ${meta.description}` : '',
    digest ? t('Выжимка:\n{answer}', { answer: String(digest.answer ?? '') }) : '',
    text ? `Полный текст:\n${text.slice(0, 40000)}` : '',
    extra,
    thread.length ? `Этот разговор, по порядку:\n${thread.map((turn) => `> ${turn.command}\n${turn.answer}`).join('\n\n')}` : '',
    '---',
    '',
    `Просьба: ${command}`,
  ].filter(Boolean).join('\n')
}

// Подкинутое через «+» (как «Add files or photos» в Claude): другие карточки библиотеки и файлы только для этого вопроса.
// Карточка — название, описание, выжимка, у рефа — картинка; файл-картинка — картинкой, текстовый — текстом (до 20 тыс. символов)
type Attachment = { name: string; data: string }
function attachments(cards: string[], files: Attachment[], dir: string) {
  const images: string[] = []
  const parts: string[] = []
  for (const card of cards.filter((cardId) => existsSync(metaPath(cardId))).map(readMeta)) {
    const digest = digestTurn(card)
    const image = card.kind ? '' : onDisk(card.image)
    if (image && existsSync(image)) images.push(image)
    parts.push([t('Карточка «{title}» — {card}', { title: String(card.title ?? ''), card: kindName(card) }) + (image ? t(', картинка приложена') : ''), card.description ? t('Описание: {description}', { description: String(card.description) }) : '', digest ? t('Выжимка:\n{answer}', { answer: String(digest.answer ?? '') }) : ''].filter(Boolean).join('\n'))
  }
  files.forEach((file, index) => {
    const match = file.data.match(/^data:([\w/+.-]+);base64,(.+)$/)
    if (!match) return
    const buffer = Buffer.from(match[2], 'base64')
    if (match[1].startsWith('image/')) {
      const path = join(dir, `attached-${index + 1}${extname(file.name) || '.png'}`)
      writeFileSync(path, buffer)
      images.push(path)
      parts.push(`Файл «${file.name}» — картинка приложена`)
    } else parts.push(`Файл «${file.name}»:\n${buffer.toString('utf8').slice(0, 20000)}`)
  })
  return { images, text: parts.length ? `Владелец подкинул к просьбе:\n\n${parts.join('\n\n')}` : '', names: [...cards.filter((cardId) => existsSync(metaPath(cardId))).map((cardId) => String(readMeta(cardId).title)), ...files.map((file) => file.name)] }
}

// Найденное агентом — превью, как у закладки: прямая картинка берётся как есть, у страницы — обложка og:image
// (часть сайтов отдаёт её только ботам-превьюшникам). Копия — в папку карточки: чужие ссылки на картинки отваливаются.
// Каждая страница — не дольше 15 с, все параллельно; без картинки в сетку не попадает, ответ текстом остаётся
async function foundPreviews(id: string, list: Array<{ url: string; title: string }>, at: number) {
  const one = async ({ url, title }: { url: string; title: string }, index: number): Promise<Found | undefined> => {
    const link = new URL(url).href
    const response = await fetch(link, { headers: { 'User-Agent': userAgent }, signal: AbortSignal.timeout(15_000) })
    let cover = ''
    if (response.ok && response.headers.get('content-type')?.startsWith('image/')) cover = link
    else {
      if (response.ok) cover = previewOf(new JSDOM(await response.text(), { url: link }), link)
      if (!cover) {
        const bot = await fetch(link, { headers: { 'User-Agent': 'facebookexternalhit/1.1' }, signal: AbortSignal.timeout(15_000) })
        if (bot.ok) cover = previewOf(new JSDOM(await bot.text(), { url: link }), link)
      }
    }
    if (!cover) return undefined
    const { image, ratio } = await download(id, cover, `found-${at}-${index + 1}`)
    return { url: link, title, image, ratio }
  }
  const results = await Promise.allSettled(list.slice(0, 8).map(one))
  return results.flatMap((result) => result.status === 'fulfilled' && result.value ? [result.value] : [])
}

async function ask(id: string, command: string, cards: string[] = [], files: Attachment[] = [], web: Web = 'ask') {
  const { signal, onProgress } = startRun(id)
  try {
    const meta = readMeta(id)
    const textFile = join(libraryDir, id, 'text.txt')
    // У заметки-набора (полка, разбор) агент видит материалы: описания, выжимки, картинки рефов
    const materials = focusedOf(meta)
    const seen = materials.length ? { images: sourceImages(materials), note: '' } : meta.kind ? { images: [], note: '' } : visuals(meta)
    const usage: Usage[] = []
    const cwd = isolated('ask')
    const extra = attachments(cards, files, cwd)
    const steps: Steps = { thought: 0, looked: 0 }
    const result = JSON.parse(await runModel({ kind: 'ask', schema: askSchema, prompt: askPrompt(meta, command, materials.length ? `Материалы набора (${materials.length}):\n${materials.map(materialBlock).join('\n\n')}` : existsSync(textFile) ? readFileSync(textFile, 'utf8') : '', seen.note, extra.text, web), images: [...seen.images, ...extra.images], cwd, web: web === 'yes', track: usage, signal, onProgress, steps }, 'ask')) as { answer: string; suggestions: string[]; web: string; found: Array<{ url: string; title: string }>; remember?: string; memory?: string[]; question?: unknown; rewrite?: string }
    const at = Date.now()
    const fresh = readMeta(id)
    const base = { command, at, usage, attached: extra.names.length ? extra.names : undefined, conversation: conversationOf(fresh) }
    // Нужна сеть, а разрешения нет — в ленту вопрос вместо ответа; подсказки прежние. Карточки запоминаем для повтора
    // (файлы — нет: их данные в запросе не храним, владелец подкинет заново)
    // Права «Сеть: можно» (идея 53): агент сам решил, что сеть нужна, — та же просьба сразу с поиском, без вопроса владельцу.
    // Повтор — после выхода из этого запуска (finally закроет его), карточка остаётся «в работе»
    if (web === 'ask' && result.web?.trim() && readPermissions().web === 'allow') { setTimeout(() => void ask(id, command, cards, files, 'yes'), 0); return }
    if (web === 'ask' && result.web?.trim()) {
      writeMeta({ ...fresh, thread: [...threadOf(fresh), { ...base, answer: '', webAsk: result.web.trim(), cards: cards.length ? cards : undefined }], asking: false, askError: undefined })
      return
    }
    const found = web === 'yes' && result.found?.length ? await foundPreviews(id, result.found, at) : []
    const after = readMeta(id)
    writeMeta({ ...after, thread: [...threadOf(after), { ...base, answer: result.answer.trim(), question: cleanQuestion(result.question), remember: proposal(result.remember), memoryUpdate: similarMemory(result.remember), usedMemory: usedMemory(result.memory), edit: textEdit(after, result.rewrite), makeAction: ((after.suggestions as string[] | undefined) ?? []).some((item) => item.trim() === command) ? undefined : offerAction(command), found: found.length ? found : undefined, steps: steps.thought >= 1 || steps.looked ? { thought: Math.round(steps.thought), looked: steps.looked } : undefined, via: ((after.suggestions as string[] | undefined) ?? []).some((item) => item.trim() === command) ? 'hint' : 'typed', hints: hintsVersion }], suggestions: result.suggestions.slice(0, 3), asking: false, askError: undefined })
  } catch (error) {
    if (existsSync(metaPath(id))) writeMeta({ ...readMeta(id), asking: false, askError: signal.aborted ? undefined : (error as Error).message })
  } finally { endRun(id) }
}

// Найденное → в библиотеку: новый реф с копией картинки и страницей-источником, дальше — обычный путь (описание, подборки)
function addFound(from: string, found: Found) {
  const file = onDisk(found.image)
  if (!file || !existsSync(file)) throw new Error(t('Картинки уже нет'))
  const meta = newRef({ title: found.title, source: found.url, ratio: found.ratio, describing: true })
  const name = `source${extname(file)}`
  copyFileSync(file, join(libraryDir, meta.id, name))
  writeMeta({ ...readMeta(meta.id), image: `/library/${meta.id}/${name}`, foundIn: from, foundTitle: found.title })
  void describe(meta.id)
  return readMeta(meta.id)
}

function materialPrompt(meta: Meta) {
  const text = join(libraryDir, meta.id, 'text.txt')
  const digest = digestTurn(meta)
  const facts = [
    `Материал из Refkit: «${meta.title}»${meta.author ? ` — ${meta.author}` : ''}`,
    meta.source ? `Источник: ${meta.source}` : '',
    existsSync(text) ? `Полный текст${meta.kind === 'youtube' ? ' (субтитры)' : ''}: ${text}` : '',
    digest ? t('Выжимка:\n{answer}', { answer: String(digest.answer ?? '') }) : '',
    ownerNote(meta) ? `Зачем сохранил: ${ownerNote(meta)}` : '',
  ].filter(Boolean).join('\n')
  return `${facts}\n\nЗадача: посмотри, что из этого применимо в текущем проекте, и предложи конкретные шаги. Если нужно — сверяйся с полным текстом.`
}

function readBody(req: NodeJS.ReadableStream): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    let raw = ''
    req.setEncoding('utf8') // текст, а не байты — иначе длинная кириллица рвётся на границе куска
    req.on('data', (chunk) => { raw += chunk })
    req.on('end', () => { try { resolve(raw ? JSON.parse(raw) : {}) } catch (error) { reject(error) } })
  })
}

// ── Приём: ссылка, заметка, очередь ────────────────────────────────────────
// Все входы идут одним путём: ⌘V (addLink), очередь от сборщиков (Telegram, закладки, scripts/enqueue.mjs).

const blankMeta = { format: 'image', image: '', tags: [], collections: [], meaning: '', technique: '', stage: 'new' }
// id по времени; два элемента из очереди в одну миллисекунду не должны получить одну папку
function newRef(fields: Record<string, unknown>): Meta {
  let id = `ref-${Date.now()}`
  for (let n = 2; existsSync(join(libraryDir, id)); n++) id = `ref-${Date.now()}-${n}`
  mkdirSync(join(libraryDir, id), { recursive: true })
  const meta: Meta = { ...blankMeta, ...withInbox(fields), id, createdAt: Date.now() }
  writeMeta(meta)
  return meta
}

// Окно добавления: заметка «зачем», подборки и теги владельца — теги агент потом не трогает (pickTags)
// Текст из окна добавления — описание владельца (2026-10-03, «Расскажи о нём…»): агент его не переписывает, только называет и ставит теги
const pickAddFields = (body: Record<string, unknown>) => ({
  ...(typeof body.description === 'string' && body.description.trim() ? { description: body.description.trim(), descriptionByOwner: true } : {}),
  ...(Array.isArray(body.boards) && body.boards.length ? { boards: body.boards.map(String) } : {}),
  ...(Array.isArray(body.collections) && body.collections.length ? { collections: body.collections.map(String) } : {}),
  ...(typeof body.folder === 'string' && body.folder ? { folder: body.folder } : {}),
  // Collect: метка пачки — лента «Входящих» показывает такие материалы одним блоком с заголовком
  ...(typeof body.batch === 'string' && body.batch ? { batch: body.batch, batchSource: String(body.batchSource ?? '') } : {}),
})
// Картинка (⌘V, перетаскивание, файл от агента через MCP) → материал: файл в папку, цвета, описание. Один путь для всех входов.
// Описание идёт по одному (describeChain): пачка из 30 файлов иначе запустила бы 30 моделей разом
let describeChain: Promise<unknown> = Promise.resolve()
function addImage(image: string, video: string | undefined, fields: Record<string, unknown>, queued = false): Meta {
  let newId = `ref-${Date.now()}`
  for (let n = 2; existsSync(join(libraryDir, newId)); n++) newId = `ref-${Date.now()}-${n}`
  mkdirSync(join(libraryDir, newId), { recursive: true })
  const meta: Meta = { ...withInbox(fields), ...pickAddFields(fields), id: newId, createdAt: Date.now(), image: saveFile(newId, 'source', image) }
  if (video) meta.video = saveFile(newId, 'source-video', video)
  meta.describing = String(meta.image).startsWith('/library/')
  writeMeta(meta)
  paintColors(newId)
  if (meta.describing) { if (queued) describeChain = describeChain.then(() => describe(newId)).catch(() => undefined); else void describe(newId) }
  return meta
}
function addLink(link: string, extra: Record<string, unknown> = {}) {
  const meta = newRef({ ...extra, title: new URL(link).hostname.replace(/^www\./, ''), source: link, ratio: '16 / 9', fetching: true })
  void ingest(meta.id, link)
  return meta
}

// Расширение Chrome (grill-extension.md): страницу читает браузер владельца, где проверка уже пройдена, —
// сервер её заново не качает. Ключ лежит в library/.clip-key (в git не идёт): без него любой открытый сайт
// мог бы писать в библиотеку через localhost
function clipKey() {
  const file = join(libraryDir, '.clip-key')
  if (!existsSync(file)) writeFileSync(file, randomBytes(24).toString('hex') + '\n')
  return readFileSync(file, 'utf8').trim()
}
async function addClip(body: Record<string, unknown>) {
  const link = String(body.url ?? '')
  const text = String(body.text ?? '').replace(/\s+/g, ' ').trim()
  const host = new URL(link).hostname.replace(/^www\./, '')
  const title = String(body.title ?? '').trim() || host
  const meta = newRef({ via: 'extension', ...pickAddFields(body), kind: text ? 'article' : 'link', title, source: link, ratio: '4 / 3', fetching: false, author: String(body.author ?? '').trim() })
  writeFileSync(join(libraryDir, meta.id, 'text.txt'), (text || [title, link].join('\n')) + '\n')
  // Обложку с первого раза берёт не всегда (GitHub рисует картинку по запросу, при пачке из collect часть отваливается по таймауту) —
  // три попытки; не вышло — материал остаётся без картинки, причина в логе сервера
  let cover: Awaited<ReturnType<typeof download>> | undefined
  if (/^https?:\/\//.test(String(body.cover ?? ''))) {
    for (let attempt = 1; attempt <= 3 && !cover; attempt++) {
      try { cover = await download(meta.id, String(body.cover)) }
      catch (error) { if (attempt === 3) console.warn(`[clip] обложка не скачалась: ${link} — ${(error as Error).message}`); else await new Promise((resolve) => setTimeout(resolve, 1500 * attempt)) }
    }
  }
  writeMeta({ ...readMeta(meta.id), ...cover, describing: true })
  void sortMaterial(meta.id)
  return readMeta(meta.id)
}

// Заметка — пост без ссылки: текст и есть материал. Картинки нет, плитка показывает сам текст.
function addNote(text: string, extra: Record<string, unknown> = {}) {
  const meta = newRef({ ...extra, kind: 'note', title: text.split(/\s+/).slice(0, 6).join(' '), source: '', ratio: '4 / 3' })
  writeFileSync(join(libraryDir, meta.id, 'text.txt'), text + '\n')
  writeMeta({ ...readMeta(meta.id), describing: true }); void sortMaterial(meta.id)
  return meta
}

// Холст (grill-canvas.md): материал-доска. Карточки на нём — ссылки на материалы по id, сами материалы не копируются;
// доска лежит в canvas.json папки материала, а в meta — только короткая сводка для плитки в ленте (без модели и без описания)
// rev — номер версии доски: растёт при каждом сохранении клиентом; сохранение с чужим номером отклоняется (устаревшая копия страницы не затрёт новое)
const canvasFile = (id: string) => join(libraryDir, id, 'canvas.json')
const readCanvas = (id: string): CanvasData => {
  try { const data = JSON.parse(readFileSync(canvasFile(id), 'utf8')); const parsed: CanvasData = { nodes: Array.isArray(data.nodes) ? data.nodes : [], edges: Array.isArray(data.edges) ? data.edges : [], rev: Number(data.rev ?? 0), proposals: Array.isArray(data.proposals) ? data.proposals : [], trash: data.trash && typeof data.trash === 'object' ? data.trash : {} }
    // старые доски: отдельные ноды «Результат» переводятся в связи «действие → дальше» (результат теперь внутри действия)
    return migrateLists(migrateResults(parsed)) }
  catch { return { nodes: [], edges: [], rev: 0, proposals: [] } }
}
// История экрана — собранная страница целиком (~1 МБ со вшитым кодом и шрифтами): 8 версий на 9 экранах раздули холст лендинга до 80 МБ,
// а файл перечитывается на каждую правку ноды — сервер падал без памяти (2026-10-30). У экранов и картинок держим 2 версии, у агентов текст — 8
const HEAVY_HISTORY = 2
function writeCanvas(id: string, data: CanvasData) {
  for (const node of data.nodes) {
    const history = node.data?.history
    if ((node.type === 'screen' || node.type === 'image') && Array.isArray(history) && history.length > HEAVY_HISTORY) node.data!.history = history.slice(-HEAVY_HISTORY)
  }
  writeFileSync(canvasFile(id), JSON.stringify(data, null, 2) + '\n')
  // Сводка: коробки (позиция, размер, вид) — плитка рисует по ним мини-доску; потолок 60, чтобы meta не пухла
  const boxes = data.nodes.slice(0, 60).map((node) => {
    const at = node.position as { x?: number; y?: number } | undefined
    return { x: Math.round(at?.x ?? 0), y: Math.round(at?.y ?? 0), w: Math.round(Number(node.width ?? 200)), h: Math.round(Number(node.height ?? 150)), k: String(node.type ?? 'card') }
  })
  writeMeta({ ...readMeta(id), canvasBoxes: boxes, canvasEdges: data.edges.length, updatedAt: Date.now() })
  scheduleThumb(id)
}
// Превью холста — готовая картинка library/<id>/thumb.jpg, а не живой мини-холст на каждую плитку. Снимает настоящий Chrome страницу
// «?thumb=<id>» нашего же приложения (там тот же CanvasThumb), поэтому экраны в iframe выходят как на доске. Снимок — через 8 с после
// последней правки, по одному за раз; thumbAt в meta сравнивается с updatedAt: свежая картинка — плитка рисует её, старая — живой запасной вид
let appOrigin = ''
const thumbTimers = new Map<string, ReturnType<typeof setTimeout>>()
const thumbQueue: string[] = []
let thumbBusy = false
function scheduleThumb(id: string) {
  if (!appOrigin) return
  clearTimeout(thumbTimers.get(id))
  thumbTimers.set(id, setTimeout(() => { thumbTimers.delete(id); if (!thumbQueue.includes(id)) thumbQueue.push(id); void drainThumbs() }, 8000))
}
async function drainThumbs() {
  if (thumbBusy) return
  thumbBusy = true
  try {
    for (let id = thumbQueue.shift(); id; id = thumbQueue.shift()) {
      if (!existsSync(canvasFile(id))) continue
      const png = join(libraryDir, id, 'thumb.png')
      const jpg = join(libraryDir, id, 'thumb.jpg')
      try {
        await screenshotUrl(`${appOrigin}/?thumb=${encodeURIComponent(id)}`, png, 960, 720, 9000)
        await new Promise<void>((done, fail) => execFile('ffmpeg', ['-y', '-v', 'error', '-i', png, '-q:v', '4', jpg], (error) => (error ? fail(error) : done())))
        rmSync(png, { force: true })
        writeMeta({ ...readMeta(id), thumbAt: Date.now() })
      } catch (error) { console.warn('[превью холста]', id, String(error).slice(0, 200)); rmSync(png, { force: true }) }
    }
  } finally { thumbBusy = false }
}
function addCanvas(extra: Record<string, unknown> = {}) {
  const meta = newRef({ ...extra, kind: 'canvas', title: typeof extra.title === 'string' && extra.title.trim() ? extra.title.trim() : t('Новый холст'), titleEdited: true, source: '', ratio: '4 / 3' })
  writeCanvas(meta.id, { nodes: [], edges: [] })
  return readMeta(meta.id)
}


// ── Цепочка агентов на холсте (grill-canvas-chain.md) ───────────────────────
// Агентная нода («agent» — текст) и «screen» (HTML-экран): вход берут по связям слева — карточки-материалы, подписи и результаты
// других нод. Запускает только владелец, кнопкой. Результат лежит в самой ноде (canvas.json); «устарел» считается по хешу входа
// и инструкции, сам ничего не пересчитывается. Поля data делятся на клиентские (инструкция, название) и серверные (статус, результат):
// при сохранении доски серверные берутся с диска, чтобы устаревшая копия клиента не затёрла результат запуска
const canvasRuns = new Map<string, AbortController>()
const readMetaSafe = (id: string) => (id && existsSync(metaPath(id)) ? readMeta(id) : undefined)
// Нода «Подборка»: папка или подборка целиком как один вход; состав читается при каждом запуске, так что добавил материал в подборку — действия ниже станут «устарело».
// Потолок 12 материалов: больше не лезет в один запрос
const GROUP_LIMIT = 12
// Ассеты страницы: не больше 12 картинок, каждая ужимается до 1200 px и уходит в экран data-URL'ом
const ASSET_LIMIT = 12
// Сколько картинок видит модель ноды холста: референсы до 12, ассеты страницы до 8 (в экран вшиваются все, до ASSET_LIMIT)
const CANVAS_IMAGE_LIMIT = 12
const CANVAS_ASSET_VIEW_LIMIT = 8
const assetName = (at: number) => `img${at + 1}`
function assetsForScreen(metas: Meta[]) {
  return metas.map((meta, at) => {
    const source = join(libraryDir, String(meta.image).replace(/^\/library\//, ''))
    const out = join(isolated('asset'), 'a.jpg')
    execFileSync('ffmpeg', ['-y', '-v', 'error', '-i', source, '-vf', "scale='min(1200,iw)':-2", '-frames:v', '1', '-q:v', '4', out])
    return { name: assetName(at), dataUrl: `data:image/jpeg;base64,${readFileSync(out).toString('base64')}` }
  })
}
// Тип материала для фильтра ноды: картинки / видео / статьи / заметки (остальное — только во «Всё»)
const materialCategory = (meta: Meta) => meta.kind === 'note' ? 'note' : meta.kind === 'article' || meta.kind === 'link' ? 'article' : meta.kind === 'youtube' || (!meta.kind && meta.format === 'video') ? 'video' : !meta.kind && meta.format === 'image' ? 'image' : 'other'
function groupMembers(node: CNode, filtered = true): Meta[] {
  const kind = node.data?.groupKind, key = String(node.data?.key ?? '')
  const only = filtered ? String(node.data?.filter ?? 'all') : 'all'
  return list().filter((meta) => meta.kind !== 'canvas' && (kind === 'folder' ? meta.folder === key : (meta.boards as string[] | undefined)?.includes(key)) && (only === 'all' || materialCategory(meta) === only))
}
// Модель ноды: своя из data.model (если такая есть и включена), иначе общая из настроек «Просьбы агенту»
const nodeModelKey = (node: CNode) => { const own = String(node.data?.model ?? ''); return own && modelOptions.some((item) => item.key === own && !item.off) ? own : readSettings().models.ask }
// Имя продукта для образцов направлений: поле «Name:» в документе Brief на входе ноды-источника (или отдельная подпись «Name» в старых досках); иначе не показываем
function productNameOf(data: CanvasData, sourceId: string): string | undefined {
  const inputs = canvasInputs(data, sourceId)
  // Документ Brief: текстовая заметка или результат агентной ноды «Brief» (в конвейере гипотез его пишет агент по идее и рынку)
  const brief = inputs.find((input) => /^brief$/i.test(String(input.data?.title ?? '').trim()))
  const briefText = brief ? String(brief.type === 'text' ? brief.data?.text ?? '' : brief.data?.result ?? '') : ''
  const fromBrief = briefText.match(/^\s*name:\s*(.+)$/im)?.[1].trim()
  if (fromBrief) return fromBrief.replace(/^\*+|\*+$/g, '').slice(0, 40)
  const named = inputs.find((input) => input.type === 'text' && /^(name|constraints)$/i.test(String(input.data?.title ?? '').trim()))
  const fromNamed = named ? String(named.data?.text ?? '').match(/^\s*name:\s*(.+)$/im)?.[1].trim() : undefined
  if (fromNamed) return fromNamed.slice(0, 40)
  return named ? String(named.data?.text ?? '').trim().split('\n')[0].slice(0, 40) || undefined : undefined
}
function canvasPackage(data: CanvasData, node: CNode) {
  const blocks: string[] = []
  const cards: Meta[] = []
  // Что лежит в контексте ноды — для показа в ней миниатюрами: материалы с картинкой, подписи, результаты других нод
  const context: Array<{ kind: 'card' | 'text' | 'result' | 'group'; id?: string; image?: string; images?: string[]; label: string }> = []
  const assets: Meta[] = []
  // Экраны на входе: к их коду на запуске докладывается снимок, чтобы агент видел, что нарисовано, а не только читал разметку
  const screens: CNode[] = []
  // Картинки из нод «Картинка» на входе: приложены к запросу как есть
  const generated: string[] = []
  let needsChoice = ''
  for (const input of canvasInputs(data, String(node.id))) {
    if (input.type === 'card') {
      const ref = String(input.data?.ref ?? '')
      if (ref && existsSync(metaPath(ref))) { const meta = readMeta(ref); cards.push(meta); blocks.push(materialBlockOf(meta, cards.length - 1, true)); context.push({ kind: 'card', id: meta.id, image: String(meta.image ?? '') || undefined, label: String(meta.title ?? '') }) }
    } else if (input.type === 'text') {
      const text = String(input.data?.text ?? '').trim()
      if (text) { blocks.push(`Подпись владельца на холсте${input.data?.title ? ` («${input.data.title}»)` : ''}: ${text}`); context.push({ kind: 'text', label: text.slice(0, 60) }) }
    } else if (input.type === 'group' && input.data?.asAssets && node.type === 'screen') {
      // Папка помечена «картинки для страницы»: не референс, а набор ассетов — экран получает их готовыми src.
      // Агенту та же папка — обычная подборка с картинками: снимки продукта видят и паспорт, и текст страницы (2026-10-30)
      const members = groupMembers(input).filter((meta) => String(meta.image ?? '').startsWith('/library/')).slice(0, ASSET_LIMIT)
      const names = members.map((_, at) => assetName(at))
      members.forEach((meta) => assets.push(meta))
      if (members.length) {
        blocks.push(`Ассеты страницы из «${input.data?.name ?? 'набора'}» — картинки приложены и доступны в коде как assets.<имя> (import assets from '@/assets'):\n${members.map((meta, at) => `- assets.${names[at]}: ${String(meta.title ?? 'без названия')}${meta.ratio ? `, пропорции ${meta.ratio}` : ''}`).join('\n')}`)
        for (const meta of members) context.push({ kind: 'card', id: meta.id, image: String(meta.image ?? '') || undefined, label: `${meta.title ?? 'Ассет'} · ассет` })
      }
    } else if (input.type === 'group') {
      const members = groupMembers(input)
      // В строке входов каждый материал подборки — своя плитка (владелец хочет видеть материалы отдельными карточками)
      for (const meta of members.slice(0, GROUP_LIMIT)) { cards.push(meta); blocks.push(materialBlockOf(meta, cards.length - 1, true)); context.push({ kind: 'card', id: meta.id, image: String(meta.image ?? '') || undefined, label: String(meta.title ?? '') }) }
      if (members.length > GROUP_LIMIT) blocks.push(`В «${input.data?.name ?? 'подборке'}» ещё ${members.length - GROUP_LIMIT} материалов не вошли: в запрос идут первые ${GROUP_LIMIT}.`)
    } else if (input.type === 'result') {
      const from = actionOf(data, input)
      if (from?.data?.result) { blocks.push(`Результат ноды «${from.data?.title ?? 'без названия'}»:\n${resultForAgent(from).slice(0, 12000)}`); context.push({ kind: 'result', label: String(from.data?.title ?? 'результат') }) }
    } else if (input.type === 'choice') {
      // Нода «Выбор»: модели не зовёт; пропускает дальше только отмеченный владельцем вариант из результата ноды слева
      const items = choiceItems(data, input)
      const choice = input.data?.choice
      if (typeof choice === 'number' && items[choice]) { blocks.push(`Выбранный вариант (остальные отброшены):\n${items[choice]}`); context.push({ kind: 'result', label: String(input.data?.title ?? 'выбор') }) }
      else needsChoice = String(input.data?.title ?? 'Выбор')
    } else if (input.data?.pick && splitItems(String(input.data.result ?? '')).length >= 2) {
      const items = splitItems(String(input.data.result))
      // autoPick (режим «одна кнопка»): пока владелец не выбрал сам, идёт первый вариант — агент ставит рекомендуемый первым
      const choice = typeof input.data.choice === 'number' ? input.data.choice : input.data.autoPick ? 0 : undefined
      if (typeof choice === 'number' && items[choice]) blocks.push(`Выбранный вариант из ноды «${input.data?.title ?? 'без названия'}» (остальные отброшены):\n${items[choice]}`)
      else needsChoice = String(input.data?.title ?? 'без названия')
    } else if (input.type === 'image') {
      const file = onDisk(input.data?.imageFile)
      if (file && existsSync(file)) {
        generated.push(file)
        blocks.push(`Картинка из ноды «${input.data?.title ?? 'без названия'}» приложена к запросу (${String(input.data?.imageFile).split('/').pop()})`)
        context.push({ kind: 'result', label: String(input.data?.title ?? 'картинка') })
      }
    } else if (input.data?.result) {
      if (input.type === 'screen') screens.push(input)
      blocks.push(`Результат ноды «${input.data?.title ?? 'без названия'}»${input.type === 'screen' && screens.length <= 2 ? ' (снимок экрана приложен картинкой после остальных; у анимации — раскадровка 4×2 по времени слева направо, сверху вниз)' : ''}:\n${resultForAgent(input).slice(0, 12000)}`)
      context.push({ kind: 'result', label: String(input.data?.title ?? 'результат') })
    }
  }
  const instr = String(node.data?.instr ?? '').trim()
  const modelKey = nodeModelKey(node)
  // Умение из «Действий» (идея 72): его «как делать» подкладывается к инструкции; поправил умение — ноды с ним устаревают
  const skill = node.data?.actionId ? readActions().find((item) => item.id === node.data!.actionId) : undefined
  const how = skill?.how?.trim() ?? ''
  // Порядок входов задаёт расположение на доске, но сдвинуть ноду (или выровнять цепочку) — не повод считать результат устаревшим: в хеше порядок не учитывается
  const hash = createHash('sha1').update(JSON.stringify([node.type, instr, how, modelKey, [...blocks].sort(), ...(node.type === 'screen' ? [SCREEN_VERSION, designSystemOf(node.data?.designSystem)] : [])])).digest('hex').slice(0, 16)
  return { blocks, cards, assets, screens, context, images: [...sourceImages(cards, CANVAS_IMAGE_LIMIT, true), ...sourceImages(assets, CANVAS_ASSET_VIEW_LIMIT), ...generated.slice(0, 4)], instr, how, skill: skill?.name, hash, needsChoice }
}
// Прикидка цены до запуска: вход — постоянная часть запроса плюс материалы; экран ещё и пишет страницу
function canvasEstimate(node: CNode, pack: ReturnType<typeof canvasPackage>) {
  const input = 22000 + Math.round(pack.blocks.join('\n').length / 3.2) + pack.images.length * 1500
  const output = node.type === 'screen' ? 25000 : 2500
  return { tokensK: Math.round((input + output) / 1000), minutes: node.type === 'screen' ? 2 : Math.max(1, Math.round(input / 60000)) }
}
// Доска для клиента: то, что хранится, плюс вычисляемое — «устарел», цена, модель
function canvasView(id: string): CanvasData {
  recoverCanvasRuns(id)
  const data = readCanvas(id)
  for (const node of data.nodes as CNode[]) {
    if (node.type === 'group' && node.data?.groupKind === 'list') {
      // Состав списка — живые ноды доски: карточка показывается материалом, остальные — своим результатом (картинка, начало текста)
      const tiles = ((node.data.contains ?? []) as string[]).flatMap((memberId) => {
        const member = (data.nodes as CNode[]).find((item) => String(item.id) === memberId)
        if (!member) return []
        if (member.type === 'card') { const meta = existsSync(metaPath(String(member.data?.ref ?? ''))) ? readMeta(String(member.data?.ref)) : undefined; return meta ? [{ id: meta.id, title: meta.title, image: meta.image, kind: meta.kind, cat: materialCategory(meta), node: member.type }] : [] }
        const image = typeof member.data?.imageFile === 'string' ? member.data.imageFile : undefined
        const text = typeof member.data?.result === 'string' && !image && member.type !== 'screen' ? member.data.result.slice(0, 160) : member.type === 'text' ? String(member.data?.text ?? '').slice(0, 160) : undefined
        return [{ id: String(member.id), title: String(member.data?.title ?? ({ agent: 'Агент', screen: 'Экран', image: 'Картинка', text: 'Подпись', choice: 'Выбор' } as Record<string, string>)[String(member.type)] ?? 'Нода'), image, text, kind: undefined, cat: 'all', node: String(member.type) }]
      })
      node.data = { ...node.data, count: tiles.length, members: tiles }
      continue
    }
    if (node.type === 'group') { const members = groupMembers(node, false); node.data = { ...node.data, count: groupMembers(node).length, members: members.slice(0, 120).map((meta) => ({ id: meta.id, title: meta.title, image: meta.image, kind: meta.kind, cat: materialCategory(meta) })) }; continue }
    if (node.type === 'choice') {
      // Источник вариантов: по нему плитка просит «перегенерировать этот вариант»; пока он считается, плитка показывает ожидание
      const from = canvasInputs(data, String(node.id)).find((item) => item.type !== 'result' && AGENT_TYPES.includes(String(item.type)))
      node.data = { ...node.data, items: choiceItems(data, node).map((item) => item.slice(0, 2400)), sourceId: from ? String(from.id) : undefined, sourceRunning: from?.data?.status === 'running' || undefined, productName: from ? productNameOf(data, String(from.id)) : undefined }
      continue
    }
    if (!AGENT_TYPES.includes(String(node.type))) continue
    const pack = canvasPackage(data, node)
    const estimate = canvasEstimate(node, pack)
    const shownResult = activeData(node).result
    const items = node.data?.pick && shownResult ? splitItems(String(shownResult)).map((item) => item.slice(0, 2400)) : undefined
    node.data = { ...node.data, items, ...(node.data?.pick ? { productName: productNameOf(data, String(node.id)) } : {}), context: pack.context, needsChoice: pack.needsChoice || undefined, stale: node.data?.status === 'ready' && node.data?.ranHash !== pack.hash, estimateK: estimate.tokensK, estimateMin: estimate.minutes, modelLabel: modelFor(nodeModelKey(node)).label, inputNames: canvasInputs(data, String(node.id)).map((input) => input.type === 'card' ? String(readMetaSafe(String(input.data?.ref ?? ''))?.title ?? 'материал') : input.type === 'text' ? 'подпись' : input.type === 'group' ? String(input.data?.name ?? 'подборка') : String(input.data?.title ?? 'нода')), inputRefs: canvasInputs(data, String(node.id)).map((input) => (input.type === 'card' ? String(input.data?.ref ?? '') : '')) }
  }
  // «Устарело» передаётся вниз по цепочке: вход устарел — результат ноды тоже держится на старом
  for (let pass = 0; pass < 6; pass++) {
    let changed = false
    for (const node of data.nodes as CNode[]) {
      if (!AGENT_TYPES.includes(String(node.type)) || node.data?.status !== 'ready' || node.data?.stale) continue
      if (canvasInputs(data, String(node.id)).some((input) => { const source = input.type === 'result' ? actionOf(data, input) : input; return source && AGENT_TYPES.includes(String(source.type)) && source.data?.stale })) { node.data = { ...node.data, stale: true }; changed = true }
    }
    if (!changed) break
  }
  for (const node of data.nodes as CNode[]) {
    if (node.type !== 'result') continue
    const from = actionOf(data, node)
    const d = from?.data ?? {}
    node.data = { ...node.data, from: from?.id, kind: from?.type, title: d.title, status: d.status, result: d.result, error: d.error, ranAt: d.ranAt, usage: d.usage, runStartedAt: d.runStartedAt, stale: d.stale, modelLabel: d.modelLabel, history: d.history }
  }
  // Корзина серверных полей — внутреннее дело сервера, клиенту её (и мегабайты экранов в ней) не отдаём
  delete data.trash
  return data
}
// Сохранение доски клиентом: серверные поля нод берём с диска
function mergeCanvas(id: string, incoming: CanvasData): CanvasData {
  const disk = readCanvas(id)
  const merged = mergeWithTrash(disk.nodes as CNode[], incoming.nodes as CNode[], disk.trash)
  return { nodes: merged.nodes, edges: incoming.edges, trash: merged.trash }
}
function patchCanvasNode(id: string, nodeId: string, patch: Record<string, unknown>) {
  const data = readCanvas(id)
  const node = canvasNode(data, nodeId)
  if (!node) return
  node.data = { ...node.data, ...patch }
  for (const key of Object.keys(patch)) if (patch[key] === undefined) delete node.data![key]
  writeCanvas(id, data)
}
// Память холста (2026-10-29): library/<id>/memory.json — ссылки-образцы (закреплённые ноды), правила холста и журнал решений.
// Видна агенту только на этом холсте: правила и образцы уходят в запрос нод; общая память о владельце — отдельно (memoryBlock)
interface CanvasMemory { refs: Array<{ node: string; title: string; at: number }>; rules: Array<{ id: string; text: string; at: number }>; decisions: Array<{ id: string; text: string; at: number }> }
const canvasMemoryFile = (id: string) => join(libraryDir, id, 'memory.json')
const readCanvasMemory = (id: string): CanvasMemory => {
  try { const data = JSON.parse(readFileSync(canvasMemoryFile(id), 'utf8')); return { refs: Array.isArray(data.refs) ? data.refs : [], rules: Array.isArray(data.rules) ? data.rules : [], decisions: Array.isArray(data.decisions) ? data.decisions : [] } }
  catch { return { refs: [], rules: [], decisions: [] } }
}
const writeCanvasMemory = (id: string, memory: CanvasMemory) => writeFileSync(canvasMemoryFile(id), JSON.stringify({ ...memory, decisions: memory.decisions.slice(-100) }, null, 2) + '\n')
function logDecision(id: string, text: string) {
  const memory = readCanvasMemory(id)
  writeCanvasMemory(id, { ...memory, decisions: [...memory.decisions, { id: `d-${Date.now()}`, text: text.slice(0, 200), at: Date.now() }] })
}
function canvasMemoryBlock(canvasId?: string) {
  if (!canvasId) return ''
  const memory = readCanvasMemory(canvasId)
  const rules = memory.rules.map((rule) => `- ${rule.text}`).join('\n')
  const refs = memory.refs.map((ref) => `- «${ref.title}»`).join('\n')
  return [rules && `Правила этого холста (владелец их задал, соблюдай):\n${rules}`, refs && `Образцы на этом холсте — ориентируйся на их стиль, цвета и раскладку:\n${refs}`].filter(Boolean).join('\n')
}
// Запрос, который уходит модели: инструкция, умение, память и входы. Его же показывает «Показать запрос» — владелец видит, что именно ушло
function canvasPrompt(node: CNode, pack: ReturnType<typeof canvasPackage>, canvasId?: string) {
  const screen = node.type === 'screen'
  return [
    `Ты — нода цепочки на холсте владельца. ${canvasContext}`,
    'Если задача требует кода экрана или компонента, используй выбранный каталог компонентов и токены проекта. Для текстовой ноды по умолчанию — shadcn. Новый компонент создавай, только когда готовых недостаточно.',
    `Инструкция владельца для этой ноды: ${pack.instr || 'сделай по входам ниже'}`,
    pack.how ? `Умение «${pack.skill ?? 'без названия'}» — как делать:\n${pack.how}` : '',
    screen
      ? screenContract(designSystemOf(node.data?.designSystem), `${pack.instr}\n${pack.blocks.join('\n')}`) + '\nЕсли старый текст инструкции просит HTML/CSS без скриптов, сохрани её задачу и композицию, но формат результата всё равно JSON с React и выбранными компонентами по этому контракту. Выбор набора в настройках ноды главнее упоминания shadcn или Fluid в старой инструкции.'
      : 'Ответ — ' + ansLang + ', markdown, по делу, без вступлений и без пересказа задачи.',
    // Стиль ответов — только для разговора (страница «Память»); результаты нод остаются нейтральными
    memoryBlock(),
    canvasMemoryBlock(canvasId),
    'Не печатай номера пунктов памяти и служебные строки «memory: …».',
    screen ? 'Не используй значок-искру (✦ и похожие) нигде на экране.' : '',
    '',
    '---',
    `Входы (${pack.blocks.length}):`,
    pack.blocks.join('\n\n'),
    '---',
  ].filter((line) => line !== undefined && line !== '' || line === '').join('\n')
}
// ── Журнал запусков холста ────────────────────────────────────────────────
// library/<холст>/runs/log.jsonl — по строке на каждый удачный запуск; HTML экранов — рядом отдельными файлами. Переживает удаление ноды и откат доски
const journalDir = (canvasId: string) => join(libraryDir, canvasId, 'runs')
const journalLog = (canvasId: string) => join(journalDir(canvasId), 'log.jsonl')
const journalHtml = (entry: JournalEntry) => `${entry.at}-${entry.nodeId.replace(/[^\w-]/g, '')}.html`
function appendJournal(canvasId: string, entry: JournalEntry, html?: string) {
  mkdirSync(journalDir(canvasId), { recursive: true })
  if (html) writeFileSync(join(journalDir(canvasId), journalHtml(entry)), html)
  appendFileSync(journalLog(canvasId), JSON.stringify(entry) + '\n')
}
// Первый обращение к журналу холста: он заводится из того, что уже лежит на доске (текущие результаты и их история)
function readJournal(canvasId: string): JournalEntry[] {
  if (!existsSync(journalLog(canvasId))) {
    mkdirSync(journalDir(canvasId), { recursive: true })
    writeFileSync(journalLog(canvasId), '')
    for (const { entry, result } of seedEntries(readCanvas(canvasId).nodes)) appendJournal(canvasId, entry, entry.html ? result : undefined)
  }
  return readFileSync(journalLog(canvasId), 'utf8').split('\n').filter(Boolean).flatMap((line) => { try { return [JSON.parse(line) as JournalEntry] } catch { return [] } })
}
function logRun(canvasId: string, node: CNode, at: number, made: { result: string; imageFile?: string }) {
  try {
    readJournal(canvasId) // если журнала не было — сначала в него ложится то, что на доске сейчас
    const entry = journalEntry(node, at, made)
    appendJournal(canvasId, entry, entry.html ? made.result : undefined)
  } catch (error) { console.log('[refkit] журнал запусков не записался:', error instanceof Error ? error.message : error) }
}
// Вернуть запись журнала: в живую ноду (текущее уходит в историю ноды) или новой нодой, если исходной уже нет
function restoreRun(canvasId: string, nodeId: string, at: number) {
  const entry = readJournal(canvasId).find((item) => item.nodeId === nodeId && item.at === at)
  if (!entry) throw new Error(t('Такой записи нет в журнале'))
  const result = entry.html ? readFileSync(join(journalDir(canvasId), journalHtml(entry)), 'utf8') : entry.imageFile && entry.type === 'image' ? String(entry.text ?? '') : String(entry.text ?? '')
  const data = readCanvas(canvasId)
  const node = canvasNode(data, nodeId)
  if (node) {
    const before = node.data ?? {}
    const past = (before.history ?? []) as Array<Record<string, unknown>>
    const history = before.result ? [...past, { result: before.result, screenSource: before.screenSource, imageFile: before.imageFile, ranAt: before.ranAt, ranHash: before.ranHash, usage: before.usage }].slice(-8) : past
    patchCanvasNode(canvasId, nodeId, { status: 'ready', error: undefined, result, screenSource: undefined, imageFile: entry.imageFile, ranAt: entry.at, ranHash: undefined, history })
    return { created: false }
  }
  const right = Math.max(0, ...(data.nodes as CNode[]).map((item) => (item.position?.x ?? 0) + Number(item.width ?? 300)))
  data.nodes.push({ id: `n-back-${at}`, type: entry.type, position: { x: right + 80, y: 0 }, width: entry.type === 'screen' ? 640 : 440, height: entry.type === 'screen' ? 480 : 420, data: { title: entry.title || 'Из журнала', instr: '', sized: true, status: 'ready', result, imageFile: entry.imageFile, ranAt: entry.at } } as CNode)
  writeCanvas(canvasId, data)
  return { created: true }
}
const needsChoiceOf = (pack: { needsChoice: string }) => Boolean(pack.needsChoice)
// Нода «Картинка»: Codex рисует инструментом image_gen и отвечает путём к PNG в своей изолированной папке (generated_images)
function imagePrompt(pack: ReturnType<typeof canvasPackage>) {
  return [
    'Создай ОДНУ картинку инструментом генерации изображений (image_gen) по инструкции и входам ниже. Приложенные картинки — референсы приёма и стиля: не копируй их персонажей, композицию и фирменные цвета.',
    'Сохрани результат и ответь ТОЛЬКО полным путём к PNG-файлу, без пояснений.',
    `Инструкция владельца: ${pack.instr || 'сделай по входам ниже'}`,
    '---',
    `Входы (${pack.blocks.length}):`,
    pack.blocks.join('\n\n'),
    '---',
  ].join('\n')
}
async function generateImage(canvasId: string, nodeId: string, pack: ReturnType<typeof canvasPackage>, usage: Usage[], signal: AbortSignal, edit?: { edits: EditComment[]; current: string }) {
  const out = await trackProvider('codex', runCodex({ kind: 'canvas', model: modelFor('gpt61-sol').id, prompt: edit ? imageEditPrompt(pack, edit.edits) : imagePrompt(pack), images: edit ? [edit.current] : [...pack.images, ...screenShots(pack)], cwd: isolated('canvas-image'), signal, track: usage, effort: 'low' }))
  const made = out.match(/\/[^\s"'`]+\.(?:png|jpe?g|webp)/gi)?.pop() ?? ''
  if (!made || !made.includes('/generated_images/') || !existsSync(made)) throw new Error(t('Codex не вернул файл картинки: ') + out.trim().slice(0, 200))
  const name = `gen-${nodeId.replace(/[^\w-]/g, '')}-${Date.now()}${extname(made).toLowerCase()}`
  mkdirSync(join(libraryDir, canvasId), { recursive: true })
  copyFileSync(made, join(libraryDir, canvasId, name))
  return `/library/${canvasId}/${name}`
}
// ── Правки по точкам (комментарии на «Экране» и «Картинке») ──────────────────
// Точка — доли 0…1 от ширины и высоты результата; h — высота страницы в px на момент клика (у экранов-страниц)
type EditComment = { id: string; text: string; x?: number; y?: number; h?: number; el?: { tag?: string; sel?: string; text?: string } }
const pinned = (edits: EditComment[]) => edits.filter((item) => typeof item.x === 'number' && typeof item.y === 'number')
const editList = (edits: EditComment[], page: boolean) => {
  let n = 0
  return edits.map((item) => {
    const pin = typeof item.x === 'number' && typeof item.y === 'number'
    const element = item.el?.tag ? ` · элемент <${item.el.tag}>${item.el.text ? ` с текстом «${item.el.text}»` : ''}${item.el.sel ? `, путь в DOM: ${item.el.sel}` : ''}` : ''
    const where = pin
      ? `точка ${++n} (${Math.round(item.x! * 100)}% слева, ${Math.round(item.y! * 100)}% сверху${page && item.h ? `, ≈${Math.round(item.y! * item.h)} px от верха страницы` : ''})${element}`
      : 'общая правка'
    return `- ${where}: ${item.text.trim()}`
  }).join('\n')
}
function editPrompt(node: CNode, pack: ReturnType<typeof canvasPackage>, edits: EditComment[], code: string) {
  return [
    `Ты — нода цепочки на холсте владельца. ${canvasContext}`,
    'РЕЖИМ «ВНЕСТИ ПРАВКИ». Ниже текущий код экрана и список правок владельца. На приложенном снимке красные номера — точки правок (номер = пункт списка). Внеси ТОЛЬКО эти правки; всё остальное оставь дословно как есть (структуру, тексты, классы, импорты). Верни полный обновлённый код в том же формате ответа.',
    screenContract(designSystemOf(node.data?.designSystem), `${pack.instr}\n${pack.blocks.join('\n')}`),
    'Не используй значок-искру (✦ и похожие) нигде на экране.',
    `Исходная инструкция ноды (для контекста): ${pack.instr || '—'}`,
    '---',
    'Правки владельца:',
    editList(edits, true),
    '---',
    'Текущий код экрана:',
    code,
  ].join('\n')
}
function imageEditPrompt(pack: ReturnType<typeof canvasPackage>, edits: EditComment[]) {
  return [
    'Исправь приложенную картинку инструментом генерации изображений (image_gen): возьми её как основу и внеси ТОЛЬКО правки ниже, остальное сохрани как есть (композицию, стиль, формат). Точки заданы долями от ширины и высоты картинки.',
    'Сохрани результат и ответь ТОЛЬКО полным путём к PNG-файлу, без пояснений.',
    `Исходная инструкция: ${pack.instr || '—'}`,
    '---',
    'Правки владельца:',
    editList(edits, false),
    '---',
  ].join('\n')
}
// Снимок всей страницы экрана с красными номерами точек поверх (чтобы модель видела, к чему относится правка)
function screenWithPins(node: { data?: Record<string, any> }, edits: EditComment[]) {
  const source = String(node.data!.result)
  const phone = /<body[^>]*data-screen="phone"/i.test(source)
  const w = phone ? 390 : 1440
  const page = /<body[^>]*data-screen="page"/i.test(source)
  const dots = pinned(edits)
  const pageH = Math.min(8000, Math.max(phone ? 844 : 900, ...dots.map((item) => item.h ?? 0)))
  const height = page ? pageH : phone ? 844 : 900
  const marks = dots.map((item, index) => `<div style="position:absolute;left:${Math.round(item.x! * w)}px;top:${Math.round(item.y! * height)}px;width:28px;height:28px;margin:-28px 0 0 0;border-radius:50% 50% 50% 0;background:#e5484d;color:#fff;font:600 14px/28px system-ui;text-align:center;z-index:99999">${index + 1}</div>`).join('')
  const escaped = marks.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  const html = source.includes('&lt;/body&gt;') ? source.replace(/&lt;\/body&gt;(?![\s\S]*&lt;\/body&gt;)/, `${escaped}&lt;/body&gt;`) : source.replace(/<\/body>(?![\s\S]*<\/body>)/i, `${marks}</body>`)
  const cwd = isolated('screen-pins')
  writeFileSync(join(cwd, 'screen.html'), html)
  writeFileSync(join(cwd, 'index.html'), `<!doctype html><body style="margin:0;background:#fff"><iframe sandbox="${node.data?.screenSource ? 'allow-scripts' : ''}" src="screen.html" style="display:block;border:0;width:${w}px;height:${height}px"></iframe>`)
  const png = join(cwd, 'shot.png')
  try { screenshot(join(cwd, 'index.html'), png, Math.max(w, 600), height + 120, node.data?.screenSource ? 4000 : 0) } catch (error) { if (!existsSync(png)) throw error } // Chrome иногда не выходит вовремя после записи кадра
  const file = join(cwd, 'pins.jpg')
  execFileSync('ffmpeg', ['-y', '-v', 'error', '-i', png, '-vf', `crop=${w}:${height}:0:0`, '-q:v', '2', file])
  return file
}
async function runCanvasNode(canvasId: string, nodeId: string, edit = false, redoItem?: number, refine?: string) {
  const key = `${canvasId}:${nodeId}`
  if (canvasRuns.has(key)) return
  const controller = new AbortController()
  canvasRuns.set(key, controller)
  let before: Record<string, any> = {}
  try {
    const data = readCanvas(canvasId)
    const node = canvasNode(data, nodeId)
    if (!node || !AGENT_TYPES.includes(String(node.type))) throw new Error(t('Такой ноды нет'))
    before = node.data ?? {}
    const pack = canvasPackage(data, node)
    if (needsChoiceOf(pack)) throw new Error(t('Выбери вариант в ноде «{needsChoice}», дальше пойдёт только он', { needsChoice: pack.needsChoice }))
    if (!pack.blocks.length) throw new Error(t('Подключи к ноде карточки, подписи или другие ноды слева'))
    patchCanvasNode(canvasId, nodeId, { status: 'running', error: undefined, runStartedAt: Date.now() })
    const usage: Usage[] = []
    if (edit) logDecision(canvasId, `${t('Применил правки по точкам')}: ${((before.comments ?? []) as EditComment[]).filter((item) => String(item?.text ?? '').trim()).map((item) => item.text).join('; ').slice(0, 140)}`)
    const edits = edit ? ((before.comments ?? []) as EditComment[]).filter((item) => String(item?.text ?? '').trim()) : []
    if (edit) {
      if (!edits.length) throw new Error(t('Нет комментариев для правки'))
      if (node.type === 'agent') throw new Error(t('Правки по точкам — только для экрана и картинки'))
      if (node.type === 'screen' && !before.screenSource?.code) throw new Error(t('У этого экрана нет исходника: запусти ноду заново, потом правь'))
      if (node.type === 'image' && !before.imageFile) throw new Error(t('Нет картинки для правки'))
    }
    if (node.type === 'image') {
      const imageFile = await generateImage(canvasId, nodeId, pack, usage, controller.signal, edit ? { edits, current: join(libraryDir, canvasId, String(before.imageFile).split('/').pop()!) } : undefined)
      if (controller.signal.aborted) throw new Error(t('Запуск остановлен'))
      const past = (before.history ?? []) as Array<Record<string, unknown>>
      const history = before.imageFile ? [...past, { result: before.result, imageFile: before.imageFile, ranAt: before.ranAt, ranHash: before.ranHash, usage: before.usage, ...(edit ? { edits } : {}) }].slice(-8) : past
      const imageAt = Date.now()
      const imageText = `Картинка · ${imageFile.split('/').pop()}`
      logRun(canvasId, node, imageAt, { result: imageText, imageFile })
      patchCanvasNode(canvasId, nodeId, { status: 'ready', result: imageText, imageFile, screenSource: undefined, error: undefined, ranAt: imageAt, ranHash: pack.hash, usage, history, ...(edit ? { appliedEdits: edits.map((item) => item.id) } : {}) })
      return
    }
    // Один вариант списка заново: модель отдаёт только новый пункт, остальные остаются как были (дёшево и без риска испортить выбранный)
    const kept = redoItem !== undefined ? splitItems(String(activeData(node).result ?? '')) : []
    if (redoItem !== undefined && !kept[redoItem]) throw new Error(t('Такого варианта нет'))
    const redoNote = redoItem === undefined ? '' : `\n\nВ ответе уже есть список вариантов:\n${kept.map((item, at) => (at === redoItem ? `${item.split('\n')[0].slice(0, 80)} ← ЗАМЕНИТЬ` : item.split('\n')[0].slice(0, 80))).join('\n')}\n\nПридумай один новый вариант взамен помеченного: заметно другой, чем остальные, в том же формате (те же поля). Верни ТОЛЬКО этот один пункт, начиная с «${redoItem + 1}. », без остального списка и без пояснений.`
    // Подсказка к действию: владелец нажал уточнение, прошлый ответ идёт модели как основа
    const refineNote = refine && node.type === 'agent' ? `\n\nУточнение владельца: ${refine}\nПредыдущий ответ ноды:\n${String(activeData(node).result ?? '')}\nОтветь заново с учётом уточнения, в той же форме.` : ''
    const prompt = edit ? editPrompt(node, pack, edits, String(before.screenSource.code)) : canvasPrompt(node, pack, canvasId) + redoNote + refineNote
    const out = await runModel({ kind: 'canvas', prompt, images: edit ? [screenWithPins(node, edits)] : [...pack.images, ...screenShots(pack)], cwd: isolated('canvas'), signal: controller.signal, track: usage, modelKey: nodeModelKey(node), web: node.type === 'agent' && node.data?.web === true, ...(node.type === 'screen' ? { schema: screenSchema } : {}) }, 'ask')
    // Блок памяти просит отмечать номера применённых пунктов в схеме ответа; у ноды схемы нет — модель печатает «memory: [1, 3]» строкой, срезаем
    let screenSource = node.type === 'screen' ? parseScreen(out, designSystemOf(node.data?.designSystem)) : undefined
    // Тема из ноды «Токены» во входе: кладётся поверх темы проекта, компоненты экрана берут цвета и шрифт сами
    if (screenSource && (screenSource.designSystem === 'fluid' || screenSource.designSystem === 'shadcn')) screenSource.tokens = tokensCss(pack.blocks.join('\n')) || undefined
    // Макет приложения и экран на Fluid: проверка кода (повторы, цвета вручную, нечётные пиксели) и отрисованного экрана (вылезает за край, пустоты внутри блоков).
    // При замечаниях модель получает одну попытку исправить; берём вариант, где замечаний не больше
    const assets = screenSource ? assetsForScreen(pack.assets) : []
    const innerOf = (outer: string) => outer.match(/srcdoc="([^"]*)"/)?.[1]?.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&')
    const critique = async (source: NonNullable<typeof screenSource>) => {
      const compiled = await compileScreen(source, assets)
      const inner = innerOf(compiled)
      const metrics = inner ? await measureScreen(inner, isolated('measure')).catch(() => null) : null
      return { compiled, issues: [...lintScreen(source.code), ...measureIssues(metrics)] }
    }
    let result = screenSource ? '' : out.trim().replace(/\n*^\s*memory:\s*\[[\d,\s]*\]\s*$/gim, '').trim()
    if (screenSource) {
      const first = await critique(screenSource)
      result = first.compiled
      if ((screenSource.designSystem === 'brandapp' || screenSource.designSystem === 'fluid') && first.issues.length) {
        const fixPrompt = `${prompt}\n\nТвой предыдущий ответ нужно исправить. Замечания:\n- ${first.issues.join('\n- ')}\nПредыдущий код:\n${screenSource.code}\nВерни исправленный JSON целиком, остальное не меняй.`
        try {
          const fixed = parseScreen(await runModel({ kind: 'canvas', prompt: fixPrompt, images: [...pack.images, ...screenShots(pack)], cwd: isolated('canvas'), signal: controller.signal, track: usage, modelKey: nodeModelKey(node), schema: screenSchema }, 'ask'), designSystemOf(node.data?.designSystem))
          fixed.tokens = screenSource.tokens
          const second = await critique(fixed)
          if (second.issues.length <= first.issues.length) { screenSource = fixed; result = second.compiled }
        } catch { /* исправление не вышло: остаётся первый ответ */ }
      }
    }
    // Строка «Actions: …» в конце ответа — подсказки к действиям: убираем из текста (его читают соседние ноды) и кладём отдельным полем
    const actionLine = node.type === 'agent' ? result.match(/\n*^\s*actions:\s*(.+)$/im) : null
    const actions = actionLine ? actionLine[1].split(/\s*[;|]\s*/).map((item) => item.replace(/^[-*\s]+/, '').trim()).filter(Boolean).slice(0, 3) : []
    const body = actionLine ? result.replace(actionLine[0], '').trim() : result
    const finalResult = redoItem !== undefined && body ? kept.map((item, at) => at === redoItem ? body.replace(/^(?:[-*]\s+|\d+[.)]\s+)?/, `${redoItem + 1}. `) : item).join('\n\n') : body
    if (controller.signal.aborted) throw new Error(t('Запуск остановлен'))
    if (!result) throw new Error(t('Модель вернула пустой ответ'))
    // Прошлый результат не пропадает, а уходит в историю (до 8 версий): на ноде «Результат» между ними можно переключаться и вернуть любую
    const past = (before.history ?? []) as Array<Record<string, unknown>>
    const history = before.result ? [...past, { result: before.result, screenSource: before.screenSource, ranAt: before.ranAt, ranHash: before.ranHash, usage: before.usage, ...(edit ? { edits } : {}) }].slice(-8) : past
    const ranAt = Date.now()
    logRun(canvasId, node, ranAt, { result: finalResult })
    patchCanvasNode(canvasId, nodeId, { status: 'ready', held: undefined, activeAt: undefined, actions: actions.length ? actions : undefined, result: finalResult, screenSource, error: undefined, ranAt, ranHash: pack.hash, usage, history, ...(edit ? { appliedEdits: edits.map((item) => item.id) } : {}) })
    try { syncFrameRef(canvasId, nodeId) } catch (error) { console.log('[refkit] кадр страницы не обновился:', error instanceof Error ? error.message : error) }
  } catch (error) {
    const stopped = controller.signal.aborted
    patchCanvasNode(canvasId, nodeId, stopped ? { status: before.result ? 'ready' : undefined, error: undefined } : { status: 'error', error: (error as Error).message })
  } finally { canvasRuns.delete(key) }
}
// «Запустить всё» и «Запустить отсюда» (как Run Workflow / Run Downstream у Magnific): очередь по порядку связей, независимые ветки идут по три сразу.
// Свежие ноды (вход и инструкция не менялись) пропускаются — подписку тратим только на то, что устарело. Нода «Выбор» без отметки останавливает цепочку после себя:
// это осознанная остановка человека, а не ошибка
const canvasPlans = new Map<string, { cancelled: boolean }>()
// После перезапуска статусы остаются на диске, а процессы и очередь — нет.
function recoverCanvasRuns(canvasId: string) {
  const data = readCanvas(canvasId)
  let changed = false
  for (const node of data.nodes as CNode[]) {
    if (!AGENT_TYPES.includes(String(node.type))) continue
    const status = node.data?.status
    const orphan = status === 'running' ? !canvasRuns.has(`${canvasId}:${node.id}`)
      : status === 'pending' && !canvasPlans.has(canvasId)
    if (!orphan) continue
    node.data = { ...node.data }
    if (node.data.result) node.data.status = 'ready'
    else delete node.data.status
    delete node.data.runStartedAt
    delete node.data.error
    changed = true
  }
  if (changed) writeCanvas(canvasId, data)
}
// Нода-ревьюер (data.review): пишет строки «Fix: <название ноды выше> — <что поправить>» (разбор — shared/canvas-review.mjs); после её запуска правки применяются сами, один круг:
// экрану — комментарием без точки и точечной правкой кода (как «Применить правки»), агенту — уточнением (как подсказка к действию)
async function applyReview(canvasId: string, reviewId: string) {
  const data = readCanvas(canvasId), review = canvasNode(data, reviewId)
  if (!review?.data?.review || review.data.status !== 'ready') return
  const targets = upstreamActions(data, review).map((id) => canvasNode(data, id)!).filter(Boolean)
  const fixes = reviewFixes(String(activeData(review).result ?? ''), targets.map((node) => String(node.data?.title ?? '')))
  await Promise.all(fixes.map(async (fix) => {
    const node = targets.find((item) => item.data?.title === fix.title)!, id = String(node.id)
    if (node.type === 'screen' || node.type === 'image') {
      patchCanvasNode(canvasId, id, { comments: [...((node.data?.comments ?? []) as EditComment[]), { id: `rv-${Date.now()}-${id}`, text: fix.text }] })
      await runCanvasNode(canvasId, id, true)
    } else await runCanvasNode(canvasId, id, false, undefined, fix.text)
  }))
  if (fixes.length) logDecision(canvasId, `${t('Ревьюер поправил')}: ${fixes.map((fix) => fix.title).join(', ')}`)
}
// Разовый сбой модели (не лимит, не вход, не ручная остановка) — один повтор сам, чтобы прогон «одной кнопкой» не вставал на случайной ошибке
const transient = (error: unknown) => Boolean(error) && !/limit|лимит|sign|войд|вош|login|остановлен|stopped|Подключи|Выбери/i.test(String(error))
// Нода с remember (финал «Рефы → правила и токены»): пункты ответа уходят в «Запомнить?» общей памяти — сохраняет владелец, не агент
function offerRemember(canvasId: string, nodeId: string) {
  const node = canvasNode(readCanvas(canvasId), nodeId)
  if (!node?.data?.remember || node.data.status !== 'ready') return
  const file = join(libraryDir, 'memory-offers.json')
  let offers: MemoryItem[] = []
  try { offers = JSON.parse(readFileSync(file, 'utf8')) } catch { /* пусто */ }
  const have = [...readMemory(), ...offers].map((item) => item.text.toLowerCase())
  const lines = String(activeData(node).result ?? '').split('\n').map((line) => line.replace(/^\s*(?:[-*•]|\d+[.)])\s+/, '').replace(/\*\*/g, '').trim()).filter((line) => line.length > 12 && !have.includes(line.toLowerCase())).slice(0, 2)
  if (!lines.length) return
  const from = `${t('холст')} «${String(readMeta(canvasId).title ?? '')}»`
  writeFileSync(file, JSON.stringify([...offers, ...lines.map((text, index) => ({ id: `c-${Date.now()}-${index}`, text, at: Date.now(), from }))], null, 2) + '\n')
}
const runWithReview = async (canvasId: string, nodeId: string) => {
  await runCanvasNode(canvasId, nodeId)
  const after = canvasNode(readCanvas(canvasId), nodeId)
  if (after?.data?.status === 'error' && transient(after.data.error)) await runCanvasNode(canvasId, nodeId)
  await applyReview(canvasId, nodeId)
  offerRemember(canvasId, nodeId)
}
async function runCanvasPlan(canvasId: string, mode: 'all' | 'downstream' | 'after', startId: string) {
  if (canvasPlans.has(canvasId)) return
  const plan = { cancelled: false }
  canvasPlans.set(canvasId, plan)
  const prev = new Map<string, string | undefined>()
  const restore = (id: string) => { const node = canvasNode(readCanvas(canvasId), id); if (node?.data?.status === 'pending') patchCanvasNode(canvasId, id, { status: prev.get(id) === 'error' ? 'error' : node.data.result ? 'ready' : undefined }) }
  let ids: string[] = []
  try {
    const data = readCanvas(canvasId)
    const all = (data.nodes as CNode[]).filter((node) => AGENT_TYPES.includes(String(node.type))).map((node) => String(node.id))
    ids = all
    if (mode === 'downstream' || mode === 'after') {
      const seen = new Set<string>([startId]), queue = [startId]
      while (queue.length) { const current = queue.shift()!; for (const edge of data.edges as Array<{ source?: string; target?: string }>) if (edge.source === current && edge.target && !seen.has(edge.target)) { seen.add(edge.target); queue.push(edge.target) } }
      // after — всё ниже ноды, без неё самой (владелец подтвердил «продолжить» после остановки на вердикте)
      ids = all.filter((id) => seen.has(id) && !(mode === 'after' && id === startId))
    }
    for (const id of ids) { prev.set(id, canvasNode(data, id)?.data?.status); patchCanvasNode(canvasId, id, { status: 'pending' }) }
    const upstream = new Map(ids.map((id) => [id, upstreamActions(data, canvasNode(data, id)!).filter((from) => ids.includes(from))]))
    const done = new Set<string>(), blocked = new Set<string>()
    // Страж: нода с gate='weak' останавливает дорогие шаги ниже, если вердикт слабый (и когда она только что отработала, и когда результат уже был свежим);
    // владелец продолжает кнопкой на самой ноде (режим after)
    const holdIfWeak = (id: string) => {
      const node = canvasNode(readCanvas(canvasId), id)
      if (mode !== 'after' && node?.data?.gate === 'weak' && /attractiveness\W*weak/i.test(String(activeData(node).result ?? ''))) { blocked.add(id); patchCanvasNode(canvasId, id, { held: true }) }
      else if (node?.data?.held) patchCanvasNode(canvasId, id, { held: undefined })
    }
    while (done.size < ids.length && !plan.cancelled) {
      const ready = ids.filter((id) => !done.has(id) && upstream.get(id)!.every((from) => done.has(from)))
      if (!ready.length) break
      for (let at = 0; at < ready.length && !plan.cancelled; at += 3) {
        await Promise.all(ready.slice(at, at + 3).map(async (id) => {
          done.add(id)
          const now = readCanvas(canvasId), node = canvasNode(now, id)!
          const pack = canvasPackage(now, node)
          const stop = upstream.get(id)!.some((from) => blocked.has(from)) || Boolean(pack.needsChoice) || !pack.blocks.length
          // Ревьюер смотрит заново при каждом прогоне: его входы — снимки экранов, а их правка не всегда меняет отпечаток входов
          const fresh = !node.data?.review && !(mode === 'downstream' && id === startId) && Boolean(node.data?.result) && node.data?.ranHash === pack.hash
          if (stop || fresh) { if (stop) blocked.add(id); restore(id); if (!stop) holdIfWeak(id); return }
          await runWithReview(canvasId, id)
          holdIfWeak(id)
        }))
      }
    }
  } finally {
    for (const id of ids) restore(id)
    canvasPlans.delete(canvasId)
  }
}
// Вернуть прошлую версию результата: она становится текущей, а текущая уходит в историю
// Стрелки версий на ноде: какая версия идёт дальше по цепочке. Последняя (текущий запуск) = без activeAt
function activateCanvasVersion(canvasId: string, nodeId: string, index: number) {
  const node = canvasNode(readCanvas(canvasId), nodeId)
  const history = (node?.data?.history ?? []) as unknown[]
  if (!node || !Number.isInteger(index) || index < 0 || index > history.length) throw new Error(t('Такой версии нет'))
  patchCanvasNode(canvasId, nodeId, { activeAt: index >= history.length ? undefined : index })
}
function restoreCanvasVersion(canvasId: string, nodeId: string, index: number) {
  const node = canvasNode(readCanvas(canvasId), nodeId)
  const history = (node?.data?.history ?? []) as Array<Record<string, unknown>>
  const entry = history[index]
  if (!node || !entry) throw new Error(t('Такой версии нет'))
  const rest = history.filter((_, at) => at !== index)
  const now = node.data?.result ? [...rest, { result: node.data.result, screenSource: node.data.screenSource, imageFile: node.data.imageFile, ranAt: node.data.ranAt, ranHash: node.data.ranHash, usage: node.data.usage }].slice(-8) : rest
  patchCanvasNode(canvasId, nodeId, { status: 'ready', error: undefined, result: entry.result, screenSource: entry.screenSource, imageFile: entry.imageFile, ranAt: entry.ranAt, ranHash: entry.ranHash, usage: entry.usage, history: now })
}
// «В библиотеку» для ноды «Картинка»: сгенерированный файл ложится образцом-картинкой (source.jpg), как вставка из буфера
function canvasImageFromFile(canvasId: string, data: CanvasData, node: NonNullable<ReturnType<typeof canvasNode>>) {
  const file = onDisk(node.data!.imageFile)
  if (!file || !existsSync(file)) throw new Error(t('Файла картинки нет на диске'))
  const { w, h } = size(file)
  const pack = canvasPackage(data, node)
  const meta = newRef({ kind: undefined, title: String(node.data!.title ?? 'Картинка'), titleEdited: true, source: '', ratio: w && h ? `${w} / ${h}` : '1 / 1', via: 'canvas', from: pack.cards.map((card) => card.id), folder: readMeta(canvasId).folder })
  execFileSync('ffmpeg', ['-y', '-v', 'error', '-i', file, '-q:v', '2', join(libraryDir, meta.id, 'source.jpg')])
  writeMeta({ ...readMeta(meta.id), image: `/library/${meta.id}/source.jpg`, format: 'image', fetching: false, describing: true })
  void describe(meta.id)
  return readMeta(meta.id)
}
// «Картинкой в библиотеку» для экрана: HTML снимается в кадр своей платформы (телефон 390×844 / веб 1440×900) и ложится образцом-картинкой
// Кадр экрана: HTML кладётся в iframe точного размера платформы (телефон 390×844 / веб 1440×900) и обрезается по нему.
// Кадры с одинаковым HTML переиспользуются: запрос ноды собирается много раз, а снимать страницу — секунды
const screenFrames = new Map<string, string>()
// at — момент анимации в секундах: страница получает скрипт, который ставит все её анимации на паузу и перематывает на этот момент
function screenFrame(node: { data?: Record<string, any> }, out?: string, at?: number) {
  const source = String(node.data!.result)
  // Экран React — внешняя страница с iframe, в srcdoc которого (разметка экранирована) живёт сам рисунок: скрипт кладём перед его закрывающим </body>
  const seek = `(function(){var T=${Math.round((at ?? 0) * 1000)};setInterval(function(){document.getAnimations().forEach(function(a){a.pause();a.currentTime=T})},40)})()`
  const html = at === undefined ? source : source.includes('&lt;/body&gt;') ? source.replace('&lt;/body&gt;', `&lt;script&gt;${seek}&lt;/script&gt;&lt;/body&gt;`) : source.replace(/<\/body>/i, `<script>${seek}</script></body>`)
  const key = createHash('sha1').update(html).digest('hex')
  const phone = /<body[^>]*data-screen="phone"/i.test(html)
  const [w, h] = phone ? [390, 844] : [1440, 900]
  const known = screenFrames.get(key)
  if (known && existsSync(known)) { if (out) copyFileSync(known, out); return { file: known, w, h } }
  const cwd = isolated('screen-shot')
  // У headless-Chrome окно не уже ~500 px: экран кладём в iframe точного размера и обрезаем кадр по нему
  writeFileSync(join(cwd, 'screen.html'), html)
  writeFileSync(join(cwd, 'index.html'), `<!doctype html><body style="margin:0;background:#fff"><iframe sandbox="${node.data?.screenSource ? 'allow-scripts' : ''}" src="screen.html" style="display:block;border:0;width:${w}px;height:${h}px"></iframe>`)
  const png = join(cwd, 'shot.png')
  screenshot(join(cwd, 'index.html'), png, Math.max(w, 600), h + 120, node.data?.screenSource ? 4000 : 0)
  const file = join(cwd, 'frame.jpg')
  execFileSync('ffmpeg', ['-y', '-v', 'error', '-i', png, '-vf', `crop=${w}:${h}:0:0`, '-q:v', '2', file])
  screenFrames.set(key, file)
  if (out) copyFileSync(file, out)
  return { file, w, h }
}
// Раскадровка анимированного экрана: 8 кадров по времени одной картинкой 4×2. Длина — самая длинная секундная длительность в CSS (1–12 с), иначе 4 с.
// Без @keyframes экран статичен и раскадровки не требует
function screenFilmstrip(node: { data?: Record<string, any> }) {
  const html = String(node.data!.result)
  if (!/@keyframes/i.test(html)) return undefined
  const spans = [...html.matchAll(/(\d*\.?\d+)s\b/g)].map((match) => Number(match[1])).filter((value) => value >= 1 && value <= 12)
  const span = spans.length ? Math.max(...spans) : 4
  const key = createHash('sha1').update(html + 'strip').digest('hex')
  const known = screenFrames.get(key)
  if (known && existsSync(known)) return known
  const frames = Array.from({ length: 8 }, (_, index) => screenFrame(node, undefined, (span * index) / 8).file)
  const out = join(isolated('screen-strip'), 'strip.jpg')
  execFileSync('ffmpeg', ['-y', '-v', 'error', ...frames.flatMap((file) => ['-i', file]), '-filter_complex', `${frames.map((_, index) => `[${index}:v]scale=480:-1[v${index}]`).join(';')};${frames.map((_, index) => `[v${index}]`).join('')}xstack=inputs=8:layout=0_0|w0_0|w0+w1_0|w0+w1+w2_0|0_h0|w0_h0|w0+w1_h0|w0+w1+w2_h0`, '-frames:v', '1', '-q:v', '3', out])
  screenFrames.set(key, out)
  return out
}
// Снимки экранов со входа ноды: не больше двух, чтобы картинки не съели лимит запроса; сбой снимка не роняет запуск.
// Анимированный экран отдаётся раскадровкой, статичный — одним кадром
function screenShots(pack: ReturnType<typeof canvasPackage>) {
  const shots: string[] = []
  for (const screen of pack.screens.slice(0, 2)) {
    try { shots.push(screenFilmstrip(screen) ?? screenFrame(screen).file) } catch (error) { console.log('[refkit] снимок экрана не снялся:', error instanceof Error ? error.message : error) }
  }
  return shots
}
// Кадр страницы из экранной ноды (asFrame): после удачного запуска экран снимается и ложится картинкой в папку кадров (по умолчанию f-frames);
// папка помечена «картинки для страницы», так что кадр сам попадает в лендинг как ассет. Запись одна на ноду: перезапуск обновляет картинку, а не плодит новые
function syncFrameRef(canvasId: string, nodeId: string) {
  const node = canvasNode(readCanvas(canvasId), nodeId)
  if (!node || node.type !== 'screen' || !node.data?.asFrame || !node.data.result) return
  const probe = screenFrame(node)
  let id = String(node.data.frameRef ?? '')
  // Макет из плана экранов (frameIndex): название кадра берётся из пункта плана, чтобы лендинг и итог понимали, что на кадре
  const planInput = typeof node.data.frameIndex === 'number' ? canvasInputs(readCanvas(canvasId), nodeId).find((input) => /screens plan/i.test(String(input.data?.title ?? ''))) : undefined
  const planItem = planInput ? splitItems(String(planInput.data?.result ?? ''))[Number(node.data.frameIndex)] : undefined
  const planTitle = planItem ? `Product frame: ${planItem.replace(/^(?:[-*]\s+|\d+[.)]\s+)/, '').replace(/\*\*/g, '').split('\n')[0].slice(0, 220)}` : ''
  const title = planTitle || String(node.data.frameTitle ?? node.data.title ?? 'Экран')
  if (!id || !existsSync(metaPath(id))) {
    const meta = newRef({ kind: undefined, title, titleEdited: true, source: '', ratio: `${probe.w} / ${probe.h}`, via: 'canvas', folder: String(node.data.frameFolder ?? 'f-frames') })
    id = String(meta.id)
    patchCanvasNode(canvasId, nodeId, { frameRef: id })
  }
  copyFileSync(probe.file, join(libraryDir, id, 'source.jpg'))
  writeMeta({ ...readMeta(id), title, description: title, ratio: `${probe.w} / ${probe.h}`, image: `/library/${id}/source.jpg`, format: 'image', fetching: false, describing: false })
}
function canvasImageFromScreen(canvasId: string, data: CanvasData, node: NonNullable<ReturnType<typeof canvasNode>>) {
  const html = String(node.data!.result)
  const pack = canvasPackage(data, node)
  const probe = screenFrame(node)
  const meta = newRef({ kind: undefined, title: String(node.data!.title ?? 'Экран'), titleEdited: true, source: '', ratio: `${probe.w} / ${probe.h}`, via: 'canvas', from: pack.cards.map((card) => card.id), folder: readMeta(canvasId).folder })
  const file = join(libraryDir, meta.id, 'source.jpg')
  copyFileSync(probe.file, file)
  writeFileSync(join(libraryDir, meta.id, 'screen.html'), html)
  if (node.data?.screenSource) writeFileSync(join(libraryDir, meta.id, 'screen.tsx'), String(node.data.screenSource.code))
  writeMeta({ ...readMeta(meta.id), image: `/library/${meta.id}/source.jpg`, format: 'image', fetching: false, describing: true })
  void describe(meta.id)
  return readMeta(meta.id)
}
// «В библиотеку»: результат текстовой ноды — заметкой со ссылками на карточки-источники (как ответ агента)
function canvasNoteFromNode(canvasId: string, nodeId: string) {
  const data = readCanvas(canvasId)
  const node = canvasNode(data, nodeId)
  if (node?.type === 'screen' && node.data?.result) return canvasImageFromScreen(canvasId, data, node)
  if (node?.type === 'image' && node.data?.imageFile) return canvasImageFromFile(canvasId, data, node)
  if (!node || node.type !== 'agent' || !node.data?.result) throw new Error(t('Сохранять нечего'))
  const pack = canvasPackage(data, node)
  const text = [String(node.data.result).trim(), '', pack.cards.length ? `Из: ${pack.cards.map((card) => `[${card.title}](card:${card.id})`).join(', ')}` : ''].join('\n').trim()
  const meta = newRef({ kind: 'note', title: String(node.data.title ?? 'Результат ноды'), titleEdited: true, source: '', ratio: '4 / 3', via: 'canvas', from: pack.cards.map((card) => card.id), folder: readMeta(canvasId).folder })
  writeFileSync(join(libraryDir, meta.id, 'text.txt'), text + '\n')
  writeMeta({ ...readMeta(meta.id), describing: true }); void sortMaterial(meta.id)
  return readMeta(meta.id)
}

// Ответ агента → заметка (идея 58, grill-fabric-findings.md): новая заметка с текстом ответа и ссылками на карточки-источники.
// from — откуда ответ (не sources: это не набор, в «Всё» заметка видна). Ложится в те же подборки, что источник (кроме полки).
// Название — вопрос владельца; теги раскладывает обычная сортировка, название она не трогает (titleEdited)
function answerNote(fromId: string, turn: Turn) {
  const from = fromId === 'agent' ? undefined : readMeta(fromId)
  const cards = [...new Set([...(from ? [from.id] : []), ...(turn.cards ?? []), ...[...turn.answer.matchAll(/\(card:([\w-]+)\)/g)].map((match) => match[1])])].filter((id) => existsSync(metaPath(id)))
  const title = turn.command.replace(/\s+/g, ' ').trim().slice(0, 80) || 'Ответ агента'
  const boards = ((from?.boards as string[] | undefined) ?? []).filter((name) => name !== 'Под рукой')
  const text = [turn.answer.trim(), '', cards.length ? `Из: ${cards.map((id) => `[${readMeta(id).title}](card:${id})`).join(', ')}` : ''].join('\n').trim()
  const meta = newRef({ kind: 'note', title, titleEdited: true, source: '', ratio: '4 / 3', from: cards, boards: boards.length ? boards : undefined })
  writeFileSync(join(libraryDir, meta.id, 'text.txt'), text + '\n')
  writeMeta({ ...readMeta(meta.id), describing: true }); void sortMaterial(meta.id)
  return readMeta(meta.id)
}

// Импорт из Are.na (идея 60, grill-fabric-findings.md): публичный канал по открытому API. Картинка — как вставленная
// (скачать → описать → цвета), ссылка и ролик — как вставленная ссылка, текст — заметкой. Уже сохранённое (тот же источник) пропускаем.
// По одному, с паузой: раскладка — та же дешёвая модель, что при обычном добавлении
type ArenaBlock = { id?: number; class: string; title?: string; content?: string; source?: { url?: string } | null; image?: { original?: { url?: string } } | null }
// Источник блока: настоящий адрес, если он есть; у многих картинок Are.na в source — служебный мусор (arena-images-temp…),
// тогда источник — страница блока на Are.na (эксперимент onboarding-concept, Г5)
const arenaSource = (block: ArenaBlock) => { const url = block.source?.url ?? ''; return /^https?:\/\//.test(url) && !url.includes('arena-images-temp') ? url : block.id ? `https://www.are.na/block/${block.id}` : '' }
const arenaSlug = (value: string) => value.trim().replace(/\/+$/, '').split('/').pop() ?? ''
async function arenaBlocks(value: string) {
  const slug = arenaSlug(value)
  const blocks: ArenaBlock[] = []
  let title = slug
  for (let page = 1; page < 40; page++) {
    const response = await fetch(`https://api.are.na/v2/channels/${encodeURIComponent(slug)}?page=${page}&per=100`, { headers: { 'User-Agent': userAgent } })
    if (!response.ok) throw new Error(response.status === 404 ? t('Канал не найден или закрыт') : t('Are.na ответила {status}', { status: response.status }))
    const data = await response.json() as { title?: string; contents?: ArenaBlock[] }
    title = data.title ?? title
    if (!data.contents?.length) break
    blocks.push(...data.contents)
    if (data.contents.length < 100) break
  }
  const known = new Set(list().map((meta) => String(meta.source ?? '')))
  const fresh = blocks.filter((block) => {
    const source = arenaSource(block)
    return block.class === 'Text' ? Boolean(block.content?.trim()) : Boolean(source) && !known.has(source)
  })
  return { title, total: blocks.length, fresh }
}
// board — подборка, куда сразу ложится импортированное (собираешь рефы под задачу)
async function importArena(value: string, board = '', only: number[] = []) {
  const fresh = (await arenaBlocks(value)).fresh.filter((block) => !only.length || only.includes(Number(block.id))) // only — отобранные блоки
  const into = board && readBoards().some((item) => item.name === board) ? { boards: [board] } : {}
  for (const block of fresh) {
    try {
      if (block.class === 'Text') addNote(String(block.content), { via: 'arena', ...into })
      else if (block.class === 'Image' && block.image?.original?.url) {
        const meta = newRef({ title: block.title || 'Картинка из Are.na', source: arenaSource(block), format: 'image', via: 'arena', ...into, meaning: '', technique: '', stage: 'new', tags: [], collections: [] })
        const cover = await download(meta.id, block.image.original.url)
        writeMeta({ ...readMeta(meta.id), ...cover, describing: true })
        paintColors(meta.id)
        void describe(meta.id)
      } else if (arenaSource(block)) addLink(arenaSource(block), { via: 'arena', ...into })
    } catch { /* один блок не открылся — остальные идут дальше */ }
    await new Promise((resolve) => setTimeout(resolve, 1500))
  }
}

// Разобрать полку вместе (идея 11, прожарка grill-authored-collections.md): агент читает выжимки и описания — не полные
// тексты — и картинки рефов, пишет синтез. Результат — новая заметка: в тексте — из чего собрано, в выжимке — синтез.
// Заметка заводится сразу (digesting), чтобы плитка появилась и показывала «Разбираем…»
const synthesisSchema = {
  type: 'object', additionalProperties: false, required: ['title', 'summary', 'apply', 'tags', 'suggestions'],
  properties: { title: str, summary: { type: 'array', items: str }, apply: { type: 'array', items: str }, tags: { type: 'array', items: str }, suggestions: { type: 'array', items: str } },
}
const kindName = (meta: Meta) => meta.kind === 'youtube' ? 'ролик' : meta.kind === 'article' ? 'статья' : meta.kind === 'note' ? 'заметка' : meta.kind === 'music' ? 'музыка' : meta.kind === 'link' ? 'закладка' : 'UI-референс'
// question — просьба владельца из окна полки («найди общее», своя); нет — общий синтез
function synthesize(ids: string[], question = '') {
  const items = ids.filter((id) => existsSync(metaPath(id))).map(readMeta)
  const meta = newRef({ kind: 'note', title: t('Разбор полки · {n}', { n: items.length }), source: '', ratio: '4 / 3', digesting: true, sources: items.map((item) => item.id), question: question || undefined })
  writeFileSync(join(libraryDir, meta.id, 'text.txt'), `${question ? `Просьба: ${question}\n\n` : ''}Собрано из:\n${items.map((item) => `- ${item.title} (${kindName(item)})`).join('\n')}\n`)
  void runSynthesis(meta.id)
  return readMeta(meta.id)
}
// Материал набора для агента: название и тип, описание, выжимка (нет — начало текста). Полные тексты не шлём
const materialBlock = (item: Meta, index: number) => materialBlockOf(item, index, false)
function materialBlockOf(item: Meta, index: number, covers: boolean) {
  const digest = digestTurn(item)
  const textFile = join(libraryDir, item.id, 'text.txt')
  const start = !digest && item.kind && existsSync(textFile) ? readFileSync(textFile, 'utf8').slice(0, 1500) : ''
  return [
    `${index + 1}. «${item.title}» — ${kindName(item)}${item.kind ? (covers && item.kind !== 'canvas' && item.kind !== 'note' && onDisk(item.image) ? ', обложка приложена' : '') : ', картинка приложена'}`,
    item.description ? `Описание: ${item.description}` : '',
    Array.isArray(item.colors) && item.colors.length ? `Главные цвета (посчитаны кодом по картинке, от частых к редким): ${item.colors.join(', ')}` : '',
    // Ноде идёт суть, разделы и термины; «Как применить» — советы под момент разбора, они остаются в карточке (grill-skill-chips.md)
    digest ? t('Выжимка:\n{answer}', { answer: digest.answer.split('\n\n' + t('Как применить:'))[0] }) : '',
    start ? `Начало текста: ${start}` : '',
  ].filter(Boolean).join('\n')
}
const sourcesOf = (meta: Meta) => ((meta.sources as string[] | undefined) ?? []).filter((id) => existsSync(metaPath(id))).map(readMeta)
// Фокус (галочки владельца): отмечены — агент смотрит только их; не отмечено ничего или отмеченных уже нет в наборе — всё
const focusedOf = (meta: Meta) => {
  const items = sourcesOf(meta)
  const focus = ((meta.focus as string[] | undefined) ?? []).filter((id) => items.some((item) => item.id === id))
  return focus.length ? items.filter((item) => focus.includes(item.id as string)) : items
}
// limit: сколько картинок видит модель; по умолчанию 6 (карточки, агент библиотеки), у нод холста — больше
// covers: у нод холста картинку получают и ссылки со статьями (обложка страницы) — иначе мудборд из ссылок агент читает только текстом
const sourceImages = (items: Meta[], limit = 6, covers = false) => items.filter((item) => !item.kind || (covers && item.kind !== 'canvas' && item.kind !== 'note')).map((item) => onDisk(item.image)).filter((file): file is string => Boolean(file && existsSync(file))).slice(0, limit)

// Полка = заметка (решение владельца 2026-09-26): окно полки — карточка этой заметки. Состав следует за полкой;
// очистили полку — заметка остаётся в библиотеке (пустая, без ответов — удаляется), следующая полка — новая заметка
const shelfFile = join(libraryDir, 'shelf.json')
const shelfNoteId = (): string | undefined => { try { const id = JSON.parse(readFileSync(shelfFile, 'utf8')).note; return id && existsSync(metaPath(id)) ? id : undefined } catch { return undefined } }
const pinnedIds = () => readBoards().find((board) => board.shelf)?.order ?? []
const shelfText = (items: Meta[]) => `Собрано из:\n${items.map((item) => `- ${item.title} (${kindName(item)})`).join('\n')}\n`
// Открыть полку: заметка есть — обновить состав, нет — завести (без синтеза: разбор — первой подсказкой, по действию)
function openShelf() {
  const ids = pinnedIds()
  const items = ids.map(readMeta)
  const id = shelfNoteId()
  if (id) { writeMeta({ ...readMeta(id), sources: ids }); writeFileSync(join(libraryDir, id, 'text.txt'), shelfText(items)); return readMeta(id) }
  const meta = newRef({ kind: 'note', title: t('Полка · {n}', { n: items.length }), source: '', ratio: '4 / 3', sources: ids })
  writeFileSync(join(libraryDir, meta.id, 'text.txt'), shelfText(items))
  writeFileSync(shelfFile, JSON.stringify({ note: meta.id }, null, 2) + '\n')
  return readMeta(meta.id)
}
// Полка поменялась: состав заметки — за ней; опустела — заметка закрепляется (пустую удаляем), полка отвязывается
function syncShelf() {
  const id = shelfNoteId()
  if (!id) return
  const ids = pinnedIds()
  if (ids.length) { writeMeta({ ...readMeta(id), sources: ids }); writeFileSync(join(libraryDir, id, 'text.txt'), shelfText(ids.map(readMeta))); return }
  if (!threadOf(readMeta(id)).length) rmSync(join(libraryDir, id), { recursive: true, force: true })
  writeFileSync(shelfFile, '{}\n')
}

// ── Общий агент библиотеки (прожарка 01_strategy/grill-library-agent.md) ─────────────────────────────────
// Живёт над всей библиотекой: по просьбе предлагает правки списком «было → стало», меняется только принятое.
// Разговоры — library/agent.json (как лента карточки, с conversation). Удаление — в корзину, отмена возвращает
type ChangeField = 'title' | 'description' | 'collections' | 'boards' | 'folder' | 'delete'
type Change = { id: string; card: string; field: ChangeField; from: unknown; to: unknown; status: 'pending' | 'applied' | 'rejected'; trash?: string; label?: string; created?: string }
type AgentTurn = Turn & { changes?: Change[] }
type AgentState = { conversation: number; thread: AgentTurn[]; suggestions?: string[]; asking?: boolean; askError?: string }
const agentFile = join(libraryDir, 'agent.json')
const readAgent = (): AgentState => { try { return { conversation: 0, thread: [], ...JSON.parse(readFileSync(agentFile, 'utf8')) } } catch { return { conversation: 0, thread: [] } } }
const writeAgent = (state: AgentState) => writeFileSync(agentFile, JSON.stringify(state, null, 2) + '\n')
const agentSchema = {
  type: 'object', additionalProperties: false, required: ['answer', 'suggestions', 'changes', 'web', 'found', 'remember', 'memory', 'action', 'question'],
  properties: {
    question: questionSchema,
    // action — предложенный Action (страница Actions): имя для «/» и просьба; не про Actions — пустые строки
    action: { type: 'object', additionalProperties: false, required: ['name', 'text'], properties: { name: { type: 'string' }, text: { type: 'string' } } },
    answer: { type: 'string' }, suggestions: { type: 'array', items: { type: 'string' } }, web: askSchema.properties.web, found: askSchema.properties.found, remember: askSchema.properties.remember, memory: askSchema.properties.memory,
    changes: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['card', 'field', 'to'], properties: {
      card: { type: 'string' }, field: { type: 'string', enum: ['title', 'description', 'collections', 'boards', 'folder', 'delete'] },
      // to: строка (название, описание), список через «; » (подборки), id папки или «+Название» новой (folder), пусто для delete
      to: { type: 'string' } } } },
  },
}
function agentPrompt(state: AgentState, command: string, web: Web = 'ask', focus: string[] = []) {
  const cards = list()
  const turns = state.thread.filter((turn) => (turn.conversation ?? 0) === state.conversation && !turn.webAsk)
  const collections = readCollections().map((item) => `${item.name} — ${item.hint || item.name}`).join('; ')
  const boards = readBoards().map((item) => item.name).join('; ')
  return [
    'Ты — агент личной библиотеки Refkit. Ты видишь список всех карточек с сутью каждой (без полных текстов): помогаешь понять, что накоплено, — общие темы, что применить, — и навести порядок: названия, описания, теги, подборки, дубли.',
    'Ты ничего не меняешь сам: правки возвращаешь списком changes, владелец примет или отклонит каждую. Предлагай правки, только если просьба про изменения; на вопрос — отвечай без changes.',
    'Поля правки: title — новое название; description — новое описание (одна строка); collections — теги карточки целиком, через «; », из словаря ниже (новый — только при сведении тегов, по правилу ниже; теги идут поперёк типов); boards — авторские подборки целиком, через «; », только существующие; delete — удалить (to пустой), только явные дубли и пустые, и объясни в answer почему.',
    `folder — переложить карточку в папку: to — id существующей папки из списка или «+Название» для новой (1–3 слова; новую предлагай, только если у темы 3 и больше карточек, иначе оставь карточку как есть). Папки: ${readFolders().filter((folder) => !folder.inbox).map((folder) => `${folder.id} — ${folder.name}`).join('; ') || 'пока нет'}. Просьба «разобрать пачку»: в answer — одна фраза о чём пачка, темы и что прочитать первым; в changes — folder для каждой карточки пачки, delete — для мусора (страницы входа, капчи, «недоступно», дубли); теги, названия и описания не трогай.`,
    'card — id карточки из списка. В answer каждую карточку называй ссылкой [название](card:id) — владелец откроет её кликом; id отдельно не пиши. Ответ answer — ' + ansLang + ', коротко, markdown; что предлагаешь и почему. suggestions — 2–3 продолжения по содержанию твоего ответа: что владелец, скорее всего, спросит дальше о том же (углубить, сравнить, применить у себя). Не уборка библиотеки (теги, папки, дубли), если просьба была не о ней. До 10 слов, повелительное наклонение («Сравни…», «Разложи…»), без повтора уже сделанного.',
    'Свести теги (просьба «сведи теги к словарю» и похожие): у каждой карточки есть старые слова — это сырьё. Предложи каждой карточке, где теги пусты или неполны, collections: 2–4 тега из словаря по смыслу слов, названия и описания. Новый тег — только если одна тема повторяется хотя бы у трёх карточек и ни один тег словаря её не покрывает: тогда ставь его этим карточкам и в answer одной строкой скажи, какие слова он собирает. Правильные теги не трогай.',
    webLines[web] + ' Найденное в сети — не правки: changes для него пустой, в библиотеку владелец сохранит сам.',
    rememberLine,
    questionLine,
    memoryLines(), insightLines(), styleLine(), actionLine('agent'),
    // Контекст «Actions» (v2): владелец описывает, какой Action хочет и зачем, — предложи его; создаст он сам одним «Да»
    // Контекст «Память»: владелец смотрит на свою память — пересказать, что знаешь (правила + наблюдения выше), найти дубли
    // и противоречия, предложить новое. Новое — только через remember (одна строка); менять и удалять строки сам не можешь —
    // назови номер строки и предложи текстом, владелец поправит на странице
    focus.includes('memory') ? 'Владелец на странице «Память» и спрашивает про неё. Опирайся на пожелания и наблюдения выше; строки называй их номерами. Новое правило — только через remember. Править или удалять существующие строки не можешь: скажи, какую строку и как поменять, — владелец поправит сам.' : '',
    focus.includes('actions')
      ? `Владелец на странице Actions — сохранённых просьб, которые он запускает через «/». Если он описывает, какой Action хочет и для чего, верни action: name — 1–3 слова для «/», text — сама просьба агенту в повелительном наклонении, как написал бы владелец, с учётом памяти о нём; answer — одна-две фразы, что предлагаешь и почему. Не повторяй существующие. Уточняющий вопрос — в answer, action пустой. Существующие Actions: ${readActions().map((item) => `/${item.name || item.text} — ${item.text}`).join('; ') || 'нет'}`
      : 'action — пустые строки.',
    '',
    `Словарь тегов: ${collections || 'нет'}`,
    `Подборки владельца: ${boards || 'нет'}`,
    '',
    // Сначала новые; дата и суть — чтобы агент отвечал про содержание («что общего у последних 10»), а не только убирал
    `Карточки (${cards.length}, сначала новые): id | добавлено | тип | название | суть | теги | подборки владельца | старые слова`,
    cards.map((item) => [item.id, new Date(item.createdAt).toISOString().slice(0, 10), kindName(item), item.title, String(digestTurn(item)?.answer.split('\n').find((line) => line.startsWith('- '))?.slice(2) ?? item.description ?? '').replace(/\s+/g, ' ').slice(0, 200), ((item.collections as string[] | undefined) ?? []).join(', '), ((item.boards as string[] | undefined) ?? []).join(', '), ((item.tags as string[] | undefined) ?? []).join(', ')].join(' | ')).join('\n'),
    // Контекст чипом (№21): владелец спрашивает про эти карточки — они целиком, с выжимками; остальной список — для ссылок
    focus.length ? `\nВладелец спрашивает про эти карточки (${focus.length}) — отвечай про них:\n${focus.filter((id) => existsSync(metaPath(id))).map(readMeta).map(materialBlock).join('\n\n')}` : '',
    turns.length ? `\nЭтот разговор:\n${turns.map((turn) => `> ${turn.command}\n${turn.answer}`).join('\n\n')}` : '',
    `\nПросьба: ${command}`,
  ].join('\n')
}
// Найденное общим агентом — своя папка: карточки у него нет (list() её не видит — там нет meta.json)
const agentFound = 'agent-found'
// Картинки для агента библиотеки (2026-10-01: «картинок я не вижу»): карточки из контекста и названные в просьбе по имени
function agentImages(command: string, focus: string[]) {
  const text = command.toLowerCase()
  const named = list().filter((meta) => String(meta.title ?? '').length >= 3 && text.includes(String(meta.title).toLowerCase()))
  const picked = [...focus.filter((id) => existsSync(metaPath(id))).map(readMeta), ...named]
    .filter((meta, index, all) => all.findIndex((other) => other.id === meta.id) === index)
    .filter((meta) => String(meta.image ?? '').startsWith('/library/') && existsSync(join(libraryDir, String(meta.image).replace(/^\/library\//, ''))))
    .slice(0, 6)
  return { paths: picked.map((meta) => join(libraryDir, String(meta.image).replace(/^\/library\//, ''))), titles: picked.map((meta) => `«${meta.title}» (${meta.id})`) }
}
async function agentAsk(command: string, web: Web = 'ask', focus: string[] = []) {
  const { signal, onProgress } = startRun('agent')
  const seen = agentImages(command, focus)
  try {
    const usage: Usage[] = []
    const steps: Steps = { thought: 0, looked: 0 }
    const result = JSON.parse(await runModel({ kind: 'library-agent', schema: agentSchema, prompt: agentPrompt(readAgent(), command, web, focus) + (seen.titles.length ? `\n\nПриложены картинки карточек по порядку: ${seen.titles.join(', ')}. Смотри на них, а не только на названия.` : ''), images: seen.paths, cwd: isolated('agent'), web: web === 'yes', track: usage, signal, onProgress, steps }, 'ask')) as { answer: string; suggestions: string[]; changes: Array<{ card: string; field: ChangeField; to: string }>; web: string; found: Array<{ url: string; title: string }>; remember?: string; memory?: string[]; question?: unknown; action?: { name: string; text: string } }
    const at = Date.now()
    // Нужна сеть без разрешения — вопрос в ленту вместо ответа, подсказки прежние (как в карточке)
    if (web === 'ask' && result.web?.trim() && readPermissions().web === 'allow') { setTimeout(() => void agentAsk(command, 'yes', focus), 0); return }
    if (web === 'ask' && result.web?.trim()) {
      const state = readAgent()
      writeAgent({ ...state, thread: [...state.thread, { command, answer: '', webAsk: result.web.trim(), at, usage, conversation: state.conversation }], asking: false, askError: undefined })
      return
    }
    mkdirSync(join(libraryDir, agentFound), { recursive: true })
    const found = web === 'yes' && result.found?.length ? await foundPreviews(agentFound, result.found, at) : []
    // Новая папка — только если в группе 3+ карточки (прожарка grill-sort-batch.md); неизвестная или та же папка — правка отбрасывается
    const newCount = new Map<string, number>()
    for (const change of result.changes) if (change.field === 'folder' && change.to.startsWith('+')) newCount.set(change.to.trim().toLowerCase(), (newCount.get(change.to.trim().toLowerCase()) ?? 0) + 1)
    const folderOk = (change: { card: string; to: string }) => change.to.startsWith('+')
      ? Boolean(change.to.slice(1).trim()) && (newCount.get(change.to.trim().toLowerCase()) ?? 0) >= 3
      : readFolders().some((folder) => folder.id === change.to) && (readMeta(change.card).folder ?? inboxId()) !== change.to
    const changes: Change[] = result.changes.filter((change) => existsSync(metaPath(change.card)) && (change.field !== 'folder' || folderOk(change))).map((change, index) => {
      const meta = readMeta(change.card)
      const many = change.field === 'collections' || change.field === 'boards'
      if (change.field === 'folder') return { id: `${at}-${index}`, card: change.card, field: change.field, from: meta.folder ?? inboxId(), to: change.to.trim(), label: change.to.startsWith('+') ? change.to.slice(1).trim() : readFolders().find((folder) => folder.id === change.to)?.name, status: 'pending' }
      return { id: `${at}-${index}`, card: change.card, field: change.field, from: change.field === 'delete' ? meta.title : meta[change.field] ?? (many ? [] : ''), to: many ? change.to.split(';').map((item) => item.trim()).filter(Boolean) : change.to, status: 'pending' }
    })
    const state = readAgent()
    // «Можно менять библиотеку» — правки применяются сразу, отменить можно тем же «Отменить»; удаление — всегда поштучно
    const allowed = readPermissions().library === 'allow'
    writeAgent({ ...state, thread: [...state.thread, { command, answer: result.answer.trim(), at, usage, steps: steps.thought >= 1 ? { thought: Math.round(steps.thought), looked: 0 } : undefined, conversation: state.conversation, changes: changes.length ? changes : undefined, found: found.length ? found : undefined, question: cleanQuestion(result.question), remember: proposal(result.remember), usedMemory: usedMemory(result.memory), makeAction: result.action?.text?.trim() || offerAction(command), makeActionName: result.action?.text?.trim() ? result.action.name.trim() || undefined : undefined }], suggestions: result.suggestions.slice(0, 3), asking: false, askError: undefined })
    if (allowed && changes.some((change) => change.field !== 'delete')) agentApply(at, undefined, 'apply')
  } catch (error) {
    writeAgent({ ...readAgent(), asking: false, askError: signal.aborted ? undefined : (error as Error).message })
  } finally { endRun('agent') }
}
// Применить / отклонить / отменить правки из ответа at; ids — какие (нет — все подходящие; удаление — только поштучно)
function agentApply(at: number, ids: string[] | undefined, action: 'apply' | 'reject' | 'undo') {
  const state = readAgent()
  const turn = state.thread.find((item) => item.at === at)
  for (const change of turn?.changes ?? []) {
    if (ids ? !ids.includes(change.id) : change.field === 'delete' && action === 'apply') continue
    if (action === 'apply' && change.status === 'pending') {
      if (!existsSync(metaPath(change.card))) { change.status = 'rejected'; continue }
      if (change.field === 'delete') {
        mkdirSync(join(libraryDir, '.trash'), { recursive: true })
        change.trash = `${change.card}-${Date.now()}`
        renameSync(join(libraryDir, change.card), join(libraryDir, '.trash', change.trash))
      } else if (change.field === 'folder') {
        // «+Название» — новая папка, одна на всю группу: ищем по имени, нет — заводим; id запоминаем для отмены
        let target = String(change.to)
        if (target.startsWith('+')) {
          const name = target.slice(1).trim()
          const found = readFolders().find((folder) => folder.name.toLowerCase() === name.toLowerCase())
          if (found) target = found.id
          else { const folder: Folder = { id: `f-${Date.now()}-${readFolders().length}`, name }; writeFolders([...readFolders(), folder]); target = folder.id; change.created = folder.id }
        }
        if (!readFolders().some((folder) => folder.id === target)) { change.status = 'rejected'; continue }
        writeMeta({ ...readMeta(change.card), folder: target })
      } else {
        writeMeta({ ...readMeta(change.card), [change.field]: change.to, ...(change.field === 'title' ? { titleEdited: true } : {}) })
        // Новый тег из правки (сведение тегов) — в словарь; описание допишет агент по названию, это часть принятия
        if (change.field === 'collections') for (const name of change.to as string[]) {
          if (readCollections().some((item) => item.name.toLowerCase() === name.toLowerCase())) continue
          writeCollections([...readCollections(), { name, types: allTypes, hint: name }])
          void describeCollection(name)
        }
      }
      change.status = 'applied'
    } else if (action === 'reject' && change.status === 'pending') change.status = 'rejected'
    else if (action === 'undo' && change.status === 'applied') {
      if (change.field === 'delete' && change.trash && existsSync(join(libraryDir, '.trash', change.trash))) renameSync(join(libraryDir, '.trash', change.trash), join(libraryDir, change.card))
      else if (change.field !== 'delete' && existsSync(metaPath(change.card))) writeMeta({ ...readMeta(change.card), [change.field]: change.from })
      // Папка, которую заводила эта правка, после отмены пуста — убираем её
      if (change.field === 'folder') for (const owner of turn?.changes ?? []) if (owner.created && !list().some((meta) => meta.folder === owner.created)) writeFolders(readFolders().filter((folder) => folder.id !== owner.created))
      change.status = 'pending'
    }
  }
  writeAgent(state)
  scheduleIndex()
  return readAgent()
}

// Синтез в заметку noteId по её sources — и при создании, и по «Заново» (digest() отправляет сюда)
async function runSynthesis(noteId: string) {
  const meta = readMeta(noteId)
  const items = focusedOf(meta)
  try {
    const images = sourceImages(items)
    const prompt = [
      `Ниже — ${items.length} элементов, собранных вместе. Ничего не запускай и не читай, кроме приложенных картинок. ${ownContext}`,
      meta.question ? `Просьба владельца: «${meta.question}» — ответь на неё, разбирая элементы вместе:` : 'Разбери их вместе, а не по одному:',
      '— title: 2–6 слов — о чём этот набор;',
      '— summary: 4–6 пунктов — что общего, как элементы связаны, чем дополняют или противоречат друг другу; ссылайся на элементы по названию;',
      '— apply: 3–5 шагов — что сделать с этим набором на практике; каждый начинается с глагола;',
      '— tags: 3–5 слов для поиска в нижнем регистре (это не теги словаря);',
      suggestionsLine,
      t('По-русски, простым текстом. Чего нет в материалах — не выдумывай.'),
      '', '---',
      items.map(materialBlock).join('\n\n'),
    ].join('\n')
    const usage: Usage[] = []
    const result = JSON.parse(await runModel({ kind: 'synthesize', prompt, images, cwd: isolated('synthesize'), schema: synthesisSchema, track: usage }, 'digest'))
    const fresh = readMeta(meta.id)
    if (!fresh.digesting) return // синтез уже записал другой запуск
    // Заметка-синтез — своя, её агент и заводил: название и теги ставит сам; синтез — ответом в ленту, первая мысль — описанием (плитка, поиск)
    const turn: Turn = { command: digestCommand(fresh), answer: digestAnswer(result), at: Date.now(), usage, via: 'digest' }
    writeMeta({ ...fresh, title: fresh.titleEdited ? fresh.title : result.title, tags: result.tags, description: keepsDescription(fresh) ? fresh.description : result.summary[0], suggestions: result.suggestions, thread: [...threadOf(fresh), turn], digesting: false, digestError: undefined })
  } catch (error) {
    if (existsSync(metaPath(meta.id))) writeMeta({ ...readMeta(meta.id), digesting: false, digestError: (error as Error).message })
  }
}

// Очередь: строка JSON на элемент — { url?, text?, via, at }. Сборщики дописывают её, даже когда Refkit выключен;
// сервер забирает файл целиком (переименованием — чтобы не потерять строки, дописанные во время разбора).
const queueFile = join(libraryDir, '.queue.jsonl')

// Главные цвета (№18): считает код, без модели — это хранение, не работа агента. Нет цветов и картинка на диске — досчитываем
function paintColors(id?: string) {
  for (const meta of id ? (existsSync(metaPath(id)) ? [readMeta(id)] : []) : list()) {
    if (Array.isArray(meta.colors) || !onDisk(meta.image) || !existsSync(onDisk(meta.image))) continue
    writeMeta({ ...readMeta(meta.id), colors: mainColors(onDisk(meta.image)) })
  }
}
function drainQueue() {
  if (!existsSync(queueFile)) return
  const taken = join(libraryDir, `.queue-${Date.now()}.taking`)
  renameSync(queueFile, taken)
  const known = new Set(list().map((meta) => meta.source))
  for (const line of readFileSync(taken, 'utf8').split('\n').filter(Boolean)) {
    try {
      const item = JSON.parse(line) as { url?: string; text?: string; file?: string; via?: string; at?: string }
      const extra = { via: item.via ?? 'queue', postText: item.url ? item.text : undefined }
      if (item.file) {
        // Копию кладёт MCP в library/.inbox-files; читаем только оттуда и после приёма убираем
        const path = resolve(item.file)
        const mime = types[extname(path).toLowerCase()]?.startsWith('image/') ? types[extname(path).toLowerCase()] : undefined
        if (!path.startsWith(join(libraryDir, '.inbox-files') + sep) || !mime || !existsSync(path)) throw new Error(t('файл не из .inbox-files или не картинка: {file}', { file: item.file }))
        addImage(`data:${mime};base64,${readFileSync(path).toString('base64')}`, undefined, { ...extra, ...(item.text?.trim() ? { description: item.text.trim() } : {}) }, true)
        rmSync(path, { force: true })
      } else if (item.url && /^https?:\/\//.test(item.url)) { if (!known.has(item.url)) { addLink(item.url, extra); known.add(item.url) } }
      else if (item.text?.trim()) addNote(item.text.trim(), extra)
    } catch (error) { console.error('[refkit] строка очереди пропущена:', (error as Error).message) }
  }
  renameSync(taken, `${taken.replace(/\.taking$/, '')}.done`) // разобранное не удаляем — можно проверить, что пришло
}

// Работа, прерванная выключением сервера, продолжается при следующем запуске.
function resume() {
  for (const meta of list()) {
    if (meta.fetching && /^https?:\/\//.test(String(meta.source))) void ingest(meta.id, String(meta.source))
    else if (meta.digesting) void digest(meta.id)
    else if (meta.describing && meta.kind) void sortMaterial(meta.id)
    if (meta.asking) writeMeta({ ...meta, asking: false, askError: 'Сервер перезапустился — отправьте просьбу ещё раз' })
  }
  // Агент библиотеки: процесс жил в памяти и умер вместе с сервером, а «работаю» осталось в файле — без этого панель висит, а «Стоп» нечего останавливать
  const agent = readAgent()
  if (agent.asking) writeAgent({ ...agent, asking: false, askError: 'Сервер перезапустился — отправьте просьбу ещё раз' })
}

export function libraryPlugin(): Plugin {
  return {
    name: 'refkit-library',
    apply: 'serve',
    configureServer(server) {
      mkdirSync(libraryDir, { recursive: true })
      migrateCollections()
      migrateShelf()
      migrateFolders()
      try { migrateDigests() } catch (error) { console.error('[refkit] выжимки не перенесены в ленту:', (error as Error).message) }
      resume()
      drainQueue()
      setTimeout(() => { try { paintColors() } catch (error) { console.error('[refkit] цвета не посчитаны:', (error as Error).message) } }, 2000)
      scheduleIndex()
      server.httpServer?.once('listening', () => { const address = server.httpServer?.address(); if (address && typeof address === 'object') appOrigin = `http://localhost:${address.port}` })
      const timer = setInterval(() => { drainQueue(); try { paintColors() } catch { /* следующий раз */ } }, 60_000)
      const cuesTimer = setInterval(() => void backfillCues(), 30_000)
      server.httpServer?.on('close', () => { clearInterval(timer); clearInterval(cuesTimer) })

      // Refkit без пароля: он должен слушать только этот компьютер. С --host / 0.0.0.0 API (запуск агента, чтение и удаление материалов) открылось бы всей сети
      const listen = server.config.server.host
      if (process.env.REFKIT_ALLOW_NETWORK !== '1' && (listen === true || (typeof listen === 'string' && !/^(localhost|127\.0\.0\.1|::1)$/.test(listen)))) {
        throw new Error('Refkit has no authentication, so it must not listen on the network (--host / 0.0.0.0). Run it without --host. REFKIT_ALLOW_NETWORK=1 overrides this at your own risk.')
      }
      // Защита API от запросов с чужих сайтов (CSRF): страница в браузере может слать запросы на localhost вслепую.
      // Принимаем только запросы со своего адреса: у браузерных запросов Sec-Fetch-Site и Origin видны и должны совпасть с Host.
      // Запросы без этих заголовков (MCP, curl, локальные скрипты) пропускаем, расширение Chrome ходит на /clip и /batch со своим ключом
      server.middlewares.use('/api/library', (req, res, next) => {
        const route = (req.url ?? '').split('?')[0].replace(/^\//, '').split('/')[0]
        if ((route === 'clip' || route === 'batch') && req.method !== 'GET') return next()
        const site = req.headers['sec-fetch-site'], origin = req.headers.origin, host = req.headers.host ?? ''
        const foreignSite = site !== undefined && site !== 'same-origin' && site !== 'none'
        const foreignOrigin = origin !== undefined && origin !== `http://${host}` && origin !== `https://${host}`
        if (foreignSite || foreignOrigin) { res.statusCode = 403; res.setHeader('Content-Type', 'application/json'); return res.end(JSON.stringify({ error: 'Cross-site request blocked' })) }
        next()
      })

      // Файлы рефов: /library/<id>/source.png
      server.middlewares.use('/library', (req, res, next) => {
        const path = decodeURIComponent((req.url ?? '').split('?')[0])
        const file = join(libraryDir, path)
        // Служебные папки с точкой не отдаём — кроме корзины: у удалённых карточек видно превью
        if (!resolve(file).startsWith(resolve(libraryDir) + sep) || path.includes('..') || (path.includes('/.') && !path.startsWith('/.trash/')) || !existsSync(file)) return next()
        res.setHeader('Content-Type', types[extname(file).toLowerCase()] ?? 'application/octet-stream')
        res.setHeader('Last-Modified', statSync(file).mtime.toUTCString()) // плитка холста по нему понимает, что превью свежее правки
        res.end(req.method === 'HEAD' ? undefined : readFileSync(file))
      })

      // GET — список; POST — добавить; PUT /:id — правка полей; DELETE /:id — в корзину.
      server.middlewares.use('/api/library', async (req, res) => {
        res.setHeader('Content-Type', 'application/json')
        try {
          const [rawId = '', action = '', sub = ''] = (req.url ?? '').split('?')[0].replace(/^\//, '').split('/')
          const id = safeId(rawId)
          // Ход работы агента по карточкам — страница опрашивает раз в секунду, пока агент работает
          if (req.method === 'GET' && rawId === 'favicon') {
            const host = String(new URL(req.url ?? '', 'http://x').searchParams.get('host') ?? '').toLowerCase()
            const file = /^[a-z0-9.-]+\.[a-z]{2,}$/.test(host) ? await favicon(host) : ''
            if (!file) { res.statusCode = 404; return res.end('{}') }
            res.setHeader('Content-Type', Object.entries(iconTypes).find(([, ext]) => file.endsWith(`.${ext}`))?.[0] ?? 'image/png')
            res.setHeader('Cache-Control', 'max-age=86400')
            return res.end(readFileSync(file))
          }
          // Заголовок и описание страницы для тегов по смыслу в окне добавления (2026-10-04): без модели и без разбора статьи
          if (req.method === 'GET' && rawId === 'peek') {
            const link = String(new URL(req.url ?? '', 'http://x').searchParams.get('link') ?? '')
            return res.end(JSON.stringify({ text: /^https?:\/\//.test(link) ? await peek(link) : '' }))
          }
          if (req.method === 'GET' && id === 'progress') return res.end(JSON.stringify(Object.fromEntries(progress)))
          if (req.method === 'GET' && !id) { const items = list(); const estimate = estimates(items); return res.end(JSON.stringify(items.map((item) => ({ ...item, tags: Array.isArray(item.tags) ? item.tags : [], ratio: item.ratio ?? '4 / 3', estimate: estimate(item) })))) } // материал, добавленный мимо интерфейса (API, MCP), ещё без тегов и ratio — не роняем экран
          // Настройки: GET — модели по действиям, глубина и варианты; PUT { models?, depth? } — поменять.
          // PUT { model } — старый формат: одна модель на выжимку и просьбы (пока так шлёт интерфейс)
          // GET /providers[?fresh=1] — вошли ли Claude Code и Codex и не упёрлись ли в лимит (страница «Настройки»)
          if (rawId === 'providers' && req.method === 'POST') {
            const body = await readBody(req)
            if (body.provider !== 'claude' && body.provider !== 'codex') { res.statusCode = 400; return res.end(JSON.stringify({ error: 'provider' })) }
            startLogin(body.provider)
            return res.end(JSON.stringify({ ok: true }))
          }
          // Идёт ли сейчас вход (кнопка «Войти» у ошибки агента ждёт, пока браузерный вход закончится)
          if (rawId === 'login' && req.method === 'GET') return res.end(JSON.stringify({ claude: logins.has('claude'), codex: logins.has('codex') }))
          if (rawId === 'providers') return res.end(JSON.stringify(await providerStatus(Boolean(req.url?.includes('fresh=1')))))
          if (rawId === 'settings') {
            if (req.method === 'PUT') {
              const body = await readBody(req)
              const settings = readSettings()
              const known = (key: unknown) => modelOptions.some((item) => item.key === key && !item.off)
              if (known(body.model)) settings.models = { ...settings.models, digest: String(body.model), ask: String(body.model) }
              const models = (body.models ?? {}) as Record<string, unknown>
              for (const action of actions) if (known(models[action])) settings.models[action] = String(models[action])
              if (depths.includes(body.depth as Depth)) settings.depth = body.depth as Depth
              writeSettings(settings)
            }
            const settings = readSettings()
            // models — список вариантов (так его ждёт интерфейс), assigned — какая модель на каком действии
            return res.end(JSON.stringify({ model: settings.models.digest, models: modelOptions.filter((item) => !item.off).map(({ key, label, note, id, context, efforts, badge, more, provider }) => ({ key, label, note, id, context, efforts, badge, more, provider })), assigned: settings.models, depth: settings.depth }))
          }
          // Подборки: GET — список, POST { name } — создать (для всех типов; описание для агента допишется в фоне)
          if (rawId === 'collections') {
            if (req.method === 'GET') return res.end(JSON.stringify(readCollections()))
            // Словарь тегов правится из чипов (шаг 4 grill-taxonomy.md): PUT { from, to } — переименовать, DELETE { name } —
            // удалить; и в словаре, и во всех карточках разом. Переименование в уже существующий тег — слияние
            if (req.method === 'PUT' || req.method === 'DELETE') {
              const body = await readBody(req)
              const from = String(body.from ?? body.name ?? '')
              const to = req.method === 'PUT' ? String(body.to ?? '').trim() : ''
              if (!from || (req.method === 'PUT' && !to)) { res.statusCode = 400; return res.end(JSON.stringify({ error: t('Пустое название') })) }
              const target = readCollections().find((item) => item.name.toLowerCase() === to.toLowerCase() && item.name !== from)?.name
              writeCollections(to && !target ? readCollections().map((item) => item.name === from ? { ...item, name: to } : item) : readCollections().filter((item) => item.name !== from))
              const into = target ?? to
              for (const item of list()) {
                const tags = collectionsOf(item as { collections?: string[] })
                if (tags.includes(from)) writeMeta({ ...item, collections: [...new Set(tags.flatMap((tag) => tag === from ? (into ? [into] : []) : [tag]))] })
              }
              scheduleIndex()
              return res.end(JSON.stringify(readCollections()))
            }
            const name = String((await readBody(req)).name ?? '').trim()
            if (!name) { res.statusCode = 400; return res.end(JSON.stringify({ error: t('Пустое название') })) }
            const current = readCollections()
            if (!current.some((item) => item.name.toLowerCase() === name.toLowerCase())) { writeCollections([...current, { name, types: allTypes, hint: '' }]); void describeCollection(name) }
            return res.end(JSON.stringify(readCollections()))
          }
          // Свой порядок в сетке — library/order.json, список id (прожарка grill-order.md). GET — порядок, PUT { order } — сохранить.
          // Новые элементы в нём не числятся — сетка ставит их первыми
          // Память о владельце: GET — список; POST { text } — добавить; PUT { id, text } — поправить (пусто — удалить); DELETE { id }
          // Команды подключения MCP (R16) — путь к серверу знает только сервер
          if (req.method === 'GET' && rawId === 'mcp') {
            const server = join(import.meta.dirname, 'mcp', 'server.mjs')
            return res.end(JSON.stringify({ claude: `claude mcp add refkit -- node "${server}"`, codex: `codex mcp add refkit -- node "${server}"` }))
          }
          // Импорт из Are.na: GET /import?arena=<ссылка или slug> — сколько найдётся; POST { arena } — начать (в фоне)
          if (rawId === 'import') {
            if (req.method === 'GET') {
              const value = String(new URL(req.url ?? '', 'http://x').searchParams.get('arena') ?? '')
              try { const { title, total, fresh } = await arenaBlocks(value); return res.end(JSON.stringify({ title, total, fresh: fresh.length })) }
              catch (error) { res.statusCode = 400; return res.end(JSON.stringify({ error: (error as Error).message })) }
            }
            if (req.method === 'POST') { const body = await readBody(req); void importArena(String(body.arena ?? ''), String(body.board ?? ''), Array.isArray(body.ids) ? body.ids.map(Number) : []); return res.end(JSON.stringify({ ok: true })) }
          }
          // Поиск по речи роликов (идея 59): GET /speech?q= — фрагменты cues.json, где нашлись все слова; до 2 на ролик
          if (req.method === 'GET' && rawId === 'speech') {
            const words = String(new URL(req.url ?? '', 'http://x').searchParams.get('q') ?? '').toLowerCase().replace(/ё/g, 'е').split(/[^\p{L}\d]+/u).filter((word) => word.length > 2)
            const hits: Array<{ id: string; t: number; text: string }> = []
            if (words.length) for (const meta of list()) {
              const file = join(libraryDir, meta.id, 'cues.json')
              if (meta.kind !== 'youtube' || !existsSync(file)) continue
              const cues = JSON.parse(readFileSync(file, 'utf8')) as Cue[]
              for (const cue of cues.filter((item) => { const low = item.text.toLowerCase().replace(/ё/g, 'е'); return words.every((word) => low.includes(word)) }).slice(0, 2)) {
                // Фрагмент с найденного слова (чуть раньше — начало слова по пробелу), ~120 знаков: в две строки плитки влезает само слово
                const found = cue.text.toLowerCase().replace(/ё/g, 'е').indexOf(words[0])
                const at = Math.max(0, cue.text.lastIndexOf(' ', Math.max(0, found - 12)) + 1)
                hits.push({ id: meta.id, t: cue.t, text: `${at ? '…' : ''}${cue.text.slice(at, at + 120).trim()}…` })
              }
              if (hits.length >= 40) break
            }
            return res.end(JSON.stringify(hits))
          }
          // Строки памяти, предложенные внешним агентом через MCP (refkit_suggest_memory): GET — список, POST { id, accept }
          if (rawId === 'memory-offers') {
            seedStarter()
            const file = join(libraryDir, 'memory-offers.json')
            const offers = (): MemoryItem[] => { try { return JSON.parse(readFileSync(file, 'utf8')) } catch { return [] } }
            if (req.method === 'POST') {
              const body = await readBody(req)
              const offer = offers().find((item) => item.id === body.id)
              if (offer && body.accept) remember(offer.text, offer.from ?? 'внешний агент')
              writeFileSync(file, JSON.stringify(offers().filter((item) => item.id !== body.id), null, 2) + '\n')
            }
            return res.end(JSON.stringify(offers()))
          }
          // Права агента: GET — текущие, PUT { library?, web? } — поменять
          if (rawId === 'permissions') {
            if (req.method === 'PUT') {
              const body = await readBody(req)
              const next = readPermissions()
              for (const key of ['library', 'web'] as const) if (body[key] === 'ask' || body[key] === 'allow') next[key] = body[key] as Permission
              writePermissions(next)
            }
            return res.end(JSON.stringify(readPermissions()))
          }
          // Свои действия: GET — список, DELETE { id } — убрать
          if (rawId === 'actions') {
            // Actions (v2): POST { name, text } — новый руками; PUT { id, name?, text? } — правка; DELETE { id } — убрать
            if (req.method === 'POST') {
              const body = await readBody(req)
              const text = String(body.text ?? '').trim()
              const how = String(body.how ?? '').trim().slice(0, MAX_HOW), about = String(body.about ?? '').trim().slice(0, 160)
              if (text) writeActions([...readActions(), { id: `a-${Date.now()}`, text, at: Date.now(), ...(String(body.name ?? '').trim() ? { name: String(body.name).trim() } : {}), ...(how ? { how } : {}), ...(about ? { about } : {}) }])
            }
            if (req.method === 'PUT') {
              const body = await readBody(req)
              writeActions(readActions().map((item) => item.id !== body.id ? item : { ...item, ...(typeof body.text === 'string' && body.text.trim() ? { text: body.text.trim() } : {}), ...(typeof body.name === 'string' ? { name: body.name.trim() || undefined } : {}), ...(typeof body.how === 'string' ? { how: body.how.trim().slice(0, MAX_HOW) || undefined } : {}), ...(typeof body.about === 'string' ? { about: body.about.trim().slice(0, 160) || undefined } : {}) }))
            }
            if (req.method === 'DELETE') { const body = await readBody(req); writeActions(readActions().filter((item) => item.id !== body.id)) }
            return res.end(JSON.stringify(readActions()))
          }
          // Выводы «что ты сохраняешь»: GET — последние, POST — сделать заново (по кнопке)
          if (rawId === 'insights') {
            if (req.method === 'POST') {
              try { return res.end(JSON.stringify(await makeInsights())) }
              catch (error) { res.statusCode = 500; return res.end(JSON.stringify({ error: (error as Error).message })) }
            }
            return res.end(JSON.stringify(readInsights()))
          }
          // Кто брал память: последние обращения внешних агентов из журнала MCP (library/.mcp-log.jsonl), новые первыми
          if (rawId === 'mcp-log') {
            let lines: string[] = []
            try { lines = readFileSync(join(libraryDir, '.mcp-log.jsonl'), 'utf8').trim().split('\n').filter(Boolean) } catch { /* журнала ещё нет */ }
            return res.end(JSON.stringify(lines.slice(-200).map((line) => { try { return JSON.parse(line) } catch { return null } }).filter(Boolean).reverse()))
          }
          if (rawId === 'memory') {
            if (req.method !== 'GET') {
              const body = await readBody(req)
              const text = String(body.text ?? '').trim()
              if (req.method === 'POST' && text) remember(text, 'руками')
              // PUT { id, scope } — сменить область; PUT { id, text } — поправить (пустой текст — забыть)
              if (req.method === 'PUT' && typeof body.scope === 'string') writeMemory(readMemory().map((item) => item.id === body.id ? { ...item, scope: body.scope as string } : item))
              else if (req.method === 'PUT') writeMemory(text ? readMemory().map((item) => item.id === body.id ? { ...item, text } : item) : readMemory().filter((item) => item.id !== body.id))
              if (req.method === 'DELETE') writeMemory(readMemory().filter((item) => item.id !== body.id))
            }
            return res.end(JSON.stringify(readMemory()))
          }
          if (rawId === 'style') {
            // GET — активный, готовые и свои; PUT { active } — выбрать; POST { name, text } — создать свой (и выбрать, если select);
            // DELETE { id } — удалить свой (активный удалён — снова «Обычно»)
            if (req.method !== 'GET') {
              const body = await readBody(req)
              const state = readStyle()
              if (req.method === 'PUT' && typeof body.active === 'string' && [...stylePresets, ...state.custom].some((item) => item.id === body.active)) writeStyle({ ...state, active: body.active })
              // PUT { id, text } — править текст стиля (у готового — своя версия поверх нашей, у своего — на месте); { id, reset } — вернуть наш текст
              if (req.method === 'PUT' && typeof body.id === 'string') {
                const id = body.id
                if (stylePresets.some((item) => item.id === id) && id !== 'plain') {
                  const overrides = { ...state.overrides }
                  if (body.reset) delete overrides[id]; else if (typeof body.text === 'string' && body.text.trim()) overrides[id] = body.text.trim().slice(0, 4000)
                  writeStyle({ ...state, overrides })
                } else if (state.custom.some((item) => item.id === id) && typeof body.text === 'string' && body.text.trim()) {
                  writeStyle({ ...state, custom: state.custom.map((item) => item.id === id ? { ...item, text: String(body.text).trim().slice(0, 4000) } : item) })
                }
              }
              if (req.method === 'POST') {
                const name = String(body.name ?? '').trim().slice(0, 60), text = String(body.text ?? '').trim().slice(0, 2000)
                if (name && text) { const id = `s-${Date.now()}`; writeStyle({ ...state, active: body.select ? id : state.active, custom: [...state.custom, { id, name, text }] }) }
              }
              if (req.method === 'DELETE') writeStyle({ ...state, active: state.active === body.id ? 'plain' : state.active, custom: state.custom.filter((item) => item.id !== body.id) })
            }
            return res.end(JSON.stringify(styleState()))
          }
          if (rawId === 'order') {
            const file = join(libraryDir, 'order.json')
            if (req.method === 'PUT') {
              const order = (await readBody(req)).order
              if (Array.isArray(order)) writeFileSync(file, JSON.stringify(order.map(String), null, 2) + '\n')
            }
            return res.end(existsSync(file) ? readFileSync(file, 'utf8') : '[]')
          }
          // Авторские подборки (прожарка grill-authored-collections.md): собираются руками, агент их не видит — поэтому
          // отдельный файл library/boards.json, а не collections.json. У элемента — boards: string[].
          // GET — список, POST { name } — создать, PUT { from, to } — переименовать (и в элементах),
          // DELETE { name } — удалить (элементы остаются, из них пропадает подборка)
          // Папки: GET — список; POST { name, parent } — новая; PUT { id, name?, description?, parent?, icon? } — правка;
          // DELETE { id } — удалить, её материалы и вложенные папки уходят в родителя (или во «Входящие»). Входящие — не трогать
          if (rawId === 'folders') {
            const folders = readFolders()
            if (req.method === 'POST') {
              const body = await readBody(req)
              if (body.suggest) {
                try { return res.end(JSON.stringify({ name: await nameFolder(String(body.id ?? '')) })) }
                catch (error) { res.statusCode = 500; return res.end(JSON.stringify({ error: (error as Error).message })) }
              }
              const name = String(body.name ?? '').trim()
              if (!name) { res.statusCode = 400; return res.end(JSON.stringify({ error: t('Пустое название') })) }
              const folder: Folder = { id: `f-${Date.now()}`, name, ...(body.parent ? { parent: String(body.parent) } : {}) }
              writeFolders([...folders, folder])
              return res.end(JSON.stringify({ folders: readFolders(), id: folder.id }))
            }
            if (req.method === 'PUT') {
              const body = await readBody(req)
              const target = folders.find((folder) => folder.id === body.id)
              if (!target) { res.statusCode = 404; return res.end(JSON.stringify({ error: t('Нет такой папки') })) }
              if (target.inbox && (body.name !== undefined || body.parent !== undefined)) { res.statusCode = 400; return res.end(JSON.stringify({ error: t('Входящие не переименовать и не переместить') })) }
              // Папку нельзя вложить в саму себя или в свою вложенную
              const inside = (id: string | undefined): boolean => !!id && (id === target.id || inside(folders.find((folder) => folder.id === id)?.parent))
              if (body.parent && inside(String(body.parent))) { res.statusCode = 400; return res.end(JSON.stringify({ error: t('Папку не вложить в саму себя') })) }
              // Порядок и уровень: move { parent, after } — встать в parent (пусто — верхний уровень) сразу после соседа after (пусто — первой).
              // Порядок соседей — порядок в файле, поэтому достаточно поставить папку в нужное место массива
              if (body.move && typeof body.move === 'object') {
                const move = body.move as { parent?: string | null; after?: string | null }
                const parent = move.parent ? String(move.parent) : undefined
                if (target.inbox || (parent && inside(parent))) { res.statusCode = 400; return res.end(JSON.stringify({ error: t('Так папку не переставить') })) }
                const rest = folders.filter((folder) => folder.id !== target.id)
                const { parent: _old, ...base } = target
                const moved: Folder = { ...base, ...(parent ? { parent } : {}) }
                const after = move.after ? rest.findIndex((folder) => folder.id === String(move.after)) : -1
                // Первой среди соседей — перед первым из них; соседей нет — в конец
                const first = rest.findIndex((folder) => folder.parent === parent && !folder.inbox)
                rest.splice(after >= 0 ? after + 1 : first >= 0 ? first : rest.length, 0, moved)
                writeFolders(rest)
                return res.end(JSON.stringify({ folders: readFolders() }))
              }
              writeFolders(folders.map((folder) => folder.id !== target.id ? folder : {
                ...folder,
                ...(typeof body.name === 'string' && body.name.trim() ? { name: body.name.trim() } : {}),
                ...(typeof body.description === 'string' ? { description: body.description.trim() || undefined } : {}),
                // Иконка — эмодзи; пустая строка возвращает папку по умолчанию. Короткая строка: эмодзи с модификаторами занимают до ~12 знаков. У «Входящих» своя иконка
                ...(typeof body.icon === 'string' && !target.inbox && body.icon.length <= 16 ? { icon: body.icon.trim() || undefined } : {}),
                ...(body.parent !== undefined ? { parent: body.parent ? String(body.parent) : undefined } : {}),
              }))
            }
            if (req.method === 'DELETE') {
              const body = await readBody(req)
              const target = folders.find((folder) => folder.id === body.id)
              if (!target || target.inbox) { res.statusCode = 400; return res.end(JSON.stringify({ error: t('Эту папку не удалить') })) }
              const to = target.parent ?? inboxId()
              writeFolders(folders.filter((folder) => folder.id !== target.id).map((folder) => folder.parent === target.id ? { ...folder, parent: target.parent } : folder))
              for (const item of list()) if (item.folder === target.id) writeMeta({ ...item, folder: to })
            }
            return res.end(JSON.stringify({ folders: readFolders() }))
          }
          if (rawId === 'boards') {
            if (req.method === 'POST') {
              const name = String((await readBody(req)).name ?? '').trim()
              if (!name) { res.statusCode = 400; return res.end(JSON.stringify({ error: t('Пустое название') })) }
              if (!rawBoards().some((board) => board.name.toLowerCase() === name.toLowerCase())) writeBoards([...rawBoards(), { name }])
            }
            if (req.method === 'PUT') {
              const body = await readBody(req)
              // PUT { name, order } — свой порядок карточек в подборке (перетаскивание в её ленте, полка)
              if (Array.isArray(body.order)) {
                writeBoards(rawBoards().map((board) => board.name === body.name ? { ...board, order: (body.order as unknown[]).map(String) } : board))
                if (rawBoards().find((board) => board.name === body.name)?.shelf) syncShelf()
                return res.end(JSON.stringify(readBoards()))
              }
              // PUT { name, description } — описание подборки в её шапке (v2, «подборка как место»); пустое — убрать
              if (typeof body.description === 'string') {
                const description = body.description.trim()
                writeBoards(rawBoards().map((board) => board.name === body.name ? { ...board, description: description || undefined } : board))
                return res.end(JSON.stringify(readBoards()))
              }
              const from = String(body.from ?? '')
              // Полку не переименовать и не удалить: это место над лентой, а не обычная подборка
              if (rawBoards().find((board) => board.name === from && (board.shelf || board.inbox))) { res.statusCode = 400; return res.end(JSON.stringify({ error: t('Эту подборку не переименовать') })) }
              const to = String(body.to ?? '').trim()
              const taken = readBoards().some((board) => board.name.toLowerCase() === to.toLowerCase() && board.name !== from)
              if (!to || taken) { res.statusCode = 400; return res.end(JSON.stringify({ error: taken ? 'Такая подборка уже есть' : 'Пустое название' })) }
              writeBoards(rawBoards().map((board) => board.name === from ? { ...board, name: to } : board))
              for (const item of list()) if ((item.boards as string[] | undefined)?.includes(from)) writeMeta({ ...item, boards: (item.boards as string[]).map((board) => board === from ? to : board) })
            }
            if (req.method === 'DELETE') {
              const name = String((await readBody(req)).name ?? '')
              if (rawBoards().find((board) => board.name === name && (board.shelf || board.inbox))) { res.statusCode = 400; return res.end(JSON.stringify({ error: t('Эту подборку не удалить') })) }
              writeBoards(rawBoards().filter((board) => board.name !== name))
              for (const item of list()) if ((item.boards as string[] | undefined)?.includes(name)) writeMeta({ ...item, boards: (item.boards as string[]).filter((board) => board !== name) })
            }
            return res.end(JSON.stringify(readBoards()))
          }
          // Разобрать полку вместе: { ids } → новая заметка, синтез пишется в фоне
          // Открыть полку — её заметка (заведётся или обновит состав)
          // Корзина: GET — удалённые (новые сверху, с превью из корзины); POST { name } — вернуть; DELETE — очистить насовсем
          if (rawId === 'trash') {
            const trashDir = join(libraryDir, '.trash')
            if (req.method === 'GET') {
              const items = existsSync(trashDir) ? readdirSync(trashDir).filter((name) => existsSync(join(trashDir, name, 'meta.json'))).map((name) => {
                const meta = JSON.parse(readFileSync(join(trashDir, name, 'meta.json'), 'utf8')) as Meta
                // Превью — только свой файл; ссылка на страницу вместо картинки (старые записи) — плитка названием
                const image = typeof meta.image === 'string' && meta.image.startsWith(`/library/${meta.id}/`) ? meta.image.replace(`/library/${meta.id}/`, `/library/.trash/${name}/`) : ''
                return { ...meta, image, trashName: name, deletedAt: Number(name.split('-').pop()) || 0 }
              }).sort((a, b) => b.deletedAt - a.deletedAt) : []
              return res.end(JSON.stringify(items))
            }
            if (req.method === 'POST') {
              const name = String((await readBody(req)).name ?? '')
              const from = join(trashDir, name)
              if (!name || name.includes('/') || !existsSync(join(from, 'meta.json'))) { res.statusCode = 404; return res.end(JSON.stringify({ error: t('Нет в корзине') })) }
              const id = String(JSON.parse(readFileSync(join(from, 'meta.json'), 'utf8')).id)
              if (existsSync(join(libraryDir, id))) { res.statusCode = 409; return res.end(JSON.stringify({ error: t('Карточка с таким id уже есть') })) }
              renameSync(from, join(libraryDir, id))
              scheduleIndex()
              return res.end(JSON.stringify(readMeta(id)))
            }
            if (req.method === 'DELETE') { rmSync(trashDir, { recursive: true, force: true }); return res.end(JSON.stringify({ ok: true })) }
          }
          if (req.method === 'POST' && rawId === 'shelf') return res.end(JSON.stringify(openShelf()))
          // Общий агент: GET — состояние (+ ход работы); POST action — ask / apply / reject / undo / conversation / stop
          if (rawId === 'agent') {
            if (req.method === 'GET') return res.end(JSON.stringify({ ...readAgent(), progress: progress.get('agent') }))
            const body = await readBody(req)
            const act = String(body.action ?? '')
            if (act === 'ask') {
              const command = String(body.command ?? '').trim()
              const state = readAgent()
              const web: Web = body.web === 'yes' || body.web === 'no' ? body.web : 'ask'
              // Ответ на «Поискать в сети?» — вопрос из ленты убираем сразу
              const thread = web !== 'ask' && state.thread.at(-1)?.webAsk ? state.thread.slice(0, -1) : state.thread
              // «actions» — не карточка, а контекст страницы Actions: агент предлагает новый Action
              const focus = Array.isArray(body.ids) ? body.ids.map(String).filter((id) => id === 'actions' || id === 'memory' || existsSync(metaPath(safeId(id)))).slice(0, 30) : []
              if (command && !state.asking) { writeAgent({ ...state, thread, asking: true, askError: undefined }); setRunAction('agent', body.actionId); void agentAsk(command, web, focus) }
            }
            // «Запомнить: …?» под ответом общего агента: accept — в память, иначе предложение снимается
            if (act === 'remember') {
              const state = readAgent()
              const turn = state.thread.find((item) => item.at === body.at)
              if (turn?.remember) { if (body.accept) { remember(turn.remember, 'агент библиотеки', 'app'); turn.remembered = turn.remember } turn.remember = undefined; writeAgent(state) }
            }
            if (act === 'make-action') {
              const state = readAgent()
              const turn = state.thread.find((item) => item.at === body.at)
              if (turn?.makeAction) { if (body.accept) { makeAction(turn.makeAction, turn.makeActionName); turn.madeAction = turn.makeAction } turn.makeAction = undefined; writeAgent(state) }
            }
            if (act === 'save-note') {
              const turn = readAgent().thread.find((item) => item.at === body.at)
              if (turn) answerNote('agent', turn)
            }
            if (act === 'save-found') {
              const found = readAgent().thread.find((turn) => turn.at === body.at)?.found?.[Number(body.index)]
              if (found) addFound('agent', found)
            }
            if (act === 'apply' || act === 'reject' || act === 'undo') agentApply(Number(body.at), Array.isArray(body.ids) ? body.ids.map(String) : undefined, act)
            if (act === 'conversation') {
              const state = readAgent()
              const last = Math.max(0, ...state.thread.map((turn) => turn.conversation ?? 0))
              const own = state.thread.some((turn) => (turn.conversation ?? 0) === state.conversation)
              if (!state.asking) writeAgent({ ...state, conversation: typeof body.to === 'number' ? body.to : own ? last + 1 : state.conversation })
            }
            if (act === 'stop') {
              running.get('agent')?.abort()
              // Сразу снимаем «работаю»: процесс завершается не мгновенно, а если его уже нет (перезапуск сервера) — иначе панель зависла бы навсегда
              const state = readAgent()
              if (state.asking) writeAgent({ ...state, asking: false, askError: undefined })
            }
            return res.end(JSON.stringify(readAgent()))
          }
          if (req.method === 'POST' && rawId === 'synthesize') {
            const body = await readBody(req)
            const ids = body.ids
            if (!Array.isArray(ids) || ids.length < 2) { res.statusCode = 400; return res.end(JSON.stringify({ error: t('Нужно хотя бы две карточки') })) }
            return res.end(JSON.stringify(synthesize(ids.map(String), String(body.question ?? '').trim())))
          }
          // Ссылка: реф заводится сразу пустым (fetching), содержимое сервер достаёт в фоне.
          // Граф понятий: GET — состояние; POST { op: 'build' | 'rebuild' | 'stop' | 'report' | 'tag' }. Модель — только по кнопке
          if (rawId === 'graph') {
            if (req.method === 'POST') {
              const body = await readBody(req)
              if (body.op === 'build' || body.op === 'rebuild') void graphBuild(body.op === 'rebuild')
              else if (body.op === 'report') void graphReport()
              else if (body.op === 'stop') graphRun.controller?.abort()
              else if (body.op === 'export') { try { graphExport() } catch { res.statusCode = 500; return res.end(JSON.stringify({ error: t('Не получилось записать') })) } }
              else if (body.op === 'note') {
                // Находки → заметка (как ответ агента → заметка): лежит во «Входящих», название задано, теги раскладывает сортировка
                const text = readGraph().report?.text
                if (!text) { res.statusCode = 400; return res.end(JSON.stringify({ error: t('Отчёта ещё нет') })) }
                const note = addNote(text, { via: 'graph' })
                writeMeta({ ...readMeta(note.id), title: t('Находки по графу'), titleEdited: true })
                return res.end(JSON.stringify({ ...graphState(), noteId: note.id }))
              }
              else if (body.op === 'tag') {
                const name = String(body.name ?? '').trim()
                if (!name) { res.statusCode = 400; return res.end(JSON.stringify({ error: t('Пустое название') })) }
                return res.end(JSON.stringify(graphTag(name, Array.isArray(body.ids) ? body.ids.map(String) : [])))
              }
              await new Promise((resolve) => setTimeout(resolve, 50)) // build/report успевают выставить состояние «идёт»
            }
            return res.end(JSON.stringify(graphState()))
          }
          // Расширение: GET /clip-key только с localhost-страницы Refkit показывает ключ для привязки; POST /clip — приём страницы
          if (rawId === 'clip-key' && req.method === 'GET') {
            // Ключ показываем только странице самого Refkit: без заголовков браузера (локальный процесс) и с чужого сайта не отдаём
            if (req.headers['sec-fetch-site'] !== 'same-origin') { res.statusCode = 403; return res.end(JSON.stringify({ error: 'Only the Refkit page may read the key' })) }
            return res.end(JSON.stringify({ key: clipKey() }))
          }
          const keyOk = () => {
            const given = Buffer.from(String(req.headers['x-refkit-key'] ?? ''))
            const real = Buffer.from(clipKey())
            return given.length === real.length && timingSafeEqual(given, real)
          }
          // Collect (grill-collect-tabs.md): пачка — все вкладки, собранные за один раз. Материалы падают во «Входящие» с меткой
          // batch/batchSource, папки не заводим: лента «Входящих» показывает пачку заголовком. Без id — завёл пачку (id, имя источника);
          // с id — посчитал, сколько реально легло (уже разложенные по папкам страницы сюда не попадают)
          if (rawId === 'batch' && req.method === 'POST') {
            if (!keyOk()) { res.statusCode = 401; return res.end(JSON.stringify({ error: t('Неверный ключ') })) }
            const body = await readBody(req)
            if (typeof body.id === 'string') {
              const collected = Number(body.collected) || 0
              const inside = list().filter((meta) => meta.batch === body.id).length
              return res.end(JSON.stringify({ ok: true, inside, already: Math.max(0, collected - inside) }))
            }
            const source = String(body.source ?? '').trim().slice(0, 30) || 'Chrome'
            return res.end(JSON.stringify({ id: `b-${Date.now()}`, source, inbox: inboxId() }))
          }
          if (rawId === 'clip' && req.method === 'POST') {
            if (!keyOk()) { res.statusCode = 401; return res.end(JSON.stringify({ error: t('Неверный ключ') })) }
            const body = await readBody(req)
            if (!/^https?:\/\//.test(String(body.url ?? ''))) { res.statusCode = 400; return res.end(JSON.stringify({ error: t('Это не ссылка') })) }
            // Collect: страница уже в библиотеке — не заводим дубль. Лежит во «Входящих» неразобранной — отмечаем её частью
            // этой пачки; уже разложенную по папкам не трогаем
            if (typeof body.batch === 'string') {
              const existing = list().find((meta) => meta.source && linkKey(String(meta.source)) === linkKey(String(body.url)))
              if (existing) {
                if ((existing.folder ?? inboxId()) === inboxId()) writeMeta({ ...readMeta(existing.id), batch: body.batch, batchSource: String(body.batchSource ?? '') })
                return res.end(JSON.stringify(readMeta(existing.id)))
              }
            }
            // Ролики и музыка: сервер разбирает их лучше текста страницы (плеер, субтитры, oEmbed) — отдаём ссылку его пути
            const host = new URL(String(body.url)).hostname
            if (youtubeHost.test(host) || pinterestHost.test(host) || oembedHosts.some(([pattern]) => pattern.test(host))) return res.end(JSON.stringify(addLink(String(body.url), { via: 'extension', ...pickAddFields(body) })))
            return res.end(JSON.stringify(await addClip(body)))
          }
          // Холст: POST — создать пустой, GET/PUT /canvas/<id> — доска целиком (узлы и стрелки);
          // POST /canvas/<id>/run | stop | save { node } — запуск агентной ноды, остановка, результат в библиотеку
          if (rawId === 'canvas') {
            if (req.method === 'POST' && !action) { const body = await readBody(req); return res.end(JSON.stringify(addCanvas({ via: 'hand', ...pickAddFields(body), ...(typeof body.title === 'string' && body.title.trim() ? { title: body.title.trim().slice(0, 80) } : {}) }))) } // title — имя от шаблона: холст сразу называется по делу
            const target = safeId(action)
            if (!target || !existsSync(metaPath(target)) || readMeta(target).kind !== 'canvas') { res.statusCode = 404; return res.end(JSON.stringify({ error: t('Холста нет') })) }
            if (sub) {
              const body = await readBody(req)
              const nodeId = String(body.node ?? '')
              // Плитка просит пересъёмку превью, если картинки нет или она старше правки (старые холсты догоняются по мере показа)
              if (sub === 'memory') {
                // Память холста: { op: 'get' | 'rule-add' | 'rule-edit' | 'rule-remove' | 'ref-add' | 'ref-remove' | 'decision-remove' }
                const memory = readCanvasMemory(target)
                const op = String(body.op ?? 'get')
                const text = String(body.text ?? '').trim().slice(0, 400)
                if (op === 'rule-add' && text) memory.rules.push({ id: `r-${Date.now()}`, text, at: Date.now() })
                if (op === 'rule-edit' && text) memory.rules = memory.rules.map((rule) => rule.id === body.id ? { ...rule, text } : rule)
                if (op === 'rule-remove') memory.rules = memory.rules.filter((rule) => rule.id !== body.id)
                if (op === 'ref-add' && nodeId && !memory.refs.some((ref) => ref.node === nodeId)) {
                  const node = canvasNode(readCanvas(target), nodeId)
                  if (node) memory.refs.push({ node: nodeId, title: String((node.data as Record<string, unknown> | undefined)?.title ?? (node.data as Record<string, unknown> | undefined)?.label ?? node.type), at: Date.now() })
                }
                if (op === 'ref-remove') memory.refs = memory.refs.filter((ref) => ref.node !== nodeId)
                if (op === 'ref-add' && memory.refs.some((ref) => ref.node === nodeId)) memory.decisions.push({ id: `d-${Date.now()}`, text: `${t('Закрепил образец')}: «${memory.refs.find((ref) => ref.node === nodeId)!.title}»`, at: Date.now() })
                if (op === 'decision-remove') memory.decisions = memory.decisions.filter((item) => item.id !== body.id)
                if (op !== 'get') writeCanvasMemory(target, memory)
                return res.end(JSON.stringify({ ...memory, decisions: [...memory.decisions].reverse() }))
              }
              if (sub === 'thumb') { scheduleThumb(target); return res.end(JSON.stringify({ ok: true })) }
              if (sub === 'proposal') {
                // Предложение агента (MCP): принять — применить правки к доске одним шагом; отклонить — просто убрать
                const data = readCanvas(target)
                const proposal = (data.proposals ?? []).find((item) => item.id === String(body.proposal))
                if (!proposal) { res.statusCode = 404; return res.end(JSON.stringify({ error: t('Такого предложения уже нет') })) }
                const rest = (data.proposals ?? []).filter((item) => item.id !== proposal.id)
                if (body.action === 'accept') {
                  const applied = applyOps(data, proposal.ops)
                  if (applied.error) { res.statusCode = 400; return res.end(JSON.stringify({ error: applied.error })) }
                  writeCanvas(target, { ...applied.data, rev: (data.rev ?? 0) + 1, proposals: rest })
                  logDecision(target, `${t('Принял предложение агента')}: ${String((proposal as { note?: string }).note ?? '').slice(0, 120) || proposal.id}`)
                } else { writeCanvas(target, { ...data, proposals: rest }); logDecision(target, `${t('Отклонил предложение агента')}: ${String((proposal as { note?: string }).note ?? '').slice(0, 120) || proposal.id}`) }
                return res.end(JSON.stringify(canvasView(target)))
              }
              if (sub === 'run') {
                const mode = String(body.mode ?? 'node')
                if (mode === 'all' || mode === 'downstream' || mode === 'after') void runCanvasPlan(target, mode, nodeId)
                else if (mode === 'node') void runWithReview(target, nodeId)
                else void runCanvasNode(target, nodeId, mode === 'edit', mode === 'item' && Number.isInteger(body.item) ? Number(body.item) : undefined, mode === 'refine' && typeof body.text === 'string' ? body.text.slice(0, 400) : undefined)
                return res.end(JSON.stringify({ ok: true }))
              }
              if (sub === 'prompt') {
                const node = canvasNode(readCanvas(target), nodeId)
                if (!node || !AGENT_TYPES.includes(String(node.type))) { res.statusCode = 404; return res.end(JSON.stringify({ error: t('Такой ноды нет') })) }
                const pack = canvasPackage(readCanvas(target), node)
                return res.end(JSON.stringify({ prompt: canvasPrompt(node, pack, target), images: [...pack.images, ...screenShots(pack)].map((file) => file.split('/').slice(-2).join('/')), model: modelFor(nodeModelKey(node)).label }))
              }
              if (sub === 'stop') {
                if (nodeId === 'all') { const plan = canvasPlans.get(target); if (plan) plan.cancelled = true; for (const [key, controller] of canvasRuns) if (key.startsWith(`${target}:`)) controller.abort() }
                else canvasRuns.get(`${target}:${nodeId}`)?.abort()
                recoverCanvasRuns(target)
                return res.end(JSON.stringify({ ok: true }))
              }
              if (sub === 'result') {
                // Владелец правит текстовый результат руками: прежний текст уходит в историю версий, как после запуска
                const node = canvasNode(readCanvas(target), nodeId)
                const text = String(body.result ?? '').trim()
                if (!node || node.type !== 'agent') { res.statusCode = 404; return res.end(JSON.stringify({ error: t('Такой текстовой ноды нет') })) }
                if (!text) { res.statusCode = 400; return res.end(JSON.stringify({ error: t('Пустой текст не сохраняю') })) }
                const before = node.data ?? {}
                if (text === String(before.result ?? '').trim()) return res.end(JSON.stringify({ ok: true }))
                const past = (before.history ?? []) as Array<Record<string, unknown>>
                const history = before.result ? [...past, { result: before.result, ranAt: before.ranAt, ranHash: before.ranHash, usage: before.usage }].slice(-8) : past
                patchCanvasNode(target, nodeId, { result: text, history, status: 'ready', error: undefined, ranAt: Date.now() })
                return res.end(JSON.stringify({ ok: true }))
              }
              if (sub === 'edit-text') {
                // Правка текста руками на экране (2026-10-29): строка заменяется в исходнике и в собранной странице без агента; прежняя версия уходит в историю
                try {
                  const node = canvasNode(readCanvas(target), nodeId)
                  const before = (node?.data ?? {}) as Record<string, unknown>
                  const source = before.screenSource as { code?: string } | undefined
                  if (!node || node.type !== 'screen' || !source?.code || !before.result) throw new Error(t('У этого экрана нет исходника: запусти ноду заново'))
                  const squash = (value: unknown) => String(value ?? '').replace(/\s+/g, ' ').trim()
                  const from = squash(body.from), to = squash(body.to)
                  if (!from || !to) throw new Error(t('Пустой текст не сохраняю'))
                  if (/[`\\<>&$]/.test(to)) throw new Error(t('В тексте нельзя использовать угловые скобки, амперсанд, доллар, обратный апостроф и обратную косую'))
                  const code = String(source.code), result = String(before.result)
                  const inCode = code.split(from).length - 1
                  if (inCode !== 1) throw new Error(inCode ? t('Этот текст встречается в коде {n} раз: поправь комментарием', { n: inCode }) : t('Не нашёл этот текст в коде: поправь комментарием'))
                  const esc = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
                  const inPage = result.split(esc(from)).length - 1
                  if (inPage !== 1) throw new Error(t('Не нашёл этот текст в собранной странице: поправь комментарием'))
                  const past = (before.history ?? []) as Array<Record<string, unknown>>
                  const history = [...past, { result: before.result, screenSource: before.screenSource, ranAt: before.ranAt, ranHash: before.ranHash, usage: before.usage }].slice(-8)
                  patchCanvasNode(target, nodeId, { screenSource: { ...(before.screenSource as object), code: code.split(from).join(to) }, result: result.split(esc(from)).join(esc(to)), history, ranAt: Date.now() })
                  logDecision(target, `${t('Правка текста')}: «${from}» → «${to}»`)
                  return res.end(JSON.stringify({ ok: true }))
                } catch (error) { res.statusCode = 400; return res.end(JSON.stringify({ error: (error as Error).message })) }
              }
              if (sub === 'journal') return res.end(JSON.stringify({ entries: listEntries(readJournal(target), readCanvas(target).nodes) }))
              if (sub === 'unjournal') {
                try { return res.end(JSON.stringify({ ok: true, ...restoreRun(target, nodeId, Number(body.at)) })) }
                catch (error) { res.statusCode = 400; return res.end(JSON.stringify({ error: (error as Error).message })) }
              }
              // PDF экрана (презентация: страница на слайд): внутренний документ достаём из srcdoc внешней страницы и печатаем в Chrome
              if (sub === 'pdf') {
                try {
                  const node = canvasNode(readCanvas(target), nodeId)
                  const outer = String(node?.data ? activeData(node).result ?? '' : '')
                  const raw = outer.match(/srcdoc="([^"]*)"/)?.[1]
                  if (!node || node.type !== 'screen' || !raw) throw new Error(t('У ноды нет страницы для PDF'))
                  const inner = raw.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&')
                  const cwd = isolated('pdf')
                  writeFileSync(join(cwd, 'inner.html'), inner)
                  printPdf(join(cwd, 'inner.html'), join(cwd, 'out.pdf'))
                  res.setHeader('content-type', 'application/pdf')
                  return res.end(readFileSync(join(cwd, 'out.pdf')))
                } catch (error) { res.statusCode = 400; res.setHeader('content-type', 'application/json'); return res.end(JSON.stringify({ error: (error as Error).message })) }
              }
              if (sub === 'activate') {
                try { activateCanvasVersion(target, nodeId, Number(body.index)); return res.end(JSON.stringify({ ok: true })) }
                catch (error) { res.statusCode = 400; return res.end(JSON.stringify({ error: (error as Error).message })) }
              }
              if (sub === 'restore') {
                try { restoreCanvasVersion(target, nodeId, Number(body.index)); return res.end(JSON.stringify({ ok: true })) }
                catch (error) { res.statusCode = 400; return res.end(JSON.stringify({ error: (error as Error).message })) }
              }
              if (sub === 'export') {
                // Результат ноды файлом внутри папки холста — «Скопировать для агента» отдаёт путь, а не весь HTML в чат
                const node = canvasNode(readCanvas(target), nodeId)
                if (!node?.data?.result) { res.statusCode = 400; return res.end(JSON.stringify({ error: t('Экспортировать нечего') })) }
                const dir = join(libraryDir, target, 'export')
                mkdirSync(dir, { recursive: true })
                const file = join(dir, `${nodeId.replace(/[^\w-]/g, '')}.${node.type === 'screen' ? 'html' : 'md'}`)
                writeFileSync(file, String(node.data.result))
                const source = node.type === 'screen' && node.data.screenSource
                const sourcePath = source ? file.replace(/\.html$/, '.tsx') : undefined
                if (sourcePath) writeFileSync(sourcePath, String(source.code))
                return res.end(JSON.stringify({ path: file, size: String(node.data.result).length, sourcePath }))
              }
              if (sub === 'save') {
                try { return res.end(JSON.stringify(canvasNoteFromNode(target, nodeId))) }
                catch (error) { res.statusCode = 400; return res.end(JSON.stringify({ error: (error as Error).message })) }
              }
              res.statusCode = 404; return res.end(JSON.stringify({ error: t('Нет такого действия') }))
            }
            if (req.method === 'PUT') {
              const body = await readBody(req)
              const disk = readCanvas(target)
              if (body.rev !== undefined && Number(body.rev) !== disk.rev) { res.statusCode = 409; return res.end(JSON.stringify({ error: 'stale', rev: disk.rev })) }
              writeCanvas(target, { ...mergeCanvas(target, { nodes: Array.isArray(body.nodes) ? body.nodes as CanvasData['nodes'] : [], edges: Array.isArray(body.edges) ? body.edges as CanvasData['edges'] : [] }), rev: (disk.rev ?? 0) + 1, proposals: disk.proposals })
            }
            return res.end(JSON.stringify(canvasView(target)))
          }
          // Заметка от руки: текст — и есть материал (как в «⋮ → Заметка»); поля окна добавления (папка, теги) — как у ссылки
          if (req.method === 'POST' && rawId === 'note') {
            const body = await readBody(req)
            const text = String(body.text ?? '').trim()
            if (!text) { res.statusCode = 400; return res.end(JSON.stringify({ error: t('Пустая заметка') })) }
            return res.end(JSON.stringify(addNote(text, { via: 'hand', ...pickAddFields(body) })))
          }
          if (req.method === 'POST' && rawId === 'link') {
            const body = await readBody(req)
            const link = String(body.url ?? '')
            if (!/^https?:\/\//.test(link)) { res.statusCode = 400; return res.end(JSON.stringify({ error: t('Это не ссылка') })) }
            // Та же ссылка уже есть. Интерфейс предупреждает до сохранения; сюда без force попадает только ⌘V мимо окна
            // (Telegram, MCP) — возвращаем старую, а не заводим второй элемент. С force — владелец сказал «всё равно добавить»:
            // заводим новую с пометкой dupOf (плитка подписана «Дубль»)
            const existing = list().find((meta) => meta.source && linkKey(String(meta.source)) === linkKey(link))
            if (existing && !body.force) return res.end(JSON.stringify(existing))
            return res.end(JSON.stringify(addLink(link, { via: 'paste', ...pickAddFields(body), ...(existing ? { dupOf: existing.id } : {}) })))
          }
          if (req.method === 'POST' && !id) {
            const { image, video, ...fields } = await readBody(req)
            return res.end(JSON.stringify(addImage(String(image), video ? String(video) : undefined, fields)))
          }
          if (!id || !existsSync(metaPath(id))) { res.statusCode = 404; return res.end(JSON.stringify({ error: t('Нет такого рефа') })) }
          if (req.method === 'GET' && action === 'prompt') return res.end(JSON.stringify({ prompt: prompt(readMeta(id)) }))
          if (req.method === 'PUT') {
            // Файлы и служебные поля правкой не меняются.
            const { id: _id, createdAt: _createdAt, image: _image, video: _video, ...patch } = await readBody(req)
            const current = readMeta(id)
            const meta = { ...current, ...patch, ...(patch.title !== undefined && patch.title !== current.title ? { titleEdited: true } : {}) , updatedAt: Date.now() } // updatedAt — сортировка «Изменено» (v2): только правки владельца
            writeMeta(meta)
            // Полка — подборка «Под рукой»: состав поменялся — заметка полки за ним
            const onShelf = (item: Meta) => ((item.boards as string[] | undefined) ?? []).includes(shelfName)
            if ('boards' in patch && onShelf(current) !== onShelf(meta)) syncShelf()
            return res.end(JSON.stringify(meta))
          }
          // Комментарии: POST { op: 'add', text } | { op: 'edit', id, text } | { op: 'remove', id } — лента владельца; агент молчит
          if (req.method === 'POST' && action === 'comments') {
            const body = await readBody(req)
            const meta = readMeta(id)
            const text = typeof body.text === 'string' ? body.text.trim().slice(0, 4000) : ''
            let list = commentsOf(meta)
            const spot = (value: unknown) => typeof value === 'number' && value >= 0 && value <= 1 ? Math.round(value * 1000) / 1000 : undefined
            const pin = spot(body.x) !== undefined && spot(body.y) !== undefined ? { x: spot(body.x), y: spot(body.y) } : {}
            if (body.op === 'add' && text) list = [...list, { id: `c${Date.now()}`, text, at: Date.now(), ...pin }]
            else if (body.op === 'edit' && text) list = list.map((item) => item.id === body.id ? { ...item, text, editedAt: Date.now() } : item)
            else if (body.op === 'remove') list = list.filter((item) => item.id !== body.id)
            else { res.statusCode = 400; return res.end(JSON.stringify({ error: t('Пустой комментарий или неизвестная операция') })) }
            const next = { ...meta, comments: list, marks: undefined, meaning: list[0]?.text ?? '', updatedAt: Date.now() } // метки уже в ленте
            writeMeta(next)
            return res.end(JSON.stringify(next))
          }
          if (req.method === 'POST' && action === 'convert') {
            const meta = readMeta(id)
            const { feedback = '' } = await readBody(req)
            if (!meta.converting) { writeMeta({ ...meta, converting: true, convertError: undefined }); void convert(id, String(feedback)) }
            return res.end(JSON.stringify(readMeta(id)))
          }
          if (req.method === 'POST' && action === 'ask') {
            const body = await readBody(req)
            const command = String(body.command ?? '').trim()
            const meta = readMeta(id)
            if (!command) { res.statusCode = 400; return res.end(JSON.stringify({ error: t('Пустая просьба') })) }
            const cards = Array.isArray(body.cards) ? body.cards.map(String) : []
            const files = Array.isArray(body.files) ? (body.files as Attachment[]).filter((file) => typeof file?.data === 'string') : []
            const web: Web = body.web === 'yes' || body.web === 'no' ? body.web : 'ask'
            // Ответ на «Поискать в сети?» — вопрос из ленты убираем сразу, просьба уходит заново с его карточками
            const thread = threadOf(meta)
            const question = web !== 'ask' && thread.at(-1)?.webAsk ? thread.at(-1) : undefined
            if (!meta.asking) { writeMeta({ ...meta, thread: question ? thread.slice(0, -1) : thread, asking: true, askError: undefined }); setRunAction(id, body.actionId); void ask(id, command, cards.length ? cards : question?.cards ?? [], files, web) }
            return res.end(JSON.stringify(readMeta(id)))
          }
          // Найденное в сети → в библиотеку: { at, index } — ответ ленты и плитка в нём
          // «Запомнить: …?» под ответом в карточке: { at, accept }
          if (req.method === 'POST' && action === 'remember') {
            const body = await readBody(req)
            const meta = readMeta(id)
            const thread = threadOf(meta).map((turn) => {
              if (turn.at !== body.at || !turn.remember) return turn
              // Уточнение старой строки (дифф в ленте) — строка переписывается, второй не заводим
              if (body.accept && turn.memoryUpdate) writeMemory(readMemory().map((item) => item.text === turn.memoryUpdate ? { ...item, text: turn.remember!, at: Date.now() } : item))
              else if (body.accept) remember(turn.remember, String(meta.title), 'app')
              return { ...turn, remember: undefined, memoryUpdate: undefined, remembered: body.accept ? turn.remember : undefined }
            })
            writeMeta({ ...meta, thread })
            return res.end(JSON.stringify(readMeta(id)))
          }
          // Ответ в заметку: { at } — ответ ленты карточки
          if (req.method === 'POST' && action === 'save-note') {
            const body = await readBody(req)
            const turn = threadOf(readMeta(id)).find((item) => item.at === body.at)
            if (!turn) { res.statusCode = 404; return res.end(JSON.stringify({ error: t('Не нашлось') })) }
            return res.end(JSON.stringify(answerNote(id, turn)))
          }
          // Правка текста диффом (идея 55): { at, action: apply | reject | undo } — у ответа at
          if (req.method === 'POST' && action === 'edit') {
            const body = await readBody(req)
            const meta = readMeta(id)
            const turn = threadOf(meta).find((item) => item.at === body.at)
            const change = turn?.edit
            if (change) {
              if (body.action === 'apply' && change.status === 'pending') { applyEdit(id, change.target, change.to); change.status = 'applied' }
              else if (body.action === 'reject' && change.status === 'pending') change.status = 'rejected'
              else if (body.action === 'undo' && change.status === 'applied') { applyEdit(id, change.target, change.from); change.status = 'pending' }
              const fresh = readMeta(id)
              writeMeta({ ...fresh, thread: threadOf(fresh).map((item) => item.at === body.at ? { ...item, edit: change } : item) })
            }
            return res.end(JSON.stringify(readMeta(id)))
          }
          // Предложенный новый тег (идея 54): { accept } — в словарь и в теги карточки, иначе предложение снимается
          if (req.method === 'POST' && action === 'tag-offer') {
            const body = await readBody(req)
            const meta = readMeta(id)
            const offer = meta.tagOffer as { name: string; hint: string } | undefined
            if (offer && body.accept) {
              if (!readCollections().some((item) => item.name.toLowerCase() === offer.name.toLowerCase())) { writeCollections([...readCollections(), { name: offer.name, types: allTypes, hint: offer.hint || offer.name }]); if (!offer.hint) void describeCollection(offer.name) }
              writeMeta({ ...meta, collections: [...new Set([...collectionsOf(meta as { collections?: string[] }), offer.name])], tagOffer: undefined })
            } else writeMeta({ ...meta, tagOffer: undefined })
            return res.end(JSON.stringify(readMeta(id)))
          }
          // «Сделать действием?» под ответом в карточке: { at, accept }
          if (req.method === 'POST' && action === 'make-action') {
            const body = await readBody(req)
            const meta = readMeta(id)
            writeMeta({ ...meta, thread: threadOf(meta).map((turn) => {
              if (turn.at !== body.at || !turn.makeAction) return turn
              if (body.accept) makeAction(turn.makeAction)
              return { ...turn, makeAction: undefined, madeAction: body.accept ? turn.makeAction : undefined }
            }) })
            return res.end(JSON.stringify(readMeta(id)))
          }
          if (req.method === 'POST' && action === 'save-found') {
            const body = await readBody(req)
            const found = threadOf(readMeta(id)).find((turn) => turn.at === body.at)?.found?.[Number(body.index)]
            if (!found) { res.statusCode = 404; return res.end(JSON.stringify({ error: t('Не нашлось') })) }
            return res.end(JSON.stringify(addFound(id, found)))
          }
          // Стоп — прервать выжимку или просьбу этой карточки; в ленту ничего не пишется
          // Разговор: POST { to } — открыть прошлый; без to — новый (если в текущем уже есть ответы)
          if (req.method === 'POST' && action === 'conversation') {
            const meta = readMeta(id)
            const body = await readBody(req)
            const last = Math.max(0, ...threadOf(meta).map((turn) => turn.conversation ?? 0))
            const to = typeof body.to === 'number' ? body.to : turnsOf(meta).length ? last + 1 : conversationOf(meta)
            if (!meta.asking) writeMeta({ ...meta, conversation: to })
            return res.end(JSON.stringify(readMeta(id)))
          }
          if (req.method === 'POST' && action === 'stop') {
            running.get(id)?.abort()
            // Как у агента библиотеки: «работаю» снимаем сразу — процесс завершается не мгновенно, а может его уже нет
            const meta = readMeta(id)
            if (meta.asking || meta.digesting) writeMeta({ ...meta, asking: false, digesting: false })
            return res.end(JSON.stringify(readMeta(id)))
          }
          // Описание, просмотры и дата для роликов, добавленных до того, как мы их сохраняли — один раз при открытии карточки (yt-dlp, без модели)
          if (req.method === 'POST' && action === 'yt-info') {
            const meta = readMeta(id)
            if (meta.kind === 'youtube' && !meta.ytInfoAt) {
              try { writeMeta({ ...readMeta(id), ...ytInfo(JSON.parse(await ytDlp(['-J', '--no-playlist', String(meta.source)]))) }) }
              catch { writeMeta({ ...readMeta(id), ytInfoAt: Date.now() }) } // не вышло — не повторяем при каждом открытии
            }
            return res.end(JSON.stringify(readMeta(id)))
          }
          // Повторить загрузку ссылки, которая не открылась
          if (req.method === 'POST' && action === 'refetch') {
            const meta = readMeta(id)
            if (!meta.fetching && /^https?:\/\//.test(String(meta.source))) { writeMeta({ ...meta, fetching: true, fetchError: undefined }); void ingest(id, String(meta.source)) }
            return res.end(JSON.stringify(readMeta(id)))
          }
          if (req.method === 'POST' && action === 'name') {
            try { return res.end(JSON.stringify({ title: await nameCard(id) })) }
            catch (error) { res.statusCode = 500; return res.end(JSON.stringify({ error: (error as Error).message })) }
          }
          // «Описать» в карточке (v2): картинку описывает агент с учётом комментария владельца, остальное — через разбор
          if (req.method === 'POST' && action === 'describe') {
            const meta = readMeta(id)
            if (String(meta.image ?? '').startsWith('/library/') && !meta.kind) { if (!meta.describing) { writeMeta({ ...meta, describing: true, describeError: undefined }); void describe(id, true) } }
            else if (!meta.digesting) { writeMeta({ ...meta, digesting: true, digestError: undefined }); void digest(id) }
            return res.end(JSON.stringify(readMeta(id)))
          }
          if (req.method === 'POST' && action === 'digest') {
            const meta = readMeta(id)
            if (!meta.digesting) { writeMeta({ ...meta, digesting: true, digestError: undefined }); void digest(id) }
            return res.end(JSON.stringify(readMeta(id)))
          }
          // Счётчик открытий карточки — для эксперимента «выжимка сразу или по кнопке».
          if (req.method === 'POST' && action === 'open') {
            const meta = readMeta(id)
            writeMeta({ ...meta, opens: Number(meta.opens ?? 0) + 1, openedAt: Date.now() })
            return res.end(JSON.stringify({ ok: true }))
          }
          if (req.method === 'DELETE') {
            mkdirSync(join(libraryDir, '.trash'), { recursive: true })
            // trashName — имя записи в корзине: по нему уведомление «Отменить» возвращает карточку (POST /trash)
            const trashName = `${id}-${Date.now()}`
            renameSync(join(libraryDir, id), join(libraryDir, '.trash', trashName))
            scheduleIndex()
            return res.end(JSON.stringify({ ok: true, trashName }))
          }
          res.statusCode = 405
          res.end(JSON.stringify({ error: t('Метод не поддерживается') }))
        } catch (error) {
          res.statusCode = 500
          res.end(JSON.stringify({ error: (error as Error).message }))
        }
      })
    },
  }
}
