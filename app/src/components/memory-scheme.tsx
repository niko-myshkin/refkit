import { useState } from 'react'
import { t } from '@/lib/i18n'
import { ArrowRight, Bot, ChevronDown, FileText, Film, FolderOpen, HelpCircle, Image as ImageIcon, MessageSquareWarning, NotebookPen, Pencil, Route, Save, Zap, type LucideIcon } from 'lucide-react'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

// Схемы на странице «Память» (прожарки grill-agent-memory.md и grill-skill-chips.md, 2026-10-27). Статичны: ничего не читают и не запускают.
// «Память» — как копится и куда уходит; «Роутер» — как под материал подбираются умения. Роутера в коде ещё нет, поэтому вкладка
// подписана «планируется», а правила в ней — пример на настоящих названиях действий

type Step = { icon: LucideIcon; label: string }
const lanes: Array<{ name: string; where: string; color: string; steps: Step[] }> = [
  { name: t('О тебе'), where: t('Работает везде, у любого агента'), color: 'var(--port-text)', steps: [
    { icon: MessageSquareWarning, label: t('Ты поправил агента') },
    { icon: HelpCircle, label: t('Он предлагает «Запомнить: …?»') },
    { icon: Save, label: t('Один клик — строка в файле библиотеки') },
    { icon: Bot, label: t('Подкладывается в каждый ответ') },
  ] },
  { name: t('О подборке'), where: t('Видна агенту только внутри неё'), color: 'var(--port-material)', steps: [
    { icon: MessageSquareWarning, label: t('Ты поправил агента в подборке') },
    { icon: HelpCircle, label: t('Он предлагает «Запомнить: …?»') },
    { icon: FolderOpen, label: t('Строка в файле подборки') },
    { icon: Bot, label: t('Подкладывается только в её ответы') },
  ] },
]

// Связь между узлами: линия с бегущим штрихом (тот же .link-pulse, что у графа). Горизонтальная на широком экране, вертикальная на узком
function Link({ color }: { color: string }) {
  return (
    <>
      <svg aria-hidden className="mt-5 hidden h-1 min-w-4 flex-1 overflow-visible sm:block" viewBox="0 0 100 1" preserveAspectRatio="none">
        <line x1="0" y1="0.5" x2="100" y2="0.5" pathLength="100" stroke="currentColor" strokeOpacity="0.25" strokeWidth="1" vectorEffect="non-scaling-stroke" />
        <line x1="0" y1="0.5" x2="100" y2="0.5" pathLength="100" className="link-pulse" stroke={color} strokeWidth="2" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      </svg>
      <span aria-hidden className="ml-5 block h-4 w-px bg-border sm:hidden" />
    </>
  )
}

function Node({ icon: Icon, color, children }: { icon: LucideIcon; color: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 sm:w-24 sm:shrink-0 sm:flex-col sm:items-start sm:gap-2">
      <span className="grid size-10 shrink-0 place-items-center rounded-full border bg-muted/50" style={{ borderColor: color, color }}><Icon className="size-4" /></span>
      <span className="text-xs leading-snug">{children}</span>
    </div>
  )
}

function MemoryLanes() {
  return (
    <div className="flex flex-col gap-6">
      {lanes.map((lane) => (
        <div key={lane.name} className="flex flex-col gap-3">
          <p className="flex items-center gap-2 text-xs text-muted-foreground"><span className="size-2 rounded-full" style={{ background: lane.color }} /><span className="font-medium text-foreground">{lane.name}</span>· {lane.where}</p>
          <div className="flex flex-col sm:flex-row sm:items-start">
            {lane.steps.map((step, index) => (
              <div key={step.label} className="contents">
                <Node icon={step.icon} color={lane.color}>{step.label}</Node>
                {index < lane.steps.length - 1 && <Link color={lane.color} />}
              </div>
            ))}
          </div>
        </div>
      ))}
      <p className="text-xs text-muted-foreground">{t('Память лежит файлами в папке библиотеки, а не в агенте: сменил агента — она осталась. Без твоего «да» ничего не сохраняется')}</p>
    </div>
  )
}

