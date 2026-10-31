import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import ShareView from '../src/views/ShareView.vue'
import { useRoom } from '../src/composables/useRoom.js'
import { useAuth } from '../src/composables/useAuth.js'

// Component + integration tests: the Share page (one device makes the file, everyone sees it, then link and save)

// ---------- a pretend room, a pretend Firestore and pretend file making ----------

// vi.mock is moved to the top of the file, so what it needs is made with vi.hoisted
const mocks = vi.hoisted(() => ({
  updateDoc: vi.fn(),
  runTransaction: vi.fn(),
  txUpdate: vi.fn(),
  goToStage: vi.fn(),
  exitRoom: vi.fn(),
  push: vi.fn(),
  buildExportFile: vi.fn(),
  createShare: vi.fn(),
  getShare: vi.fn(),
  saveStripFile: vi.fn(),
  toDataURL: vi.fn(),
}))

vi.mock('../src/composables/useRoom.js', async (importOriginal) => {
  const { ref } = await import('vue')
  const room = ref({})
  const photos = ref([])
  const clips = ref([])
  const code = ref('1234')
  return {
    ...(await importOriginal()),
    useRoom: () => ({ code, room, photos, clips, roomRef: () => 'room-ref', goToStage: mocks.goToStage, exitRoom: mocks.exitRoom }),
  }
})
// who is using the page: a guest or an account, and their id
vi.mock('../src/composables/useAuth.js', async (importOriginal) => {
  const { ref } = await import('vue')
  const isAccount = ref(false)
  return { ...(await importOriginal()), useAuth: () => ({ isAccount }), getUid: () => 'me' }
})
vi.mock('../src/guest.js', async (importOriginal) => ({ ...(await importOriginal()), getGuestName: () => 'Tester' }))
vi.mock('vue-router', async (importOriginal) => ({
  ...(await importOriginal()),
  useRoute: () => ({ fullPath: '/room/1234/share' }),
  useRouter: () => ({ push: mocks.push }),
}))
vi.mock('firebase/firestore', async (importOriginal) => ({ ...(await importOriginal()), updateDoc: mocks.updateDoc, runTransaction: mocks.runTransaction }))
// making the file needs a real browser (canvas, recording, FFmpeg), so it is pretended
vi.mock('../src/exportFile.js', () => ({ buildExportFile: mocks.buildExportFile }))
vi.mock('../src/shares.js', async (importOriginal) => ({
  ...(await importOriginal()),
  newShareId: () => 'newid',
  createShare: mocks.createShare,
  getShare: mocks.getShare,
}))
vi.mock('../src/studio.js', async (importOriginal) => ({ ...(await importOriginal()), saveStripFile: mocks.saveStripFile }))
vi.mock('qrcode', () => ({ default: { toDataURL: mocks.toDataURL } }))

const { room } = useRoom()
const { isAccount } = useAuth()

// a copy of plain data (Firestore also hands the page a brand-new copy each time the room changes)
const copy = (value) => (value === undefined ? undefined : JSON.parse(JSON.stringify(value)))

// updateDoc changes the pretend room the way Firestore does: a key like 'a.b.c' changes only that one field,
// and the page then gets a new copy of the room
function applyChanges(changes) {
  const next = copy(room.value)
  for (const [key, value] of Object.entries(changes)) {
    const parts = key.split('.')
    let node = next
    for (const part of parts.slice(0, -1)) {
      if (node[part] === undefined || node[part] === null) node[part] = {}
      node = node[part]
    }
    node[parts[parts.length - 1]] = copy(value)
  }
  room.value = next
}

// ---------- test data ----------

const SHARE = { id: 'abc123', title: 'Our strip', format: 'mp4', fileUrl: 'https://example.com/our-strip.mp4', size: 2 * 1024 * 1024 }
const FILE = { blob: new Blob(['video']), ext: 'mp4', mime: 'video/mp4' }

// the job the room keeps: what everyone sees on this page
function job(status, extra = {}) {
  return { status: status, format: 'mp4', name: 'Our strip', progress: 0, updatedAt: Date.now(), ...extra }
}
function setJob(exportJob, extra = {}) {
  room.value = { stripSlots: {}, ...(exportJob ? { exportJob: exportJob } : {}), ...extra }
}

const mounted = []
function mountPage() {
  const page = mount(ShareView, { global: { stubs: { StageBar: true, PhotoStrip: true } } })
  mounted.push(page)
  return page
}
const buttonNamed = (page, text) => page.findAll('button').find((b) => b.text() === text)

