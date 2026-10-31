import { describe, expect, it } from 'vitest'
import { accepts, connectionError, derivedFields, isRunnable, mcpLabel, portOf, runnableTypes, stripDerived, wouldCycle } from '../canvas-nodes.mjs'

const n = (id, type, data = {}) => ({ id, type, data })

describe('реестр нод', () => {
  it('запускаются агент, картинка и экран', () => {
    expect(runnableTypes().sort()).toEqual(['agent', 'image', 'screen'])
    expect(isRunnable('choice')).toBe(false)
  })
  it('типы портов: материал, текст, экран; старый результат наследует вид источника', () => {
    expect(portOf(n('a', 'card'))).toBe('material')
    expect(portOf(n('a', 'group'))).toBe('material')
    expect(portOf(n('a', 'text'))).toBe('text')
    expect(portOf(n('a', 'screen'))).toBe('screen')
    expect(portOf(n('r', 'result', { kind: 'screen' }))).toBe('screen')
    expect(portOf(n('r', 'result', { kind: 'agent' }))).toBe('text')
  })
  it('правила входов', () => {
    expect(accepts(n('a', 'agent'), n('c', 'card'))).toBe(true)
    expect(accepts(n('a', 'agent'), n('t', 'text'))).toBe(true)
    expect(accepts(n('a', 'agent'), n('b', 'screen'))).toBe(true)
    expect(accepts(n('a', 'agent'), n('k', 'choice'))).toBe(true)
    expect(accepts(n('k', 'choice'), n('a', 'agent'))).toBe(true)
    expect(accepts(n('k', 'choice'), n('c', 'card'))).toBe(false)
    expect(accepts(n('k', 'choice'), n('t', 'text'))).toBe(false)
    expect(accepts(n('c', 'card'), n('t', 'text'))).toBe(false)
  })
  it('картинка принимает материалы, текст и другие ноды, а сама идёт на вход агенту, экрану и картинке', () => {
    expect(accepts(n('i', 'image'), n('c', 'card'))).toBe(true)
    expect(accepts(n('i', 'image'), n('t', 'text'))).toBe(true)
    expect(accepts(n('i', 'image'), n('s', 'screen'))).toBe(true)
    expect(accepts(n('i', 'image'), n('j', 'image'))).toBe(true)
    expect(accepts(n('a', 'agent'), n('i', 'image'))).toBe(true)
    expect(accepts(n('s', 'screen'), n('i', 'image'))).toBe(true)
    expect(accepts(n('k', 'choice'), n('i', 'image'))).toBe(false)
  })
  it('цикл ловится, в том числе через несколько нод', () => {
    const edges = [{ source: 'a', target: 'k' }, { source: 'k', target: 'b' }]
    expect(wouldCycle('b', 'a', edges)).toBe(true)
    expect(wouldCycle('a', 'b', edges)).toBe(false)
    expect(wouldCycle('a', 'a', [])).toBe(true)
  })
  it('connectionError объясняет отказ', () => {
    const a = n('a', 'agent'), c = n('c', 'card'), k = n('k', 'choice')
    expect(connectionError(c, a, [])).toBeNull()
    expect(connectionError(c, k, [])).toMatch(/не принимает/)
    expect(connectionError(a, a, [])).toMatch(/сама с собой/)
    expect(connectionError(a, k, [{ source: 'k', target: 'a' }])).toMatch(/цикл/)
  })
  it('stripDerived убирает серверные и вычисляемые поля, у результата — всё', () => {
    const clean = stripDerived('agent', { title: 'T', instr: 'x', model: 'm', status: 'ready', result: 'R', stale: true, history: [] })
    expect(clean).toEqual({ title: 'T', instr: 'x', model: 'm' })
    expect(stripDerived('result', { title: 'T', result: 'R' })).toEqual({})
    expect(stripDerived('group', { groupKind: 'folder', key: 'f', name: 'N', count: 3 })).toEqual({ groupKind: 'folder', key: 'f', name: 'N' })
    expect(derivedFields('agent')).toContain('ranHash')
  })
  it('подписи для агента', () => {
    expect(mcpLabel('choice')).toBe('выбор')
    expect(mcpLabel('unknown')).toBe('unknown')
  })
})
