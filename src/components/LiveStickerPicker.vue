<script setup>
// The live sticker picker (Rae): time, date, weather and location stickers.
// Used in the Decorate page's sticker tray (Live tab). It only CHOOSES a sticker: when a tile
// is tapped it emits 'add' with { config, live }, and the page turns that into a picture and
// places it (see liveStickerPng in stickerTray.js). Drawing comes from dynamicStickers.js.
//
// WHY a component: the same picker can be dropped into any page (Decorate today, maybe the
// Template Editor later) without copying 300 lines.
import { ref, watch } from 'vue'
import { DYNAMIC_STYLES, liveStickerImage, fetchWeather, findPlace, loadLiveFonts } from '../dynamicStickers.js'
import AppIcon from './AppIcon.vue'

const emit = defineEmits(['add'])

// The text looks' fonts, loaded now so the look buttons show in them straight away
loadLiveFonts()

// The looks in two groups: badges (a shape with an icon) and words only (see-through)
const BADGE_STYLES = DYNAMIC_STYLES.filter((item) => !item.text)
const WORD_STYLES = DYNAMIC_STYLES.filter((item) => item.text)

const style = ref('pill')        // the look: Clean, Bold, Retro, Typewriter, Film date, Cartoon, Cute
const hour12 = ref(true)
const query = ref('')            // what is typed in the place box
const place = ref(null)          // { city, country } for the weather, once a place is found
const results = ref([])          // every match for the search (Jurong East, Jurong West...)
const resultIndex = ref(0)       // which match is in use
const nearby = ref([])           // landmarks around you, closest first: { name, kind, distance }
const names = ref([])            // names for the place, most specific first: SMU, Bras Basah, Singapore
const label = ref('')            // the name the location sticker shows (picked or typed)
const weather = ref(null)        // the latest answer from /api/weather
const busy = ref('')             // 'search' | 'gps' while a request is running
const error = ref('')

function message(problem) {
  return (problem && problem.message) || 'That is not available right now.'
}

// ---------- previews ----------
// The tiles show the real sticker in the chosen look. The text looks need their font first,
// so the pictures are made here (not in the template) and swapped in when ready.
const tiles = ref({ time: '', date: '', weather: '', location: '' })
let tilesVersion = 0 // so a slow, older drawing never replaces a newer one

function tileConfig(type) {
  if (type === 'time') return { type, style: style.value, hour12: hour12.value, timeZone: '' }
  if (type === 'date') return { type, style: style.value, timeZone: '' }
  // Weather and location both show the place you picked (searched "Clementi" shows Clementi,
  // not "Chinese Garden", the weather station OpenWeatherMap happens to use nearby)
  return { type, style: style.value, city: (label.value.trim() || place.value.city).slice(0, 40), country: place.value.country }
}

async function refreshTiles() {
  const version = ++tilesVersion
  const types = place.value ? ['time', 'date', 'weather', 'location'] : ['time', 'date']
  const next = { time: '', date: '', weather: '', location: '' }
  for (const type of types) {
    try {
      next[type] = (await liveStickerImage(tileConfig(type), type === 'weather' ? weather.value : null)).url
    } catch (problem) {
      next[type] = ''
    }
  }
  if (version === tilesVersion) tiles.value = next
}

// ---------- time and date ----------

function addTime(type) {
  emit('add', { config: { type, style: style.value, hour12: hour12.value, timeZone: '' }, live: null })
}

// ---------- finding a place ----------

async function search() {
  const text = query.value.trim()
  if (!text) {
    error.value = 'Type a place first, like SMU, Jurong or Tokyo.'
    return
  }
  error.value = ''
  busy.value = 'search'
  try {
    const answer = await findPlace({ query: text })
    results.value = answer.results
    resultIndex.value = 0
    nearby.value = [] // the list is for "Use my location"; a typed place replaces it
    await usePlace(answer.results[0])
  } catch (problem) {
    error.value = message(problem)
  } finally {
    busy.value = ''
  }
}

