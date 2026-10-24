import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'

import { LAYOUTS, FRAME_STYLES, FILTERS, STICKERS, filterCss } from '../src/stripData.js'
import { ITEM_TYPES, CATEGORIES, MAX_CATEGORIES, categoryLabel } from '../src/studio.js'
import { embedProjectInPngBytes } from '../src/utils/savedFrameEngine.js'

import AppIcon from '../src/components/AppIcon.vue'
import StageBar from '../src/components/StageBar.vue'
import MarketplaceCard from '../src/components/MarketplaceCard.vue'
import ItemDetailsForm from '../src/components/ItemDetailsForm.vue'

// ============================================================================
// PART 1: Photostrip Layout & Filter Engine (8 Tests)
// ============================================================================
describe('Photostrip layout and filter engine (stripData.js)', () => {
  // 1. Core layouts preset definition
  it('defines the standard photostrip layouts with positive aspect ratios', () => {
    expect(LAYOUTS.length).toBeGreaterThanOrEqual(4)
    const retro = LAYOUTS.find((l) => l.id === 'retro-4-cut')
    expect(retro).toBeDefined()
    expect(retro.aspect).toBeCloseTo(0.3)
    expect(retro.slots).toHaveLength(4)
  })

  // 2. Slot bounds validation
  it('ensures all layout slots use percentage coordinates bounded between 0 and 100', () => {
    LAYOUTS.forEach((layout) => {
      layout.slots.forEach((slot) => {
        expect(slot.x).toBeGreaterThanOrEqual(0)
        expect(slot.y).toBeGreaterThanOrEqual(0)
        expect(slot.x + slot.w).toBeLessThanOrEqual(100)
        expect(slot.y + slot.h).toBeLessThanOrEqual(100)
      })
    })
  })

  // 3. Frame styles presets
  it('defines built-in default frame styles with valid colors and shapes', () => {
    expect(FRAME_STYLES.length).toBeGreaterThanOrEqual(5)
    const cream = FRAME_STYLES.find((s) => s.id === 'cream')
    expect(cream.background).toBe('#FFF8EE')
    expect(cream.border).toBe('#2F5BEA')
    expect(['square', 'rounded', 'circle']).toContain(cream.shape)
  })

  // 4. Filter presets
  it('defines the standard photobooth filters with matching CSS strings', () => {
    const original = FILTERS.find((f) => f.id === 'original')
    const bw = FILTERS.find((f) => f.id === 'bw')
    expect(original.css).toBe('')
    expect(bw.css).toBe('grayscale(1)')
  })

  // 5. filterCss empty/null handling
  it('returns an empty string when filter edit data is null or undefined', () => {
    expect(filterCss(null)).toBe('')
    expect(filterCss(undefined)).toBe('')
  })

  // 6. filterCss preset without sliders
  it('builds CSS filter string with default 1.0 multipliers when sliders are at zero', () => {
    const css = filterCss({ filter: 'bw', brightness: 0, contrast: 0, saturation: 0 })
    expect(css).toBe('grayscale(1) brightness(1) contrast(1) saturate(1)')
  })

  // 7. filterCss slider calculations
  it('calculates brightness, contrast, and saturation percentage adjustments correctly', () => {
    const css = filterCss({ filter: 'vintage', brightness: 20, contrast: -10, saturation: 50 })
    expect(css).toContain('sepia(0.6) contrast(1.1)')
    expect(css).toContain('brightness(1.2)')
    expect(css).toContain('contrast(0.9)')
    expect(css).toContain('saturate(1.5)')
  })

  // 8. Sticker badges data URI generation
  it('generates valid SVG data URIs for sticker badges in the tray', () => {
    expect(STICKERS.length).toBeGreaterThanOrEqual(5)
    STICKERS.forEach((sticker) => {
      expect(sticker.src.startsWith('data:image/svg+xml')).toBe(true)
      expect(sticker.id).toBeTruthy()
    })
  })
})

