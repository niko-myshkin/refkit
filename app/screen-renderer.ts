import { mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import ts from 'typescript'
import { build } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { aliases } from './aliases.ts'
import { findPair, pairFontCss } from './shared/font-pairs.mjs'

const root = import.meta.dirname
export type DesignSystem = 'shadcn' | 'fluid' | 'landing' | 'brandapp' | 'deck' | 'report'
export const designSystemOf = (value: unknown): DesignSystem => value === 'fluid' ? 'fluid' : value === 'landing' ? 'landing' : value === 'brandapp' ? 'brandapp' : value === 'deck' ? 'deck' : value === 'report' ? 'report' : 'shadcn'
// Папка компонентов набора: shadcn — ui, Fluid — fluid, набор секций лендинга — landing
const namespaceOf = (system: DesignSystem) => system === 'fluid' ? 'fluid' : system === 'landing' ? 'landing' : system === 'deck' ? 'deck' : system === 'report' ? 'report' : 'ui'
// brandapp — макет приложения в теме направления: компоненты shadcn внутри обёртки Page из набора лендинга, поэтому цвета, шрифты и скругление берутся из направления
const componentDir = (system: DesignSystem) => join(root, `src/components/${namespaceOf(system)}`)
const componentNames = (system: DesignSystem) => readdirSync(componentDir(system)).filter((file) => file.endsWith('.tsx')).map((file) => file.slice(0, -4))
// Платформа page: внутренний экран сообщает высоту своего содержимого, внешний HTML пересылает её превью (родитель сам высоту не видит — песочница)
const PAGE_HEIGHT_REPORTER = `(function(){var last=0;function send(){var h=Math.min(12000,Math.ceil(document.body.getBoundingClientRect().height));if(h&&h!==last){last=h;parent.postMessage({refkitScreenHeight:h},'*')}}new ResizeObserver(send).observe(document.body);addEventListener('load',send);send()})()`
const PAGE_HEIGHT_RELAY = `addEventListener('message',function(e){if(e.data&&typeof e.data.refkitScreenHeight==='number'&&e.source===document.querySelector('iframe').contentWindow)parent.postMessage({refkitScreenHeight:e.data.refkitScreenHeight},'*')})`
export const SCREEN_VERSION = 'react-shadcn-1'
export const screenSchema = {
  type: 'object', additionalProperties: false,
  properties: { code: { type: 'string' }, platform: { type: 'string', enum: ['phone', 'web', 'page'] }, theme: { type: 'string', enum: ['light', 'dark'] } },
  required: ['code', 'platform', 'theme'],
}
export type ScreenAsset = { name: string; dataUrl: string }
// tokens — тема из входа экрана (нода «Токены»): сервер вырезает её из ответа агента и кладёт поверх темы проекта, код экрана цвета не задаёт
export type ScreenSource = { code: string; platform: 'phone' | 'web' | 'page'; theme: 'light' | 'dark'; designSystem?: DesignSystem; tokens?: string }

// Тяжёлые составные компоненты Fluid (боковые панели, палитры команд, комбобоксы: 2–5 тыс. символов API каждый) раскрываются в запросе, только если задача про них:
// в инструкции или входах есть слово из списка либо название самого компонента. Остальным остаются имя и экспорты — их API модели не нужен, а токены экономятся.
// За все запуски лендингов и экранов реально понадобились только Button, Tabs, Dialog, InputGroup — остальные 35 в основном ждали зря
const HEAVY: Record<string, RegExp> = {
  'command-menu': /команд|палитр|command|⌘\s*k|быстр\w* поиск/i,
  'sidebar-core': /сайдбар|боков|sidebar|навигаци/i, 'sidebar-menu': /сайдбар|боков|sidebar|навигаци/i, 'sidebar': /сайдбар|боков|sidebar|навигаци/i,
  'combobox': /combobox|комбо|автокомплит|выбор из списка|выпадающ|поиск и выбор/i,
  'color-picker': /цвет|color|палитр/i,
  'ask-user-questions': /вопрос|опрос|анкет|ask/i,
  'slider': /слайдер|ползунок|slider|шкал/i,
  'thinking-steps': /мысл|рассужд|thinking|шаги агента/i,
  'input-message': /сообщен|чат|message|composer|поле ввода/i,
  'chat-message': /сообщен|чат|message/i,
}
const wanted = (name: string, task: string) => !HEAVY[name] || HEAVY[name].test(task) || task.toLowerCase().includes(name)

// Каталог берётся из реальных файлов; новые компоненты не нужно перечислять вручную в промпте.
// task — инструкция и входы ноды: по ним решается, чьи API раскрывать (см. HEAVY)
export function screenContract(system: DesignSystem = 'shadcn', task = '') {
  const namespace = namespaceOf(system)
  const catalog = componentNames(system).map((name) => {
    const source = ts.createSourceFile(`${name}.tsx`, readFileSync(join(componentDir(system), `${name}.tsx`), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
    const names = source.statements.flatMap((statement) => {
      if (ts.isExportDeclaration(statement) && statement.exportClause && ts.isNamedExports(statement.exportClause)) return statement.exportClause.elements.map((item) => item.name.text)
      if (ts.canHaveModifiers(statement) && ts.getModifiers(statement)?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)) {
        if (ts.isVariableStatement(statement)) return statement.declarationList.declarations.map((d) => d.name.getText(source))
        if ('name' in statement && statement.name && ts.isIdentifier(statement.name as ts.Node)) return [(statement.name as ts.Identifier).text]
      }
      return []
    })
    const printer = ts.createPrinter({ removeComments: true })
    const props = (system === 'landing' || system === 'deck' || system === 'report' || (system === 'fluid' && wanted(name, task))) ? source.statements.filter((s) => ts.isInterfaceDeclaration(s) || ts.isTypeAliasDeclaration(s)).map((s) => printer.printNode(ts.EmitHint.Unspecified, s, source)).join('\n') : ''
    const hidden = system === 'fluid' && !wanted(name, task)
    return `@/components/${namespace}/${name}: ${[...new Set(names)].join(', ')}${props ? `\nAPI: ${props}` : hidden ? '\n(API не раскрыт: для этой задачи не нужен — не используй; чтобы подключить, назови компонент в инструкции ноды)' : ''}`
  }).join('\n')
  if (system === 'report') return `Верни JSON {code, platform, theme}. code — один TSX-модуль React с default export компонента Screen, без markdown и HTML-документа. platform всегда page, theme всегда dark.
Страница «Итог гипотезы» собирается ТОЛЬКО из готовых секций набора: ты не верстаешь, а переносишь найденное по рынку в свойства секций. Вёрстка внутри.
Импорты ровно такие, все именованные (default-экспортов нет): import { Page } from '@/components/landing/page'; import { ReportHeader, Verdict, Competitors, Signals, Frames, NextSteps } from '@/components/report/sections'; при кадрах ещё import assets from '@/assets'.
Скелет: default export Screen возвращает <Page accent pair corners> с секциями по порядку: ReportHeader, Verdict, Competitors, Signals, Frames, NextSteps. Тема (accent, pair, corners) берётся из выбранного направления как есть.
Данные — только из входов: идея и бриф, конкуренты, сигналы спроса, вердикт. Строки конкурентов и сигналы переноси по смыслу, но в строках свойств не оставляй markdown: никаких [текст](адрес), звёздочек и решёток; вместо ссылки в конце факта пиши источник скобкой с доменом, например (reddit.com). Поле url у конкурента — только адрес сайта без https://; rating вердикта — attractive, mixed или weak ровно как в вердикте; ничего не выдумывай и не добавляй цифр; где в источнике «no source found», так и пиши. Название продукта — ровно Name из брифа. Дата — сегодняшняя из запроса, если указана, иначе «28 Oct 2026».
Кадры: ассеты страницы передавай как assets.<имя> в Frames с подписью по описанию кадра. Следующие шаги (NextSteps) выведи из «Check first» и риска в вердикте, три коротких шага.
Каталог доступных экспортов и свойств секций (Section, Frame, display, label не импортируй):\n${catalog}`
  if (system === 'deck') return `Верни JSON {code, platform, theme}. code — один TSX-модуль React с default export компонента Screen, без markdown и HTML-документа. platform всегда page, theme всегда dark.
Презентация для заказчика собирается ТОЛЬКО из готовых слайдов набора: ты не верстаешь, а выбираешь порядок слайдов и заполняешь их свойства (текст, кадры). Каждый слайд — фиксированный кадр 1280×720, вёрстка уже внутри.
Скелет: default export Screen возвращает <Page accent pair corners><Deck>…слайды…</Deck></Page>. Импорты ровно такие, все именованные (default-экспортов нет): import { Page } from '@/components/landing/page'; import { Deck, TitleSlide, StatementSlide, PointsSlide, StepsSlide, FrameSlide, ClosingSlide } from '@/components/deck/slides'. Тема (accent, pair, corners) берётся из выбранного направления как есть.
Порядок: TitleSlide (название и одна фраза), StatementSlide (проблема одной мыслью), PointsSlide (решение, 3–4 тезиса), StepsSlide (как это работает, три шага), FrameSlide на каждый кадр продукта из ассетов (подпись: что видно), StatementSlide (почему это), ClosingSlide (следующий шаг). Всего 7–9 слайдов.
Тексты — только из брифа, копирайта и фактов; название продукта ровно Name из брифа; без выдуманных цифр, клиентов и отзывов. Нормальный регистр, с заглавной буквы. Кадры: import assets from '@/assets', передавай как assets.<имя> в FrameSlide, где подходит описание кадра.
Импорты разрешены только из react, @/assets, @/components/landing/page (Page) и @/components/deck/*. Свои стили и классы не добавляй.
Каталог доступных экспортов и свойств слайдов (Slide, Frame, display, label не импортируй):\n${catalog}`
  if (system === 'landing') return `Верни JSON {code, platform, theme}. code — один TSX-модуль React с default export компонента Screen, без markdown и HTML-документа. platform всегда page, theme всегда dark.
Лендинг собирается ТОЛЬКО из готовых секций набора: ты не верстаешь и не пишешь классы Tailwind, ты выбираешь порядок секций и заполняешь их свойства (текст, кадры, тему). Сетка, отступы и ритм уже внутри секций, поэтому не оборачивай их своими блоками и не добавляй свои стили.
Скелет: default export Screen возвращает <Page accent pair corners> с секциями внутри. Порядок по плану лендинга из входов: Header, Hero, ProductCanvas, Steps, Bento, Split, Statement, Wide, Agents, Faq, Cta, Footer; секции можно пропускать или повторять, если план этого требует. Страница о продукте с несколькими функциями: на каждую главную функцию свой Split (заголовок, 2–3 тезиса, кадр), сторона кадра чередуется left/right; Wide — главная функция крупно, кадр на всю ширину под текстом. Agents — строка «работает с»: только агенты, названные во входах как проверенные, словами, без логотипов. Faq — вопросы и ответы в конце, ответы только по фактам из входов. Показ продукта: ProductCanvas — сочинённый кадр «материалы → агент → результаты» (входы: 2–3 коротких узла из брифа, агент: одна строка, результаты: 1–3 кадра из ассетов страницы), ставь его сразу после Hero вместо кадра в Hero (у Hero тогда image не задавай); Bento — плитки, в каждой одна мысль и либо кадр из ассетов (крупный кроп одного блока интерфейса), либо 1–3 узла nodes в стиле интерфейса (kind, title, lines, chips, model); span wide или full у главных плиток, в нижнем ряду ширины должны складываться в три колонки. FeatureGrid — сетка «и ещё»: 6–12 мелких возможностей одной строкой, только то, что работает по входам. Кадры раздавай по смыслу описания: не клади один и тот же ассет в две секции подряд.
Тема из выбранного направления (поля Accent, Pair, Corners, Layout выбранного варианта) подставляется как есть: accent — #RRGGBB, pair — строка пары из списка, corners — sharp, soft или pill, layout у Hero — center, split или left. Если направление не выбрано, а в инструкции не указано иное, выбери их сам и согласуй с правилами стиля.
Название продукта — ровно Name из брифа, словом: в Header, Footer и текстах; логотипов и символов нет. Тексты — из плана и брифа, дословно там, где план их цитирует; без выдуманных цифр, отзывов и брендов.
Кадры продукта: если во входах есть «Ассеты страницы», импортируй их (import assets from '@/assets') и передавай свойствам image как assets.<имя> в секцию, где подходит описание кадра; кадры не обрезай и не выдумывай другие.
Импорты разрешены только из react, @/assets и @/components/landing/*. Не импортируй CSS, другие файлы и пакеты; состояний и обработчиков не нужно.
Каталог доступных экспортов и свойств секций (используй Page и секции; Section, Frame, PrimaryButton, display, label, AppShell — внутренние, не импортируй):\n${catalog}`
  const themeNote = system === 'brandapp' ? `\nЭто макет приложения в теме выбранного направления. Корневой элемент — <Page accent pair corners>: import { Page } from '@/components/landing/page' (именованный импорт, default-экспорта нет; импортируй только Page): accent — #RRGGBB, pair — строка пары, corners — sharp, soft или pill, из выбранного направления как есть. Оболочка экрана готовая: import { AppShell } from '@/components/landing/app-shell' (именованный импорт). Скелет: <Page accent pair corners><AppShell name nav active title status action>…содержимое…</AppShell></Page>, где name — Name из брифа, nav — одни и те же 4–6 пунктов {label, icon} на всех трёх экранах (icon — компонент из lucide-react), active — label одного из пунктов, title — заголовок экрана (один раз), status — короткий статус (необязательно), action — одна главная кнопка (необязательно). Сайдбар, шапку, крошки и внешние отступы не рисуй: они уже внутри AppShell, высота 900 заполняется сама; содержимое строй в flex-колонке/сетке, растягивая блоки (flex-1), без пустых низов. Внутри строй интерфейс из компонентов shadcn каталога ниже: их цвета, шрифты и радиусы уже берут тему направления, поэтому цвета и шрифты вручную не задавай. platform — web (1440×900), theme — dark. Показывай реальное содержание продукта из брифа: названия, подписи и данные должны быть правдоподобны, без выдуманных брендов и цифр.
Правила аккуратности (нарушение — брак):
1) Экран заполняет всю область 1440×900: корневой контейнер на всю высоту (min-h-[900px]), содержимое растягивается (flex-1), внизу нет пустой полосы и нет обрезанных блоков.
2) Одна мысль — одно место. Название раздела стоит один раз (в сайдбаре или в заголовке, но не в крошках и не повторяется внизу). Одно действие — одна кнопка. Не повторяй на экране слоган, цепочку «Material → Agent → Screen» и фразы вроде «Local on your Mac» больше одного раза.
3) Не подписывай очевидное: у понятных иконок, плиток и карточек нет подзаголовков-пояснений; не больше одной строки описания на карточку; не больше одной основной кнопки на экран.
4) Текст не мельче 12 px: минимум text-xs, вторичный текст — text-muted-foreground; произвольные text-[10px] и text-[11px] не используй.
5) Каждый блок содержит конкретное: названия, теги, строки из входов; блок без содержания (декор, общая фраза) не рисуй. Название экрана соответствует тому, что на нём показано.
6) Без пустых зон: высоту карточки задаёт её содержимое (items-start, не растягивай карточки на всю колонку), а свободное место отдай одному главному блоку, в котором настоящий текст или список (главный результат: не меньше трёх предложений). Пустая панель или карточка с одной строкой на пол-экрана — брак.` : ''
  return `Верни JSON {code, platform, theme}. code — один TSX-модуль React с default export компонента Screen, без markdown и HTML-документа.${themeNote}
Выбран набор ${system === 'fluid' ? 'Fluid Functionalism' : 'shadcn'}. Используй его компоненты из каталога ниже. Не переопределяй их кнопками и полями с ручными стилями. Для компоновки используй Tailwind.
Импорты разрешены только из react, lucide-react, @/lib/utils (cn) и перечисленных @/components/${namespace}/*. Не импортируй CSS, другие файлы и пакеты; не используй динамические импорты и require.
Цвета, шрифты, радиусы и тени — из токенов проекта: bg-background, bg-card, bg-muted, text-foreground, text-muted-foreground, bg-primary, text-primary-foreground, border-line, rounded-lg, shadow-sm и т.д. Не задавай HEX/RGB/OKLCH вручную и не меняй значения CSS-переменных. Отступы — по шкале Tailwind, чётные пиксели. Референс задаёт структуру и поведение, наши компоненты и токены — оформление.
platform: phone (390×844), web (1440×900) или page (лендинг и другие длинные страницы: ширина 1440, высота по содержимому, внутренняя прокрутка не нужна — вся страница видна целиком), по входам; явная инструкция о платформе главнее. theme: light или dark, по входам, иначе light.
Состояния и обработчики React допустимы для вкладок, меню и полей; запросы в сеть, хранилища, доступ к родителю и внешние ресурсы запрещены. Картинки: если во входах есть «Ассеты страницы», бери их так: import assets from '@/assets' (assets.<имя> — готовый src для <img>, имена и описания в блоке входов), остальные картинки замени нейтральными блоками. Не используй значок-искру.
${system === 'fluid' ? 'Fluid: Button variant primary/secondary/tertiary/ghost; size default/compact/icon/icon-compact. TabItem требует label (текст вкладки), Switch требует label, checked и onToggle. Провайдер FluidProvider уже подключён. Сохраняй штатные анимации Fluid. Если нужного компонента нет в каталоге Fluid, собери простую композицию из доступных компонентов и HTML; не подмешивай shadcn.' : 'Button: variant default/secondary/outline/ghost/destructive/link/glass; size default/xs/sm/lg/icon/icon-xs/icon-sm/icon-lg.'} Для phone и web экран должен помещаться в размер платформы, длинные области прокручиваются; для page высоту задаёт содержимое.
Каталог доступных экспортов:\n${catalog}
Источник токенов (подключается автоматически):\n${readFileSync(join(root, 'src/index.css'), 'utf8').split('/* Всплывающие слои')[0]}`
}

export function parseScreen(raw: string, system: DesignSystem = 'shadcn'): ScreenSource {
  const source = JSON.parse(raw.replace(/^\s*```(?:json)?\s*|\s*```\s*$/g, '')) as ScreenSource
  if (!source || typeof source.code !== 'string' || !source.code.trim() || !['phone', 'web', 'page'].includes(source.platform) || !['light', 'dark'].includes(source.theme)) throw new Error('Экран: нужен JSON с code, platform и theme')
  source.designSystem = system
  source.code = source.code.replace(/text-\[(?:8|9|10|11)px\]/g, 'text-xs') // страховка к правилу «не мельче 12 px»
  const ast = ts.createSourceFile('Screen.tsx', source.code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const allowed = new Set(['react', 'lucide-react', '@/lib/utils', '@/assets', ...(system === 'brandapp' || system === 'deck' || system === 'report' ? ['@/components/landing/page'] : []), ...(system === 'brandapp' ? ['@/components/landing/app-shell'] : []), ...componentNames(system).map((name) => `@/components/${namespaceOf(system)}/${name}`)])
  const visit = (node: ts.Node) => {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      if (node.moduleSpecifier && (!ts.isStringLiteral(node.moduleSpecifier) || !allowed.has(node.moduleSpecifier.text))) throw new Error('Экран: импорт доступен только из выбранного каталога компонентов, React, lucide-react и @/lib/utils')
    }
    if (ts.isImportEqualsDeclaration(node) || (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword || (ts.isIdentifier(node.expression) && node.expression.text === 'require')))) throw new Error('Экран: динамические импорты и require запрещены')
    ts.forEachChild(node, visit)
  }
  visit(ast)
  return source
}

/** Проверка собранного TSX на типичную небрежность (после parseScreen): повтор одного текста, цвета вручную, нечётные пиксели.
 *  Возвращает список замечаний для одной повторной попытки агента; пустой список — всё в порядке. */
export function lintScreen(code: string): string[] {
  const issues: string[] = []
  const ast = ts.createSourceFile('Screen.tsx', code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const seen = new Map<string, number>()
  const visit = (node: ts.Node) => {
    const text = ts.isJsxText(node) ? node.text : ts.isStringLiteral(node) && ts.isJsxExpression(node.parent) ? node.text : ''
    const clean = text.replace(/\s+/g, ' ').trim()
    if (clean.length >= 8 && /[a-zA-Zа-яА-Я]/.test(clean)) seen.set(clean, (seen.get(clean) ?? 0) + 1)
    ts.forEachChild(node, visit)
  }
  visit(ast)
  const repeated = [...seen].filter(([, count]) => count > 1).map(([text]) => `«${text.slice(0, 50)}»`)
  if (repeated.length) issues.push(`Текст повторяется на экране: ${repeated.slice(0, 4).join(', ')}. Одна мысль — одно место.`)
  if (/#[0-9a-fA-F]{3,8}\b/.test(code.replace(/accent="#[0-9a-fA-F]{6}"/, ''))) issues.push('Цвета заданы вручную (HEX). Бери токены: bg-card, text-muted-foreground, border-line и т.д.')
  const odd = [...code.matchAll(/(?:p|px|py|pt|pb|pl|pr|m|mx|my|mt|mb|ml|mr|gap|w|h|size)-\[(\d*[13579])px\]/g)].map((m) => m[0])
  if (odd.length) issues.push(`Нечётные пиксели: ${[...new Set(odd)].slice(0, 4).join(', ')}. Отступы и размеры только чётные.`)
  return issues
}

/** Замечания по измерениям отрисованного экрана (agents.measureScreen): содержимое вылезает за край или внутри блоков остались пустоты. */
export function measureIssues(metrics: { overflow: number; gaps: Array<{ gap: number; tail: number; text: string }>; empty?: number; emptyAt?: string; emptyAtPct?: number } | null): string[] {
  if (!metrics) return []
  const issues: string[] = []
  if (metrics.overflow > 6) issues.push(`Содержимое не помещается в 900 px: ниже края остаётся ${Math.round(metrics.overflow)} px. Убери лишние блоки или сократи тексты, чтобы всё было видно целиком, без прокрутки и обрезки.`)
  if (metrics.gaps.length) issues.push(`Пустоты внутри блоков: ${metrics.gaps.slice(0, 4).map((g) => `«${g.text || 'пустой блок'}» (разрыв ${g.gap} px, пустой хвост ${g.tail} px)`).join('; ')}. Не растягивай блоки (items-start, без h-full и flex-1 на карточках), расставь содержимое плотно, а свободное место отдай одному главному блоку с настоящим текстом.`)
  if ((metrics.empty ?? 0) > 22 || (metrics.emptyAtPct ?? 0) > 55) {
    const where = { 'left-top': 'слева вверху', 'right-top': 'справа вверху', 'left-bottom': 'слева внизу', 'right-bottom': 'справа внизу' }[String(metrics.emptyAt)] ?? 'на экране'
    issues.push(`Большая пустая область: около ${metrics.empty}% главной области не занято, хуже всего ${where} (${metrics.emptyAtPct}% четверти пусто). Растяни или перераспредели блоки так, чтобы главная область была заполнена целиком.`)
  }
  return issues
}

const escapeAttribute = (text: string) => text.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

// Сборка лишь читает TSX, но не исполняет его на сервере. Выполнение — только в iframe с непрозрачным origin и без сети.
export async function compileScreen(source: ScreenSource, assets: ScreenAsset[] = []) {
  // Внутри проекта: исходник, CSS и служебные файлы каждого прогона можно посмотреть.
  const runs = join(root, '.analyze/screens')
  mkdirSync(runs, { recursive: true })
  const cwd = mkdtempSync(join(runs, 'build-'))
  writeFileSync(join(cwd, 'Screen.tsx'), source.code)
  // Ассеты страницы вшиваются картинками data: — в песочнице сети нет, а CSP пропускает только data:
  writeFileSync(join(cwd, 'assets.ts'), `export default ${JSON.stringify(Object.fromEntries(assets.map((asset) => [asset.name, asset.dataUrl])))} as Record<string, string>\n`)
  const fluid = source.designSystem === 'fluid'
  const landing = source.designSystem === 'landing' || source.designSystem === 'brandapp' || source.designSystem === 'deck' || source.designSystem === 'report'
  // Набор секций лендинга: Tailwind должен видеть его классы, а шрифты нужны только выбранной паре и только латиницей (иначе страница вырастает до мегабайтов)
  const pairName = landing ? findPair(source.code) : findPair(source.tokens ?? '')
  if (landing || pairName) writeFileSync(join(cwd, 'fonts.css'), pairFontCss(pairName, (pkg: string, file: string) => join(root, 'node_modules', pkg, 'files', file)))
  writeFileSync(join(cwd, 'style.css'), '@import "../../../src/index.css";\n' + (fluid ? '@import "../../../src/components/fluid/registry.css";\n@source "../../../src/components/fluid";\n' : '') + (pairName && !landing ? '@import "./fonts.css";\n' : '') + (landing ? '@import "./fonts.css";\n@source "../../../src/components/landing";\n@source "../../../src/components/deck";\n@source "../../../src/components/report";\n' : '') + '@source "./Screen.tsx";\n' + (source.tokens ?? ''))
  writeFileSync(join(cwd, 'entry.tsx'), `
import React from 'react';
import { createRoot } from 'react-dom/client';
${fluid ? "import { FluidProvider as Provider } from '@/lib/fluid/fluid-provider';" : "import { TooltipProvider as Provider } from '@/components/ui/tooltip';"}
import Screen from './Screen';
import './style.css';
function fail(error) { document.body.replaceChildren(); const box = document.createElement('pre'); box.style.cssText = 'white-space:pre-wrap;padding:24px'; box.textContent = 'Ошибка экрана: ' + (error?.message || String(error)); document.body.append(box); document.body.dataset.rendered = 'error'; }
window.addEventListener('error', event => fail(event.error || event.message));
window.addEventListener('unhandledrejection', event => fail(event.reason));
class Boundary extends React.Component { state = { error: null }; static getDerivedStateFromError(error) { return { error }; } componentDidCatch(error) { fail(error); } render() { return this.state.error ? null : this.props.children; } }
createRoot(document.getElementById('root')).render(<Boundary><Provider><Screen /></Provider></Boundary>);
`)
  const output = await build({
    // mode и jsx.development заданы явно: из dev-сервера сборка наследует NODE_ENV=development и компилирует jsxDEV, которого нет в production-React
    configFile: false, root, mode: 'production', publicDir: false, logLevel: 'error', plugins: [react(), tailwindcss()], resolve: { alias: [{ find: /^@\/assets$/, replacement: join(cwd, 'assets.ts') }, ...aliases] }, define: { 'process.env.NODE_ENV': '"production"' }, oxc: { jsx: { runtime: 'automatic', development: false } },
    build: { write: false, assetsInlineLimit: Infinity, cssCodeSplit: false, minify: true, lib: { entry: join(cwd, 'entry.tsx'), formats: ['iife'], name: 'RefkitScreen' } },
  })
  const bundle = Array.isArray(output) ? output[0] : output
  if (!('output' in bundle)) throw new Error('Экран: сборка не вернула HTML')
  const files = bundle.output
  const js = files.filter((file) => file.type === 'chunk').map((file) => file.code).join('\n').replace(/<\/script/gi, '<\\/script')
  const css = files.flatMap((file) => file.type === 'asset' && file.fileName.endsWith('.css') ? [String(file.source)] : []).join('\n').replace(/<\/style/gi, '<\\/style')
  const [w, h] = source.platform === 'phone' ? [390, 844] : [1440, 900]
  const inner = `<!doctype html><html lang="ru" class="${source.theme === 'dark' ? 'dark' : ''}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; font-src data:; connect-src 'none'; frame-src 'none'; form-action 'none'; base-uri 'none'"><style>${css}</style></head><body style="margin:0"><div id="root"></div><script>${js}</script>${source.platform === 'page' ? `<script>${PAGE_HEIGHT_REPORTER}</script>` : ''}</body></html>`
  // Второй sandbox нужен и в скачанном HTML, где нет родительского ScaledFrame.
  const license = fluid ? `<!-- Fluid Functionalism\n${readFileSync(join(root, 'src/components/fluid/LICENSE'), 'utf8')}\n-->` : ''
  const html = `<!doctype html>${license}<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; frame-src about:; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; font-src data:; connect-src 'none'; form-action 'none'; base-uri 'none'"><style>html,body{margin:0;width:100%;height:100%;overflow:hidden}iframe{display:block;border:0;width:100%;height:100%}</style></head><body data-screen="${source.platform}" data-refkit-screen="react" data-design-system="${designSystemOf(source.designSystem)}"><iframe title="Экран" sandbox="allow-scripts" width="${w}" height="${h}" srcdoc="${escapeAttribute(inner)}"></iframe>${source.platform === 'page' ? `<script>${PAGE_HEIGHT_RELAY}</script>` : ''}</body></html>`
  writeFileSync(join(cwd, 'screen.html'), html)
  return html
}
