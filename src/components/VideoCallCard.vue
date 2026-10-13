<script setup>
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { updateDoc } from 'firebase/firestore'
import { useRoom } from '../composables/useRoom.js'
import { useVideoCall } from '../composables/useVideoCall.js'
import { getGuestId } from '../guest.js'
import { MAX_PEOPLE } from '../room.js'
import VideoTile from './VideoTile.vue'

// The video call card: everyone in the room (live video, name, device, mute icon),
// plus the mute/unmute, leave and close room buttons.
// To add the video call to any page inside a room, just put <VideoCallCard /> on it.

defineProps({
  // 'row': one sideways-scrolling row of tiles.
  // 'sidebar': a sideways row on phones held upright, a 2-column grid from Bootstrap "sm" (576px) up.
  layout: { type: String, default: 'row' },
})

const router = useRouter()
const guestId = getGuestId()
const { room, activeMembers, roomRef, exitRoom } = useRoom()
const { micOn, micBusy, toggleMic, callError } = useVideoCall()

// The host can always close the room. If the host has left, anyone can (so the room is not stuck open).
const canCloseRoom = computed(() => {
  const hostIsHere = activeMembers.value.some((member) => member.id === room.value.hostId)
  return room.value.hostId === guestId || !hostIsHere
})

async function leaveRoom() {
  await exitRoom(true) // true: remove me from the members list straight away
  router.push('/')     // RoomLayout.vue then ends the video call
}

// Closing the room ends the video call for everyone (saves Agora minutes) and stops new people joining.
// Every device sees closed: true in the room document and goes back to the home page (see RoomLayout.vue).
async function closeRoom() {
  if (!confirm('Close this room for everyone? The video call will end.')) return
  await updateDoc(roomRef(), { closed: true })
}
</script>

<template>
  <div class="card">
    <div class="card-body p-2">
      <div class="d-flex flex-wrap align-items-center gap-2 mb-2">
        <h2 class="h6 mb-0 me-auto">In this room ({{ activeMembers.length }}/{{ MAX_PEOPLE }})</h2>

        <button
          class="btn btn-sm"
          :class="micOn ? 'btn-success' : 'btn-outline-secondary'"
          :disabled="micBusy"
          @click="toggleMic"
        >
          {{ micOn ? '🎤 Mute' : '🔇 Unmute' }}
        </button>
        <button class="btn btn-sm btn-outline-secondary" @click="leaveRoom">Leave</button>
        <button v-if="canCloseRoom" class="btn btn-sm btn-outline-danger" @click="closeRoom">Close room</button>
      </div>

      <p v-if="callError" class="text-danger small mb-2">{{ callError }}</p>

      <!-- 'tiles-row' or 'tiles-sidebar' (not just "row", which is already a Bootstrap class) -->
      <div class="tiles" :class="'tiles-' + layout">
        <VideoTile
          v-for="member in activeMembers"
          :key="member.id"
          :member="member"
          :is-self="member.id === guestId"
          :is-host="member.id === room.hostId"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Default: one row of tiles that scrolls sideways if there are too many.
   Every tile is exactly 130px wide (flex: 0 0 130px = do not grow, do not shrink, start at 130px). */
.tiles {
  display: flex;
  gap: 8px;
  overflow-x: auto;
}

.tiles > * {
  flex: 0 0 130px;
}

/* Bootstrap "xl" (1200px+): bigger tiles in the row layout, to use the big screen */
@media (min-width: 1200px) {
  .tiles-row > * {
    flex-basis: 200px;
  }
}

/* Sidebar layout from Bootstrap "sm" (576px+): a 2-column grid.
   minmax(0, 1fr) = two EQUAL columns, even if one person has a very long name. */
@media (min-width: 576px) {
  .tiles-sidebar {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    overflow-x: visible;
  }
}
</style>
