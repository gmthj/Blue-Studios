import { ELEMENT_CATEGORIES } from './constants/templateEditorData.js'
import { listMyItems, getFileUrl } from './studio.js'
import { listMySaved } from './marketplace.js'

// The stickers for the Decorate page's sticker tray, in 3 tabs. Each tray item is { id, tab, name, src, saved }.
//   'default' - the stickers from Joash's Template Editor (constants/templateEditorData.js), for everyone
//   'mine'    - still stickers this account made in Rae's Sticker Maker or saved from the marketplace
//   'giphy'   - GIF (animated) stickers this account made in the Sticker Maker or saved from the marketplace

const TRAY_SIZE = 160 // pixels: plenty for a strip, and small, because a placed sticker's picture is saved in the room

// ---------- DEFAULT (Joash's Template Editor stickers) ----------

// Draw something on a square canvas and return it as a PNG picture (a data: URL).
// The room only stores PNG/JPEG/GIF pictures, so the editor's SVG drawings and emojis are turned into PNGs here.
function canvasPng(draw) {
  const canvas = document.createElement('canvas')
  canvas.width = TRAY_SIZE
  canvas.height = TRAY_SIZE
  draw(canvas.getContext('2d'))
  return canvas.toDataURL('image/png')
}

// An emoji as a PNG, the same on every device
function emojiPng(emoji) {
  return canvasPng((ctx) => {
    ctx.font = Math.round(TRAY_SIZE * 0.74) + 'px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(emoji, TRAY_SIZE / 2, TRAY_SIZE * 0.55)
  })
}

// One of the editor's SVG drawings as a PNG, keeping its shape (fitted inside the square)
function svgPng(svgRaw, width, height) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => {
      resolve(canvasPng((ctx) => {
        const scale = Math.min(TRAY_SIZE / width, TRAY_SIZE / height) * 0.92 // a little space around it
        const w = width * scale
        const h = height * scale
        ctx.drawImage(img, (TRAY_SIZE - w) / 2, (TRAY_SIZE - h) / 2, w, h)
      }))
    }
    img.onerror = reject
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgRaw)
  })
}

// Every sticker in the Template Editor's element list (SVG drawings and emojis).
// Shapes and washi tapes are drawn by the editor itself, so they are not in the tray.
// Made once, then kept, because drawing them takes a moment.
let defaultCache = null

export async function loadDefaultStickers() {
  if (defaultCache) return defaultCache
  const items = []
  for (const category of ELEMENT_CATEGORIES) {
    for (const element of category.items) {
      if (element.type !== 'sticker') continue
      try {
        const src = element.isSvg ? await svgPng(element.svgRaw, element.width || 44, element.height || 44) : emojiPng(element.content)
        items.push({ id: 'default-' + items.length, tab: 'default', name: element.name, src: src })
      } catch (err) {
        console.warn('Could not draw the sticker "' + element.name + '":', err)
      }
    }
  }
  defaultCache = items
  return items
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
