import { useEffect, useState } from 'react'
import { t } from '@/lib/i18n'
import { Shield, ShieldCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Label } from '@/components/ui/label'
import { library, type ActionItem, type Permissions } from '@/lib/library'
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'

// Сигнал «память поменялась» — после «Запомнить: … Да» под ответом список в панели обновляется сам
export const memoryChanged = () => window.dispatchEvent(new Event('refkit:memory'))
// Права агента (идея 53): «Всегда» по месту меняет их — список в панели перечитывается по сигналу
export const permissionsChanged = () => window.dispatchEvent(new Event('refkit:permissions'))
const permissionRows: Array<{ key: keyof Permissions; label: string }> = [
  { key: 'library', label: t('Менять библиотеку') },
  { key: 'web', label: t('Искать в сети') },
]
// Права у поля ввода (песочница 2026-10-09, приём Codex): меняются там, где даёшь задачу. На чипе — сводка,
// внутри — две строки, как раньше. Читать агент может всегда — строки нет
// Те же права, но обычными радио, чтобы лежать внутри попапа «Настройки агента»
export function PermissionsFields() {
  const [value, setValue] = useState<Permissions>()
  useEffect(() => {
    const load = () => library.permissions().then(setValue).catch(() => {})
    load()
    window.addEventListener('refkit:permissions', load)
    return () => window.removeEventListener('refkit:permissions', load)
  }, [])
  if (!value) return null
  return (
    <div className="flex flex-col gap-3">
      <span className="text-sm font-medium">{t('Права агента')}</span>
      {permissionRows.map((row) => (
        <div key={row.key} className="flex items-center justify-between gap-3 text-sm">
          <span className="text-muted-foreground">{row.label}</span>
          <RadioGroup className="flex gap-3" value={value[row.key]} onValueChange={(next) => void library.setPermissions({ [row.key]: next as Permissions[typeof row.key] }).then(setValue)}>
            <Label className="gap-1.5 font-normal"><RadioGroupItem value="ask" />{t('Спрашивать')}</Label>
            <Label className="gap-1.5 font-normal"><RadioGroupItem value="allow" />{t('Можно')}</Label>
          </RadioGroup>
        </div>
      ))}
    </div>
  )
}

export function PermissionsMenu() {
  const [value, setValue] = useState<Permissions>()
  useEffect(() => {
    const load = () => library.permissions().then(setValue).catch(() => {})
    load()
    window.addEventListener('refkit:permissions', load)
    return () => window.removeEventListener('refkit:permissions', load)
  }, [])
  if (!value) return null
  const allowed = permissionRows.filter((row) => value[row.key] === 'allow')
  const summary = !allowed.length ? t('Спрашивать') : allowed.length === permissionRows.length ? t('Можно всё') : t('Можно: {toLowerCase}', { toLowerCase: allowed[0].label.toLowerCase() })
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="xs" className="text-xs" aria-label={t('Права агента: {summary}', { summary })}>{allowed.length ? <ShieldCheck /> : <Shield />}<span className="@max-agent-narrow/agent:hidden">{summary}</span></Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="start" className="w-auto min-w-56">
        {permissionRows.map((row, index) => (
          <DropdownMenuGroup key={row.key}>
            {index > 0 && <DropdownMenuSeparator />}
            <DropdownMenuLabel className="py-1 text-xs font-normal text-muted-foreground">{row.label}</DropdownMenuLabel>
            <DropdownMenuRadioGroup value={value[row.key]} onValueChange={(next) => void library.setPermissions({ [row.key]: next as Permissions[typeof row.key] }).then(setValue)}>
              <DropdownMenuRadioItem value="ask" className="h-7 py-0 text-xs">{t('Спрашивать')}</DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="allow" className="h-7 py-0 text-xs">{t('Можно')}</DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuGroup>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
// Свои действия (№22): список один на приложение; меняется — тот же сигнал
export function useActions() {
  const [items, setItems] = useState<ActionItem[]>([])
  useEffect(() => {
    const load = () => library.actions().then(setItems).catch(() => {})
    load()
    window.addEventListener('refkit:memory', load)
    return () => window.removeEventListener('refkit:memory', load)
  }, [])
  return items
}

// Память о владельце (прожарка grill-agent-memory.md): что агент подтверждённо знает о том, как отвечать.
// Живёт в панели агента под разговорами. Клик по строке — правка по месту (Enter — сохранить, Esc — отмена, пусто — удалить),
// × — удалить. Пустая — не показывается: память появляется, когда агента впервые поправили
