// ============================================================
// Blue Studios Photobooth — live ("dynamic") stickers
// src/dynamicStickers.js
// ============================================================
// WHY this file exists: a dynamic sticker (time, date, weather, location) is not a fixed
// picture. Firebase stores its SETTINGS (stickers/{id}.config) and each page draws it
// fresh, so a time sticker shows the time when the strip is made, not when it was saved.
// The Sticker Maker (Rae), the Template Editor (Joash) and the Decorate tray (Germaine)
// all draw it with THIS file, so it looks the same everywhere.
//
// HOW to use it (any page):
//   import { renderDynamicSticker } from '../dynamicStickers.js'
//   const { url, ratio } = await renderDynamicSticker(sticker.config)
//   <img :src="url">  — a data: URL, so it can also be drawn on an export canvas.
//
// The config is small plain data, for example:
//   { type: 'time', style: 'pill', hour12: true, timeZone: '' }
//   { type: 'weather', style: 'bold', city: 'Singapore', country: 'SG' }
//
// This file imports nothing (no Firebase), like stickerArt.js, so it is safe to share.
// The weather comes from our own /api/weather function, which keeps the key secret.
// ============================================================

export const DYNAMIC_TYPES = [
  { id: 'time', label: 'Time' },
  { id: 'date', label: 'Date' },
  { id: 'weather', label: 'Weather' },
  { id: 'location', label: 'Location' },
]

export const DYNAMIC_STYLES = [
  { id: 'pill', label: 'Clean' },
  { id: 'bold', label: 'Bold' },
  { id: 'retro', label: 'Retro' },
]

// WHY: colours for each style. Written out here (not CSS variables) because the sticker
// is an SVG picture, which cannot see the page's CSS.
const STYLE_COLORS = {
  pill:  { bg: '#FFFFFF', line: '#E3E6EE', main: '#14172B', sub: '#6B7080', tile: '#E8EEFF', icon: '#2F5BEA' },
  bold:  { bg: '#2F5BEA', line: '#2449C4', main: '#FFFFFF', sub: '#D9E1FF', tile: '#FFFFFF', icon: '#2F5BEA' },
  retro: { bg: '#FDE047', line: '#14172B', main: '#14172B', sub: '#14172B', tile: '#F472B6', icon: '#14172B' },
}

// WHY system fonts only: an SVG shown through <img> is not allowed to load web fonts,
// so a Google font would silently fall back anyway. These look the same on screen and
// in the exported file.
const FONT = "'Segoe UI', 'Helvetica Neue', Helvetica, Arial, sans-serif"

// Line icons (24 x 24), drawn with the style's icon colour.
const ICONS = {
  time: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  date: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/>',
  location: '<path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>',
  Clear: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  Clouds: '<path d="M17.5 19H8a5 5 0 1 1 .9-9.9A6 6 0 0 1 20 11.5a3.8 3.8 0 0 1-2.5 7.5z"/>',
  Rain: '<path d="M16 13H8a4 4 0 1 1 .7-7.9A5 5 0 0 1 18 7.5 3 3 0 0 1 16 13z"/><path d="M8 17l-1 3M12 17l-1 3M16 17l-1 3"/>',
  Thunderstorm: '<path d="M16 12H8a4 4 0 1 1 .7-7.9A5 5 0 0 1 18 6.5 3 3 0 0 1 16 12z"/><path d="M12 13l-2 4h4l-2 4"/>',
  Snow: '<path d="M12 2v20M4.9 7l14.2 10M4.9 17L19.1 7"/>',
  Mist: '<path d="M4 9h16M3 13h18M5 17h14"/>',
}

// OpenWeatherMap has more conditions than icons; these share a picture.
const ICON_ALIASES = { Drizzle: 'Rain', Haze: 'Mist', Fog: 'Mist', Smoke: 'Mist', Dust: 'Mist', Sand: 'Mist', Ash: 'Mist', Squall: 'Rain', Tornado: 'Thunderstorm' }

// WHY: city names come from the internet and go inside SVG markup. Escaping them stops
// a name like "<script>" from ever becoming part of the picture's code.
function escapeXml(text) {
  return String(text).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c])
}

// A quick check that a config is one this file can draw (used before saving too).
export function isDynamicConfig(config) {
  if (!config || typeof config !== 'object') return false
  if (!DYNAMIC_TYPES.some((t) => t.id === config.type)) return false
  if (!DYNAMIC_STYLES.some((s) => s.id === config.style)) return false
  if ((config.type === 'weather' || config.type === 'location') && !config.city) return false
  return true
}

