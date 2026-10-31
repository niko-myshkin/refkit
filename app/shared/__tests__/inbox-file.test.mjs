import { describe, expect, it } from 'vitest'
import { imageFileProblem, maxImageBytes, withBoard } from '../inbox-file.mjs'

const ok = { isFile: true, size: 1000 }
describe('imageFileProblem', () => {
  it('принимает картинку', () => expect(imageFileProblem('/a/b.PNG', '.PNG', ok)).toBeNull())
  it('отказывает понятно', () => {
    expect(imageFileProblem('rel.png', '.png', ok)).toMatch(/абсолютный/)
    expect(imageFileProblem('/a.png', '.png', null)).toMatch(/нет/)
    expect(imageFileProblem('/a.pdf', '.pdf', ok)).toMatch(/расширение/i)
    expect(imageFileProblem('/a.png', '.png', { isFile: true, size: maxImageBytes + 1 })).toMatch(/МБ/)
    expect(imageFileProblem('/a.png', '.png', { isFile: false, size: 5 })).toMatch(/не файл/)
  })
})
describe('withBoard', () => {
  it('добавляет и не дублирует', () => {
    expect(withBoard(['A'], 'B')).toEqual(['A', 'B'])
    expect(withBoard(['A'], 'A')).toEqual(['A'])
    expect(withBoard(undefined, 'B')).toEqual(['B'])
  })
})
