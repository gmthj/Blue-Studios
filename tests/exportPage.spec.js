import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ExportView from '../src/views/ExportView.vue'
import PhotoStrip from '../src/components/PhotoStrip.vue'
import { useRoom } from '../src/composables/useRoom.js'

// Component + integration tests: the Export page (format cards, name, Share and download)

// ---------- a pretend room and a pretend Firestore ----------

// vi.mock is moved to the top of the file, so what it needs is made with vi.hoisted
const mocks = vi.hoisted(() => ({
  updateDoc: vi.fn(),
  runTransaction: vi.fn(),
  txUpdate: vi.fn(),
  goToStage: vi.fn(),
}))

// the room: a page reads it with useRoom(), and the tests change it
vi.mock('../src/composables/useRoom.js', async (importOriginal) => {
  const { ref } = await import('vue')
  const room = ref({})
  const photos = ref([])
  const clips = ref([])
  const code = ref('1234')
  return {
    ...(await importOriginal()),
    useRoom: () => ({ code, room, photos, clips, roomRef: () => 'room-ref', goToStage: mocks.goToStage }),
  }
})
vi.mock('firebase/firestore', async (importOriginal) => ({
  ...(await importOriginal()),
  updateDoc: mocks.updateDoc,
  runTransaction: mocks.runTransaction,
}))

const { room, photos, clips } = useRoom()

// ---------- test data ----------

// 4 photos for the 4 slots of the first built-in layout (Retro 4-cut)
const PHOTOS = ['p0', 'p1', 'p2', 'p3'].map((id) => ({ id: id, image: 'data:image/png;base64,iVBORw0KGgo' }))
const GIF_STICKER = { id: 1, src: 'data:image/gif;base64,R0lGODlh', visible: true, x: 50, y: 50, w: 40, rotate: 0, z: 1 }
const PNG_STICKER = { id: 2, src: 'data:image/png;base64,iVBORw0KGgo', visible: true, x: 50, y: 50, w: 40, rotate: 0, z: 2 }

// a room whose strip is finished. Each test says what the strip has: a video, music, a moving sticker.
function setRoom({ video = false, music = false, gifSticker = false, slots = 4, extra = {} } = {}) {
  photos.value = PHOTOS
  clips.value = [{ id: 'c1', name: 'Rae', shotNumber: 1, path: 'clips/1234/u/c1.webm' }]
  const stripSlots = {}
  for (let i = 0; i < slots; i++) stripSlots[i] = 'p' + i
  if (video) stripSlots[0] = 'c1' // slot 1 holds a video clip
  room.value = {
    stripSlots: stripSlots,
    stripStickers: gifSticker ? [GIF_STICKER] : [PNG_STICKER],
    ...(music ? { music: { audioPath: 'music/1234/mix.wav' } } : {}),
    ...extra,
  }
}

// updateDoc changes the pretend room the way Firestore does (these tests only use plain keys)
function applyChanges(changes) {
  Object.assign(room.value, changes)
}

function mountPage() {
  return mount(ExportView, { global: { stubs: { StageBar: true, PhotoStrip: true } } })
}

// what the user sees: the three cards (PNG, GIF, MP4, in this order), their state, and the buttons
const cardsOf = (page) => page.findAll('[role="radio"]')
const isLocked = (card) => card.attributes('aria-disabled') === 'true'
const isSelected = (card) => card.attributes('aria-checked') === 'true'
const shareButton = (page) => page.findAll('button').find((b) => b.text().includes('Share and download') || b.text() === 'Opening...')

beforeEach(() => {
  mocks.updateDoc.mockReset()
  mocks.updateDoc.mockImplementation(async (ref, changes) => applyChanges(changes))
  mocks.txUpdate.mockReset()
  mocks.goToStage.mockReset()
  // runTransaction(db, callback): runs the callback with a pretend transaction that reads and writes the pretend room
  mocks.runTransaction.mockReset()
  mocks.runTransaction.mockImplementation(async (db, callback) => {
    return callback({ get: async () => ({ data: () => room.value }), update: mocks.txUpdate })
  })
  setRoom()
})

// ---------- component tests ----------

