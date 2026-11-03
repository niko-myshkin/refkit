import { expect, test } from 'vitest'
import { materialMosaic } from '../../src/lib/material-mosaic'

test.each([[1200, 720], [300, 600], [900, 180]])('images fit %sx%s without cropping, overlap or changed proportions', (width, height) => {
  const ratios = [1, 1.78, 1.78, 5]
  const boxes = materialMosaic(ratios, width, height, 8)
  expect(boxes).toHaveLength(ratios.length)
  expect(Math.min(...boxes.map((box) => box.top))).toBeCloseTo(0)
  boxes.forEach((box, i) => {
    expect(box.width / box.height).toBeCloseTo(ratios[i])
    expect(box.left).toBeGreaterThanOrEqual(-0.001)
    expect(box.top).toBeGreaterThanOrEqual(-0.001)
    expect(box.left + box.width).toBeLessThanOrEqual(width + 0.001)
    expect(box.top + box.height).toBeLessThanOrEqual(height + 0.001)
    boxes.slice(i + 1).forEach((other) => {
      expect(box.left + box.width <= other.left + 0.001 || other.left + other.width <= box.left + 0.001 || box.top + box.height <= other.top + 0.001 || other.top + other.height <= box.top + 0.001).toBe(true)
    })
  })
  if (width === 1200) expect(boxes.reduce((sum, box) => sum + box.width * box.height, 0) / (width * height)).toBeGreaterThan(0.9)
})
