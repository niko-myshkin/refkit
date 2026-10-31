import { useEffect, useState } from 'react'
import { t, locale } from '@/lib/i18n'
import { ArrowUpRight, FileUp, Plus, TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogTitle } from '@/components/ui/dialog'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { memoryChanged } from '@/components/agent-memory'
import { library, type ActionItem } from '@/lib/library'
import { MAX_HOW, parseSkill, unsupportedIn } from '@/lib/skill-import'
import { isToneLine, styleChanged } from '@/components/agent-style'

// Actions (v2, как у Fabric): сохранённые просьбы агенту. Запуск — «/» в поле или «+ Actions» под ним;
// создаются руками («Создать Action») или из повтора («Сделать действием?»). Живут только в Refkit
export const actionName = (item: ActionItem) => item.name || item.text

// Строка под названием в меню «+»: своё описание, иначе первая строка инструкции или просьбы
const actionHint = (item: ActionItem) => (item.about || (item.how ?? item.text).split('\n').find((line) => line.trim()) || '').trim()

export function ActionsMenu({ actions, onRun, onManage }: { actions: ActionItem[]; onRun: (item: ActionItem) => void; onManage: () => void }) {
  const [creating, setCreating] = useState(false)
  const [importing, setImporting] = useState(false)
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild><Button variant="ghost" size="sm" className="text-muted-foreground" aria-label={t('Действия')}><Plus /><span className="@max-agent-narrow/agent:hidden">{t('Действия')}</span></Button></DropdownMenuTrigger>
        <DropdownMenuContent side="top" align="start" className="max-h-96 w-72">
          {/* Как меню «+» у Claude/Codex: название и строка о том, что делает (grill-agent-skills.md) */}
          {actions.length > 0 && <>
            {actions.map((item) => (
              <DropdownMenuItem key={item.id} onSelect={() => onRun(item)} className="items-start gap-2 py-1.5">
                <span className="mt-0.5 text-muted-foreground">/</span>
                <span className="flex min-w-0 flex-col"><span className="truncate">{actionName(item)}</span><span className="line-clamp-2 text-xs text-muted-foreground">{actionHint(item)}</span></span>
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
          </>}
          <DropdownMenuItem onSelect={() => setCreating(true)}><Plus />{t('Новое действие…')}</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setImporting(true)}><FileUp />{t('Импортировать SKILL.md…')}</DropdownMenuItem>
          <DropdownMenuItem onSelect={onManage}><ArrowUpRight />{t('Управлять…')}</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <ActionDialog open={creating} onClose={() => setCreating(false)} />
      <ImportSkillDialog open={importing} onClose={() => setImporting(false)} />
    </>
  )
}

// Новый Action или правка (item): имя для «/», сама просьба и — необязательно — «как делать» (развёрнутая инструкция, умение), ⌘↵ — сохранить
export function ActionDialog({ open, onClose, item }: { open: boolean; onClose: () => void; item?: ActionItem }) {
  const [name, setName] = useState('')
  const [text, setText] = useState('')
  const [how, setHow] = useState('')
  const [about, setAbout] = useState('')
  useEffect(() => { if (open) { setName(item?.name ?? ''); setText(item?.text ?? ''); setHow(item?.how ?? ''); setAbout(item?.about ?? '') } }, [open, item])
  const save = () => {
    if (!text.trim()) return
    void (item ? library.updateAction(item.id, { name, text, how, about }) : library.addAction(name, text, { how, about })).then(memoryChanged)
    onClose()
  }
  // Действие про тон ответа — это стиль: «говори так» постоянно, а не «сделай это» разово (grill-agent-skills.md)
  const tone = isToneLine(`${text} ${how}`)
  const makeStyle = () => { void library.addStyle(name.trim() || text.trim().slice(0, 40), how.trim() || text.trim(), true).then(() => { styleChanged(); onClose() }) }
  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onClose() }}>
      <DialogContent className="sm:max-w-md" onKeyDown={(event) => { if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) { event.preventDefault(); save() } }}>
        <DialogTitle>{item ? t('Действие') : t('Новое действие')}</DialogTitle>
        <Input autoFocus aria-label={t('Название — его набираешь после «/»')} placeholder={t('Название для «/»')} value={name} onChange={(event) => setName(event.target.value)} />
        <Textarea aria-label={t('Что сделать агенту')} placeholder={t('Что сделать агенту')} value={text} onChange={(event) => setText(event.target.value)} className="min-h-20" />
        <Input aria-label={t('Описание для меню')} placeholder={t('Описание для меню «+» (необязательно)')} value={about} onChange={(event) => setAbout(event.target.value)} />
        <Textarea aria-label={t('Как делать')} placeholder={t('Как делать: подробная инструкция (необязательно)')} value={how} maxLength={MAX_HOW} onChange={(event) => setHow(event.target.value)} className="min-h-28" />
        {tone && <p className="text-xs text-muted-foreground">{t('Похоже на тон ответа. Если это «говори так всегда», лучше сделать стилем: он включается один раз и действует на все ответы.')}</p>}
        <DialogFooter>
          {tone && <Button variant="secondary" className="mr-auto" onClick={makeStyle}>{t('Сделать стилем')}</Button>}
          <Button variant="ghost" onClick={onClose}>{t('Отмена')}</Button>
          <Button disabled={!text.trim()} onClick={save}>{t('Сохранить')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

// Импорт SKILL.md в действие (grill-agent-skills.md): файл перетаскивают или вставляют текстом → предпросмотр с правкой и честным
// «что не сработает» → «Сохранить». Один файл — одно действие; приложенные файлы скилла не переносятся
export function ImportSkillDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [raw, setRaw] = useState('')
  const [name, setName] = useState('')
  const [about, setAbout] = useState('')
  const [how, setHow] = useState('')
  const [over, setOver] = useState(false)
  useEffect(() => { if (open) { setRaw(''); setName(''); setAbout(''); setHow('') } }, [open])
  const load = (text: string) => {
    setRaw(text)
    const skill = parseSkill(text)
    setName(skill.name); setAbout(skill.description.slice(0, 160)); setHow(skill.body.slice(0, MAX_HOW))
  }
  const read = (file?: File) => { if (file) void file.text().then(load) }
  const found = how ? unsupportedIn(`${how}`) : []
  const save = () => {
    if (!how.trim() || !name.trim()) return
    // Просьба — то, что видно в ленте как сообщение владельца: описание скилла или «Выполни …»
    const request = about.trim() || t('Выполни действие «{trim}»', { trim: name.trim() })
    void library.addAction(name.trim(), request, { how, about }).then(memoryChanged)
    onClose()
  }
  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onClose() }}>
      <DialogContent className="sm:max-w-lg">
        <DialogTitle>{t('Импорт SKILL.md')}</DialogTitle>
        {!raw ? (
          <>
            <label onDragOver={(event) => { event.preventDefault(); setOver(true) }} onDragLeave={() => setOver(false)} onDrop={(event) => { event.preventDefault(); setOver(false); read(event.dataTransfer.files[0]) }}
              className={`flex cursor-pointer flex-col items-center gap-2 rounded-container border-2 border-dashed px-4 py-8 text-center text-sm text-muted-foreground ${over ? 'border-ring bg-muted/60' : ''}`}>
              <FileUp className="size-5" />{t('Перетащи файл SKILL.md сюда или выбери')}
              <input type="file" accept=".md,text/markdown,text/plain" className="sr-only" onChange={(event) => read(event.target.files?.[0])} />
            </label>
            <Textarea aria-label={t('Или вставь текст скилла')} placeholder={t('Или вставь текст скилла')} className="min-h-24" onChange={(event) => { if (event.target.value.trim()) load(event.target.value) }} />
          </>
        ) : (
          <>
            <Input aria-label={t('Название — его набираешь после «/»')} placeholder={t('Название для «/»')} value={name} onChange={(event) => setName(event.target.value)} />
            <Input aria-label={t('Описание для меню')} placeholder={t('Описание для меню «+»')} value={about} onChange={(event) => setAbout(event.target.value)} />
            <Textarea aria-label={t('Инструкция')} value={how} maxLength={MAX_HOW} onChange={(event) => setHow(event.target.value)} className="min-h-40 text-xs" />
            <div className="flex flex-col gap-1.5 rounded-container bg-muted/60 p-3 text-sm" role="status">
              {found.length === 0
                ? <span className="text-muted-foreground">{t('Ничего недоступного агенту не нашёл. Проверка по словам, без модели: после первого запуска посмотри на ответ.')}</span>
                : <>
                  <span className="flex items-center gap-1.5 font-medium"><TriangleAlert className="size-4" />{t('Часть шагов агент не выполнит')}</span>
                  <ul className="flex flex-col gap-1 text-xs text-muted-foreground">{found.map((item) => <li key={item.label}><span className="text-foreground">{item.label}:</span> {item.hint}</li>)}</ul>
                </>}
              {raw.length > MAX_HOW && <span className="text-xs text-muted-foreground">{t('Текст длиннее {RU} знаков — обрезан: длинная инструкция дорого стоит на каждом запуске.', { RU: MAX_HOW.toLocaleString(locale) })}</span>}
            </div>
          </>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>{t('Отмена')}</Button>
          {raw && <Button variant="ghost" onClick={() => setRaw('')}>{t('Другой файл')}</Button>}
          <Button disabled={!how.trim() || !name.trim()} onClick={save}>{t('Сохранить')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
