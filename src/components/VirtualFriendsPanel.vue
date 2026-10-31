<script setup>
import { ref, computed } from 'vue'
import { useRoom } from '../composables/useRoom.js'
import { useVideoCall } from '../composables/useVideoCall.js'
import { useBehindLayer } from '../composables/useBehindLayer.js'
import { getUid } from '../composables/useAuth.js'
import { profileOf } from '../profiles.js'
import { getDeviceType } from '../guest.js'
import AppIcon from './AppIcon.vue'

// HOST ONLY: choose who stands with the host on their camera, and the LINE-UP: everyone,
// the host included, from left to right on the host's screen (top of the list = far left).
// Added people go left / right of the host in turn; the arrows then move anyone anywhere.
// See useBehindLayer.js.
// Usage: <VirtualFriendsPanel :disabled="countdown > 0" @close="..." />

defineProps({
  disabled: { type: Boolean, default: false }, // e.g. while the 3-2-1 countdown runs
})
defineEmits(['close'])

const uid = getUid()

// Cutting people out is heavy work, and some phones' and tablets' graphics do not handle it well,
// so a host on a phone or tablet is told it works best from a computer
const onComputer = getDeviceType() === 'Computer'
const { activeMembers } = useRoom()
const { getRemoteUser } = useVideoCall()
const { lineup, alignMode, setAlignMode, behindLayerLoading, addToLineup, removeFromLineup, moveInLineup } = useBehindLayer()

// How people are placed on my camera (see ALIGNMENT MODES in useBehindLayer.js). Manual comes later.
const ALIGN_MODES = [
  { id: 'auto', label: 'Auto', hint: 'Everyone is sized to you and lined up beside you.' },
  { id: 'free', label: 'Free', hint: 'Everyone shows up where they stand in their own camera. Move closer to look bigger, or to the side to stand at the side.' },
  { id: 'manual', label: 'Manual', hint: '', soon: true },
]
const alignHint = computed(() => ALIGN_MODES.find((mode) => mode.id === alignMode.value).hint)

// Everyone in the room except me
const others = computed(() => activeMembers.value.filter((member) => member.id !== uid))

// The line-up as member documents (me included), then everyone not in it
const inLineup = computed(() => {
  return lineup.value.map((id) => activeMembers.value.find((member) => member.id === id)).filter((member) => member)
})
const notInLineup = computed(() => others.value.filter((member) => !lineup.value.includes(member.id)))

// The row just moved with an arrow: drawn above the row it swaps with while they slide past each other
const lastMoved = ref('')
let lastMovedTimer = null

function move(index, direction, id) {
  lastMoved.value = id
  clearTimeout(lastMovedTimer)
  lastMovedTimer = setTimeout(() => {
    lastMoved.value = ''
  }, 400)
  moveInLineup(index, direction)
}

function hasVideo(id) {
  if (id === uid) return true
  const remote = getRemoteUser(id)
  return remote !== undefined && remote.hasVideo
}
</script>

