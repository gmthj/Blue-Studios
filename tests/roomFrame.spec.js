import { describe, it, expect } from 'vitest'
import { LAYOUTS, FRAME_STYLES, roomLayout, roomFrameStyle, isTrustedStickerSrc } from '../src/stripData.js'

// Unit tests: the helpers the Export and Share pages use to find the room's cut and frame

describe('TestSuite: roomLayout', () => {
  it('Test1: a room with nothing chosen uses the first built-in layout', () => {
    expect(roomLayout({})).toBe(LAYOUTS[0])
  })

  it('Test2: uses the built-in layout the room chose', () => {
    const chosen = LAYOUTS[1]
    expect(roomLayout({ stripLayoutId: chosen.id })).toBe(chosen)
  })

  it('Test3: an unknown layout id falls back to the first built-in layout', () => {
    expect(roomLayout({ stripLayoutId: 'no-such-layout' })).toBe(LAYOUTS[0])
  })

  it('Test4: a custom template brings its own slots, and wins over the built-in layout', () => {
    const slots = [{ x: 5, y: 5, w: 90, h: 40 }, { x: 5, y: 50, w: 90, h: 40 }]
    const layout = roomLayout({
      stripLayoutId: LAYOUTS[1].id,
      stripCustomTemplate: { id: 'tpl1', name: 'My Template', aspect: 0.5, slots: slots },
    })
    expect(layout).toEqual({ id: 'tpl1', name: 'My Template', aspect: 0.5, slots: slots })
  })

  it('Test5: a custom template without an aspect gets the tall 3:10 strip', () => {
    const layout = roomLayout({ stripCustomTemplate: { id: 't', name: 'T', slots: [{ x: 0, y: 0, w: 100, h: 100 }] } })
    expect(layout.aspect).toBeCloseTo(0.3)
  })

  it('Test6: a custom template with no slots is ignored', () => {
    expect(roomLayout({ stripCustomTemplate: { id: 't', slots: [] } })).toBe(LAYOUTS[0])
  })
})

describe('TestSuite: roomFrameStyle', () => {
  it('Test1: a room with nothing chosen uses the first built-in frame', () => {
    expect(roomFrameStyle({})).toBe(FRAME_STYLES[0])
  })

  it('Test2: uses the built-in frame the room chose, and falls back if the id is unknown', () => {
    const chosen = FRAME_STYLES[2]
    expect(roomFrameStyle({ stripStyleId: chosen.id })).toBe(chosen)
    expect(roomFrameStyle({ stripStyleId: 'no-such-style' })).toBe(FRAME_STYLES[0])
  })

  it('Test3: a custom template wins over the built-in frame, with its own colours and artwork', () => {
    const frame = roomFrameStyle({
      stripStyleId: FRAME_STYLES[1].id,
      stripCustomTemplate: {
        id: 'tpl1', background: '#112233', border: '#445566', shape: 'rounded',
        caption: 'Hello', captionColor: '#abcdef', thumbnailUrl: 'https://example.com/art.png',
      },
    })
    expect(frame.id).toBe('tpl1')
    expect(frame.background).toBe('#112233')
    expect(frame.border).toBe('#445566')
    expect(frame.shape).toBe('rounded')
    expect(frame.caption).toBe('Hello')
    expect(frame.captionColor).toBe('#abcdef')
    expect(frame.thumbnailUrl).toBe('https://example.com/art.png')
  })

  it('Test4: a custom template with missing fields gets plain defaults', () => {
    const frame = roomFrameStyle({ stripCustomTemplate: { id: 'bare' } })
    expect(frame.background).toBe('#FFFFFF')
    expect(frame.border).toBe('#1A1A2E')
    expect(frame.shape).toBe('square')
    expect(frame.caption).toBe('')
    expect(frame.thumbnailUrl).toBeNull()
  })

  it('Test5: the caption takes the border colour when the template has no caption colour', () => {
    const frame = roomFrameStyle({ stripCustomTemplate: { id: 't', border: '#ff0000', caption: 'Hi' } })
    expect(frame.captionColor).toBe('#ff0000')
  })
})

describe('TestSuite: isTrustedStickerSrc', () => {
  // anyone in the room can set a sticker's picture, so only a few places are allowed in a finished export
  it('Test1: allows our Firebase Storage, GIPHY and picture data addresses', () => {
    expect(isTrustedStickerSrc('https://firebasestorage.googleapis.com/v0/b/x/o/stickers%2Fa?alt=media')).toBe(true)
    expect(isTrustedStickerSrc('https://media.giphy.com/media/abc/giphy.gif')).toBe(true)
    expect(isTrustedStickerSrc('data:image/png;base64,iVBORw0KGgo')).toBe(true)
    expect(isTrustedStickerSrc('data:image/svg+xml,%3Csvg%3E')).toBe(true)
  })

  it('Test2: rejects other websites', () => {
    expect(isTrustedStickerSrc('https://example.com/cat.gif')).toBe(false)
    expect(isTrustedStickerSrc('http://media.giphy.com/media/abc/giphy.gif')).toBe(false) // http, not https
  })

  it('Test3: rejects a look-alike address that only starts like a trusted one', () => {
    expect(isTrustedStickerSrc('https://firebasestorage.googleapis.com.evil.example/x.png')).toBe(false)
    expect(isTrustedStickerSrc('https://media.giphy.com.evil.example/x.gif')).toBe(false)
  })

  it('Test4: rejects data that is not a picture, scripts and empty text', () => {
    expect(isTrustedStickerSrc('data:text/html,<script>alert(1)</script>')).toBe(false)
    expect(isTrustedStickerSrc('javascript:alert(1)')).toBe(false)
    expect(isTrustedStickerSrc('')).toBe(false)
  })
})
