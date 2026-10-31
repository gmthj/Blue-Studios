import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import VideoView from '../src/views/VideoView.vue'
import { useRoom } from '../src/composables/useRoom.js'

// Component + integration tests: the Video page (timeline, 15 second limit, saved edits)

// ---------- a pretend room and a pretend Firestore ----------

// vi.mock is moved to the top of the file, so what it needs is made with vi.hoisted
const mocks = vi.hoisted(() => ({
  DELETED: '__deleted__', // what deleteField() gives back in these tests
  updateDoc: vi.fn(),
  askConfirm: vi.fn(),
}))

// the room and its clips: a page reads them with useRoom(), and the tests change them
vi.mock('../src/composables/useRoom.js', async (importOriginal) => {
  const { ref } = await import('vue')
  const room = ref({})
  const clips = ref([])
  return { ...(await importOriginal()), useRoom: () => ({ room, clips, roomRef: () => 'room-ref' }) }
})
vi.mock('firebase/firestore', async (importOriginal) => ({
  ...(await importOriginal()),
  updateDoc: mocks.updateDoc,
  deleteField: () => mocks.DELETED,
}))
vi.mock('../src/composables/useDialog.js', async (importOriginal) => ({ ...(await importOriginal()), askConfirm: mocks.askConfirm }))
// a clip tile asks Storage for the clip's link
vi.mock('../src/studio.js', async (importOriginal) => ({ ...(await importOriginal()), getFileUrl: () => Promise.resolve('https://example.com/clip.webm') }))

const { room, clips } = useRoom()

// updateDoc changes the pretend room the way Firestore does: a key like 'a.b.c' changes only that one field
function applyChanges(target, changes) {
  for (const [key, value] of Object.entries(changes)) {
    const parts = key.split('.')
    let node = target
    for (const part of parts.slice(0, -1)) {
      if (node[part] === undefined || node[part] === null) node[part] = {}
      node = node[part]
    }
    const last = parts[parts.length - 1]
    if (value === mocks.DELETED) delete node[last]
    else node[last] = value
  }
}

// ---------- test data ----------

function makeClip(id, name, shotNumber) {
  return { id: id, name: name, shotNumber: shotNumber, path: 'clips/1234/uid/' + id + '.webm', mirrored: false }
}
const A = makeClip('a1', 'Rae', 1)
const B = makeClip('b2', 'Gabriel', 1)
const C = makeClip('c3', 'Joash', 1)
const D = makeClip('d4', 'Shannon', 2)
const E = makeClip('e5', 'Germaine', 2)
const F = makeClip('f6', 'Rae', 2)

// a timeline item for a whole 3 second clip
const whole = (clip) => ({ clipId: clip.id, start: 0, end: 3 })

// mount the page. The stage bar and the preview player are not what is tested here.
// withRealThumbs: also use the real clip tiles (for the integration test)
function mountPage(withRealThumbs) {
  return mount(VideoView, {
    global: { stubs: { StageBar: true, ClipSequencePlayer: true, ClipThumb: !withRealThumbs } },
  })
}

// the buttons of the page, found by what the user reads
const buttonsNamed = (wrapper, text) => wrapper.findAll('button').filter((b) => b.text() === text)
const buttonTitled = (wrapper, title) => wrapper.findAll('button[title="' + title + '"]')

// let go of a trim slider at a value (the page saves on "change", once, when the slider is let go)
async function dragSlider(slider, value) {
  slider.element.value = String(value)
  await slider.trigger('change')
  await flushPromises()
}

// the last thing the page asked Firestore to change
const lastChange = () => mocks.updateDoc.mock.calls.at(-1)[1]

beforeEach(() => {
  mocks.updateDoc.mockReset()
  mocks.updateDoc.mockImplementation(async (ref, changes) => applyChanges(room.value, changes))
  mocks.askConfirm.mockReset()
  mocks.askConfirm.mockResolvedValue(true) // "yes" to every "are you sure?"
  clips.value = [A, B, C, D, E, F]
  room.value = { videoTimeline: [], editedVideos: {}, stripSlots: {}, videoEditing: null }
})

