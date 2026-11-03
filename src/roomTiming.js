// Who is "in a room right now". No imports on purpose: the server (api/cleanup.js) uses this file too,
// and it cannot load the Firebase browser code that room.js pulls in.

// Every device in a room updates its "lastSeen" time every 15 seconds (see useRoom.js).
// If a member has not been seen for 45 seconds, they closed the page, so we stop counting them.
export const HEARTBEAT_MS = 15 * 1000
export const ACTIVE_MS = 45 * 1000

// Is this member still in the room?
export function isActive(member, now) {
  return member.lastSeen !== undefined && now - member.lastSeen < ACTIVE_MS
}
