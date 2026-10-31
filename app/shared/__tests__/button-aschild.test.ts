import { createElement } from 'react'
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { Button } from '../../src/components/ui/button.tsx'

describe('Button asChild', () => {
  it('passes a single child to Slot so link buttons render', () => {
    const html = renderToStaticMarkup(createElement(Button, { asChild: true }, createElement('a', { href: '#x' }, 'Текст')))
    expect(html).toContain('<a ')
    expect(html).toContain('href="#x"')
    expect(html).toContain('data-slot="button"')
  })
})