// ---------- component tests ----------

describe('Component test: Video page, the timeline', () => {
  it('Test1: an empty timeline shows a hint, 0 seconds, and cannot be saved', () => {
    const page = mountPage()
    expect(page.text()).toContain('Press Add on a clip')
    expect(page.text()).toContain('0 clip(s) · 0.0 / 15s')
    expect(buttonsNamed(page, 'Save to gallery')[0].attributes('disabled')).toBeDefined()
  })

  it('Test2: lists each clip on the timeline with who recorded it, its shot and its trimmed length', () => {
    room.value.videoTimeline = [{ clipId: 'a1', start: 0.5, end: 2.5 }, whole(B)]
    const page = mountPage()
    expect(page.text()).toContain('Rae · Shot 1 · 2.0s')
    expect(page.text()).toContain('Gabriel · Shot 1 · 3.0s')
    expect(page.text()).toContain('2 clip(s) · 5.0 / 15s')
  })

  it('Test3: the first clip cannot move earlier and the last cannot move later', () => {
    room.value.videoTimeline = [whole(A), whole(B), whole(C)]
    const page = mountPage()
    const earlier = buttonTitled(page, 'Move earlier')
    const later = buttonTitled(page, 'Move later')
    expect(earlier[0].attributes('disabled')).toBeDefined()
    expect(earlier[1].attributes('disabled')).toBeUndefined()
    expect(later[2].attributes('disabled')).toBeDefined()
    expect(later[0].attributes('disabled')).toBeUndefined()
  })

  it('Test4: a clip moves later when its down arrow is pressed', async () => {
    room.value.videoTimeline = [whole(A), whole(B)]
    const page = mountPage()
    await buttonTitled(page, 'Move later')[0].trigger('click')
    await flushPromises()
    expect(lastChange().videoTimeline.map((item) => item.clipId)).toEqual(['b2', 'a1'])
  })

  it('Test5: a clip is taken off the timeline with the cross, and stays in the room clips', async () => {
    room.value.videoTimeline = [whole(A), whole(B)]
    const page = mountPage()
    await buttonTitled(page, 'Take off the timeline')[0].trigger('click')
    await flushPromises()
    expect(lastChange().videoTimeline.map((item) => item.clipId)).toEqual(['b2'])
    expect(page.text()).toContain('1 clip(s)')
    expect(buttonsNamed(page, 'Add').length).toBeGreaterThan(0) // the clip is there again, with an Add button
  })

  it('Test6: shows "On timeline" instead of an Add button for a clip that is already on it', () => {
    room.value.videoTimeline = [whole(A)]
    const page = mountPage()
    expect(page.text()).toContain('On timeline')
    expect(buttonsNamed(page, 'Add')).toHaveLength(5) // the other 5 clips can still be added
  })
})

