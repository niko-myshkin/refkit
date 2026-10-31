import { describe, expect, it } from 'vitest'
import { addSpace, canvasMeta, findSpace, freeId } from '../spaces.mjs'

const folders = [{ id: 'inbox', name: 'Входящие', inbox: true }, { id: 'f-1', name: 'Дизайн' }]
describe('addSpace', () => {
  it('заводит новую папку', () => {
    const result = addSpace(folders, ' Simplify flow ', undefined, 5)
    expect(result.created).toBe(true)
    expect(result.folder).toEqual({ id: 'f-5', name: 'Simplify flow' })
    expect(result.folders).toHaveLength(3)
  })
  it('не плодит дубль: повтор возвращает ту же, регистр и ё не важны', () => {
    const result = addSpace(folders, 'дизайн')
    expect(result.created).toBe(false)
    expect(result.folder.id).toBe('f-1')
    expect(result.folders).toBe(folders)
  })
  it('вкладывает в родителя по имени и отказывает понятно', () => {
    expect(addSpace(folders, 'Экраны', 'Дизайн', 7).folder).toEqual({ id: 'f-7', name: 'Экраны', parent: 'f-1' })
    expect(addSpace(folders, 'X', 'Нет такой')).toHaveProperty('error')
    expect(addSpace(folders, 'X', 'Входящие')).toHaveProperty('error')
    expect(addSpace(folders, '   ')).toHaveProperty('error')
  })
})
describe('findSpace', () => {
  it('находит по имени, в том числе «Входящие»', () => expect(findSpace(folders, 'входящие').id).toBe('inbox'))
})
describe('canvasMeta', () => {
  it('холст в нужной папке, с названием и без правок владельца вроде «автоназвание»', () => {
    const meta = canvasMeta({ id: 'ref-1', title: ' Simplify flow ', folderId: 'f-5', now: 10 })
    expect(meta).toMatchObject({ kind: 'canvas', title: 'Simplify flow', titleEdited: true, folder: 'f-5', id: 'ref-1', createdAt: 10 })
    expect(canvasMeta({ id: 'r', title: '', folderId: 'inbox' }).title).toBe('Новый холст')
  })
})
describe('freeId', () => {
  it('берёт следующий свободный', () => expect(freeId((id) => id === 'ref-9' || id === 'ref-9-2', 9)).toBe('ref-9-3'))
})
