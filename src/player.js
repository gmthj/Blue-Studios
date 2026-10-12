// Guests do not need an account to join a room, so we give each browser
// a random player id and remember it (and their name) in localStorage.
// This means refreshing the page keeps the same id, so the host stays the host.

export function getPlayerId() {
  let id = localStorage.getItem('playerId')
  if (id === null) {
    id = 'player-' + Date.now() + '-' + Math.floor(Math.random() * 100000)
    localStorage.setItem('playerId', id)
  }
  return id
}

export function getPlayerName() {
  return localStorage.getItem('playerName') || ''
}

export function savePlayerName(name) {
  localStorage.setItem('playerName', name)
}