// WHY: only these fields are ever saved to Firebase, each with a fixed type and size, so the
// security rules can check them exactly (see the rule Gabriel adds for stickers.config).
// Note there are no coordinates: a weather or location sticker stores only the city name,
// never where the person was standing.
export function cleanDynamicConfig(config) {
  const clean = { type: config.type, style: config.style }
  if (config.type === 'time') clean.hour12 = config.hour12 !== false
  if (config.type === 'time' || config.type === 'date') clean.timeZone = String(config.timeZone || '').slice(0, 40)
  if (config.type === 'weather' || config.type === 'location') {
    clean.city = String(config.city || '').slice(0, 60)
    clean.country = String(config.country || '').slice(0, 2)
  }
  return clean
}

// WHY a try: a time zone typed wrong would throw and blank the whole sticker. Falling back
// to the viewer's own time zone is always better than nothing.
function formatParts(now, options, timeZone) {
  try {
    return new Intl.DateTimeFormat('en-GB', timeZone ? { ...options, timeZone } : options).format(now)
  } catch (error) {
    return new Intl.DateTimeFormat('en-GB', options).format(now)
  }
}

// The two lines of text on the sticker. live is the weather answer ({ temp, description }),
// or null while it loads or for types that need no internet.
export function dynamicText(config, live = null, now = new Date()) {
  if (config.type === 'time') {
    const main = formatParts(now, { hour: 'numeric', minute: '2-digit', hour12: config.hour12 !== false }, config.timeZone)
    // A time zone like 'Asia/Singapore' reads better as 'Singapore time'.
    const zone = config.timeZone ? config.timeZone.split('/').pop().replace(/_/g, ' ') + ' time' : 'Local time'
    return { main: main.replace('am', 'AM').replace('pm', 'PM'), sub: zone }
  }
  if (config.type === 'date') {
    return {
      main: formatParts(now, { weekday: 'short', day: 'numeric', month: 'short' }, config.timeZone),
      sub: formatParts(now, { year: 'numeric' }, config.timeZone),
    }
  }
  if (config.type === 'weather') {
    const main = live ? live.temp + '°C' : '--°C'
    const sub = (live && live.description ? live.description + ' · ' : '') + config.city
    return { main, sub }
  }
  // location
  return { main: config.city, sub: config.country ? config.country : 'Here right now' }
}

// The whole sticker as SVG text.
export function dynamicSvg(config, live = null, now = new Date()) {
  const colors = STYLE_COLORS[config.style] || STYLE_COLORS.pill
  const text = dynamicText(config, live, now)
  const iconKey = config.type === 'weather'
    ? (ICON_ALIASES[live && live.condition] || (live && live.condition) || 'Clear')
    : config.type
  const icon = ICONS[iconKey] || ICONS.Clear

  // WHY estimate the width: SVG cannot measure text before it is drawn, so the box is
  // sized from the number of letters. Bold 34px letters are about 20px wide.
  const mainWidth = String(text.main).length * 20
  const subWidth = String(text.sub).length * 8.4
  const width = Math.round(Math.max(200, 96 + Math.max(mainWidth, subWidth) + 24))
  const height = 88
  const radius = config.style === 'retro' ? 18 : 44
  const stroke = config.style === 'retro' ? 4 : 2

  return '<svg xmlns="http://www.w3.org/2000/svg" width="' + width + '" height="' + height + '" viewBox="0 0 ' + width + ' ' + height + '">' +
    '<rect x="' + stroke / 2 + '" y="' + stroke / 2 + '" width="' + (width - stroke) + '" height="' + (height - stroke) + '" rx="' + radius + '" fill="' + colors.bg + '" stroke="' + colors.line + '" stroke-width="' + stroke + '"/>' +
    '<circle cx="44" cy="44" r="28" fill="' + colors.tile + '"/>' +
    '<g transform="translate(29 29) scale(1.25)" fill="none" stroke="' + colors.icon + '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + icon + '</g>' +
    '<text x="86" y="46" font-family="' + FONT + '" font-size="34" font-weight="800" fill="' + colors.main + '">' + escapeXml(text.main) + '</text>' +
    '<text x="87" y="68" font-family="' + FONT + '" font-size="15" font-weight="600" fill="' + colors.sub + '">' + escapeXml(text.sub) + '</text>' +
    '</svg>'
}

// SVG -> a data: URL an <img> can show and a canvas can draw without being "tainted".
export function dynamicDataUrl(config, live = null, now = new Date()) {
  const svg = dynamicSvg(config, live, now)
  const box = /viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(svg)
  return {
    url: 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg),
    ratio: box ? Number(box[2]) / Number(box[1]) : 1,
  }
}

