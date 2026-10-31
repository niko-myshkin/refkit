import { CircleHelp } from 'lucide-react'
import { t } from '@/lib/i18n'
import { Separator } from '@/components/ui/separator'
import { StepSlider } from '@/components/step-slider'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { depthLevels, type Depth, type ModelSettings } from '@/lib/library'

// Глубина — один ползунок на всё приложение: это усилие модели, не выбор модели. Один в один как «Effort» в Claude:
// шапка «Глубина Обычно» с (?), линия, «Быстрее — Умнее» и ползунок со ступенями (общий StepSlider — тот же, что у размера плиток).
// Цену не пишем: оценка неточная, сколько ушло на деле — в кружке расхода у поля (прожарка grill-agent-column.md).
export function DepthControl({ settings, onDepth }: { settings: ModelSettings; onDepth: (depth: Depth) => void }) {
  // Уровни — только те, что принимает текущая модель (как в Claude); сохранённый недоступен — показываем ближайший ниже
  const levels = depthLevels.filter((level) => settings.models.find((model) => model.key === settings.assigned.ask)?.efforts?.includes(level.value))
  const wanted = depthLevels.findIndex((level) => level.value === settings.depth)
  const index = Math.max(0, levels.map((level) => depthLevels.indexOf(level)).filter((at) => at <= wanted).length - 1)
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between text-sm">
        <span><span className="text-muted-foreground">{t('Глубина')}</span> {levels[index]?.label}</span>
        <Tooltip>
          <TooltipTrigger asChild><CircleHelp className="size-4 text-muted-foreground" aria-label={t('Что такое глубина')} /></TooltipTrigger>
          <TooltipContent className="max-w-56">{t('Сколько модель думает над ответом: быстрее и дешевле или дольше и умнее')}</TooltipContent>
        </Tooltip>
      </div>
      <Separator />
      <div className="flex justify-between caption"><span>{t('Быстрее')}</span><span>{t('Умнее')}</span></div>
      <StepSlider label={t('Глубина')} steps={levels.length} index={index} onIndexChange={(value) => onDepth(levels[value].value)} />
    </div>
  )
}
