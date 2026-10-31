import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises, RouterLinkStub } from '@vue/test-utils'
import SharedStrip from '../src/components/SharedStrip.vue'
import PublicShareView from '../src/views/PublicShareView.vue'
import { shareLink } from '../src/shares.js'

// Component + integration tests: the finished strip (picture or video, QR code, link, Download) and the page its link opens

// ---------- pretend helpers ----------

// vi.mock is moved to the top of the file, so what it needs is made with vi.hoisted
const mocks = vi.hoisted(() => ({
  toDataURL: vi.fn(),
  getShare: vi.fn(),
  writeText: vi.fn(),
  routeId: { value: 'abc123' },
}))

// the QR code picture is drawn on a canvas, which the test browser does not have: a fake that only remembers what it was asked to encode
vi.mock('qrcode', () => ({ default: { toDataURL: mocks.toDataURL } }))
vi.mock('../src/shares.js', async (importOriginal) => ({ ...(await importOriginal()), getShare: mocks.getShare }))
// the page reads the id from the address (/s/abc123)
vi.mock('vue-router', async (importOriginal) => ({
  ...(await importOriginal()),
  useRoute: () => ({ params: { id: mocks.routeId.value } }),
}))

const SHARE = { id: 'abc123', title: 'Our trip', format: 'mp4', fileUrl: 'https://example.com/our-trip.mp4', size: 3 * 1024 * 1024 }

beforeEach(() => {
  mocks.toDataURL.mockReset()
  mocks.toDataURL.mockResolvedValue('data:image/png;base64,FAKEQR')
  mocks.getShare.mockReset()
  mocks.writeText.mockReset()
  mocks.writeText.mockResolvedValue()
  // the browser's clipboard
  Object.defineProperty(navigator, 'clipboard', { value: { writeText: mocks.writeText }, configurable: true })
})

async function mountStrip(changes, slot) {
  const wrapper = mount(SharedStrip, { props: { share: { ...SHARE, ...changes } }, slots: slot ? { default: slot } : {} })
  await flushPromises() // the QR code is made a moment after
  return wrapper
}

// ---------- component tests: SharedStrip ----------

describe('Component test: SharedStrip, the strip itself', () => {
  it('Test1: an MP4 is shown as a video that can be played', async () => {
    const strip = await mountStrip({ format: 'mp4' })
    const video = strip.find('video')
    expect(video.exists()).toBe(true)
    expect(video.attributes('src')).toBe(SHARE.fileUrl)
    expect(video.attributes('controls')).toBeDefined()
    expect(strip.find('img[alt="Our trip"]').exists()).toBe(false)
  })

  it('Test2: a PNG and a GIF are shown as a picture', async () => {
    for (const format of ['png', 'gif']) {
      const strip = await mountStrip({ format: format, fileUrl: 'https://example.com/our-trip.' + format })
      const picture = strip.find('img[alt="Our trip"]')
      expect(picture.exists()).toBe(true)
      expect(picture.attributes('src')).toBe('https://example.com/our-trip.' + format)
      expect(strip.find('video').exists()).toBe(false)
    }
  })

  it('Test3: says the format and the size of the file', async () => {
    const strip = await mountStrip({ format: 'gif', size: Math.round(2.5 * 1024 * 1024) })
    expect(strip.text()).toContain('GIF · 2.5 MB')
  })
})

describe('Component test: SharedStrip, the link and the QR code', () => {
  it('Test1: shows the link to the strip, which is the site we are on and /s/ and the id', async () => {
    const strip = await mountStrip()
    expect(strip.text()).toContain(shareLink('abc123'))
    expect(strip.find('a[href="' + shareLink('abc123') + '"]').exists()).toBe(true)
  })

  it('Test2: the QR code encodes that same link, so scanning it opens the strip', async () => {
    const strip = await mountStrip()
    expect(mocks.toDataURL).toHaveBeenCalledTimes(1)
    expect(mocks.toDataURL.mock.calls[0][0]).toBe(shareLink('abc123'))
    expect(strip.find('img[alt^="QR code"]').attributes('src')).toBe('data:image/png;base64,FAKEQR')
  })

  it('Test3: a different strip gets a different link and QR code', async () => {
    const strip = await mountStrip()
    await strip.setProps({ share: { ...SHARE, id: 'zzz999' } })
    await flushPromises()
    expect(mocks.toDataURL).toHaveBeenLastCalledWith(shareLink('zzz999'), expect.anything())
    expect(strip.text()).toContain(shareLink('zzz999'))
  })

  it('Test4: "Copy link" copies the link and says it is copied', async () => {
    const strip = await mountStrip()
    const copy = strip.findAll('button').find((b) => b.text() === 'Copy link')
    await copy.trigger('click')
    await flushPromises()
    expect(mocks.writeText).toHaveBeenCalledWith(shareLink('abc123'))
    expect(strip.text()).toContain('Link copied!')
  })

  it('Test5: if the browser does not allow copying, nothing breaks and it does not say "copied"', async () => {
    mocks.writeText.mockRejectedValue(new Error('not allowed'))
    const strip = await mountStrip()
    await strip.findAll('button').find((b) => b.text() === 'Copy link').trigger('click')
    await flushPromises()
    expect(strip.text()).not.toContain('Link copied!')
  })
})

