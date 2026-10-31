import { LAYOUTS } from '../stripData.js'
export { LAYOUTS }

/**
 * Blue Studios Photobooth - Template Editor Data & Presets
 *
 * This module contains all static design data, typography presets,
 * SVG vector templates, curated textures, and starter layout presets.
 */

// =============================================================================
// 1. SVG Vector Templates for Dynamic Recoloring
// =============================================================================
export const SVG_TEMPLATES = {
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
      <circle cx="45" cy="45" r="4" fill="#FFFFFF" fill-opacity="0.85"/>
    </g>
  </svg>`,
  sparkleStar: `<svg width="100%" height="100%" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M50 0 C50 35 65 50 100 50 C65 50 50 65 50 100 C50 65 35 50 0 50 C35 50 50 35 50 0 Z" fill="#38BDF8"/>
    <path d="M50 20 C50 40 60 50 80 50 C60 50 50 60 50 80 C50 60 40 50 20 50 C40 50 50 40 50 20 Z" fill="#818CF8"/>
    <circle cx="50" cy="50" r="8" fill="#FFFFFF"/>
  </svg>`,
  ribbonBow: `<svg width="100%" height="100%" viewBox="0 0 100 80" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M50 40 C35 20 10 15 10 35 C10 55 35 50 50 40 Z" fill="#F472B6"/>
    <path d="M50 40 C65 20 90 15 90 35 C90 55 65 50 50 40 Z" fill="#F472B6"/>
    <path d="M40 42 L25 75 L38 72 L45 52 Z" fill="#DB2777"/>
    <path d="M60 42 L75 75 L62 72 L55 52 Z" fill="#DB2777"/>
    <ellipse cx="50" cy="40" rx="10" ry="12" fill="#BE185D"/>
    <circle cx="48" cy="37" r="3" fill="#FFFFFF" fill-opacity="0.8"/>
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
    <circle cx="46" cy="42" r="4" fill="#FFFFFF"/>
  </svg>`,
  polaroidFrame: `<svg width="100%" height="100%" viewBox="0 0 100 120" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="5" y="5" width="90" height="110" rx="4" fill="#FFFFFF" stroke="#CBD5E1" stroke-width="2"/>
    <rect x="12" y="12" width="76" height="76" rx="2" fill="#1E293B"/>
    <circle cx="50" cy="103" r="5" fill="#E2E8F0"/>
  </svg>`,
  sparkleHeart: `<svg width="100%" height="100%" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M50 86 C22 68 8 50 8 30 C8 16 19 6 33 6 C42 6 47 11 50 17 C53 11 58 6 67 6 C81 6 92 16 92 30 C92 50 78 68 50 86 Z" fill="#F43F5E"/>
    <path d="M70 24 L73 33 L82 36 L73 39 L70 48 L67 39 L58 36 L67 33 Z" fill="#FFFFFF"/>
    <circle cx="30" cy="28" r="4" fill="#FDA4AF"/>
  </svg>`,
  starburst: `<svg width="100%" height="100%" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
    <polygon points="50,4 62,35 96,38 70,62 78,96 50,78 22,96 30,62 4,38 38,35" fill="#FACC15"/>
    <circle cx="50" cy="50" r="14" fill="#F97316"/>
    <circle cx="47" cy="46" r="4" fill="#FFFFFF"/>
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
  </svg>`
}

// =============================================================================
// 2. Curated Starter Layout Presets
// =============================================================================
export const TEMPLATE_PRESETS = [
  {
    id: 'retro-4cut',
    name: 'Retro 4-Cut Classic',
    tag: 'Classic',
    layout: 'retro-4-cut',
    aspect: 3 / 10,
    slots: 4,
    bgType: 'color',
    bg: '#FEFBF6',
    texture: 'kraft',
    border: '#E2E8F0',
    borderWidth: 2,
    shape: 'Rounded',
    caption: 'EXCHANGE REUNION · 1998',
    captionColor: '#475569',
    previewIcon: '📷',
    elements: [
      { type: 'sticker', isSvg: true, svgRaw: SVG_TEMPLATES.retroCamera, name: 'Vintage Camera', width: 24, height: 20, x: 10, y: 885, rotation: -4 },
      { type: 'sticker', isSvg: true, svgRaw: SVG_TEMPLATES.sparkleStar, name: 'Cyber Sparkle', width: 20, height: 20, x: 248, y: 885, rotation: 8 }
    ]
  },
  {
    id: 'haru-cloud',
    name: 'Haru Soft Cloud',
    tag: 'Pastel',
    layout: 'retro-4-cut',
    aspect: 3 / 10,
    slots: 4,
    bgType: 'gradient',
    bg: 'linear-gradient(180deg, #E0F2FE 0%, #BAE6FD 50%, #F0F9FF 100%)',
    gradient: 'linear-gradient(180deg, #E0F2FE 0%, #BAE6FD 50%, #F0F9FF 100%)',
    texture: null,
    border: '#BAE6FD',
    borderWidth: 2,
    shape: 'Rounded',
    caption: '하루필름 · HARU FILM ✨',
    captionColor: '#0284C7',
    previewIcon: '☁️',
    elements: [
      { type: 'sticker', isSvg: true, svgRaw: SVG_TEMPLATES.cloudCute, name: 'Fluffy Cloud', width: 26, height: 18, x: 10, y: 885, rotation: -3 },
      { type: 'sticker', isSvg: true, svgRaw: SVG_TEMPLATES.daisy, name: 'Daisy Blossom', width: 22, height: 22, x: 248, y: 885, rotation: 10 }
    ]
  },
  {
    id: 'y2k-cyber',
    name: 'Y2K Cyber Glitch',
    tag: 'Cyber',
    layout: 'retro-4-cut',
    aspect: 3 / 10,
    slots: 4,
    bgType: 'color',
    bg: '#0F172A',
    texture: 'grid',
    border: '#F43F5E',
    borderWidth: 2,
    shape: 'Square',
    caption: '// Y2K ARCHIVE 2000s //',
    captionColor: '#F43F5E',
    previewIcon: '⚡',
    elements: [
      { type: 'sticker', isSvg: true, svgRaw: SVG_TEMPLATES.sparkleStar, name: 'Cyber Sparkle', width: 22, height: 22, x: 10, y: 885, rotation: 12 },
      { type: 'sticker', isSvg: true, svgRaw: SVG_TEMPLATES.smiley, name: 'Smiley Badge', width: 22, height: 22, x: 248, y: 885, rotation: -6 }
    ]
  },
  {
    id: 'seoul-matcha',
    name: 'Seoul Cafe Matcha',
    tag: 'Aesthetic',
    layout: 'polaroid-2x2',
    aspect: 3 / 4,
    slots: 4,
    bgType: 'color',
    bg: '#F0FDF4',
    texture: 'kraft',
    border: '#86EFAC',
    borderWidth: 2,
    shape: 'Rounded',
    caption: '성수동 MATCHA · 🍵',
    captionColor: '#15803D',
    previewIcon: '🍵',
    elements: [
      { type: 'sticker', isSvg: true, svgRaw: SVG_TEMPLATES.cherries, name: 'Twin Cherries', width: 22, height: 22, x: 10, y: 335, rotation: -8 },
      { type: 'sticker', isSvg: true, svgRaw: SVG_TEMPLATES.daisy, name: 'Matcha Blossom', width: 20, height: 20, x: 250, y: 335, rotation: 10 }
    ]
  },
  {
    id: 'vintage-film',
    name: 'Vintage Film 1998',
    tag: 'Vintage',
    layout: 'retro-4-cut',
    aspect: 3 / 10,
    slots: 4,
    bgType: 'color',
    bg: '#18181B',
    texture: 'noise',
    border: '#D97706',
    borderWidth: 2,
    shape: 'Square',
    caption: 'FILM NO. 402 · 1998',
    captionColor: '#D97706',
    previewIcon: '🎞️',
    elements: [
      { type: 'sticker', isSvg: true, svgRaw: SVG_TEMPLATES.retroCamera, name: 'Vintage Camera', width: 24, height: 20, x: 10, y: 885, rotation: -2 },
      { type: 'sticker', isSvg: true, svgRaw: SVG_TEMPLATES.vinylRecord, name: 'Vinyl Disc', width: 22, height: 22, x: 248, y: 885, rotation: 15 }
    ]
  },
  {
    id: 'sakura-romance',
    name: 'Sakura Romance 2x2',
    tag: 'Pastel',
    layout: 'polaroid-2x2',
    aspect: 3 / 4,
    slots: 4,
    bgType: 'gradient',
    bg: 'linear-gradient(135deg, #FFF1F2 0%, #FCE7F3 50%, #FBCFE8 100%)',
    gradient: 'linear-gradient(135deg, #FFF1F2 0%, #FCE7F3 50%, #FBCFE8 100%)',
    texture: null,
    border: '#FBCFE8',
    borderWidth: 2,
    shape: 'Rounded',
    caption: 'TOKYO KISS · ロマンス 🌸',
    captionColor: '#DB2777',
    previewIcon: '🌸',
    elements: [
      { type: 'sticker', isSvg: true, svgRaw: SVG_TEMPLATES.ribbonBow, name: 'Ribbon Bow', width: 24, height: 20, x: 10, y: 335, rotation: -4 },
      { type: 'sticker', isSvg: true, svgRaw: SVG_TEMPLATES.sparkleHeart, name: 'Sparkle Heart', width: 20, height: 20, x: 250, y: 335, rotation: 8 }
    ]
  },
  {
    id: 'golden-sunset',
    name: 'Golden Sunset 3-Cut',
    tag: 'Warm',
    layout: 'film-3-cut',
    aspect: 3 / 8,
    slots: 3,
    bgType: 'gradient',
    bg: 'linear-gradient(180deg, #FEF3C7 0%, #FDE68A 45%, #FCD34D 100%)',
    gradient: 'linear-gradient(180deg, #FEF3C7 0%, #FDE68A 45%, #FCD34D 100%)',
    texture: 'polka',
    border: '#FDE68A',
    borderWidth: 2,
    shape: 'Rounded',
    caption: 'GOLDEN HOUR · 17:45 ☀️',
    captionColor: '#B45309',
    previewIcon: '🌅',
    elements: [
      { type: 'shape', shapeType: 'star', name: 'Golden Star', color: '#FACC15', strokeColor: '#B45309', strokeWidth: 1.5, width: 20, height: 20, x: 12, y: 700, rotation: -5 },
      { type: 'sticker', isSvg: true, svgRaw: SVG_TEMPLATES.sparkleStar, name: 'Golden Sparkle', width: 20, height: 20, x: 248, y: 700, rotation: 15 }
    ]
  },
  {
    id: 'swiss-minimal',
    name: 'Swiss Minimal',
    tag: 'Minimal',
    layout: 'retro-4-cut',
    aspect: 3 / 10,
    slots: 4,
    bgType: 'color',
    bg: '#FFFFFF',
    texture: null,
    border: '#0F172A',
    borderWidth: 2,
    shape: 'Square',
    caption: 'STUDIO EDITION · 2026',
    captionColor: '#0F172A',
    previewIcon: '📐',
    elements: [
      { type: 'shape', shapeType: 'diamond', name: 'Gem Diamond', color: '#0F172A', strokeColor: '#0F172A', strokeWidth: 1, width: 16, height: 16, x: 14, y: 885, rotation: 0 },
      { type: 'shape', shapeType: 'diamond', name: 'Gem Diamond', color: '#0F172A', strokeColor: '#0F172A', strokeWidth: 1, width: 16, height: 16, x: 250, y: 885, rotation: 0 }
    ]
  },
  {
    id: 'studio-circle',
    name: 'Monochrome Circle 4-Cut',
    tag: 'Minimal',
    layout: 'retro-4-cut',
    aspect: 3 / 10,
    slots: 4,
    bgType: 'color',
    bg: '#F1F1F4',
    texture: null,
    border: '#9AA0B4',
    borderWidth: 2,
    shape: 'Circle',
    caption: 'BLUE STUDIOS · CIRCLE',
    captionColor: '#64748B',
    previewIcon: '⚪',
    elements: [
      { type: 'shape', shapeType: 'diamond', name: 'Gem Diamond', color: '#9AA0B4', strokeColor: '#9AA0B4', strokeWidth: 1, width: 16, height: 16, x: 14, y: 885, rotation: 0 },
      { type: 'shape', shapeType: 'diamond', name: 'Gem Diamond', color: '#9AA0B4', strokeColor: '#9AA0B4', strokeWidth: 1, width: 16, height: 16, x: 250, y: 885, rotation: 0 }
    ]
  },
  {
    id: 'lilac-haze',
    name: 'Lilac Haze 2x2',
    tag: 'Aesthetic',
    layout: 'polaroid-2x2',
    aspect: 3 / 4,
    slots: 4,
    bgType: 'gradient',
    bg: 'linear-gradient(135deg, #F5F3FF 0%, #EDE9FE 50%, #DDD6FE 100%)',
    gradient: 'linear-gradient(135deg, #F5F3FF 0%, #EDE9FE 50%, #DDD6FE 100%)',
    texture: null,
    border: '#DDD6FE',
    borderWidth: 2,
    shape: 'Rounded',
    caption: 'LILAC HAZE · 💜',
    captionColor: '#7C3AED',
    previewIcon: '💜',
    elements: [
      { type: 'sticker', isSvg: true, svgRaw: SVG_TEMPLATES.sparkleStar, name: 'Cyber Sparkle', width: 20, height: 20, x: 12, y: 335, rotation: 0 },
      { type: 'sticker', isSvg: true, svgRaw: SVG_TEMPLATES.butterfly, name: 'Pastel Butterfly', width: 22, height: 20, x: 248, y: 335, rotation: 10 }
    ]
  },
  {
    id: 'warm-terracotta',
    name: 'Warm Terracotta 3-Cut',
    tag: 'Warm',
    layout: 'film-3-cut',
    aspect: 3 / 8,
    slots: 3,
    bgType: 'color',
    bg: '#FFF7ED',
    texture: 'kraft',
    border: '#FDBA74',
    borderWidth: 2,
    shape: 'Rounded',
    caption: 'CAFE TERRACE · 1994 ☕',
    captionColor: '#C2410C',
    previewIcon: '☕',
    elements: [
      { type: 'shape', shapeType: 'heart', name: 'Sweetheart', color: '#FB923C', strokeColor: '#C2410C', strokeWidth: 1.5, width: 20, height: 20, x: 12, y: 700, rotation: -6 },
      { type: 'sticker', isSvg: true, svgRaw: SVG_TEMPLATES.polaroidFrame, name: 'Mini Frame', width: 18, height: 22, x: 250, y: 700, rotation: 6 }
    ]
  },
]

// =============================================================================
// 3. Graphic Asset Library Categories
// =============================================================================
export const ELEMENT_TAG_FILTERS = [
  'All',
  'Y2K',
  'Doodles',
  'Film & Vintage',
  'Cute Animals',
  'Washi & Pins',
  'Frames'
]

export const ELEMENT_CATEGORIES = [
  {
    title: 'Recolorable Vector Elements',
    tag: 'Y2K',
    items: [
      { type: 'sticker', isSvg: true, svgRaw: SVG_TEMPLATES.daisy, name: 'Daisy Blossom', width: 44, height: 44, tags: ['Y2K', 'Doodles'] },
      { type: 'sticker', isSvg: true, svgRaw: SVG_TEMPLATES.sparkleStar, name: 'Cyber Sparkle', width: 42, height: 42, tags: ['Y2K', 'Doodles'] },
      { type: 'sticker', isSvg: true, svgRaw: SVG_TEMPLATES.ribbonBow, name: 'Ribbon Bow', width: 46, height: 38, tags: ['Y2K', 'Cute Animals'] },
      { type: 'sticker', isSvg: true, svgRaw: SVG_TEMPLATES.cherries, name: 'Twin Cherries', width: 42, height: 42, tags: ['Y2K', 'Doodles'] },
      { type: 'sticker', isSvg: true, svgRaw: SVG_TEMPLATES.smiley, name: 'Smiley Badge', width: 42, height: 42, tags: ['Y2K', 'Doodles'] },
      { type: 'sticker', isSvg: true, svgRaw: SVG_TEMPLATES.butterfly, name: 'Pastel Butterfly', width: 44, height: 40, tags: ['Cute Animals', 'Y2K'] },
      { type: 'sticker', isSvg: true, svgRaw: SVG_TEMPLATES.retroCamera, name: 'Vintage Camera', width: 48, height: 40, tags: ['Film & Vintage', 'Doodles'] },
      { type: 'sticker', isSvg: true, svgRaw: SVG_TEMPLATES.polaroidFrame, name: 'Mini Frame', width: 40, height: 48, tags: ['Frames', 'Film & Vintage'] },
      { type: 'sticker', isSvg: true, svgRaw: SVG_TEMPLATES.sparkleHeart, name: 'Sparkle Heart', width: 44, height: 42, tags: ['Y2K', 'Doodles', 'Cute Animals'] },
      { type: 'sticker', isSvg: true, svgRaw: SVG_TEMPLATES.starburst, name: 'Y2K Starburst', width: 44, height: 44, tags: ['Y2K', 'Doodles'] },
      { type: 'sticker', isSvg: true, svgRaw: SVG_TEMPLATES.cloudCute, name: 'Fluffy Cloud', width: 48, height: 34, tags: ['Doodles', 'Cute Animals'] },
      { type: 'sticker', isSvg: true, svgRaw: SVG_TEMPLATES.vinylRecord, name: 'Vinyl Disc', width: 44, height: 44, tags: ['Film & Vintage', 'Y2K'] }
    ]
  },
  {
    title: 'Cute Shapes',
    tag: 'Doodles',
    items: [
      { type: 'shape', shapeType: 'star', name: 'Golden Star', color: '#FACC15', strokeColor: '#0F172A', strokeWidth: 2, width: 40, height: 40, tags: ['Doodles', 'Y2K'] },
      { type: 'shape', shapeType: 'heart', name: 'Sweetheart', color: '#F472B6', strokeColor: '#DB2777', strokeWidth: 2, width: 38, height: 38, tags: ['Doodles', 'Cute Animals'] },
      { type: 'shape', shapeType: 'circle', name: 'Color Dot', color: '#2F5BEA', strokeColor: '#1E40AF', strokeWidth: 2, width: 36, height: 36, tags: ['Doodles'] },
      { type: 'shape', shapeType: 'diamond', name: 'Gem Diamond', color: '#38BDF8', strokeColor: '#0284C7', strokeWidth: 2, width: 38, height: 38, tags: ['Doodles', 'Y2K'] }
    ]
  },
  {
    title: 'Washi Tapes & Pins',
    tag: 'Washi & Pins',
    items: [
      { type: 'tape', name: 'Yellow Tape', color: 'rgba(253, 224, 71, 0.85)', patternColor: '#FFFFFF', width: 90, height: 20, tags: ['Washi & Pins'] },
      { type: 'tape', name: 'Pink Tape', color: 'rgba(244, 114, 182, 0.85)', patternColor: '#FFFFFF', width: 90, height: 20, tags: ['Washi & Pins'] },
      { type: 'tape', name: 'Sky Tape', color: 'rgba(96, 165, 250, 0.85)', patternColor: '#FFFFFF', width: 90, height: 20, tags: ['Washi & Pins'] },
      { type: 'tape', name: 'Mint Tape', color: 'rgba(52, 211, 153, 0.85)', patternColor: '#FFFFFF', width: 90, height: 20, tags: ['Washi & Pins'] },
      { type: 'sticker', content: '📌', name: 'Push Pin', fontSize: 24, tags: ['Washi & Pins'] },
      { type: 'sticker', content: '📎', name: 'Paperclip', fontSize: 24, tags: ['Washi & Pins'] }
    ]
  },
  {
    title: 'Photobooth Doodles & Emojis',
    tag: 'Doodles',
    items: [
      { type: 'sticker', content: '✨', name: 'Sparkles', fontSize: 28, tags: ['Doodles', 'Y2K'] },
      { type: 'sticker', content: '⭐', name: 'Star', fontSize: 28, tags: ['Doodles', 'Y2K'] },
      { type: 'sticker', content: '💖', name: 'Heart', fontSize: 28, tags: ['Doodles', 'Cute Animals'] },
      { type: 'sticker', content: '🎀', name: 'Ribbon', fontSize: 28, tags: ['Cute Animals', 'Y2K'] },
      { type: 'sticker', content: '📷', name: 'Camera', fontSize: 28, tags: ['Film & Vintage'] },
      { type: 'sticker', content: '🎞️', name: 'Film Strip', fontSize: 28, tags: ['Film & Vintage'] },
      { type: 'sticker', content: '🌸', name: 'Cherry Blossom', fontSize: 28, tags: ['Doodles'] },
      { type: 'sticker', content: '🕶️', name: 'Y2K Shades', fontSize: 28, tags: ['Y2K'] },
      { type: 'sticker', content: '⚡', name: 'Lightning', fontSize: 28, tags: ['Y2K', 'Doodles'] },
      { type: 'sticker', content: '🐰', name: 'Cute Bunny', fontSize: 28, tags: ['Cute Animals'] },
      { type: 'sticker', content: '🐱', name: 'White Kitty', fontSize: 28, tags: ['Cute Animals'] },
      { type: 'sticker', content: '🧸', name: 'Teddy Bear', fontSize: 28, tags: ['Cute Animals'] },
      { type: 'sticker', content: '✌️', name: 'Peace Sign', fontSize: 28, tags: ['Y2K'] }
    ]
  }
]

// =============================================================================
// 4. Typography Presets & Font Library
// =============================================================================
export const FONT_CATEGORIES = [
  {
    name: 'Handwritten / Cursive',
    tag: 'Doodles & Signatures',
    fonts: [
      { label: 'Caveat (Doodle Signature)', family: "'Caveat', cursive", preview: 'Forever Friends' },
      { label: 'Indie Flower (Cute Casual)', family: "'Indie Flower', cursive", preview: 'Smile & Pose' },
      { label: 'Pacifico (Retro Brush)', family: "'Pacifico', cursive", preview: 'Blue Studios' },
      { label: 'Permanent Marker (Street Tag)', family: "'Permanent Marker', cursive", preview: 'MEMORIES' },
      { label: 'Shadows Into Light (Delicate)', family: "'Shadows Into Light', cursive", preview: 'Happy Day' },
      { label: 'Satisfy (Smooth Flow)', family: "'Satisfy', cursive", preview: 'Special Moment' },
      { label: 'Kalam (Marker Sketch)', family: "'Kalam', cursive", preview: 'Good Vibes' },
      { label: 'Patrick Hand (School Desk)', family: "'Patrick Hand', cursive", preview: 'Besties 2026' },
      { label: 'Gochi Hand (Fun Scribble)', family: "'Gochi Hand', cursive", preview: 'Sweet Love' },
      { label: 'Reenie Beanie (Quick Jot)', family: "'Reenie Beanie', cursive", preview: 'xoxo' }
    ]
  },
  {
    name: 'Y2K & Chunky Display',
    tag: 'Playful & Retro',
    fonts: [
      { label: 'Righteous (Y2K Club Title)', family: "'Righteous', cursive", preview: 'CYBER 2000' },
      { label: 'Fredoka (Bubble Pop)', family: "'Fredoka', sans-serif", preview: 'BUBBLE POP' },
      { label: 'Bungee (Bold Street Sign)', family: "'Bungee', cursive", preview: 'PHOTOBOOTH' },
      { label: 'Comfortaa (Rounded Modern)', family: "'Comfortaa', cursive", preview: 'Aesthetic' },
      { label: 'Shrikhand (Curvy Vintage)', family: "'Shrikhand', cursive", preview: 'Vintage Club' },
      { label: 'Titan One (Heavy Cartoon)', family: "'Titan One', cursive", preview: 'CHUNKY' },
      { label: 'Carter One (Retro Stamp)', family: "'Carter One', cursive", preview: 'ORIGINAL' },
      { label: 'Modak (Puffy Cloud)', family: "'Modak', cursive", preview: 'SOFT' }
    ]
  },
  {
    name: 'Editorial Serif & Vintage',
    tag: 'Chic & Magazine',
    fonts: [
      { label: 'Playfair Display (Luxury Serif)', family: "'Playfair Display', serif", preview: 'CLASSIC REUNION' },
      { label: 'Cinzel (Classical Engraved)', family: "'Cinzel', serif", preview: 'ARCHIVE VOL. I' },
      { label: 'Abril Fatface (High-Fashion Title)', family: "'Abril Fatface', cursive", preview: 'Vogue Cut' },
      { label: 'Cormorant Garamond (Graceful)', family: "'Cormorant Garamond', serif", preview: 'Cherished' },
      { label: 'DM Serif Display (Sharp Editorial)', family: "'DM Serif Display', serif", preview: 'STUDIO 2026' }
    ]
  },
  {
    name: 'Modern Sans & Monospace',
    tag: 'Clean & Timestamp',
    fonts: [
      { label: 'Space Mono (Korean Timestamp)', family: "'Space Mono', monospace", preview: '2026.10.16 23:40' },
      { label: 'Inter (Clean Swiss Sans)', family: "'Inter', sans-serif", preview: 'Minimal Clean' },
      { label: 'Plus Jakarta Sans (Crisp Modern)', family: "'Plus Jakarta Sans', sans-serif", preview: 'Exchange Day' },
      { label: 'Montserrat (Geometric Caps)', family: "'Montserrat', sans-serif", preview: 'EXCHANGE 2026' },
      { label: 'Oswald (Tall Condensed Poster)', family: "'Oswald', sans-serif", preview: 'BLUE STUDIOS' },
      { label: 'Bebas Neue (Heavy Condensed)', family: "'Bebas Neue', sans-serif", preview: 'MEMORIES' }
    ]
  }
]

export const TEXT_PRESETS = [
  { label: 'Y2K Retro Title', text: 'Blue Studios 📸', fontFamily: "'Righteous', cursive", fontSize: 24, fontWeight: '700', color: '#2F5BEA' },
  { label: 'Cute Handwritten', text: 'forever friends ♡', fontFamily: "'Caveat', cursive", fontSize: 22, fontWeight: '600', color: '#E11D48', fontStyle: 'italic' },
  { label: 'Chunky Bubble', text: 'SMILE & POSE', fontFamily: "'Fredoka', sans-serif", fontSize: 22, fontWeight: '700', color: '#0F172A' },
  { label: 'Korean 4-Cut Timestamp', text: '2026.10.16 23:40', fontFamily: "'Space Mono', monospace", fontSize: 13, fontWeight: '700', color: '#64748B', letterSpacing: 2 },
  { label: 'Editorial Magazine', text: 'MEMORIES COLLECTION', fontFamily: "'Playfair Display', serif", fontSize: 16, fontWeight: '700', color: '#0F172A', letterSpacing: 3, textTransform: 'uppercase' },
  { label: 'Street Marker Doodle', text: 'BESTIES ONLY!', fontFamily: "'Permanent Marker', cursive", fontSize: 20, fontWeight: '400', color: '#7C3AED' }
]

// =============================================================================
// 5. Background Colors, Gradients & Patterns
// =============================================================================
export const BACKGROUND_COLORS = [
  { name: 'Cream', value: '#FEFBF6', border: '#E5E7EB' },
  { name: 'Pure White', value: '#FFFFFF', border: '#D1D5DB' },
  { name: 'Cyber Dark', value: '#111827', border: '#111827' },
  { name: 'Studio Blue', value: '#2F5BEA', border: '#2F5BEA' },
  { name: 'Candy Pink', value: '#F43F5E', border: '#F43F5E' },
  { name: 'Soft Peach', value: '#FFEDD5', border: '#FED7AA' },
  { name: 'Buttercup', value: '#FDE68A', border: '#FCD34D' },
  { name: 'Lavender Mist', value: '#EDE9FE', border: '#DDD6FE' },
  { name: 'Mint Breeze', value: '#D1FAE5', border: '#A7F3D0' },
  { name: 'Cool Slate', value: '#F1F5F9', border: '#CBD5E1' },
  { name: 'Matcha Milk', value: '#E2E8D5', border: '#C5D1AF' },
  { name: 'Vintage Mocha', value: '#4A3B32', border: '#382B24' }
]

export const BACKGROUND_GRADIENTS = [
  { id: 'sunset-peach', name: 'Sunset Peach', value: 'linear-gradient(135deg, #FF9A8B 0%, #FF6A88 55%, #FF99AC 100%)' },
  { id: 'aurora-pastel', name: 'Pastel Aurora', value: 'linear-gradient(135deg, #A8EDEA 0%, #FED6E3 100%)' },
  { id: 'retro-duotone', name: 'Retro Sunset', value: 'linear-gradient(135deg, #FA709A 0%, #FEE140 100%)' },
  { id: 'y2k-bubblegum', name: 'Y2K Bubblegum', value: 'linear-gradient(135deg, #F093FB 0%, #F5576C 100%)' },
  { id: 'cyber-neon', name: 'Cyber Neon', value: 'linear-gradient(135deg, #4FACFE 0%, #00F2FE 100%)' },
  { id: 'velvet-lilac', name: 'Velvet Lilac', value: 'linear-gradient(135deg, #C471ED 0%, #F64F59 100%)' },
  { id: 'chrome-silver', name: 'Chrome Silver', value: 'linear-gradient(135deg, #E0E0E0 0%, #F5F5F5 50%, #BDBDBD 100%)' },
  { id: 'matcha-cream', name: 'Matcha Cream', value: 'linear-gradient(135deg, #E2D4C0 0%, #C8D6AF 100%)' },
  { id: 'deep-cosmic', name: 'Deep Cosmic', value: 'linear-gradient(135deg, #09203F 0%, #537895 100%)' },
  { id: 'cotton-candy', name: 'Cotton Candy', value: 'linear-gradient(180deg, #E0C3FC 0%, #8EC5FC 100%)' },
  { id: 'sunrise-radiance', name: 'Sunrise Bloom', value: 'radial-gradient(circle at top left, #FFE57F, #FF80AB)' },
  { id: 'holographic', name: 'Holographic', value: 'linear-gradient(135deg, #FFDEE9 0%, #B5FFFC 100%)' }
]

export const BACKGROUND_TEXTURES = [
  { id: 'kraft', name: 'Kraft Cardboard', desc: 'Warm speckled paper fiber', baseSize: 160 },
  { id: 'watercolor', name: 'Watercolor Tooth', desc: 'Cold press textured tooth', baseSize: 100 },
  { id: 'noise', name: 'Film Grain', desc: 'Photobooth film grain overlay', baseSize: 100 }
]

export const BACKGROUND_PATTERNS = [
  { id: 'polka', name: 'Polka Dots', desc: 'Aesthetic dotted pattern', baseSize: 18 },
  { id: 'grid', name: 'Notebook Grid', desc: 'Precise graph paper ruling', baseSize: 20 },
  { id: 'checkerboard', name: 'Y2K Checkerboard', desc: 'Trendy 2-tone checkerboard', baseSize: 24 }
]

export const KRAFT_TEXTURE = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160' viewBox='0 0 160 160'%3E%3Cline x1='16' y1='32' x2='21' y2='35' stroke='%235C3E26' stroke-width='0.75' stroke-linecap='round' opacity='0.35'/%3E%3Cline x1='72' y1='18' x2='78' y2='15' stroke='%237A5230' stroke-width='0.7' stroke-linecap='round' opacity='0.32'/%3E%3Cline x1='124' y1='48' x2='130' y2='52' stroke='%234A3319' stroke-width='0.8' stroke-linecap='round' opacity='0.38'/%3E%3Cline x1='44' y1='82' x2='49' y2='79' stroke='%238B5A2B' stroke-width='0.75' stroke-linecap='round' opacity='0.3'/%3E%3Cline x1='102' y1='95' x2='108' y2='98' stroke='%235C3E26' stroke-width='0.7' stroke-linecap='round' opacity='0.33'/%3E%3Cline x1='138' y1='125' x2='144' y2='122' stroke='%237A5230' stroke-width='0.8' stroke-linecap='round' opacity='0.35'/%3E%3Cline x1='28' y1='142' x2='34' y2='145' stroke='%234A3319' stroke-width='0.7' stroke-linecap='round' opacity='0.32'/%3E%3Cline x1='86' y1='138' x2='92' y2='141' stroke='%238B5A2B' stroke-width='0.75' stroke-linecap='round' opacity='0.3'/%3E%3Ccircle cx='20' cy='38' r='1.2' fill='%235C3E26' opacity='0.42'/%3E%3Ccircle cx='82' cy='118' r='1.4' fill='%235C3E26' opacity='0.38'/%3E%3Ccircle cx='142' cy='58' r='1.1' fill='%235C3E26' opacity='0.45'/%3E%3Ccircle cx='48' cy='148' r='1.5' fill='%234A3319' opacity='0.42'/%3E%3Ccircle cx='115' cy='25' r='1.3' fill='%234A3319' opacity='0.38'/%3E%3Ccircle cx='35' cy='88' r='1' fill='%235C3E26' opacity='0.35'/%3E%3Ccircle cx='95' cy='72' r='1.3' fill='%234A3319' opacity='0.4'/%3E%3Ccircle cx='152' cy='135' r='1.1' fill='%235C3E26' opacity='0.36'/%3E%3Ccircle cx='12' cy='122' r='1.2' fill='%234A3319' opacity='0.38'/%3E%3Ccircle cx='68' cy='42' r='1' fill='%235C3E26' opacity='0.35'/%3E%3Ccircle cx='58' cy='18' r='0.9' fill='%237A5230' opacity='0.38'/%3E%3Ccircle cx='132' cy='92' r='1.2' fill='%237A5230' opacity='0.35'/%3E%3Ccircle cx='25' cy='62' r='0.8' fill='%237A5230' opacity='0.32'/%3E%3Ccircle cx='105' cy='145' r='1' fill='%237A5230' opacity='0.36'/%3E%3Ccircle cx='78' cy='88' r='0.9' fill='%237A5230' opacity='0.34'/%3E%3Ccircle cx='148' cy='18' r='0.8' fill='%237A5230' opacity='0.3'/%3E%3Ccircle cx='88' cy='5' r='1.1' fill='%237A5230' opacity='0.35'/%3E%3Ccircle cx='15' cy='155' r='0.9' fill='%237A5230' opacity='0.32'/%3E%3Ccircle cx='120' cy='158' r='0.8' fill='%237A5230' opacity='0.3'/%3E%3Ccircle cx='42' cy='108' r='0.8' fill='%239C7248' opacity='0.3'/%3E%3Ccircle cx='155' cy='82' r='0.9' fill='%239C7248' opacity='0.28'/%3E%3Ccircle cx='65' cy='65' r='0.7' fill='%239C7248' opacity='0.28'/%3E%3Ccircle cx='8' cy='15' r='0.9' fill='%239C7248' opacity='0.3'/%3E%3Ccircle cx='85' cy='152' r='0.7' fill='%239C7248' opacity='0.26'/%3E%3Ccircle cx='138' cy='38' r='0.8' fill='%239C7248' opacity='0.28'/%3E%3Ccircle cx='52' cy='2' r='0.8' fill='%239C7248' opacity='0.25'/%3E%3Ccircle cx='32' cy='22' r='0.6' fill='%236B4F3A' opacity='0.22'/%3E%3Ccircle cx='74' cy='28' r='0.5' fill='%236B4F3A' opacity='0.2'/%3E%3Ccircle cx='110' cy='52' r='0.6' fill='%236B4F3A' opacity='0.22'/%3E%3Ccircle cx='125' cy='12' r='0.5' fill='%236B4F3A' opacity='0.18'/%3E%3Ccircle cx='45' cy='52' r='0.5' fill='%236B4F3A' opacity='0.2'/%3E%3Ccircle cx='18' cy='75' r='0.6' fill='%236B4F3A' opacity='0.22'/%3E%3Ccircle cx='62' cy='95' r='0.5' fill='%236B4F3A' opacity='0.18'/%3E%3Ccircle cx='90' cy='105' r='0.6' fill='%236B4F3A' opacity='0.22'/%3E%3Ccircle cx='115' cy='115' r='0.5' fill='%236B4F3A' opacity='0.2'/%3E%3Ccircle cx='145' cy='110' r='0.6' fill='%236B4F3A' opacity='0.22'/%3E%3Ccircle cx='38' cy='132' r='0.5' fill='%236B4F3A' opacity='0.18'/%3E%3Ccircle cx='72' cy='142' r='0.6' fill='%236B4F3A' opacity='0.2'/%3E%3Ccircle cx='130' cy='75' r='0.5' fill='%236B4F3A' opacity='0.18'/%3E%3Ccircle cx='158' cy='45' r='0.5' fill='%236B4F3A' opacity='0.18'/%3E%3Ccircle cx='2' cy='98' r='0.6' fill='%236B4F3A' opacity='0.2'/%3E%3Ccircle cx='98' cy='38' r='0.5' fill='%236B4F3A' opacity='0.18'/%3E%3C/svg%3E")`

export const CRUMPLED_TEXTURE = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='200' height='200' viewBox='0 0 200 200'%3E%3Cdefs%3E%3ClinearGradient id='g1' x1='0%25' y1='0%25' x2='100%25' y2='100%25'%3E%3Cstop offset='0%25' stop-color='%23ffffff' stop-opacity='0.25'/%3E%3Cstop offset='45%25' stop-color='%23000000' stop-opacity='0.05'/%3E%3Cstop offset='55%25' stop-color='%23ffffff' stop-opacity='0.2'/%3E%3Cstop offset='100%25' stop-color='%23000000' stop-opacity='0.07'/%3E%3C/linearGradient%3E%3ClinearGradient id='g2' x1='100%25' y1='0%25' x2='0%25' y2='100%25'%3E%3Cstop offset='0%25' stop-color='%23ffffff' stop-opacity='0.18'/%3E%3Cstop offset='50%25' stop-color='%23000000' stop-opacity='0.06'/%3E%3Cstop offset='100%25' stop-color='%23ffffff' stop-opacity='0.15'/%3E%3C/linearGradient%3E%3C/defs%3E%3Crect width='200' height='200' fill='url(%23g1)'/%3E%3Crect width='200' height='200' fill='url(%23g2)' opacity='0.8'/%3E%3C/svg%3E")`

export const WATERCOLOR_TEXTURE = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='100' viewBox='0 0 100 100'%3E%3Cellipse cx='41.2' cy='22.2' rx='1.6' ry='0.9' fill='%23ffffff' opacity='0.09'/%3E%3Cellipse cx='24.5' cy='73' rx='1.5' ry='1.2' fill='%235C4A38' opacity='0.09'/%3E%3Cellipse cx='73.6' cy='78.4' rx='1.6' ry='1.9' fill='%235C4A38' opacity='0.05'/%3E%3Cellipse cx='21.8' cy='71.8' rx='2.4' ry='0.9' fill='%235C4A38' opacity='0.08'/%3E%3Cellipse cx='2.3' cy='86.5' rx='2.9' ry='1.2' fill='%23ffffff' opacity='0.11'/%3E%3Cellipse cx='48.7' cy='55.8' rx='1.7' ry='1.9' fill='%235C4A38' opacity='0.05'/%3E%3Cellipse cx='94' cy='13' rx='1.3' ry='0.9' fill='%23ffffff' opacity='0.14'/%3E%3Cellipse cx='71.8' cy='91.6' rx='2.3' ry='1.1' fill='%23ffffff' opacity='0.16'/%3E%3Cellipse cx='15.4' cy='24.8' rx='1.7' ry='1.7' fill='%235C4A38' opacity='0.1'/%3E%3Cellipse cx='58' cy='46' rx='1.9' ry='1.9' fill='%23ffffff' opacity='0.16'/%3E%3Cellipse cx='33' cy='88.4' rx='1.6' ry='0.9' fill='%23ffffff' opacity='0.12'/%3E%3Cellipse cx='73.8' cy='85.5' rx='1.5' ry='1.5' fill='%23ffffff' opacity='0.14'/%3E%3Cellipse cx='13.6' cy='70.6' rx='2.3' ry='1.7' fill='%235C4A38' opacity='0.06'/%3E%3Cellipse cx='85.8' cy='76.9' rx='2.5' ry='1.9' fill='%23ffffff' opacity='0.15'/%3E%3Cellipse cx='23.8' cy='37.9' rx='1.2' ry='1.2' fill='%235C4A38' opacity='0.07'/%3E%3Cellipse cx='60.9' cy='86.8' rx='2.5' ry='1.3' fill='%23ffffff' opacity='0.09'/%3E%3Cellipse cx='30.3' cy='57' rx='1.5' ry='1.5' fill='%23ffffff' opacity='0.1'/%3E%3Cellipse cx='65.5' cy='81.9' rx='2.6' ry='2' fill='%23ffffff' opacity='0.09'/%3E%3Cellipse cx='99.8' cy='94.7' rx='2.6' ry='0.9' fill='%23ffffff' opacity='0.09'/%3E%3Cellipse cx='66.5' cy='28.9' rx='2.2' ry='1' fill='%235C4A38' opacity='0.08'/%3E%3Cellipse cx='98.9' cy='17.6' rx='1.9' ry='1.5' fill='%235C4A38' opacity='0.08'/%3E%3Cellipse cx='30.4' cy='94.3' rx='2.5' ry='1.5' fill='%23ffffff' opacity='0.16'/%3E%3Cellipse cx='94.3' cy='92.3' rx='2.6' ry='1.6' fill='%235C4A38' opacity='0.08'/%3E%3Cellipse cx='24' cy='45' rx='3' ry='0.9' fill='%23ffffff' opacity='0.09'/%3E%3Cellipse cx='52.7' cy='85.6' rx='2.3' ry='0.9' fill='%23ffffff' opacity='0.14'/%3E%3Cellipse cx='13.8' cy='47.5' rx='3' ry='0.9' fill='%23ffffff' opacity='0.14'/%3E%3Cellipse cx='40.7' cy='64' rx='2.1' ry='1.3' fill='%23ffffff' opacity='0.12'/%3E%3Cellipse cx='66.6' cy='68.5' rx='1.9' ry='1.4' fill='%23ffffff' opacity='0.12'/%3E%3Cellipse cx='25' cy='94.3' rx='1.4' ry='1.3' fill='%235C4A38' opacity='0.09'/%3E%3Cellipse cx='49.1' cy='74.7' rx='2.8' ry='1.7' fill='%235C4A38' opacity='0.09'/%3E%3Cellipse cx='72.3' cy='43.1' rx='1.4' ry='1.7' fill='%235C4A38' opacity='0.05'/%3E%3Cellipse cx='27.8' cy='32.8' rx='1.4' ry='1.7' fill='%23ffffff' opacity='0.14'/%3E%3Cellipse cx='49.1' cy='77.1' rx='1.6' ry='0.8' fill='%235C4A38' opacity='0.05'/%3E%3Cellipse cx='69.5' cy='9.4' rx='2.5' ry='2' fill='%235C4A38' opacity='0.08'/%3E%3Cellipse cx='22.3' cy='62.9' rx='1.3' ry='1.9' fill='%235C4A38' opacity='0.08'/%3E%3Cellipse cx='40.9' cy='71.1' rx='2' ry='1' fill='%235C4A38' opacity='0.06'/%3E%3Cellipse cx='58.5' cy='67.3' rx='1.7' ry='0.9' fill='%23ffffff' opacity='0.08'/%3E%3Cellipse cx='8.5' cy='84.7' rx='2.8' ry='2' fill='%235C4A38' opacity='0.06'/%3E%3Cellipse cx='24.2' cy='56.8' rx='2.3' ry='1.1' fill='%235C4A38' opacity='0.06'/%3E%3Cellipse cx='39.1' cy='16.9' rx='2.6' ry='1' fill='%235C4A38' opacity='0.07'/%3E%3Cellipse cx='86.3' cy='98.2' rx='2.4' ry='0.8' fill='%23ffffff' opacity='0.16'/%3E%3Cellipse cx='99.3' cy='34.2' rx='2.4' ry='1.1' fill='%23ffffff' opacity='0.1'/%3E%3Cellipse cx='11.4' cy='58.1' rx='1.4' ry='0.9' fill='%23ffffff' opacity='0.14'/%3E%3Cellipse cx='55.8' cy='3.4' rx='1.8' ry='1.9' fill='%23ffffff' opacity='0.12'/%3E%3Cellipse cx='66' cy='3.2' rx='2.4' ry='0.9' fill='%23ffffff' opacity='0.09'/%3E%3Cellipse cx='75.3' cy='91.1' rx='2' ry='2' fill='%235C4A38' opacity='0.09'/%3E%3Cellipse cx='17' cy='0.2' rx='2.9' ry='1.7' fill='%23ffffff' opacity='0.08'/%3E%3Cellipse cx='24.4' cy='63.9' rx='2.3' ry='1.9' fill='%235C4A38' opacity='0.1'/%3E%3C/svg%3E")`

export const NOISE_TEXTURE = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='100' height='100' viewBox='0 0 100 100'%3E%3Ccircle cx='88.6' cy='81.8' r='0.9' fill='%23000000' opacity='0.12'/%3E%3Ccircle cx='72.1' cy='59.6' r='0.6' fill='%23000000' opacity='0.14'/%3E%3Ccircle cx='71' cy='32.2' r='0.9' fill='%23000000' opacity='0.16'/%3E%3Ccircle cx='89.4' cy='18.3' r='0.6' fill='%23000000' opacity='0.15'/%3E%3Ccircle cx='16.3' cy='44.2' r='0.6' fill='%23000000' opacity='0.13'/%3E%3Ccircle cx='4.1' cy='54.6' r='0.9' fill='%23000000' opacity='0.14'/%3E%3Ccircle cx='12.1' cy='90.6' r='0.6' fill='%23ffffff' opacity='0.19'/%3E%3Ccircle cx='18.6' cy='34.1' r='0.9' fill='%23ffffff' opacity='0.1'/%3E%3Ccircle cx='98' cy='18.5' r='0.6' fill='%23000000' opacity='0.1'/%3E%3Ccircle cx='65.2' cy='7.2' r='0.6' fill='%23000000' opacity='0.14'/%3E%3Ccircle cx='87.4' cy='37.6' r='0.6' fill='%23ffffff' opacity='0.19'/%3E%3Ccircle cx='61.1' cy='32.2' r='0.6' fill='%23000000' opacity='0.14'/%3E%3Ccircle cx='57' cy='76.4' r='0.9' fill='%23000000' opacity='0.13'/%3E%3Ccircle cx='30.9' cy='63.2' r='0.6' fill='%23ffffff' opacity='0.15'/%3E%3Ccircle cx='1.8' cy='3.9' r='0.6' fill='%23ffffff' opacity='0.13'/%3E%3Ccircle cx='95.7' cy='6.4' r='0.6' fill='%23ffffff' opacity='0.15'/%3E%3Ccircle cx='57.6' cy='19' r='0.6' fill='%23000000' opacity='0.14'/%3E%3Ccircle cx='28.3' cy='42.1' r='0.6' fill='%23000000' opacity='0.15'/%3E%3Ccircle cx='89.8' cy='5.6' r='0.6' fill='%23ffffff' opacity='0.15'/%3E%3Ccircle cx='75.6' cy='13.6' r='0.6' fill='%23ffffff' opacity='0.18'/%3E%3Ccircle cx='49.1' cy='55.1' r='0.9' fill='%23000000' opacity='0.13'/%3E%3Ccircle cx='47.5' cy='82.4' r='0.6' fill='%23ffffff' opacity='0.17'/%3E%3Ccircle cx='93.4' cy='55.1' r='0.9' fill='%23ffffff' opacity='0.18'/%3E%3Ccircle cx='72.4' cy='51.2' r='0.6' fill='%23000000' opacity='0.12'/%3E%3Ccircle cx='77.2' cy='45.1' r='0.6' fill='%23ffffff' opacity='0.11'/%3E%3Ccircle cx='19.4' cy='51.9' r='0.6' fill='%23000000' opacity='0.14'/%3E%3Ccircle cx='6.6' cy='38.7' r='0.6' fill='%23ffffff' opacity='0.19'/%3E%3Ccircle cx='87.3' cy='2' r='0.6' fill='%23000000' opacity='0.15'/%3E%3Ccircle cx='61.7' cy='12.4' r='0.6' fill='%23000000' opacity='0.14'/%3E%3Ccircle cx='60' cy='26' r='0.9' fill='%23ffffff' opacity='0.16'/%3E%3Ccircle cx='86' cy='61.4' r='0.6' fill='%23ffffff' opacity='0.12'/%3E%3Ccircle cx='28.9' cy='44.9' r='0.6' fill='%23000000' opacity='0.15'/%3E%3Ccircle cx='40.9' cy='21.3' r='0.9' fill='%23000000' opacity='0.14'/%3E%3Ccircle cx='81.6' cy='31.7' r='0.6' fill='%23ffffff' opacity='0.19'/%3E%3Ccircle cx='29.1' cy='57.7' r='0.6' fill='%23ffffff' opacity='0.12'/%3E%3Ccircle cx='57.7' cy='33.1' r='0.6' fill='%23000000' opacity='0.13'/%3E%3Ccircle cx='82.6' cy='21.2' r='0.6' fill='%23000000' opacity='0.11'/%3E%3Ccircle cx='70.8' cy='59.2' r='0.6' fill='%23ffffff' opacity='0.18'/%3E%3Ccircle cx='18.8' cy='69.7' r='0.9' fill='%23000000' opacity='0.09'/%3E%3Ccircle cx='97.3' cy='38.3' r='0.9' fill='%23000000' opacity='0.11'/%3E%3Ccircle cx='62.2' cy='57.7' r='0.6' fill='%23000000' opacity='0.15'/%3E%3Ccircle cx='32.4' cy='39.4' r='0.9' fill='%23ffffff' opacity='0.13'/%3E%3Ccircle cx='34' cy='91.2' r='0.9' fill='%23000000' opacity='0.1'/%3E%3Ccircle cx='11.8' cy='61.5' r='0.6' fill='%23000000' opacity='0.11'/%3E%3Ccircle cx='6.8' cy='50.5' r='0.9' fill='%23ffffff' opacity='0.13'/%3E%3Ccircle cx='1' cy='88.3' r='0.9' fill='%23000000' opacity='0.16'/%3E%3Ccircle cx='27.8' cy='78.9' r='0.6' fill='%23ffffff' opacity='0.14'/%3E%3Ccircle cx='50.5' cy='11.4' r='0.6' fill='%23000000' opacity='0.1'/%3E%3Ccircle cx='6.6' cy='38' r='0.6' fill='%23000000' opacity='0.13'/%3E%3Ccircle cx='18.5' cy='18.3' r='0.9' fill='%23000000' opacity='0.09'/%3E%3Ccircle cx='71.7' cy='30.4' r='0.6' fill='%23000000' opacity='0.1'/%3E%3Ccircle cx='59.2' cy='48.6' r='0.9' fill='%23ffffff' opacity='0.13'/%3E%3Ccircle cx='92.4' cy='88.1' r='0.6' fill='%23000000' opacity='0.12'/%3E%3Ccircle cx='78.9' cy='15.8' r='0.6' fill='%23ffffff' opacity='0.13'/%3E%3Ccircle cx='67.2' cy='28.4' r='0.6' fill='%23ffffff' opacity='0.11'/%3E%3Ccircle cx='57.6' cy='96.5' r='0.6' fill='%23000000' opacity='0.14'/%3E%3Ccircle cx='80.2' cy='76' r='0.6' fill='%23000000' opacity='0.12'/%3E%3Ccircle cx='38.8' cy='85.7' r='0.6' fill='%23ffffff' opacity='0.1'/%3E%3Ccircle cx='22.7' cy='51.9' r='0.6' fill='%23ffffff' opacity='0.18'/%3E%3Ccircle cx='84' cy='19.3' r='0.6' fill='%23ffffff' opacity='0.19'/%3E%3Ccircle cx='82.4' cy='29' r='0.9' fill='%23000000' opacity='0.1'/%3E%3Ccircle cx='95.8' cy='62.7' r='0.9' fill='%23ffffff' opacity='0.19'/%3E%3Ccircle cx='98.8' cy='54' r='0.6' fill='%23000000' opacity='0.14'/%3E%3Ccircle cx='6.3' cy='66.4' r='0.6' fill='%23000000' opacity='0.15'/%3E%3Ccircle cx='85.4' cy='37' r='0.6' fill='%23000000' opacity='0.16'/%3E%3Ccircle cx='32.7' cy='88.5' r='0.6' fill='%23ffffff' opacity='0.19'/%3E%3Ccircle cx='18.9' cy='6.4' r='0.6' fill='%23000000' opacity='0.16'/%3E%3Ccircle cx='99.8' cy='83.4' r='0.6' fill='%23000000' opacity='0.1'/%3E%3Ccircle cx='94.2' cy='31.1' r='0.6' fill='%23000000' opacity='0.13'/%3E%3Ccircle cx='28.5' cy='57.2' r='0.6' fill='%23000000' opacity='0.12'/%3E%3Ccircle cx='47.3' cy='10.1' r='0.6' fill='%23000000' opacity='0.14'/%3E%3Ccircle cx='91.6' cy='90.2' r='0.6' fill='%23ffffff' opacity='0.19'/%3E%3Ccircle cx='43.4' cy='27.3' r='0.6' fill='%23ffffff' opacity='0.17'/%3E%3Ccircle cx='36.1' cy='25.5' r='0.9' fill='%23000000' opacity='0.12'/%3E%3Ccircle cx='33.2' cy='74' r='0.6' fill='%23ffffff' opacity='0.18'/%3E%3Ccircle cx='71.9' cy='24.9' r='0.6' fill='%23000000' opacity='0.13'/%3E%3Ccircle cx='74.8' cy='37.8' r='0.9' fill='%23000000' opacity='0.13'/%3E%3Ccircle cx='27.4' cy='90.9' r='0.9' fill='%23ffffff' opacity='0.15'/%3E%3Ccircle cx='22.5' cy='58.4' r='0.6' fill='%23ffffff' opacity='0.13'/%3E%3Ccircle cx='71.6' cy='55.5' r='0.9' fill='%23ffffff' opacity='0.13'/%3E%3Ccircle cx='82.4' cy='49.2' r='0.9' fill='%23000000' opacity='0.08'/%3E%3Ccircle cx='3.3' cy='36.1' r='0.6' fill='%23000000' opacity='0.14'/%3E%3Ccircle cx='34.8' cy='86.9' r='0.6' fill='%23ffffff' opacity='0.15'/%3E%3Ccircle cx='6.6' cy='57.3' r='0.6' fill='%23000000' opacity='0.11'/%3E%3Ccircle cx='22.9' cy='66.4' r='0.6' fill='%23ffffff' opacity='0.13'/%3E%3Ccircle cx='72.7' cy='40.2' r='0.9' fill='%23000000' opacity='0.11'/%3E%3Ccircle cx='8.4' cy='23.5' r='0.6' fill='%23ffffff' opacity='0.19'/%3E%3Ccircle cx='89.4' cy='57.5' r='0.6' fill='%23ffffff' opacity='0.17'/%3E%3Ccircle cx='93.8' cy='23.8' r='0.6' fill='%23ffffff' opacity='0.19'/%3E%3Ccircle cx='96.1' cy='56.2' r='0.6' fill='%23000000' opacity='0.11'/%3E%3C/svg%3E")`

export const FLORAL_PATTERN = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='44' height='44' viewBox='0 0 44 44'%3E%3Cg fill='%23000000' fill-opacity='0.12'%3E%3Ccircle cx='22' cy='16' r='3.5'/%3E%3Ccircle cx='22' cy='28' r='3.5'/%3E%3Ccircle cx='16' cy='22' r='3.5'/%3E%3Ccircle cx='28' cy='22' r='3.5'/%3E%3Ccircle cx='22' cy='22' r='2' fill='%23000000' fill-opacity='0.22'/%3E%3Ccircle cx='0' cy='0' r='1.5'/%3E%3Ccircle cx='44' cy='0' r='1.5'/%3E%3Ccircle cx='0' cy='44' r='1.5'/%3E%3Ccircle cx='44' cy='44' r='1.5'/%3E%3C/g%3E%3C/svg%3E")`

export function getTextureBackgroundImage(id) {
  switch (id) {
    case 'kraft': return KRAFT_TEXTURE
    case 'crumpled': return CRUMPLED_TEXTURE
    case 'watercolor': return WATERCOLOR_TEXTURE
    case 'noise': return NOISE_TEXTURE
    case 'checkerboard': return 'repeating-conic-gradient(rgba(0, 0, 0, 0.12) 0% 25%, transparent 0% 50%)'
    case 'grid': return 'linear-gradient(to right, rgba(0, 0, 0, 0.09) 1px, transparent 1px), linear-gradient(to bottom, rgba(0, 0, 0, 0.09) 1px, transparent 1px)'
    case 'polka': return 'radial-gradient(circle, rgba(0, 0, 0, 0.14) 2px, transparent 2.5px)'
    case 'gingham': return 'linear-gradient(90deg, rgba(0, 0, 0, 0.08) 50%, transparent 50%), linear-gradient(rgba(0, 0, 0, 0.08) 50%, transparent 50%)'
    case 'floral': return FLORAL_PATTERN
    case 'stripes': return 'repeating-linear-gradient(45deg, rgba(0, 0, 0, 0.08), rgba(0, 0, 0, 0.08) 8px, transparent 8px, transparent 16px)'
    default: return 'none'
  }
}

export function getTextureBackgroundSize(id, scale = 1) {
  const s = Math.max(0.4, Math.min(3.5, scale || 1))
  switch (id) {
    case 'kraft': return `${Math.round(160 * s)}px ${Math.round(160 * s)}px`
    case 'crumpled': return `${Math.round(200 * s)}px ${Math.round(200 * s)}px`
    case 'watercolor': return `${Math.round(100 * s)}px ${Math.round(100 * s)}px`
    case 'noise': return `${Math.round(100 * s)}px ${Math.round(100 * s)}px`
    case 'checkerboard': return `${Math.round(24 * s)}px ${Math.round(24 * s)}px`
    case 'grid': return `${Math.round(20 * s)}px ${Math.round(20 * s)}px`
    case 'polka': return `${Math.round(18 * s)}px ${Math.round(18 * s)}px`
    case 'gingham': return `${Math.round(28 * s)}px ${Math.round(28 * s)}px`
    case 'floral': return `${Math.round(44 * s)}px ${Math.round(44 * s)}px`
    case 'stripes': return `${Math.round(24 * s)}px ${Math.round(24 * s)}px`
    default: return 'auto'
  }
}
