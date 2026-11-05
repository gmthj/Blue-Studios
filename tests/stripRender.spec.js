import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createScene } from '../src/stripRender.js'

// Integration tests: how the exported strip draws its frame (stripRender.js)
// A template is a picture with its own rounded outline. Nothing may be painted in the template's colour under it,
// or the colour shows as square corners outside the outline. The canvas is pretended: it only remembers what was drawn.

const W = 900
const H = 1200 // a strip with the shape 3:4

// the pictures that can be "loaded", and their sizes (a name that is not here cannot be loaded)
const SIZES = {
  'art.png': [900, 1200], // a template picture the same shape as the strip
  'square-art.png': [1200, 1200], // a different shape: it has to be cropped, not stretched
  'wide-art.png': [1800, 900],
  'photo.png': [1200, 900],
}

class FakeImage {
  set src(value) {
    const name = Object.keys(SIZES).find((key) => value === key) // the exact name ("wide-art.png" also ends in "art.png")
    queueMicrotask(() => {
      if (!name) {
        if (this.onerror) this.onerror(new Error('cannot load'))
        return
      }
      this.width = this.naturalWidth = SIZES[name][0]
      this.height = this.naturalHeight = SIZES[name][1]
      if (this.onload) this.onload()
    })
  }
}

// a canvas that remembers every call, and what the fill and stroke colours were at that moment
function makeContext() {
  const calls = []
  const ctx = { fillStyle: '', strokeStyle: '', lineWidth: 0, filter: 'none', font: '', textAlign: '', canvas: {} }
  for (const name of ['clearRect', 'fillRect', 'strokeRect', 'drawImage', 'save', 'restore', 'beginPath', 'roundRect', 'ellipse', 'rect', 'clip', 'translate', 'rotate', 'scale', 'fillText']) {
    ctx[name] = (...args) => calls.push({ name, args, fillStyle: ctx.fillStyle, strokeStyle: ctx.strokeStyle })
  }
  return { ctx, calls }
}

const layout = { aspect: 0.75, slots: [{ x: 5, y: 5, w: 42.4, h: 37.9 }, { x: 52.6, y: 5, w: 42.4, h: 37.9 }] }
const plainFrame = { background: '#FFD3E6', border: '#F36AB0', shape: 'rounded', caption: 'Our day', captionColor: '#D4157F', thumbnailUrl: null }

// make a scene and draw it once. changes: what is different from the plain frame. extra: other scene options (cornerColor).
async function drawStrip(changes = {}, extra = {}) {
  const scene = await createScene({
    layout: layout,
    frameStyle: { ...plainFrame, ...changes },
    photosById: { p0: { id: 'p0', image: 'photo.png' }, p1: { id: 'p1', image: 'photo.png' } },
    slotPhotos: { 0: 'p0', 1: 'p1' },
    edits: {},
    crops: {},
    stickers: [],
    clips: [],
    editedVideos: {},
    ...extra,
  })
  const { ctx, calls } = makeContext()
  scene.draw(ctx, W, H, 0)
  return calls
}
const named = (calls, name) => calls.filter((call) => call.name === name)
const isFullCanvas = (call) => call.args[0] === 0 && call.args[1] === 0 && call.args[2] === W && call.args[3] === H

beforeEach(() => vi.stubGlobal('Image', FakeImage))
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('Integration test: a plain frame (no template picture)', () => {
  it('Test1: is filled with the frame colour first, over the whole strip', async () => {
    const calls = await drawStrip()
    const fills = named(calls, 'fillRect')
    expect(isFullCanvas(fills[0])).toBe(true)
    expect(fills[0].fillStyle).toBe('#FFD3E6')
  })

  it('Test2: has the frame\'s border and its caption', async () => {
    const calls = await drawStrip()
    expect(named(calls, 'strokeRect')).toHaveLength(1)
    expect(named(calls, 'strokeRect')[0].strokeStyle).toBe('#F36AB0')
    expect(named(calls, 'fillText')[0].args[0]).toBe('Our day')
  })
})

