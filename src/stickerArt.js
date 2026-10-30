// ============================================================
// Blue Studios Photobooth — shared artwork library
// src/stickerArt.js
// ============================================================
// WHY this file exists: the Sticker Maker (Rae), the Template Editor (Joash) and the
// photostrip tray (Germaine) all need the same drawings, shapes, washi tape, emoji and
// fonts. Keeping ONE list here means an item added once shows up on all three pages,
// and nobody has to copy-paste artwork between files ever again.
//
// HOW to use it: import only the slice you need.
//   import { STICKERS, SHAPES, TAPES, EMOJI, FONTS } from '../stickerArt.js'
//
// WHAT is inside: 12 drawings, 4 shapes, 4 washi tapes, 15 emoji, 29 fonts.
// This file imports NOTHING, so it can never drag Firebase or a page's data into
// another page. That is the whole reason it is safe for all three of us to share.
// ============================================================


// ============================================================
// 1. Small helpers — turn SVG text into something a page can use
// ============================================================

// WHY: the drawings below are written with width="100%" so they can stretch inside any
// box. But an <img> needs a real size, otherwise some browsers draw it at 300x150 and
// the sticker looks stretched. This copies the viewBox numbers into width/height.
function withIntrinsicSize(svg) {
  const box = /viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(svg)
  if (!box) return svg
  return svg.replace('width="100%" height="100%"', 'width="' + box[1] + '" height="' + box[2] + '"')
}

// WHY: a layer on the canvas stores its shape as height ÷ width (the same "ratio" a
// photo uses), so the box around the sticker matches the drawing and nothing is squashed.
function viewBoxRatio(svg) {
  const box = /viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(svg)
  return box ? Number(box[2]) / Number(box[1]) : 1
}

// WHY a data URL: an <img> and the export canvas both need a URL, not markup. A data URL
// keeps the drawing inside the page, so the canvas is never "tainted" and PNG/GIF export
// keeps working. encodeURIComponent is enough — base64 would only make it unreadable.
function svgToDataUrl(svg) {
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(withIntrinsicSize(svg))
}