// ============================================================================
// PART 2: Studio & Marketplace Metadata (7 Tests)
// ============================================================================
describe('Studio and Marketplace metadata (studio.js)', () => {
  // 9. Item types
  it('defines the 3 core studio item types', () => {
    expect(ITEM_TYPES).toEqual(['templates', 'stickers', 'strips'])
  })

  // 10. Marketplace categories
  it('defines standard marketplace categories with unique IDs', () => {
    const ids = CATEGORIES.map((c) => c.id)
    const uniqueIds = new Set(ids)
    expect(ids.length).toBe(uniqueIds.size)
    expect(ids).toContain('birthday')
    expect(ids).toContain('cute')
    expect(ids).toContain('minimal')
  })

  // 11. Max categories rule
  it('enforces a maximum of 3 categories per item', () => {
    expect(MAX_CATEGORIES).toBe(3)
  })

  // 12. Category label lookup
  it('returns human-readable label for a recognized category ID', () => {
    expect(categoryLabel('cute')).toBe('Cute')
    expect(categoryLabel('birthday')).toBe('Birthday')
    expect(categoryLabel('friends')).toBe('Friends')
  })

  // 13. Category label fallback
  it('returns the raw ID as fallback when looking up an unknown category', () => {
    expect(categoryLabel('custom-tag')).toBe('custom-tag')
    expect(categoryLabel('unknown_category')).toBe('unknown_category')
  })

  // 14. Category validation rejection of empty lists
  it('ensures each category object has non-empty label and id strings', () => {
    CATEGORIES.forEach((cat) => {
      expect(typeof cat.id).toBe('string')
      expect(cat.id.trim().length).toBeGreaterThan(0)
      expect(typeof cat.label).toBe('string')
      expect(cat.label.trim().length).toBeGreaterThan(0)
    })
  })

  // 15. Other category availability
  it('includes the "other" category fallback for miscellaneous designs', () => {
    const other = CATEGORIES.find((c) => c.id === 'other')
    expect(other).toBeDefined()
    expect(other.label).toBe('Other')
  })
})

// ============================================================================
// PART 3: Saved Frame PNG Project Embedding Engine (5 Tests)
// ============================================================================
describe('Saved Frame PNG project data engine (savedFrameEngine.js)', () => {
  // Minimal valid 1x1 PNG binary buffer for testing chunk insertion
  const minimalPng = new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, // PNG Signature
    0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52, // IHDR header
    0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
    0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89,
    0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, // IEND trailer
    0xae, 0x42, 0x60, 0x82
  ])

  // 16. Embed project chunk
  it('embeds project metadata into PNG bytes and expands byte length', () => {
    const projectData = { name: 'Haru Soft Cloud', slotCount: 4, shape: 'square' }
    const embedded = embedProjectInPngBytes(minimalPng, projectData)
    expect(embedded).toBeInstanceOf(Uint8Array)
    expect(embedded.length).toBeGreaterThan(minimalPng.length)
  })

  // 17. Keyword preservation
  it('contains the "BlueStudiosProject" tEXt chunk keyword inside the generated bytes', () => {
    const projectData = { version: 1, template: 'retro-4-cut' }
    const embedded = embedProjectInPngBytes(minimalPng, projectData)
    const text = new TextDecoder().decode(embedded)
    expect(text).toContain('BlueStudiosProject')
    expect(text).toContain('tEXt')
  })

  // 18. PNG header integrity
  it('preserves standard 8-byte PNG file signature at the beginning of the stream', () => {
    const projectData = { author: 'Joash' }
    const embedded = embedProjectInPngBytes(minimalPng, projectData)
    const expectedSig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
    for (let i = 0; i < 8; i++) {
      expect(embedded[i]).toBe(expectedSig[i])
    }
  })

  // 19. Nested JSON data serialization
  it('accurately encodes complex nested canvas elements and custom guides', () => {
    const complexProject = {
      canvasElements: [
        { id: 'el-1', type: 'sticker', x: 20, y: 40, w: 80, h: 80, rotate: 15 },
        { id: 'el-2', type: 'text', text: 'Besties', color: '#FF4488' }
      ],
      customGuides: [100, 200, 300]
    }
    const embedded = embedProjectInPngBytes(minimalPng, complexProject)
    expect(embedded.length).toBeGreaterThan(minimalPng.length + 100)
  })

  // 20. End chunk integrity
  it('ends with standard PNG IEND marker chunk', () => {
    const embedded = embedProjectInPngBytes(minimalPng, { test: true })
    const len = embedded.length
    const trailer = [embedded[len - 4], embedded[len - 3], embedded[len - 2], embedded[len - 1]]
    expect(trailer).toEqual([0xae, 0x42, 0x60, 0x82])
  })
})

