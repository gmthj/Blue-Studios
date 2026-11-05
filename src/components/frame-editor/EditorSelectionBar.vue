<script setup>
import { ref, computed } from "vue"
import { useFrameEditorContext } from "../../composables/useFrameEditor.js"
import AppIcon from "../AppIcon.vue"

// The bar that floats along the top of the canvas while text or an element is selected,
// the same as the Sticker Maker's text bar. It holds the same tools as the old bar under the
// top bar (font, size, bold, italic, underline, strikethrough, capitals, alignment, colour,
// spacing, curve; colours and adjustments for elements). Duplicate, lock and delete are on the
// small bar above the selected element and in the right-click menu.
const editor = useFrameEditorContext()
const {
  activeSelectedElement,
  activeTextElement,
  activeTool,
  activeVectorColorTarget,
  activeVectorElement,
  alignElementCenterH,
  alignElementCenterV,
  debounceTextHistory,
  editingTextId,
  flipElementH,
  flipElementV,
  getActiveFontDisplayName,
  getElementDisplayName,
  getVectorBarTitle,
  getVectorSwatches,
  isDrawerOpen,
  isElementTransformOpen,
  isTextColorPickerOpen,
  isTextCurveOpen,
  isTextSpacingOpen,
  isVectorColorPickerOpen,
  openVectorColorPicker,
  saveHistoryState,
  selectedElementIds,
  setTextAlign,
  setTextColor,
  setVectorColor,
  stepFontSize,
  toggleBold,
  toggleDrawer,
  toggleItalic,
  toggleStrikethrough,
  toggleUnderline,
  toggleUppercase,
  isCaptionSelected,
  captionColor,
  captionText,
  borderColor
} = editor

function setCaptionColor(color) {
  captionColor.value = color
  saveHistoryState()
}

// The Sticker Maker's colours
const COLORS = ['#101828', '#ffffff', '#1d4ed8', '#0ea5e9', '#12b76a', '#f79009', '#f04438', '#7a5af8',
  '#ffb3c6', '#ffd6a5', '#fdffb6', '#caffbf', '#a0c4ff']
const ALIGNS = ['left', 'center', 'right']
const ALIGN_ICONS = {
  left: 'M4 6h16 M4 12h10 M4 18h13',
  center: 'M4 6h16 M7 12h10 M5.5 18h13',
  right: 'M4 6h16 M10 12h10 M7 18h13'
}
const PIPETTE_ICON = 'M19 5a2.1 2.1 0 0 0-3 0l-2 2 3 3 2-2a2.1 2.1 0 0 0 0-3z M14 7l-9 9v3h3l9-9'

// Chrome and Edge on a computer can pick a colour from anywhere on the screen
const canPickFromScreen = typeof window !== 'undefined' && 'EyeDropper' in window
async function pickFromScreen(apply) {
  try {
    const result = await new window.EyeDropper().open()
    apply(result.sRGBHex)
  } catch (error) {
    // cancelled
  }
}

const textEl = computed(() => (selectedElementIds.value.length === 1 ? activeTextElement.value : null))
// One element that is not text (stickers, tape, shapes, uploads)
const otherEl = computed(() => {
  if (selectedElementIds.value.length !== 1 || textEl.value) return null
  return activeSelectedElement.value
})

const isBold = computed(() => textEl.value && (textEl.value.fontWeight === 'bold' || Number(textEl.value.fontWeight) >= 700))

function closePops() {
  isTextColorPickerOpen.value = false
  isTextSpacingOpen.value = false
  isTextCurveOpen.value = false
  isElementTransformOpen.value = false
  isVectorColorPickerOpen.value = false
}

// Only one pop-up at a time. WHY names and not the refs: the template sees the refs'
// values (true / false), not the refs themselves.
const POPS = { color: isTextColorPickerOpen, spacing: isTextSpacingOpen, curve: isTextCurveOpen, adjust: isElementTransformOpen }
function togglePop(name) {
  const open = POPS[name].value
  closePops()
  POPS[name].value = !open
}

// "Aa": the fonts are in the Text tab, the same as the Sticker Maker
function openFonts() {
  closePops()
  if (!(activeTool.value === 'text' && isDrawerOpen.value)) toggleDrawer('text')
}

