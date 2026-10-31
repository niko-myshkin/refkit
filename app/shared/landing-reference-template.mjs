// Эталонная цепочка лендинга (2026-10-30, grill-landing-chain.md): упрощённая замена «Лендинга продукта». Без перерисовки интерфейса:
// страница собирается из настоящих снимков продукта (папка подключена к странице ассетами). Заметки + документы + снимки + сессия → паспорт
// (что видно, что только обещано) → приём референса → направления бренда (выбор владельца) → текст страницы → страница → одна проверка.
// Координаты относительные (0,0 — левый верхний угол цепочки); id узлов стабильны.
import { PROMPTS as HYPOTHESIS } from './hypothesis-template.mjs'
import { PROMPTS as LANDING } from './product-landing-template.mjs'

export const PROMPTS = {
  'a-passport': LANDING['a-passport'],
  'a-reference': "These screenshots are sections of a reference landing page. Describe its technique so that another product can reuse the method, not the content. Answer in exactly these parts: Rhythm: the order of section kinds from top to bottom, one line. Headlines: how a headline is built (length, two tones, voice). Proof: how product screenshots are shown (window frame, crop, scale, what sits under them), 3 to 5 lines. Repeated pattern: the one structure most sections share. Kit map: for each reference section, one line «reference section → kit section» using only these kit sections: Hero, Wide (title, text, one large shot, up to three items under it), Split (title, points, shot to the side), Duo (two shots side by side, e.g. product window and agent terminal, three items under them), Agents, Faq, Cta; when nothing fits, write «→ missing in kit: what it needs». Avoid: what would read as a copy (their words, names, colours, logos). No other text.",
  'a-directions': HYPOTHESIS['a-directions'],
  'a-page': "Write the landing page of the product from the passport, the chosen brand direction, the reference technique and the product screenshots (their titles are listed in the input). Follow the section order from the product notes when they give one; otherwise the reference rhythm. Every section shows one real screenshot from the list, chosen by its title, and makes one claim that screenshot proves; never use a screenshot twice. Only [seen] features of the passport appear; a [docs only] or Not yet feature is left out. The page speaks about the product, never about evidence, screenshots, sessions or the passport. Agents are the coding agents a person runs (Claude Code, Codex), never model names. Buttons and short labels have no final period. Headlines are short; where the reference uses two tones, give the second sentence as a muted part. Answer in exactly this form (the page is assembled from these fields, keep the labels and the order):\nHeader: name (exactly as in the passport); tagline (up to 6 words)\nHero: headline (under 7 words, the difference from the passport); muted (second sentence, under 6 words, or none); sub (one sentence); button (the request action); screenshot (title); window (a short address-like caption for the window, e.g. refkit · Landing chain)\nThen 4 to 7 sections, each as:\nSection N (wide, split or duo): kicker (1 to 3 words); title (under 7 words); muted (under 6 words, or none); for wide: text (one or two sentences) and items (three short capabilities as title — one line, separated by |, or none); for split: point 1; point 2; point 3 (optional); screenshot (title); window (caption); for duo: text (one or two sentences); items (three, as for wide); screenshot (title, the product window); window (caption); side (title of the second screenshot, e.g. the agent terminal); side window (caption)\nAgents: title; text (one or two sentences); items (Claude Code, Codex — only the ones the passport shows)\nFaq: 4 to 6 questions, each as Q: … | A: … (answers only from the passport)\nCta: title; button (the same words as the Hero button); note (one honest line)\nFooter: name; tagline",
  's-landing': "Build the landing page from the section kit and the Page copy, in this order: Header, Hero, then one section per Section of the copy in the same order (a wide Section → Wide, a split Section → Split, a duo Section → Duo), Agents, Faq, Cta, Footer. No other sections. Use the copy exactly as written: every field goes into the matching property, with no rewriting and no additions (muted → headlineMuted or titleMuted, window → imageWindow, side → side, side window → sideWindow, items → items). Split sides alternate between consecutive Splits: the first image on the right, then left. Theme: Accent, Pair, Corners and Layout from the chosen brand direction exactly as written. The product name is exactly the Name from the copy. The product screenshots are attached as page assets (see their descriptions): every Hero and Section image (and a Duo side) is the asset whose description matches the screenshot title in the copy; never leave an image empty and never use an asset twice.",
  'a-page-review': "Look at the assembled landing page (its snapshot is attached) against the passport and the page copy, as a strict reviewer: every claim is a [seen] feature of the passport; every image is a product screenshot, none repeated and none empty; the hero screenshot reads at a glance; the rhythm is not monotonous; the text is the copy as written. Write the problems you see, at most five. Then one line per node that must change, exactly in this form: Fix: Page copy — the concrete change (for claims and wording), or Fix: Landing — the concrete change (for layout, size, order, images). A fix never adds claims, numbers or text the passport does not support. If nothing must change: Fix: none.",
}
const NODE = (id, type, x, y, w, h, data) => ({ id, type, position: { x, y }, width: w, height: h, data })

