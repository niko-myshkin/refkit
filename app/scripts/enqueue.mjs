#!/usr/bin/env node
// Положить ссылку или заметку в очередь Refkit — работает, даже когда Refkit выключен.
// Сервер разберёт очередь при запуске и раз в минуту (library-plugin.ts → drainQueue).
//   node app/scripts/enqueue.mjs https://youtu.be/…            — ссылка
//   node app/scripts/enqueue.mjs "мысль без ссылки"            — заметка
//   node app/scripts/enqueue.mjs https://… --via telegram --text "текст поста"
import { appendFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

const args = process.argv.slice(2)
const flag = (name) => { const i = args.indexOf(`--${name}`); return i === -1 ? undefined : args.splice(i, 2)[1] }
const via = flag('via') ?? 'manual'
const text = flag('text')
const value = args.join(' ').trim()
if (!value) { console.error('Нужна ссылка или текст заметки'); process.exit(1) }

const library = join(import.meta.dirname, '..', '..', 'library')
mkdirSync(library, { recursive: true })
const item = /^https?:\/\//.test(value) ? { url: value, text, via } : { text: value, via }
appendFileSync(join(library, '.queue.jsonl'), JSON.stringify({ ...item, at: new Date().toISOString() }) + '\n')
console.log('В очереди:', item.url ?? item.text)
