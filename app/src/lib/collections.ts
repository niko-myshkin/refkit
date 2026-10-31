// Словарь тегов (grill-taxonomy.md, 2026-09-28). Исторически — «системные подборки», имена на диске прежние:
//   library/collections.json и поле collections у материала — это словарь тегов и теги материала;
//   поле tags у материала — старые свободные слова, только для поиска, пока их не свели к словарю (шаг 3).
// Подборки теперь — только авторские (boards.json). Во внешнем API (MCP) поле назовём tags и сопоставим.
// hint — о чём тег, по нему агент решает, ставить ли его. types — наследие: теги идут поперёк типов, фильтр не применяем.

// refs — исторический id картинок (владелец 2026-09-28: «Рефы» → «Картинки», закинутое видео — отдельный тип «Видео»)
// music — ссылки Spotify (grill-music.md)
export type TypeId = 'all' | 'refs' | 'video' | 'youtube' | 'article' | 'note' | 'music' | 'canvas'
export type Collection = { name: string; types: TypeId[]; hint: string }

export const allTypes: TypeId[] = ['refs', 'video', 'youtube', 'article', 'note', 'music', 'canvas']

export const defaultCollections: Collection[] = [
  { name: 'Данные', types: ['refs'], hint: 'графики, дашборды, показатели; data, chart, dashboard, analytics' },
  { name: 'Контролы', types: ['refs'], hint: 'кнопки, шкалы, переключатели, поля; button, slider, toggle, input, form' },
  { name: 'Типографика', types: ['refs', 'article', 'note'], hint: 'шрифты, текст, цифры; typography, font, typeface, lettering' },
  { name: 'Моушен', types: allTypes, hint: 'анимация и движение в интерфейсах; motion, animation, transition' },
  { name: 'ИИ и агенты', types: ['youtube', 'article', 'note'], hint: 'модели, агенты, промпты, работа с Claude и Codex; AI, LLM, agent, prompt, Claude, GPT' },
  { name: 'UX', types: ['youtube', 'article', 'note'], hint: 'продуктовый дизайн интерфейсов: исследования, юзабилити, сценарии; user experience, usability, research, product design' },
  { name: 'Фронтенд', types: ['youtube', 'article', 'note'], hint: 'код интерфейсов: HTML, CSS, React, вёрстка; frontend, JavaScript, TypeScript, CSS' },
]

// Тег подходит к любому типу: ролик и статья про анимацию — в одном теге. type оставлен, чтобы не трогать вызовы
export const collectionsOfType = (list: Collection[], _type: TypeId) => list

// У элемента может быть несколько тегов (2026-09-26). Старые записи хранили одну строку collection — читаем и её.
export const collectionsOf = (item: { collections?: string[]; collection?: string }) => item.collections ?? (item.collection ? [item.collection] : [])

// Теги по смыслу страницы — без модели (2026-10-04): слова заголовка и описания страницы сверяем с именем тега и его hint.
// Слово совпало, если у обоих общее начало из 5 букв (шрифт/шрифты, анимация/анимации); короткие — целиком (UX, CSS)
const stems = (text: string) => (text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).map((word) => (word.length > 5 ? word.slice(0, 5) : word)).filter((word) => word.length >= 2)
export const tagsByMeaning = (page: string, list: Collection[], minHits = 1) => {
  const words = new Set(stems(page))
  if (!words.size) return []
  return list
    .map((item) => ({ name: item.name, hits: [...new Set(stems(`${item.name} ${item.hint}`))].filter((word) => words.has(word)).length }))
    .filter((item) => item.hits >= minHits).sort((a, b) => b.hits - a.hits).map((item) => item.name)
}
