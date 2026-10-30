// ============================================================
// Blue Studios Photobooth — live ("dynamic") stickers
// src/dynamicStickers.js
// ============================================================
// WHY this file exists: a live sticker (time, date, weather, location) is drawn from a few
// settings (its config) at the moment it is needed, so a time sticker shows the time when
// the strip is decorated. The Decorate tray's Live tab (LiveStickerPicker.vue) uses it, and
// any other page can draw the same stickers with it.
//
// HOW to use it (any page):
//   import { renderDynamicSticker } from '../dynamicStickers.js'
//   const { url, ratio } = await renderDynamicSticker(config)
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

// The looks. The first three are badges (a shape with an icon). The rest are just words on a
// see-through background, so they sit on a photo like handwriting or a date stamp.
export const DYNAMIC_STYLES = [
  { id: 'pill', label: 'Clean' },
  { id: 'bold', label: 'Bold' },
  { id: 'retro', label: 'Retro' },
  { id: 'typewriter', label: 'Typewriter', text: true },
  { id: 'stamp', label: 'Film date', text: true },
  { id: 'cartoon', label: 'Cartoon', text: true },
  { id: 'cute', label: 'Cute', text: true },
]

export function isTextStyle(style) {
  return DYNAMIC_STYLES.some((item) => item.id === style && item.text)
}

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

// ---------- Text looks (typewriter, film date, cartoon, cute) ----------
// WHY a canvas and not SVG: these need real fonts, and an SVG shown as a picture cannot load
// web fonts. A canvas can, once the font has loaded, so they are drawn there as a PNG with a
// see-through background.

const LIVE_FONTS_URL = 'https://fonts.googleapis.com/css2?family=Special+Elite&family=Space+Mono:wght@700&family=Fredoka:wght@700&family=Gochi+Hand&display=swap'
let liveFontsLoading = null

// Add the fonts to the page once, and wait (at most 3 seconds) for the stylesheet to arrive.
export function loadLiveFonts() {
  if (liveFontsLoading) return liveFontsLoading
  liveFontsLoading = new Promise((resolve) => {
    if (typeof document === 'undefined') return resolve()
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = LIVE_FONTS_URL
    link.onload = resolve
    link.onerror = resolve // no fonts: the fallbacks below still draw
    document.head.appendChild(link)
    setTimeout(resolve, 3000)
  })
  return liveFontsLoading
}

// Each look: the font, sizes in pixels, and how each line is painted.
//   fill: the letters' colour; outline: a border round each letter; glow / drop: a soft or hard shadow.
const TEXT_LOOKS = {
  typewriter: {
    font: "'Special Elite', 'Courier New', monospace", weight: 400, mainSize: 64, subSize: 26, pad: 12,
    main: { fill: '#2B2622' }, sub: { fill: '#5C544D' },
  },
  // The orange date printed in the corner of a film photo
  stamp: {
    font: "'Space Mono', 'Courier New', monospace", weight: 700, mainSize: 58, subSize: 0, pad: 18,
    main: { fill: '#FF8A1F', glow: 'rgba(255, 120, 20, 0.75)' },
  },
  cartoon: {
    font: "'Fredoka', 'Arial Rounded MT Bold', sans-serif", weight: 700, mainSize: 66, subSize: 32, pad: 16,
    main: { fill: '#FFD43B', outline: '#14172B', outlineWidth: 9, drop: '#14172B' },
    sub: { fill: '#FFFFFF', outline: '#14172B', outlineWidth: 5 }, // thinner, or small letters fill in
  },
  cute: {
    font: "'Gochi Hand', 'Comic Sans MS', cursive", weight: 400, mainSize: 66, subSize: 30, pad: 12,
    main: { fill: '#E8628B' }, sub: { fill: '#8B7FD1' },
  },
}

// The words for a text look. They have no icon, so the second line says more: a time also
// shows the date, like a note on a photo.
function textLookWords(config, live, now) {
  const text = dynamicText(config, live, now)
  const style = config.style
  if (style === 'stamp') {
    // A real date stamp: one line, and the date as '26 10 30
    if (config.type === 'date') {
      const year = formatParts(now, { year: '2-digit' }, config.timeZone)
      const month = formatParts(now, { month: '2-digit' }, config.timeZone)
      const day = formatParts(now, { day: '2-digit' }, config.timeZone)
      return { main: "'" + year + ' ' + month + ' ' + day, sub: '' }
    }
    if (config.type === 'location') return { main: String(config.city).toUpperCase(), sub: '' }
    return { main: text.main, sub: '' }
  }
  let sub = text.sub
  if (config.type === 'time') sub = formatParts(now, { weekday: 'short', day: 'numeric', month: 'short' }, config.timeZone)
  if (config.type === 'location' && !config.country) sub = ''
  if (style === 'typewriter') sub = sub.toLowerCase()
  const main = style === 'cute' ? text.main + ' ♡' : text.main
  return { main, sub }
}

