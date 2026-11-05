// The rooms this device was in lately, so the home page can offer to go back into one that is still open
// (e.g. after pressing Leave by mistake, or closing the tab). Kept on this device only (localStorage).
// try/catch everywhere because some browsers block localStorage (e.g. private mode): then there is
// simply nothing to rejoin, which is fine.
//
// Each entry: { code: '4821', at: 1730700000000 }   at: when this device was last in the room

const STORAGE_KEY = 'recentRooms'
const MAX_ROOMS = 5
export const KEEP_MS = 24 * 60 * 60 * 1000 // a day: older rooms are cleaned up anyway (api/cleanup.js)

function read() {
  try {
    const list = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')
    return Array.isArray(list) ? list.filter((item) => item && /^\d{4}$/.test(item.code)) : []
  } catch {
    return []
  }
}

function write(list) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list.slice(0, MAX_ROOMS)))
  } catch {
    // storage blocked: nothing is remembered
  }
}

// RoomLayout.vue calls this when we are in a room: it goes to the top of the list
export function rememberRoom(code) {
  const others = read().filter((item) => item.code !== code)
  write([{ code: code, at: Date.now() }, ...others])
}

// The rooms from the last day, newest first
export function recentRooms(now = Date.now()) {
  return read().filter((item) => now - item.at < KEEP_MS)
}

// "Not now" pressed on the home page, or the room is closed / gone
export function forgetRoom(code) {
  write(read().filter((item) => item.code !== code))
}