// ============================================================
// 2. The 12 drawings (Joash's SVG_TEMPLATES, unchanged)
// ============================================================
// WHY they stay in this exact shape: Joash's editor reads them by name — sparkleStar,
// ribbonBow, retroCamera and so on. Keeping the same names and the same markup means his
// editor keeps working with zero changes to his components.
const SVG_TEMPLATES = {
  daisy: `<svg width="100%" height="100%" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
    <g>
      <circle cx="50" cy="22" r="14" fill="#F472B6"/>
      <circle cx="50" cy="78" r="14" fill="#F472B6"/>
      <circle cx="22" cy="50" r="14" fill="#F472B6"/>
      <circle cx="78" cy="50" r="14" fill="#F472B6"/>
      <circle cx="30" cy="30" r="14" fill="#F472B6"/>
      <circle cx="70" cy="30" r="14" fill="#F472B6"/>
      <circle cx="30" cy="70" r="14" fill="#F472B6"/>
      <circle cx="70" cy="70" r="14" fill="#F472B6"/>
      <circle cx="50" cy="50" r="18" fill="#FACC15"/>
      <circle cx="45" cy="45" r="4" fill="#FFFF" fill-opacity="0.85"/>
    </g>
  </svg>`,
  sparkleStar: `<svg width="100%" height="100%" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M50 0 C50 35 65 50 100 50 C65 50 50 65 50 100 C50 65 35 50 0 50 C35 50 50 35 50 0 Z" fill="#38BDF8"/>
    <path d="M50 20 C50 40 60 50 80 50 C60 50 50 60 50 80 C50 60 40 50 20 50 C40 50 50 40 50 20 Z" fill="#818CF8"/>
    <circle cx="50" cy="50" r="8" fill="#FFFF"/>
  </svg>`,
  ribbonBow: `<svg width="100%" height="100%" viewBox="0 0 100 80" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M50 40 C35 20 10 15 10 35 C10 55 35 50 50 40 Z" fill="#F472B6"/>
    <path d="M50 40 C65 20 90 15 90 35 C90 55 65 50 50 40 Z" fill="#F472B6"/>
    <path d="M40 42 L25 75 L38 72 L45 52 Z" fill="#DB2777"/>
    <path d="M60 42 L75 75 L62 72 L55 52 Z" fill="#DB2777"/>
    <ellipse cx="50" cy="40" rx="10" ry="12" fill="#BE185D"/>
    <circle cx="48" cy="37" r="3" fill="#FFFF" fill-opacity="0.8"/>
  </svg>`,
  cherries: `<svg width="100%" height="100%" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M35 55 C40 30 55 15 65 10 C62 25 70 40 75 60" stroke="#15803D" stroke-width="5" stroke-linecap="round" fill="none"/>
    <path d="M65 10 C75 12 85 8 90 2 C88 15 78 18 65 10 Z" fill="#22C55E"/>
    <circle cx="32" cy="68" r="20" fill="#E11D48"/>
    <circle cx="75" cy="72" r="20" fill="#E11D48"/>
    <circle cx="26" cy="62" r="5" fill="#FDA4AF"/>
    <circle cx="69" cy="66" r="5" fill="#FDA4AF"/>
  </svg>`,
  smiley: `<svg width="100%" height="100%" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="50" cy="50" r="46" fill="#FDE047" stroke="#0F172A" stroke-width="4"/>
    <ellipse cx="36" cy="42" rx="4" ry="7" fill="#0F172A"/>
    <ellipse cx="64" cy="42" rx="4" ry="7" fill="#0F172A"/>
    <circle cx="30" cy="52" r="5" fill="#F472B6" fill-opacity="0.7"/>
    <circle cx="70" cy="52" r="5" fill="#F472B6" fill-opacity="0.7"/>
    <path d="M35 58 C40 70 60 70 65 58" stroke="#0F172A" stroke-width="4" stroke-linecap="round" fill="none"/>
  </svg>`,
  butterfly: `<svg width="100%" height="100%" viewBox="0 0 100 90" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M50 45 C35 15 10 20 8 45 C6 60 25 70 50 50 Z" fill="#A78BFA"/>
    <path d="M50 45 C65 15 90 20 92 45 C94 60 75 70 50 50 Z" fill="#A78BFA"/>
    <path d="M50 50 C38 55 25 75 35 85 C45 92 50 70 50 50 Z" fill="#F472B6"/>
    <path d="M50 50 C62 55 75 75 65 85 C55 92 50 70 50 50 Z" fill="#F472B6"/>
    <ellipse cx="50" cy="48" rx="4" ry="24" fill="#1E293B"/>
    <path d="M48 26 C45 18 38 15 35 16" stroke="#1E293B" stroke-width="2" stroke-linecap="round" fill="none"/>
    <path d="M52 26 C55 18 62 15 65 16" stroke="#1E293B" stroke-width="2" stroke-linecap="round" fill="none"/>
  </svg>`,
  retroCamera: `<svg width="100%" height="100%" viewBox="0 0 100 80" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="10" y="20" width="80" height="52" rx="10" fill="#334155"/>
    <rect x="10" y="32" width="80" height="28" fill="#F8FAFC"/>
    <rect x="25" y="12" width="22" height="10" rx="3" fill="#64748B"/>
    <circle cx="75" cy="16" r="5" fill="#EF4444"/>
    <circle cx="50" cy="46" r="18" fill="#1E293B"/>
    <circle cx="50" cy="46" r="13" fill="#38BDF8"/>
    <circle cx="46" cy="42" r="4" fill="#FFFF"/>
  </svg>`,
  polaroidFrame: `<svg width="100%" height="100%" viewBox="0 0 100 120" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="5" y="5" width="90" height="110" rx="4" fill="#FFFF" stroke="#CBD5E1" stroke-width="2"/>
    <rect x="12" y="12" width="76" height="76" rx="2" fill="#1E293B"/>
    <circle cx="50" cy="103" r="5" fill="#E2E8F0"/>
  </svg>`,
  sparkleHeart: `<svg width="100%" height="100%" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M50 86 C22 68 8 50 8 30 C8 16 19 6 33 6 C42 6 47 11 50 17 C53 11 58 6 67 6 C81 6 92 16 92 30 C92 50 78 68 50 86 Z" fill="#F43F5E"/>
    <path d="M70 24 L73 33 L82 36 L73 39 L70 48 L67 39 L58 36 L67 33 Z" fill="#FFFF"/>
    <circle cx="30" cy="28" r="4" fill="#FDA4AF"/>
  </svg>`,
  starburst: `<svg width="100%" height="100%" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
    <polygon points="50,4 62,35 96,38 70,62 78,96 50,78 22,96 30,62 4,38 38,35" fill="#FACC15"/>
    <circle cx="50" cy="50" r="14" fill="#F97316"/>
    <circle cx="47" cy="46" r="4" fill="#FFFF"/>
  </svg>`,
  cloudCute: `<svg width="100%" height="100%" viewBox="0 0 100 70" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M25 60 C12 60 2 50 2 38 C2 28 9 20 20 18 C24 8 36 2 48 2 C62 2 73 10 77 22 C88 22 98 30 98 42 C98 52 89 60 78 60 Z" fill="#38BDF8"/>
    <ellipse cx="38" cy="36" rx="3" ry="5" fill="#0F172A"/>
    <ellipse cx="62" cy="36" rx="3" ry="5" fill="#0F172A"/>
    <circle cx="28" cy="42" r="4" fill="#F472B6" fill-opacity="0.8"/>
    <circle cx="72" cy="42" r="4" fill="#F472B6" fill-opacity="0.8"/>
    <path d="M46 44 C48 48 52 48 54 44" stroke="#0F172A" stroke-width="2.5" stroke-linecap="round" fill="none"/>
  </svg>`,
  vinylRecord: `<svg width="100%" height="100%" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="50" cy="50" r="48" fill="#18181B"/>
    <circle cx="50" cy="50" r="38" stroke="#27272A" stroke-width="2" fill="none"/>
    <circle cx="50" cy="50" r="28" stroke="#3F3F46" stroke-width="1.5" fill="none"/>
    <circle cx="50" cy="50" r="18" fill="#F43F5E"/>
    <circle cx="50" cy="50" r="6" fill="#FEFBF6"/>
  </svg>`,
}


