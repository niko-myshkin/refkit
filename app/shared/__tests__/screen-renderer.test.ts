import { describe, expect, it } from 'vitest'
import { compileScreen, parseScreen, screenContract } from '../../screen-renderer.ts'
import { resultForAgent } from '../canvas-result.mjs'
import { mergeIncoming } from '../canvas-graph.mjs'

const encode = (code: string) => JSON.stringify({ code, platform: 'web', theme: 'light' })

describe('React screen boundary', () => {
  it('uses the selected catalog and keeps legacy screens on shadcn', () => {
    const code = "import { Button } from '@/components/fluid/button'; export default () => <Button>Fluid</Button>"
    expect(() => parseScreen(encode(code))).toThrow(/каталога/)
    expect(parseScreen(encode(code), 'fluid').designSystem).toBe('fluid')
    expect(() => parseScreen(encode("import { Button } from '@/components/ui/button'; export default () => <Button />"), 'fluid')).toThrow(/каталога/)
    const contract = screenContract('fluid')
    expect(contract).toContain('@/components/fluid/button:')
    expect(contract).toContain('onToggle: () => void')
    expect(contract).not.toContain('@/components/ui/button:')
  })

  it('bundles Fluid controls, providers and animation tokens without replacing shadcn', async () => {
    const source = parseScreen(encode("import { Button } from '@/components/fluid/button'; import { Switch } from '@/components/fluid/switch'; import { Tabs, TabsList, TabItem, TabPanel } from '@/components/fluid/tabs'; export default function Screen() { return <main><Button>Fluid</Button><Switch label='Motion' checked={true} onToggle={() => {}} /><Tabs defaultValue='one'><TabsList><TabItem value='one' label='One' /></TabsList><TabPanel value='one'>Panel</TabPanel></Tabs></main> }"), 'fluid')
    const html = await compileScreen(source)
    expect(html).toContain('data-design-system="fluid"')
    expect(html).toContain('--surface-1:')
    expect(html).toContain('sandbox="allow-scripts"')
    expect(html).not.toContain('allow-same-origin')
    expect(html).not.toMatch(/(?:src|href)="https?:/)
  }, 30000)

  it('reports page height only for the page platform', async () => {
    const code = "import { Button } from '@/components/ui/button'; export default () => <Button>Page</Button>"
    const page = await compileScreen(parseScreen(JSON.stringify({ code, platform: 'page', theme: 'light' })))
    expect(page).toContain('data-screen="page"')
    expect(page).toContain('refkitScreenHeight')
    expect(page).not.toContain('allow-same-origin')
    const web = await compileScreen(parseScreen(encode(code)))
    expect(web).not.toContain('refkitScreenHeight')
    expect(screenContract()).toContain('page (')
  }, 30000)

  it('inlines page assets as data URLs behind @/assets', async () => {
    const dot = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='
    const code = "import assets from '@/assets'; export default () => <img src={assets.img1} alt='' />"
    const html = await compileScreen(parseScreen(JSON.stringify({ code, platform: 'page', theme: 'light' })), [{ name: 'img1', dataUrl: dot }])
    expect(html).toContain('iVBORw0KGgo')
    expect(html).not.toContain('allow-same-origin')
    expect(html).not.toMatch(/(?:src|href)="https?:/)
    expect(screenContract()).toContain("import assets from '@/assets'")
  }, 30000)

  it('rejects imports outside the actual component catalog before bundling', () => {
    for (const code of [
      "import fs from 'node:fs'; export default () => null",
      "export { default } from '@/lib/library'",
      "import { Button } from '@/components/ui/button/../../lib/library'; export default () => null",
      "export default () => { import('https://example.com/code.js'); return null }",
      "export default () => { require('node:fs'); return null }",
    ]) expect(() => parseScreen(encode(code))).toThrow(/импорт|require/)
  })

  it('bundles actual shadcn, tokens and React into a portable sandboxed screen', async () => {
    const source = parseScreen(encode("import { Button } from '@/components/ui/button'; export default function Screen() { return <main className='bg-background p-6 text-foreground'><Button>Готово</Button></main> }"))
    const html = await compileScreen(source)
    expect(html).toContain('sandbox="allow-scripts"')
    expect(html).not.toContain('allow-same-origin')
    expect(html).toContain("connect-src 'none'")
    expect(html).toContain('frame-src about:')
    expect(html).toContain('data-screen="web"')
    expect(html).toContain('--background:')
    expect(html).not.toMatch(/(?:src|href)="https?:/)
  }, 30000)

  it('reports a missing component export instead of accepting a broken result', async () => {
    const source = parseScreen(encode("import { MissingComponent } from '@/components/ui/button'; export default () => <MissingComponent />"))
    await expect(compileScreen(source)).rejects.toThrow()
  }, 30000)

  it('hands editable TSX to agents and protects it against stale client saves', () => {
    const original = { id: 'screen', type: 'screen', data: { result: '<html>bundle</html>', screenSource: { code: 'export default () => null', platform: 'web', theme: 'light' } } }
    const merged = mergeIncoming([original], [{ id: 'screen', type: 'screen', data: { screenSource: { code: 'stale' } } }])
    expect(resultForAgent(merged[0])).toBe('export default () => null')
    expect(resultForAgent({ data: { result: '<html>legacy</html>' } })).toBe('<html>legacy</html>')
  })
})

describe('каталог Fluid в запросе', () => {
  const api = (contract: string, name: string) => new RegExp(`fluid/${name}:[^\\n]*\\nAPI:`).test(contract)
  it('тяжёлые компоненты раскрываются только по задаче, лёгкие — всегда', async () => {
    const { screenContract } = await import('../../screen-renderer.ts')
    const plain = screenContract('fluid', 'Нарисуй лендинг с кнопками')
    expect(api(plain, 'button')).toBe(true)
    expect(api(plain, 'combobox')).toBe(false)
    expect(plain).toContain('API не раскрыт')
    expect(api(screenContract('fluid', 'экран с боковой панелью'), 'sidebar')).toBe(true)
    expect(api(screenContract('fluid', 'нужен CommandMenu'), 'command-menu')).toBe(true)
    expect(screenContract('fluid', 'x').length).toBeLessThan(screenContract('fluid', 'боковая панель, комбобокс, цвет, чат, слайдер, вопрос').length)
  })
})
