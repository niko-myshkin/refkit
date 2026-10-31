import { describe, expect, it } from 'vitest'
import { journalEntry, listEntries, seedEntries } from '../canvas-journal.mjs'

const node = (id, type, data = {}) => ({ id, type, data })

describe('журнал запусков', () => {
  it('агент хранит текст, картинка — путь, экран — флаг HTML', () => {
    expect(journalEntry(node('a', 'agent', { title: 'A' }), 5, { result: 'ответ' })).toEqual({ at: 5, nodeId: 'a', type: 'agent', title: 'A', text: 'ответ' })
    expect(journalEntry(node('i', 'image', { title: 'I' }), 6, { result: 'Картинка · x.png', imageFile: '/library/c/x.png' })).toMatchObject({ imageFile: '/library/c/x.png' })
    expect(journalEntry(node('s', 'screen'), 7, { result: '<html></html>' })).toMatchObject({ html: true })
  })
  it('начальная запись: текущий результат и вся история ноды, пустые и карточки пропускаются', () => {
    const nodes = [
      node('a', 'agent', { title: 'A', result: 'новый', ranAt: 30, history: [{ result: 'старый', ranAt: 10 }, { result: '', ranAt: 20 }] }),
      node('c', 'card', { ref: 'r' }),
      node('n', 'agent', { title: 'без результата' }),
    ]
    const seeded = seedEntries(nodes)
    expect(seeded.map((item) => item.entry.at)).toEqual([10, 30])
    expect(seeded[0].entry.text).toBe('старый')
  })
  it('список: новые сверху, у записей удалённых нод есть пометка', () => {
    const list = listEntries([{ at: 1, nodeId: 'gone', type: 'agent', title: '' }, { at: 2, nodeId: 'a', type: 'agent', title: '' }], [{ id: 'a' }])
    expect(list.map((entry) => [entry.at, entry.deleted])).toEqual([[2, false], [1, true]])
  })
})
