import { useEffect, useState } from 'react'
import { TooltipProvider } from '@/components/ui/tooltip'
import LibraryWireframe from '@/wireframes/LibraryWireframe'
import SystemPage from '@/system/SystemPage'
import { TileScaleProvider } from '@/lib/tile-scale'
import { Toaster } from '@/components/ui/sonner'

// Роутера нет: адреса на хеше. #/system — «Система» (инструмент разработки); #/card/<id> — карточка страницей, её читает
// сама библиотека (LibraryWireframe). Пока открыта система, библиотека размонтируется — открытая карточка и выделение при возврате сбросятся.
function useHash() {
  const [hash, setHash] = useState(() => window.location.hash)
  useEffect(() => {
    const onChange = () => setHash(window.location.hash)
    window.addEventListener('hashchange', onChange)
    return () => window.removeEventListener('hashchange', onChange)
  }, [])
  return hash
}

// TooltipProvider — один на всё приложение (так в shadcn): подсказки у иконок на плитках и в карточке.
function App() {
  const hash = useHash()
  return (
    <TooltipProvider>
      <TileScaleProvider>{hash === '#/system' ? <SystemPage /> : <LibraryWireframe />}</TileScaleProvider>
      <Toaster />
    </TooltipProvider>
  )
}

export default App
