import { describe, it, expect } from 'vitest'
import { newShareId, shareLink } from '../src/shares.js'

// Unit tests: the share link helpers used by the Share page

describe('TestSuite: newShareId', () => {
  it('Test1: is 12 characters of lowercase letters and numbers', () => {
    for (let i = 0; i < 20; i++) {
      expect(newShareId()).toMatch(/^[0-9a-z]{12}$/)
    }
  })

  it('Test2: is different every time (it cannot be guessed)', () => {
    const ids = new Set()
    for (let i = 0; i < 1000; i++) ids.add(newShareId())
    expect(ids.size).toBe(1000)
  })

  it('Test3: fits in a link and in the Firestore rule (at most 40 characters)', () => {
    const id = newShareId()
    expect(id.length).toBeLessThanOrEqual(40)
    expect(encodeURIComponent(id)).toBe(id) // nothing that needs escaping in a web address
  })
})

describe('TestSuite: shareLink', () => {
  it('Test1: is the site we are on, then /s/, then the id', () => {
    expect(shareLink('k3j9x0q7m2ab')).toBe(window.location.origin + '/s/k3j9x0q7m2ab')
  })

  it('Test2: matches the page the router opens for a share (/s/:id)', () => {
    const link = shareLink('abc123')
    expect(link.endsWith('/s/abc123')).toBe(true)
    expect(link.startsWith('http')).toBe(true)
  })
})