describe('Component test: Video page, the 15 second limit', () => {
  it('Test1: Add is switched off when there is no room for another whole clip', async () => {
    room.value.videoTimeline = [whole(A), whole(B), whole(C), whole(D), whole(E)] // 5 x 3 s = 15 s
    const page = mountPage()
    const add = buttonsNamed(page, 'Add')[0] // the only clip left: F
    expect(add.attributes('disabled')).toBeDefined()
    expect(add.attributes('title')).toContain('No room left')
    await add.trigger('click')
    await flushPromises()
    expect(mocks.updateDoc).not.toHaveBeenCalled() // nothing was saved
  })

  it('Test2: an edit that is over 15 seconds says so and cannot be saved', () => {
    room.value.videoTimeline = [whole(A), whole(B), whole(C), whole(D), whole(E), whole(F)] // 18 s
    const page = mountPage()
    expect(page.text()).toContain('18.0 / 15s')
    expect(page.text()).toContain('This edit is over 15 seconds')
    expect(buttonsNamed(page, 'Save to gallery')[0].attributes('disabled')).toBeDefined()
  })

  it('Test3: "Add session" adds only the clips that fit, and says how many', async () => {
    room.value.videoTimeline = [whole(A), whole(B), whole(C)] // 9 s, so 6 s are free: room for 2 more clips
    const page = mountPage()
    await buttonsNamed(page, 'Add session')[1].trigger('click') // Session 2 has 3 clips: D, E, F
    await flushPromises()
    expect(lastChange().videoTimeline.map((item) => item.clipId)).toEqual(['a1', 'b2', 'c3', 'd4', 'e5'])
    expect(page.text()).toContain('Only 2 of 3 clips fit')
  })

  it('Test4: trimming a clip longer than the limit allows stops at the limit and says so', async () => {
    // 4 whole clips (12 s) + E from 0 to 1 + F from 0 to 1 = 14 s. F can grow by 1 second at most.
    room.value.videoTimeline = [whole(A), whole(B), whole(C), whole(D), { clipId: 'e5', start: 0, end: 1 }, { clipId: 'f6', start: 0, end: 1 }]
    const page = mountPage()
    const endSliders = page.findAll('input[type="range"]').filter((_, i) => i % 2 === 1) // every 2nd slider is an End
    const lastEnd = endSliders[endSliders.length - 1]
    await dragSlider(lastEnd, 3) // drag F's end to 3 s
    const f = lastChange().videoTimeline.find((item) => item.clipId === 'f6')
    expect(f.end - f.start).toBeCloseTo(2, 5) // 15 s - 13 s used by the others
    expect(page.text()).toContain('The 15 second limit is reached')
  })

  it('Test5: a trim is never shorter than 0.3 seconds: the other end is pushed along', async () => {
    room.value.videoTimeline = [{ clipId: 'a1', start: 1, end: 2 }]
    const page = mountPage()
    const endSlider = page.findAll('input[type="range"]')[1]
    await dragSlider(endSlider, 1.1) // end 0.1 s after the start
    const item = lastChange().videoTimeline[0]
    expect(item.end).toBeCloseTo(1.1, 5)
    expect(item.end - item.start).toBeGreaterThanOrEqual(0.3 - 1e-9)
  })
})

