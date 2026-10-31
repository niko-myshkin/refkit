import { describe, expect, it } from 'vitest'
import { activeData, applyOps, canvasInputs, choiceItems, mergeIncoming, mergeWithTrash, migrateResults, splitItems, upstreamActions, type CanvasData, type CNode } from '../canvas-graph.mjs'

const node = (id: string, type: string, data: Record<string, any> = {}, x = 0): CNode => ({ id, type, position: { x, y: 0 }, data })
// материалы → действие (с результатом внутри) → выбор → экран
const chain = (): CanvasData => ({
  nodes: [node('c', 'card', { ref: 'r1' }, 0), node('t', 'text', { text: 'x' }, 10), node('a', 'agent', { title: 'A', instr: 'i', status: 'ready', result: '1. один\n2. два\n3. три' }, 100), node('k', 'choice', { choice: 1 }, 300), node('s', 'screen', { title: 'S' }, 400)],
  edges: [{ source: 'c', target: 'a' }, { source: 't', target: 'a' }, { source: 'a', target: 'k' }, { source: 'k', target: 's' }],
})

describe('граф холста', () => {
  it('входы: источники в любую сторону, остальные только по направлению', () => {
    const data = chain()
    expect(canvasInputs(data, 'a').map((n) => n.id)).toEqual(['c', 't'])
    expect(canvasInputs(data, 's').map((n) => n.id)).toEqual(['k'])
    data.edges.push({ source: 'a', target: 't' }) // обратная связь не делает ноду входом
    expect(canvasInputs(data, 'a').map((n) => n.id)).toEqual(['c', 't'])
  })
  it('действие может брать результат другого действия напрямую', () => {
    const data = chain()
    data.nodes.push(node('b', 'agent', { title: 'B' }, 500))
    data.edges.push({ source: 'a', target: 'b' })
    expect(canvasInputs(data, 'b').map((n) => n.id)).toEqual(['a'])
  })
  it('список прозрачен: следующая нода получает его участников, любых типов, а не сам список', () => {
    const data: CanvasData = {
      nodes: [node('c', 'card', { ref: 'r1' }, 0), node('a', 'agent', { title: 'A', result: 'текст', status: 'ready' }, 50), node('i', 'image', { title: 'I', imageFile: '/library/x/a.png' }, 100),
        node('l', 'group', { groupKind: 'list', contains: ['c', 'a', 'i'] }, 20), node('t', 'agent', { title: 'T' }, 300)],
      edges: [{ source: 'l', target: 't' }],
    }
    expect(canvasInputs(data, 't').map((n) => n.id)).toEqual(['c', 'a', 'i'])
    // участник не может стать входом самого себя через список
    data.edges.push({ source: 'l', target: 'a' })
    expect(canvasInputs(data, 'a').map((n) => n.id)).toEqual(['c', 'i'])
  })
  it('варианты для «Выбора» берутся из результата действия слева, в том числе с жирными заголовками', () => {
    expect(choiceItems(chain(), chain().nodes[3]).length).toBe(3)
    expect(splitItems('**Раз** — а\n\n**Два** — б')).toHaveLength(2)
  })
  it('выше по цепочке: через выбор', () => {
    const data = chain()
    expect(upstreamActions(data, data.nodes[4])).toEqual(['a'])
    data.nodes.push(node('a2', 'agent'))
    data.edges.push({ source: 'a2', target: 's' })
    expect(upstreamActions(data, data.nodes[4]).sort()).toEqual(['a', 'a2'])
  })
  it('сохранение клиентом не затирает серверные поля и убирает вычисляемые', () => {
    const disk = chain().nodes
    const incoming = [node('a', 'agent', { title: 'Новое', instr: 'i2', stale: true, estimateK: 9, result: 'ПОДДЕЛКА' }), node('k', 'choice', { choice: 0, items: ['q'] })]
    const out = mergeIncoming(disk, incoming)
    expect(out[0].data).toMatchObject({ title: 'Новое', instr: 'i2', status: 'ready' })
    expect(out[0].data?.result).toContain('один')
    expect(out[0].data?.stale).toBeUndefined()
    expect(out[1].data).toEqual({ choice: 0 })
  })
  it('правки: добавить, соединить, обновить, удалить', () => {
    const data = chain()
    const res = applyOps(data, [
      { op: 'add_node', id: 'n1', type: 'agent', data: { title: 'Новый', instr: 'сделай' } },
      { op: 'connect', source: 't', target: 'n1' },
      { op: 'update_node', id: 'n1', data: { instr: 'другое' } },
    ])
    expect(res.error).toBeUndefined()
    expect(res.data.nodes.find((n) => n.id === 'n1')?.data).toMatchObject({ title: 'Новый', instr: 'другое' })
    expect(res.data.edges.some((e) => e.source === 't' && e.target === 'n1')).toBe(true)
    expect(data.nodes.find((n) => n.id === 'n1')).toBeUndefined() // исходная доска не тронута
    expect(applyOps(res.data, [{ op: 'delete_node', id: 'n1' }]).data.edges.some((e) => e.target === 'n1')).toBe(false)
  })
  it('правки: неверные отклоняются целиком и по понятной причине', () => {
    const data = chain()
    expect(applyOps(data, [{ op: 'add_node', type: 'агентик' }]).error).toMatch(/нет типа/)
    expect(applyOps(data, [{ op: 'add_node', type: 'result' }]).error).toMatch(/больше нет/)
    expect(applyOps(data, [{ op: 'connect', source: 'c', target: 'k' }]).error).toMatch(/не принимает/)
    expect(applyOps(data, [{ op: 'connect', source: 's', target: 'a' }]).error).toMatch(/цикл/)
    expect(applyOps(data, [{ op: 'update_node', id: 'a', data: { result: 'подделка' } }]).error).toMatch(/менять нельзя/)
    const mixed = applyOps(data, [{ op: 'add_node', id: 'ok', type: 'text' }, { op: 'connect', source: 'zzz', target: 'a' }])
    expect(mixed.error).toBeTruthy()
    expect(mixed.data).toBe(data) // ничего не применено
  })
  it('вход «Выбора» — одно соединение', () => {
    const data = chain()
    data.nodes.push(node('a2', 'agent'))
    const res = applyOps(data, [{ op: 'connect', source: 'a2', target: 'k' }])
    expect(res.data.edges.filter((e) => e.target === 'k')).toHaveLength(1)
  })
  it('старые доски: отдельный «Результат» переводится в связь действие → дальше', () => {
    const old: CanvasData = {
      nodes: [node('t', 'text'), node('a', 'agent', { result: 'R' }), node('r', 'result'), node('b', 'agent'), node('r2', 'result')],
      edges: [{ source: 't', target: 'a' }, { source: 'a', target: 'r' }, { source: 'r', target: 'b' }, { source: 'b', target: 'r2' }],
    }
    const out = migrateResults(old)
    expect(out.nodes.map((n) => n.id)).toEqual(['t', 'a', 'b'])
    expect(out.edges.map((e) => `${e.source}>${e.target}`)).toEqual(['t>a', 'a>b'])
    expect(migrateResults(out)).toBe(out) // повторно ничего не меняет
  })
})