beforeEach(() => {
  for (const name of ['updateDoc', 'runTransaction', 'txUpdate', 'goToStage', 'exitRoom', 'push', 'buildExportFile', 'createShare', 'getShare', 'saveStripFile', 'toDataURL']) {
    mocks[name].mockReset()
  }
  mocks.updateDoc.mockImplementation(async (ref, changes) => applyChanges(changes))
  // runTransaction(db, callback): runs the callback with a pretend transaction that reads and writes the pretend room
  mocks.runTransaction.mockImplementation(async (db, callback) =>
    callback({
      get: async () => ({ data: () => room.value }),
      update: (ref, changes) => {
        mocks.txUpdate(ref, copy(changes)) // what was asked for, kept as it was then
        applyChanges(changes)
      },
    })
  )
  mocks.exitRoom.mockResolvedValue()
  mocks.buildExportFile.mockImplementation(() => new Promise(() => {})) // never finishes, unless a test says so
  mocks.createShare.mockResolvedValue({ id: 'newid' })
  mocks.getShare.mockResolvedValue(SHARE)
  mocks.saveStripFile.mockResolvedValue('strip1')
  mocks.toDataURL.mockResolvedValue('data:image/png;base64,FAKEQR')
  isAccount.value = false
  setJob(null)
})

afterEach(() => {
  // closing the pages stops their timers
  while (mounted.length) {
    try {
      mounted.pop().unmount()
    } catch (error) {
      // already closed by the test
    }
  }
  vi.unstubAllGlobals()
})

// ---------- component tests ----------

describe('Component test: Share page, while the file is being made', () => {
  it('Test1: with nothing to share it says so, and goes back to the Export page', async () => {
    const page = mountPage()
    await flushPromises()
    expect(page.text()).toContain('Nothing to share yet')
    await buttonNamed(page, '← Export').trigger('click')
    expect(mocks.goToStage).toHaveBeenCalledWith('export')
  })

  it('Test2: shows the same message to everyone: "Making your MP4", what is happening, and a progress bar', async () => {
    setJob(job('working', { by: 'other', byName: 'Rae', progress: 0.4, label: 'Recording the video... keep this page open' }))
    const page = mountPage()
    await flushPromises()
    expect(page.text()).toContain('Making your MP4')
    expect(page.text()).toContain('Recording the video... keep this page open')
    expect(page.text()).toContain('Keep this page open until it is done')
    expect(page.find('.progress-bar').attributes('style')).toContain('width: 40%')
  })

  it('Test3: does not say which device is making it', async () => {
    setJob(job('working', { by: 'other', byName: 'Rae' }))
    const page = mountPage()
    await flushPromises()
    expect(page.text()).not.toContain('Rae')
  })

  it('Test4: the heading follows the format: PNG, GIF or MP4', async () => {
    setJob(job('working', { by: 'other', format: 'gif' }))
    const page = mountPage()
    await flushPromises()
    expect(page.text()).toContain('Making your GIF')
  })

  it('Test5: says "Starting..." before the device making it has said anything', async () => {
    setJob(job('working', { by: 'other' }))
    const page = mountPage()
    await flushPromises()
    expect(page.text()).toContain('Starting...')
  })

  it('Test6: a job somebody else is working on is left alone', async () => {
    setJob(job('working', { by: 'other' }))
    mountPage()
    await flushPromises()
    expect(mocks.runTransaction).not.toHaveBeenCalled()
    expect(mocks.buildExportFile).not.toHaveBeenCalled()
  })
})

describe('Component test: Share page, when it goes wrong', () => {
  it('Test1: says it did not work, with the reason, and offers to try again or go back', async () => {
    setJob(job('failed', { error: 'Could not load a clip' }))
    const page = mountPage()
    await flushPromises()
    expect(page.text()).toContain("That didn't work")
    expect(page.text()).toContain('Could not load a clip')
    expect(buttonNamed(page, 'Try again')).toBeDefined()
    await buttonNamed(page, '← Export').trigger('click')
    expect(mocks.goToStage).toHaveBeenCalledWith('export')
  })

  it('Test2: "Try again" puts the job back to waiting for everyone', async () => {
    setJob(job('failed', { error: 'Could not load a clip' }))
    const page = mountPage()
    await flushPromises()
    await buttonNamed(page, 'Try again').trigger('click')
    expect(mocks.updateDoc).toHaveBeenCalledWith('room-ref', { 'exportJob.status': 'pending', 'exportJob.error': '', 'exportJob.progress': 0 })
  })
})