// ============================================================
// 3. The 4 "Cute Shapes"
// ============================================================
// WHY they are drawn here: in Joash's file a shape is not a picture — it is a name plus
// two colours ({ shapeType: 'star', color, strokeColor, strokeWidth }) and his editor
// draws it itself. The Sticker Maker only understands pictures, so the same four shapes
// are drawn once, in his exact colours, and then behave like any other sticker.
function shapeSvg(type, color, strokeColor, strokeWidth) {
  const stroke = 'stroke="' + strokeColor + '" stroke-width="' + strokeWidth + '" stroke-linejoin="round"'
  if (type === 'circle') return '<circle cx="50" cy="50" r="46" fill="' + color + '" ' + stroke + '/>'
  if (type === 'diamond') return '<polygon points="50,4 96,50 50,96 4,50" fill="' + color + '" ' + stroke + '/>'
  if (type === 'star') return '<polygon points="50,4 61.2,34.6 93.8,35.8 68.1,55.9 77,87.2 50,69 23,87.2 31.9,55.9 6.2,35.8 38.8,34.6" fill="' + color + '" ' + stroke + '/>'
  // Anything else is the heart, which is the only one left.
  return '<path d="M50 88 C20 68 6 50 6 32 C6 18 17 8 30 8 C39 8 46 13 50 21 C54 13 61 8 70 8 C83 8 94 18 94 32 C94 50 80 68 50 88 Z" fill="' + color + '" ' + stroke + '/>'
}

// WHY: shapeSvg returns the inside of an SVG, not a whole one. This wraps it so it has a
// viewBox like every other drawing, which is what the helpers above expect.
function wrapShape(inner) {
  return '<svg width="100" height="100" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">' + inner + '</svg>'
}


// ============================================================
// 4. The 4 washi tapes
// ============================================================
// WHY this exists: Joash's tape is a recipe, not a picture — a colour plus a stripe
// colour, painted by CSS in his editor. CSS cannot be dropped into an image layer, so
// the recipe is turned into a real SVG here and everyone gets the same tape.

// WHY: his colours are written as rgba(253, 224, 71, 0.85). SVG fill wants a hex colour
// plus a separate opacity, so this splits one into the other.
function rgbaToFill(rgba) {
  const parts = /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)/.exec(rgba)
  if (!parts) return { color: rgba, opacity: 1 }
  const hex = [parts[1], parts[2], parts[3]]
    .map((n) => Number(n).toString(16).padStart(2, '0'))
    .join('')
  return { color: '#' + hex.toUpperCase(), opacity: parts[4] === undefined ? 1 : Number(parts[4]) }
}

