import { updateDoc } from 'firebase/firestore'

// SHARED data for the photostrip pages (StripView.vue = Pick, DecorateView.vue = Decorate):
// the frame layouts and styles, the sticker tray, the filters, and helpers to save the strip.
//
// The strip is saved in the room document (rooms/{code}), so everyone in the room sees the same strip:
//   stripLayoutId : 'retro-4-cut'                                (which cut)
//   stripStyleId  : 'cream'                                      (which frame style)
//   stripSlots    : { 0: 'photoId', 1: null, ... }               (which photo is in which slot)
//   stripEdits    : { 0: { filter, brightness, contrast, saturation }, ... }
//   stripStickers : [ { id, src, x, y, w, rotate, z, visible, by }, ... ]

// ---------- LAYOUTS ("Cut" list on the Pick page) ----------
// PLACEHOLDER (Joash): replace with the templates saved by the Template Editor.
// Each slot's x, y, w, h are PERCENTAGES of the strip (0-100), so the same layout fits any screen size.
// aspect is the strip's width / height (e.g. 3 / 10 = a tall strip).
export const LAYOUTS = [
  {
    id: 'retro-4-cut',
    name: 'Retro 4-cut',
    aspect: 3 / 10,
    slots: [
      { x: 6, y: 3, w: 88, h: 20 },
      { x: 6, y: 25, w: 88, h: 20 },
      { x: 6, y: 47, w: 88, h: 20 },
      { x: 6, y: 69, w: 88, h: 20 }, // leaves space at the bottom for the caption
    ],
  },
  {
    id: 'polaroid-2x2',
    name: 'Polaroid 2x2',
    aspect: 3 / 4,
    slots: [
      { x: 5, y: 5, w: 42.5, h: 38 },
      { x: 52.5, y: 5, w: 42.5, h: 38 },
      { x: 5, y: 46, w: 42.5, h: 38 },
      { x: 52.5, y: 46, w: 42.5, h: 38 },
    ],
  },
  {
    id: 'film-3-cut',
    name: 'Film 3-cut',
    aspect: 3 / 8,
    slots: [
      { x: 8, y: 4, w: 84, h: 26 },
      { x: 8, y: 33, w: 84, h: 26 },
      { x: 8, y: 62, w: 84, h: 26 },
    ],
  },
  {
    id: 'music-4-cut',
    name: 'Music 4-cut',
    aspect: 3 / 10,
    slots: [
      { x: 6, y: 3, w: 42, h: 42 },
      { x: 52, y: 3, w: 42, h: 42 },
      { x: 6, y: 47, w: 42, h: 42 },
      { x: 52, y: 47, w: 42, h: 42 },
    ],
  },
]

// ---------- FRAME STYLES ("Default" and "Mine" on the Pick page) ----------
// PLACEHOLDER (Joash): "default" = built-in styles, "mine" = frames the user saved in the Template Editor.
// shape is the slot shape: 'square', 'rounded' or 'circle'
export const FRAME_STYLES = [
  { id: 'cream', group: 'default', background: '#FFF8EE', border: '#2F5BEA', shape: 'square', caption: 'Exchange reunion · 16.10.26' },
  { id: 'sky', group: 'default', background: '#E8EEFF', border: '#2F5BEA', shape: 'rounded', caption: 'Blue Studios' },
  { id: 'white', group: 'default', background: '#FFFFFF', border: '#1A1A2E', shape: 'square', caption: 'Blue Studios' },
  { id: 'circle', group: 'default', background: '#F1F1F4', border: '#9AA0B4', shape: 'circle', caption: 'Blue Studios' },
  { id: 'night', group: 'default', background: '#1A1A2E', border: '#F2C94C', shape: 'rounded', caption: 'Film night' },
  { id: 'mine-sunny', group: 'mine', background: '#FFE8A3', border: '#E0A100', shape: 'rounded', caption: 'Our day out' },
]