describe('Integration test: a template picture (a PNG)', () => {
  const asPng = { cornerColor: null } // a PNG can be see-through

  it('Test1: paints nothing under the picture, so its corners stay see-through', async () => {
    const calls = await drawStrip({ thumbnailUrl: 'art.png' }, asPng)
    expect(named(calls, 'fillRect')).toHaveLength(0)
  })

  it('Test2: never paints in the template\'s colour (that colour made the square corners)', async () => {
    const calls = await drawStrip({ thumbnailUrl: 'art.png' }, asPng)
    expect(calls.filter((call) => call.name === 'fillRect' && call.fillStyle === '#FFD3E6')).toHaveLength(0)
  })

  it('Test3: draws the picture over the whole strip, as it is', async () => {
    const calls = await drawStrip({ thumbnailUrl: 'art.png' }, asPng)
    const art = named(calls, 'drawImage')[0]
    expect(art.args.slice(1)).toEqual([0, 0, 900, 1200, 0, 0, 900, 1200]) // the whole picture onto the whole strip
  })

  it('Test4: draws no extra square border and no caption (the template has its own)', async () => {
    const calls = await drawStrip({ thumbnailUrl: 'art.png' }, asPng)
    expect(named(calls, 'strokeRect')).toHaveLength(0)
    expect(named(calls, 'fillText')).toHaveLength(0)
  })

  it('Test5: still puts every photo inside its rounded frame', async () => {
    const calls = await drawStrip({ thumbnailUrl: 'art.png' }, asPng)
    expect(named(calls, 'roundRect')).toHaveLength(2) // one rounded outline per photo
    const names = calls.map((call) => call.name)
    const firstClip = names.indexOf('clip')
    const firstPhoto = calls.findIndex((call, i) => call.name === 'drawImage' && i > firstClip)
    expect(firstClip).toBeGreaterThan(-1)
    expect(firstPhoto).toBeGreaterThan(firstClip) // the photo is drawn after the outline is the only place it can go
  })
})

describe('Integration test: a template picture (a video)', () => {
  it('Test1: a video cannot be see-through, so its corners are white (the default)', async () => {
    const calls = await drawStrip({ thumbnailUrl: 'art.png' })
    const fills = named(calls, 'fillRect')
    expect(fills).toHaveLength(1)
    expect(isFullCanvas(fills[0])).toBe(true)
    expect(fills[0].fillStyle).toBe('#FFFFFF')
  })

  it('Test2: the white is under the picture, and the picture is drawn on top of it', async () => {
    const calls = await drawStrip({ thumbnailUrl: 'art.png' }, { cornerColor: '#FFFFFF' })
    const names = calls.map((call) => call.name)
    expect(names.indexOf('fillRect')).toBeLessThan(names.indexOf('drawImage'))
  })

  it('Test3: has no template colour and no square border here either', async () => {
    const calls = await drawStrip({ thumbnailUrl: 'art.png' })
    expect(calls.filter((call) => call.name === 'fillRect' && call.fillStyle === '#FFD3E6')).toHaveLength(0)
    expect(named(calls, 'strokeRect')).toHaveLength(0)
  })
})

describe('Integration test: a template picture of a different shape', () => {
  it('Test1: a square picture on a 3:4 strip is cropped in the middle, not stretched', async () => {
    const calls = await drawStrip({ thumbnailUrl: 'square-art.png' }, { cornerColor: null })
    // 1200 x 1200 onto 900 x 1200: the whole height, and the middle 900 of the width (150 off each side)
    expect(named(calls, 'drawImage')[0].args.slice(1)).toEqual([150, 0, 900, 1200, 0, 0, 900, 1200])
  })

  it('Test2: a wide picture is cropped at the sides, in the middle', async () => {
    const calls = await drawStrip({ thumbnailUrl: 'wide-art.png' }, { cornerColor: null })
    const [sx, sy, sw, sh] = named(calls, 'drawImage')[0].args.slice(1, 5)
    expect(sh).toBe(900) // all of its height
    expect(sw / sh).toBeCloseTo(0.75) // cropped to the strip's shape, so nothing is squashed
    expect(sx).toBeCloseTo((1800 - sw) / 2) // from the middle
    expect(sy).toBe(0)
  })
})

describe('Integration test: a template picture that cannot be loaded', () => {
  it('Test1: falls back to the plain colour, so the strip is not empty, and says so in the console', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
    const calls = await drawStrip({ thumbnailUrl: 'broken.png' }, { cornerColor: null })
    const fills = named(calls, 'fillRect')
    expect(fills).toHaveLength(1)
    expect(fills[0].fillStyle).toBe('#FFD3E6')
    expect(errors).toHaveBeenCalled()
  })

  it('Test2: still draws no extra border, because it is a template on screen too', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const calls = await drawStrip({ thumbnailUrl: 'broken.png' })
    expect(named(calls, 'strokeRect')).toHaveLength(0)
  })
})
