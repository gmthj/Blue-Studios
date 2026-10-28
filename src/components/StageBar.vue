<script setup>
import { ref, computed } from 'vue'
import { useRoom, ROOM_STAGES } from '../composables/useRoom.js'
import { profileOf } from '../profiles.js'
import AppIcon from './AppIcon.vue'

// The bar at the top of the room pages: the room code, the steps, and everyone in the room.
// Usage: <StageBar current="pick" />  (current = the stage of this page, see ROOM_STAGES in useRoom.js)
//
// Steps the room has already reached can be clicked to move the WHOLE room there (everyone's page
// follows room.stage). Steps it has not reached yet, and steps whose page is not built yet, cannot.

const props = defineProps({
  current: { type: String, required: true },
})

const { code, activeMembers, furthestIndex, goToStage } = useRoom()

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

    <!-- Everyone in the room: their profile pictures, overlapping -->
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

/* ---------- Faces ---------- */
.faces {
  grid-area: faces;
  display: flex;
  justify-content: flex-end;
  padding-left: 6px;
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
