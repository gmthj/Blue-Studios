// Guests do not need an account to join a room, so we give each browser
// a random guest id and remember it (and their name) in localStorage.
// This means refreshing the page keeps the same id, so the host stays the host.

export function getGuestId() {
  let id = localStorage.getItem('guestId')
  if (id === null) {
    id = 'guest-' + Date.now() + '-' + Math.floor(Math.random() * 100000)
    localStorage.setItem('guestId', id)
  }
  return id
}

export function getGuestName() {
  return localStorage.getItem('guestName') || ''
}

export function saveGuestName(name) {
  localStorage.setItem('guestName', name)
}

// Guess the device type from the browser's user agent text, e.g. "...iPhone..." or "...Android...Mobile..."
// Returns 'Phone', 'Tablet' or 'Computer'
export function getDeviceType() {
  const ua = navigator.userAgent

  // iPads (newer ones pretend to be a Mac, but Macs have no touch screen) and Android tablets
  const isIpad = ua.includes('iPad') || (ua.includes('Macintosh') && navigator.maxTouchPoints > 1)
  const isAndroidTablet = ua.includes('Android') && !ua.includes('Mobile')
  if (isIpad || isAndroidTablet) {
    return 'Tablet'
  }

  if (ua.includes('iPhone') || ua.includes('Android') || ua.includes('Mobile')) {
    return 'Phone'
  }

  return 'Computer'
}
