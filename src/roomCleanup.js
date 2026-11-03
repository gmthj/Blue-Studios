import { isActive } from './roomTiming.js'

// Room cleanup rules. ONE place, used by the daily sweeper (api/cleanup.js) and by the Rooms tab of the
// admin page (the "Cleanup" column), so the page always shows what the sweeper will really do.
// No imports from the browser code on purpose: the server loads this file too.
//
// Rules, checked in this order (the first one that is due wins):
//   R1  open, no media, nobody here for 1 hour           -> delete
//   R2  closed, no media, closed for 24 hours            -> delete
//   R3  open, has media, nobody here for 6 hours         -> close
//   R4  closed, has media, nobody here for 30 days       -> delete
//   R5  open for more than 24 hours in total             -> close (even if someone is "here": a tab left open)
//   R6  host is named "Playwright" (our automatic tests)  -> delete 1 hour after it was made, whatever is inside
//       (R6 skips the others: a test room is junk even if it has photos, or someone is "here")
// A room with keep: true (set by an admin) is never touched. Rooms with someone here now only follow R5.

const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR

export const CLEANUP = {
  emptyNoMediaMs: 1 * HOUR, // R1
  closedNoMediaMs: 1 * DAY, // R2
  emptyWithMediaMs: 6 * HOUR, // R3
  closedWithMediaMs: 30 * DAY, // R4
  openMaxMs: 1 * DAY, // R5
  testRoomMs: 1 * HOUR, // R6
}

// The name the Playwright tests (tests e2e) give their host. Rooms made by them are deleted by R6.
export const TEST_HOST_NAME = 'Playwright'

export function isTestRoom(room) {
  return typeof room.hostName === 'string' && room.hostName.trim().toLowerCase() === TEST_HOST_NAME.toLowerCase()
}

// Does the room hold anything worth keeping? Every photo and clip needs shotNumber >= 1,
// so we do not have to read the photos and clips lists.
export function hasMedia(room) {
  const edited = room.editedVideos && typeof room.editedVideos === 'object' ? Object.keys(room.editedVideos).length : 0
  const slots = room.stripSlots && typeof room.stripSlots === 'object' ? Object.keys(room.stripSlots).length : 0
  return (room.shotNumber || 0) > 0 || edited > 0 || slots > 0
}

// The last time anyone was in the room. room.lastActive is written when someone leaves (useRoom.js),
// because leaving deletes the member document. Someone who just closed the page leaves a stale lastSeen.
export function lastPresence(room, members) {
  let latest = room.createdAt || 0
  if (typeof room.lastActive === 'number') latest = Math.max(latest, room.lastActive)
  for (const member of members) {
    latest = Math.max(latest, member.lastSeen || 0, member.joinedAt || 0)
  }
  return latest
}

// What the cleanup will do to this room next.
//   room: the room document, members: its member documents, now: Date.now()
// Returns { rule, action, dueAt, due }
//   action  'delete', 'close' or 'none' (kept, or nothing to do)
//   dueAt   when it becomes eligible (ms), or null
//   due     true if it is eligible now (the next sweep does it)
export function cleanupStatus(room, members, now) {
  const none = { rule: 0, action: 'none', dueAt: null, due: false }
  if (room.keep === true) return none
  if (typeof room.createdAt !== 'number') return none

  // R6: a test room is deleted an hour after it was made, so a test that is still running is not cut off
  if (isTestRoom(room)) {
    const dueAt = room.createdAt + CLEANUP.testRoomMs
    return { rule: 6, action: 'delete', dueAt: dueAt, due: dueAt <= now }
  }

  const media = hasMedia(room)
  const presence = lastPresence(room, members)
  const occupied = members.some((member) => isActive(member, now))
  const candidates = []

  if (!room.closed) {
    if (!occupied) {
      if (!media) candidates.push({ rule: 1, action: 'delete', dueAt: presence + CLEANUP.emptyNoMediaMs })
      else candidates.push({ rule: 3, action: 'close', dueAt: presence + CLEANUP.emptyWithMediaMs })
    }
    candidates.push({ rule: 5, action: 'close', dueAt: room.createdAt + CLEANUP.openMaxMs })
  } else if (!occupied) {
    if (!media) candidates.push({ rule: 2, action: 'delete', dueAt: presence + CLEANUP.closedNoMediaMs })
    else candidates.push({ rule: 4, action: 'delete', dueAt: presence + CLEANUP.closedWithMediaMs })
  }

  if (candidates.length === 0) return none

  // Rule numbers are the priority. If one is due, it wins; otherwise show the soonest one.
  const due = candidates.filter((c) => c.dueAt <= now).sort((a, b) => a.rule - b.rule)
  if (due.length > 0) return { ...due[0], due: true }
  const soonest = candidates.sort((a, b) => a.dueAt - b.dueAt)[0]
  return { ...soonest, due: false }
}

// Short text for the admin page, e.g. "deletes in 23 days", "closes in 5 h", "kept".
// The sweep runs once a day, so something already due says it happens at the next sweep.
export function cleanupLabel(status, room, now) {
  if (room.keep === true) return 'kept'
  if (status.action === 'none') return ''
  const verb = status.action === 'delete' ? 'deletes' : 'closes'
  if (status.due) return verb + ' at next daily sweep'
  const ms = status.dueAt - now
  if (ms >= DAY) {
    const days = Math.ceil(ms / DAY)
    return verb + ' in ' + days + (days === 1 ? ' day' : ' days')
  }
  return verb + ' in ' + Math.max(1, Math.ceil(ms / HOUR)) + ' h'
}

// Written in the admin log next to each automatic action
export const RULE_NAMES = {
  1: 'R1: open room with no photos or videos, empty for 1 hour',
  2: 'R2: closed room with no photos or videos, 24 hours',
  3: 'R3: open room left empty for 6 hours',
  4: 'R4: closed room, 30 days',
  5: 'R5: open for more than 24 hours',
  6: 'R6: test room (host named Playwright)',
}