describe('размер и позиция в правках', () => {
  const base = { nodes: [{ id: 'c1', type: 'card', position: { x: 0, y: 0 }, data: { ref: 'ref-1' } }], edges: [] }
  it('add_node принимает размер и держит его в разумных границах', () => {
    const result = applyOps(base as never, [{ op: 'add_node', id: 'c2', type: 'card', position: { x: 5, y: 6 }, width: 260.4, height: 99999, data: { ref: 'ref-2' } }])
    expect(result.error).toBeUndefined()
    expect(result.data.nodes.find((node: { id: string }) => node.id === 'c2')).toMatchObject({ width: 260, height: 2000, position: { x: 5, y: 6 } })
  })
  it('update_node меняет только размер и позицию, без data', () => {
    const result = applyOps(base as never, [{ op: 'update_node', id: 'c1', position: { x: 10, y: 20 }, width: 340, height: 180 }])
    expect(result.error).toBeUndefined()
    expect(result.data.nodes[0]).toMatchObject({ position: { x: 10, y: 20 }, width: 340, height: 180, data: { ref: 'ref-1' } })
  })
  it('update_node с пустой правкой или кривой позицией отказывает понятно', () => {
    expect(applyOps(base as never, [{ op: 'update_node', id: 'c1' }]).error).toMatch(/нечего менять/)
    expect(applyOps(base as never, [{ op: 'update_node', id: 'c1', position: { x: 'a' } }]).error).toMatch(/position/)
  })
})

