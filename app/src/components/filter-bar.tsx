import type { ReactNode } from 'react'
import { t } from '@/lib/i18n'
import { Shapes, Tag } from 'lucide-react'
import { FilterMenu, type FilterOption } from '@/components/filter-menu'
import { cn } from '@/lib/utils'

// Ряд фильтров материалов — ОДИН на всё приложение (лента, граф, «Полёт»): те же кнопки, те же иконки, тот же отступ.
// Менять вид или положение ряда — только здесь. floating — ряд лежит поверх сцены (граф, полёт): вне кнопок клики проходят насквозь.
type Filter = { value: string | null; onChange: (value: string | null) => void; options: FilterOption[] }

export function FilterBar({ type, tag, tagActions, found, end, floating, className }: {
  type: Filter; tag: Filter
  tagActions?: ReactNode // у ленты: «⋯» выбранного тега
  found?: { shown: number; total: number } // «Найдено N из M» — только когда что-то отфильтровано
  end?: ReactNode // правый край: у ленты — порядок
  floating?: boolean
  className?: string
}) {
  return (
    <div className={cn('flex items-start gap-2', floating && 'pointer-events-none absolute inset-x-0 top-0.5 z-10 [&>*]:pointer-events-auto', className)}>
      <div className="flex flex-wrap items-center gap-2">
        <FilterMenu any={t('Любой тип')} icon={Shapes} {...type} />
        <FilterMenu any={t('Любой тег')} icon={Tag} {...tag} />
        {tagActions}
      </div>
      {found && found.shown !== found.total && <span className="ml-auto self-center text-sm text-muted-foreground">{t('Найдено')} <span className="tabular-nums text-foreground">{found.shown}</span> {t('из')} <span className="tabular-nums">{found.total}</span></span>}
      {end}
    </div>
  )
}
