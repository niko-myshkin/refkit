import type { DiagramPlugin, MermaidConfig } from '@streamdown/mermaid'

// Тот же плагин, что @streamdown/mermaid, но сама библиотека mermaid (~2 МБ) грузится только при первой диаграмме.
// Иначе она попадает в стартовый JS лендинга и приложения, хотя диаграмм в ответах почти не бывает.
const defaults: MermaidConfig = { startOnLoad: false, theme: 'default', securityLevel: 'strict', fontFamily: 'monospace', suppressErrorRendering: true }

let library: Promise<typeof import('mermaid').default> | null = null
const load = () => (library ??= import('mermaid').then((module) => module.default))

export const lazyMermaid: DiagramPlugin = {
  name: 'mermaid',
  type: 'diagram',
  language: 'mermaid',
  getMermaid(config) {
    let settings: MermaidConfig = { ...defaults, ...config }
    let applied = false
    return {
      initialize(next) { settings = { ...defaults, ...config, ...next }; applied = false },
      async render(id, source) {
        const mermaid = await load()
        if (!applied) { mermaid.initialize(settings); applied = true }
        return mermaid.render(id, source)
      },
    }
  },
}
