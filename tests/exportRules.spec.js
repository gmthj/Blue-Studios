import { describe, it, expect } from 'vitest'
import { chooseExportFormat, stripContents, isGifSrc, hasGifSticker } from '../src/exportRules.js'

// The export logic, one row each: [video, music, moving sticker] -> the format the strip is exported as
// (nobody chooses it; photos do not matter: a complete strip is made of photos and / or videos)
//   still strip, no music        -> PNG
//   anything else                -> MP4 (with the music if there is some, otherwise silent)
const TABLE = [
  //  video  music  gif     format
  [true, true, true, 'mp4'],
  [true, true, false, 'mp4'],
  [true, false, true, 'mp4'], // a silent MP4: what a GIF used to be
  [true, false, false, 'mp4'], // a silent MP4
  [false, true, true, 'mp4'],
  [false, true, false, 'mp4'], // a still strip with music: a video of it with the music
  [false, false, true, 'mp4'], // a silent MP4 with the moving sticker
  [false, false, false, 'png'], // the only case that stays a picture
]

describe('Export rules (exportRules.js)', () => {
  it.each(TABLE)('video %s, music %s, moving sticker %s', (hasVideo, hasMusic, hasGif, expected) => {
    expect(chooseExportFormat({ complete: true, hasVideo, hasMusic, hasGifSticker: hasGif })).toBe(expected)
  })

  it('gives no format until every slot is filled, whatever the strip has', () => {
    for (const [hasVideo, hasMusic, hasGif] of TABLE) {
      expect(chooseExportFormat({ complete: false, hasVideo, hasMusic, hasGifSticker: hasGif })).toBeNull()
    }
  })

  it('is only ever PNG or MP4 (there is no GIF export any more)', () => {
    const formats = new Set(TABLE.map(([hasVideo, hasMusic, hasGif]) => chooseExportFormat({ complete: true, hasVideo, hasMusic, hasGifSticker: hasGif })))
    expect([...formats].sort()).toEqual(['mp4', 'png'])
  })
})

describe('What is in the strip (stripContents)', () => {
  const layout = { slots: [{}, {}, {}] }
  const photosById = { p1: { id: 'p1' }, p2: { id: 'p2' } }
  const clips = [{ id: 'c1' }]
  const editedVideos = { e1: { entries: [{}] }, empty: { entries: [] } }

  it('is complete with only photos, and has no video', () => {
    const r = stripContents({ layout, slotPhotos: { 0: 'p1', 1: 'p2', 2: 'p1' }, photosById, clips, editedVideos })
    expect(r).toEqual({ complete: true, hasVideo: false })
  })

  it('finds a video from a clip or from a saved edit', () => {
    expect(stripContents({ layout, slotPhotos: { 0: 'p1', 1: 'c1', 2: 'p2' }, photosById, clips, editedVideos }).hasVideo).toBe(true)
    expect(stripContents({ layout, slotPhotos: { 0: 'p1', 1: 'e1', 2: 'p2' }, photosById, clips, editedVideos }).hasVideo).toBe(true)
  })

  it('is not complete with an empty slot, a missing id, or an edit with no clips', () => {
    expect(stripContents({ layout, slotPhotos: { 0: 'p1', 1: 'p2' }, photosById, clips, editedVideos }).complete).toBe(false)
    expect(stripContents({ layout, slotPhotos: { 0: 'p1', 1: 'p2', 2: 'gone' }, photosById, clips, editedVideos }).complete).toBe(false)
    expect(stripContents({ layout, slotPhotos: { 0: 'p1', 1: 'p2', 2: 'empty' }, photosById, clips, editedVideos }).complete).toBe(false)
  })
})

describe('GIF stickers (hasGifSticker)', () => {
  it('knows a GIF from a data: address, and a PNG is not one', async () => {
    expect(await isGifSrc('data:image/gif;base64,R0lGODlh')).toBe(true)
    expect(await isGifSrc('data:image/png;base64,iVBORw0KGgo')).toBe(false)
  })

  it('only counts stickers that are shown and from a trusted place', async () => {
    const gif = 'data:image/gif;base64,R0lGODlh'
    expect(await hasGifSticker([{ src: gif, visible: true }])).toBe(true)
    expect(await hasGifSticker([{ src: gif, visible: false }])).toBe(false)
    expect(await hasGifSticker([{ src: 'https://example.com/a.gif', visible: true }])).toBe(false)
    expect(await hasGifSticker([])).toBe(false)
  })
})
