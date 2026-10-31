import { spawn, execFile, execFileSync } from 'node:child_process'
import { t } from './src/lib/i18n-server.ts'
import { appendFileSync, copyFileSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { extname, join } from 'node:path'

// Агенты Refkit на Codex CLI (подписка ChatGPT владельца, без API-ключа). Только дев-сервер.
// Общие инструменты: запуск агента с учётом токенов, увеличение картинки, пустая папка под шаг, скриншот HTML.
// Старый разбор (разведчик → scene graph → синтез) — в истории git и ветке scene-graph.

const root = import.meta.dirname
const tmp = join(root, '.analyze')
const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

export type Usage = { kind: string; model: string; seconds: number; input: number; cached: number; output: number }
// Шаги агента для свёрнутой строки над ответом: сколько секунд думал, сколько раз открывал картинку
export type Steps = { thought: number; looked: number }

export function size(file: string) {
  const info = execFileSync('sips', ['-g', 'pixelWidth', '-g', 'pixelHeight', file]).toString()
  return { w: Number(info.match(/pixelWidth: (\d+)/)?.[1]), h: Number(info.match(/pixelHeight: (\d+)/)?.[1]) }
}

// Увеличение кропа для scene graph: на мелком кропе даже сильная модель теряет детали (калибровка capsule-bars).
// До ×3, но не больше 900 px по длинной стороне.
export function zoom(file: string, out: string) {
  const { w, h } = size(file)
  const k = Math.max(1, Math.min(3, 900 / Math.max(w, h)))
  const W = Math.round(w * k), H = Math.round(h * k)
  execFileSync('sips', ['-z', String(H), String(W), file, '--out', out], { stdio: 'ignore' })
  return { w: W, h: H }
}

// Пустая папка под один шаг: агент видит только свои входы, токены не уходят на обход проекта.
// Вне репозитория: внутри него Codex подтягивает AGENTS.md проекта (память Refkit) и начинает говорить про продукт
const runs = join(tmpdir(), 'refkit-runs')
export function isolated(name: string, files: string[] = []) {
  mkdirSync(runs, { recursive: true })
  const dir = mkdtempSync(join(runs, `${name}-`))
  for (const file of files) copyFileSync(file, join(dir, file.split('/').pop()!))
  return dir
}

function logUsage(line: Record<string, unknown>) {
  mkdirSync(tmp, { recursive: true })
  const entry = { at: new Date().toISOString(), ...line }
  appendFileSync(join(tmp, 'usage.log'), JSON.stringify(entry) + '\n')
  console.log('[refkit]', entry)
}

// web — владелец разрешил на эту просьбу поиск в интернете (прожарка grill-web-search.md)
type RunOptions = { kind: string; model: string; prompt: string; images: string[]; cwd: string; write?: boolean; web?: boolean; schema?: object; effort?: string; track?: Usage[]; signal?: AbortSignal; onProgress?: (progress: Progress) => void; steps?: Steps }
// Ход работы для строки статуса, как в Claude: шаг и сколько токенов модель уже написала
export type Progress = { step: 'думает' | 'смотрит картинку' | 'ищет в сети' | 'открывает страницу' | 'пишет ответ'; tokens: number }

// Своя домашняя папка Codex — только вход в аккаунт (ссылка на ~/.codex/auth.json): без личных правил владельца
// (~/.codex/AGENTS.md), его скиллов и настроек. Разбор смотрит только на материалы — владелец, 2026-09-27
const codexHome = join(tmpdir(), 'refkit-codex-home')
function isolatedCodexHome() {
  mkdirSync(codexHome, { recursive: true })
  const auth = join(codexHome, 'auth.json')
  try { lstatSync(auth) } catch { symlinkSync(join(homedir(), '.codex', 'auth.json'), auth) }
  return codexHome
}

// Один вызов Codex. Возвращает последнее сообщение агента; расход токенов — в журнал и в track.
export function runCodex({ kind, model, prompt, images, cwd, write, web, schema, effort = 'low', track, signal }: RunOptions): Promise<string> {
  mkdirSync(tmp, { recursive: true })
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
  const last = join(tmp, `last-${stamp}.txt`)
  const args = ['exec', '--skip-git-repo-check', '--json', '-m', model, '-C', cwd, '-s', write ? 'workspace-write' : 'read-only', '-c', `model_reasoning_effort="${effort}"`, '-o', last]
  if (web) args.push('-c', 'web_search="live"')
  if (schema) {
    const schemaFile = join(tmp, `schema-${stamp}.json`)
    writeFileSync(schemaFile, JSON.stringify(schema))
    args.push('--output-schema', schemaFile)
  }
  for (const image of images) args.push('-i', image)
  args.push('--', prompt)
  const started = Date.now()
  return new Promise((resolve, reject) => {
    const child = spawn('codex', args, { cwd, stdio: ['ignore', 'pipe', 'pipe'], signal, env: { ...process.env, CODEX_HOME: isolatedCodexHome() } })
    let out = ''
    let err = ''
    // Текст, а не байты: иначе граница куска режет русскую букву (2 байта) пополам и в ответе появляется «��»
    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', (chunk) => { out += chunk })
    child.stderr.on('data', (chunk) => { err += chunk })
    child.on('error', reject)
    child.on('close', (code) => {
      let usage: Record<string, number> = {}
      let reported = '' // настоящая причина отказа — в событии turn.failed, а не в stderr (там часто одна служебная строка)
      for (const line of out.split('\n')) {
        try {
          const event = JSON.parse(line)
          if (event.type === 'turn.completed' && event.usage) usage = event.usage
          if (event.type === 'turn.failed' && event.error?.message) reported = String(event.error.message)
        } catch { /* не JSON */ }
      }
      const entry: Usage = { kind, model, seconds: Math.round((Date.now() - started) / 1000), input: usage.input_tokens ?? 0, cached: usage.cached_input_tokens ?? 0, output: usage.output_tokens ?? 0 }
      logUsage({ agent: 'codex', ...entry })
      track?.push(entry)
      if (code !== 0 || !existsSync(last)) return reject(new Error(codexError(err, code, reported)))
      resolve(readFileSync(last, 'utf8'))
    })
  })
}

// Понятная причина вместо последней строки stderr: там часто служебное «Reading additional input from stdin…», а настоящая ошибка — строкой ERROR выше.
// Ошибка Codex одной человеческой строкой (владелец 2026-10-10): из stderr убираем цветовые коды и служебный префикс
// лога («2026-10-10T13:36Z ERROR codex_models_manager::manager: …»), известные сбои — своими словами
const stripAnsi = (text: string) => text.replace(/\u001b\[[0-9;]*m/g, '')
function codexError(stderr: string, code: number | null, reported = '') {
  // Ответ сервера приходит JSON-строкой: {"error":{"message":"…"}}
  let said = reported
  try { said = JSON.parse(reported)?.error?.message ?? reported } catch { /* уже обычный текст */ }
  if (/not supported when using Codex with a ChatGPT account/i.test(said)) return t('Эту модель не берёт установленный Codex — он устарел. Обновите его в терминале (brew upgrade --cask codex) или выберите другую модель')
  const lines = stripAnsi(stderr).split('\n').map((line) => line.trim()).filter(Boolean)
  const logged = [...lines].reverse().find((line) => /\bERROR\b/.test(line))
  const error = said ? said : logged ? logged.replace(/^.*?\bERROR:?\s*(?:[\w:]+:\s+)?/, '') : lines.at(-1) ?? ''
  if (/401|Unauthorized|API key/i.test(error)) return t('Codex не вошёл в аккаунт — в терминале выполните codex login')
  if (/429|rate limit|usage limit/i.test(error)) return t('Лимит Codex на сейчас исчерпан — попробуйте позже')
  if (/timeout|timed out/i.test(error)) return t('Codex не ответил вовремя — попробуйте ещё раз')
  // Codex упал, ничего не сказав: в stderr только «Reading additional input from stdin…»
  if (!error || /^Reading additional input from stdin/i.test(error)) return t('Codex остановился, не дав ответа — попробуйте ещё раз')
  return error.slice(0, 200) || t('codex завершился с кодом {code}', { code })
}

// Один вызов Claude Code — на подписке владельца, как Codex. Минимум лишнего: свой короткий системный промпт, без скиллов,
// без сохранения сессии, без инструментов (у рефа — только Read, чтобы открыть картинку), без MCP-серверов и без настроек
// пользователя. Замер 2026-09-26: MCP добавляли 30–56 тыс. служебных токенов к каждому вызову, CLAUDE.md и память — ещё ~3 тыс.;
// с --strict-mcp-config и --setting-sources "" остаётся ~600.
// --bare не подходит: в нём Claude Code работает только по API-ключу, а не по подписке.
export function runClaude({ kind, model, prompt, images, cwd, web, schema, effort, track, signal, onProgress, steps }: RunOptions): Promise<string> {
  const pictures = images.map((image, index) => { const file = join(cwd, `image-${index}${extname(image)}`); copyFileSync(image, file); return file })
  const text = pictures.length ? t('{prompt}\n\nКартинка для разбора — открой инструментом Read: {join}', { prompt, join: pictures.join(', ') }) : prompt
  // stream-json — события по ходу работы (шаг, токены); итог — последнее событие result, те же поля, что у json
  const args = ['-p', '--model', model, '--output-format', 'stream-json', '--verbose', '--include-partial-messages', '--disable-slash-commands', '--no-session-persistence', '--strict-mcp-config', '--setting-sources', '',
    '--system-prompt', t('Выполни задачу из сообщения точно, по-русски, без вступлений.'),
    '--tools', [pictures.length ? 'Read' : '', web ? 'WebSearch,WebFetch' : ''].filter(Boolean).join(',')]
  // В режиме -p инструмент без разрешения молча отклоняется — поиск разрешаем явно
  if (web) args.push('--allowedTools', 'WebSearch,WebFetch')
  if (schema) args.push('--json-schema', JSON.stringify(schema))
  if (effort) args.push('--effort', effort) // глубина из настроек Refkit: low / medium / high
  const started = Date.now()
  return new Promise((resolve, reject) => {
    const child = spawn('claude', args, { cwd, stdio: ['pipe', 'pipe', 'pipe'], signal }) // signal — «Стоп» владельца убивает процесс
    const timer = setTimeout(() => child.kill(), web ? 360_000 : 180_000) // поиск открывает страницы — дольше
    let out = ''
    let err = ''
    // Текст, а не байты: иначе граница куска режет русскую букву (2 байта) пополам и в ответе появляется «��»
    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    // Токены: у законченных сообщений — точные из usage, у пишущегося — оценка по буквам (~3 на токен)
    let step: Progress['step'] = 'думает'
    let done = 0
    let letters = 0
    let pending = ''
    let thinkingSince = 0
    const event = (line: string) => {
      let data: { type?: string; event?: { type?: string; content_block?: { type?: string; name?: string }; delta?: { text?: string; thinking?: string; partial_json?: string }; usage?: { output_tokens?: number } } } = {}
      try { data = JSON.parse(line) } catch { return }
      const item = data.event
      if (data.type !== 'stream_event' || !item) return
      if (item.type === 'content_block_start' && item.content_block?.type === 'thinking') thinkingSince = Date.now()
      if (item.type === 'content_block_stop' && thinkingSince) { if (steps) steps.thought += (Date.now() - thinkingSince) / 1000; thinkingSince = 0 }
      if (item.type === 'content_block_start' && item.content_block?.name === 'Read' && steps) steps.looked += 1
      if (item.type === 'content_block_start') step = item.content_block?.type === 'thinking' ? 'думает' : ({ Read: 'смотрит картинку', WebSearch: 'ищет в сети', WebFetch: 'открывает страницу' } as const)[item.content_block?.name ?? ''] ?? 'пишет ответ'
      if (item.type === 'content_block_delta') letters += (item.delta?.text ?? item.delta?.thinking ?? item.delta?.partial_json ?? '').length
      if (item.type === 'message_delta') { done += item.usage?.output_tokens ?? 0; letters = 0 }
      onProgress?.({ step, tokens: done + Math.round(letters / 3) })
    }
    child.stdout.on('data', (chunk: string) => {
      out += chunk
      pending += chunk
      const lines = pending.split('\n')
      pending = lines.pop() ?? ''
      lines.forEach(event)
    })
    child.stderr.on('data', (chunk) => { err += chunk })
    child.on('error', reject)
    child.on('close', (code) => {
      clearTimeout(timer)
      let data: { result?: string; is_error?: boolean; structured_output?: unknown; usage?: Record<string, number> } = {}
      try { data = JSON.parse(out.trim().split('\n').reverse().find((line) => line.includes('"type":"result"')) ?? '') } catch { /* не JSON — ошибка ниже */ }
      const usage = data.usage ?? {}
      const entry: Usage = { kind, model, seconds: Math.round((Date.now() - started) / 1000), input: (usage.input_tokens ?? 0) + (usage.cache_creation_input_tokens ?? 0), cached: usage.cache_read_input_tokens ?? 0, output: usage.output_tokens ?? 0 }
      logUsage({ agent: 'claude', ...entry })
      track?.push(entry)
      if (code !== 0 || data.is_error || (schema ? !data.structured_output : !data.result)) return reject(new Error(claudeError(data.result || err || out, code)))
      resolve(schema ? JSON.stringify(data.structured_output) : String(data.result))
    })
    child.stdin.end(text)
  })
}

function claudeError(message: string, code: number | null) {
  const line = message.trim().split('\n').pop() ?? ''
  console.warn('[claude] ошибка запуска:', message.trim().slice(-500))
  // Узко: слова вроде «author» или «login» в тексте материала не должны выдавать себя за вход в аккаунт
  if (/not logged in|please run \/login|invalid api key|authentication[_ ](error|failed)|\b401\b|credentials? (are |is )?(expired|invalid|missing)/i.test(line)) return t('Claude Code не вошёл в аккаунт — в терминале выполните claude и войдите')
  if (/credit/i.test(line)) return t('Для этой модели нужны кредиты Claude — выберите другую модель')
  if (/version .* required|claude update/i.test(line)) return t('Эта модель требует новее Claude Code — в терминале выполните claude update')
  if (/limit|429|quota/i.test(line)) return t('Лимит Claude на сейчас исчерпан — попробуйте позже или выберите другую модель')
  return line.slice(0, 200) || t('claude завершился с кодом {code}', { code })
}

// Свой временный профиль на каждый запуск Chrome и уборка после: без --user-data-dir Chrome заводит профиль сам и при сбое оставляет его в tmp
function chromeProfile() {
  const dir = mkdtempSync(join(tmpdir(), 'chrome-'))
  return { arg: `--user-data-dir=${dir}`, drop: () => rmSync(dir, { recursive: true, force: true }) }
}

// Снимок живой страницы по адресу (превью холстов): нужен настоящий Chrome, чтобы экраны во вложенных iframe нарисовались как есть
// Асинхронно: страницу отдаёт этот же сервер, а синхронный запуск остановил бы его, пока Chrome ждёт ответа (взаимная блокировка)
export function screenshotUrl(url: string, out: string, w: number, h: number, waitMs = 0) {
  const profile = chromeProfile()
  return new Promise<void>((done, fail) => execFile(chrome, ['--headless=new', profile.arg, '--use-mock-keychain', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1', ...(waitMs ? [`--virtual-time-budget=${waitMs}`] : []), `--window-size=${w},${h}`, `--screenshot=${out}`, url], { timeout: 60000 }, (error) => { profile.drop(); if (error) fail(error); else done() }))
}

// Печать страницы в PDF: размер страницы берётся из CSS (@page), колонтитулов нет; waitMs — виртуальное время на отрисовку скриптов
export function printPdf(html: string, out: string, waitMs = 4000) {
  const profile = chromeProfile()
  try { execFileSync(chrome, ['--headless=new', profile.arg, '--use-mock-keychain', '--disable-gpu', '--no-pdf-header-footer', `--virtual-time-budget=${waitMs}`, `--print-to-pdf=${out}`, `file://${html}`], { stdio: 'ignore', timeout: 60000 }) } finally { profile.drop() }
}
// Измерение собранного экрана в настоящем Chrome: в страницу подмешивается скрипт, который через секунду пишет метрики в DOM, а --dump-dom их отдаёт.
// overflow — на сколько содержимое главной области выше её видимой части; gaps — блоки с пустотами внутри (разрыв между соседями или пустой хвост).
export type ScreenMetrics = { overflow: number; gaps: Array<{ gap: number; tail: number; text: string }>; empty?: number; emptyAt?: string; emptyAtPct?: number }
const MEASURE = `<script>setTimeout(function(){var main=document.querySelector('main');var m={overflow:main?main.scrollHeight-main.clientHeight:document.documentElement.scrollHeight-innerHeight,gaps:[]};document.querySelectorAll('div,section,article').forEach(function(el){var cs=getComputedStyle(el);if(parseFloat(cs.borderTopWidth)<1)return;var r=el.getBoundingClientRect();if(r.height<160||r.width<200)return;var kids=[].slice.call(el.querySelectorAll('*')).filter(function(k){return (k.children.length===0&&(k.textContent||'').trim())||k.tagName==='svg'||k.tagName==='IMG'});var rects=kids.map(function(k){return k.getBoundingClientRect()}).filter(function(x){return x.height>0}).sort(function(a,b){return a.top-b.top});if(!rects.length){m.gaps.push({gap:Math.round(r.height),tail:Math.round(r.height),text:''});return}var maxGap=0;for(var i=1;i<rects.length;i++)maxGap=Math.max(maxGap,rects[i].top-rects[i-1].bottom);var tail=r.bottom-Math.max.apply(null,rects.map(function(x){return x.bottom}));if(maxGap>100||tail>160)m.gaps.push({gap:Math.round(maxGap),tail:Math.round(tail),text:(el.innerText||'').trim().slice(0,30)})});m.gaps=m.gaps.slice(0,6);if(main){var cols=12,rows=8,mr=main.getBoundingClientRect(),g=[];for(var yy=0;yy<rows;yy++)g.push(new Array(cols).fill(0));main.querySelectorAll('*').forEach(function(el){var cs=getComputedStyle(el);var leaf=(el.children.length===0&&(el.textContent||'').trim())||el.tagName==='svg'||el.tagName==='IMG';var boxed=parseFloat(cs.borderTopWidth)>=1||(cs.backgroundColor!=='rgba(0, 0, 0, 0)'&&cs.backgroundColor!=='transparent');if(!leaf&&!boxed)return;var r=el.getBoundingClientRect();if(r.width<8||r.height<8)return;var x0=Math.max(0,Math.floor((r.left-mr.left)/mr.width*cols)),x1=Math.min(cols-1,Math.floor((r.right-mr.left-1)/mr.width*cols)),y0=Math.max(0,Math.floor((r.top-mr.top)/mr.height*rows)),y1=Math.min(rows-1,Math.floor((r.bottom-mr.top-1)/mr.height*rows));for(var yy=y0;yy<=y1;yy++)for(var xx=x0;xx<=x1;xx++)g[yy][xx]=1});var q={'left-top':[0,0],'right-top':[1,0],'left-bottom':[0,1],'right-bottom':[1,1]},empty=0,worst={name:'',ratio:0};for(var k in q){var cnt=0,tot=0;for(var yy=q[k][1]*rows/2;yy<(q[k][1]+1)*rows/2;yy++)for(var xx=q[k][0]*cols/2;xx<(q[k][0]+1)*cols/2;xx++){tot++;if(!g[yy][xx]){cnt++;empty++}}if(cnt/tot>worst.ratio)worst={name:k,ratio:cnt/tot}}m.empty=Math.round(empty/(rows*cols)*100);m.emptyAt=worst.name;m.emptyAtPct=Math.round(worst.ratio*100)}var pre=document.createElement('pre');pre.id='refkit-metrics';pre.textContent=JSON.stringify(m);document.body.appendChild(pre)},1200)</script>`
export function measureScreen(innerHtml: string, dir: string): Promise<ScreenMetrics | null> {
  const file = join(dir, 'measure.html')
  writeFileSync(file, innerHtml.includes('</body>') ? innerHtml.replace(/<\/body>(?![\s\S]*<\/body>)/, `${MEASURE}</body>`) : innerHtml + MEASURE)
  const profile = chromeProfile()
  return new Promise((done) => execFile(chrome, ['--headless=new', profile.arg, '--use-mock-keychain', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1', '--virtual-time-budget=3000', '--window-size=1440,900', '--dump-dom', `file://${file}`], { timeout: 30000, maxBuffer: 128 * 1024 * 1024 }, (error, stdout) => {
    profile.drop()
    const raw = error ? '' : String(stdout).match(/<pre id="refkit-metrics">([^<]*)<\/pre>/)?.[1]
    try { done(raw ? (JSON.parse(raw.replace(/&quot;/g, '"').replace(/&amp;/g, '&')) as ScreenMetrics) : null) } catch { done(null) }
  }))
}
export function screenshot(html: string, out: string, w: number, h: number, waitMs = 0) {
  const profile = chromeProfile()
  try { execFileSync(chrome, ['--headless=new', profile.arg, '--use-mock-keychain', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1', ...(waitMs ? [`--virtual-time-budget=${waitMs}`] : []), `--window-size=${w},${h}`, `--screenshot=${out}`, `file://${html}`], { stdio: 'ignore', timeout: 30000 }) } finally { profile.drop() }
}
