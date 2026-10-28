<script setup>
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { updateDoc } from 'firebase/firestore'
import { useRoom, ROOM_STAGES } from '../composables/useRoom.js'
import { useFullscreen } from '../composables/useFullscreen.js'
import { getUid } from '../composables/useAuth.js'
import { askConfirm } from '../composables/useDialog.js'
import { profileOf } from '../profiles.js'
import AppIcon from './AppIcon.vue'

// The bar at the top of the room pages: the room code, the steps, everyone in the room,
// and the room buttons (fullscreen, leave, close room).
// Usage: <StageBar current="pick" />  (current = the stage of this page, see ROOM_STAGES in useRoom.js)
//
// Steps the room has already reached can be clicked to move the WHOLE room there (everyone's page
// follows room.stage). Steps it has not reached yet, and steps whose page is not built yet, cannot.

const props = defineProps({
  current: { type: String, required: true },
})

const router = useRouter()
const uid = getUid()
const { code, room, activeMembers, furthestIndex, goToStage, roomRef, exitRoom } = useRoom()
const { fullscreen, toggleFullscreen } = useFullscreen()

// Position of the current step
const currentIndex = computed(() => ROOM_STAGES.findIndex((stage) => stage.id === props.current))

// Steps already reached (before the current one, or after it if the room came back): shown with a tick
function isDone(index) {
  return index !== currentIndex.value && (index < currentIndex.value || index <= furthestIndex.value)
}

// Can this step be clicked? Reached already, not the one we are on, and its page exists
function canOpen(index) {
  return isDone(index) && ROOM_STAGES[index].hasPage
}

const moving = ref(false) // a click is being saved: ignore more clicks until it is done

async function openStep(stage) {
  if (moving.value) return
  moving.value = true
  try {
    await goToStage(stage.id)
  } catch (error) {
    console.error(error)
  }
  moving.value = false
}

// Up to 4 faces, then "+2"
const MAX_FACES = 4
const shownMembers = computed(() => activeMembers.value.slice(0, MAX_FACES))
const extraMembers = computed(() => Math.max(activeMembers.value.length - MAX_FACES, 0))
const everyone = computed(() => activeMembers.value.map((member) => member.name).join(', '))

// ---------- ROOM BUTTONS ----------
// The host can always close the room. If the host has left, anyone can (so the room is not stuck open).
const canCloseRoom = computed(() => {
  if (!room.value) return false // the room has not loaded yet
  const hostIsHere = activeMembers.value.some((member) => member.id === room.value.hostId)
  return room.value.hostId === uid || !hostIsHere
})

async function leaveRoom() {
  await exitRoom(true) // true: remove me from the members list straight away
  router.push('/')     // RoomLayout.vue then ends the video call (and fullscreen)
}

// Closing the room ends the video call for everyone (saves Agora minutes) and stops new people joining.
// Every device sees closed: true in the room document and goes back to the home page (see RoomLayout.vue).
async function closeRoom() {
  const sure = await askConfirm({
    title: 'Close this room for everyone?',
    message: 'The video call ends and everyone goes back to the home page.',
    confirmLabel: 'Close room',
    danger: true,
    icon: 'lock',
  })
  if (!sure) return
  await updateDoc(roomRef(), { closed: true })
}
</script>