// WHY two lookups: OpenStreetMap names the spot (SMU, Jurong West), but only OpenWeatherMap
// has the weather, and it only knows cities. So the location sticker shows the name you
// pick, and the weather sticker uses the city OpenWeatherMap gives for the same spot.
async function usePlace(found) {
  error.value = ''
  names.value = found.names
  label.value = found.names[0]
  // Until the weather answers, the widest name (usually the city) stands in.
  place.value = { city: found.names[found.names.length - 1], country: found.country }
  weather.value = null
  try {
    const answer = await fetchWeather({ lat: found.lat, lon: found.lon })
    weather.value = answer
    place.value = { city: answer.city, country: answer.country || found.country }
  } catch (problem) {
    error.value = 'Found the place, but not its weather. ' + message(problem)
  }
}

// A search matched several places (Jurong East, Jurong West...): use the one tapped.
async function pickResult(index) {
  if (index === resultIndex.value || busy.value) return
  resultIndex.value = index
  busy.value = 'search'
  try {
    await usePlace(results.value[index])
  } finally {
    busy.value = ''
  }
}

// "150 m" or "1.2 km" for the nearby list.
function formatDistance(metres) {
  return metres < 1000 ? Math.max(10, Math.round(metres / 10) * 10) + ' m' : (metres / 1000).toFixed(1) + ' km'
}

// WHY the coordinates are never kept: they go to our server once, to look up the place
// name, and only the name you pick goes on the sticker.
function useMyLocation() {
  error.value = ''
  if (!navigator.geolocation) {
    error.value = 'This browser cannot share your location. Type a place instead.'
    return
  }
  // Phones only share location with https:// sites, and say no without asking otherwise.
  if (!window.isSecureContext) {
    error.value = 'Location only works on a secure (https://) link. Open the Vercel link on your phone, or type a place.'
    return
  }
  busy.value = 'gps'
  navigator.geolocation.getCurrentPosition(
    async (position) => {
      try {
        const { latitude, longitude } = position.coords
        const answer = await findPlace({ lat: latitude, lon: longitude })
        results.value = []
        nearby.value = answer.nearby || []
        // If the area lookup found nothing but landmarks did, the closest landmark stands in.
        const area = answer.results[0] || {
          names: [nearby.value[0].name],
          country: '',
          lat: Number(latitude.toFixed(2)),
          lon: Number(longitude.toFixed(2)),
        }
        await usePlace(area)
        // Start on the closest landmark when it is close enough to be where you are.
        if (nearby.value[0] && nearby.value[0].distance <= 100) label.value = nearby.value[0].name
      } catch (problem) {
        error.value = message(problem)
      } finally {
        busy.value = ''
      }
    },
    (problem) => {
      busy.value = ''
      if (problem.code === 1) {
        error.value = 'Location is turned off for this site. Allow it in your browser settings (on iPhone: Settings > Privacy > Location Services), or type a place.'
      } else if (problem.code === 3) {
        error.value = 'Finding your location took too long. Try again, or type a place.'
      } else {
        error.value = 'Could not find your location. Type a place instead.'
      }
    },
    // High accuracy and a fresh fix, or a phone may answer with a rough or old position.
    { enableHighAccuracy: true, timeout: 20000, maximumAge: 30 * 1000 },
  )
}

watch([style, hour12, place, label, weather], refreshTiles, { immediate: true })

function addPlace(type) {
  if (!place.value) return
  emit('add', {
    config: tileConfig(type),
    live: type === 'weather' ? weather.value : null,
  })
}
</script>

