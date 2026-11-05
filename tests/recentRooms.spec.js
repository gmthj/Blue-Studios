import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { rememberRoom, recentRooms, forgetRoom, KEEP_MS } from '../src/recentRooms.js'

// Unit tests: the rooms this device was in lately (recentRooms.js), so the home page can offer "Go back into room 4821?"

const NOW = 1_800_000_000_000

beforeEach(() => {
  localStorage.clear()
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
})
afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('Unit test: recentRooms', () => {
  it('Test1: starts empty', () => {
    expect(recentRooms()).toEqual([])
  })

  it('Test2: remembers a room with the time this device was in it', () => {
    rememberRoom('4821')
    expect(recentRooms()).toEqual([{ code: '4821', at: NOW }])
  })

  it('Test3: the newest room comes first, and a room is only listed once', () => {
    rememberRoom('1111')
    vi.setSystemTime(NOW + 1000)
    rememberRoom('2222')
    vi.setSystemTime(NOW + 2000)
    rememberRoom('1111') // back in the first room: it moves to the top
    expect(recentRooms().map((item) => item.code)).toEqual(['1111', '2222'])
    expect(recentRooms()[0].at).toBe(NOW + 2000)
  })

  it('Test4: keeps at most 5 rooms', () => {
    for (const code of ['1000', '2000', '3000', '4000', '5000', '6000']) rememberRoom(code)
    expect(recentRooms().map((item) => item.code)).toEqual(['6000', '5000', '4000', '3000', '2000'])
  })

  it('Test5: rooms older than a day are left out', () => {
    rememberRoom('4821')
    expect(recentRooms(NOW + KEEP_MS - 1)).toHaveLength(1)
    expect(recentRooms(NOW + KEEP_MS)).toEqual([])
  })

  it('Test6: forgetting a room takes only that one off the list', () => {
    rememberRoom('1111')
    rememberRoom('2222')
    forgetRoom('1111')
    expect(recentRooms().map((item) => item.code)).toEqual(['2222'])
    forgetRoom('9999') // not on the list: nothing changes
    expect(recentRooms()).toHaveLength(1)
  })

  it('Test7: broken or tampered storage counts as no rooms', () => {
    localStorage.setItem('recentRooms', '{not json')
    expect(recentRooms()).toEqual([])
    localStorage.setItem('recentRooms', JSON.stringify({ code: '1234' })) // not a list
    expect(recentRooms()).toEqual([])
    localStorage.setItem('recentRooms', JSON.stringify([null, { code: 'abcd', at: NOW }, { code: '12345', at: NOW }, { code: '4821', at: NOW }]))
    expect(recentRooms().map((item) => item.code)).toEqual(['4821'])
  })

  it('Test8: when the browser blocks storage, nothing breaks and nothing is remembered', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked') })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked') })
    expect(() => rememberRoom('4821')).not.toThrow()
    expect(() => forgetRoom('4821')).not.toThrow()
    expect(recentRooms()).toEqual([])
  })
})