describe('Component test: Video page, saved edits', () => {
  it('Test1: "Save to gallery" saves the timeline as Edit 1 and empties the timeline', async () => {
    room.value.videoTimeline = [whole(A), { clipId: 'b2', start: 1, end: 2 }]
    const page = mountPage()
    await buttonsNamed(page, 'Save to gallery')[0].trigger('click')
    await flushPromises()
    const change = lastChange()
    expect(change.videoTimeline).toEqual([])
    const [key] = Object.keys(change).filter((k) => k.startsWith('editedVideos.'))
    expect(change[key].name).toBe('Edit 1')
    expect(change[key].timeline).toHaveLength(2)
    expect(page.text()).toContain('Saved as Edit 1!')
    expect(page.text()).toContain('Saved edits') // the new edit is in the list on the right
    expect(page.text()).toContain('0 clip(s)') // and the timeline is empty again
  })

  it('Test2: the next new edit is named one number higher', async () => {
    room.value.editedVideos = { x: { name: 'Edit 1', createdAt: 1, timeline: [whole(A)] }, y: { name: 'Edit 4', createdAt: 2, timeline: [whole(B)] } }
    room.value.videoTimeline = [whole(C)]
    const page = mountPage()
    await buttonsNamed(page, 'Save to gallery')[0].trigger('click')
    await flushPromises()
    expect(page.text()).toContain('Saved as Edit 5!')
  })

  it('Test3: lists the saved edits with their length', () => {
    room.value.editedVideos = { x: { name: 'Edit 1', createdAt: 1, timeline: [whole(A), whole(B)] } }
    const page = mountPage()
    expect(page.text()).toContain('Saved edits')
    expect(page.text()).toContain('Edit 1')
    expect(page.text()).toContain('2 clip(s) · 6.0s')
  })

  it('Test4: "Edit" opens a saved edit: the page says it is changing it, and saving writes back into it', async () => {
    room.value.editedVideos = { x: { name: 'Edit 1', createdAt: 1, timeline: [whole(A)] } }
    const page = mountPage()
    await buttonsNamed(page, 'Edit')[0].trigger('click')
    await flushPromises()
    expect(page.text()).toContain('Changing Edit 1')
    expect(buttonsNamed(page, 'Cancel')).toHaveLength(1)
    await buttonsNamed(page, 'Save changes')[0].trigger('click')
    await flushPromises()
    expect(lastChange()['editedVideos.x.timeline']).toHaveLength(1) // only that edit's timeline changed
    expect(page.text()).toContain('Saved as Edit 1!')
  })

  it('Test5: opening an edit asks first when the timeline has something that would be lost', async () => {
    room.value.editedVideos = { x: { name: 'Edit 1', createdAt: 1, timeline: [whole(A)] } }
    room.value.videoTimeline = [whole(B)]
    mocks.askConfirm.mockResolvedValue(false) // the user says no
    const page = mountPage()
    await buttonsNamed(page, 'Edit')[0].trigger('click')
    await flushPromises()
    expect(mocks.askConfirm).toHaveBeenCalledTimes(1)
    expect(mocks.updateDoc).not.toHaveBeenCalled()
    expect(page.text()).toContain('New edit') // still the timeline that was being worked on
  })

  it('Test6: deleting an edit also takes it out of the strip slots that used it', async () => {
    room.value.editedVideos = { x: { name: 'Edit 1', createdAt: 1, timeline: [whole(A)] } }
    room.value.stripSlots = { 0: 'x', 1: 'some-photo' }
    const page = mountPage()
    await buttonsNamed(page, 'Delete')[0].trigger('click')
    await flushPromises()
    const change = lastChange()
    expect(change['editedVideos.x']).toBe(mocks.DELETED)
    expect(change['stripSlots.0']).toBeNull()
    expect(change['stripSlots.1']).toBeUndefined() // the photo in slot 1 is left alone
    expect(page.text()).not.toContain('Saved edits') // the list is gone, there was only one edit
  })

  it('Test7: nothing is deleted when the user says no', async () => {
    room.value.editedVideos = { x: { name: 'Edit 1', createdAt: 1, timeline: [whole(A)] } }
    mocks.askConfirm.mockResolvedValue(false)
    const page = mountPage()
    await buttonsNamed(page, 'Delete')[0].trigger('click')
    await flushPromises()
    expect(mocks.updateDoc).not.toHaveBeenCalled()
    expect(page.text()).toContain('Edit 1')
  })

  it('Test8: "Done" moves the whole room back to the Pick page', async () => {
    const page = mountPage()
    await page.findAll('button').find((b) => b.text().startsWith('Done')).trigger('click')
    await flushPromises()
    expect(lastChange()).toEqual({ stage: 'pick' })
  })
})

// ---------- integration test: the page together with its real clip tiles ----------

describe('Integration test: Video page + ClipThumb', () => {
  it('Test1: every clip recorded in the room is a playable tile, grouped by session', async () => {
    const page = mountPage(true)
    await flushPromises() // each tile fetches its video link
    expect(page.text()).toContain('Session 1')
    expect(page.text()).toContain('Session 2')
    expect(page.findAll('video')).toHaveLength(6) // one real video tile per clip
    expect(page.find('video').attributes('src')).toContain('https://example.com/clip.webm')
  })

  it('Test2: adding clips one by one builds the timeline, and each added clip changes to "On timeline"', async () => {
    const page = mountPage(true)
    await flushPromises()
    await buttonsNamed(page, 'Add')[0].trigger('click') // A
    await flushPromises()
    await buttonsNamed(page, 'Add')[0].trigger('click') // now B is the first with an Add button
    await flushPromises()
    expect(page.text()).toContain('2 clip(s) · 6.0 / 15s')
    expect(page.text()).toContain('Rae · Shot 1 · 3.0s')
    expect(page.text()).toContain('Gabriel · Shot 1 · 3.0s')
    expect(page.findAll('.badge.text-bg-light').filter((b) => b.text() === 'On timeline')).toHaveLength(2)
    expect(buttonsNamed(page, 'Save to gallery')[0].attributes('disabled')).toBeUndefined() // can be saved now
  })
})