<template>
  <div class="friends-panel" :class="{ disabled: disabled }">
    <div class="panel-head">
      <span class="panel-title">Virtual Friends</span>
      <!-- Only the host has this list; everyone else sees it is host only, and when it is on -->
      <span class="host-only-tag" title="Only you (the host) can change this. Everyone else sees when it is on.">
        <AppIcon name="lock" :size="12" /> Host only
      </span>
      <span v-if="behindLayerLoading" class="panel-loading">Loading...</span>
      <button class="icon-btn" aria-label="Close" @click="$emit('close')">
        <AppIcon name="close" :size="16" />
      </button>
    </div>

    <p v-if="!onComputer" class="panel-device-note">
      <AppIcon name="laptop" :size="14" />
      <span>Virtual Friends works best when the host is on a computer or laptop.</span>
    </p>

    <!-- How people are placed: Auto / Free / Manual (coming soon) -->
    <div class="align-modes" role="group" aria-label="Alignment">
      <button
        v-for="mode in ALIGN_MODES"
        :key="mode.id"
        :class="{ active: alignMode === mode.id }"
        :aria-pressed="alignMode === mode.id"
        :disabled="disabled || mode.soon"
        :title="mode.soon ? 'Coming soon' : mode.hint"
        @click="setAlignMode(mode.id)"
      >
        {{ mode.label }}<span v-if="mode.soon" class="soon">Soon</span>
      </button>
    </div>
    <p class="panel-hint">{{ alignHint }}</p>

    <p v-if="others.length === 0" class="panel-empty">Nobody else is in the room yet.</p>
    <p v-else-if="inLineup.length > 0" class="panel-hint">Left to right on your screen</p>

    <!-- TransitionGroup: when the order changes, the rows slide to their new places (see .lineup-move) -->
    <TransitionGroup tag="ul" name="lineup" class="friends-list">
      <!-- The line-up, left to right: arrows to move anyone (me too), a tick to remove others -->
      <li
        v-for="(member, index) in inLineup"
        :key="member.id"
        class="person chosen"
        :class="{ me: member.id === uid, lifted: lastMoved === member.id }"
      >
        <span class="spot-number">{{ index + 1 }}</span>
        <img :src="profileOf(member.id).avatar" class="avatar" alt="" />
        <span class="person-text">
          <span class="person-name">{{ member.name }}<template v-if="member.id === uid"> (you)</template></span>
          <span v-if="!hasVideo(member.id)" class="person-note">camera off</span>
        </span>
        <button
          class="icon-btn"
          :aria-label="'Move ' + member.name + ' left'"
          :disabled="disabled || index === 0"
          @click="move(index, -1, member.id)"
        >
          <AppIcon name="chevron" :size="16" class="flip" />
        </button>
        <button
          class="icon-btn"
          :aria-label="'Move ' + member.name + ' right'"
          :disabled="disabled || index === inLineup.length - 1"
          @click="move(index, 1, member.id)"
        >
          <AppIcon name="chevron" :size="16" />
        </button>
        <span class="end-slot">
          <button
            v-if="member.id !== uid"
            class="tick on"
            :aria-label="'Remove ' + member.name"
            :disabled="disabled"
            @click="removeFromLineup(member.id)"
          >
            <AppIcon name="check" :size="14" :stroke-width="3" />
          </button>
          <!-- I cannot be removed, so a "Host" label instead of a tick -->
          <span v-else class="host-badge">Host</span>
        </span>
      </li>

      <!-- Not in the line-up: an empty tick to add them (left or right of me, taking turns) -->
      <li v-for="member in notInLineup" :key="member.id" class="person">
        <span class="spot-number"></span>
        <img :src="profileOf(member.id).avatar" class="avatar" alt="" />
        <span class="person-text">
          <span class="person-name">{{ member.name }}</span>
          <span v-if="!hasVideo(member.id)" class="person-note">camera off</span>
        </span>
        <span class="end-slot">
          <button class="tick" :aria-label="'Add ' + member.name" :disabled="disabled" @click="addToLineup(member.id)"></button>
        </span>
      </li>
    </TransitionGroup>
  </div>
</template>

<style scoped>
/* A dark see-through card floating on the camera, like the other camera buttons */
.friends-panel {
  display: flex;
  flex-direction: column;
  width: 290px;
  max-width: calc(100% - 24px);
  padding: 10px;
  border-radius: 16px;
  color: #ffffff;
  background: rgba(14, 16, 32, 0.72);
  backdrop-filter: blur(10px);
  box-shadow: 0 8px 24px rgba(14, 16, 32, 0.35);
}

/* During the countdown the order cannot change */
.friends-panel.disabled .friends-list {
  opacity: 0.6;
}

.panel-head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 0 8px 4px;
}

.panel-title {
  flex: 1;
  font-size: 0.85rem;
  font-weight: 700;
}

.host-only-tag {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 2px 6px;
  border-radius: 999px;
  font-size: 0.68rem;
  font-weight: 700;
  color: rgba(255, 255, 255, 0.85);
  background: rgba(255, 255, 255, 0.16);
}

.panel-loading {
  font-size: 0.75rem;
  color: rgba(255, 255, 255, 0.65);
}

.panel-empty {
  margin: 0;
  padding: 4px;
  font-size: 0.8rem;
  color: rgba(255, 255, 255, 0.65);
}

.panel-device-note {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  margin: 0 0 8px;
  padding: 6px 8px;
  border-radius: 10px;
  font-size: 0.75rem;
  line-height: 1.35;
  color: #FFE7A8;
  background: rgba(232, 169, 40, 0.18);
}

.panel-device-note :deep(svg) {
  margin-top: 1px;
}

.align-modes {
  display: flex;
  gap: 2px;
  margin-bottom: 6px;
  padding: 3px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.1);
}

