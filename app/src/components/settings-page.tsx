import { useCallback, useEffect, useState } from 'react'
import { t, locale } from '@/lib/i18n'
import { RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { ConnectAgent } from '@/components/connect-agent'
import { MemoryPage } from '@/components/memory-page'
import { setIconPack, useIconPack, type IconPack } from '@/icons/pack'
import { library, type Action, type ModelSettings, type ProviderState, type Providers } from '@/lib/library'
import { cn } from '@/lib/utils'

// Страница «Настройки» (прожарка 2026-10-26, сверка с Doop): кто из моделей подключён, какая модель что делает, как подключить своего агента.
// Статус аккаунтов спрашиваем у самих CLI; про лимит CLI молчит, поэтому «лимит» — по последнему упавшему запуску и снимается удачным
const clock = (at: number) => new Date(at).toLocaleString(locale, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

function accountLine(state: ProviderState | undefined) {
  if (!state) return { tone: 'idle' as const, text: t('Проверяю…') }
  if (!state.loggedIn) return { tone: 'bad' as const, text: t('Не вошёл') }
  if (state.limitAt && (!state.lastOkAt || state.limitAt > state.lastOkAt)) return { tone: 'warn' as const, text: t('Лимит исчерпан · {limitAt}', { limitAt: clock(state.limitAt) }) }
  return { tone: 'ok' as const, text: state.method ? t('Вошёл · {method}', { method: state.method }) : t('Вошёл') }
}
const dot = { ok: 'bg-emerald-500', warn: 'bg-amber-500', bad: 'bg-destructive', idle: 'bg-muted-foreground/40' }

export function SettingsPage({ settings, onModels, actionLabels }: { settings?: ModelSettings; onModels: (models: Partial<Record<Action, string>>) => void; actionLabels: Array<{ action: Action; label: string }> }) {
  const [providers, setProviders] = useState<Providers>()
  const [checking, setChecking] = useState(false)
  const check = useCallback((fresh: boolean) => { setChecking(true); library.providers(fresh).then(setProviders).catch(() => {}).finally(() => setChecking(false)) }, [])
  useEffect(() => { check(false) }, [check])
  // Вход: CLI открывает браузер на этой машине; пока ждём подтверждения, раз в 3 с спрашиваем статус (не дольше 5 минут)
  const [waiting, setWaiting] = useState<'claude' | 'codex' | null>(null)
  useEffect(() => {
    if (!waiting) return
    const until = Date.now() + 300_000
    const timer = setInterval(() => {
      library.providers(true).then((next) => { setProviders(next); if (next[waiting].loggedIn || Date.now() > until) setWaiting(null) }).catch(() => {})
    }, 3000)
    return () => clearInterval(timer)
  }, [waiting])
  const signIn = (key: 'claude' | 'codex') => { setWaiting(key); library.login(key).catch(() => setWaiting(null)) }
  const iconPack = useIconPack()
  const accounts: Array<{ key: 'claude' | 'codex'; name: string; hint: string }> = [
    { key: 'claude', name: 'Claude Code', hint: t('Модели Claude: Haiku, Sonnet, Opus.') },
    { key: 'codex', name: 'Codex', hint: t('Модели GPT и картинки по подписке ChatGPT.') },
  ]
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-10 px-(--canvas-gutter) pt-6 pb-24">
      <section aria-labelledby="set-accounts" className="flex flex-col gap-3">
        <div className="flex items-center gap-1">
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <h2 id="set-accounts" className="text-sm font-medium">{t('Аккаунты моделей')}</h2>
            <p className="text-xs text-muted-foreground">{t('Агент работает на твоей подписке, ключи Refkit не хранит. Лимиты и расходы — твоего провайдера.')}</p>
          </div>
          <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon-sm" aria-label={t('Проверить заново')} disabled={checking} onClick={() => check(true)}><RefreshCw className={cn(checking && 'animate-spin')} /></Button></TooltipTrigger><TooltipContent>{t('Проверить заново')}</TooltipContent></Tooltip>
        </div>
        <ul className="flex flex-col divide-y divide-line rounded-lg bg-muted/40">
          {accounts.map(({ key, name, hint }) => {
            const line = accountLine(providers?.[key])
            return (
              <li key={key} className="flex items-center gap-3 px-4 py-3">
                <span aria-hidden className={cn('size-2 shrink-0 rounded-full', dot[line.tone])} />
                <div className="flex min-w-0 flex-1 flex-col"><span className="text-sm">{name}</span><span className="text-xs text-muted-foreground">{hint}</span></div>
                {waiting === key
                  ? <span className="shrink-0 text-xs text-muted-foreground">{t('Жду вход в браузере…')}</span>
                  : <>
                    <span className={cn('shrink-0 text-xs', line.tone === 'ok' ? 'text-muted-foreground' : line.tone === 'idle' ? 'text-muted-foreground' : 'text-foreground')}>{line.text}</span>
                    {providers && !providers[key].loggedIn && <Button size="xs" variant="secondary" className="shrink-0" onClick={() => signIn(key)}>{t('Войти')}</Button>}
                  </>}
              </li>
            )
          })}
        </ul>
      </section>

      <section aria-labelledby="set-models" className="flex flex-col gap-3">
        <div className="flex flex-col gap-0.5">
          <h2 id="set-models" className="text-sm font-medium">{t('Какая модель что делает')}</h2>
          <p className="text-xs text-muted-foreground">{t('Раскладка идёт в фоне при добавлении — ей хватает самой дешёвой. Глубина — у самих действий.')}</p>
        </div>
        {settings && (
          <FieldGroup className="max-w-sm gap-4">
            {actionLabels.map(({ action, label }) => (
              <Field key={action}>
                <FieldLabel htmlFor={`model-${action}`}>{label}</FieldLabel>
                <Select value={settings.assigned[action]} onValueChange={(value) => onModels({ [action]: value })}>
                  <SelectTrigger id={`model-${action}`} className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {settings.models.map((model) => (
                      <SelectItem key={model.key} value={model.key}>{model.label}<span className="caption">{model.note}</span></SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            ))}
          </FieldGroup>
        )}
      </section>

      <section aria-labelledby="set-memory" className="flex flex-col gap-3">
        <div className="flex flex-col gap-0.5">
          <h2 id="set-memory" className="text-sm font-medium">{t('Память')}</h2>
          <p className="text-xs text-muted-foreground">{t('Как агент отвечает и что он о тебе помнит. Лежит файлами в папке библиотеки, поэтому смена агента её не сбрасывает.')}</p>
        </div>
        <MemoryPage embedded />
      </section>

      <section aria-labelledby="set-agent" className="flex flex-col gap-3">
        <div className="flex flex-col gap-0.5">
          <h2 id="set-agent" className="text-sm font-medium">{t('Подключить своего агента')}</h2>
          <p className="text-xs text-muted-foreground">{t('Одна команда в терминале, и Claude Code или Codex видит библиотеку, холсты и память. Данные не уходят с компьютера. После команды агент предлагает правки, принимаешь ты.')}</p>
        </div>
        <ConnectAgent />
      </section>

      <section aria-labelledby="set-look" className="flex flex-col gap-3">
        <h2 id="set-look" className="text-sm font-medium">{t('Внешний вид')}</h2>
        <Field className="max-w-sm">
          <FieldLabel htmlFor="icon-pack">{t('Иконки')}</FieldLabel>
          <Select value={iconPack} onValueChange={(value) => setIconPack(value as IconPack)}>
            <SelectTrigger id="icon-pack" className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="solar">Solar</SelectItem><SelectItem value="classic">{t('Обычные')}</SelectItem><SelectItem value="soft">{t('Мягкие')}</SelectItem></SelectContent>
          </Select>
        </Field>
      </section>
    </div>
  )
}
