// Unit tests for src/utils/cleanSvg.js: uploaded SVGs must lose anything that can run code,
// but keep the drawing. Run with: npm test
import { describe, test, expect } from 'vitest'
import { cleanSvg } from '../src/utils/cleanSvg.js'

describe('cleanSvg', () => {
  test('keeps shapes, colours and gradients', () => {
    const svg = '<svg viewBox="0 0 10 10"><defs><linearGradient id="g"><stop offset="0" stop-color="#f00"/></linearGradient></defs><circle cx="5" cy="5" r="4" fill="url(#g)"/></svg>'
    const clean = cleanSvg(svg)
    expect(clean).toContain('<circle')
    expect(clean).toContain('linearGradient')
    expect(clean).toContain('fill="url(#g)"')
  })

  test('removes scripts, event handlers, javascript: links and HTML inside foreignObject', () => {
    const svg = '<svg onload="alert(1)"><script>alert(2)</script>'
      + '<a href="javascript:alert(3)"><rect width="5" height="5" onclick="alert(4)"/></a>'
      + '<foreignObject><img src="x" onerror="alert(5)"></foreignObject></svg>'
    const clean = cleanSvg(svg)
    expect(clean).not.toMatch(/alert/)
    expect(clean).not.toMatch(/<script/i)
    expect(clean).not.toMatch(/onload|onclick|onerror/i)
    expect(clean).not.toMatch(/foreignObject/i)
    expect(clean).toContain('<rect')
  })

  test('anything that is not text gives an empty string', () => {
    expect(cleanSvg(undefined)).toBe('')
    expect(cleanSvg(null)).toBe('')
    expect(cleanSvg(5)).toBe('')
  })
})
