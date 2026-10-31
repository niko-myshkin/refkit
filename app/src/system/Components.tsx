import { Plus } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Group, Section } from './Section'

const variants = ['default', 'secondary', 'outline', 'ghost', 'destructive', 'link'] as const
const textSizes = ['xs', 'sm', 'default', 'lg'] as const
const iconSizes = ['icon-xs', 'icon-sm', 'icon', 'icon-lg'] as const

// Матрица: строка — вариант, столбец — размер. Подписи столбцов — размеры из button.tsx, не придуманные
function ButtonMatrix() {
  return (
    <div className="overflow-x-auto">
      <table className="border-separate border-spacing-x-3 border-spacing-y-2 text-left">
        <thead>
          <tr className="text-xs font-medium text-muted-foreground">
            <th scope="col" className="font-medium" />
            {[...textSizes, ...iconSizes].map((s) => <th key={s} scope="col" className="font-medium">{s}</th>)}
          </tr>
        </thead>
        <tbody>
          {variants.map((v) => (
            <tr key={v}>
              <th scope="row" className="pr-2 text-xs font-medium text-muted-foreground">{v}</th>
              {textSizes.map((s) => <td key={s}><Button variant={v} size={s}>Кнопка</Button></td>)}
              {iconSizes.map((s) => <td key={s}><Button variant={v} size={s} aria-label="Добавить"><Plus /></Button></td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function Components() {
  return (
    <Section id="components" title="Компоненты shadcn" hint="Настоящие компоненты из components/ui, не картинки: наведение, фокус и открытие работают.">
      <Group title="Button — вариант × размер">
        <ButtonMatrix />
      </Group>

      <Group title="Button — состояния">
        <div className="flex flex-wrap items-center gap-3">
          <Button>Обычная</Button>
          <Button disabled>Отключена</Button>
          <Button aria-invalid>Ошибка</Button>
        </div>
      </Group>

      <Group title="Badge">
        <div className="flex flex-wrap items-center gap-3">
          {(['default', 'secondary', 'outline', 'destructive'] as const).map((v) => <Badge key={v} variant={v}>{v}</Badge>)}
        </div>
      </Group>

      <Group title="Поля">
        <div className="grid max-w-xl gap-3">
          <Input aria-label="Поле ввода" placeholder="Input" />
          <Input aria-label="Поле с ошибкой" aria-invalid defaultValue="Input · ошибка" />
          <Input aria-label="Отключённое поле" disabled defaultValue="Input · отключено" />
          <Textarea aria-label="Многострочное поле" placeholder="Textarea" />
          <Select defaultValue="a">
            <SelectTrigger aria-label="Выбор" className="w-48"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="a">Первый</SelectItem>
              <SelectItem value="b">Второй</SelectItem>
            </SelectContent>
          </Select>
          <Checkbox aria-label="Флажок" />
        </div>
      </Group>

      <Group title="Всплывающие — открой, чтобы увидеть слой">
        <div className="flex flex-wrap items-center gap-3">
          <Tooltip>
            <TooltipTrigger asChild><Button variant="outline">Tooltip</Button></TooltipTrigger>
            <TooltipContent>Подсказка</TooltipContent>
          </Tooltip>
          <Popover>
            <PopoverTrigger asChild><Button variant="outline">Popover</Button></PopoverTrigger>
            <PopoverContent>Содержимое поповера</PopoverContent>
          </Popover>
          <DropdownMenu>
            <DropdownMenuTrigger asChild><Button variant="outline">Dropdown</Button></DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem>Пункт</DropdownMenuItem>
              <DropdownMenuItem>Ещё пункт</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive">Удалить</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Dialog>
            <DialogTrigger asChild><Button variant="outline">Dialog</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Диалог</DialogTitle>
                <DialogDescription>Затемнение на слое dialog-overlay, окно на dialog.</DialogDescription>
              </DialogHeader>
              <Popover>
                <PopoverTrigger asChild><Button variant="secondary" className="self-start">Поповер из диалога</Button></PopoverTrigger>
                <PopoverContent>Должен быть выше диалога</PopoverContent>
              </Popover>
            </DialogContent>
          </Dialog>
        </div>
      </Group>
    </Section>
  )
}
