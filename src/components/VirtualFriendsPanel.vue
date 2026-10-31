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

const props = defineProps({
  disabled: { type: Boolean, default: false }, // e.g. while the 3-2-1 countdown runs
})
defineEmits(['close'])

const uid = getUid()

// Cutting people out is heavy work, and some phones' and tablets' graphics do not handle it well,
// so a host on a phone or tablet is told it works best from a computer
const onComputer = getDeviceType() === 'Computer'
const { activeMembers } = useRoom()
const { getRemoteUser } = useVideoCall()
const { lineup, friendsOn, setFriendsOn, alignMode, setAlignMode, resetManualSpots, behindLayerLoading, addToLineup, removeFromLineup, moveInLineup } = useBehindLayer()

// How people are placed on my camera (see ALIGNMENT MODES in useBehindLayer.js). Manual comes later.
const ALIGN_MODES = [
  { id: 'auto', label: 'Auto', hint: 'Everyone is sized to you and lined up beside you.' },
  { id: 'free', label: 'Free', hint: 'Everyone shows up where they stand in their own camera. Move closer to look bigger, or to the side to stand at the side.' },
  { id: 'manual', label: 'Manual', hint: 'Drag people on your camera to move them. Pinch or scroll to resize.' },
]
// Only Auto lines people up in list order. In Free and Manual the order does nothing, so it is hidden.
const showOrder = computed(() => alignMode.value === 'auto')
const alignHint = computed(() => ALIGN_MODES.find((mode) => mode.id === alignMode.value).hint)

// Clicking a row adds the person, or takes them out (not my own row)
function toggle(row) {
  if (props.disabled || row.member.id === uid) return
  if (row.chosen) {
    removeFromLineup(row.member.id)
  } else {
    addToLineup(row.member.id)
  }
}

// Everyone in the room except me
const others = computed(() => activeMembers.value.filter((member) => member.id !== uid))

// The line-up as member documents (me included), then everyone not in it
const inLineup = computed(() => {
  return lineup.value.map((id) => activeMembers.value.find((member) => member.id === id)).filter((member) => member)
})
const notInLineup = computed(() => others.value.filter((member) => !lineup.value.includes(member.id)))

// The rows of the list: { member, chosen, spot }.
// Auto: the line-up in order (spot = its place, 0 = first), then everyone taken out.
// Free / Manual: the order does nothing, so everyone stays in one fixed order (me first, then the room's
// order) and ticking someone on or off does not move their row.
const rows = computed(() => {
  if (showOrder.value) {
    return [
      ...inLineup.value.map((member, index) => ({ member: member, chosen: true, spot: index })),
      ...notInLineup.value.map((member) => ({ member: member, chosen: false, spot: -1 })),
    ]
  }
  const me = activeMembers.value.find((member) => member.id === uid)
  return [me, ...others.value]
    .filter((member) => member)
    .map((member) => ({ member: member, chosen: lineup.value.includes(member.id), spot: -1 }))
})

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
      <span v-if="behindLayerLoading" class="panel-loading">Loading...</span>
      <button class="icon-btn" aria-label="Close" @click="$emit('close')">
        <AppIcon name="close" :size="16" />
      </button>
    </div>

    <!-- On / off, the main control: a big bar that turns blue when on.
         Everyone in the room is added; the rows below take people out. -->
    <button
      class="on-bar"
      :class="{ on: friendsOn }"
      role="switch"
      :aria-checked="friendsOn"
      :disabled="disabled"
      @click="setFriendsOn(!friendsOn)"
    >
      <span class="on-text">
        <span class="on-title">{{ friendsOn ? 'On' : 'Off' }}</span>
        <span class="on-sub">{{ friendsOn ? 'Friends are in your camera' : 'Put friends into your camera' }}</span>
      </span>
      <span class="on-switch"><span class="on-knob"></span></span>
    </button>

    <p v-if="!onComputer" class="panel-device-note">
      <AppIcon name="laptop" :size="14" />
      <span>Virtual Friends works best when the host is on a computer or laptop.</span>
    </p>

    <!-- How people are placed: Auto / Free / Manual -->
    <div class="align-modes" role="group" aria-label="Alignment">
      <button
        v-for="mode in ALIGN_MODES"
        :key="mode.id"
        :class="{ active: alignMode === mode.id }"
        :aria-pressed="alignMode === mode.id"
        :disabled="disabled"
        :title="mode.hint"
        @click="setAlignMode(mode.id)"
      >
        {{ mode.label }}
      </button>
    </div>
    <p class="panel-hint align-hint">
      <span>{{ alignHint }}</span>
      <!-- Manual: put everyone back where Auto would put them -->
      <button v-if="alignMode === 'manual'" class="reset-btn" :disabled="disabled" @click="resetManualSpots">Reset</button>
    </p>


    <p v-if="others.length === 0" class="panel-empty">Nobody else is in the room yet.</p>
    <p v-else-if="inLineup.length > 0 && showOrder" class="panel-hint">Left to right on your screen</p>

    <!-- TransitionGroup: when the order changes, the rows slide to their new places (see .lineup-move) -->
    <TransitionGroup tag="ul" name="lineup" class="friends-list">
      <!-- One row per person. Auto: the line-up left to right (arrows move anyone, me too), then the people
           taken out. A filled tick takes someone out, an empty one adds them back (left or right of me, taking turns). -->
      <!-- The whole row (not just the tick) adds / takes out the person. My own row cannot be clicked. -->
      <li
        v-for="row in rows"
        :key="row.member.id"
        class="person"
        :class="{
          chosen: row.chosen,
          me: row.member.id === uid,
          lifted: lastMoved === row.member.id,
          clickable: row.member.id !== uid && !disabled,
        }"
        :role="row.member.id !== uid ? 'checkbox' : null"
        :aria-checked="row.member.id !== uid ? row.chosen : null"
        :aria-disabled="row.member.id !== uid ? disabled : null"
        :tabindex="row.member.id !== uid && !disabled ? 0 : null"
        @click="toggle(row)"
        @keydown.enter.prevent="toggle(row)"
        @keydown.space.prevent="toggle(row)"
      >
        <span v-if="showOrder" class="spot-number">{{ row.chosen ? row.spot + 1 : '' }}</span>
        <img :src="profileOf(row.member.id).avatar" class="avatar" alt="" />
        <span class="person-text">
          <span class="person-name">{{ row.member.name }}<template v-if="row.member.id === uid"> (you)</template></span>
          <span v-if="!hasVideo(row.member.id)" class="person-note">camera off</span>
        </span>
        <template v-if="showOrder && row.chosen">
          <button
            class="icon-btn"
            :aria-label="'Move ' + row.member.name + ' left'"
            :disabled="disabled || row.spot === 0"
            @click.stop="move(row.spot, -1, row.member.id)"
            @keydown.stop
          >
            <AppIcon name="chevron" :size="16" class="flip" />
          </button>
          <button
            class="icon-btn"
            :aria-label="'Move ' + row.member.name + ' right'"
            :disabled="disabled || row.spot === inLineup.length - 1"
            @click.stop="move(row.spot, 1, row.member.id)"
            @keydown.stop
          >
            <AppIcon name="chevron" :size="16" />
          </button>
        </template>
        <span class="end-slot">
          <!-- I cannot be taken out, so a "Host" label instead of a tick -->
          <span v-if="row.member.id === uid" class="host-badge">Host</span>
          <!-- Just a picture of the tick: the whole row is the button -->
          <span v-else class="tick" :class="{ on: row.chosen, disabled: disabled }" aria-hidden="true">
            <AppIcon v-if="row.chosen" name="check" :size="14" :stroke-width="3" />
          </span>
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

