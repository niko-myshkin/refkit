// Шаблон «Брендбук»: Brief и References → выбор Lettering → выбор палитры и шрифтов → Brand book.
// Координаты относительные; id стабильны.
import { PAIR_NAMES } from './font-pairs.mjs'

export const PROMPTS = {
  'a-lettering': "Use the attached lettering references and the existing wordmark to propose three clearly different constructions for the exact product name. Return exactly: 1. **Original** — keep the existing wordmark.\nLettering: preserve its full construction.\n2. **Soft sculptural** — redraw the word from scratch in rounded, heavy, flowing custom letters with open counters.\nLettering: a distinct silhouette, softer curves and generous internal openings; retain the original's confidence.\n3. **Sharp compact** — redraw the word from scratch in angular, condensed custom letters with clear geometric cuts.\nLettering: a distinct silhouette, sharper terminals and tighter rhythm; retain the original's confidence. These are three alternatives, not small edits of one image. No other text.",
  'a-palette': "Use the Brief, reference images and the selected wordmark to propose exactly three distinct color and typography systems. The wordmark is custom lettering; Pair is for headlines and body text around it. Take colors from the references when possible, and keep readable contrast between Background and Text, Surface and Text, Accent and its ink. Each option must be a coherent palette, not just a different accent. Return a numbered list, one option per item, exactly these fields on separate lines:\n1. **Short name** — one sentence describing its character.\nBackground: #RRGGBB\nSurface: #RRGGBB\nText: #RRGGBB\nAccent: #RRGGBB\nSupport: #RRGGBB\nPair: exactly one of these pairs (display + body), with a different pair for each option: " + PAIR_NAMES.join('; ') + "\nVerdict: one sentence on why these colors and fonts fit the Brief and the selected lettering. No other text. Do not invent another logo or symbol.",
  'b-book': "Build the brand book page from the section kit and the Brief, chosen Lettering, chosen Palette & type and references, in this order: BookCover, Logo, Construction, LogoMisuse, Colors, Typography, Voice, Applications, Moodboard, InUse. Create the brand idea, three traits and voice inside this step, grounded in those inputs; there is no separate System & voice node. The only mark is the first letter of the selected Wordmark asset, cropped by the section kit. Pass that same Wordmark asset as wordmark to BookCover, Logo, Construction, LogoMisuse and Applications; do not generate a separate sign or monogram and do not pass mark or symbol. The Construction note must explain that the mark is the first letter of the selected lettering, with no claim about a geometric grid. For Moodboard, use the reference page assets and name their sources in captions. Theme: pass the chosen Background, Surface, Text, Accent, Support and Pair to Page; use soft corners. Colors must list exactly these chosen five colors with roles and uses; do not replace or invent them. Name is exactly the Name from the Brief. Derive clear-space and minimum-size rules from the actual lettering, with no invented grid or measurements presented as facts. Return only the page code.",
}
const NODE = (id, type, x, y, w, h, data) => ({ id, type, position: { x, y }, width: w, height: h, data })

/** Собирает цепочку. brief — заметка владельца; refs — папка или подборка референсов.
 *  Подборка помечена «ассеты страницы» для мудборда. */
export function brandbookChain({ brief = '', refs }) {
  const nodes = [
    NODE('t-brief', 'text', 0, 0, 420, 380, { title: 'Brief', text: brief }),
    NODE('g-refs', 'group', 0, 440, 420, 460, { groupKind: refs.kind ?? 'folder', key: refs.key, name: refs.name, view: 'grid', asAssets: true }),
    NODE('a-lettering', 'agent', 520, 0, 520, 880, { title: 'Lettering', fit: true, pick: true, autoPick: false, brandVisual: 'wordmark', sized: true, instr: PROMPTS['a-lettering'] }),
    NODE('a-palette', 'agent', 1140, 0, 620, 880, { title: 'Palette & type', fit: true, pick: true, autoPick: false, sized: true, instr: PROMPTS['a-palette'] }),
    NODE('b-book', 'screen', 1860, 0, 900, 820, { title: 'Brand book', fit: true, designSystem: 'brandbook', sized: true, instr: PROMPTS['b-book'] }),
  ]
  const edges = [
    ['t-brief', 'a-lettering'], ['g-refs', 'a-lettering'],
    ['t-brief', 'a-palette'], ['g-refs', 'a-palette'], ['a-lettering', 'a-palette'],
    ['t-brief', 'b-book'], ['g-refs', 'b-book'], ['a-lettering', 'b-book'], ['a-palette', 'b-book'],
  ]
  const stages = [
    { id: 'f-inputs', label: '1 · Brief & references', hue: 0, members: ['t-brief', 'g-refs'] },
    { id: 'f-brand', label: '2 · Choose', hue: 1, members: ['a-lettering', 'a-palette'] },
    { id: 'f-book', label: '3 · Book', hue: 5, members: ['b-book'] },
  ]
  return { nodes, edges, stages }
}
