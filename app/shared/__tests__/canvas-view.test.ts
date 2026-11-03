import { expect, test } from 'vitest'
import { shownCanvasData } from '../../src/lib/canvas-view'

test('view and export use the displayed historical image, including an absent old caption', () => {
  expect(shownCanvasData({ result: 'latest caption', imageFile: 'latest.png', activeAt: 0, history: [{ imageFile: 'old.png' }] })).toMatchObject({ result: undefined, imageFile: 'old.png' })
})

test('the latest version and empty nodes remain available', () => {
  expect(shownCanvasData({ result: 'latest', activeAt: 1, history: [{ result: 'old' }] }).result).toBe('latest')
  expect(shownCanvasData({})).toEqual({})
})
