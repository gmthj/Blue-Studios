import { describe, it, expect } from 'vitest'
import { exportOptions, stripContents, isGifSrc, hasGifSticker } from '../src/exportRules.js'

// The export logic table from the team's design, one row each:
// [video, music, gifSticker] -> which cards can be picked, and whether music is lost
// (photos do not matter: a complete strip is made of photos and / or videos)
const TABLE = [
  //  video  music  gif     png    gif    mp4    music lost in
  [true, true, true, { png: false, gif: true, mp4: true }, ['gif']],
  [true, true, false, { png: false, gif: true, mp4: true }, ['gif']],
  [true, false, true, { png: false, gif: true, mp4: false }, []],
  [true, false, false, { png: false, gif: true, mp4: false }, []],
  [false, true, true, { png: false, gif: true, mp4: true }, ['gif']],
  [false, true, false, { png: true, gif: false, mp4: true }, ['png']],
  [false, false, true, { png: false, gif: true, mp4: false }, []],
  [false, false, false, { png: true, gif: false, mp4: false }, []],
]

describe('Export rules (exportRules.js)', () => {
  it.each(TABLE)('video %s, music %s, GIF sticker %s', (hasVideo, hasMusic, hasGif, expected, musicLostIn) => {
    const options = exportOptions({ complete: true, hasVideo, hasMusic, hasGifSticker: hasGif })
    expect(options.png.available).toBe(expected.png)
    expect(options.gif.available).toBe(expected.gif)
    expect(options.mp4.available).toBe(expected.mp4)
    const lost = ['png', 'gif', 'mp4'].filter((f) => options[f].musicLost)
    expect(lost).toEqual(musicLostIn)
  })

  it('gives a reason for every card that cannot be picked, and none for the others', () => {
    const options = exportOptions({ complete: true, hasVideo: true, hasMusic: false, hasGifSticker: false })
    expect(options.png.reason).toMatch(/video/)
    expect(options.mp4.reason).toMatch(/music/i)
    expect(options.gif.reason).toBe('')
  })

  it('blurs every card until every slot is filled', () => {
    const options = exportOptions({ complete: false, hasVideo: true, hasMusic: true, hasGifSticker: true })
    for (const format of ['png', 'gif', 'mp4']) {
      expect(options[format].available).toBe(false)
      expect(options[format].reason).toMatch(/every slot/)
      expect(options[format].musicLost).toBe(false)
    }
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