describe('активная версия результата', () => {
  const node = (extra: Record<string, unknown> = {}): CNode => ({ id: 'a', type: 'agent', position: { x: 0, y: 0 }, data: { title: 'a', status: 'ready', result: 'третья', ranAt: 3, history: [{ result: 'первая', ranAt: 1 }, { result: 'вторая', ranAt: 2 }], ...extra } })
  it('без activeAt или на последней версии соседи читают последний запуск', () => {
    expect(activeData(node()).result).toBe('третья')
    expect(activeData(node({ activeAt: 7 })).result).toBe('третья')
  })
  it('activeAt выбирает версию из истории, остальные поля ноды не трогаются', () => {
    const view = activeData(node({ activeAt: 0 }))
    expect(view).toMatchObject({ result: 'первая', ranAt: 1, status: 'ready', title: 'a' })
  })
  it('вход следующей ноды видит активную версию', () => {
    const data = { nodes: [node({ activeAt: 1 }), { id: 'b', type: 'agent', position: { x: 300, y: 0 }, data: { instr: 'x' } }], edges: [{ id: 'e', source: 'a', target: 'b' }] } as unknown as CanvasData
    expect(canvasInputs(data, 'b')[0].data!.result).toBe('вторая')
  })
})

describe('корзина серверных полей', () => {
  const ready = (id: string): CNode => ({ id, type: 'agent', position: { x: 0, y: 0 }, data: { title: id, instr: 'i', status: 'ready', result: `результат ${id}`, history: [{ result: 'старый', ranAt: 1 }], ranAt: 5 } })
  const bare = (id: string): CNode => ({ id, type: 'agent', position: { x: 0, y: 0 }, data: { title: id, instr: 'i' } })
  it('удалил → отменил: нода возвращается со своим результатом, версиями и статусом', () => {
    const disk = [ready('a'), ready('b')]
    const afterDelete = mergeWithTrash(disk, [bare('a')]) // клиент прислал доску без «b»
    expect(afterDelete.nodes.map((n) => n.id)).toEqual(['a'])
    expect(afterDelete.trash.b.keep.result).toBe('результат b')
    const afterUndo = mergeWithTrash(afterDelete.nodes, [bare('a'), bare('b')], afterDelete.trash)
    const back = afterUndo.nodes.find((n) => n.id === 'b')!
    expect(back.data).toMatchObject({ status: 'ready', result: 'результат b', ranAt: 5, instr: 'i' })
    expect(back.data!.history).toHaveLength(1)
    expect(afterUndo.trash.b).toBeUndefined()
  })
  it('копия ноды (copyOf) получает результат, версии и статус источника, а не пустые поля', () => {
    const disk = [ready('a')]
    const copy: CNode = { id: 'a2', type: 'agent', position: { x: 40, y: 40 }, data: { title: 'a', instr: 'i', copyOf: 'a' } }
    const merged = mergeWithTrash(disk, [bare('a'), copy])
    const made = merged.nodes.find((n) => n.id === 'a2')!
    expect(made.data).toMatchObject({ status: 'ready', result: 'результат a', ranAt: 5, instr: 'i' })
    expect(made.data!.history).toHaveLength(1)
    expect(made.data!.copyOf).toBeUndefined()
    // история копии — отдельный массив: правка у копии не трогает источник
    expect(made.data!.history).not.toBe(merged.nodes.find((n) => n.id === 'a')!.data!.history)
  })
  it('комментарии на экране — поле владельца: клиент их правит, appliedEdits сервер держит сам', () => {
    const disk = [node('s', 'screen', { comments: [{ id: 'c1', text: 'старый', at: 1 }], appliedEdits: ['c0'], result: '<html>' })]
    const comments = [{ id: 'c1', text: 'новый', at: 1, x: 0.3, y: 0.2, h: 1800 }]
    const merged = mergeWithTrash(disk, [node('s', 'screen', { comments, appliedEdits: [] })]).nodes[0]
    expect(merged.data!.comments).toEqual(comments)
    expect(merged.data!.appliedEdits).toEqual(['c0'])
    expect(merged.data!.result).toBe('<html>')
  })
  it('ноду с другим типом под тем же id корзина не трогает, а старая корзина ограничена', () => {
    const t = mergeWithTrash([ready('x')], [], {}).trash
    const other = mergeWithTrash([], [{ id: 'x', type: 'screen', position: { x: 0, y: 0 }, data: { title: 'x' } }], t)
    expect(other.nodes[0].data!.result).toBeUndefined()
    const many = mergeWithTrash(Array.from({ length: 20 }, (_, at) => ready(`n${at}`)), [], {})
    expect(Object.keys(many.trash)).toHaveLength(12)
  })
})
