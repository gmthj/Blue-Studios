import { describe, it, expect } from 'vitest'
import { cleanupStatus, cleanupLabel, hasMedia, lastPresence, isTestRoom, CLEANUP } from '../src/roomCleanup.js'

const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR
const NOW = 100 * DAY

function room(changes = {}) {
  return { hostId: 'h', closed: false, shotNumber: 0, stripSlots: {}, createdAt: NOW - 2 * HOUR, ...changes }
}
const here = { lastSeen: NOW - 10 * 1000, joinedAt: NOW - 3000 * 1000 }

describe('hasMedia', () => {
  it('is false for an untouched room', () => expect(hasMedia(room())).toBe(false))
  it('is true after a shot, a filled slot or an edited video', () => {
    expect(hasMedia(room({ shotNumber: 1 }))).toBe(true)
    expect(hasMedia(room({ stripSlots: { 0: 'p1' } }))).toBe(true)
    expect(hasMedia(room({ editedVideos: { e1: { name: 'Edit 1' } } }))).toBe(true)
  })
})

describe('lastPresence', () => {
  it('uses the newest of createdAt, lastActive and every member', () => {
    expect(lastPresence(room({ createdAt: 5 }), [])).toBe(5)
    expect(lastPresence(room({ createdAt: 5, lastActive: 9 }), [{ lastSeen: 7, joinedAt: 1 }])).toBe(9)
    expect(lastPresence(room({ createdAt: 5, lastActive: 9 }), [{ lastSeen: 20, joinedAt: 1 }])).toBe(20)
  })
})

describe('cleanupStatus', () => {
  it('R1: an empty open room with no media is deleted after 1 hour', () => {
    const fresh = cleanupStatus(room({ createdAt: NOW - 30 * 60 * 1000 }), [], NOW)
    expect(fresh).toMatchObject({ rule: 1, action: 'delete', due: false })
    expect(cleanupStatus(room(), [], NOW)).toMatchObject({ rule: 1, action: 'delete', due: true })
  })

  it('R1 counts from when the last person left, not from when the room was made', () => {
    const left = room({ createdAt: NOW - 10 * HOUR, lastActive: NOW - 20 * 60 * 1000 })
    expect(cleanupStatus(left, [], NOW)).toMatchObject({ rule: 1, due: false })
  })

  it('R3: an empty open room with media is closed after 6 hours, not deleted', () => {
    const waiting = room({ shotNumber: 3, createdAt: NOW - 4 * HOUR })
    expect(cleanupStatus(waiting, [], NOW)).toMatchObject({ rule: 3, action: 'close', due: false })
    const old = room({ shotNumber: 3, createdAt: NOW - 8 * HOUR })
    expect(cleanupStatus(old, [], NOW)).toMatchObject({ rule: 3, action: 'close', due: true })
  })

  it('R2: a closed room with no media is deleted a day after anyone was last in it', () => {
    const closed = room({ closed: true, createdAt: NOW - 3 * DAY })
    expect(cleanupStatus(closed, [], NOW)).toMatchObject({ rule: 2, action: 'delete', due: true })
    const justClosed = room({ closed: true, createdAt: NOW - 3 * DAY, lastActive: NOW - 2 * HOUR })
    expect(cleanupStatus(justClosed, [], NOW)).toMatchObject({ rule: 2, due: false })
  })

  it('R4: a closed room with media is deleted 30 days after anyone was last in it', () => {
    const base = { closed: true, shotNumber: 4, createdAt: NOW - 40 * DAY }
    const recent = cleanupStatus(room({ ...base, lastActive: NOW - 7 * DAY }), [], NOW)
    expect(recent).toMatchObject({ rule: 4, action: 'delete', due: false })
    expect(recent.dueAt - NOW).toBe(23 * DAY)
    expect(cleanupStatus(room({ ...base, lastActive: NOW - 31 * DAY }), [], NOW)).toMatchObject({ rule: 4, due: true })
  })

  it('R5: an open room is closed after 24 hours even with someone in it', () => {
    const tabLeftOpen = room({ shotNumber: 2, createdAt: NOW - 30 * HOUR })
    expect(cleanupStatus(tabLeftOpen, [here], NOW)).toMatchObject({ rule: 5, action: 'close', due: true })
  })

  it('a room with someone in it is not touched by the empty-room rules', () => {
    const status = cleanupStatus(room({ createdAt: NOW - 5 * HOUR }), [here], NOW)
    expect(status).toMatchObject({ rule: 5, due: false })
    expect(status.dueAt).toBe(NOW - 5 * HOUR + CLEANUP.openMaxMs)
  })

  it('the lower rule number wins when two are due (delete beats close)', () => {
    const both = room({ createdAt: NOW - 30 * HOUR }) // empty, no media: R1 and R5 are both due
    expect(cleanupStatus(both, [], NOW)).toMatchObject({ rule: 1, action: 'delete' })
  })

  it('R6: a room whose host is named Playwright is deleted an hour after it was made, whatever is in it', () => {
    const test = room({ hostName: 'Playwright', shotNumber: 5, stripSlots: { 0: 'p' }, createdAt: NOW - 2 * HOUR })
    expect(cleanupStatus(test, [here], NOW)).toMatchObject({ rule: 6, action: 'delete', due: true })
    const fresh = room({ hostName: ' playwright ', createdAt: NOW - 10 * 60 * 1000 })
    expect(cleanupStatus(fresh, [here], NOW)).toMatchObject({ rule: 6, action: 'delete', due: false })
    expect(isTestRoom(room({ hostName: 'Playwright Fan' }))).toBe(false)
    expect(isTestRoom(room({ hostName: 'Gabriel' }))).toBe(false)
  })

  it('keep: true is never touched', () => {
    const kept = cleanupStatus(room({ keep: true, createdAt: NOW - 90 * DAY }), [], NOW)
    expect(kept).toMatchObject({ action: 'none', due: false })
  })

  it('a stale member (closed the page) does not keep a room alive', () => {
    const gone = { lastSeen: NOW - 2 * HOUR, joinedAt: NOW - 3 * HOUR }
    expect(cleanupStatus(room({ createdAt: NOW - 3 * HOUR }), [gone], NOW)).toMatchObject({ rule: 1, due: true })
  })
})

describe('cleanupLabel', () => {
  it('says how long is left', () => {
    const r = room({ closed: true, shotNumber: 4, createdAt: NOW - 40 * DAY, lastActive: NOW - 7 * DAY })
    expect(cleanupLabel(cleanupStatus(r, [], NOW), r, NOW)).toBe('deletes in 23 days')
  })
  it('says hours when under a day, and the next sweep when due', () => {
    const waiting = room({ shotNumber: 1, createdAt: NOW - 3 * HOUR, lastActive: NOW - 3 * HOUR })
    expect(cleanupLabel(cleanupStatus(waiting, [], NOW), waiting, NOW)).toBe('closes in 3 h')
    const due = room()
    expect(cleanupLabel(cleanupStatus(due, [], NOW), due, NOW)).toBe('deletes at next daily sweep')
  })
  it('says kept for a kept room', () => {
    const r = room({ keep: true })
    expect(cleanupLabel(cleanupStatus(r, [], NOW), r, NOW)).toBe('kept')
  })
})
