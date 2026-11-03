import { useRef, type ReactNode } from 'react'
import { X } from 'lucide-react'
import { t } from '@/lib/i18n'
import { Button } from '@/components/ui/button'
import { Island } from '@/components/ui/island'
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

// Единый каркас просмотра на весь экран: картинка, экран с правками, текст результата ноды. Окно с отступом 16 px; крестик всегда вверху
// справа в островке (владелец 2026-11-01: «крестик везде вверху»; рядом — действия просмотра, как в шапке страницы: topActions), действия просмотра — плавающая панель внизу по центру.
// Esc и клик по затемнению закрывают тоже. side — правая колонка поверх окна (лента комментариев).
export function ViewerShell({ open, onClose, title, description, actions, topActions, heading, corner, side, children }: {
  open: boolean; onClose: () => void; title: string; description: string; actions?: ReactNode; topActions?: ReactNode; heading?: ReactNode; corner?: ReactNode; side?: ReactNode; children: ReactNode
}) {
  const closeRef = useRef<HTMLButtonElement>(null)
  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onClose() }}>
      <DialogContent onOpenAutoFocus={(event) => { event.preventDefault(); closeRef.current?.focus() }} showCloseButton={false} className="inset-4 top-4 left-4 flex h-[calc(100vh-2rem)] w-[calc(100vw-2rem)] max-w-none translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden rounded-xl p-0 sm:max-w-none">
        <DialogTitle className="sr-only">{title}</DialogTitle>
        <DialogDescription className="sr-only">{description}</DialogDescription>
        <div className="relative min-h-0 flex-1">
          {children}
          <div className="absolute top-3 inset-x-3 z-30 flex flex-wrap items-center justify-between gap-2">
          {heading && <div className="min-w-0 flex-1">{heading}</div>}
          <Island className="ml-auto flex-wrap justify-end [&_button]:size-8 [&_[role=combobox]]:w-auto">
            {topActions}
            <Tooltip>
              <TooltipTrigger asChild><DialogClose asChild><Button ref={closeRef} variant="ghost" size="icon" aria-label={t('Закрыть')}><X /></Button></DialogClose></TooltipTrigger>
              <TooltipContent side="bottom">{t('Закрыть (Esc)')}</TooltipContent>
            </Tooltip>
          </Island>
          </div>
          {actions && (
            <div className="absolute bottom-6 left-1/2 z-20 flex -translate-x-1/2 items-center gap-1 rounded-xl border border-line bg-card p-1 shadow-lg" role="toolbar" aria-label={title}>
              {actions}
            </div>
          )}
          {corner && <div className="absolute right-4 bottom-4 z-20">{corner}</div>}
          {side}
        </div>
      </DialogContent>
    </Dialog>
  )
}