function tapeSvg(rgba, patternColor, w, h) {
  const { color, opacity } = rgbaToFill(rgba)
  const zig = Math.round(h / 4) // how deep the torn edge bites into each end

  // WHY a path and not a rectangle: real washi tape has torn ends. The zigzag on the two
  // short sides is what makes it read as tape instead of a coloured bar.
  const d =
    'M' + zig + ' 0' +
    ' L' + (w - zig) + ' 0' +
    ' L' + w + ' ' + zig + ' L' + (w - zig) + ' ' + h / 2 + ' L' + w + ' ' + (h - zig) + ' L' + (w - zig) + ' ' + h +
    ' L' + zig + ' ' + h +
    ' L0 ' + (h - zig) + ' L' + zig + ' ' + h / 2 + ' L0 ' + zig + ' Z'

  // WHY two faint stripes: a flat colour block reads as a highlighter stroke. Two lines
  // across it read as printed tape.
  const stripes =
    '<line x1="' + zig + '" y1="' + h / 3 + '" x2="' + (w - zig) + '" y2="' + h / 3 + '" stroke="' + patternColor + '" stroke-width="1.5" stroke-opacity="0.7"/>' +
    '<line x1="' + zig + '" y1="' + (h * 2) / 3 + '" x2="' + (w - zig) + '" y2="' + (h * 2) / 3 + '" stroke="' + patternColor + '" stroke-width="1.5" stroke-opacity="0.7"/>'

  return '<svg width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + ' ' + h + '" xmlns="http://www.w3.org/2000/svg">' +
    '<path d="' + d + '" fill="' + color + '" fill-opacity="' + opacity + '"/>' + stripes + '</svg>'
}


