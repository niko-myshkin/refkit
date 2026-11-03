import { useEffect, useState } from 'react'
import { t } from '@/lib/i18n'
import { createRoot } from 'react-dom/client'
import { Folder, FolderInput, Inbox, Layers, Link2, Tag } from 'lucide-react'
import { CollectionChip } from '@/components/collection-chip'
import { CollectionPicker } from '@/components/collection-picker'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Kbd, KbdGroup } from '@/components/ui/kbd'
import { Textarea } from '@/components/ui/textarea'
import { TooltipProvider } from '@/components/ui/tooltip'
import { tagsByMeaning, type Collection } from '@/lib/collections'
import './popup.css'
import { Collect } from './collect'
import { enqueue, send, server } from './send'

// Окно расширения — тот же порядок, что у окна добавления в Refkit (add-dialog.tsx): «Расскажи о нём…»,
// подсказанные теги, space, «Сохранить» (⌘↵). Компоненты и токены — общие из src/, окно собирается отдельно.
type Clip = { url: string; title: string; author: string; description: string; cover: string; text: string }
type Folder = { id: string; name: string; inbox?: boolean; parent?: string }

async function readTab(): Promise<Clip> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (!tab?.id || !/^https?:/.test(tab.url ?? '')) throw new Error(t('Эту страницу сохранить нельзя'))
  await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['extract.js'] })
  const [{ result }] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: () => (window as unknown as { __refkitClip: Clip }).__refkitClip })
  return result as Clip
}

const flat = (folders: Folder[], parent?: string, depth = 0): Array<{ item: Folder; depth: number }> =>
  folders.filter((item) => item.parent === parent).sort((a, b) => Number(Boolean(b.inbox)) - Number(Boolean(a.inbox)))
    .flatMap((item) => [{ item, depth }, ...flat(folders, item.id, depth + 1)])

function Popup() {
  const [clip, setClip] = useState<Clip>()
  const [collections, setCollections] = useState<Collection[]>([])
  const [folders, setFolders] = useState<Folder[]>([])
  const [about, setAbout] = useState('')
  const [picked, setPicked] = useState<string[]>([])
  const [folder, setFolder] = useState<string | undefined>()
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [offline, setOffline] = useState(false)
  const [queued, setQueued] = useState(false)
  const [collecting, setCollecting] = useState(false)

  useEffect(() => {
    void (async () => {
      try { setClip(await readTab()) } catch (e) { setError((e as Error).message); return }
      // Refkit не запущен — окно всё равно работает: страница уйдёт в очередь, но списков тегов и spaces нет
      try {
        const api = await server()
        const [list, places] = await Promise.all([api.get('collections'), api.get('folders')])
        setCollections(list); setFolders(places.folders)
      } catch { setOffline(true) }
    })()
  }, [])

  const hints = clip ? tagsByMeaning(`${clip.title} ${clip.description}`, collections).filter((name) => !picked.includes(name)).slice(0, 3) : []
  const save = async () => {
    if (!clip || saving) return
    setSaving(true)
    const body = { ...clip, description: about.trim(), collections: picked, folder }
    const result = await send(body)
    if (result === 'offline') { await enqueue(body); void chrome.runtime.sendMessage('flush'); setError(''); setQueued(true); setTimeout(() => window.close(), 1200); return }
    if (result === 'rejected') { setError(t('Не сохранилось')); setSaving(false); return }
    window.close()
  }

  const items = collections.map((item) => ({ name: item.name, icon: Tag }))
  const inFolder = folders.find((item) => item.id === folder)
  if (collecting) return <TooltipProvider><Collect onBack={() => setCollecting(false)} /></TooltipProvider>
  return (
    <TooltipProvider>
      <div className="flex w-[400px] flex-col gap-3 bg-background p-4 text-foreground" onKeyDown={(event) => { if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) { event.preventDefault(); void save() } }}>
        {clip && (
          <div className="flex min-w-0 items-center gap-2 rounded-control border bg-muted/40 px-3 py-2 text-sm">
            <Link2 className="size-4 shrink-0 text-muted-foreground" />
            <span className="truncate">{clip.title || clip.url}</span>
          </div>
        )}
        {clip?.cover && <img src={clip.cover} alt="" className="max-h-40 w-full rounded-control border object-cover" />}
        <div className="relative">
          <Textarea autoFocus aria-label={t('Описание — агент не будет придумывать своё')} placeholder={t('Расскажи о нём…')} value={about} onChange={(event) => setAbout(event.target.value)} className={hints.length ? 'min-h-24 pb-10' : 'min-h-24'} />
          {hints.length > 0 && (
            <div className="absolute inset-x-2.5 bottom-2.5 flex flex-wrap gap-1.5" role="group" aria-label={t('Подсказанные теги')}>
              {hints.map((name) => (
                <button key={name} type="button" className="rounded-full border border-dashed border-line px-2.5 py-0.5 text-xs text-muted-foreground transition-colors hover:border-solid hover:bg-muted hover:text-foreground" onClick={() => setPicked((list) => [...list, name])}>{name}</button>
              ))}
            </div>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label={t('Space и теги')}>
          {inFolder && <CollectionChip icon={inFolder.inbox ? Inbox : Folder} name={inFolder.name} onRemove={() => setFolder(undefined)} />}
          {picked.map((name) => <CollectionChip key={name} icon={Tag} name={name} onRemove={() => setPicked((list) => list.filter((item) => item !== name))} />)}
          <DropdownMenu>
            <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="bg-muted/50 text-muted-foreground" aria-label="Space"><FolderInput /></Button></DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="max-h-60">
              <DropdownMenuRadioGroup value={folder ?? ''} onValueChange={(next) => setFolder(next || undefined)}>
                {flat(folders).map(({ item, depth }) => <DropdownMenuRadioItem key={item.id} value={item.id} style={{ paddingLeft: 28 + depth * 14 }}>{item.name}</DropdownMenuRadioItem>)}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
          <CollectionPicker collections={items} picked={picked} onPick={(name) => setPicked((list) => [...list, name])} onCreate={async (name) => { const api = await server(); const next = await fetch(`${api.base}/api/library/collections`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) }).then((response) => response.json()); setCollections(next) }} />
        </div>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        {queued ? <p role="status" className="text-sm text-muted-foreground">{t('Refkit не запущен — страница в очереди, уйдёт сама')}</p> : offline && <p className="text-sm text-muted-foreground">{t('Refkit не запущен — страница уйдёт в очередь')}</p>}
        <div className="flex items-center justify-between">
          <Button variant="secondary" onClick={() => setCollecting(true)}><Layers />{t('Собрать все вкладки')}</Button>
          <Button onClick={() => void save()} disabled={!clip} loading={saving}>{t('Сохранить')} <KbdGroup><Kbd>⌘</Kbd><Kbd>↵</Kbd></KbdGroup></Button>
        </div>
      </div>
    </TooltipProvider>
  )
}

createRoot(document.getElementById('root')!).render(<Popup />)
