import { useEffect, useState } from 'react'
import { ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { send, server } from './send'

// Collect (grill-collect-tabs.md): все открытые вкладки → одна «сессия» (папка) в Refkit. Не закрывает сам:
// после ответа сервера показывает итог и кнопку «Закрыть собранные» — закрывает только то, что сервер принял.
type Clip = { url: string; title: string; author: string; description: string; cover: string; text: string }
type Row = { id: number; title: string; url: string; host: string; pinned: boolean; ready: boolean; checked: boolean }

// Почта, банки, поиск, внутренние адреса: текст уйдёт агенту, а пользы нет — галка снята, вкладка остаётся открытой
const SKIP_HOST = /(^|\.)(mail\.google\.com|outlook\.(live|office)\.com|mail\.yahoo\.com|mail\.proton\.me|accounts\.google\.com|calendar\.google\.com|web\.whatsapp\.com|web\.telegram\.org|paypal\.com|claude\.ai|chatgpt\.com|chat\.openai\.com|gemini\.google\.com)$|bank|banking|sber|tinkoff|localhost|127\.0\.0\.1/
const isLogin = (url: URL) => /\/(log-?in|sign-?(in|up)|auth)(\/|$)/i.test(url.pathname)
const isSearch = (url: URL) => /(^|\.)(google|bing|yandex|duckduckgo)\./.test(url.hostname) && (url.searchParams.has('q') || url.searchParams.has('text'))
const suspicious = (url: URL) => SKIP_HOST.test(url.hostname) || isSearch(url) || isLogin(url)

async function loadRows(): Promise<Row[]> {
  const tabs = await chrome.tabs.query({})
  return tabs.flatMap((tab): Row[] => {
    if (!tab.id || !/^https?:/.test(tab.url ?? '')) return []
    const url = new URL(tab.url!)
    return [{ id: tab.id, title: tab.title?.trim() || url.hostname, url: tab.url!, host: url.hostname.replace(/^www\./, ''), pinned: Boolean(tab.pinned), ready: tab.status === 'complete' && !tab.discarded, checked: !tab.pinned && !suspicious(url) }]
  })
}

async function readTab(id: number): Promise<Clip> {
  await chrome.scripting.executeScript({ target: { tabId: id }, files: ['extract.js'] })
  const [{ result }] = await chrome.scripting.executeScript({ target: { tabId: id }, func: () => (window as unknown as { __refkitClip: Clip }).__refkitClip })
  return result as Clip
}

type Phase = 'pick' | 'run' | 'done'

export function Collect({ onBack }: { onBack: () => void }) {
  const [rows, setRows] = useState<Row[]>([])
  const [phase, setPhase] = useState<Phase>('pick')
  const [progress, setProgress] = useState(0)
  const [saved, setSaved] = useState<number[]>([])
  const [failed, setFailed] = useState(0)
  const [error, setError] = useState('')
  const [closed, setClosed] = useState(false)

  const [hidden, setHidden] = useState(false)
  const [openUrl, setOpenUrl] = useState('')
  const [already, setAlready] = useState(0)
  useEffect(() => {
    void loadRows().then(setRows)
    // Адрес вкладки Chrome отдаёт только с правом tabs; без него (расширение не обновили) почти все вкладки выглядят пустыми
    void chrome.tabs.query({}).then((tabs) => setHidden(tabs.some((tab) => !tab.url)))
  }, [])
  const picked = rows.filter((row) => row.checked)
  const toggle = (id: number) => setRows((list) => list.map((row) => row.id === id ? { ...row, checked: !row.checked } : row))

  const run = async () => {
    setError('')
    // Читать чужие вкладки можно только с разрешением на сайты; просим один раз, по клику, а не при установке
    const granted = await chrome.permissions.request({ origins: ['http://*/*', 'https://*/*'] }).catch(() => false)
    if (!granted) { setError('Без доступа к сайтам вкладки не прочесть'); return }
    let base = ''
    let key = ''
    let sessionId = ''
    let source = ''
    let inbox = ''
    try {
      const api = await server()
      base = api.base; key = api.key
      const made = await fetch(`${base}/api/library/batch`, { method: 'POST', headers: { 'x-refkit-key': key, 'Content-Type': 'application/json' }, body: JSON.stringify({ source: browserName() }) })
      if (!made.ok) throw new Error('rejected')
      const batch = await made.json()
      sessionId = batch.id; source = batch.source; inbox = batch.inbox
    } catch { setError('Refkit не запущен: собирать некуда'); return }
    setPhase('run')
    const ok: number[] = []
    let bad = 0
    let done = 0
    const queue = [...picked]
    // По четыре вкладки за раз: страницы читаются в браузере, разбор на сервере идёт следом сам
    const worker = async () => {
      for (let row = queue.shift(); row; row = queue.shift()) {
        try {
          let result: Awaited<ReturnType<typeof send>>
          if (row.ready) {
            try { result = await send({ ...await readTab(row.id), batch: sessionId, batchSource: source }) }
            catch { result = await sendLink(base, row.url, sessionId, source) } // страницу не прочесть (запрет, ещё грузится) — пусть сервер скачает сам
          } else result = await sendLink(base, row.url, sessionId, source)
          if (result === 'sent') ok.push(row.id); else bad++
        } catch { bad++ }
        setProgress(++done)
      }
    }
    await Promise.all([worker(), worker(), worker(), worker()])
    // Сервер считает, что реально легло в папку: уже разложенные страницы остаются на своих местах; пустую сессию он убирает
    const end = await fetch(`${base}/api/library/batch`, { method: 'POST', headers: { 'x-refkit-key': key, 'Content-Type': 'application/json' }, body: JSON.stringify({ id: sessionId, collected: ok.length, skipped: rows.length - picked.length + bad }) }).then((response) => response.json()).catch(() => ({})) as { already?: number }
    setAlready(end.already ?? 0); setOpenUrl(`${base}/#/folder/${inbox}`)
    setSaved(ok); setFailed(bad); setPhase('done')
  }

  // Закрыли собранные — и сразу открываем пачку в Refkit: разбирать её дальше там. «Открыть в Refkit» без закрытия остаётся
  // отдельной кнопкой: она уводит из окна, поэтому закрывать вкладки после неё уже нельзя
  const close = async () => { await chrome.tabs.remove(saved); setClosed(true); void chrome.tabs.create({ url: openUrl }) }


  return (
    <div className="flex w-[400px] flex-col gap-3 bg-background p-4 text-foreground">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={onBack} aria-label="Назад" disabled={phase === 'run'}><ArrowLeft /></Button>
        <span className="text-sm text-muted-foreground">Вкладок: {rows.length}</span>
      </div>
      {phase === 'pick' && (
        <>
          <ul className="flex max-h-72 flex-col gap-1 overflow-y-auto" aria-label="Вкладки">
            {rows.map((row) => (
              <li key={row.id}>
                <label className="flex cursor-pointer items-center gap-3 rounded-control px-2 py-1.5 text-sm hover:bg-muted/50">
                  <Checkbox checked={row.checked} onCheckedChange={() => toggle(row.id)} />
                  <span className="flex min-w-0 flex-col"><span className="truncate">{row.title}</span><span className="truncate text-xs text-muted-foreground">{row.host}</span></span>
                </label>
              </li>
            ))}
          </ul>
          {hidden && <p role="alert" className="text-sm text-destructive">Не все вкладки видны: обнови расширение в chrome://extensions</p>}
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <div className="flex justify-end"><Button onClick={() => void run()} disabled={!picked.length}>Собрать {picked.length}</Button></div>
        </>
      )}
      {phase === 'run' && <p role="status" className="text-sm text-muted-foreground">Собрано {progress} из {picked.length}</p>}
      {phase === 'done' && (
        <>
          <p role="status" className="text-sm">Собрано {saved.length}{already > 0 && <span className="text-muted-foreground">{openUrl ? `, из них уже были в библиотеке ${already}` : ', все уже были в библиотеке: новой папки нет'}</span>}{rows.length - saved.length > 0 && <span className="text-muted-foreground">, остались открытыми {rows.length - saved.length}{failed ? ` (не удалось: ${failed})` : ''}</span>}</p>
          <div className="flex items-center justify-between">
            {openUrl ? <Button variant="ghost" onClick={() => void chrome.tabs.create({ url: openUrl })}>Открыть в Refkit</Button> : <span />}
            {closed ? <span className="text-sm text-muted-foreground">Закрыто</span> : <Button onClick={() => void close()} disabled={!saved.length}>Закрыть собранные</Button>}
          </div>
        </>
      )}
    </div>
  )
}

// Имя источника для папки-сессии: браузер, из которого собрали. Chromium-варианты различаются по userAgent
const browserName = () => /Edg\//.test(navigator.userAgent) ? 'Edge' : /OPR\//.test(navigator.userAgent) ? 'Opera' : /YaBrowser/.test(navigator.userAgent) ? 'Яндекс Браузер' : 'Chrome'

async function sendLink(base: string, url: string, batch: string, batchSource: string): Promise<'sent' | 'rejected'> {
  try {
    const response = await fetch(`${base}/api/library/link`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url, batch, batchSource }) })
    return response.ok ? 'sent' : 'rejected'
  } catch { return 'rejected' }
}
