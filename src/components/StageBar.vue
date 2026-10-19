<script setup>
import { computed } from 'vue'
import { useRoom } from '../composables/useRoom.js'

// The bar at the top of the photostrip pages: room name and code, the 7 steps, and everyone in the room.
// Usage: <StageBar current="pick" />  (current = the id of the step this page is)

const props = defineProps({
  current: { type: String, required: true },
})

const { code, room, activeMembers } = useRoom()

// The steps from the Figma page flow, in order
const STEPS = [
  { id: 'lobby', label: '1 Lobby' },
  { id: 'shoot', label: '2 Shoot' },
  { id: 'pick', label: '3 Pick' },
  { id: 'video', label: '4 Video' },
  { id: 'decorate', label: '5 Decorate' },
  { id: 'music', label: '6 Music' },
  { id: 'export', label: '7 Export' },
]

// Position of the current step, so the steps before it can be shown as done
const currentIndex = computed(() => STEPS.findIndex((s) => s.id === props.current))

// One colour per person, in the order they joined (starts again after 6, the room maximum)
const COLOURS = ['#2F5BEA', '#20A464', '#E0A100', '#7B61FF', '#F2711C', '#16A2A2']
</script>

<template>
  <div class="stage-bar d-flex flex-wrap align-items-center gap-2 mb-3">
    <h1 class="h6 mb-0 fw-bold">{{ room && room.roomName ? room.roomName : 'Our photobooth' }}</h1>
    <span class="badge rounded-pill room-badge">Room {{ code }}</span>

    <!-- Steps: on their own line on phones (order-last), in the middle from Bootstrap "lg" up -->
    <div class="d-flex flex-wrap gap-1 mx-lg-auto order-last order-lg-0 w-100 w-lg-auto justify-content-center">
      <span
        v-for="(step, index) in STEPS"
        :key="step.id"
        class="step-pill"
        :class="{ current: step.id === props.current, done: index < currentIndex }"
      >{{ step.label }}</span>
    </div>

    <!-- Everyone in the room: first letter of their name -->
    <div class="d-flex ms-auto ms-lg-0">
      <span
        v-for="(member, index) in activeMembers"
        :key="member.id"
        class="avatar"
        :style="{ background: COLOURS[index % COLOURS.length] }"
        :title="member.name"
      >{{ member.name.charAt(0).toUpperCase() }}</span>
    </div>
  </div>
</template>

<style scoped>
.stage-bar {
  background: #fff;
  border-radius: 12px;
  padding: 10px 14px;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.06);
}

.room-badge {
  background: #E8EEFF;
  color: #2F5BEA;
  font-weight: 500;
}

.step-pill {
  font-size: 0.75rem;
  padding: 3px 10px;
  border-radius: 999px;
  background: #F1F2F6;
  color: #6B7080;
}

.step-pill.done {
  background: #E8EEFF;
  color: #2F5BEA;
}

.step-pill.current {
  background: #2F5BEA;
  color: #fff;
}

/* Small overlapping circles, like the avatars in the Figma design */
.avatar {
  width: 26px;
  height: 26px;
  border-radius: 50%;
  color: #fff;
  font-size: 0.7rem;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 2px solid #fff;
  margin-left: -6px;
}

/* Bootstrap has no "w-lg-auto" class, so it is added here for "lg" (992px) and up */
@media (min-width: 992px) {
  .w-lg-auto {
    width: auto !important;
  }
}
</style>