describe('Component test: Share page, when the strip is ready', () => {
  beforeEach(() => setJob(job('done', { shareId: 'abc123', progress: 1 })))

  it('Test1: shows the strip, its name, its link and Download', async () => {
    const page = mountPage()
    await flushPromises()
    expect(mocks.getShare).toHaveBeenCalledWith('abc123')
    expect(page.find('h1').text()).toBe('Our strip')
    expect(page.find('video').attributes('src')).toBe(SHARE.fileUrl)
    expect(page.find('a[download]').text()).toBe('Download MP4')
    expect(page.text()).toContain('Copy link')
    expect(page.find('img[alt^="QR code"]').exists()).toBe(true)
  })

  it('Test2: an account can save it to My Studio', async () => {
    isAccount.value = true
    const page = mountPage()
    await flushPromises()
    expect(buttonNamed(page, 'Save to My Studio')).toBeDefined()
    expect(page.text()).not.toContain('Log in to save')
  })

  it('Test3: a guest is asked to log in instead, and cannot save', async () => {
    const page = mountPage()
    await flushPromises()
    expect(buttonNamed(page, 'Log in to save it to My Studio')).toBeDefined()
    expect(buttonNamed(page, 'Save to My Studio')).toBeUndefined()
  })

  it('Test4: saving keeps a copy of the file, with its name, format and share, in My Studio', async () => {
    isAccount.value = true
    vi.stubGlobal('fetch', vi.fn(async () => ({ blob: async () => 'THE-BLOB' })))
    const page = mountPage()
    await flushPromises()
    await buttonNamed(page, 'Save to My Studio').trigger('click')
    await flushPromises()
    expect(fetch).toHaveBeenCalledWith(SHARE.fileUrl)
    expect(mocks.saveStripFile).toHaveBeenCalledWith({ title: 'Our strip', file: 'THE-BLOB', format: 'mp4', shareId: 'abc123' })
    expect(page.text()).toContain('Saved to My Studio!')
  })

  it('Test5: if saving fails it says so and nothing breaks', async () => {
    isAccount.value = true
    vi.stubGlobal('fetch', vi.fn(async () => ({ blob: async () => 'THE-BLOB' })))
    mocks.saveStripFile.mockRejectedValue(new Error('permission-denied'))
    const page = mountPage()
    await flushPromises()
    await buttonNamed(page, 'Save to My Studio').trigger('click')
    await flushPromises()
    expect(page.text()).toContain('Could not save. Please try again.')
    expect(page.text()).not.toContain('Saved to My Studio!')
  })

  it('Test6: the login button leaves the room first, then goes to login and comes back to this page', async () => {
    const page = mountPage()
    await flushPromises()
    await buttonNamed(page, 'Log in to save it to My Studio').trigger('click')
    await flushPromises()
    expect(mocks.exitRoom).toHaveBeenCalledWith(true) // true: take my place in the room away straight away
    expect(mocks.push).toHaveBeenCalledWith('/login?redirect=' + encodeURIComponent('/room/1234/share'))
    expect(mocks.exitRoom.mock.invocationCallOrder[0]).toBeLessThan(mocks.push.mock.invocationCallOrder[0])
  })

  it('Test7: it still goes to login if leaving the room fails', async () => {
    mocks.exitRoom.mockRejectedValue(new Error('offline'))
    const page = mountPage()
    await flushPromises()
    await buttonNamed(page, 'Log in to save it to My Studio').trigger('click')
    await flushPromises()
    expect(mocks.push).toHaveBeenCalledTimes(1)
  })
})

// ---------- integration tests: the page + taking the job + making the file + SharedStrip ----------

