import { describe, expect, it } from 'vitest'
import { tokensCss } from '../screen-tokens.mjs'

describe('tokensCss', () => {
  it('берёт известные переменные и пару шрифтов', () => {
    const css = tokensCss('```css\n:root {\n  --background: #08090a;\n  --primary: #a16a35;\n  --radius: 0.5rem;\n  --brand-glow: #fff;\n}\n```\nPair: Young Serif + Onest')
    expect(css).toContain(':root,.dark{--background:#08090a;--primary:#a16a35;--radius:0.5rem}')
    expect(css).not.toContain('brand-glow')
    expect(css).toContain("font-family:'Onest Variable', sans-serif")
  })
  it('отбрасывает значения, которые не цвет и не размер', () => {
    expect(tokensCss(':root { --background: Canvas; --primary: url(x) }')).toBe('')
  })
})