// ============================================================
// 5. ONE list of everything, tagged by "kind"
// ============================================================
// WHY one list instead of three separate exports: all three pages want the same artwork
// but different slices of it. One list means adding a sticker is one line, and the three
// pages can never fall out of step.
//
// WHY "key": Joash's names are camelCase (sparkleStar) and the ids here are kebab-case
// (sparkle-star). Keeping his name on the entry lets his SVG_TEMPLATES be rebuilt exactly
// from this list, so his editor needs no other change.
const ART_SOURCE = [
  // ---- 12 drawings ----
  { id: 'daisy',          key: 'daisy',         name: 'Daisy Blossom',    kind: 'sticker', tags: ['Y2K', 'Doodles'],          svg: SVG_TEMPLATES.daisy },
  { id: 'sparkle-star',   key: 'sparkleStar',   name: 'Cyber Sparkle',    kind: 'sticker', tags: ['Y2K', 'Doodles'],          svg: SVG_TEMPLATES.sparkleStar },
  { id: 'ribbon-bow',     key: 'ribbonBow',     name: 'Ribbon Bow',       kind: 'sticker', tags: ['Y2K', 'Cute Animals'],     svg: SVG_TEMPLATES.ribbonBow },
  { id: 'cherries',       key: 'cherries',      name: 'Twin Cherries',    kind: 'sticker', tags: ['Y2K', 'Doodles'],          svg: SVG_TEMPLATES.cherries },
  { id: 'smiley',         key: 'smiley',        name: 'Smiley Badge',     kind: 'sticker', tags: ['Y2K', 'Doodles'],          svg: SVG_TEMPLATES.smiley },
  { id: 'butterfly',      key: 'butterfly',     name: 'Pastel Butterfly', kind: 'sticker', tags: ['Cute Animals', 'Y2K'],     svg: SVG_TEMPLATES.butterfly },
  { id: 'retro-camera',   key: 'retroCamera',   name: 'Vintage Camera',   kind: 'sticker', tags: ['Film & Vintage'],          svg: SVG_TEMPLATES.retroCamera },
  { id: 'polaroid-frame', key: 'polaroidFrame', name: 'Mini Frame',       kind: 'sticker', tags: ['Frames'],                  svg: SVG_TEMPLATES.polaroidFrame },
  { id: 'sparkle-heart',  key: 'sparkleHeart',  name: 'Sparkle Heart',    kind: 'sticker', tags: ['Y2K', 'Doodles'],          svg: SVG_TEMPLATES.sparkleHeart },
  { id: 'starburst',      key: 'starburst',     name: 'Y2K Starburst',    kind: 'sticker', tags: ['Y2K', 'Doodles'],          svg: SVG_TEMPLATES.starburst },
  { id: 'cloud-cute',     key: 'cloudCute',     name: 'Fluffy Cloud',     kind: 'sticker', tags: ['Doodles', 'Cute Animals'], svg: SVG_TEMPLATES.cloudCute },
  { id: 'vinyl-record',   key: 'vinylRecord',   name: 'Vinyl Disc',       kind: 'sticker', tags: ['Film & Vintage'],          svg: SVG_TEMPLATES.vinylRecord },

  // ---- 4 shapes ----
  // WHY kind 'shape': same reason as the tape — his file stores a recipe and paints it,
  // so it is drawn once here and shared instead of each page re-implementing the drawing.
  { id: 'shape-star',    key: 'star',    name: 'Golden Star', kind: 'shape', tags: ['Doodles', 'Y2K'],          svg: wrapShape(shapeSvg('star',    '#FACC15', '#0F172A', 2)) },
  { id: 'shape-heart',   key: 'heart',   name: 'Sweetheart',  kind: 'shape', tags: ['Doodles', 'Cute Animals'], svg: wrapShape(shapeSvg('heart',   '#F472B6', '#DB2777', 2)) },
  { id: 'shape-circle',  key: 'circle',  name: 'Color Dot',   kind: 'shape', tags: ['Doodles'],                 svg: wrapShape(shapeSvg('circle',  '#2F5BEA', '#1E40AF', 2)) },
  { id: 'shape-diamond', key: 'diamond', name: 'Gem Diamond', kind: 'shape', tags: ['Doodles', 'Y2K'],          svg: wrapShape(shapeSvg('diamond', '#38BDF8', '#0284C7', 2)) },

  // ---- 4 washi tapes ----
  { id: 'tape-yellow', key: 'tapeYellow', name: 'Yellow Tape', kind: 'tape', tags: ['Washi & Pins'], svg: tapeSvg('rgba(253, 224, 71, 0.85)', '#FFFF', 90, 20) },
  { id: 'tape-pink',   key: 'tapePink',   name: 'Pink Tape',   kind: 'tape', tags: ['Washi & Pins'], svg: tapeSvg('rgba(244, 114, 182, 0.85)', '#FFFF', 90, 20) },
  { id: 'tape-sky',    key: 'tapeSky',    name: 'Sky Tape',    kind: 'tape', tags: ['Washi & Pins'], svg: tapeSvg('rgba(96, 165, 250, 0.85)', '#FFFF', 90, 20) },
  { id: 'tape-mint',   key: 'tapeMint',   name: 'Mint Tape',   kind: 'tape', tags: ['Washi & Pins'], svg: tapeSvg('rgba(52, 211, 153, 0.85)', '#FFFF', 90, 20) },

  // ---- 15 emoji ----
  // WHY kind 'emoji': an emoji is a character, not a picture, so there is no SVG to store.
  // "content" is the character itself. The Sticker Maker adds it as a TEXT layer and
  // Joash's editor already draws it as text — one list, two ways of showing it.
  { id: 'emoji-pin',      key: 'pushPin',      name: 'Push Pin',       kind: 'emoji', tags: ['Washi & Pins'],   content: '📌' },
  { id: 'emoji-clip',     key: 'paperclip',    name: 'Paperclip',      kind: 'emoji', tags: ['Washi & Pins'],   content: '📎' },
  { id: 'emoji-sparkles', key: 'sparkles',     name: 'Sparkles',       kind: 'emoji', tags: ['Doodles', 'Y2K'], content: '✨' },
  { id: 'emoji-star',     key: 'starEmoji',    name: 'Star',           kind: 'emoji', tags: ['Doodles', 'Y2K'], content: '⭐' },
  { id: 'emoji-heart',    key: 'heartEmoji',   name: 'Heart',          kind: 'emoji', tags: ['Doodles', 'Cute Animals'], content: '💖' },
  { id: 'emoji-ribbon',   key: 'ribbonEmoji',  name: 'Ribbon',         kind: 'emoji', tags: ['Cute Animals', 'Y2K'], content: '🎀' },
  { id: 'emoji-camera',   key: 'cameraEmoji',  name: 'Camera',         kind: 'emoji', tags: ['Film & Vintage'], content: '📷' },
  { id: 'emoji-film',     key: 'filmEmoji',    name: 'Film Strip',     kind: 'emoji', tags: ['Film & Vintage'], content: '🎞️' },
  { id: 'emoji-blossom',  key: 'blossomEmoji', name: 'Cherry Blossom', kind: 'emoji', tags: ['Doodles'],        content: '🌸' },
  { id: 'emoji-shades',   key: 'shadesEmoji',  name: 'Y2K Shades',     kind: 'emoji', tags: ['Y2K'],            content: '🕶️' },
  { id: 'emoji-bolt',     key: 'boltEmoji',    name: 'Lightning',      kind: 'emoji', tags: ['Y2K', 'Doodles'], content: '⚡' },
  { id: 'emoji-bunny',    key: 'bunnyEmoji',   name: 'Cute Bunny',     kind: 'emoji', tags: ['Cute Animals'],   content: '🐰' },
  { id: 'emoji-kitty',    key: 'kittyEmoji',   name: 'White Kitty',    kind: 'emoji', tags: ['Cute Animals'],   content: '🐱' },
  { id: 'emoji-teddy',    key: 'teddyEmoji',   name: 'Teddy Bear',     kind: 'emoji', tags: ['Cute Animals'],   content: '🧸' },
  { id: 'emoji-peace',    key: 'peaceEmoji',   name: 'Peace Sign',     kind: 'emoji', tags: ['Y2K'],            content: '✌️' },
]