<template>
  <div class="live-picker">
    <!-- One choice for every sticker below, so it is a dropdown: pick a look, then tap a sticker -->
    <label class="lp-label" for="lp-look">Style</label>
    <select id="lp-look" v-model="style" class="form-select form-select-sm lp-input">
      <optgroup label="Badge">
        <option v-for="item in BADGE_STYLES" :key="item.id" :value="item.id">{{ item.label }}</option>
      </optgroup>
      <optgroup label="Words only (no background)">
        <option v-for="item in WORD_STYLES" :key="item.id" :value="item.id">{{ item.label }}</option>
      </optgroup>
    </select>

    <p class="lp-label">Time and date</p>
    <div class="lp-grid">
      <button type="button" class="lp-cell" title="Add the time" @click="addTime('time')">
        <img v-if="tiles.time" :src="tiles.time" alt="" />
        <span v-else class="lp-cell-wait"></span>
        <span>Time</span>
      </button>
      <button type="button" class="lp-cell" title="Add the date" @click="addTime('date')">
        <img v-if="tiles.date" :src="tiles.date" alt="" />
        <span v-else class="lp-cell-wait"></span>
        <span>Date</span>
      </button>
    </div>
    <label class="form-check form-switch lp-switch">
      <input v-model="hour12" class="form-check-input" type="checkbox" role="switch" />
      <span class="form-check-label">12-hour clock (3:42 PM)</span>
    </label>

    <p class="lp-label">Weather and location</p>
    <form class="input-group input-group-sm" @submit.prevent="search">
      <input
        v-model="query"
        type="text"
        class="form-control lp-input"
        maxlength="80"
        placeholder="e.g. Marina Bay Sands"
        aria-label="Place"
      />
      <button type="submit" class="btn btn-outline-secondary" :disabled="busy !== ''">
        {{ busy === 'search' ? 'Finding…' : 'Find' }}
      </button>
    </form>
    <button type="button" class="btn btn-outline-primary btn-sm w-100 mt-2 lp-gps" :disabled="busy !== ''" @click="useMyLocation">
      <AppIcon name="globe" :size="14" />
      {{ busy === 'gps' ? 'Finding you…' : 'Use my location' }}
    </button>
    <p v-if="error" class="lp-error" role="alert">{{ error }}</p>

    <template v-if="place">
      <!-- More than one match: pick the right one -->
      <template v-if="results.length > 1">
        <p class="lp-label">Which one?</p>
        <div class="lp-list" role="group" aria-label="Matching places">
          <button
            v-for="(result, index) in results"
            :key="index"
            type="button"
            class="lp-row"
            :class="{ active: resultIndex === index }"
            :aria-pressed="resultIndex === index"
            @click="pickResult(index)"
          >
            <span class="lp-row-name">{{ result.summary }}</span>
          </button>
        </div>
      </template>

      <!-- After "Use my location": landmarks around you, closest first -->
      <template v-if="nearby.length > 0">
        <p class="lp-label">Places near you <span class="lp-count">{{ nearby.length }}</span></p>
        <div class="lp-list lp-scroll" role="group" aria-label="Places near you">
          <button
            v-for="spot in nearby"
            :key="spot.name"
            type="button"
            class="lp-row"
            :class="{ active: label === spot.name }"
            :aria-pressed="label === spot.name"
            @click="label = spot.name"
          >
            <span class="lp-row-name">{{ spot.name }}</span>
            <span class="lp-row-meta">{{ spot.kind }} · {{ formatDistance(spot.distance) }}</span>
          </button>
        </div>
      </template>

      <template v-if="names.length > 1 || nearby.length > 0">
      <p class="lp-label">{{ nearby.length > 0 ? 'Or the area' : 'Name on the sticker' }}</p>
      <div class="lp-chips" role="group" aria-label="Pick a name">
        <button
          v-for="name in names"
          :key="name"
          type="button"
          class="lp-chip"
          :class="{ active: label === name }"
          :aria-pressed="label === name"
          @click="label = name"
        >{{ name }}</button>
      </div>
      </template>

      <div class="lp-grid lp-grid-gap">
        <button type="button" class="lp-cell" title="Add the weather" @click="addPlace('weather')">
          <img v-if="tiles.weather" :src="tiles.weather" alt="" />
          <span v-else class="lp-cell-wait"></span>
          <span>Weather</span>
        </button>
        <button type="button" class="lp-cell" title="Add the location" @click="addPlace('location')">
          <img v-if="tiles.location" :src="tiles.location" alt="" />
          <span v-else class="lp-cell-wait"></span>
          <span>Location</span>
        </button>
      </div>
    </template>
    <p class="lp-hint">Only the place name is used, never your exact location. To change a name, double-tap the sticker on the strip.</p>
  </div>