.align-hint {
  display: flex;
  align-items: flex-start;
  gap: 8px;
}

.reset-btn {
  flex: 0 0 auto;
  margin-left: auto;
  padding: 2px 10px;
  border: 0;
  border-radius: 999px;
  color: #ffffff;
  background: rgba(255, 255, 255, 0.16);
  font-size: 0.72rem;
  font-weight: 700;
}

.reset-btn:disabled {
  opacity: 0.5;
}

/* The on / off bar under the header: the main control, so it is big and turns blue when on */
.on-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  margin-bottom: 10px;
  padding: 10px 12px;
  border: 0;
  border-radius: 14px;
  color: #ffffff;
  text-align: left;
  background: rgba(255, 255, 255, 0.12);
  transition: background-color 180ms ease, transform 160ms var(--ease-out, ease-out);
}

.on-bar.on {
  background: var(--brand, #2F5BEA);
}

.on-bar:active:not(:disabled) {
  transform: scale(0.98);
}

.on-bar:disabled {
  opacity: 0.5;
}

.on-text {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
}

.on-title {
  font-size: 0.95rem;
  font-weight: 800;
}

.on-sub {
  font-size: 0.72rem;
  color: rgba(255, 255, 255, 0.75);
}

.on-switch {
  position: relative;
  flex: 0 0 auto;
  width: 44px;
  height: 26px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.3);
  transition: background-color 180ms ease;
}

.on-bar.on .on-switch {
  background: rgba(255, 255, 255, 0.35);
}

.on-knob {
  position: absolute;
  top: 3px;
  left: 3px;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: #ffffff;
  box-shadow: 0 1px 3px rgba(14, 16, 32, 0.35);
  transition: transform 200ms var(--ease-out, ease-out);
}

.on-bar.on .on-knob {
  transform: translateX(18px);
}

@media (hover: hover) and (pointer: fine) {
  .on-bar:not(:disabled):not(.on):hover {
    background: rgba(255, 255, 255, 0.18);
  }
}

@media (prefers-reduced-motion: reduce) {
  .on-bar,
  .on-knob {
    transition: none;
  }
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
.tick.disabled {
  opacity: 0.35;
}

/* A row that can be clicked (everyone but me) */
.person.clickable {
  cursor: pointer;
}

.person:focus-visible {
  outline: 2px solid #ffffff;
  outline-offset: -2px;
}

/* The chevron icon points down; flipped, it points up */
.flip {
  transform: rotate(180deg);
}

@media (hover: hover) and (pointer: fine) {
  .icon-btn:not(:disabled):hover {
    background: rgba(255, 255, 255, 0.22);
  }

  .person.clickable:hover {
    background: rgba(255, 255, 255, 0.12);
  }

  .person.clickable:hover .tick:not(.on) {
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
