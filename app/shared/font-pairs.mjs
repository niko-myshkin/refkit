// Шрифтовые пары брендинга: один источник для карточки направления, образца на #/system, промптов и сборки лендинга.
// Гарнитура: family — имя для CSS, pkg — пакет @fontsource, kind — variable (одна латинская вариативная гарнитура) или static (файл на вес), weights — какие веса нужны.
// Только латиница: кириллицы в лендингах пока нет, а все подмножества вшивались бы в каждый экран мегабайтами.
const V = (family, pkg) => ({ family, pkg: `@fontsource-variable/${pkg}`, file: `${pkg}-latin-wght-normal.woff2`, kind: 'variable', fallback: 'sans-serif' })
const S = (family, pkg, weights, fallback = 'serif') => ({ family, pkg: `@fontsource/${pkg}`, files: weights.map((weight) => [weight, `${pkg}-latin-${weight}-normal.woff2`]), kind: 'static', fallback })
const FACES = {
  newsreader: { ...V('Newsreader Variable', 'newsreader'), fallback: 'serif' },
  hanken: V('Hanken Grotesk Variable', 'hanken-grotesk'),
  funnelDisplay: V('Funnel Display Variable', 'funnel-display'),
  funnelSans: V('Funnel Sans Variable', 'funnel-sans'),
  host: V('Host Grotesk Variable', 'host-grotesk'),
  plexMono: S('IBM Plex Mono', 'ibm-plex-mono', [400, 500, 600], 'monospace'),
  young: S('Young Serif', 'young-serif', [400]),
  onest: V('Onest Variable', 'onest'),
  schibsted: V('Schibsted Grotesk Variable', 'schibsted-grotesk'),
  brygada: { ...V('Brygada 1918 Variable', 'brygada-1918'), fallback: 'serif' },
  albert: V('Albert Sans Variable', 'albert-sans'),
  literata: { ...V('Literata Variable', 'literata'), fallback: 'serif' },
  familjen: V('Familjen Grotesk Variable', 'familjen-grotesk'),
  gloock: S('Gloock', 'gloock', [400]),
  publicSans: V('Public Sans Variable', 'public-sans'),
  atkinson: V('Atkinson Hyperlegible Next Variable', 'atkinson-hyperlegible-next'),
  dmMono: S('DM Mono', 'dm-mono', [400, 500], 'monospace'),
  caslon: S('Libre Caslon Display', 'libre-caslon-display', [400]),
  radio: V('Radio Canada Big Variable', 'radio-canada-big'),
}
// display — заголовок, text — основной текст, label — подписи; weight — вес заголовка
export const FONT_PAIRS = {
  'Newsreader + Hanken Grotesk': { display: FACES.newsreader, text: FACES.hanken, label: FACES.hanken, weight: 500 },
  'Funnel Display + Funnel Sans': { display: FACES.funnelDisplay, text: FACES.funnelSans, label: FACES.funnelSans, weight: 600 },
  'Host Grotesk + IBM Plex Mono': { display: FACES.host, text: FACES.host, label: FACES.plexMono, weight: 600 },
  'Young Serif + Onest': { display: FACES.young, text: FACES.onest, label: FACES.onest, weight: 400 },
  'Schibsted Grotesk + Newsreader': { display: FACES.schibsted, text: FACES.newsreader, label: FACES.newsreader, weight: 700 },
  'Brygada 1918 + Albert Sans': { display: FACES.brygada, text: FACES.albert, label: FACES.albert, weight: 600 },
  'Literata + Familjen Grotesk': { display: FACES.literata, text: FACES.familjen, label: FACES.familjen, weight: 600 },
  'Gloock + Public Sans': { display: FACES.gloock, text: FACES.publicSans, label: FACES.publicSans, weight: 400 },
  'Atkinson Hyperlegible Next + DM Mono': { display: FACES.atkinson, text: FACES.atkinson, label: FACES.dmMono, weight: 700 },
  'Libre Caslon Display + Radio Canada Big': { display: FACES.caslon, text: FACES.radio, label: FACES.radio, weight: 400 },
  'Radio Canada Big + Newsreader': { display: FACES.radio, text: FACES.newsreader, label: FACES.newsreader, weight: 600 },
  'Hanken Grotesk + Literata': { display: FACES.hanken, text: FACES.literata, label: FACES.literata, weight: 700 },
}
export const PAIR_NAMES = Object.keys(FONT_PAIRS)
export const cssFamily = (face) => `'${face.family}', ${face.fallback}`
// Имя пары в произвольном тексте (поле Pair ответа агента, код экрана)
export const findPair = (text) => PAIR_NAMES.find((name) => String(text).toLowerCase().includes(name.toLowerCase())) ?? ''
// @font-face только для латиницы выбранной пары: file(path) превращает имя файла в путь на диске (сборка экрана вшивает их в страницу)
export function pairFontCss(name, fileUrl) {
  const pair = FONT_PAIRS[name]
  if (!pair) return ''
  const faces = [...new Map([pair.display, pair.text, pair.label].map((face) => [face.family, face])).values()]
  return faces.map((face) => face.kind === 'variable'
    ? `@font-face{font-family:'${face.family}';font-style:normal;font-display:swap;font-weight:100 900;src:url(${fileUrl(face.pkg, face.file)}) format('woff2-variations')}`
    : face.files.map(([weight, file]) => `@font-face{font-family:'${face.family}';font-style:normal;font-display:swap;font-weight:${weight};src:url(${fileUrl(face.pkg, file)}) format('woff2')}`).join('')).join('\n')
}
