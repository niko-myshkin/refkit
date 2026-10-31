import { t } from '@/lib/i18n'
// Разбор SKILL.md для импорта в действие (grill-agent-skills.md): frontmatter → название и описание, тело → инструкция «как делать».
// «Что не сработает» — по списку признаков, без модели: агент Refkit видит только библиотеку и (по разрешению) сеть. v1, может промахнуться
export type ParsedSkill = { name: string; description: string; body: string }
export type Unsupported = { label: string; hint: string }

export function parseSkill(raw: string): ParsedSkill {
  const text = raw.replace(/\r\n/g, '\n').trim()
  const match = text.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/)
  const front = match ? match[1] : ''
  const body = (match ? match[2] : text).trim()
  const field = (key: string) => {
    const found = front.match(new RegExp(`^${key}:\\s*(.*)$`, 'm'))
    return found ? found[1].trim().replace(/^["']|["']$/g, '') : ''
  }
  const heading = body.match(/^#\s+(.+)$/m)?.[1]?.trim() ?? ''
  return { name: field('name') || heading, description: field('description'), body }
}

const checks: Array<{ re: RegExp; item: Unsupported }> = [
  { re: /playwright|puppeteer|браузер|browser|скриншот|screenshot|navigate to/i, item: { label: t('Браузер и скриншоты'), hint: t('агент окна не открывает страницы сам; сеть — только поиск по разрешению') } },
  { re: /figma/i, item: { label: 'Figma', hint: t('Figma из окна агента не доступна') } },
  { re: /\b(Bash|Grep|Glob|MultiEdit|NotebookEdit)\b|\b(read|write|edit)\s+(the\s+)?(file|files)\b|прочита\w+ файл|запиши в файл|\bnpx?\s|\bgit\s(commit|push|status|diff)/i, item: { label: t('Файлы проекта и команды'), hint: t('агент Refkit не читает и не пишет файлы проекта и не запускает команды') } },
  { re: /\b(references|scripts)\//i, item: { label: t('Приложенные файлы скилла'), hint: t('папки references/ и scripts/ не переносятся — останется только этот текст') } },
  { re: /subagent|субагент|Agent tool|Task tool/i, item: { label: t('Субагенты'), hint: t('агент окна не запускает субагентов') } },
  { re: /mcp__|\bMCP\b/i, item: { label: t('Инструменты MCP'), hint: t('внешние инструменты из текста скилла недоступны') } },
  { re: /AskUserQuestion/i, item: { label: t('Меню с вариантами ответа'), hint: t('вопросы пойдут обычным текстом, без кнопок-вариантов') } },
]

export function unsupportedIn(text: string): Unsupported[] {
  return checks.filter((check) => check.re.test(text)).map((check) => check.item)
}

export const MAX_HOW = 20000
