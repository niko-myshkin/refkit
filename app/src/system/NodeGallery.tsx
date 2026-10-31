import { ReactFlow, ReactFlowProvider, type Node } from '@xyflow/react'
import { nodeTypes } from '@/components/canvas/nodes'
import { Section } from './Section'

// Галерея нод холста: каждый тип в нескольких состояниях (пустая, короткий и длинный текст, выбранная, ошибка). Ноды настоящие, не
// картинки. Правило (владелец 2026-10-27): правишь одну ноду — открой эту страницу и сравни её с остальными; расхождение видно сразу
const long = 'Как хочу: спокойная, плотная, инженерная страница, тёмная тема — как у референсов. Главное — скриншоты самого продукта, а не абстрактные картинки. «Вау» — одна строка про память, которая копится.\n\nЧего не хочу: типичный AI-лендинг с градиентами и блёстками, стоковые картинки, пёстрые акценты, лишние секции вне скелета, громкие обещания без опоры на продукт.'
const agentResult = '## Правила стиля\n- Один акцент на действия.\n- Серый для второстепенного.\n- Без градиентов и блёсток.\n\n## Что взять\nПустое состояние с одной фразой и одной кнопкой.'
const listResult = '1. **Герой**\n\n   **Заголовок:** Кинь что угодно. Получи суть так, как нужно тебе.\n\n   **Кнопка:** Запросить доступ  \n   **Текстовая ссылка:** Как это работает ↓\n\n2. **Путь**\n\n   Лента из трёх шагов:\n\n   - Собери\n   - Разложи\n   - Забери результат\n\n3. **Память**\n\n   **Заголовок:** Агент запоминает, как тебе отвечать.'
const page = '<!doctype html><html><body style="margin:0;font-family:system-ui;background:#fff;color:#111"><header style="padding:20px;border-bottom:1px solid #ddd"><b>Refkit</b></header><main style="padding:32px"><h1 style="margin:0 0 8px">Память, которая копится</h1><p style="color:#555">Кинь материал — получи суть.</p><button style="padding:8px 16px">Запросить доступ</button></main></body></html>'
const at = (col: number, row: number) => ({ x: col * 380, y: row * 400 + 40 })
const nodes: Node[] = [
  { id: 't1', type: 'text', position: at(0, 0), width: 320, height: 90, data: { text: '' } },
  { id: 't2', type: 'text', position: at(1, 0), width: 320, height: 90, data: { text: 'Короткая подпись к входу' } },
  { id: 't3', type: 'text', position: at(2, 0), width: 320, height: 160, data: { text: long } },
  { id: 't4', type: 'text', position: at(3, 0), width: 320, height: 160, selected: true, data: { text: long } },
  { id: 'c1', type: 'choice', position: at(0, 1), data: { title: 'Выбор', items: ['Вариант один: тёмный и плотный', 'Вариант два: светлый и воздушный', 'Вариант три: цветной'], choice: 1 } },
  { id: 'c2', type: 'choice', position: at(1, 1), data: { title: 'Выбор', items: [] } },
  { id: 'k1', type: 'card', position: at(2, 1), width: 280, height: 180, data: { ref: 'нет' } },
  { id: 'a1', type: 'agent', position: at(0, 2), width: 340, height: 300, data: { title: 'Агент', instr: 'Выведи правила стиля из референсов.' } },
  { id: 'a2', type: 'agent', position: at(1, 2), width: 340, height: 300, data: { title: 'Правила стиля', instr: 'Выведи правила стиля.', status: 'ready', result: agentResult } },
  { id: 'a3', type: 'agent', position: at(2, 2), width: 340, height: 300, data: { title: 'Ошибка запуска', instr: 'Выведи правила стиля.', status: 'error', error: 'Лимит Codex на сейчас исчерпан — попробуйте позже' } },
  { id: 'a4', type: 'agent', position: at(0, 4), width: 340, height: 300, data: { title: 'Список из абзацев', instr: 'Опиши секции.', status: 'ready', result: listResult } },
  { id: 's1', type: 'screen', position: at(3, 2), width: 340, height: 300, data: { title: 'Страница', instr: 'Собери экран по входам.', status: 'ready', result: page } },
  { id: 'i1', type: 'image', position: at(0, 3), width: 340, height: 300, data: { title: 'Картинка', instr: 'Нарисуй обложку.' } },
  { id: 'i2', type: 'image', position: at(1, 3), width: 340, height: 300, data: { title: 'Картинка', instr: 'Нарисуй обложку.', status: 'error', error: 'Лимит Codex на сейчас исчерпан — попробуйте позже' } },
  { id: 'g1', type: 'group', position: at(2, 3), width: 340, height: 300, data: { sized: true, groupKind: 'folder', name: 'Лендинг v2 · кадры', members: [{ id: 'm1', title: 'Кадр 1', text: 'Хронология', cat: 'note' }, { id: 'm2', title: 'Кадр 2', text: 'Память', cat: 'note' }] } },
]

export default function NodeGallery() {
  return (
    <Section id="canvas-nodes" title="Ноды холста" hint="Все типы нод в разных состояниях: пустая, короткий и длинный текст, выбранная, ошибка. Правишь одну — сравни со всеми.">
      <div className="h-[2100px] overflow-hidden rounded-lg border bg-background">
        <ReactFlowProvider>
          <ReactFlow nodes={nodes} edges={[]} nodeTypes={nodeTypes} fitView fitViewOptions={{ padding: 0.1 }} nodesDraggable={false} nodesConnectable={false} panOnDrag={false} zoomOnScroll={false} panOnScroll={false} preventScrolling={false} proOptions={{ hideAttribution: true }} />
        </ReactFlowProvider>
      </div>
    </Section>
  )
}
