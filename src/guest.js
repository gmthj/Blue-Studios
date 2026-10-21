// Guests do not need an account to join a room. Their user id comes from Firebase Auth
// (see composables/useAuth.js); here we only remember the name they typed, in localStorage.

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
