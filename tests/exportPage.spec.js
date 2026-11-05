import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ExportView from '../src/views/ExportView.vue'
import PhotoStrip from '../src/components/PhotoStrip.vue'
import { useRoom } from '../src/composables/useRoom.js'

// Component + integration tests: the Export page (the name, and Share and download with the format chosen by the strip)

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

// what the user sees: the button
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

describe('Component test: Export page, what it shows', () => {
  it('Test1: there is nothing to choose: no format cards, only the name and the button', async () => {
    const page = mountPage()
    await flushPromises()
    expect(page.findAll('[role="radio"]')).toHaveLength(0)
    expect(page.text()).not.toContain('GIF')
    expect(page.text()).not.toContain('Format')
    expect(page.find('input[type="text"]').exists()).toBe(true)
    expect(shareButton(page)).toBeDefined()
  })

  it('Test2: shows the strip next to the name box', async () => {
    const page = mountPage()
    await flushPromises()
    expect(page.findComponent(PhotoStrip).exists()).toBe(true)
    expect(page.text()).toContain('Name your photostrip')
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

  it('Test2: is switched off until the stickers have been looked at', () => {
    const page = mountPage() // no flushPromises: the check for a moving sticker is still running
    expect(shareButton(page).attributes('disabled')).toBeDefined()
  })

  it('Test3: is switched off, with a reason, until every slot is filled', async () => {
    setRoom({ slots: 3 }) // slot 4 is empty
    const page = mountPage()
    await flushPromises()
    expect(shareButton(page).attributes('disabled')).toBeDefined()
    expect(page.text()).toContain('Finish the strip first')
  })

  it('Test4: moves the whole room to the Share page, with the format the strip decided and the name', async () => {
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
    expect(changes.exportName).toBe('Our strip')
    expect(changes.furthestStage).toBe('share')
    expect(changes.exportJob).toMatchObject({ status: 'pending', format: 'mp4', name: 'Our strip', progress: 0 })
    expect(changes.exportFormat).toBeUndefined() // nobody chooses it, so there is no saved choice any more
  })

  it('Test5: if someone else pressed it first, the room is not changed again (we just follow them)', async () => {
    setRoom({ extra: { stage: 'share' } })
    const page = mountPage()
    await flushPromises()
    await shareButton(page).trigger('click')
    await flushPromises()
    expect(mocks.runTransaction).toHaveBeenCalledTimes(1)
    expect(mocks.txUpdate).not.toHaveBeenCalled()
  })
})

// ---------- integration test: the page + the export rules + the strip ----------

// The export logic, one row each: [video, music, moving sticker, the format the strip is exported as]
// (the same table that exportRules.spec.js checks on its own, here checked on the whole page: what is sent to the Share page)
const TABLE = [
  [true, true, true, 'mp4'],
  [true, true, false, 'mp4'],
  [true, false, true, 'mp4'],
  [true, false, false, 'mp4'],
  [false, true, true, 'mp4'],
  [false, true, false, 'mp4'],
  [false, false, true, 'mp4'],
  [false, false, false, 'png'],
]

describe('Integration test: Export page + export rules', () => {
  it.each(TABLE)('Test: video %s, music %s, moving sticker %s', async (video, music, gifSticker, expected) => {
    setRoom({ video: video, music: music, gifSticker: gifSticker })
    const page = mountPage()
    await flushPromises()
    await shareButton(page).trigger('click')
    await flushPromises()
    expect(mocks.txUpdate.mock.calls[0][1].exportJob.format).toBe(expected)
  })

  it('Test: a half finished strip can never be shared, whatever it has', async () => {
    for (const [video, music, gifSticker] of TABLE) {
      mocks.runTransaction.mockClear()
      setRoom({ video: video, music: music, gifSticker: gifSticker, slots: 2 })
      const page = mountPage()
      await flushPromises()
      expect(shareButton(page).attributes('disabled')).toBeDefined()
      await shareButton(page).trigger('click')
      expect(mocks.runTransaction).not.toHaveBeenCalled()
    }
  })
})
