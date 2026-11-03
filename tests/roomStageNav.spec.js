import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import RoomStageNav from '../src/components/RoomStageNav.vue'
import { useRoom } from '../src/composables/useRoom.js'

// Component test: the bar docked to the bottom of the room that lists where the room can go (RoomStageNav.vue)

const mocks = vi.hoisted(() => ({ goToStage: vi.fn() }))

vi.mock('../src/composables/useRoom.js', async (importOriginal) => {
  const { ref } = await import('vue')
  const room = ref({})
  const photos = ref([])
  const clips = ref([])
  return {
    ...(await importOriginal()),
    useRoom: () => ({ room, photos, clips, goToStage: mocks.goToStage }),
  }
})

const { room, photos, clips } = useRoom()

// a room on this stage, with some photos, and some recorded clips (videos)
function setRoom(stage, { clipCount = 0, photoCount = 4 } = {}) {
  room.value = { stage }
  photos.value = Array.from({ length: photoCount }, (_, i) => ({ id: 'p' + i }))
  clips.value = Array.from({ length: clipCount }, (_, i) => ({ id: 'c' + i }))
}

function mountNav() {
  return mount(RoomStageNav)
}

// The labels of the options, top to bottom
const labels = (page) => page.findAll('button').map((button) => button.text())

beforeEach(() => {
  mocks.goToStage.mockReset()
  mocks.goToStage.mockResolvedValue(true)
})

describe('Component test: RoomStageNav', () => {
  it('Test1: the camera page has only Make photostrip, off until there is a photo or a clip', () => {
    setRoom('shoot', { photoCount: 0 })
    const empty = mountNav()
    expect(labels(empty)).toEqual(['Make photostrip'])
    expect(empty.find('[data-test="stage-next"]').attributes('disabled')).toBeDefined()
    setRoom('shoot', { photoCount: 0, clipCount: 1 })
    expect(mountNav().find('[data-test="stage-next"]').attributes('disabled')).toBeUndefined()
  })

  it('Test2: Pick has Shoot, Quick export and Decorate (no Edit video with fewer than 2 videos)', () => {
    setRoom('pick', { clipCount: 1 })
    expect(labels(mountNav())).toEqual(['Shoot', 'Quick export', 'Decorate'])
  })

  it('Test3: Pick adds Edit video, before Decorate, with 2 or more videos', () => {
    setRoom('pick', { clipCount: 2 })
    expect(labels(mountNav())).toEqual(['Shoot', 'Quick export', 'Edit video', 'Decorate'])
  })

  it('Test3b: on Pick, Back is on the left, shortcuts are in the middle and Decorate is the blue button on the right', () => {
    setRoom('pick', { clipCount: 2 })
    const page = mountNav()
    expect(page.find('.sn-back').text()).toBe('Shoot')
    expect(page.find('.sn-mid').findAll('button').map((button) => button.text())).toEqual(['Quick export', 'Edit video'])
    expect(page.find('.sn-next').text()).toBe('Decorate')
  })

  it('Test4: each option on Pick moves the room to its page', async () => {
    setRoom('pick', { clipCount: 2 })
    const page = mountNav()
    await page.find('[data-test="stage-back"]').trigger('click')
    await page.find('[data-test="stage-skip-export"]').trigger('click')
    await page.find('[data-test="stage-skip-video"]').trigger('click')
    await page.find('[data-test="stage-next"]').trigger('click')
    await flushPromises()
    expect(mocks.goToStage.mock.calls.map((call) => call[0])).toEqual(['shoot', 'export', 'video', 'decorate'])
  })

  it('Test5: Video has only Back to Pick', async () => {
    setRoom('video', { clipCount: 2 })
    const page = mountNav()
    expect(labels(page)).toEqual(['Back to Pick'])
    await page.find('[data-test="stage-back"]').trigger('click')
    expect(mocks.goToStage).toHaveBeenCalledWith('pick')
  })

  it('Test6: Decorate has Pick, Export without music and Add music, and Add music is the blue one', async () => {
    setRoom('decorate')
    const page = mountNav()
    expect(labels(page)).toEqual(['Pick', 'Export without music', 'Add music'])
    expect(page.find('.sn-mid').text()).toBe('Export without music')
    await page.find('[data-test="stage-skip-export"]').trigger('click')
    await page.find('[data-test="stage-next"]').trigger('click')
    expect(mocks.goToStage.mock.calls.map((call) => call[0])).toEqual(['export', 'music'])
  })

  it('Test7: Music has Decorate and Export, and no shortcuts', async () => {
    setRoom('music')
    const page = mountNav()
    expect(labels(page)).toEqual(['Decorate', 'Export'])
    expect(page.find('.sn-mid').exists()).toBe(false)
    await page.find('[data-test="stage-next"]').trigger('click')
    expect(mocks.goToStage).toHaveBeenCalledWith('export')
  })

  it('Test8: Export goes back to the step it came from', async () => {
    for (const from of ['pick', 'decorate', 'music']) {
      setRoom(from)
      const page = mountNav()
      room.value = { stage: 'export' }
      await flushPromises()
      expect(labels(page)).toEqual(['Back to ' + from[0].toUpperCase() + from.slice(1)])
      await page.find('[data-test="stage-back"]').trigger('click')
      expect(mocks.goToStage).toHaveBeenLastCalledWith(from)
    }
  })

  it('Test9: Export with no history (someone joined there) goes back to Decorate', () => {
    setRoom('export')
    expect(labels(mountNav())).toEqual(['Back to Decorate'])
  })

  it('Test10: Share has only Back to Export', () => {
    setRoom('share')
    expect(labels(mountNav())).toEqual(['Back to Export'])
  })
})