<template>
  <div class="stage-bar">
    <!-- The room code -->
    <div class="room-info">
      <span class="room-badge">Room <strong>{{ code }}</strong></span>
    </div>

    <!-- The steps, joined by a line. Reached steps get a tick (and can be clicked), the current one is filled in.
         On narrow screens only the current step shows its name (the others are just numbers). -->
    <ol class="steps" aria-label="Steps">
      <li
        v-for="(stage, index) in ROOM_STAGES"
        :key="stage.id"
        class="step-pill"
        :class="{ current: index === currentIndex, done: isDone(index) }"
        :aria-current="index === currentIndex ? 'step' : undefined"
      >
        <button
          v-if="canOpen(index)"
          type="button"
          class="step-btn"
          :disabled="moving"
          :title="'Take everyone to ' + stage.label"
          @click="openStep(stage)"
        >
          <span class="step-dot"><AppIcon name="check" :size="12" :stroke-width="3" /></span>
          <span class="step-label">{{ stage.label }}</span>
        </button>
        <span v-else class="step-btn" :title="isDone(index) ? stage.label + ' (coming soon)' : undefined">
          <span class="step-dot">
            <AppIcon v-if="isDone(index)" name="check" :size="12" :stroke-width="3" />
            <template v-else>{{ index + 1 }}</template>
          </span>
          <span class="step-label">{{ stage.label }}</span>
        </span>
      </li>
    </ol>

    <div class="bar-right">
      <!-- Everyone in the room: their profile pictures, overlapping. Hidden on phones to make space
           for the buttons (the video call shows everyone too). -->
      <div class="faces" :title="everyone">
        <img
          v-for="member in shownMembers"
          :key="member.id"
          :src="profileOf(member.id).avatar"
          :alt="member.name"
          class="face"
          width="30"
          height="30"
        />
        <span v-if="extraMembers > 0" class="face face-more">+{{ extraMembers }}</span>
      </div>

      <!-- Room buttons. Just icons on phones, words next to the icons on bigger screens. -->
      <div class="room-actions">
        <button
          type="button"
          class="bar-btn"
          :title="fullscreen ? 'Exit fullscreen' : 'Fullscreen'"
          :aria-label="fullscreen ? 'Exit fullscreen' : 'Fullscreen'"
          :aria-pressed="fullscreen"
          @click="toggleFullscreen"
        >
          <AppIcon :name="fullscreen ? 'minimize' : 'maximize'" :size="16" />
        </button>
        <button type="button" class="bar-btn" title="Leave the room" @click="leaveRoom">
          <AppIcon name="log-out" :size="16" />
          <span class="btn-label">Leave</span>
        </button>
        <!-- Red because it ends the room for everyone -->
        <button
          v-if="canCloseRoom"
          type="button"
          class="bar-btn bar-btn-danger"
          title="Close the room for everyone"
          @click="closeRoom"
        >
          <AppIcon name="power" :size="16" />
          <span class="btn-label">Close room</span>
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Its own colours (the same as the rest of the app), so it looks the same on every room page */
.stage-bar {
  --brand: #2F5BEA;
  --brand-tint: #E8EEFF;
  --ink: #14172B;
  --muted: #6B7080;
  --line: #E3E6EE;
  --danger: #E5484D;

  display: grid;
  grid-template-columns: 1fr auto;
  grid-template-areas:
    'info faces'
    'steps steps';
  align-items: center;
  gap: 10px 12px;
  margin-bottom: 12px;
  padding: 10px 14px;
  border: 1px solid var(--line);
  border-radius: 16px;
  background: #ffffff;
  box-shadow: 0 1px 2px rgba(20, 23, 43, 0.04);
  font-family: 'Plus Jakarta Sans', var(--bs-body-font-family);
  color: var(--ink);
}

/* Bootstrap "lg" (992px) and up: one row, steps in the middle */
@media (min-width: 992px) {
  .stage-bar {
    grid-template-columns: 1fr auto 1fr;
    grid-template-areas: 'info steps faces';
  }
}

.room-info {
  grid-area: info;
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.room-badge {
  flex-shrink: 0;
  padding: 4px 12px;
  border-radius: 999px;
  color: var(--brand);
  background: var(--brand-tint);
  font-size: 0.85rem;
  font-weight: 600;
}

.room-badge strong {
  letter-spacing: 0.08em;
}

/* ---------- Steps ---------- */
.steps {
  grid-area: steps;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0;
  padding: 0;
  list-style: none;
}

.step-pill {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--muted);
  font-size: 0.8rem;
  font-weight: 600;
  white-space: nowrap;
}

/* The line between two steps (blue up to every step the room has reached) */
.step-pill + .step-pill::before {
  content: '';
  width: clamp(10px, 2.5vw, 24px);
  height: 2px;
  border-radius: 2px;
  background: var(--line);
}

.step-pill + .step-pill.done::before,
.step-pill + .step-pill.current::before {
  background: var(--brand);
}

/* Each step's dot and name. A real button when it can be clicked, plain otherwise. */
.step-btn {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 3px 6px 3px 3px;
  border: 0;
  border-radius: 999px;
  color: inherit;
  background: none;
  font: inherit;
  -webkit-tap-highlight-color: transparent;
}