function paintLine(ctx, words, x, y, paint) {
  if (paint.drop) {
    // A hard shadow down and to the right, drawn first, like a cartoon caption
    ctx.lineWidth = paint.outlineWidth
    ctx.strokeStyle = paint.drop
    ctx.strokeText(words, x + 4, y + 5)
    ctx.fillStyle = paint.drop
    ctx.fillText(words, x + 4, y + 5)
  }
  if (paint.outline) {
    ctx.lineWidth = paint.outlineWidth
    ctx.strokeStyle = paint.outline
    ctx.strokeText(words, x, y)
  }
  if (paint.glow) {
    ctx.shadowColor = paint.glow
    ctx.shadowBlur = 12
  }
  ctx.fillStyle = paint.fill
  ctx.fillText(words, x, y)
  ctx.shadowColor = 'transparent'
  ctx.shadowBlur = 0
}

// A text look as a PNG with a see-through background: { url, ratio }.
export async function drawTextSticker(config, live = null, now = new Date()) {
  const look = TEXT_LOOKS[config.style] || TEXT_LOOKS.typewriter
  await loadLiveFonts()
  const mainFont = look.weight + ' ' + look.mainSize + 'px ' + look.font
  const subFont = look.weight + ' ' + look.subSize + 'px ' + look.font
  if (typeof document !== 'undefined' && document.fonts) {
    // Ask for the exact font so the canvas does not draw with a stand-in
    await Promise.race([
      Promise.all([document.fonts.load(mainFont), look.subSize ? document.fonts.load(subFont) : null]),
      new Promise((resolve) => setTimeout(resolve, 3000)),
    ]).catch(() => {})
  }

  const words = textLookWords(config, live, now)
  const showSub = Boolean(words.sub && look.subSize)
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  ctx.font = mainFont
  const mainWidth = ctx.measureText(words.main).width
  ctx.font = subFont
  const subWidth = showSub ? ctx.measureText(words.sub).width : 0
  const room = look.pad + (look.main.outlineWidth || 0) + (look.main.drop ? 6 : 0) // space for outlines and shadows
  canvas.width = Math.ceil(Math.max(mainWidth, subWidth) + room * 2)
  canvas.height = Math.ceil(look.mainSize * 1.2 + (showSub ? look.subSize * 1.35 : 0) + room * 2)

  ctx.textAlign = 'center'
  ctx.textBaseline = 'alphabetic'
  ctx.lineJoin = 'round'
  const x = canvas.width / 2
  const mainY = room + look.mainSize * 0.95
  ctx.font = mainFont
  paintLine(ctx, words.main, x, mainY, look.main)
  if (showSub) {
    ctx.font = subFont
    paintLine(ctx, words.sub, x, mainY + look.subSize * 1.4, look.sub)
  }
  return { url: canvas.toDataURL('image/png'), ratio: canvas.height / canvas.width }
}

// Any look, as a picture: { url, ratio }. Badges come back as SVG straight away; text looks
// are drawn on a canvas, which can take a moment while their font loads.
export async function liveStickerImage(config, live = null, now = new Date()) {
  return isTextStyle(config.style) ? drawTextSticker(config, live, now) : dynamicDataUrl(config, live, now)
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
// Returns { results: [{ names, summary, country, lat, lon }], nearby }, best match first. names
// goes from most specific to widest, e.g. ['SMU', 'Singapore Management University', 'Bras Basah',
// 'Singapore'], and summary tells matches apart ("Jurong East · Singapore").
// A position also gets nearby: landmarks within 1 km, closest first, e.g.
// { name: 'National Museum of Singapore', kind: 'Museum', distance: 154 } (metres).
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
  return liveStickerImage(config, live, now)
}

// How often a page showing this sticker should redraw it (0 = never).
export function refreshEvery(config) {
  if (config.type === 'time') return 30 * 1000
  if (config.type === 'date') return 10 * 60 * 1000
  if (config.type === 'weather') return 10 * 60 * 1000
  return 0
}
