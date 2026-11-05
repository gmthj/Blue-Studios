<script setup>
import { useFrameEditorContext } from "../../composables/useFrameEditor.js"

const editor = useFrameEditorContext()
const {
  activeTool,
  isDrawerOpen,
  toggleDrawer,
  userUploads,
  isPropsSheetOpen,
  togglePropsSheet,
  selectedElementIds
} = editor

// The tools, the same tiles as the Sticker Maker's rail. Layers are in the right panel now
// (like the Sticker Maker), so they are not a tool here.
const TOOLS = [
  { id: 'templates', label: 'Templates', icon: 'M3 3h18v18H3z M3 9h18 M9 21V9' },
  { id: 'elements', label: 'Elements', icon: 'M4 4h11l5 5v11H4z M15 4v5h5 M8 15c1.4-1.6 3-1.6 4.4 0' }, // the Sticker Maker's sticker icon
  { id: 'text', label: 'Text', icon: 'M4 7V4h16v3 M9 20h6 M12 4v16' },
  { id: 'uploads', label: 'Uploads', icon: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4 M17 8l-5-5-5 5 M12 3v12' },
  // "Colour": the strip's background (a colour, a gradient or a texture). Shorter than "Background".
  { id: 'background', label: 'Colour', icon: 'M12 3a9 9 0 1 0 0 18c1.1 0 1.6-.8 1.6-1.6 0-.9-.6-1.4-.6-2.2 0-.9.7-1.6 1.6-1.6H17a4 4 0 0 0 4-4C21 6.6 17 3 12 3z M7.5 11h.01 M10 7.5h.01 M14.5 7.5h.01' }
]
const SLIDERS_ICON = 'M4 21v-7 M4 10V3 M12 21v-9 M12 8V3 M20 21v-5 M20 12V3 M1 14h6 M9 8h6 M17 16h6'
</script>

<template>
  <!-- Tool rail: each tool is a small tile, the open one is tinted blue. Clicking the open tool
       again folds its panel away. On a phone this is the bar along the bottom of the screen. -->
  <nav class="left-rail te-rail te-card" aria-label="Tools">
    <button
      v-for="tool in TOOLS"
      :key="tool.id"
      type="button"
      class="te-rail-btn"
      :class="{ active: activeTool === tool.id && isDrawerOpen }"
      :title="activeTool === tool.id && isDrawerOpen ? 'Hide this panel' : tool.label"
      :aria-pressed="activeTool === tool.id && isDrawerOpen"
      @click="toggleDrawer(tool.id)"
    >
      <span class="te-rail-tile">
        <svg viewBox="0 0 24 24" class="te-icon" aria-hidden="true"><path :d="tool.icon" /></svg>
        <span v-if="tool.id === 'uploads' && userUploads.length > 0" class="te-rail-count">{{ userUploads.length }}</span>
      </span>
      <span>{{ tool.label }}</span>
    </button>

    <!-- Only on phones: opens the properties sheet, with the layers list -->
    <button
      type="button"
      class="te-rail-btn te-mobile-only"
      :class="{ active: isPropsSheetOpen, 'has-dot': selectedElementIds.length > 0 && !isPropsSheetOpen }"
      :aria-pressed="isPropsSheetOpen"
      @click="togglePropsSheet"
    >
      <span class="te-rail-tile">
        <svg viewBox="0 0 24 24" class="te-icon" aria-hidden="true"><path :d="SLIDERS_ICON" /></svg>
      </span>
      <span>Edit</span>
    </button>
  </nav>
</template>