/** Собирает цепочку. notes — заметки владельца своими словами (порядок секций можно задать тут); docs — документы о продукте [{title, text}];
 *  shots — папка настоящих снимков продукта {key, name} (идёт и в паспорт, и в страницу ассетами); refs — папка снимков референс-лендинга {key, name}
 *  (необязательна); session — запись настоящей сессии агента (доказательство для паспорта). */
export function landingReferenceChain({ notes = '', docs = [], session = '', shots, refs = null }) {
  const docIds = docs.map((_, at) => `t-doc-${at + 1}`)
  let y = 460
  const col0 = (h) => { const at = y; y += h + 60; return at }
  const docNodes = docs.map((doc, at) => NODE(docIds[at], 'text', 0, col0(360), 420, 360, { title: doc.title, text: doc.text }))
  const sessionY = session ? col0(360) : 0, shotsY = col0(420), refsY = refs ? col0(400) : 0
  const nodes = [
    NODE('t-notes', 'text', 0, 0, 420, 400, { title: 'Product notes', text: notes }),
    ...docNodes,
    ...(session ? [NODE('t-session', 'text', 0, sessionY, 420, 360, { title: 'Agent session', text: session })] : []),
    NODE('g-shots', 'group', 0, shotsY, 420, 420, { groupKind: 'folder', key: shots.key, name: shots.name, view: 'grid', asAssets: true }),
    ...(refs ? [NODE('g-refs', 'group', 0, refsY, 420, 400, { groupKind: 'folder', key: refs.key, name: refs.name, view: 'grid' })] : []),
    NODE('a-passport', 'agent', 520, 0, 460, 760, { title: 'Product passport', fit: true, sized: true, instr: PROMPTS['a-passport'] }),
    ...(refs ? [NODE('a-reference', 'agent', 520, refsY, 460, 560, { title: 'Reference technique', fit: true, sized: true, instr: PROMPTS['a-reference'] })] : []),
    NODE('a-directions', 'agent', 1080, 0, 460, 780, { title: 'Brand directions', fit: true, pick: true, autoPick: true, sized: true, instr: PROMPTS['a-directions'] }),
    NODE('a-page', 'agent', 1640, 0, 480, 780, { title: 'Page copy', fit: true, sized: true, instr: PROMPTS['a-page'] }),
    NODE('s-landing', 'screen', 2220, 0, 900, 780, { title: 'Landing', fit: true, designSystem: 'landing', sized: true, instr: PROMPTS['s-landing'] }),
    NODE('a-page-review', 'agent', 3220, 0, 460, 640, { title: 'Page review', fit: true, sized: true, review: true, instr: PROMPTS['a-page-review'] }),
  ]
  const edges = [
    ['t-notes', 'a-passport'], ...docIds.map((id) => [id, 'a-passport']), ['g-shots', 'a-passport'], ...(session ? [['t-session', 'a-passport']] : []),
    ...(refs ? [['g-refs', 'a-reference'], ['a-reference', 'a-page'], ['a-reference', 'a-directions']] : []),
    ['a-passport', 'a-directions'],
    ['t-notes', 'a-page'], ['a-passport', 'a-page'], ['a-directions', 'a-page'], ['g-shots', 'a-page'],
    ['a-page', 's-landing'], ['a-directions', 's-landing'], ['g-shots', 's-landing'],
    ['a-passport', 'a-page-review'], ['a-page', 'a-page-review'], ['s-landing', 'a-page-review'],
  ]
  const stages = [
    { id: 'f-inputs', label: '1 · Product', hue: 0, members: ['t-notes', ...docIds, ...(session ? ['t-session'] : []), 'g-shots', ...(refs ? ['g-refs', 'a-reference'] : []), 'a-passport'] },
    { id: 'f-brand', label: '2 · Brand', hue: 1, members: ['a-directions'] },
    { id: 'f-page', label: '3 · Page', hue: 5, members: ['a-page', 's-landing', 'a-page-review'] },
  ]
  return { nodes, edges, stages }
}
