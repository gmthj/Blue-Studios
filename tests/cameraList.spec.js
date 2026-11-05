import { describe, it, expect, vi } from 'vitest'

// Unit tests: which cameras "Switch camera" goes through (onePerSide in useVideoCall.js).
// Phones list every lens as its own camera; we keep one front and one back, and every camera we can't place.

// useVideoCall.js also loads Agora, Firebase and the face filter, which these tests don't need
vi.mock('agora-rtc-sdk-ng', () => ({ default: { setLogLevel: vi.fn() } }))
vi.mock('../src/firebase.js', () => ({ auth: {} }))
vi.mock('../src/composables/useFaceFilter.js', () => ({ startFaceFilter: vi.fn(), changeFaceFilterCamera: vi.fn(), stopFaceFilter: vi.fn() }))
vi.mock('../src/composables/useBehindLayer.js', () => ({ setBehindLayerMirrored: vi.fn(), setRemoteTrackSource: vi.fn(), resetBehindLayer: vi.fn() }))

const { onePerSide } = await import('../src/composables/useVideoCall.js')

// A camera as the browser lists it. facing: what getCapabilities() says (Chrome); left out = no getCapabilities (Safari)
function camera(label, facing) {
  const device = { label: label, deviceId: label }
  if (facing !== undefined) device.getCapabilities = () => ({ facingMode: facing ? [facing] : [] })
  return device
}
const labels = (list) => list.map((c) => c.label)

describe('Unit test: onePerSide (the camera list)', () => {
  it('Test1: an iPhone with 4 back lenses and a front camera has just 2: front first, then the wide back one', () => {
    const list = onePerSide([
      camera('Back Camera'),
      camera('Back Dual Wide Camera'),
      camera('Back Telephoto Camera'),
      camera('Back Ultra Wide Camera'),
      camera('Front Camera'),
    ])
    expect(labels(list)).toEqual(['Front Camera', 'Back Ultra Wide Camera'])
  })

  it('Test2: telephoto is never picked over a normal lens on the same side', () => {
    expect(labels(onePerSide([camera('Back Telephoto Camera'), camera('Back Camera')]))).toEqual(['Back Camera'])
  })

  it('Test3: Android (Chrome) uses getCapabilities, and with names that say nothing the first one on each side wins', () => {
    const list = onePerSide([
      camera('camera2 0, facing back', 'environment'),
      camera('camera2 2, facing back', 'environment'),
      camera('camera2 1, facing front', 'user'),
      camera('camera2 3, facing front', 'user'),
    ])
    expect(labels(list)).toEqual(['camera2 1, facing front', 'camera2 0, facing back'])
  })

  it('Test4: getCapabilities wins over the name', () => {
    expect(labels(onePerSide([camera('Back Camera', 'user'), camera('Front Camera', 'environment')])))
      .toEqual(['Back Camera', 'Front Camera'])
  })

  it('Test5: laptop and USB webcams (no side) are all kept, after the phone cameras', () => {
    const list = onePerSide([camera('HD Webcam (046d:0825)', ''), camera('OBS Virtual Camera'), camera('FaceTime HD Camera (Built-in)', 'user')])
    expect(labels(list)).toEqual(['FaceTime HD Camera (Built-in)', 'HD Webcam (046d:0825)', 'OBS Virtual Camera'])
  })

  it('Test6: a getCapabilities that throws falls back to the name', () => {
    const broken = { label: 'Front Camera', getCapabilities: () => { throw new Error('not supported') } }
    expect(onePerSide([broken])).toEqual([broken])
  })

  it('Test7: no cameras, no list', () => {
    expect(onePerSide([])).toEqual([])
  })
})
