import { describe, expect, it } from 'vitest'
import { reviewFixes } from '../canvas-review.mjs'

describe('reviewFixes', () => {
  const titles = ['Hero piece', 'Feature 2 piece', 'Landing copy']
  it('берёт строки Fix только для нод выше по цепочке', () => {
    const fixes = reviewFixes('Checked 7 pieces.\nFix: Hero piece — make the terminal text at least 22px\n- **Fix:** "Landing copy" – say the gist comes from a button\nFix: Unknown node — anything\nFix: none', titles)
    expect(fixes).toEqual([
      { title: 'Hero piece', text: 'make the terminal text at least 22px' },
      { title: 'Landing copy', text: 'say the gist comes from a button' },
    ])
  })
  it('название в скобках тоже узнаётся', () => {
    expect(reviewFixes('Fix: (Hero piece) — larger text', titles)).toEqual([{ title: 'Hero piece', text: 'larger text' }])
  })
  it('одна правка на ноду, регистр не важен', () => {
    expect(reviewFixes('Fix: feature 2 piece — a\nFix: Feature 2 piece — b', titles)).toEqual([{ title: 'Feature 2 piece', text: 'a' }])
  })
})
