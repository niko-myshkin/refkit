import { Section } from './Section'

// Исходники читаются как текст при каждой загрузке страницы: цифры не устаревают, запускать ничего не надо.
// Свой код = всё, кроме components/ui (shadcn) и самой страницы «Система» (в ней примеры нарочно «грязные»).
// Поэтому страница — инструмент разработки: в продакшен-сборку попали бы все исходники как текст.
const files = import.meta.glob(['/src/**/*.{tsx,ts}', '!/src/components/ui/**', '!/src/system/**'], { query: '?raw', import: 'default', eager: true }) as Record<string, string>
const sources = Object.values(files)

const countIn = (list: string[], re: RegExp) => list.reduce((n, s) => n + (s.match(re)?.length ?? 0), 0)
const count = (re: RegExp) => countIn(sources, re)
// Имя класса считаем только в .tsx: в .ts оно встречается в комментариях и конфигах (lib/utils.ts)
const countTsx = (re: RegExp) => countIn(Object.entries(files).filter(([path]) => path.endsWith('.tsx')).map(([, s]) => s), re)

// Что считаем, по какому правилу и сколько было на 2026-10-01 (аудит audit.md). Ноль в «стало» — цель для «ручных» метрик.
const metrics: { group: string; name: string; was: number; now: number }[] = [
  { group: 'Слои', name: 'ручные z-[…]', was: 23, now: count(/\bz-\[\d+\]/g) },
  { group: 'Скругления', name: 'числовые rounded-md/lg/xl (вместо роли)', was: 66, now: count(/(?<![\w-])rounded-(?:md|lg|xl)(?![\w-])/g) },
  { group: 'Скругления', name: 'роли rounded-control/surface/container', was: 0, now: count(/(?<![\w-])rounded-(?:control|surface|container)(?![\w-])/g) },
  { group: 'Скругления', name: 'rounded-full', was: 17, now: count(/(?<![\w-])rounded-full(?![\w-])/g) },
  { group: 'Скругления', name: 'rounded-sm и голый rounded', was: 8, now: count(/(?<![\w-])rounded(?:-sm)?(?=[ "'`])/g) },
  { group: 'Скругления', name: 'rounded-[…] произвольные', was: 1, now: count(/(?<![\w-])rounded-\[[^\]]+\]/g) },
  { group: 'Текст', name: 'text-[Npx] произвольные', was: 5, now: count(/(?<![\w-])text-\[\d+(?:\.\d+)?px\]/g) },
  { group: 'Текст', name: 'связка text-xs text-muted-foreground (вместо caption)', was: 38, now: count(/(?<![\w-])text-xs text-muted-foreground(?![\w-])|(?<![\w-])text-muted-foreground text-xs(?![\w-])/g) },
  { group: 'Текст', name: 'caption', was: 0, now: countTsx(/(?<![\w-])caption(?![\w-])/g) },
  { group: 'Кнопки', name: 'голые <button>', was: 17, now: count(/<button\b/g) },
  { group: 'Цвет', name: 'палитровые классы (bg-neutral-*, text-white…)', was: 26, now: count(/(?<![\w-])(?:bg|text|border|ring|fill|stroke|from|to|via)-(?:white|black|neutral|gray|zinc|slate|stone|red|blue|green)(?:-\d+)?(?:\/\d+)?(?![\w-])/g) },
  { group: 'Цвет', name: 'hex, rgb(), hsl(), oklch() в коде', was: 3, now: count(/#[0-9a-fA-F]{6}\b|(?:oklch|rgba?|hsla?)\(/g) },
  { group: 'Отступы', name: 'произвольные брейкпоинты max-[Npx] (вместо max-compact)', was: 10, now: count(/max-\[\d+px\]/g) },
  { group: 'Дубли', name: 'плитка «создать» руками (0 = всё через CreateTile)', was: 2, now: countTsx(/min-h-40 flex-col[^"]*border-dashed/g) },
  { group: 'Дубли', name: 'плавающая панель (1 = сам FloatingBar)', was: 2, now: countTsx(/role="toolbar"/g) },
  { group: 'Прочее', name: 'inline style={{…}}', was: 32, now: count(/style=\{\{/g) },
]

export default function Metrics() {
  return (
    <Section id="metrics" title="Метрики дрейфа" hint="Сколько мест обходят систему. Считается из исходников при загрузке; «было» — аудит 1 октября. Ноль — цель только там, где значение должно идти из токена.">
      <table className="w-full max-w-2xl text-left text-sm">
        <thead>
          <tr className="text-xs text-muted-foreground">
            <th scope="col" className="py-1 font-medium">Метрика</th>
            <th scope="col" className="py-1 text-right font-medium">Было</th>
            <th scope="col" className="py-1 text-right font-medium">Стало</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {metrics.map((m) => (
            <tr key={m.name}>
              <th scope="row" className="py-1.5 font-normal"><span className="mr-2 text-xs text-muted-foreground">{m.group}</span>{m.name}</th>
              <td className="py-1.5 text-right tabular-nums text-muted-foreground">{m.was}</td>
              <td className="py-1.5 text-right font-medium tabular-nums">{m.now}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Section>
  )
}