button.step-btn {
  cursor: pointer;
  transition: background-color 150ms ease, transform 160ms cubic-bezier(0.23, 1, 0.32, 1);
}

button.step-btn:active:not(:disabled) {
  transform: scale(0.96);
}

button.step-btn:focus-visible {
  outline: 2px solid var(--brand);
  outline-offset: 1px;
}

@media (hover: hover) and (pointer: fine) {
  button.step-btn:not(:disabled):hover {
    color: var(--brand);
    background: var(--brand-tint);
  }
}

@media (prefers-reduced-motion: reduce) {
  button.step-btn:active:not(:disabled) {
    transform: none;
  }
}

.step-dot {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  flex-shrink: 0;
  border: 1.5px solid var(--line);
  border-radius: 50%;
  background: #ffffff;
  font-size: 0.72rem;
  font-variant-numeric: tabular-nums;
}

.step-pill.done {
  color: var(--ink);
}

.step-pill.done .step-dot {
  color: var(--brand);
  border-color: var(--brand-tint);
  background: var(--brand-tint);
}

.step-pill.current {
  color: var(--brand);
}

.step-pill.current .step-dot {
  color: #ffffff;
  border-color: var(--brand);
  background: var(--brand);
  box-shadow: 0 0 0 4px rgba(47, 91, 234, 0.15);
}

/* Only the current step keeps its name: below 768px, so all 6 fit on a phone, and from 992px to 1199px,
   where the steps share one row with the room name and faces */
@media (max-width: 767.98px), (min-width: 992px) and (max-width: 1199.98px) {
  .step-pill:not(.current) .step-label {
    display: none;
  }
}

/* Phones held sideways (short screens): everything on one row, smaller, so the camera gets the height */
@media (max-height: 500px) and (orientation: landscape) {
  .stage-bar {
    grid-template-columns: auto 1fr auto;
    grid-template-areas: 'info steps faces';
    margin-bottom: 8px;
    padding: 6px 10px;
  }

  .step-pill:not(.current) .step-label {
    display: none;
  }
}

/* ---------- Faces and room buttons ---------- */
.bar-right {
  grid-area: faces;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
}

.faces {
  display: flex;
  padding-left: 6px;
}

/* Hidden on phones (upright or sideways) to make space for the buttons */
@media (max-width: 575.98px), (max-height: 500px) and (orientation: landscape) {
  .faces {
    display: none;
  }
}

.room-actions {
  display: flex;
  align-items: center;
  gap: 4px;
}

/* Round icon buttons; with a word next to the icon they become pills */
.bar-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  min-width: 32px;
  height: 32px;
  padding: 0 8px;
  border: 1px solid var(--line);
  border-radius: 999px;
  color: var(--ink);
  background: #ffffff;
  font: inherit;
  font-size: 0.8rem;
  font-weight: 600;
  white-space: nowrap;
  -webkit-tap-highlight-color: transparent;
  transition: background-color 150ms ease, border-color 150ms ease, transform 160ms cubic-bezier(0.23, 1, 0.32, 1);
}

.bar-btn:active {
  transform: scale(0.96);
}

.bar-btn:focus-visible {
  outline: 2px solid var(--brand);
  outline-offset: 1px;
}

.bar-btn-danger {
  color: #ffffff;
  border-color: var(--danger);
  background: var(--danger);
}

@media (hover: hover) and (pointer: fine) {
  .bar-btn:hover {
    border-color: var(--brand-tint);
    background: var(--brand-tint);
  }

  .bar-btn-danger:hover {
    border-color: #DC2626;
    background: #DC2626;
  }
}

@media (prefers-reduced-motion: reduce) {
  .bar-btn:active {
    transform: none;
  }
}

/* Phones (upright or sideways): just the icons */
@media (max-width: 575.98px), (max-height: 500px) and (orientation: landscape) {
  .btn-label {
    display: none;
  }

  .bar-btn {
    padding: 0;
  }
}

.face {
  width: 30px;
  height: 30px;
  margin-left: -6px;
  border: 2px solid #ffffff;
  border-radius: 50%;
  object-fit: cover;
  background: var(--brand-tint);
}

.face-more {
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--muted);
  background: #F1F3F8;
  font-size: 0.7rem;
  font-weight: 700;
}
</style>
