import { expect, test } from 'vitest'
import { conceptAsset, conceptWordmark, simpleBrandSymbol, symbolOnBrandGrid } from '../brand-concepts.mjs'
import { brandbookChain } from '../brandbook-template.mjs'

test('concept assets accept only a library image, never external paths or traversal', () => {
 expect(conceptWordmark('Wordmark: /library/ref-1/gen-route-1.png')).toBe('/library/ref-1/gen-route-1.png')
 expect(conceptWordmark('Wordmark: https://example.com/logo.png')).toBe('')
 expect(conceptWordmark('Wordmark: /library/ref-1/../logo.png')).toBe('')
 expect(conceptAsset('Sign: /library/ref-1/gen-sign-1.png', 'Sign')).toBe('/library/ref-1/gen-sign-1.png')
})
test('the symbol geometry must really be on the declared grid', () => {
 const symbol = (x) => `Symbol: <svg viewBox="0 0 64 64"><rect x="${x}" y="8" width="24" height="40" fill="currentColor"/></svg>`
 expect(symbolOnBrandGrid(symbol(8))).toBe(true)
 expect(symbolOnBrandGrid(symbol(9))).toBe(false)
 expect(symbolOnBrandGrid('Symbol: <svg viewBox="0 0 64 64"><path d="M 8 8 L 16 16 Z"/></svg>')).toBe(false)
 expect(simpleBrandSymbol('Symbol: <svg viewBox="0 0 64 64"><rect x="8" y="8" width="24" height="40" fill="currentColor"/><circle cx="40" cy="40" r="8" fill="currentColor"/></svg>')).toBe(true)
 expect(simpleBrandSymbol('   Symbol: <svg viewBox="0 0 64 64" fill="currentColor"><polygon points="8,8 20,8 20,44 44,44 44,8 56,8 56,56 8,56"/><circle cx="32" cy="32" r="8"/></svg>')).toBe(true)
 expect(simpleBrandSymbol('   <svg viewBox="0 0 64 64"><polygon points="8,8 20,8 20,44 44,44 44,8 56,8 56,56 8,56" fill="currentColor"/><circle cx="32" cy="32" r="8" fill="currentColor"/></svg>')).toBe(true)
 expect(simpleBrandSymbol('Symbol: <svg viewBox="0 0 64 64"><rect x="8" y="8" width="24" height="40" fill="currentColor"/></svg>')).toBe(false)
})
test('brandbook chooses lettering and palette before the book without extra generation steps', () => {
 const chain = brandbookChain({ refs: { key:'pins', kind:'folder' } })
 const lettering = chain.nodes.find((node) => node.id === 'a-lettering')
 const palette = chain.nodes.find((node) => node.id === 'a-palette')
 expect(lettering.data.brandVisual).toBe('wordmark')
 expect(lettering.data.autoPick).toBe(false)
 expect(palette.data.pick).toBe(true)
 expect(palette.data.autoPick).toBe(false)
 expect(chain.nodes.map((node) => node.id)).toEqual(['t-brief', 'g-refs', 'a-lettering', 'a-palette', 'b-book'])
 expect(chain.edges).toContainEqual(['a-lettering', 'a-palette'])
 expect(chain.edges).toContainEqual(['a-lettering', 'b-book'])
 expect(chain.edges).toContainEqual(['a-palette', 'b-book'])
})
