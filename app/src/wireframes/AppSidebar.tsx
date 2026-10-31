import { useState, type ReactNode } from 'react'
import { t } from '@/lib/i18n'
import { cn } from '@/lib/utils'
import { Network, ChevronRight, Folder, FolderTree, Layers, Orbit, Tag, Moon, Settings, Sun, Trash2, type LucideIcon } from 'lucide-react'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { type Action } from '@/lib/library'
import { DropTarget } from '@/components/drop-target'
import { SidebarResizeHandle } from './SidebarResizeHandle'
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarHeader,
  SidebarMenu, SidebarMenuAction, SidebarMenuButton, SidebarMenuItem, SidebarMenuSub, SidebarMenuSubButton, SidebarMenuSubItem, useSidebar,
} from '@/components/ui/sidebar'


export const actionLabels: Array<{ action: Action; label: string }> = [
  { action: 'sort', label: t('Раскладка при добавлении') },
  { action: 'digest', label: t('Выжимка и разбор') },
  { action: 'ask', label: t('Просьбы агенту') },
]

// Старая версия — второй дев-сервер (.claude/launch.json, «app-v1»)
const v1Url = 'http://localhost:5191'

type Props = {
  canvases: Array<{ id: string; title: string }>; currentCanvasId: string | null; onOpenCanvas: (id: string) => void // список холстов под «Холстом» в раскрытой рейке
  folders: Array<{ id: string; name: string; parent?: string }>; currentFolderId: string | null; onOpenFolder: (id: string) => void // дерево под «Папками» в раскрытой рейке
  active: string | null
  // Корзина — пункт сайдбара под тегами
  trashActive: boolean; onTrash: () => void
  counts: Record<string, number>
  types: Array<{ id: string; label: string; icon: LucideIcon }>
  onNavigate: (id: string) => void
  onCreateBoard: (id?: string) => void
  onRenameBoard: (from: string, to: string) => void
  onDeleteBoard: (name: string) => void
  allFoldersActive: boolean; onAllFolders: () => void // «Папки» — экран всех папок (дерева в панели больше нет)
  actionsActive: boolean; onActions: () => void
  timelineActive: boolean; onTimeline: () => void
  tagsActive: boolean; onTags: () => void
  graphActive: boolean; onGraph: () => void
  flyActive: boolean; onFly: () => void
  onSettings: () => void
  railWidth: number; onRailWidth: (width: number) => void // ширина раскрытой рейки
  canvasActive: boolean; onCanvas: () => void // «Холст» — лента, отфильтрованная по типу «холст»
}
// Боковая панель на стандартном Sidebar shadcn: типы контента — что это (рефы, ролики, статьи).
// Подборки — о чём это — живут рядом с сеткой, под поиском. Больше ничего — приложение личное.
export function AppSidebar({ canvases, currentCanvasId, onOpenCanvas, folders, currentFolderId, onOpenFolder, railWidth, onRailWidth, onSettings, trashActive, onTrash, allFoldersActive, onAllFolders, timelineActive, onTimeline, tagsActive, onTags, graphActive, onGraph, canvasActive, onCanvas }: Props) {
  const { isMobile, setOpenMobile } = useSidebar()
  // Тема: класс dark на <html>; выбор запоминается в браузере (index.html ставит его до загрузки, без вспышки)
  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'))
  const toggleTheme = () => {
    const next = !dark
    document.documentElement.classList.toggle('dark', next)
    try { localStorage.setItem('refkit.theme', next ? 'dark' : 'light') } catch { /* приватный режим — не запоминаем */ }
    setDark(next)
  }
  // Навигация v3 (владелец 2026-10-14): устройство меню до 10.10 (тег snapshot-2026-10-09-before-agent-panel-v2) — шапка
  // с переключателем версий, «Папки» пунктом со стрелкой и деревом под ним, редкое ниже, профиль внизу; плюс новые разделы.
  // Свёрнута — полоса иконок с подсказками (collapsible="icon"). На телефоне — шторка; выбор пункта закрывает её
  // Какие папки раскрыты в дереве; «Папки» открыты сразу — видно, что лежит на верхнем уровне
  const [foldersOpen, setFoldersOpen] = useState(true)
  const [canvasesOpen, setCanvasesOpen] = useState(false)
  const [openIds, setOpenIds] = useState<Set<string>>(new Set())
  const toggleId = (id: string) => setOpenIds((set) => { const next = new Set(set); if (!next.delete(id)) next.add(id); return next })
  const branch = (parent?: string): ReactNode => folders.filter((item) => (item.parent ?? undefined) === parent).map((item) => {
    const kids = folders.some((child) => child.parent === item.id), opened = openIds.has(item.id)
    return (
      <SidebarMenuSubItem key={item.id}>
        <SidebarMenuSubButton asChild isActive={currentFolderId === item.id}><button type="button" onClick={go(() => onOpenFolder(item.id))} className="w-full"><Folder /><span className="truncate">{item.name}</span></button></SidebarMenuSubButton>
        {kids && <SidebarMenuAction aria-label={opened ? t('Свернуть') : t('Развернуть')} aria-expanded={opened} onClick={() => toggleId(item.id)} className="top-0.5"><ChevronRight className={cn('size-3.5 transition-transform', opened && 'rotate-90')} /></SidebarMenuAction>}
        {kids && opened && <SidebarMenuSub>{branch(item.id)}</SidebarMenuSub>}
      </SidebarMenuSubItem>
    )
  })
  const go = (action: () => void) => () => { action(); if (isMobile) setOpenMobile(false) }
  const item = (label: string, Icon: LucideIcon, active: boolean, onClick: () => void) => (
    <SidebarMenuItem><SidebarMenuButton isActive={active} tooltip={label} onClick={go(onClick)}><Icon /><span>{label}</span></SidebarMenuButton></SidebarMenuItem>
  )
  return (
    <Sidebar variant="floating" collapsible="icon">
      <SidebarHeader>
        {/* Панель — постоянная узкая рейка из иконок с подсказками (владелец 2026-10-27): не сворачивается и не тянется.
            «R» — главная (владелец 2026-10-29): хронология открывается им, отдельного пункта нет; версии и «Система» — в меню профиля */}
        <button type="button" aria-label={t('Главная')} aria-current={timelineActive ? 'page' : undefined} onClick={go(onTimeline)} className={cn('flex h-8 items-center rounded-lg pr-2 text-sm font-medium outline-none hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-sidebar-ring group-data-[collapsible=icon]:pr-0', timelineActive && 'bg-sidebar-accent')}>
          <span className="grid size-8 shrink-0 place-items-center"><span className="flex size-[18px] translate-x-px items-center justify-center rounded-md bg-primary text-micro leading-none font-semibold text-primary-foreground">R</span></span>
          <span className="truncate group-data-[collapsible=icon]:hidden">{t('Главная')}</span>
        </button>
      </SidebarHeader>

      <SidebarContent>
        {/* Один сплошной список с одинаковым шагом (владелец 2026-10-14: зазоры между группами лишние).
            Агента здесь нет — он в плавающей панели внизу на каждом экране */}
        <SidebarGroup className="pt-0 pb-0">
          <SidebarMenu>
            {/* Порядок по сути продукта (скептик 2026-10-14): лента, память, граф — над деревом, чтобы длинное дерево их не вытесняло;
                Полёт из меню выведен (эксперимент, в кейс — видео), Теги — к Корзине вниз, это обслуживание */}
            {item(t('Граф'), Orbit, graphActive, onGraph)}
            <SidebarMenuItem>
              <SidebarMenuButton isActive={canvasActive} tooltip={t('Холст')} onClick={go(onCanvas)}><Network /><span>{t('Холст')}</span></SidebarMenuButton>
              {canvases.length > 0 && <SidebarMenuAction aria-label={canvasesOpen ? t('Свернуть') : t('Развернуть')} aria-expanded={canvasesOpen} onClick={() => setCanvasesOpen((value) => !value)}><ChevronRight className={cn('size-4 transition-transform', canvasesOpen && 'rotate-90')} /></SidebarMenuAction>}
              {canvasesOpen && canvases.length > 0 && <SidebarMenuSub>{canvases.map((canvas) => (
                <SidebarMenuSubItem key={canvas.id}>
                  <SidebarMenuSubButton asChild isActive={currentCanvasId === canvas.id}><button type="button" onClick={go(() => onOpenCanvas(canvas.id))} className="w-full"><Network /><span className="truncate">{canvas.title}</span></button></SidebarMenuSubButton>
                </SidebarMenuSubItem>
              ))}</SidebarMenuSub>}
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton isActive={allFoldersActive} tooltip={t('Папки')} onClick={go(onAllFolders)}><FolderTree /><span>{t('Папки')}</span></SidebarMenuButton>
              {folders.length > 0 && <SidebarMenuAction aria-label={foldersOpen ? t('Свернуть') : t('Развернуть')} aria-expanded={foldersOpen} onClick={() => setFoldersOpen((value) => !value)}><ChevronRight className={cn('size-4 transition-transform', foldersOpen && 'rotate-90')} /></SidebarMenuAction>}
              {foldersOpen && folders.length > 0 && <SidebarMenuSub>{branch(undefined)}</SidebarMenuSub>}
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroup>
        <SidebarGroup className="mt-auto">
          <SidebarMenu>
            {item(t('Теги'), Tag, tagsActive, onTags)}
            {/* Корзина — сюда можно бросить плитку или папку (владелец 2026-10-03) */}
            <SidebarMenuItem><DropTarget id="trash">{(over, ref) => (
              <SidebarMenuButton ref={ref} isActive={trashActive} tooltip={t('Корзина')} onClick={go(onTrash)} className={cn(over && 'bg-destructive/15 text-destructive ring-2 ring-destructive/50')}><Trash2 /><span>{t('Корзина')}</span></SidebarMenuButton>
            )}</DropTarget></SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>

      {/* Профиль: настройки и тема */}
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <SidebarMenuButton tooltip={t('Николай')} className="min-w-0">
                  <Avatar aria-hidden className="size-4 rounded-sm"><AvatarFallback className="rounded-sm text-micro">{t('Н')}</AvatarFallback></Avatar>
                  <span className="truncate">{t('Николай')}</span>
                </SidebarMenuButton>
              </DropdownMenuTrigger>
              <DropdownMenuContent side="top" align="start" className="min-w-52">
                <DropdownMenuItem onSelect={() => onSettings()}><Settings />{t('Настройки')}</DropdownMenuItem>
                <DropdownMenuItem onSelect={toggleTheme}>{dark ? <Sun /> : <Moon />}{dark ? t('Светлая тема') : t('Тёмная тема')}</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => window.open(v1Url, '_blank')}><span className="size-4" />Refkit 1.0</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => { window.location.hash = '#/system' }}><Layers />{t('Система')}</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>

      {/* Край — только для ширины (правило проекта): клик по нему ничего не делает */}
      {!isMobile && <SidebarResizeHandle width={railWidth} onWidth={onRailWidth} />}
    </Sidebar>
  )
}
