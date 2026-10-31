// Читает открытую страницу в браузере владельца — там проверка сайта уже пройдена. Запускается из окна расширения
// (chrome.scripting.executeScript), кладёт результат в window.__refkitClip; окно забирает его вторым вызовом.
import { Readability } from '@mozilla/readability'

const meta = (...names: string[]) =>
  names.map((name) => document.querySelector(`meta[property="${name}"], meta[name="${name}"]`)?.getAttribute('content')?.trim()).find(Boolean) ?? ''

// Cover и описание берём до Readability: он перекраивает копию документа, но не сам документ — копия на всякий случай
const cover = meta('og:image', 'twitter:image')
const article = new Readability(document.cloneNode(true) as Document).parse()

;(window as unknown as { __refkitClip: unknown }).__refkitClip = {
  url: location.href,
  title: article?.title || meta('og:title', 'twitter:title') || document.title.trim(),
  author: article?.byline ?? '',
  description: meta('og:description', 'twitter:description', 'description'),
  cover: cover ? new URL(cover, location.href).href : '',
  text: article?.textContent?.replace(/\s+/g, ' ').trim() ?? '',
}