// WHY a small memory: ten stickers in one room asking for the same city's weather should
// make one request, not ten. Kept for 10 minutes, the same as the server's cache.
const weatherCache = new Map()

// Ask our server for the weather: { city } or { lat, lon }. Throws with a friendly message.
export async function fetchWeather({ city, lat, lon }) {
  const query = city
    ? 'city=' + encodeURIComponent(city)
    : 'lat=' + Number(lat).toFixed(2) + '&lon=' + Number(lon).toFixed(2)
  const cached = weatherCache.get(query)
  if (cached && Date.now() - cached.at < 10 * 60 * 1000) return cached.data

  let response
  try {
    response = await fetch('/api/weather?' + query)
  } catch (error) {
    throw new Error('No internet connection. Check it and try again.')
  }
  let data = null
  try {
    data = await response.json()
  } catch (error) {
    // Not JSON: usually "npm run dev" instead of "vercel dev", so /api does not exist.
  }
  if (!response.ok || !data || data.error) {
    throw new Error((data && data.error) || NO_SERVER('Weather'))
  }
  weatherCache.set(query, { at: Date.now(), data })
  return data
}

// No JSON back almost always means "npm run dev", where the /api functions do not exist.
function NO_SERVER(what) {
  return what + ' needs the server. On your laptop, run "vercel dev" instead of "npm run dev".'
}

// The person's country as 2 letters, guessed without asking. Used so "SMU" finds the
// Singapore one, not the one in Texas.
// WHY the time zone first: it follows where the phone actually is, while the browser
// language is often US English (en-US) even in Singapore.
const ZONE_COUNTRY = {
  'Asia/Singapore': 'sg', 'Asia/Kuala_Lumpur': 'my', 'Asia/Jakarta': 'id', 'Asia/Bangkok': 'th',
  'Asia/Manila': 'ph', 'Asia/Ho_Chi_Minh': 'vn', 'Asia/Hong_Kong': 'hk', 'Asia/Taipei': 'tw',
  'Asia/Tokyo': 'jp', 'Asia/Seoul': 'kr', 'Asia/Shanghai': 'cn', 'Asia/Kolkata': 'in',
  'Australia/Sydney': 'au', 'Europe/London': 'gb',
}
function nearCountry() {
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone || ''
  if (ZONE_COUNTRY[zone]) return ZONE_COUNTRY[zone]
  const languages = (typeof navigator !== 'undefined' && navigator.languages) || []
  for (const tag of languages) {
    const region = /^[a-z]{2,3}-([A-Z]{2})$/.exec(tag)
    if (region) return region[1].toLowerCase()
  }
  return ''
}

// Look up a place by name ({ query: 'SMU' }) or by position ({ lat, lon }).
// Returns { results: [{ names, summary, country, lat, lon }] }, best match first. names goes
// from most specific to widest, e.g. ['SMU', 'Singapore Management University', 'Bras Basah',
// 'Singapore'], and summary tells matches apart ("Jurong East · Singapore").
export async function findPlace({ query, lat, lon }) {
  const near = nearCountry()
  const search = query
    ? 'q=' + encodeURIComponent(query) + (near ? '&near=' + near : '')
    : 'lat=' + Number(lat).toFixed(4) + '&lon=' + Number(lon).toFixed(4)
  let response
  try {
    response = await fetch('/api/place?' + search)
  } catch (error) {
    throw new Error('No internet connection. Check it and try again.')
  }
  let data = null
  try {
    data = await response.json()
  } catch (error) {
    // Not JSON: see NO_SERVER.
  }
  if (!response.ok || !data || data.error || !Array.isArray(data.results)) {
    throw new Error((data && data.error) || NO_SERVER('Finding places'))
  }
  return data
}

// The one function teammates need: config in, picture out. Weather that cannot load
// still draws (with --°C), so a sticker never disappears from a strip.
export async function renderDynamicSticker(config, now = new Date()) {
  let live = null
  if (config.type === 'weather') {
    try {
      live = await fetchWeather({ city: config.city })
    } catch (error) {
      live = null
    }
  }
  return dynamicDataUrl(config, live, now)
}

// How often a page showing this sticker should redraw it (0 = never).
export function refreshEvery(config) {
  if (config.type === 'time') return 30 * 1000
  if (config.type === 'date') return 10 * 60 * 1000
  if (config.type === 'weather') return 10 * 60 * 1000
  return 0
}