describe('Component test: SharedStrip, Download', () => {
  it('Test1: the Download button is a link to the file, and names the format', async () => {
    const strip = await mountStrip({ format: 'gif', fileUrl: 'https://example.com/f.gif' })
    const download = strip.find('a[download]')
    expect(download.exists()).toBe(true)
    expect(download.attributes('href')).toBe('https://example.com/f.gif')
    expect(download.text()).toBe('Download GIF')
  })

  it('Test2: whatever a page puts inside it (like Save to My Studio) shows under the buttons', async () => {
    const strip = await mountStrip({}, '<button>Save to My Studio</button>')
    expect(strip.text()).toContain('Save to My Studio')
  })
})

// ---------- component + integration tests: the page the link opens ----------

function mountPublicPage() {
  return mount(PublicShareView, { global: { stubs: { RouterLink: RouterLinkStub } } })
}

describe('Component test: PublicShareView (the page /s/:id)', () => {
  it('Test1: shows "Opening the strip" while the strip is being fetched', () => {
    mocks.getShare.mockReturnValue(new Promise(() => {})) // never answers
    const page = mountPublicPage()
    expect(page.text()).toContain('Opening the strip')
  })

  it('Test2: asks for the strip whose id is in the address', async () => {
    mocks.getShare.mockResolvedValue(SHARE)
    mountPublicPage()
    await flushPromises()
    expect(mocks.getShare).toHaveBeenCalledWith('abc123')
  })

  it('Test3: shows the strip\'s name, and a way to make your own strip', async () => {
    mocks.getShare.mockResolvedValue(SHARE)
    const page = mountPublicPage()
    await flushPromises()
    expect(page.text()).toContain('Shared strip')
    expect(page.find('h1').text()).toBe('Our trip')
    const makeYourOwn = page.findAllComponents(RouterLinkStub).find((l) => l.text().includes('Make your own strip'))
    expect(makeYourOwn.props('to')).toBe('/')
  })

  it('Test4: a link to a strip that is not there says so', async () => {
    mocks.getShare.mockResolvedValue(null)
    const page = mountPublicPage()
    await flushPromises()
    expect(page.text()).toContain("This strip isn't here")
    expect(page.text()).not.toContain('Shared strip') // no strip is shown
    expect(page.find('img[alt^="QR code"]').exists()).toBe(false)
  })

  it('Test5: a problem fetching the strip says the same, and does not crash', async () => {
    mocks.getShare.mockRejectedValue(new Error('offline'))
    const page = mountPublicPage()
    await flushPromises()
    expect(page.text()).toContain("This strip isn't here")
  })
})

describe('Integration test: PublicShareView + SharedStrip', () => {
  it('Test1: anyone with the link sees the strip, its QR code, the link and Download', async () => {
    mocks.getShare.mockResolvedValue({ ...SHARE, format: 'gif', fileUrl: 'https://example.com/our-trip.gif' })
    const page = mountPublicPage()
    await flushPromises()
    expect(page.find('img[alt="Our trip"]').attributes('src')).toBe('https://example.com/our-trip.gif')
    expect(page.find('img[alt^="QR code"]').exists()).toBe(true)
    expect(page.text()).toContain(shareLink('abc123'))
    expect(page.find('a[download]').text()).toBe('Download GIF')
  })

  it('Test2: a page for someone who is not in the room has no Save to My Studio button', async () => {
    mocks.getShare.mockResolvedValue(SHARE)
    const page = mountPublicPage()
    await flushPromises()
    expect(page.text()).not.toContain('Save to My Studio')
  })
})