// WHY the guard: emoji have no svg, so they get no url and no ratio. Without this check
// the first emoji would throw and the whole sticker picker would render empty.
export const ART = ART_SOURCE.map((item) =>
  item.svg
    ? { ...item, ratio: viewBoxRatio(item.svg), url: svgToDataUrl(item.svg) }
    : item
)

// WHY these slices: each page filters by kind, so nobody has to know what the others
// need. Adding a 'frame' kind later gives Germaine her frames without touching this file.
export const STICKERS = ART.filter((item) => item.kind === 'sticker')
export const SHAPES   = ART.filter((item) => item.kind === 'shape')
export const TAPES    = ART.filter((item) => item.kind === 'tape')
export const EMOJI    = ART.filter((item) => item.kind === 'emoji')

// WHY: lets Joash rebuild his SVG_TEMPLATES in one line, and lets any page look up a
// single item by its original name without looping.
export const ART_BY_KEY = Object.fromEntries(ART.map((item) => [item.key, item]))


// ============================================================
// 6. The 29 fonts (Joash's list, unchanged)
// ============================================================
// WHY: so the Sticker Maker offers exactly the fonts the Template Editor offers.
// "label" is what the picker shows, "family" is the CSS both the preview and the export
// canvas use, and "preview" is the sample word shown next to each font.
const FONT_GROUPS = [
  {
    group: 'Handwritten / Cursive',
    fonts: [
      { label: 'Caveat (Doodle Signature)', family: "'Caveat', cursive", preview: 'Blue Studios' },
      { label: 'Indie Flower (Cute Casual)', family: "'Indie Flower', cursive", preview: 'Smile & Pose' },
      { label: 'Pacifico (Retro Brush)', family: "'Pacifico', cursive", preview: 'Blue Studios' },
      { label: 'Permanent Marker (Street Tag)', family: "'Permanent Marker', cursive", preview: 'MEMORIES' },
      { label: 'Shadows Into Light (Delicate)', family: "'Shadows Into Light', cursive", preview: 'Happy Day' },
      { label: 'Satisfy (Smooth Flow)', family: "'Satisfy', cursive", preview: 'Special Moment' },
      { label: 'Kalam (Marker Sketch)', family: "'Kalam', cursive", preview: 'Good Vibes' },
      { label: 'Patrick Hand (School Desk)', family: "'Patrick Hand', cursive", preview: 'Besties 2026' },
      { label: 'Gochi Hand (Fun Scribble)', family: "'Gochi Hand', cursive", preview: 'Sweet Love' },
      { label: 'Reenie Beanie (Quick Jot)', family: "'Reenie Beanie', cursive", preview: 'xoxo' },
    ],
  },
  {
    group: 'Y2K & Chunky Display',
    fonts: [
      { label: 'Righteous (Y2K Club Title)', family: "'Righteous', cursive", preview: 'CYBER 2000' },
      { label: 'Fredoka (Bubble Pop)', family: "'Fredoka', sans-serif", preview: 'BUBBLE POP' },
      { label: 'Bungee (Bold Street Sign)', family: "'Bungee', cursive", preview: 'PHOTOBOOTH' },
      { label: 'Comfortaa (Rounded Modern)', family: "'Comfortaa', cursive", preview: 'Aesthetic' },
      { label: 'Shrikhand (Curvy Vintage)', family: "'Shrikhand', cursive", preview: 'Vintage Club' },
      { label: 'Titan One (Heavy Cartoon)', family: "'Titan One', cursive", preview: 'CHUNKY' },
      { label: 'Carter One (Retro Stamp)', family: "'Carter One', cursive", preview: 'ORIGINAL' },
      { label: 'Modak (Puffy Cloud)', family: "'Modak', cursive", preview: 'SOFT' },
    ],
  },
  {
    group: 'Editorial Serif & Vintage',
    fonts: [
      { label: 'Playfair Display (Luxury Serif)', family: "'Playfair Display', serif", preview: 'CLASSIC REUNION' },
      { label: 'Cinzel (Classical Engraved)', family: "'Cinzel', serif", preview: 'ARCHIVE VOL. I' },
      { label: 'Abril Fatface (High-Fashion Title)', family: "'Abril Fatface', cursive", preview: 'Vogue Cut' },
      { label: 'Cormorant Garamond (Graceful)', family: "'Cormorant Garamond', serif", preview: 'Cherished' },
      { label: 'DM Serif Display (Sharp Editorial)', family: "'DM Serif Display', serif", preview: 'STUDIO 2026' },
    ],
  },
  {
    group: 'Modern Sans & Monospace',
    fonts: [
      { label: 'Space Mono (Korean Timestamp)', family: "'Space Mono', monospace", preview: '29.10.26' },
      { label: 'Inter (Clean Swiss Sans)', family: "'Inter', sans-serif", preview: 'Blue Studios' },
      { label: 'Plus Jakarta Sans (Crisp Modern)', family: "'Plus Jakarta Sans', sans-serif", preview: 'Photo Booth' },
      { label: 'Montserrat (Geometric Caps)', family: "'Montserrat', sans-serif", preview: 'GOOD TIMES' },
      { label: 'Oswald (Tall Condensed Poster)', family: "'Oswald', sans-serif", preview: 'FOUR CUT' },
      { label: 'Bebas Neue (Heavy Condensed)', family: "'Bebas Neue', sans-serif", preview: 'MEMORIES' },
    ],
  },
]