describe('Component test: Export page, the format cards', () => {
  it('Test1: every card is blurred until the strip is finished, and says why', async () => {
    setRoom({ slots: 3 }) // slot 4 is empty
    const page = mountPage()
    await flushPromises()
    for (const card of cardsOf(page)) expect(isLocked(card)).toBe(true)
    expect(page.text()).toContain('Fill every slot of the strip first')
    expect(page.text()).toContain('Finish the strip first')
    expect(shareButton(page).attributes('disabled')).toBeDefined()
  })

  it('Test2: the cards stay blurred until the stickers have been looked at', () => {
    const page = mountPage() // no flushPromises: the check for a moving sticker is still running
    for (const card of cardsOf(page)) expect(isLocked(card)).toBe(true)
  })

  it('Test3: a strip of photos can only be a PNG', async () => {
    const page = mountPage()
    await flushPromises()
    const [png, gif, mp4] = cardsOf(page)
    expect(isLocked(png)).toBe(false)
    expect(isSelected(png)).toBe(true) // the only choice, so it is chosen
    expect(isLocked(gif)).toBe(true)
    expect(isLocked(mp4)).toBe(true)
    expect(page.text()).toContain('Nothing in your strip moves')
    expect(page.text()).toContain('Add music on the Music page')
  })

  it('Test4: a strip with a video cannot be a PNG, and says so', async () => {
    setRoom({ video: true })
    const page = mountPage()
    await flushPromises()
    const [png, gif] = cardsOf(page)
    expect(isLocked(png)).toBe(true)
    expect(page.text()).toContain('Your strip has video: choose GIF or MP4')
    expect(isLocked(gif)).toBe(false)
    expect(isSelected(gif)).toBe(true) // no music, so GIF is the only choice
  })

  it('Test5: with music, MP4 is the card chosen to begin with', async () => {
    setRoom({ video: true, music: true })
    const page = mountPage()
    await flushPromises()
    const [, gif, mp4] = cardsOf(page)
    expect(isSelected(mp4)).toBe(true)
    expect(isSelected(gif)).toBe(false)
    expect(isLocked(gif)).toBe(false) // GIF can still be picked instead
  })

  it('Test6: a strip with a moving sticker cannot be a PNG', async () => {
    setRoom({ gifSticker: true })
    const page = mountPage()
    await flushPromises()
    const [png, gif] = cardsOf(page)
    expect(isLocked(png)).toBe(true)
    expect(page.text()).toContain('Your strip has a moving sticker')
    expect(isLocked(gif)).toBe(false)
  })

  it('Test7: pressing a card that can be chosen saves the choice on the room for everyone', async () => {
    setRoom({ video: true, music: true })
    const page = mountPage()
    await flushPromises()
    await cardsOf(page)[1].trigger('click') // GIF
    await flushPromises()
    expect(mocks.updateDoc).toHaveBeenCalledWith('room-ref', { exportFormat: 'gif' })
    expect(isSelected(cardsOf(page)[1])).toBe(true)
    expect(isSelected(cardsOf(page)[2])).toBe(false)
  })

  it('Test8: pressing a blurred card does nothing', async () => {
    const page = mountPage() // photos only: GIF is blurred
    await flushPromises()
    await cardsOf(page)[1].trigger('click')
    await flushPromises()
    expect(mocks.updateDoc).not.toHaveBeenCalled()
  })

  it('Test9: a saved choice that is no longer possible is replaced by one that is', async () => {
    setRoom({ video: true, extra: { exportFormat: 'png' } }) // someone chose PNG, then a video was added
    const page = mountPage()
    await flushPromises()
    const [png, gif] = cardsOf(page)
    expect(isSelected(png)).toBe(false)
    expect(isSelected(gif)).toBe(true)
  })

  it('Test10: PNG or GIF with music warns that the music will not be included, and points to MP4', async () => {
    setRoom({ video: true, music: true, extra: { exportFormat: 'gif' } })
    const page = mountPage()
    await flushPromises()
    expect(page.text()).toContain("Your music won't be included in a GIF")
    expect(page.text()).toContain('Choose MP4 to keep it')
    await cardsOf(page)[2].trigger('click') // MP4
    await flushPromises()
    expect(page.text()).not.toContain("won't be included")
  })
})

describe('Component test: Export page, the frame of the strip', () => {
  it('Test1: the preview gets the room\'s custom template, not the first built-in frame', async () => {
    const slots = [{ x: 5, y: 5, w: 90, h: 45 }, { x: 5, y: 52, w: 90, h: 45 }]
    setRoom({
      slots: 2,
      extra: { stripCustomTemplate: { id: 'tpl1', name: 'Haru', aspect: 0.5, slots: slots, background: '#123456', border: '#654321', thumbnailUrl: 'https://example.com/art.png' } },
    })
    const page = mountPage()
    await flushPromises()
    const strip = page.findComponent(PhotoStrip)
    expect(strip.props('layout').slots).toEqual(slots)
    expect(strip.props('frameStyle').id).toBe('tpl1')
    expect(strip.props('frameStyle').background).toBe('#123456')
    expect(strip.props('frameStyle').thumbnailUrl).toBe('https://example.com/art.png')
  })
})