</template>

<style scoped>
/* Its own colours (design.md), so it looks the same on any page */
.live-picker {
  --brand: #2F5BEA;
  --brand-tint: #E8EEFF;
  --ink: #14172B;
  --muted: #6B7080;
  --line: #E3E6EE;
  --soft: #F4F6FA;
  --ease-out: cubic-bezier(0.23, 1, 0.32, 1);
}

.lp-label {
  display: flex; align-items: center; justify-content: space-between;
  margin: 14px 0 6px;
  font-size: 0.82rem; font-weight: 700;
  color: var(--ink);
}
.lp-label:first-child { margin-top: 0; }
.lp-count { font-size: 0.75rem; font-weight: 600; color: var(--muted); }
.lp-hint { margin: 10px 0 0; font-size: 0.75rem; line-height: 1.45; color: var(--muted); }
.lp-error {
  margin: 8px 0 0;
  padding: 7px 10px;
  border-radius: 10px;
  font-size: 0.8rem;
  color: #B42318;
  background: #FEF3F2;
}
.lp-input { font-size: 16px; } /* 16px so iPhones do not zoom in */
.lp-gps { display: inline-flex; align-items: center; justify-content: center; gap: 6px; }

/* While a text look's font loads, an empty space the size of the picture */
.lp-cell-wait { display: block; width: 100%; height: 38px; border-radius: 8px; background: #EEF0F5; }

/* Tiles: tap to add */
.lp-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
.lp-grid-gap { margin-top: 12px; }
.lp-cell {
  display: flex; flex-direction: column; align-items: center; gap: 6px;
  padding: 10px 8px 8px;
  border: 1px solid transparent;
  border-radius: 12px;
  background: var(--soft);
  transition: border-color 150ms ease, background-color 150ms ease, transform 160ms var(--ease-out);
}
.lp-cell img { width: 100%; height: 38px; object-fit: contain; pointer-events: none; }
.lp-cell span { font-size: 0.75rem; font-weight: 600; color: var(--muted); }
.lp-cell:active { transform: scale(0.96); }
.lp-switch { margin: 10px 0 0; font-size: 0.8rem; }

/* Search matches and places near you */
.lp-list { display: flex; flex-direction: column; gap: 2px; padding: 4px; border: 1px solid var(--line); border-radius: 12px; }
.lp-scroll { max-height: 200px; overflow-y: auto; scrollbar-width: thin; }
.lp-row {
  display: flex; flex-direction: column; align-items: flex-start; gap: 1px;
  padding: 6px 9px;
  border: 1px solid transparent;
  border-radius: 8px;
  background: transparent;
  text-align: left;
  -webkit-tap-highlight-color: transparent;
}
.lp-row.active { border-color: var(--brand); background: var(--brand-tint); }
.lp-row-name { font-size: 0.82rem; font-weight: 600; color: var(--ink); }
.lp-row.active .lp-row-name { color: var(--brand); }
.lp-row-meta { font-size: 0.72rem; color: var(--muted); }

.lp-chips { display: flex; flex-wrap: wrap; gap: 6px; }
.lp-chip {
  padding: 4px 10px;
  border: 1px solid var(--line);
  border-radius: 999px;
  background: #ffffff;
  font-size: 0.78rem;
  color: var(--ink);
}
.lp-chip.active { border-color: var(--ink); background: var(--ink); color: #ffffff; }

@media (hover: hover) and (pointer: fine) {
  .lp-cell:hover { border-color: var(--brand); background: var(--brand-tint); }
  .lp-row:not(.active):hover { background: var(--soft); }
}
@media (prefers-reduced-motion: reduce) {
  .lp-cell { transition: none; }
  .lp-cell:active { transform: none; }
}
</style>
