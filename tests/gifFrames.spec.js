import { describe, it, expect } from 'vitest'
import { decodeGif, pickFrame } from '../src/gifFrames.js'

// A 3-picture animation: A for 200 ms, B for 200 ms, C for 200 ms (600 ms in all)
const animation = {
  frames: [
    { bitmap: 'A', until: 200 },
    { bitmap: 'B', until: 400 },
    { bitmap: 'C', until: 600 },
  ],
  duration: 600,
}

describe('Animated GIF stickers (gifFrames.js)', () => {
  it('picks the picture that is on at that moment', () => {
    expect(pickFrame(animation, 0).bitmap).toBe('A')
    expect(pickFrame(animation, 0.199).bitmap).toBe('A')
    expect(pickFrame(animation, 0.2).bitmap).toBe('B')
    expect(pickFrame(animation, 0.45).bitmap).toBe('C')
  })

  it('repeats from the start when the animation ends', () => {
    expect(pickFrame(animation, 0.6).bitmap).toBe('A')
    expect(pickFrame(animation, 0.85).bitmap).toBe('B')
    expect(pickFrame(animation, 15).bitmap).toBe('A') // the end of a 15 s video: 25 turns exactly
  })

  it('gives back null where the browser has no ImageDecoder, so the sticker stays still', async () => {
    expect(typeof ImageDecoder).toBe('undefined') // (the test browser, jsdom, has none)
    expect(await decodeGif('data:image/gif;base64,R0lGODlh')).toBeNull()
  })
})