// ---------- STICKER TRAY (Decorate page) ----------
// PLACEHOLDER (Rae): replace with stickers from the Sticker Maker.
//   tab 'mine'    = stickers the user made (remove.bg cut-outs, Gemini captions)
//   tab 'giphy'   = GIPHY search results (a .gif URL works as it is, <img> plays it)
//   tab 'dynamic' = live stickers (OpenWeatherMap weather, the time)
// Each sticker only needs { id, tab, name, src }, where src is an image URL.

// Draws a coloured text badge as an SVG and returns it as an image URL, so we have
// stickers to test with before the Sticker Maker is ready
function makeBadge(text, background, colour) {
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="260" height="70">' +
    '<rect x="2" y="2" width="256" height="66" rx="33" fill="' + background + '"/>' +
    '<text x="130" y="45" font-family="Arial" font-size="24" font-weight="bold" fill="' + colour +
    '" text-anchor="middle">' + text + '</text></svg>'
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg)
}

export const STICKERS = [
  { id: 'm1', tab: 'mine', name: 'main character energy', src: makeBadge('main character energy', '#F0457A', '#FFFFFF') },
  { id: 'm2', tab: 'mine', name: 'four-cut legends', src: makeBadge('four-cut legends', '#FFFFFF', '#1A1A2E') },
  { id: 'm3', tab: 'mine', name: 'besties', src: makeBadge('♥ besties ♥', '#2F5BEA', '#FFFFFF') },
  { id: 'g1', tab: 'giphy', name: 'yay', src: makeBadge('YAY!', '#7B61FF', '#FFFFFF') },                    // Rae: a GIPHY .gif URL
  { id: 'd1', tab: 'dynamic', name: 'Weather', src: makeBadge('☀ 29°C · Singapore', '#FFE8A3', '#7A5200') }, // Rae: live weather
  { id: 'd2', tab: 'dynamic', name: 'Time', src: makeBadge('🕘 9:02 PM', '#E8EEFF', '#2F5BEA') },           // Rae: live time
]

// ---------- FILTERS (Decorate page) ----------
// Each filter is a CSS "filter" value. The same text also works on a canvas (ctx.filter) for the download.
export const FILTERS = [
  { id: 'original', name: 'Original', css: '' },
  { id: 'bw', name: 'B&W', css: 'grayscale(1)' },
  { id: 'vintage', name: 'Vintage', css: 'sepia(0.6) contrast(1.1)' },
  { id: 'warm', name: 'Warm', css: 'sepia(0.3) saturate(1.4) hue-rotate(-10deg)' },
  { id: 'cool', name: 'Cool', css: 'saturate(0.9) hue-rotate(15deg) brightness(1.05)' },
]

// Turns one slot's saved edit into a full CSS filter, e.g.
// { filter: 'bw', brightness: 10 } -> 'grayscale(1) brightness(1.1) contrast(1) saturate(1)'
// The sliders go from -50 to 50, so 1 + value / 100 gives 0.5 to 1.5
export function filterCss(edit) {
  if (!edit) return ''
  const preset = FILTERS.find((f) => f.id === edit.filter)
  const base = preset ? preset.css : ''
  const b = 1 + (edit.brightness || 0) / 100
  const c = 1 + (edit.contrast || 0) / 100
  const s = 1 + (edit.saturation || 0) / 100
  return (base + ' brightness(' + b + ') contrast(' + c + ') saturate(' + s + ')').trim()
}

// ---------- SAVING ----------
// Save ONE field inside a map, e.g. saveField(roomRef(), 'stripSlots.2', 'photoId').
// 'stripSlots.2' means "only the field 2 inside stripSlots", so two people changing
// different slots at the same time do not overwrite each other.
export function saveField(ref, path, value) {
  const changes = {}
  changes[path] = value
  return updateDoc(ref, changes)
}

// Save whole fields, e.g. saveFields(roomRef(), { stripLayoutId: 'film-3-cut', stripSlots: {} })
export function saveFields(ref, fields) {
  return updateDoc(ref, fields)
}
