import { useEffect, useState } from 'react'
import { t } from '@/lib/i18n'
import { Check, Copy } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { library } from '@/lib/library'

// Подключить библиотеку к своему агенту (R16): одна команда в терминале — и Claude Code или Codex видит библиотеку и память.
// Данные не уходят с машины: MCP читает папку библиотеки
export function ConnectAgent({ initial = 'claude' }: { initial?: 'claude' | 'codex' }) {
  const [commands, setCommands] = useState<{ claude: string; codex: string }>()
  const [agent, setAgent] = useState<'claude' | 'codex'>(initial)
  const [copied, setCopied] = useState(false)
  useEffect(() => { library.mcpCommands().then(setCommands).catch(() => {}) }, [])
  if (!commands) return null
  const copy = () => { void navigator.clipboard.writeText(commands[agent]); setCopied(true); setTimeout(() => setCopied(false), 1200) }
  return (
    <div className="flex flex-col gap-2">
      <Tabs value={agent} onValueChange={(value) => setAgent(value as 'claude' | 'codex')}>
        <TabsList><TabsTrigger value="claude">Claude Code</TabsTrigger><TabsTrigger value="codex">Codex</TabsTrigger></TabsList>
      </Tabs>
      <div className="flex items-start gap-1 rounded-control bg-muted p-2">
        <code className="min-w-0 flex-1 break-all font-mono text-xs leading-relaxed">{commands[agent]}</code>
        <Button variant="ghost" size="icon-xs" aria-label={t('Скопировать команду')} onClick={copy}>{copied ? <Check /> : <Copy />}</Button>
      </div>
    </div>
  )
}
