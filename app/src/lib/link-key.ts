// Ключ ссылки для поиска дублей: одна и та же страница в разной записи (www, #якорь, слэш на конце, utm-метки,
// youtu.be вместо youtube.com/watch) даёт один ключ. Общий для сервера и интерфейса — оба узнают дубль одинаково
export function linkKey(link: string): string {
  try {
    const url = new URL(link.trim())
    const host = url.hostname.replace(/^www\./, '').replace(/^m\./, '').toLowerCase()
    // YouTube: ролик определяет только id — watch?v=, youtu.be/, shorts/, embed/
    const id = host === 'youtu.be' ? url.pathname.slice(1)
      : /(^|\.)youtube\.com$|(^|\.)youtube-nocookie\.com$/.test(host) ? (url.searchParams.get('v') ?? url.pathname.match(/^\/(?:shorts|embed|live)\/([\w-]{11})/)?.[1]) : undefined
    if (id) return `youtube:${id.slice(0, 11)}`
    const keep = [...url.searchParams].filter(([key]) => !/^(utm_|fbclid|gclid|igshid|si$|ref$)/i.test(key)).sort(([a], [b]) => a.localeCompare(b))
    return `${host}${url.pathname.replace(/\/+$/, '')}${keep.length ? '?' + keep.map(([key, value]) => `${key}=${value}`).join('&') : ''}`
  } catch { return link.trim() }
}
