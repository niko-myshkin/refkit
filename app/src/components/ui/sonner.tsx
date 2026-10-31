import { useEffect, useState } from "react"
import { Toaster as Sonner, type ToasterProps } from "sonner"
import { OctagonXIcon } from "lucide-react"
import { useContentCenter } from "@/lib/use-content-center"

// Тема в проекте — класс dark на <html> (переключатель в сайдбаре), а не next-themes, поэтому тема читается оттуда и следит за сменой.
function useDocumentTheme(): ToasterProps["theme"] {
  const read = () => document.documentElement.classList.contains("dark") ? "dark" : "light"
  const [theme, setTheme] = useState<ToasterProps["theme"]>(read)
  useEffect(() => {
    const observer = new MutationObserver(() => setTheme(read()))
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] })
    return () => observer.disconnect()
  }, [])
  return theme
}

// Уведомления: тёмная «пилюля» по центру внизу, над плавающей панелью, по ширине текста (владелец 2026-10-03; у sonner ширина фиксированная); слой — --z-toast (index.css), цвета — токены popover.
// Иконка только у ошибок; у обычных уведомлений текст, у переноса и удаления — кнопка «Отменить» (lib/notify.ts)
const Toaster = ({ ...props }: ToasterProps) => {
  const theme = useDocumentTheme()
  const center = useContentCenter()
  return (
    <Sonner
      theme={theme}
      position="bottom-center"
      offset={{ bottom: 88 }}
      mobileOffset={{ bottom: 88 }}
      className="toaster group"
      icons={{ success: null, info: null, warning: null, loading: null, error: <OctagonXIcon className="size-4" /> }}
      style={
        {
          zIndex: "var(--z-toast)",
          ...(center === null ? {} : { left: center }),
          "--normal-bg": "var(--glass-bg)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "calc(var(--radius) * 1.4)",
          // Крестик — в правом верхнем углу, а не в левом, как у sonner по умолчанию (владелец 2026-10-15: слева крестика нигде быть не должно)
          "--toast-close-button-start": "unset",
          "--toast-close-button-end": "0",
          "--toast-close-button-transform": "translate(35%, -35%)",
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast: "cn-toast backdrop-blur-(--glass-blur) !w-fit !max-w-[calc(100vw-32px)] !left-0 !right-0 !mx-auto !gap-3 !py-2.5 !pl-4 !pr-2.5",
          actionButton: "!h-7 !rounded-lg !bg-secondary !px-3 !text-xs !font-medium !text-secondary-foreground hover:!bg-muted",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
