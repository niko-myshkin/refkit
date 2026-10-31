import { useEffect, useState } from 'react'
import { LogIn, Loader2 } from 'lucide-react'
import { t } from '@/lib/i18n'
import { Button } from '@/components/ui/button'
import { library } from '@/lib/library'

// Ошибка агента. Если это слетевший вход (Claude Code или Codex), вместо сырого текста — понятная фраза и кнопка «Войти»:
// сервер сам запускает вход CLI, браузер открывается на этой машине, кнопка ждёт, пока вход закончится
const signedOut = /oauth|authenticat|not logged in|log ?in|sign ?in|unauthorized|401|expired/i
const providerOf = (message: string): 'claude' | 'codex' => /codex|openai|gpt/i.test(message) ? 'codex' : 'claude'

export function AgentError({ message, className }: { message: string; className?: string }) {
  const [state, setState] = useState<'idle' | 'waiting' | 'done'>('idle')
  const provider = providerOf(message)
  useEffect(() => {
    if (state !== 'waiting') return
    const timer = setInterval(() => { void library.signingIn().then((running) => { if (!running[provider]) setState('done') }).catch(() => {}) }, 2000)
    return () => clearInterval(timer)
  }, [state, provider])
  if (!signedOut.test(message)) return <p className={className ?? 'text-xs text-destructive'}>{t('Не получилось: {digestError}', { digestError: message })}</p>
  const name = provider === 'codex' ? 'Codex' : 'Claude'
  return (
    <div className="flex flex-col items-start gap-2 text-sm">
      <span className="text-muted-foreground">{state === 'done' ? t('Вход выполнен. Запусти действие ещё раз') : t('{name} вышел из аккаунта. Войди заново, чтобы продолжить', { name })}</span>
      {state !== 'done' && (
        <Button variant="outline" size="sm" disabled={state === 'waiting'} onClick={() => { setState('waiting'); void library.login(provider).catch(() => setState('idle')) }}>
          {state === 'waiting' ? <Loader2 className="animate-spin" /> : <LogIn />}{state === 'waiting' ? t('Жду подтверждения в браузере') : t('Войти в {name}', { name })}
        </Button>
      )}
    </div>
  )
}