// WHY the split: "name" is taken from the label's first word, so 'Caveat (Doodle
// Signature)' becomes 'Caveat' — short enough to store on a layer and to show in a list.
// "label" stays for the picker, "stack" is the CSS to draw it.
export const FONT_GROUPS_READY = FONT_GROUPS.map((group) => ({
  group: group.group,
  fonts: group.fonts.map((font) => ({
    name: font.label.split(' (')[0],
    label: font.label,
    stack: font.family,
    preview: font.preview,
  })),
}))

// WHY a flat list too: most code just wants to loop over every font (to build the
// dropdown, or to check a font has loaded before exporting).
export const FONTS = FONT_GROUPS_READY.flatMap((group) => group.fonts)

// WHY: index.html only loads about a dozen of these fonts. Without the rest, Shrikhand,
// Modak, Titan One and friends quietly fall back to a plain font on screen AND in the
// exported PNG. The URL is built from the list above, so adding a font here is enough
// to load it — nobody has to remember to edit index.html as well.
export const FONT_STYLESHEET_URL =
  'https://fonts.googleapis.com/css2?' +
  FONTS.map((font) => 'family=' + encodeURIComponent(font.name).replace(/%20/g, '+')).join('&') +
  '&display=swap'

// WHY: call this once from any page that shows these fonts. It adds the stylesheet only
// the first time, so the Sticker Maker, Template Editor and tray can all call it safely.
// It touches the page, not other files, so this file still imports nothing.
export function loadArtFonts() {
  if (typeof document === 'undefined') return
  if (document.getElementById('art-fonts')) return
  const link = document.createElement('link')
  link.id = 'art-fonts'
  link.rel = 'stylesheet'
  link.href = FONT_STYLESHEET_URL
  document.head.appendChild(link)
}