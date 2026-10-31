// Minimal Chrome DevTools client: open a page, find an element, screenshot its box. Used by capture.mjs.
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const port = 9333
export async function withChrome(fn) {
  const dir = mkdtempSync(join(tmpdir(), 'cdp-'))
  const proc = spawn(chrome, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${dir}`, '--no-first-run', '--hide-scrollbars', '--force-device-scale-factor=1', 'about:blank'], { stdio: 'ignore' })
  try {
    let targets
    for (let i = 0; i < 50; i++) { try { targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); break } catch { await new Promise((r) => setTimeout(r, 200)) } }
    const page = targets.find((t) => t.type === 'page')
    const ws = new WebSocket(page.webSocketDebuggerUrl); await new Promise((r) => (ws.onopen = r))
    let id = 0; const wait = new Map()
    ws.onmessage = (event) => { const m = JSON.parse(event.data); if (m.id && wait.has(m.id)) { wait.get(m.id)(m); wait.delete(m.id) } }
    const send = (method, params = {}) => new Promise((resolve, reject) => { const n = ++id; wait.set(n, (m) => (m.error ? reject(new Error(m.error.message)) : resolve(m.result))); ws.send(JSON.stringify({ id: n, method, params })) })
    await send('Page.enable')
    return await fn({
      send,
      async open(url, width = 1280, height = 900) {
        await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false })
        await send('Page.navigate', { url }); await new Promise((r) => setTimeout(r, 4500))
      },
      async eval(expression) { const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }); return r.result.value },
    })
  } finally { proc.kill(); await new Promise((r) => setTimeout(r, 1500)); try { rmSync(dir, { recursive: true, force: true, maxRetries: 5 }) } catch {} }
}