describe('Component test: Export page, the name', () => {
  it('Test1: starts with a suggested name that has the room code', () => {
    const page = mountPage()
    expect(page.find('input[type="text"]').element.value).toContain('Room 1234')
  })

  it('Test2: shows the name another person typed (it follows the room)', async () => {
    const page = mountPage()
    room.value.exportName = 'Our trip'
    await flushPromises()
    expect(page.find('input[type="text"]').element.value).toBe('Our trip')
  })

  it('Test3: saves the name on the room a moment after typing stops, without extra spaces', async () => {
    const page = mountPage()
    await page.find('input[type="text"]').setValue('  Birthday strip  ')
    expect(mocks.updateDoc).not.toHaveBeenCalled() // not on every key
    await new Promise((resolve) => setTimeout(resolve, 450))
    expect(mocks.updateDoc).toHaveBeenCalledWith('room-ref', { exportName: 'Birthday strip' })
  })

  it('Test4: leaving the box saves the name straight away', async () => {
    const page = mountPage()
    const box = page.find('input[type="text"]')
    await box.setValue('Quick save')
    await box.trigger('blur')
    await flushPromises()
    expect(mocks.updateDoc).toHaveBeenCalledWith('room-ref', { exportName: 'Quick save' })
  })

  it('Test5: the name is at most 40 characters (the longest a saved strip can have)', () => {
    const page = mountPage()
    expect(page.find('input[type="text"]').attributes('maxlength')).toBe('40')
  })
})

describe('Component test: Export page, Share and download', () => {
  it('Test1: is switched off while the name box is empty', async () => {
    const page = mountPage()
    await flushPromises()
    expect(shareButton(page).attributes('disabled')).toBeUndefined() // a name is suggested, so it is on
    await page.find('input[type="text"]').setValue('   ')
    expect(shareButton(page).attributes('disabled')).toBeDefined()
  })

  it('Test2: moves the whole room to the Share page, with the format and name for the job', async () => {
    setRoom({ video: true, music: true, extra: { furthestStage: 'export' } })
    const page = mountPage()
    await flushPromises()
    await page.find('input[type="text"]').setValue('Our strip')
    await shareButton(page).trigger('click')
    await flushPromises()
    expect(mocks.txUpdate).toHaveBeenCalledTimes(1)
    const [ref, changes] = mocks.txUpdate.mock.calls[0]
    expect(ref).toBe('room-ref')
    expect(changes.stage).toBe('share')
    expect(changes.exportFormat).toBe('mp4')
    expect(changes.exportName).toBe('Our strip')
    expect(changes.furthestStage).toBe('share')
    expect(changes.exportJob).toMatchObject({ status: 'pending', format: 'mp4', name: 'Our strip', progress: 0 })
  })

  it('Test3: if someone else pressed it first, the room is not changed again (we just follow them)', async () => {
    setRoom({ extra: { stage: 'share' } })
    const page = mountPage()
    await flushPromises()
    await shareButton(page).trigger('click')
    await flushPromises()
    expect(mocks.runTransaction).toHaveBeenCalledTimes(1)
    expect(mocks.txUpdate).not.toHaveBeenCalled()
  })

  it('Test4: the back button moves the room back to the Music page', async () => {
    const page = mountPage()
    await page.findAll('button').find((b) => b.text().includes('Music')).trigger('click')
    expect(mocks.goToStage).toHaveBeenCalledWith('music')
  })
})

// ---------- integration test: the page + the export rules + the strip ----------

// The team's export logic table, one row each: [video, music, GIF sticker, which cards can be chosen, where the music is lost]
// (the same table that exportRules.spec.js checks on its own, here checked on the whole page)
const TABLE = [
  [true, true, true, { png: false, gif: true, mp4: true }, 'GIF'],
  [true, true, false, { png: false, gif: true, mp4: true }, 'GIF'],
  [true, false, true, { png: false, gif: true, mp4: false }, null],
  [true, false, false, { png: false, gif: true, mp4: false }, null],
  [false, true, true, { png: false, gif: true, mp4: true }, 'GIF'],
  [false, true, false, { png: true, gif: false, mp4: true }, 'PNG'],
  [false, false, true, { png: false, gif: true, mp4: false }, null],
  [false, false, false, { png: true, gif: false, mp4: false }, null],
]

describe('Integration test: Export page + export rules', () => {
  it.each(TABLE)('Test: video %s, music %s, GIF sticker %s', async (video, music, gifSticker, expected, musicLostIn) => {
    setRoom({ video: video, music: music, gifSticker: gifSticker })
    const page = mountPage()
    await flushPromises()
    const [png, gif, mp4] = cardsOf(page)
    expect(isLocked(png)).toBe(!expected.png)
    expect(isLocked(gif)).toBe(!expected.gif)
    expect(isLocked(mp4)).toBe(!expected.mp4)

    // the format that is not chosen yet can be pressed, and then the music warning must match the table
    if (musicLostIn) {
      await cardsOf(page)[musicLostIn === 'PNG' ? 0 : 1].trigger('click')
      await flushPromises()
      expect(page.text()).toContain("Your music won't be included in a " + musicLostIn)
    } else {
      expect(page.text()).not.toContain("won't be included")
    }
  })

  it('Test: a finished strip can always be shared, and a half finished one never', async () => {
    const finished = mountPage()
    await flushPromises()
    expect(shareButton(finished).attributes('disabled')).toBeUndefined()
    setRoom({ slots: 2 })
    const half = mountPage()
    await flushPromises()
    expect(shareButton(half).attributes('disabled')).toBeDefined()
  })
})
