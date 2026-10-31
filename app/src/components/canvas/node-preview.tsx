import { cn } from '@/lib/utils'
import { t } from '@/lib/i18n'

// Схема ноды для карточки в палитре: узнаваемый силуэт (шапка, тело, кнопка), без настоящего содержимого — по такому «слепку» нода читается с первого взгляда
const bar = 'rounded-full bg-muted-foreground/25'

function Lines({ rows }: { rows: string[] }) {
  return <div className="flex flex-col gap-1.5">{rows.map((width, at) => <span key={at} className={cn('h-1.5', bar)} style={{ width }} />)}</div>
}

// Название ноды стоит под превью — внутри его не повторяем; кнопка запуска в схеме не рисуется, чтобы не выглядеть нажимаемой
function Shell({ children }: { title?: string; children: React.ReactNode; run?: boolean }) {
  return <div className="flex h-full flex-col rounded-lg bg-muted/70 p-3"><div className="min-h-0 flex-1">{children}</div></div>
}

export function NodePreview({ kind }: { kind: string }) {
  switch (kind) {
    case 'agent':
      return <Shell title={t('Агент')}><Lines rows={['90%', '100%', '70%', '85%', '45%']} /></Shell>
    case 'screen':
      return (
        <Shell title={t('Экран')}>
          <div className="flex size-full flex-col gap-1.5 rounded-md bg-background/70 p-1.5">
            <div className="flex gap-1"><span className={cn('size-1.5', bar)} /><span className={cn('size-1.5', bar)} /><span className={cn('size-1.5', bar)} /></div>
            <span className="h-3 w-2/3 rounded-sm bg-muted-foreground/35" />
            <div className="grid min-h-0 flex-1 grid-cols-3 gap-1"><span className="rounded-sm bg-muted" /><span className="rounded-sm bg-muted" /><span className="rounded-sm bg-muted" /></div>
          </div>
        </Shell>
      )
    case 'image':
      return (
        <Shell title={t('Картинка')}>
          <div className="relative size-full overflow-hidden rounded-md bg-muted">
            <span className="absolute top-2 right-2 size-3 rounded-full bg-muted-foreground/35" />
            <span className="absolute -bottom-3 left-1 size-10 rotate-45 rounded-md bg-muted-foreground/25" />
            <span className="absolute -bottom-4 left-9 size-12 rotate-45 rounded-md bg-muted-foreground/35" />
          </div>
        </Shell>
      )
    case 'choice':
      return (
        <Shell title={t('Выбор')} run={false}>
          <div className="flex flex-col gap-1">
            {[false, true, false].map((on, at) => (
              <div key={at} className={cn('flex items-center gap-2 rounded-md px-1.5 py-1', on ? 'bg-foreground/15' : 'bg-background/50')}>
                <span className={cn('size-3 rounded-full', on ? 'bg-foreground' : 'bg-muted-foreground/40')} />
                <span className={cn('h-1.5 flex-1', bar)} />
              </div>
            ))}
          </div>
        </Shell>
      )
    case 'text':
      return <Shell title={t('Подпись')} run={false}><Lines rows={['100%', '75%']} /></Shell>
    case 'frame':
      return <div className="size-full rounded-lg border border-dashed border-muted-foreground/50 bg-muted/30" />
    default:
      return <Shell title={t('Нода')}><Lines rows={['80%', '60%']} /></Shell>
  }
}
