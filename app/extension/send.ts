// Отправка в Refkit и очередь (grill-extension.md): сервер не запущен — страница ждёт в chrome.storage.local,
// на иконке счётчик, фоновый скрипт досылает сам. Общий код окна и фонового скрипта.
export type Body = Record<string, unknown>
export const defaultBase = 'http://localhost:5173' // дев-сервер Refkit; переопределяется в chrome.storage.local { base }

export async function server() {
  const { base = defaultBase, key: stored } = await chrome.storage.local.get(['base', 'key'])
  const get = (path: string) => fetch(`${base}/api/library/${path}`).then((response) => response.json())
  // Ключ берём у сервера при первом запуске: страница с чужого сайта его не прочтёт (CORS), расширение — да (host_permissions)
  let key = stored as string | undefined
  if (!key) { key = (await get('clip-key')).key as string; await chrome.storage.local.set({ key }) }
  return { base: base as string, key, get }
}

// sent — принято; offline — сервер не отвечает (в очередь); rejected — сервер отказал (повтор не поможет)
export type Result = 'sent' | 'offline' | 'rejected'
export async function send(body: Body, retry = true): Promise<Result> {
  try {
    const api = await server()
    const response = await fetch(`${api.base}/api/library/clip`, { method: 'POST', headers: { 'x-refkit-key': api.key, 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    if (response.ok) return 'sent'
    if (response.status === 401 && retry) { await chrome.storage.local.remove('key'); return send(body, false) } // ключ сменился — берём новый
    return 'rejected'
  } catch { return 'offline' }
}

const queued = async () => ((await chrome.storage.local.get('queue')).queue ?? []) as Body[]
export async function updateBadge() {
  const count = (await queued()).length
  await chrome.action.setBadgeText({ text: count ? String(count) : '' })
}
export async function enqueue(body: Body) {
  await chrome.storage.local.set({ queue: [...(await queued()), body] })
  await updateBadge()
}
// Досылаем по одной с головы очереди; сервер не ответил — стоп до следующего раза
export async function flush() {
  for (let queue = await queued(); queue.length; queue = await queued()) {
    if (await send(queue[0]) === 'offline') break
    await chrome.storage.local.set({ queue: (await queued()).slice(1) })
  }
  await updateBadge()
}
