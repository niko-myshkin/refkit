import { createContext, useContext, useEffect, useState, type ComponentProps } from 'react'
import { SidebarProvider } from '@/components/ui/sidebar'

// Состояние рейки (открыта ли, какой ширины) живёт здесь, а не в LibraryWireframe: иначе каждое раскрытие
// перерисовывает всю ленту (замер 2026-11-01: ~550 мс главного потока). children приходят готовыми элементами,
// поэтому при смене состояния React их не пересчитывает — перерисовывается только рейка и её потребители.
const RailWidth = createContext<{ width: number; setWidth: (width: number) => void }>({ width: 224, setWidth: () => {} })
export const useRailWidth = () => useContext(RailWidth)

export function RailShell({ children, ...props }: Omit<ComponentProps<typeof SidebarProvider>, 'open' | 'onOpenChange' | 'style'>) {
  const [open, setOpen] = useState(() => { try { return localStorage.getItem('refkit.rail') === 'open' } catch { return false } })
  const [width, setWidth] = useState(() => { try { return Math.min(360, Math.max(160, Number(localStorage.getItem('refkit.railWidth')) || 224)) } catch { return 224 } })
  // --rail-w на <html> — для всего, что стоит рядом с рейкой (острова холста и т.п.)
  useEffect(() => {
    try { localStorage.setItem('refkit.rail', open ? 'open' : 'closed'); localStorage.setItem('refkit.railWidth', String(width)) } catch { /* без памяти — по умолчанию */ }
    document.documentElement.style.setProperty('--rail-w', open ? `${width}px` : '56px')
  }, [open, width])
  return (
    <RailWidth.Provider value={{ width, setWidth }}>
      <SidebarProvider open={open} onOpenChange={setOpen} style={{ '--sidebar-width': `${width}px` } as React.CSSProperties} {...props}>{children}</SidebarProvider>
    </RailWidth.Provider>
  )
}
