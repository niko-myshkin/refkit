import { ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import Components from './Components'
import Fonts from './Fonts'
import Metrics from './Metrics'
import NodeGallery from './NodeGallery'
import OwnComponents from './OwnComponents'
import Tokens from './Tokens'

// «Система» — живая витрина дизайн-системы: токены читаются из index.css, компоненты — настоящие.
// Каждый раздел в своём файле, чтобы страница росла по частям.
export default function SystemPage() {
  return (
    <div className="h-svh overflow-y-auto bg-background text-foreground">
      <header className="sticky top-0 z-(--z-sticky) flex items-center gap-2 border-b bg-background px-6 py-3">
        <Button variant="ghost" size="icon-sm" aria-label="Назад в библиотеку" onClick={() => { window.location.hash = '' }}><ArrowLeft /></Button>
        <h1 className="text-xl font-semibold">Система</h1>
      </header>
      <main className="mx-auto flex max-w-5xl flex-col gap-12 px-6 py-8">
        <Tokens />
        <Components />
        <OwnComponents />
        <NodeGallery />
        <Fonts />
        <Metrics />
      </main>
    </div>
  )
}