function cycleAlign() {
  const current = textEl.value.textAlign || 'center'
  setTextAlign(ALIGNS[(ALIGNS.indexOf(current) + 1) % ALIGNS.length])
}

function setSize(event) {
  const size = Math.max(8, Math.min(140, Number(event.target.value) || 22))
  textEl.value.fontSize = size
  debounceTextHistory()
}

// The swatch whose colour pop-up is open (elements can have several colours)
const openSwatch = computed(() => (isVectorColorPickerOpen.value ? activeVectorColorTarget.value : null))
const swatches = computed(() => (activeVectorElement.value ? getVectorSwatches(activeVectorElement.value) : []))
const shownSwatch = computed(() => openSwatch.value && swatches.value.find(swatch => swatch.key === openSwatch.value.key))

const percentFill = (value, min, max) => ((value - min) / (max - min)) * 100 + '%'
const opacityOf = el => (el.opacity !== undefined ? el.opacity : 1)
</script>

<template>
  <!-- ============ TEXT ============ -->
  <div
    v-if="textEl"
    class="te-bar text-spacing-wrapper text-curve-wrapper text-color-wrapper element-transform-wrapper"
    role="toolbar"
    aria-label="Text style"
    @pointerdown.stop
    @mousedown.stop
    @touchstart.stop
    @click.stop
  >
    <div class="te-bar-scroll">
      <button type="button" class="te-bar-btn te-bar-font" :title="'Font: ' + getActiveFontDisplayName()" aria-label="Choose a font" @pointerdown.prevent @click="openFonts">
        <span :style="{ fontFamily: textEl.fontFamily }">Aa</span>
      </button>
      <div class="te-bar-size" title="Text size">
        <button type="button" class="te-bar-btn" aria-label="Smaller" @pointerdown.prevent @click="stepFontSize(-2)">−</button>
        <input type="number" min="8" max="140" :value="textEl.fontSize || 22" aria-label="Text size" @change="setSize" />
        <button type="button" class="te-bar-btn" aria-label="Bigger" @pointerdown.prevent @click="stepFontSize(2)">+</button>
      </div>
      <span class="te-bar-line" aria-hidden="true"></span>
      <button type="button" class="te-bar-btn te-bar-letter" :class="{ active: isBold }" :aria-pressed="!!isBold" aria-label="Bold" title="Bold (Ctrl+B)" @pointerdown.prevent @click="toggleBold"><b>B</b></button>
      <button type="button" class="te-bar-btn te-bar-letter" :class="{ active: textEl.fontStyle === 'italic' }" :aria-pressed="textEl.fontStyle === 'italic'" aria-label="Italic" title="Italic (Ctrl+I)" @pointerdown.prevent @click="toggleItalic"><i>I</i></button>
      <button type="button" class="te-bar-btn te-bar-letter" :class="{ active: textEl.textDecoration === 'underline' }" :aria-pressed="textEl.textDecoration === 'underline'" aria-label="Underline" title="Underline (Ctrl+U)" @pointerdown.prevent @click="toggleUnderline"><u>U</u></button>
      <button type="button" class="te-bar-btn te-bar-letter" :class="{ active: textEl.textDecoration === 'line-through' }" :aria-pressed="textEl.textDecoration === 'line-through'" aria-label="Strikethrough" title="Strikethrough" @pointerdown.prevent @click="toggleStrikethrough"><s>S</s></button>
      <button type="button" class="te-bar-btn te-bar-letter te-bar-caps" :class="{ active: textEl.textTransform === 'uppercase' }" :aria-pressed="textEl.textTransform === 'uppercase'" aria-label="All capitals" title="All capitals" @pointerdown.prevent @click="toggleUppercase">aA</button>
      <button
        type="button"
        class="te-bar-btn"
        :aria-label="'Align: ' + (textEl.textAlign || 'center')"
        :title="'Align ' + (textEl.textAlign || 'center') + ' (tap to change)'"
        @pointerdown.prevent
        @click="cycleAlign"
      >
        <svg viewBox="0 0 24 24" class="te-icon" aria-hidden="true"><path :d="ALIGN_ICONS[textEl.textAlign || 'center']" /></svg>
      </button>
      <span class="te-bar-line" aria-hidden="true"></span>
      <button
        type="button"
        class="te-bar-btn"
        :class="{ active: isTextColorPickerOpen }"
        title="Text colour"
        aria-label="Text colour"
        @pointerdown.prevent
        @click="togglePop('color')"
      >
        <span class="te-swatch" :style="{ background: textEl.color || '#0F172A' }"></span>
      </button>
      <button type="button" class="te-bar-btn" :class="{ active: isTextSpacingOpen }" title="Letter and line spacing" @pointerdown.prevent @click="togglePop('spacing')">Spacing</button>
      <button type="button" class="te-bar-btn" :class="{ active: isTextCurveOpen || textEl.curveAmount }" title="Curve the text into an arch" @pointerdown.prevent @click="togglePop('curve')">
        Curve<template v-if="textEl.curveAmount"> {{ textEl.curveAmount }}%</template>
      </button>
      <button type="button" class="te-bar-btn" :class="{ active: isElementTransformOpen }" title="Opacity and rotation" @pointerdown.prevent @click="togglePop('adjust')">Adjust</button>
      <span class="te-bar-line" aria-hidden="true"></span>
      <button type="button" class="te-bar-btn" title="Centre left to right on the strip" aria-label="Centre left to right" @pointerdown.prevent @click="alignElementCenterH(textEl)">⇄</button>
      <button type="button" class="te-bar-btn" title="Centre top to bottom on the strip" aria-label="Centre top to bottom" @pointerdown.prevent @click="alignElementCenterV(textEl)">⇅</button>
    </div>

    <!-- Pop-ups under the bar -->
    <div v-if="isTextColorPickerOpen" class="te-pop" @pointerdown.stop>
      <p class="te-label">Text colour</p>
      <div class="te-bar-colors flex-wrap p-0">
        <button
          v-for="c in COLORS"
          :key="c"
          type="button"
          class="te-swatch"
          :class="{ active: (textEl.color || '').toLowerCase() === c }"
          :style="{ background: c }"
          :aria-label="'Text colour ' + c"
          @pointerdown.prevent
          @click="setTextColor(c)"
        ></button>
        <label class="te-swatch te-swatch-custom" title="Any colour">
          <input type="color" :value="textEl.color || '#0F172A'" aria-label="Any text colour" @input="setTextColor($event.target.value)" />
        </label>
        <button v-if="canPickFromScreen" type="button" class="te-swatch te-pipette" title="Pick a colour from the screen" aria-label="Pick a colour from the screen" @click="pickFromScreen(setTextColor)">
          <svg viewBox="0 0 24 24" class="te-icon" aria-hidden="true"><path :d="PIPETTE_ICON" /></svg>
        </button>
      </div>
    </div>

    <div v-if="isTextSpacingOpen" class="te-pop" @pointerdown.stop>
      <div>
        <p class="te-label">Letter spacing <span class="te-count">{{ textEl.letterSpacing || 0 }}px</span></p>
        <input v-model.number="textEl.letterSpacing" type="range" class="te-range" min="-10" max="50" step="1" :style="{ '--fill': percentFill(textEl.letterSpacing || 0, -10, 50) }" aria-label="Letter spacing" @input="debounceTextHistory" />
      </div>
      <div>
        <p class="te-label">Line spacing <span class="te-count">{{ textEl.lineHeight || 1.2 }}</span></p>
        <input v-model.number="textEl.lineHeight" type="range" class="te-range" min="0.8" max="2.5" step="0.05" :style="{ '--fill': percentFill(textEl.lineHeight || 1.2, 0.8, 2.5) }" aria-label="Line spacing" @input="debounceTextHistory" />
      </div>
    </div>

    <div v-if="isTextCurveOpen" class="te-pop" @pointerdown.stop>
      <div>
        <p class="te-label">Curve <span class="te-count">{{ textEl.curveAmount ? textEl.curveAmount + '%' : 'Straight' }}</span></p>
        <input v-model.number="textEl.curveAmount" type="range" class="te-range" min="-100" max="100" step="1" :style="{ '--fill': percentFill(textEl.curveAmount || 0, -100, 100) }" aria-label="Curve" @input="debounceTextHistory" />
      </div>
      <button type="button" class="btn btn-sm btn-outline-secondary" :disabled="!textEl.curveAmount" @click="textEl.curveAmount = 0; debounceTextHistory()">Straighten</button>
    </div>

    <div v-if="isElementTransformOpen" class="te-pop" @pointerdown.stop>
      <div>
        <p class="te-label">Opacity <span class="te-count">{{ Math.round(opacityOf(textEl) * 100) }}%</span></p>
        <input v-model.number="textEl.opacity" type="range" class="te-range" min="0.1" max="1" step="0.05" :style="{ '--fill': percentFill(opacityOf(textEl), 0.1, 1) }" aria-label="Opacity" @input="debounceTextHistory" />
      </div>
      <div>
        <p class="te-label">Rotation <span class="te-count">{{ textEl.rotation || 0 }}°</span></p>
        <input v-model.number="textEl.rotation" type="range" class="te-range" min="-180" max="180" step="1" :style="{ '--fill': percentFill(textEl.rotation || 0, -180, 180) }" aria-label="Rotation" @input="debounceTextHistory" />
      </div>
      <button type="button" class="btn btn-sm btn-outline-secondary" :disabled="!textEl.rotation" @click="textEl.rotation = 0; saveHistoryState()">Straighten (0°)</button>
    </div>
  </div>

  <!-- ============ CAPTION (the words at the bottom of the strip) ============
       Typed straight on the strip; its colour is here. pointerdown.prevent keeps the
       typing going while a colour is picked. -->
  <div
    v-else-if="isCaptionSelected"
    class="te-bar"
    role="toolbar"
    aria-label="Caption"
    @pointerdown.stop
    @mousedown.stop
    @touchstart.stop
    @click.stop
  >
    <div class="te-bar-scroll">
      <span class="te-bar-title">Caption</span>
      <span class="te-bar-line" aria-hidden="true"></span>
      <div class="te-bar-colors">
        <button
          v-for="c in COLORS"
          :key="c"
          type="button"
          class="te-swatch"
          :class="{ active: (captionColor || '').toLowerCase() === c }"
          :style="{ background: c }"
          :aria-label="'Caption colour ' + c"
          @pointerdown.prevent
          @click="setCaptionColor(c)"
        ></button>
        <label class="te-swatch te-swatch-custom" title="Any colour">
          <input type="color" :value="captionColor" aria-label="Any caption colour" @input="captionColor = $event.target.value" @change="saveHistoryState" />
        </label>
        <button v-if="canPickFromScreen" type="button" class="te-swatch te-pipette" title="Pick a colour from the screen" aria-label="Pick a colour from the screen" @click="pickFromScreen(setCaptionColor)">
          <svg viewBox="0 0 24 24" class="te-icon" aria-hidden="true"><path :d="PIPETTE_ICON" /></svg>
        </button>
      </div>
      <span class="te-bar-line" aria-hidden="true"></span>
      <button type="button" class="te-bar-btn" title="The same colour as the strip's border" @pointerdown.prevent @click="setCaptionColor(borderColor)">Match border</button>
      <button type="button" class="te-bar-btn" title="Remove the caption" :disabled="!captionText" @pointerdown.prevent @click="captionText = ''; saveHistoryState()">Clear</button>
    </div>
  </div>

  <!-- ============ ONE ELEMENT (sticker, tape, shape, upload) ============ -->
  <div
    v-else-if="otherEl && !editingTextId"
    class="te-bar vector-swatch-wrapper vector-color-popover element-transform-wrapper"
    role="toolbar"
    aria-label="Element"
    @pointerdown.stop
    @mousedown.stop
    @touchstart.stop
    @click.stop
  >
    <div class="te-bar-scroll">
      <span class="te-bar-title">{{ activeVectorElement ? getVectorBarTitle(activeVectorElement) : getElementDisplayName(otherEl) }}</span>
      <template v-if="swatches.length > 0">
        <span class="te-bar-line" aria-hidden="true"></span>
        <div class="te-bar-colors">
          <button
            v-for="swatch in swatches"
            :key="swatch.key"
            type="button"
            class="te-swatch"
            :class="{ active: openSwatch && openSwatch.key === swatch.key }"
            :style="{ background: swatch.current }"
            :title="swatch.label + ': ' + swatch.current"
            :aria-label="'Change ' + swatch.label"
            @click="isElementTransformOpen = false; openVectorColorPicker(swatch, $event)"
          ></button>
        </div>
      </template>
      <span class="te-bar-line" aria-hidden="true"></span>
      <button type="button" class="te-bar-btn" :class="{ active: isElementTransformOpen }" title="Opacity, rotation, flip" @click="togglePop('adjust')">
        <svg viewBox="0 0 24 24" class="te-icon" aria-hidden="true"><path d="M4 21v-7 M4 10V3 M12 21v-9 M12 8V3 M20 21v-5 M20 12V3 M1 14h6 M9 8h6 M17 16h6" /></svg>
        Adjust
      </button>
      <button type="button" class="te-bar-btn" title="Centre left to right on the strip" @click="alignElementCenterH(otherEl)">⇄ Centre</button>
      <button type="button" class="te-bar-btn" title="Centre top to bottom on the strip" @click="alignElementCenterV(otherEl)">⇅ Centre</button>
    </div>

    <div v-if="shownSwatch" class="te-pop" @pointerdown.stop>
      <p class="te-label">{{ shownSwatch.label || 'Colour' }}</p>
      <div class="te-bar-colors flex-wrap p-0">
        <button
          v-for="c in COLORS"
          :key="c"
          type="button"
          class="te-swatch"
          :class="{ active: (shownSwatch.current || '').toLowerCase() === c }"
          :style="{ background: c }"
          :aria-label="'Colour ' + c"
          @click="setVectorColor(shownSwatch, c)"
        ></button>
        <label class="te-swatch te-swatch-custom" title="Any colour">
          <input type="color" :value="shownSwatch.current" aria-label="Any colour" @input="setVectorColor(shownSwatch, $event.target.value)" />
        </label>
        <button v-if="canPickFromScreen" type="button" class="te-swatch te-pipette" title="Pick a colour from the screen" aria-label="Pick a colour from the screen" @click="pickFromScreen(c => setVectorColor(shownSwatch, c))">
          <svg viewBox="0 0 24 24" class="te-icon" aria-hidden="true"><path :d="PIPETTE_ICON" /></svg>
        </button>
      </div>
    </div>

    <div v-if="isElementTransformOpen" class="te-pop" @pointerdown.stop>
      <div>
        <p class="te-label">Opacity <span class="te-count">{{ Math.round(opacityOf(otherEl) * 100) }}%</span></p>
        <input v-model.number="otherEl.opacity" type="range" class="te-range" min="0.1" max="1" step="0.05" :style="{ '--fill': percentFill(opacityOf(otherEl), 0.1, 1) }" aria-label="Opacity" @input="debounceTextHistory" />
      </div>
      <div>
        <p class="te-label">Rotation <span class="te-count">{{ otherEl.rotation || 0 }}°</span></p>
        <input v-model.number="otherEl.rotation" type="range" class="te-range" min="-180" max="180" step="1" :style="{ '--fill': percentFill(otherEl.rotation || 0, -180, 180) }" aria-label="Rotation" @input="debounceTextHistory" />
      </div>
      <div class="te-pop-row">
        <button type="button" class="btn btn-sm" :class="otherEl.flipX ? 'btn-primary' : 'btn-outline-secondary'" @click="flipElementH(otherEl)">⇄ Flip</button>
        <button type="button" class="btn btn-sm" :class="otherEl.flipY ? 'btn-primary' : 'btn-outline-secondary'" @click="flipElementV(otherEl)">⇅ Flip</button>
        <button type="button" class="btn btn-sm btn-outline-secondary" :disabled="!otherEl.rotation" @click="otherEl.rotation = 0; saveHistoryState()">0°</button>
      </div>
      <div v-if="otherEl.type === 'shape'">
        <p class="te-label">Outline <span class="te-count">{{ otherEl.strokeWidth || 2 }}px</span></p>
        <input v-model.number="otherEl.strokeWidth" type="range" class="te-range" min="0" max="12" step="1" :style="{ '--fill': percentFill(otherEl.strokeWidth || 2, 0, 12) }" aria-label="Outline width" @input="debounceTextHistory" />
      </div>
    </div>
  </div>
</template>