// Пример правил: у каждого умения свой список входов, к которым оно подходит. Названия — настоящие действия из прожарки grill-skill-chips.md
const kinds = [
  { id: 'image', label: t('Картинка'), icon: ImageIcon },
  { id: 'video', label: t('Видео'), icon: Film },
  { id: 'article', label: t('Статья'), icon: FileText },
  { id: 'note', label: t('Заметка'), icon: NotebookPen },
  { id: 'collection', label: t('Подборка'), icon: FolderOpen },
  { id: 'result', label: t('Результат ноды'), icon: Route },
]
const skills = [
  { name: t('Приём → рецепт'), fits: ['image', 'video'] },
  { name: t('Правила стиля'), fits: ['image', 'collection'] },
  { name: t('Концепты'), fits: ['result'] },
  { name: t('Сводка подборки'), fits: ['collection'] },
  { name: t('Разбор статьи и ролика'), fits: ['article', 'video'] },
]

function RouterFlow() {
  const [kind, setKind] = useState('image')
  const current = kinds.find((item) => item.id === kind)!
  const hits = skills.filter((skill) => skill.fits.includes(kind))
  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs text-muted-foreground">{t('Выбери, что лежит во входе ноды, и смотри, какие умения загорятся. Это правила, а не модель: ничего не считается и не стоит токенов')}</p>
      <ToggleGroup type="single" value={kind} onValueChange={(value) => value && setKind(value)} variant="outline" size="sm" className="flex-wrap justify-start" aria-label={t('Что во входе')}>
        {kinds.map((item) => <ToggleGroupItem key={item.id} value={item.id} className="gap-1.5 text-xs"><item.icon className="size-3.5" />{item.label}</ToggleGroupItem>)}
      </ToggleGroup>
      <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
        <div className="flex items-center gap-3 rounded-lg border bg-muted/50 p-3 sm:w-36 sm:shrink-0">
          <span className="grid size-10 place-items-center rounded-full border" style={{ borderColor: 'var(--port-material)', color: 'var(--port-material)' }}><current.icon className="size-4" /></span>
          <span className="text-xs">{current.label}</span>
        </div>
        <ArrowRight aria-hidden className="size-4 shrink-0 rotate-90 self-center text-muted-foreground sm:rotate-0" />
        <ul className="flex flex-1 flex-col gap-1.5" aria-label={t('Умения')}>
          {skills.map((skill) => {
            const on = skill.fits.includes(kind)
            return (
              <li key={skill.name} className={cn('flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-xs transition-[opacity,border-color,background-color] duration-200', on ? 'bg-muted/50' : 'border-transparent opacity-35')}
                style={on ? { borderColor: 'var(--port-text)' } : undefined}>
                <span className="flex items-center gap-2"><Zap className={cn('size-3.5', on ? 'text-port-text' : 'text-muted-foreground')} />{skill.name}</span>
                <span className="text-muted-foreground">{skill.fits.map((id) => kinds.find((item) => item.id === id)!.label).join(' · ')}</span>
              </li>
            )
          })}
        </ul>
      </div>
      <p className="flex items-start gap-2 text-xs text-muted-foreground">
        <Pencil aria-hidden className="mt-0.5 size-3.5 shrink-0" />
        {hits.length > 0 ? t('Клик по умению подставляет его в поле ноды. Запуск — только твой: ⌘↵ или ▶') : t('Ни одно умение не подошло — остаётся обычное поле. Что показывать в этом случае, пока не решено')}
      </p>
    </div>
  )
}

export function MemoryScheme() {
  return (
    <Collapsible className="group/scheme rounded-lg border">
      <CollapsibleTrigger className="flex w-full items-center justify-between gap-2 px-4 py-3 text-sm font-medium hover:bg-muted/40">
        {t('Как это работает')}
        <ChevronDown className="size-4 text-muted-foreground transition-transform group-data-[state=open]/scheme:rotate-180" />
      </CollapsibleTrigger>
      <CollapsibleContent className="border-t p-4">
        <Tabs defaultValue="memory" className="gap-4">
          <TabsList>
            <TabsTrigger value="memory">{t('Память')}</TabsTrigger>
            <TabsTrigger value="router">{t('Роутер')} <Badge variant="secondary" className="text-[10px]">{t('планируется')}</Badge></TabsTrigger>
          </TabsList>
          <TabsContent value="memory"><MemoryLanes /></TabsContent>
          <TabsContent value="router"><RouterFlow /></TabsContent>
        </Tabs>
      </CollapsibleContent>
    </Collapsible>
  )
}
