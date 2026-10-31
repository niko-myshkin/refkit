import type { ReactNode } from "react"
import { t } from '@/lib/i18n'
import { toast } from "sonner"

// Всплывающие уведомления о том, что процесс произошёл (идея 64): перенос, удаление в корзину, создание, ошибка.
// Текст — короткое предложение в прошедшем времени. undo — «Отменить» в самом уведомлении (перенос и удаление); с ним уведомление живёт дольше.
export function notify(message: ReactNode, options: { undo?: () => void } = {}) {
  return toast(message, {
    duration: options.undo ? 6000 : 3500,
    closeButton: Boolean(options.undo), // крестик — только у долгих (с «Отменить»); короткие уходят сами
    action: options.undo ? { label: t('Отменить'), onClick: options.undo } : undefined,
  })
}

// Ошибка не пропадает быстро: человек должен успеть прочитать, что не получилось
export const notifyError = (message: string) => toast.error(message, { duration: 6000, closeButton: true })
