import { useEffect, useState } from 'react'
import { t } from '@/lib/i18n'
import { Check, Folder, FolderInput, Inbox, Link2, Tag, type LucideIcon } from 'lucide-react'
import { CollectionChip } from '@/components/collection-chip'
import { ArenaImport } from '@/components/arena-import'
import { CollectionPicker } from '@/components/collection-picker'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogTitle } from '@/components/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Kbd, KbdGroup } from '@/components/ui/kbd'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'

// Окно добавления (grill-minimal.md, по образцу Fabric): любой ⌘V, перетаскивание — сначала сюда.
// Текст «Расскажи о нём…» — описание карточки (2026-10-03): агент его не переписывает, учитывает в названии и тегах
export type AddDraft = { link?: string; files?: File[]; note?: boolean } // note — «⋮ → Заметка»: текст пишется в поле ниже и сам становится материалом
export type AddFields = { description: string; folder?: string; collections: string[]; link?: string; force?: boolean; note?: string }
// Уже лежащий материал с той же ссылкой — окно предупреждает до сохранения (дубль не молча теряется и не молча плодится)
export type Existing = { id: string; title: string; place: string }

// «+» в нижней панели открывает окно с пустой ссылкой (link: '') — поле ввода и «Файл…» (onPickFile)
export function AddDialog({ hintsFor, draft, folders, defaultFolder, collections, onCreateCollection, onSave, onClose, onPickFile, findExisting, onOpenExisting }: {
  // folders — плоский список с глубиной; без выбора материал ляжет во «Входящие» (сервер)
  draft: AddDraft | null; folders: Array<{ item: { id: string; name: string; inbox?: boolean; icon?: string }; depth: number }>; defaultFolder?: string
  collections: Array<{ name: string; icon: LucideIcon }>; onCreateCollection: (name: string) => Promise<void>
  onSave: (fields: AddFields) => void; onClose: () => void; onPickFile?: () => void
  findExisting?: (link: string) => Existing | undefined; onOpenExisting?: (id: string) => void
  hintsFor?: (link: string, folder?: string, page?: string) => string[] // подсказка тегов: по смыслу страницы, потом из прошлого (grill-tag-hints.md)
}) {
  const [link, setLink] = useState('')
  const [about, setAbout] = useState('')
  const [picked, setPicked] = useState<string[]>([])
  const [folder, setFolder] = useState<string | undefined>(undefined)
  // Превью первого файла; адрес освобождаем, когда окно закрылось
  const [preview, setPreview] = useState<string | null>(null)
  useEffect(() => {
    setAbout(''); setLink(draft?.link ?? ''); setPicked([]); setFolder(defaultFolder)
    const file = draft?.files?.[0]
    if (!file) { setPreview(null); return }
    const url = URL.createObjectURL(file)
    setPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [draft, defaultFolder])
  const typing = draft?.link === ''
  // Заголовок и описание страницы — для тегов по смыслу; сервер отвечает за доли секунды, модель не зовём
  const [page, setPage] = useState('')
  const target = link.trim() || draft?.link || ''
  useEffect(() => {
    setPage('')
    if (!/^https?:\/\//.test(target)) return
    const controller = new AbortController()
    const timer = setTimeout(() => void fetch(`/api/library/peek?link=${encodeURIComponent(target)}`, { signal: controller.signal })
      .then((response) => response.json()).then((data: { text?: string }) => setPage(data.text ?? '')).catch(() => {}), 400)
    return () => { clearTimeout(timer); controller.abort() }
  }, [target])
  const existing = /^https?:\/\//.test(link.trim()) ? findExisting?.(link.trim()) : undefined
  const noting = Boolean(draft?.note)
  const save = () => { if (noting) { if (!about.trim()) return; onSave({ description: '', note: about.trim(), folder, collections: picked }); return } if (typing && !/^https?:\/\//.test(link.trim())) return; onSave({ description: about.trim(), folder, collections: picked, link: link.trim() || undefined, force: existing ? true : undefined }) }
  const file = draft?.files?.[0]
  const more = (draft?.files?.length ?? 0) - 1
  const inFolder = folders.find(({ item }) => item.id === folder)?.item
  const hints = (hintsFor?.(target, folder, page) ?? []).filter((name) => !picked.includes(name)).slice(0, 3)

  return (
    <Dialog open={draft !== null} onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="gap-3 sm:max-w-lg" onKeyDown={(event) => { if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) { event.preventDefault(); save() } }}>
        {/* Заголовок — только для скринридера: что добавляешь, видно по ссылке или превью */}
        <DialogTitle className="sr-only">{noting ? t('Новая заметка') : t('Добавить в библиотеку')}</DialogTitle>
        {typing && (
          <div className="flex items-center gap-2 pr-8">
            <Input autoFocus aria-label={t('Ссылка')} value={link} onChange={(event) => setLink(event.target.value)} />
            {onPickFile && <Button variant="outline" onClick={() => { onClose(); onPickFile() }}>{t('Файл…')}</Button>}
          </div>
        )}
        {typing && /(^|\/\/)(www\.)?are\.na\//i.test(link.trim()) && <ArenaImport link={link.trim()} />}
        {draft?.link && (
          <div className="flex min-w-0 items-center gap-2 rounded-control border bg-muted/40 px-3 py-2 pr-10 text-sm">
            <Link2 className="size-4 shrink-0 text-muted-foreground" />
            <span className="truncate">{draft.link}</span>
          </div>
        )}
        {existing && (
          <div role="status" className="flex items-center gap-2 rounded-control bg-muted px-3 py-2 text-sm">
            <span className="min-w-0 flex-1">{t('Уже есть:')} <span className="font-medium">«{existing.title}»</span> · {existing.place}</span>
            {onOpenExisting && <Button variant="secondary" size="sm" onClick={() => { onClose(); onOpenExisting(existing.id) }}>{t('Открыть')}</Button>}
          </div>
        )}
        {file && preview && (
          <div className="relative overflow-hidden rounded-control border bg-muted/40">
            {file.type.startsWith('video')
              ? <video src={preview} muted className="max-h-56 w-full object-contain" />
              : <img src={preview} alt={file.name} className="max-h-56 w-full object-contain" />}
            {more > 0 && <span className="absolute right-2 bottom-2 glass rounded-lg border px-2 py-0.5 text-xs">+{more}</span>}
          </div>
        )}
        {/* До трёх подсказанных тегов внизу поля, пунктиром: клик — тег выбран; нечего подсказать — строки нет */}
        <div className="relative">
        <Textarea autoFocus={!typing} aria-label={noting ? t('Текст заметки') : t('Описание — агент не будет придумывать своё')} placeholder={noting ? t('Запиши заметку…') : t('Расскажи о нём…')} value={about} onChange={(event) => setAbout(event.target.value)} className={cn("min-h-24 resize-none", hints.length > 0 && 'pb-11')} />
          {hints.length > 0 && (
            <div className="absolute inset-x-2.5 bottom-2.5 flex flex-wrap gap-1.5" role="group" aria-label={t('Подсказанные теги')}>
              {hints.map((name) => (
                <button key={name} type="button" className="rounded-lg border border-dashed border-line px-2.5 py-0.5 text-xs text-muted-foreground transition-colors hover:border-solid hover:bg-muted hover:text-foreground" onClick={() => setPicked((list) => [...list, name])}>{name}</button>
              ))}
            </div>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2" role="group" aria-label={t('Подборки и теги')}>
          {inFolder && <CollectionChip icon={inFolder.inbox ? Inbox : Folder} name={inFolder.name} onRemove={() => setFolder(undefined)} />}
          {picked.map((name) => <CollectionChip key={`tag-${name}`} icon={collections.find((item) => item.name === name)?.icon ?? Tag} name={name} onRemove={() => setPicked((list) => list.filter((item) => item !== name))} />)}
          {/* Папка — одна: материал лежит в одном месте; без выбора — во «Входящие» */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="bg-muted/50 text-muted-foreground" aria-label={t('Папка')}><FolderInput /></Button></DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="max-h-72">
              {/* Те же значки, что в боковой панели: входящие, эмодзи папки или обычная папка; выбранная отмечена галочкой справа, вложенность — отступом */}
              {folders.map(({ item, depth }) => {
                const picked = item.id === folder || (!folder && Boolean(item.inbox))
                return (
                  <DropdownMenuItem key={item.id} onSelect={() => setFolder(item.id)} style={{ paddingLeft: 10 + depth * 14 }}>
                    {/* значок в span: иначе правило меню [&>svg]:hidden его прячет */}
                    <span aria-hidden className="grid size-4 shrink-0 place-items-center text-sm leading-none">{item.inbox ? <Inbox className="size-4" /> : item.icon ? item.icon : <Folder className="size-4" />}</span>
                    <span className="truncate">{item.name}</span>
                    {picked && <Check className="ml-auto size-4 shrink-0" />}
                  </DropdownMenuItem>
                )
              })}
            </DropdownMenuContent>
          </DropdownMenu>
          <CollectionPicker collections={collections} picked={picked} onPick={(name) => setPicked((list) => [...list, name])} onCreate={onCreateCollection} />
        </div>
        <DialogFooter className="border-t-0 bg-transparent pt-1">
          <Button variant="ghost" onClick={onClose}>{t('Отмена')} <Kbd>Esc</Kbd></Button>
          <Button onClick={save}>{existing ? t('Всё равно добавить') : t('Сохранить')} <KbdGroup><Kbd>⌘</Kbd><Kbd>↵</Kbd></KbdGroup></Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