.align-modes button {
  flex: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  height: 28px;
  padding: 0 8px;
  border: 0;
  border-radius: 999px;
  color: rgba(255, 255, 255, 0.85);
  background: transparent;
  font-size: 0.78rem;
  font-weight: 600;
  transition: background-color 150ms ease, color 150ms ease;
}

.align-modes button.active {
  color: #0E1020;
  background: #ffffff;
}

.align-modes button:disabled {
  opacity: 0.5;
}

.align-modes .soon {
  padding: 0 5px;
  border-radius: 999px;
  font-size: 0.6rem;
  font-weight: 700;
  text-transform: uppercase;
  background: rgba(255, 255, 255, 0.18);
}

.panel-hint {
  margin: 0 0 6px;
  padding: 0 4px;
  font-size: 0.72rem;
  color: rgba(255, 255, 255, 0.65);
}

/* My own row stands out a little */
.person.me {
  background: rgba(47, 91, 234, 0.35);
}

/* The place in the line-up: 1 = far left */
.spot-number {
  flex: 0 0 14px;
  font-size: 0.75rem;
  font-weight: 700;
  text-align: center;
  color: rgba(255, 255, 255, 0.75);
}

/* The last thing in every row (a tick, or "Host"): the same width in every row, so the arrows line up */
.end-slot {
  flex: 0 0 42px;
  display: flex;
  justify-content: center;
}

.host-badge {
  padding: 2px 7px;
  border-radius: 999px;
  font-size: 0.68rem;
  font-weight: 700;
  letter-spacing: 0.02em;
  color: #ffffff;
  background: var(--brand);
}

/* ---------- Order changes ----------
   Vue's TransitionGroup adds these classes. "move": a row sliding to its new place.
   "enter" / "leave": a row added to / removed from the line-up fades in / out. */
.lineup-move {
  transition: transform 280ms var(--ease-out);
}

.lineup-enter-active,
.lineup-leave-active {
  transition: opacity 180ms ease, transform 180ms ease;
}

.lineup-enter-from,
.lineup-leave-to {
  opacity: 0;
  transform: translateX(-10px);
}

/* The row just moved slides over the top of the row it swaps with, a little lifted */
.person.lifted {
  position: relative;
  z-index: 1;
  background: rgba(70, 80, 120, 0.95);
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.35);
}

.person.me.lifted {
  background: rgba(47, 91, 234, 0.95);
}

/* The list scrolls if there are many people */
.friends-list {
  min-height: 0; /* lets the list be shorter than its content (and scroll) inside the card */
  margin: 0;
  padding: 0;
  list-style: none;
  overflow-y: auto;
}

.person {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 4px;
  border-radius: 10px;
}

.person.chosen {
  background: rgba(255, 255, 255, 0.08);
}

.person + .person {
  margin-top: 4px;
}

/* A round tick box: empty = not chosen, filled blue with a tick = chosen */
.tick {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  padding: 0;
  border: 2px solid rgba(255, 255, 255, 0.6);
  border-radius: 50%;
  color: #ffffff;
  background: transparent;
}

.tick.on {
  border-color: var(--brand);
  background: var(--brand);
}

.avatar {
  flex: 0 0 auto;
  width: 30px;
  height: 30px;
  border-radius: 50%;
  object-fit: cover;
  background: rgba(255, 255, 255, 0.15);
}

/* min-width: 0 lets long names shorten with "..." instead of pushing the arrows out */
.person-text {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.person-name {
  overflow: hidden;
  font-size: 0.85rem;
  font-weight: 600;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.person-note {
  font-size: 0.72rem;
  color: rgba(255, 255, 255, 0.65);
}

.icon-btn {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: 0;
  border-radius: 50%;
  color: #ffffff;
  background: rgba(255, 255, 255, 0.1);
}

.icon-btn:disabled,
.tick:disabled {
  opacity: 0.35;
}

/* The chevron icon points down; flipped, it points up */
.flip {
  transform: rotate(180deg);
}

@media (hover: hover) and (pointer: fine) {
  .icon-btn:not(:disabled):hover {
    background: rgba(255, 255, 255, 0.22);
  }

  .tick:not(:disabled):not(.on):hover {
    border-color: #ffffff;
  }
}

@media (prefers-reduced-motion: reduce) {
  .lineup-move,
  .lineup-enter-active,
  .lineup-leave-active {
    transition: none;
  }
}
</style>
