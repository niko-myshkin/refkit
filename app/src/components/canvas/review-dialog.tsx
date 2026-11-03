import { AgentCopyIcon } from '@/components/agent-copy-icon'
import { useEffect, useState } from 'react'
import { t } from '@/lib/i18n'
import { Download, ZoomIn, ZoomOut, ListChecks, MessageSquarePlus, Type } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ViewerShell } from '@/components/viewer-shell'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { CommentFeed, type CardComment } from '@/components/comment-feed'
import { PinLayer } from '@/components/pin-layer'
import { ScaledFrame, screenSize } from '@/components/canvas/nodes'

// Развёрнутый «Экран» или «Картинка»: слева результат с точками комментариев, справа лента. Точки — доли 0…1 от ширины и
// высоты результата; «Применить правки» отдаёт агенту всю ленту разом (запуск только по этой кнопке)
export type ReviewNode = { id: string; type: 'screen' | 'image'; title?: string; result?: string; imageFile?: string; comments?: CardComment[]; running?: boolean; readOnly?: boolean }

export function ReviewDialog({ node, onClose, onComments, onApply, onEditText, onCopy, onDownload }: {
  onCopy?: (id: string) => void; onDownload?: (id: string) => void; node: ReviewNode | null; onClose: () => void; onComments: (id: string, comments: CardComment[]) => void; onApply: (id: string) => void; onEditText?: (id: string, from: string, to: string) => void
}) {
  const [zoomed, setZoomed] = useState(false)
  useEffect(() => { setZoomed(false) }, [node?.id])
  const [pinMode, setPinMode] = useState(false)
  const [editMode, setEditMode] = useState(false) // правка текста руками на экране: клик по тексту, Enter сохраняет
  const [hover, setHover] = useState<string | null>(null)
  const [pageH, setPageH] = useState(0)
  useEffect(() => { if (!node) { setPinMode(false); setEditMode(false); setHover(null) } }, [node])
  useEffect(() => {
    if (!node || node.readOnly) return
    const onKey = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLElement && /^(INPUT|TEXTAREA)$/.test(event.target.tagName)) return
      if (event.key === 'Escape' && pinMode) { event.preventDefault(); event.stopPropagation(); setPinMode(false); return }
      if ((event.key === 'c' || event.key === 'с') && !event.metaKey && !event.ctrlKey && !event.altKey) { event.preventDefault(); setEditMode(false); setPinMode((on) => !on) }
      if ((event.key === 'e' || event.key === 'у') && !event.metaKey && !event.ctrlKey && !event.altKey && node?.type === 'screen') { event.preventDefault(); setPinMode(false); setEditMode((on) => !on) }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [node, pinMode])
  const comments = node?.readOnly ? [] : node?.comments ?? []
  const set = (next: CardComment[]) => node && onComments(node.id, next)
  const add = (text: string, x?: number, y?: number) => set([...comments, { id: `c-${Date.now()}`, text, at: Date.now(), ...(x !== undefined && y !== undefined ? { x, y, ...(screen && pageH ? { h: pageH } : {}) } : {}) }])
  const layer = <PinLayer comments={comments} active={pinMode} onHover={setHover} onSave={(text, x, y) => { add(text, x, y); setPinMode(false) }} onCancel={() => setPinMode(false)} />
  const screen = node?.type === 'screen'
  const note = screen && node?.result ? (/<body[^>]*data-screen="page"/i.test(node.result) ? t('1440 px, высота по содержимому') : screenSize(node.result).join(' × ')) : ''
  // Одно окно на весь экран: результат крупно, без подписей; управление — плавающая панель снизу (как у холста), лента комментариев открывается по кнопке
  // и сама появляется, когда есть что в ней показать
  const [feedOpen, setFeedOpen] = useState(false)
  useEffect(() => { if (!node) setFeedOpen(false) }, [node])
  return (
    <ViewerShell open={node !== null} onClose={onClose} title={screen ? (node?.title ?? t('Экран')) : (node?.title ?? t('Картинка'))}
      description={screen ? t('Страница в закрытой песочнице, {note}.', { note }) : t('Точка на картинке — правка к этому месту.')}
      actions={node && (
        <>
              {onCopy && <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" aria-label={t('Скопировать для агента')} onClick={() => onCopy(node.id)}><AgentCopyIcon /></Button></TooltipTrigger><TooltipContent>{t('Скопировать для агента')}</TooltipContent></Tooltip>}
              {onDownload && <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" aria-label={t('Скачать')} onClick={() => onDownload(node.id)}><Download /></Button></TooltipTrigger><TooltipContent>{t('Скачать')}</TooltipContent></Tooltip>}
              {!screen && <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" aria-label={zoomed ? t('Вписать') : t('Увеличить')} onClick={() => setZoomed(!zoomed)}>{zoomed ? <ZoomOut /> : <ZoomIn />}</Button></TooltipTrigger><TooltipContent>{zoomed ? t('Вписать') : t('Увеличить')}</TooltipContent></Tooltip>}
              {!node.readOnly && <Tooltip>
                <TooltipTrigger asChild><Button variant={pinMode ? 'secondary' : 'ghost'} size="icon" aria-label={t('Комментарий в точке')} aria-pressed={pinMode} onClick={() => setPinMode(!pinMode)}><MessageSquarePlus /></Button></TooltipTrigger>
                <TooltipContent side="top">{t('Комментарий в точке (C)')}</TooltipContent>
              </Tooltip>}
              {screen && !node.readOnly && onEditText && (
                <Tooltip>
                  <TooltipTrigger asChild><Button variant={editMode ? 'secondary' : 'ghost'} size="icon" aria-label={t('Править текст')} aria-pressed={editMode} onClick={() => { setPinMode(false); setEditMode(!editMode) }}><Type /></Button></TooltipTrigger>
                  <TooltipContent side="top">{t('Править текст (E)')}</TooltipContent>
                </Tooltip>
              )}
              {comments.length > 0 && (
                <Tooltip>
                  <TooltipTrigger asChild><Button variant={feedOpen ? 'secondary' : 'ghost'} size="icon" className="relative" aria-label={t('Правки')} aria-pressed={feedOpen} onClick={() => setFeedOpen(!feedOpen)}><ListChecks /><span className="absolute -top-1 -right-1 grid size-4 place-items-center rounded-full bg-primary text-[10px] font-medium text-primary-foreground">{comments.length}</span></Button></TooltipTrigger>
                  <TooltipContent side="top">{t('Правки')}</TooltipContent>
                </Tooltip>
              )}
              {comments.length > 0 && <Button className="ml-1" disabled={node.running} onClick={() => onApply(node.id)}>{t('Применить правки')} ({comments.length})</Button>}
        </>
      )}
      side={node && (
            <>{feedOpen && comments.length > 0 && (
              <div className="absolute top-16 right-4 bottom-24 flex w-80 flex-col overflow-auto rounded-xl border border-line bg-card p-3 shadow-lg">
                <CommentFeed comments={comments} hovered={hover} onHover={setHover} placeholder={t('Что поправить')} title={t('Правки')}
                  onAdd={(text) => add(text)}
                  onEdit={(id, text) => set(comments.map((item) => item.id === id ? { ...item, text, editedAt: Date.now() } : item))}
                  onRemove={(id) => set(comments.filter((item) => item.id !== id))} />
              </div>
            )}</>
      )}>
      {node && (
        <>
            {editMode && <div className="pointer-events-none absolute top-4 left-1/2 z-20 -translate-x-1/2 rounded-full border border-line bg-card px-4 py-2 text-xs shadow-lg">{t('Кликни по тексту, поправь, Enter — сохранить, Esc — отмена')}</div>}
            {pinMode && <div className="pointer-events-none absolute top-4 left-1/2 z-20 -translate-x-1/2 rounded-full border border-line bg-card px-4 py-2 text-xs shadow-lg">{t('Кликни по месту, к которому нужна правка · Esc — отмена')}</div>}
            <div className="h-full overflow-auto bg-muted/30 px-6 pt-6 pb-28">
              <div className="mx-auto w-full max-w-[1440px]">
                {screen && node.result && <ScaledFrame html={node.result} interactive overlay={layer} onPageHeight={setPageH} editing={editMode} onEdited={(edit) => onEditText?.(node.id, edit.from, edit.to)} />}
                {!screen && node.imageFile && <div className="relative mx-auto w-fit"><img src={node.imageFile} alt={node.title ?? t('Картинка')} className={zoomed ? 'block max-w-none rounded-lg' : 'block max-h-[calc(100vh-10rem)] max-w-full rounded-lg'} />{layer}</div>}
              </div>
            </div>
        </>
      )}
    </ViewerShell>
  )
}