// ============================================================================
// PART 4: Critical UI Components Unit & Interaction Tests (10 Tests)
// ============================================================================
describe('Critical UI components (AppIcon, StageBar, MarketplaceCard, ItemDetailsForm)', () => {
  // 21. AppIcon SVG default rendering
  it('renders an SVG with default size of 16 and stroke-width of 2', () => {
    const wrapper = mount(AppIcon, { props: { name: 'save' } })
    const svg = wrapper.find('svg')
    expect(svg.exists()).toBe(true)
    expect(svg.attributes('width')).toBe('16')
    expect(svg.attributes('height')).toBe('16')
    expect(svg.attributes('stroke-width')).toBe('2')
  })

  // 22. AppIcon custom props
  it('applies custom size, stroke-width, and color properties to SVG', () => {
    const wrapper = mount(AppIcon, {
      props: { name: 'folder', size: 28, strokeWidth: 3, color: '#2F5BEA' }
    })
    const svg = wrapper.find('svg')
    expect(svg.attributes('width')).toBe('28')
    expect(svg.attributes('height')).toBe('28')
    expect(svg.attributes('stroke-width')).toBe('3')
    expect(svg.attributes('stroke')).toBe('#2F5BEA')
  })

  // 23. AppIcon path mapping
  it('injects matching path elements for known icons (e.g. trash and eye)', () => {
    const trashWrapper = mount(AppIcon, { props: { name: 'trash' } })
    expect(trashWrapper.html()).toContain('polyline')

    const eyeWrapper = mount(AppIcon, { props: { name: 'eye' } })
    expect(eyeWrapper.html()).toContain('circle')
  })

  // 24. StageBar step pills rendering
  it('renders all 7 photostrip workflow steps in order', () => {
    const wrapper = mount(StageBar, {
      props: { current: 'pick' },
      global: {
        provide: {
          // Provide room stub if useRoom is invoked
        }
      }
    })
    const steps = wrapper.findAll('.step-pill')
    expect(steps).toHaveLength(7)
    expect(steps[0].text()).toContain('1 Lobby')
    expect(steps[1].text()).toContain('2 Shoot')
    expect(steps[2].text()).toContain('3 Pick')
    expect(steps[6].text()).toContain('7 Export')
  })

  // 25. StageBar current and completed status
  it('applies the .current class to active step and .done class to completed steps', () => {
    const wrapper = mount(StageBar, { props: { current: 'pick' } })
    const steps = wrapper.findAll('.step-pill')

    // Steps before 'pick' (Lobby index 0, Shoot index 1) are done
    expect(steps[0].classes()).toContain('done')
    expect(steps[1].classes()).toContain('done')

    // Step 'pick' (index 2) is current
    expect(steps[2].classes()).toContain('current')
    expect(steps[2].classes()).not.toContain('done')

    // Steps after 'pick' are neither
    expect(steps[3].classes()).not.toContain('current')
    expect(steps[3].classes()).not.toContain('done')
  })

  // 26. StageBar room badge display
  it('renders the room code badge in the stage header', () => {
    const wrapper = mount(StageBar, { props: { current: 'pick' } })
    const badge = wrapper.find('.room-badge')
    expect(badge.exists()).toBe(true)
  })

  // 27. MarketplaceCard template details display
  it('renders template title, creator name, and slot count', () => {
    const dummyItem = {
      id: 'tpl-123',
      type: 'templates',
      name: 'Haru Soft Cloud',
      ownerName: 'Gabriel',
      slotCount: 4,
      saveCount: 12,
      thumbnailPath: 'templates/user/thumb.png'
    }
    const wrapper = mount(MarketplaceCard, {
      props: { item: dummyItem },
      global: {
        stubs: {
          RouterLink: { template: '<a><slot /></a>' },
          StorageImage: { template: '<div class="storage-stub" />' }
        }
      }
    })
    expect(wrapper.text()).toContain('Haru Soft Cloud')
    expect(wrapper.text()).toContain('by Gabriel')
    expect(wrapper.text()).toContain('4 slots')
    expect(wrapper.text()).toContain('12 saves')
  })

  // 28. MarketplaceCard singular vs plural save counts
  it('formats "1 save" as singular and "X saves" as plural in MarketplaceCard', () => {
    const singleSaveItem = {
      id: 'tpl-1',
      type: 'templates',
      name: 'Solo Frame',
      ownerName: 'Joash',
      slotCount: 2,
      saveCount: 1,
      thumbnailPath: 'thumb.png'
    }
    const wrapper = mount(MarketplaceCard, {
      props: { item: singleSaveItem },
      global: {
        stubs: {
          RouterLink: { template: '<a><slot /></a>' },
          StorageImage: true
        }
      }
    })
    expect(wrapper.text()).toContain('1 save')
    expect(wrapper.text()).not.toContain('1 saves')
  })

  // 29. ItemDetailsForm category toggle interaction
  it('initializes input with item name and toggles category selection on button click', async () => {
    const testItem = { id: 'item-1', name: 'Pastel Dream', categories: ['cute'] }
    const wrapper = mount(ItemDetailsForm, { props: { item: testItem } })

    const nameInput = wrapper.find('input[type="text"]')
    expect(nameInput.element.value).toBe('Pastel Dream')

    // Find category buttons
    const buttons = wrapper.findAll('button[type="button"]')
    const friendsButton = buttons.find((b) => b.text().includes('Friends'))
    expect(friendsButton).toBeDefined()

    // Toggle 'Friends' category on
    await friendsButton.trigger('click')
    expect(friendsButton.classes()).toContain('active') // picked categories are chips with the 'active' class
  })

  // 30. ItemDetailsForm cancel event emission
  it('emits "cancel" event when cancel button is clicked', async () => {
    const testItem = { id: 'item-1', name: 'Pastel Dream', categories: ['cute'] }
    const wrapper = mount(ItemDetailsForm, { props: { item: testItem } })

    const cancelButton = wrapper.findAll('button').find((b) => b.text().includes('Cancel'))
    expect(cancelButton).toBeDefined()
    await cancelButton.trigger('click')

    expect(wrapper.emitted('cancel')).toBeTruthy()
  })
})
