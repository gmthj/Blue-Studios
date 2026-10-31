import { STICKERS, SHAPES, TAPES, EMOJI, FONTS, loadArtFonts } from './stickerArt.js'
import { dynamicDataUrl, isTextStyle, drawTextSticker } from './dynamicStickers.js'
import { listMyItems, getFileUrl } from './studio.js'
import { listMySaved } from './marketplace.js'

// The stickers for the Decorate page's sticker tray, in 3 tabs. Each tray item is
// { id, tab, section, name, src, saved }.
//   'default' - the same stickers as Rae's Sticker Maker (stickerArt.js), for everyone
//   'live'    - time, date, weather, location: chosen in LiveStickerPicker.vue, drawn by liveStickerPng
//   'mine'    - still stickers this account made in the Sticker Maker or saved from the marketplace
//   'giphy'   - GIF (animated) stickers this account made or saved (shown under Mine, "My GIFs")

const TRAY_SIZE = 160 // pixels on the longest side: plenty for a strip, and small, because a placed sticker's picture is saved in the room

// ---------- DEFAULT (the shared library, stickerArt.js) ----------

// Draw something on a canvas and return it as a PNG picture (a data: URL).
// The room only stores PNG/JPEG/GIF pictures, so the library's SVG drawings and emojis are turned into PNGs here.
function canvasPng(width, height, draw) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  draw(canvas.getContext('2d'))
  return canvas.toDataURL('image/png')
}

// An emoji as a PNG, the same on every device
function emojiPng(emoji) {
  return canvasPng(TRAY_SIZE, TRAY_SIZE, (ctx) => {
    ctx.font = Math.round(TRAY_SIZE * 0.74) + 'px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(emoji, TRAY_SIZE / 2, TRAY_SIZE * 0.55)
  })
}

// An SVG picture (a data: URL) as a PNG of its own shape, longest side `longest` pixels.
// WHY its own shape and not a square: a washi tape is long and thin, and in a square its
// selection box on the strip would be far bigger than the tape.
function svgPng(url, ratio, longest = TRAY_SIZE) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = async () => {
      if (img.decode) await img.decode().catch(() => {}) // Safari can draw an SVG blank before this
      const width = ratio <= 1 ? longest : Math.round(longest / ratio)
      const height = ratio <= 1 ? Math.round(longest * ratio) : longest
      resolve(canvasPng(width, height, (ctx) => ctx.drawImage(img, 0, 0, width, height)))
    }
    img.onerror = reject
    img.src = url
  })
}

// The tray's Default tab: every sticker, shape, washi tape and emoji in the library, in the
// same sections as the Sticker Maker. Made once, then kept, because drawing them takes a moment.
export const DEFAULT_SECTIONS = [
  { id: 'stickers', title: 'Stickers', items: STICKERS },
  { id: 'shapes', title: 'Cute shapes', items: SHAPES },
  { id: 'tapes', title: 'Washi tape', items: TAPES },
  { id: 'emoji', title: 'Emoji', items: EMOJI },
]
let defaultCache = null

export async function loadDefaultStickers() {
  if (defaultCache) return defaultCache
  const items = []
  for (const section of DEFAULT_SECTIONS) {
    for (const art of section.items) {
      try {
        const src = art.kind === 'emoji' ? emojiPng(art.content) : await svgPng(art.url, art.ratio)
        items.push({ id: 'default-' + art.id, tab: 'default', section: section.id, name: art.name, src: src })
      } catch (err) {
        console.warn('Could not draw the sticker "' + art.name + '":', err)
      }
    }
  }
  defaultCache = items
  return items
}

// ---------- TEXT (the Text tab) ----------
// Words as a picture with a see-through background, in one of the Sticker Maker's fonts.
// text: { words, font, color, bold, italic }. The settings are kept on the placed sticker too,
// so the words can be changed later by double-tapping it on the strip.
// WHY a picture: everything on the strip is a picture, so the export and every teammate's
// page draw text stickers with no extra code.
const TEXT_SIZE = 64 // pixels: sharp enough on a strip, small enough to keep the room light

export async function textStickerPng(text) {
  const family = (FONTS.find((f) => f.name === text.font) || FONTS[0]).stack
  const font = (text.italic ? 'italic ' : '') + (text.bold ? 700 : 400) + ' ' + TEXT_SIZE + 'px ' + family
  loadArtFonts()
  if (document.fonts) {
    // Ask for the exact font, so the picture is not drawn with a stand-in (at most 3 seconds)
    await Promise.race([document.fonts.load(font, text.words), new Promise((resolve) => setTimeout(resolve, 3000))]).catch(() => {})
  }
  const lines = String(text.words || '').split('\n')
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  ctx.font = font
  const pad = 10
  const lineHeight = TEXT_SIZE * 1.25
  const width = Math.max(...lines.map((line) => ctx.measureText(line).width), TEXT_SIZE)
  canvas.width = Math.ceil(width + pad * 2)
  canvas.height = Math.ceil(lines.length * lineHeight + pad * 2)
  ctx.font = font // setting the size clears the canvas settings, so set the font again
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = text.color || '#14172B'
  lines.forEach((line, i) => ctx.fillText(line, canvas.width / 2, pad + lineHeight * (i + 0.5)))
  return canvas.toDataURL('image/png')
}

// ---------- LIVE (time, date, weather, location) ----------
// A live sticker placed on a strip is a picture of that moment: the time when it was added,
// the weather then. WHY bigger than the others: it is mostly words, which blur when small.
export async function liveStickerPng(config, live) {
  // The text looks (typewriter, film date...) are already drawn as a PNG, in their own font
  if (isTextStyle(config.style)) return (await drawTextSticker(config, live)).url
  const { url, ratio } = dynamicDataUrl(config, live)
  return svgPng(url, ratio, TRAY_SIZE * 2)
}

// ---------- MY STICKERS and MY GIPHY (Rae's Sticker Maker) ----------
// This account's own stickers + the ones saved from the marketplace. Guests have none, so they get [].
// A GIF ('animated') goes in My GIPHY; still pictures ('static', 'dynamic') go in My stickers.
// isAccount comes from the page (useAuth), so this file does not need to know about logging in.
export async function loadMyStickers(isAccount) {
  if (!isAccount) return []

  const results = await Promise.all([listMyItems('stickers'), listMySaved()])
  const mine = results[0]
  const saved = results[1]
    .filter((entry) => entry.type === 'stickers' && entry.item) // null = no longer available (private or removed)
    .map((entry) => ({ ...entry.item, saved: true }))

  // A sticker I made AND saved only shows once
  const seen = new Set()
  const all = mine.concat(saved).filter((sticker) => {
    if (seen.has(sticker.id)) return false
    seen.add(sticker.id)
    return true
  })

  const items = await Promise.all(all.map(async (sticker) => {
    try {
      return {
        id: sticker.id,
        tab: sticker.kind === 'animated' ? 'giphy' : 'mine',
        name: sticker.name,
        src: await getFileUrl(sticker.imagePath),
        saved: !!sticker.saved, // made by someone else (shown with a ★)
      }
    } catch {
      return null // skip a sticker whose file cannot be read
    }
  }))
  return items.filter(Boolean)
}