describe('Integration test: Share page, making the file', () => {
  it('Test1: a waiting job is taken, made, shared, and then everyone sees the finished strip', async () => {
    setJob(job('pending'), { music: { audioPath: 'music/1234/mix.wav' } })
    mocks.buildExportFile.mockResolvedValue(FILE)
    const page = mountPage()

    // 1. this device takes the job (the transaction)
    await vi.waitFor(() => expect(mocks.txUpdate).toHaveBeenCalledTimes(1))
    const taken = mocks.txUpdate.mock.calls[0][1].exportJob
    expect(taken).toMatchObject({ status: 'working', by: 'me', byName: 'Tester', format: 'mp4', name: 'Our strip' })

    // 2. it makes the file with the right format and music, uploads it, and tells the room
    await vi.waitFor(() => expect(mocks.createShare).toHaveBeenCalledTimes(1))
    expect(mocks.buildExportFile).toHaveBeenCalledWith(expect.objectContaining({ format: 'mp4', audioPath: 'music/1234/mix.wav' }))
    expect(mocks.createShare).toHaveBeenCalledWith({ id: 'newid', title: 'Our strip', format: 'mp4', file: FILE, roomCode: '1234' })
    expect(room.value.exportJob.status).toBe('done')
    expect(room.value.exportJob.shareId).toBe('newid')

    // 3. everyone then sees the strip
    await vi.waitFor(() => expect(page.text()).toContain('Download MP4'))
    expect(mocks.getShare).toHaveBeenCalledWith('newid')
  })

  it('Test2: the strip itself is given to the file maker (layout, frame, stickers, clips)', async () => {
    setJob(job('pending'))
    mountPage()
    await vi.waitFor(() => expect(mocks.buildExportFile).toHaveBeenCalledTimes(1))
    const { strip } = mocks.buildExportFile.mock.calls[0][0]
    expect(Object.keys(strip).sort()).toEqual(['clips', 'crops', 'editedVideos', 'edits', 'frameStyle', 'layout', 'photosById', 'slotPhotos', 'stickers'])
    expect(strip.layout.slots.length).toBeGreaterThan(0)
  })

  it('Test3: a device that has gone quiet for over 20 seconds loses the job to this one', async () => {
    setJob(job('working', { by: 'other', updatedAt: Date.now() - 60 * 1000 }))
    mountPage()
    await vi.waitFor(() => expect(mocks.buildExportFile).toHaveBeenCalledTimes(1))
    expect(room.value.exportJob.by).toBe('me')
  })

  it('Test4: if another device took the job first, this one does not make a second file', async () => {
    setJob(job('pending'))
    // by the time this device asks, the room says another device is already working on it
    mocks.runTransaction.mockImplementation(async (db, callback) =>
      callback({ get: async () => ({ data: () => ({ exportJob: job('working', { by: 'other' }) }) }), update: mocks.txUpdate })
    )
    mountPage()
    await flushPromises()
    expect(mocks.runTransaction).toHaveBeenCalledTimes(1)
    expect(mocks.txUpdate).not.toHaveBeenCalled()
    expect(mocks.buildExportFile).not.toHaveBeenCalled()
  })

  it('Test5: when making the file fails, the room is told, and everyone sees "That didn\'t work"', async () => {
    setJob(job('pending'))
    mocks.buildExportFile.mockRejectedValue(new Error('Could not make the MP4'))
    const page = mountPage()
    await vi.waitFor(() => expect(page.text()).toContain("That didn't work"))
    expect(room.value.exportJob.status).toBe('failed')
    expect(page.text()).toContain('Could not make the MP4')
    expect(mocks.createShare).not.toHaveBeenCalled()
  })

  it('Test6: "Try again" after a failure makes the file again', async () => {
    setJob(job('failed', { error: 'Could not make the MP4' }))
    const page = mountPage()
    await flushPromises()
    expect(mocks.buildExportFile).not.toHaveBeenCalled() // a failed job is not taken by itself
    await buttonNamed(page, 'Try again').trigger('click')
    await vi.waitFor(() => expect(mocks.buildExportFile).toHaveBeenCalledTimes(1))
  })

  it('Test7: leaving the page in the middle hands the job back, so another device can take it', async () => {
    setJob(job('pending'))
    const page = mountPage()
    await vi.waitFor(() => expect(mocks.buildExportFile).toHaveBeenCalledTimes(1)) // making it, never finishing
    mocks.updateDoc.mockClear()
    page.unmount()
    expect(mocks.updateDoc).toHaveBeenCalledWith('room-ref', { 'exportJob.status': 'pending' })
  })

  it('Test8: a file that was cancelled (null) is not shared', async () => {
    setJob(job('pending'))
    mocks.buildExportFile.mockResolvedValue(null)
    mountPage()
    await vi.waitFor(() => expect(mocks.buildExportFile).toHaveBeenCalledTimes(1))
    await flushPromises()
    expect(mocks.createShare).not.toHaveBeenCalled()
  })
})
