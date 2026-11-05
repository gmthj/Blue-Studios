<script setup>
import { ref, computed, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'
import { playSound } from '../sounds.js'
import { updateDoc } from 'firebase/firestore'
import { useRoom } from '../composables/useRoom.js'
import { useAuth } from '../composables/useAuth.js'
import { LAYOUTS, FRAME_STYLES, saveFields, saveField, cropOf, MAX_ZOOM, emptySlotIndexes, cutLabel, safeStickers } from '../stripData.js'
import { listMyItems, getFileUrl, templateFrameFields, loadTemplateProject, CATEGORIES } from '../studio.js'
import { getItem, listMySaved, searchPublicItems } from '../marketplace.js'
import { loadSavedFramesFromDB } from '../utils/savedFrameEngine.js'
import { resolveEditedVideos, editedVideoList } from '../clips.js'
import EditedVideoThumb from '../components/EditedVideoThumb.vue'
import ClipThumb from '../components/ClipThumb.vue'
import StageBar from '../components/StageBar.vue'
import PhotoStrip from '../components/PhotoStrip.vue'
import FrameTile from '../components/FrameTile.vue'
import AppIcon from '../components/AppIcon.vue'
import PageTip from '../components/PageTip.vue'
import { askConfirm } from '../composables/useDialog.js'

// The "Pick" page (a child of RoomLayout.vue): choose a frame and drag photos into it.
//   Left:   gallery, photos grouped by session (shot)
//   Middle: the strip (PhotoStrip.vue)
//   Right:  saved frames (Default / Mine / Saved from the marketplace, Cut layouts), Skip video, Next
// Everything is saved in the room document, so everyone in the room sees the same strip.

const { room, photos, clips, roomRef, goToStage, fullStripBlocked } = useRoom() // goToStage: the whole room moves (the empty-state button below)
const { isAccount } = useAuth()

// ---------- FIRST-TIME TIPS ----------
// The same idea as the GIF tips in the Sticker Maker: the first time someone opens the Pick page, three
// small cards explain it, each one pointing at the part it is about (PageTip.vue). The "?" next to
// Gallery shows them again. Remembered per browser (localStorage); if storage is blocked they just show again.
const PICK_TIPS = [
  {
    target: 'gallery',
    title: 'Your photos and videos',
    text: 'Everything from the camera is here, grouped by session.',
  },
  {
    target: 'strip',
    title: 'Fill every slot',
    text: 'Each slot needs to be filled before you can move on. Drag a photo or video onto a slot, or tap the photo and then the slot. Then drag inside the frame to move it.',
  },
  {
    target: 'frames',
    title: 'Choose a frame',
    text: 'Pick a frame from Saved frames. Everyone in the room sees the same strip, so you can choose together.',
  },
]
const PICK_TIPS_KEY = 'pick-tips-seen'
const pickTipIndex = ref(-1)
const pickTip = computed(() => PICK_TIPS[pickTipIndex.value] || null)

function showPickTips() {
  pickTipIndex.value = 0
}

function nextPickTip() {
  if (pickTipIndex.value < PICK_TIPS.length - 1) pickTipIndex.value++
  else closePickTips()
}

function closePickTips() {
  pickTipIndex.value = -1
  try {
    localStorage.setItem(PICK_TIPS_KEY, '1')
  } catch (error) {
    // storage blocked: the tips will show again next time
  }
}

function seenPickTips() {
  try {
    return localStorage.getItem(PICK_TIPS_KEY) === '1'
  } catch (error) {
    return false
  }
}

onMounted(() => {
  if (!seenPickTips()) showPickTips()
})

const selectedPhotoId = ref(null) // phones: the photo tapped (each person has their own)
const targetSlot = ref(null)      // phones: the slot tapped first, waiting for a photo / video to be tapped
const cropSlot = ref(null)        // the slot being repositioned (moved / zoomed), or null
const draftZoom = ref(null)       // the zoom slider's value while it is being dragged (only on this screen), or null
// const showCall = ref(true)        // the video call can be hidden so it does not cover the strip
const userTemplates = ref([])
const savedTemplates = ref([]) // templates I saved from the marketplace (shown under "Saved")
const loadingTemplates = ref(false)

// What the room has chosen (the first layout / style if nothing is saved yet)
const layout = computed(() => {
  if (room.value.stripCustomTemplate?.slots?.length) {
    return {
      id: room.value.stripCustomTemplate.id,
      name: room.value.stripCustomTemplate.name,
      aspect: room.value.stripCustomTemplate.aspect || (3 / 10),
      slots: room.value.stripCustomTemplate.slots
    }
  }
  return LAYOUTS.find((l) => l.id === room.value.stripLayoutId) || LAYOUTS[0]
})

const frameStyle = computed(() => {
  if (room.value.stripCustomTemplate) {
    return {
      id: room.value.stripCustomTemplate.id,
      group: 'mine',
      background: room.value.stripCustomTemplate.background || '#FFFFFF',
      border: room.value.stripCustomTemplate.border || '#1A1A2E',
      shape: room.value.stripCustomTemplate.shape || 'square',
      caption: room.value.stripCustomTemplate.caption || '',
      captionColor: room.value.stripCustomTemplate.captionColor || room.value.stripCustomTemplate.border,
      thumbnailUrl: room.value.stripCustomTemplate.thumbnailUrl || null
    }
  }
  return FRAME_STYLES.find((s) => s.id === room.value.stripStyleId) || FRAME_STYLES[0]
})

const slotPhotos = computed(() => room.value.stripSlots || {})
// The edited videos made on the Video page: as { id: edit } (to find a slot's video) and as a list (for the gallery)
const editedVideos = computed(() => resolveEditedVideos(room.value.editedVideos, clips.value))
const editedList = computed(() => editedVideoList(room.value.editedVideos, clips.value))
const defaultStyles = FRAME_STYLES.filter((s) => s.group === 'default')
const myStyles = FRAME_STYLES.filter((s) => s.group === 'mine')

onMounted(loadTemplates)
watch(isAccount, loadTemplates)

// ---------- DEFAULT FRAMES: the ones the "Blue Studios" account published ----------
// The team publishes its ready-made frames from one account called Blue Studios (in the marketplace,
// public). Those are the Default frames everyone sees, guests too. If none can be loaded (offline, or
// none published yet), the built-in colour frames below are shown instead.
// The account name is matched loosely ("Blue Studio", "blue studios", "BlueStudios" all count).
const studioFrames = ref([])
const loadingStudioFrames = ref(true)

function isStudioAccount(ownerName) {
  return /^blue\s*studios?$/i.test(String(ownerName || '').trim())
}

async function loadStudioFrames() {
  loadingStudioFrames.value = true
  try {
    // Search the public templates for the account's name, then keep only the ones it actually made
    const found = await searchPublicItems({ type: 'templates', text: 'blue studio' })
    const theirs = found.filter((item) => isStudioAccount(item.ownerName))
    studioFrames.value = await Promise.all(theirs.map(templateSwatch))
  } catch (err) {
    console.warn('Could not load the Blue Studios frames:', err)
    studioFrames.value = []
  } finally {
    loadingStudioFrames.value = false
  }
}
onMounted(loadStudioFrames)

// ---------- THE CUT UNDER EACH FRAME ----------
// "4-cut", "3-cut", "2x2"... A frame saved on this device has its slots already. A frame in the cloud only
// says how many slots it has, so its project file is read once to see how they are arranged.
const cuts = ref({})         // frame id -> '4-cut'
const cutLoading = new Set() // frames whose project file is being read

function cutOf(tpl) {
  return cuts.value[tpl.id] || cutLabel(tpl.slotCount || 0)
}

async function workOutCut(tpl) {
  if (!tpl || cuts.value[tpl.id] || cutLoading.has(tpl.id)) return
  const known = tpl.projectData && (tpl.projectData.slots || tpl.projectData.slotRects)
  if (known) {
    cuts.value = { ...cuts.value, [tpl.id]: cutLabel(known) }
    return
  }
  if (!tpl.dataPath) return
  cutLoading.add(tpl.id)
  try {
    const project = await loadTemplateProject(tpl)
    const slots = project && (project.slots || project.slotRects)
    if (slots) cuts.value = { ...cuts.value, [tpl.id]: cutLabel(slots) }
  } catch {
    // keep the slot count ("4-cut") if the file cannot be read
  } finally {
    cutLoading.delete(tpl.id)
  }
}

// ---------- THE FRAME LIST: 3 DROPDOWNS ----------
// Default, Mine and Saved each open and close (Default starts open). Inside Default every category
// (Birthday, Friends, Cute...) is its own dropdown, in the marketplace's category order.
// A frame can have up to 3 categories: it goes under its first one, so it only shows once.
// Frames with no category go under Other.
const openSections = ref(['default'])
const openGroups = ref([]) // the Default categories that are open

function sectionOpen(id) {
  return openSections.value.includes(id)
}

function toggleSection(id) {
  openSections.value = sectionOpen(id)
    ? openSections.value.filter((item) => item !== id)
    : [...openSections.value, id]
}

const studioGroups = computed(() => {
  const groups = CATEGORIES.map((category) => ({ id: category.id, label: category.label, frames: [] }))
  const other = groups.find((group) => group.id === 'other')
  for (const frame of studioFrames.value) {
    const first = (frame.categories || [])[0]
    const group = groups.find((item) => item.id === first) || other
    group.frames.push(frame)
  }
  return groups.filter((group) => group.frames.length > 0)
})

function groupOpen(group) {
  return openGroups.value.includes(group.id)
}

function toggleGroup(group) {
  openGroups.value = groupOpen(group)
    ? openGroups.value.filter((id) => id !== group.id)
    : [...openGroups.value, group.id]
}

// When the default frames have loaded, open one category so there is something to pick straight away:
// the one with the frame the room is using, or else the first
let openedFirstGroup = false
watch(studioGroups, (groups) => {
  if (openedFirstGroup || groups.length === 0) return
  openedFirstGroup = true
  const current = groups.find((group) => group.frames.some((frame) => frame.id === frameStyle.value.id))
  openGroups.value = [(current || groups[0]).id]
}, { immediate: true })

// Every default frame on screen now (to work out the cut under each, see below)
const shownStudioFrames = computed(() => sectionOpen('default')
  ? studioGroups.value.filter(groupOpen).flatMap((group) => group.frames)
  : [])

// The cut of the frame the room is using ("4-cut", "2x2"), under its name at the top
const activeCut = computed(() => cutLabel((room.value.stripCustomTemplate && room.value.stripCustomTemplate.slots) || []))

// The template the room was made with ("Use template" in the marketplace or My Studio, see RoomLayout.vue).
// Listed first under "Mine", even if it isn't mine or saved, so the room can go back to it.
const startTemplate = ref(null)

watch(() => room.value.startTemplateId, async (id) => {
  startTemplate.value = null
  if (!id) return
  try {
    const item = await getItem('templates', id)
    if (!item || item.id !== room.value.startTemplateId) return
    startTemplate.value = await templateSwatch(item)
  } catch (err) {
    console.warn("Could not load the room's template:", err) // e.g. someone else's private template
  }
}, { immediate: true })

const mineTemplates = computed(() => {
  const start = startTemplate.value
  const listed = [...userTemplates.value, ...savedTemplates.value]
  if (!start || listed.some((tpl) => tpl.id === start.id)) return userTemplates.value
  return [start, ...userTemplates.value]
})

// A templates/{id} document (mine or saved from the marketplace) as a swatch in the list
async function templateSwatch(item) {
  let thumbUrl = null
  if (item.thumbnailPath) {
    try {
      thumbUrl = await getFileUrl(item.thumbnailPath)
    } catch (err) {
      console.warn('Could not get thumbnail URL:', err)
    }
  }
  return {
    id: item.id,
    name: item.name,
    thumbnailUrl: thumbUrl,
    dataPath: item.dataPath,
    thumbnailPath: item.thumbnailPath,
    slotCount: item.slotCount,
    categories: item.categories || [], // e.g. ['birthday', 'cute'], to group the Default frames
    shape: 'square',
    background: '#FFFFFF',
    border: '#1A1A2E'
  }
}

async function loadTemplates() {
  loadingTemplates.value = true
  const list = []

  // 1. Load local IndexedDB templates
  try {
    const local = await loadSavedFramesFromDB()
    if (local && local.length) {
      for (const f of local) {
        list.push({
          id: f.cloudId || f.id,
          name: f.name,
          thumbnailUrl: f.thumbnail || null,
          projectData: f.projectData,
          shape: (f.projectData?.slotShape || f.projectData?.shape || 'square').toLowerCase(),
          background: f.projectData?.background || '#FFFFFF',
          border: f.projectData?.border || '#1A1A2E'
        })
      }
    }
  } catch (e) {
    console.warn('Could not load local frames:', e)
  }

  // 2. Load cloud templates: my own, and the ones I saved from the marketplace (both together)
  let saved = []
  if (isAccount.value) {
    try {
      const results = await Promise.all([listMyItems('templates'), listMySaved()])
      const mine = results[0].filter((item) => !list.some((existing) => existing.id === item.id))
      list.push(...(await Promise.all(mine.map(templateSwatch))))
      // Saved ones that are still available (null = the maker made it private or removed it)
      const savedItems = results[1]
        .filter((entry) => entry.type === 'templates' && entry.item && !list.some((existing) => existing.id === entry.id))
        .map((entry) => entry.item)
      saved = await Promise.all(savedItems.map(templateSwatch))
    } catch (err) {
      console.warn('Could not load cloud templates:', err)
    }
  }

  savedTemplates.value = saved
  userTemplates.value = list
  loadingTemplates.value = false
}

// The photos as { id: photo }, so a slot can find its photo quickly
const photosById = computed(() => {
  const map = {}
  for (const p of photos.value) {
    map[p.id] = p
  }
  return map
})

// The clips (unedited videos) as { id: clip }, like the photos above
const clipsById = computed(() => {
  const map = {}
  for (const c of clips.value) {
    map[c.id] = c
  }
  return map
})

// Group photos and clips by session (shot number), Session 1 first. Each session has one photo and one clip per person.
// Result looks like: [ { shotNumber: 1, photos: [...], clips: [...] }, { shotNumber: 2, photos: [...], clips: [...] } ]
const sessions = computed(() => {
  const groups = []
  function groupFor(shotNumber) {
    let group = groups.find((g) => g.shotNumber === shotNumber)
    if (!group) {
      group = { shotNumber: shotNumber, photos: [], clips: [] }
      groups.push(group)
    }
    return group
  }
  for (const photo of photos.value) {
    groupFor(photo.shotNumber).photos.push(photo)
  }
  for (const clip of clips.value) {
    groupFor(clip.shotNumber).clips.push(clip)
  }
  return groups.sort((a, b) => a.shotNumber - b.shotNumber)
})

// ---------- EVERY FRAME MUST BE FILLED ----------
// The slots still without a photo or video. The room can only move on (Next / Export) when this is empty.
const emptySlots = computed(() => emptySlotIndexes(layout.value.slots.length, (i) => slotHasMedia(i)))
const flashEmpty = ref(false) // briefly true after trying to move on too early: the empty slots light up red
let flashTimer = null

// Next / Quick export (RoomStageNav.vue) only move on when every frame has something in it. When they are
// refused, useRoom.js says which frames are empty and counts it in fullStripBlocked: the empty frames flash red.
watch(fullStripBlocked, () => {
  flashEmpty.value = true
  clearTimeout(flashTimer)
  flashTimer = setTimeout(() => (flashEmpty.value = false), 1600)
})

// Used to show a tick on photos that are already on the strip
function isUsed(photoId) {
  return Object.values(slotPhotos.value).includes(photoId)
}

// "Gabriel Tan" -> "GT", for the name tag on each photo
function initials(name) {
  return name.split(' ').map((word) => word.charAt(0).toUpperCase()).join('').slice(0, 2)
}

// ---------- DRAG AND DROP ----------

// When a gallery photo starts being dragged, put a small "parcel" in dataTransfer.
// It can only hold text, so the object is turned into JSON. PhotoStrip.vue reads it on drop.
function onPhotoDragStart(event, photo) {
  event.dataTransfer.setData('text/plain', JSON.stringify({ type: 'photo', photoId: photo.id }))
  event.dataTransfer.effectAllowed = 'copy' // the photo stays in the gallery
}

// Put a photo in a slot (dropped, or tapped on a phone).
// The slot's photo id is overwritten, so the old photo is replaced, not stacked.
// If the photo was already in another slot, the two slots swap.
async function placePhoto(index, photoId) {
  const changes = {}
  changes['stripSlots.' + index] = photoId
  changes['stripCrops.' + index] = null // a new photo starts centred again
  for (const key of Object.keys(slotPhotos.value)) {
    if (slotPhotos.value[key] === photoId && Number(key) !== index) {
      changes['stripSlots.' + key] = slotPhotos.value[index] || null
      changes['stripCrops.' + key] = null // the swapped photo starts centred too
    }
  }
  selectedPhotoId.value = null
  targetSlot.value = null
  cropSlot.value = index // show the reposition bar for what was just placed
  playSound('pop')
  await updateDoc(roomRef(), changes)
}

// Empty a slot, and remove its filter (that photo is no longer there)
async function clearSlot(index) {
  const changes = {}
  changes['stripSlots.' + index] = null
  changes['stripEdits.' + index] = null
  changes['stripCrops.' + index] = null
  if (cropSlot.value === index) cropSlot.value = null
  if (targetSlot.value === index) targetSlot.value = null
  playSound('remove')
  await updateDoc(roomRef(), changes)
}

// Phones do not support drag and drop: tap a photo, then tap a slot
// Tapping works in either order (phones have no drag and drop):
//   tap a photo / video, then tap a slot  -> it goes in that slot
//   tap a slot, then tap a photo / video  -> it goes in that slot too
function selectPhoto(photoId) {
  if (targetSlot.value !== null) {
    placePhoto(targetSlot.value, photoId) // a slot was tapped first
    return
  }
  selectedPhotoId.value = selectedPhotoId.value === photoId ? null : photoId // tap again to unselect
}

function onSlotClick(index) {
  if (selectedPhotoId.value) {
    placePhoto(index, selectedPhotoId.value) // a photo was tapped first
    return
  }
  if (targetSlot.value === index) {
    targetSlot.value = null // the same slot again: cancel
    cropSlot.value = null
    return
  }
  // Remember this slot for the next photo / video tapped. A filled slot also opens the reposition bar,
  // and the next photo tapped replaces what is in it.
  targetSlot.value = index
  cropSlot.value = slotHasMedia(index) ? index : null
}

// ---------- REPOSITIONING A PHOTO OR VIDEO IN ITS SLOT ("crop") ----------
// Moving is done by holding and dragging inside the slot (PhotoStrip.vue). This page saves the result,
// and the reposition bar under the strip has the zoom controls, Reset and Done.

// Whether a slot has a photo, a clip or an edited video in it
function slotHasMedia(index) {
  const id = slotPhotos.value[index]
  return !!(id && (photosById.value[id] || clipsById.value[id] || (editedVideos.value[id] && editedVideos.value[id].entries.length > 0)))
}

// "Photo 2" or "Video 2", for the reposition bar's title
const cropLabel = computed(() => {
  const id = slotPhotos.value[cropSlot.value]
  return (photosById.value[id] ? 'Photo ' : 'Video ') + (cropSlot.value + 1)
})

// The saved crop of the slot being repositioned
const currentCrop = computed(() => cropOf(room.value.stripCrops, cropSlot.value))

// The picture being dragged, pinched or scrolled in the strip right now ({ index, crop }), from PhotoStrip
const liveCrop = ref(null)

// Pressing, dragging or scrolling a picture in the strip: the reposition card switches to that slot straight away
function onCropStart(index) {
  if (cropSlot.value === index) return
  cropSlot.value = index
  draftZoom.value = null
}

// The zoom to show: the slider's value while it moves, the strip's while a picture is pinched or scrolled,
// otherwise the saved one
const shownZoom = computed(() => {
  if (draftZoom.value !== null) return draftZoom.value
  if (liveCrop.value && liveCrop.value.index === cropSlot.value) return liveCrop.value.crop.zoom
  return currentCrop.value.zoom
})

// The crops given to the strip. While the zoom slider moves, the strip shows it straight away on this screen.
const shownCrops = computed(() => {
  const crops = { ...(room.value.stripCrops || {}) }
  if (cropSlot.value !== null && draftZoom.value !== null) {
    crops[cropSlot.value] = { ...currentCrop.value, zoom: draftZoom.value }
  }
  return crops
})

// Save one slot's crop. 'stripCrops.2' only changes slot 2, so people repositioning different slots do not clash.
async function saveCrop(index, crop) {
  cropSlot.value = index
  await saveField(roomRef(), 'stripCrops.' + index, crop)
}

// The zoom slider: shown live while it moves (@input), saved for everyone when it is let go (@change)
function previewZoom(event) {
  draftZoom.value = Number(event.target.value)
}

async function commitZoom(event) {
  const zoom = Number(event.target.value)
  await saveCrop(cropSlot.value, { ...currentCrop.value, zoom: zoom })
  draftZoom.value = null
}

// The − and + buttons: a quarter step at a time, between 1x and MAX_ZOOM
function stepZoom(step) {
  const zoom = Math.min(MAX_ZOOM, Math.max(1, Math.round((currentCrop.value.zoom + step) * 100) / 100))
  saveCrop(cropSlot.value, { ...currentCrop.value, zoom: zoom })
}

// Phone or laptop, for the tip in the reposition bar ("pinch to zoom" or "scroll to zoom").
// To start with: a device with no precise pointer (no mouse or trackpad) is a phone or tablet.
// After that, whatever the person actually uses wins: a finger tap switches to the phone tip,
// a mouse or trackpad click switches to the laptop tip (useful for laptops with a touchscreen).
const usesTouch = ref(window.matchMedia ? !window.matchMedia('(any-pointer: fine)').matches : false) // (older browsers and tests have no matchMedia)

function onAnyPointerDown(event) {
  usesTouch.value = event.pointerType === 'touch'
}

onMounted(() => window.addEventListener('pointerdown', onAnyPointerDown))
onBeforeUnmount(() => window.removeEventListener('pointerdown', onAnyPointerDown)) // stop listening when leaving the page

// Back to the centred picture
// ---------- ZOOMING THE WHOLE STRIP ----------
// 100% is the strip as big as fits. Zoomed in, it gets bigger and the middle panel scrolls around it.
// Ways to zoom: the round + / − at the right, the mouse wheel or a trackpad pinch over the strip,
// or two fingers on a phone. Over a photo, the wheel / pinch zooms that photo instead (PhotoStrip.vue).
// Zoomed in, dragging the frame or the empty space around it moves the view.
const STRIP_ZOOMS = [1, 1.25, 1.5, 2, 2.5, 3]
const MIN_STRIP_ZOOM = STRIP_ZOOMS[0]
const MAX_STRIP_ZOOM = STRIP_ZOOMS[STRIP_ZOOMS.length - 1]
const stripZoom = ref(1)
const stripViewport = ref(null)

// + / −: the next level up or down (also from an in-between zoom made with the wheel)
function zoomStrip(step) {
  const now = stripZoom.value
  const next = step > 0
    ? STRIP_ZOOMS.find((level) => level > now + 0.001)
    : [...STRIP_ZOOMS].reverse().find((level) => level < now - 0.001)
  setStripZoom(next === undefined ? now : next)
}

// Change the zoom, keeping the point at (x, y) in the box (the mouse, or between the fingers) where it is
function setStripZoom(zoom, x, y) {
  const box = stripViewport.value
  const old = stripZoom.value
  const next = Math.min(MAX_STRIP_ZOOM, Math.max(MIN_STRIP_ZOOM, Math.round(zoom * 100) / 100))
  if (next === old) return
  stripZoom.value = next
  if (!box) return
  const px = x === undefined ? box.clientWidth / 2 : x
  const py = y === undefined ? box.clientHeight / 2 : y
  const left = box.scrollLeft
  const top = box.scrollTop
  nextTick(() => {
    box.scrollLeft = (left + px) * (next / old) - px
    box.scrollTop = (top + py) * (next / old) - py
  })
}

// The wheel (or a trackpad pinch, which comes as the wheel with Ctrl) over the strip's box
function onStripWheel(event) {
  if (event.defaultPrevented) return // a photo was zoomed (PhotoStrip.vue)
  event.preventDefault()
  const box = stripViewport.value.getBoundingClientRect()
  const speed = event.ctrlKey ? 0.01 : 0.0015 // pinches send small steps
  setStripZoom(stripZoom.value * Math.exp(-event.deltaY * speed), event.clientX - box.left, event.clientY - box.top)
}

// Zoomed in with a mouse: drag the frame or the space around it to move the view (not a photo: that moves the photo)
let viewDrag = null // { x, y, left, top } while dragging the view
const draggingView = ref(false)

function onViewPointerDown(event) {
  if (event.pointerType !== 'mouse' || event.button !== 0 || stripZoom.value <= 1) return
  if (event.target.closest('.slot, button')) return
  const box = stripViewport.value
  viewDrag = { x: event.clientX, y: event.clientY, left: box.scrollLeft, top: box.scrollTop }
  draggingView.value = true
  box.setPointerCapture(event.pointerId)
}

function onViewPointerMove(event) {
  if (!viewDrag) return
  const box = stripViewport.value
  box.scrollLeft = viewDrag.left - (event.clientX - viewDrag.x)
  box.scrollTop = viewDrag.top - (event.clientY - viewDrag.y)
}

function onViewPointerUp() {
  viewDrag = null
  draggingView.value = false
}

// Phones: two fingers on the strip zoom it (not on a photo: that zooms the photo). One finger still scrolls.
let viewPinch = null // { dist, zoom } while pinching

function touchGap(touches) {
  return Math.hypot(touches[0].clientX - touches[1].clientX, touches[0].clientY - touches[1].clientY)
}

function onViewTouchStart(event) {
  if (event.touches.length !== 2) return
  if ([...event.touches].some((touch) => touch.target.closest && touch.target.closest('.slot.croppable'))) return
  viewPinch = { dist: touchGap(event.touches), zoom: stripZoom.value }
}

function onViewTouchMove(event) {
  if (!viewPinch || event.touches.length !== 2) return
  event.preventDefault() // the strip zooms, not the whole page
  const box = stripViewport.value.getBoundingClientRect()
  const midX = (event.touches[0].clientX + event.touches[1].clientX) / 2 - box.left
  const midY = (event.touches[0].clientY + event.touches[1].clientY) / 2 - box.top
  setStripZoom(viewPinch.zoom * (touchGap(event.touches) / viewPinch.dist), midX, midY)
}

function onViewTouchEnd(event) {
  if (event.touches.length < 2) viewPinch = null
}

// touchmove has to be added by hand, to be allowed to stop the page zooming (Vue's @touchmove is passive here)
onMounted(() => {
  if (stripViewport.value) stripViewport.value.addEventListener('touchmove', onViewTouchMove, { passive: false })
})
onBeforeUnmount(() => {
  if (stripViewport.value) stripViewport.value.removeEventListener('touchmove', onViewTouchMove)
})

// Done in the reposition card: nothing selected any more
function finishCrop() {
  cropSlot.value = null
  targetSlot.value = null
}

function resetCrop() {
  saveCrop(cropSlot.value, null)
}

// ---------- FRAMES ----------


// A style only changes the colours and slot shape, so the photos stay
async function chooseStyle(id) {
  if (id === frameStyle.value.id) return
  if (!(await sureToChangeFrame(layout.value.slots.length))) return
  await saveFields(roomRef(), { stripStyleId: id, stripCustomTemplate: null })
}

// Changing the frame changes it for everyone in the room. Once there are photos on the strip, ask first,
// and say what happens to them (newSlots: how many slots the new frame has). True: go ahead.
async function sureToChangeFrame(newSlots) {
  const filled = layout.value.slots.filter((slot, index) => slotHasMedia(index)).length
  if (filled === 0) return true
  const now = layout.value.slots.length
  let message = 'Everyone in the room will see the new frame. The photos stay in their slots.'
  if (newSlots < now) {
    message = 'It has ' + newSlots + ' slots instead of ' + now + ', so the photos in the last '
      + (now - newSlots === 1 ? 'slot are' : (now - newSlots) + ' slots are') + ' left out. Everyone in the room will see the change.'
  } else if (newSlots > now) {
    message = 'It has ' + newSlots + ' slots instead of ' + now + ', so ' + (newSlots - now)
      + ' more need filling before you can move on. Everyone in the room will see the change.'
  }
  return askConfirm({
    title: 'Change the frame?',
    message: message,
    confirmLabel: 'Change frame',
    cancelLabel: 'Keep this one',
    danger: newSlots < now,
    icon: 'layout',
  })
}

// Choose a saved template from the Template Editor
async function chooseCustomTemplate(tpl) {
  try {
    if (tpl.id === frameStyle.value.id) return // already the frame in use
    const { fields, slotCount } = await templateFrameFields(tpl)
    if (!(await sureToChangeFrame(slotCount))) return

    await saveFields(roomRef(), fields)
  } catch (err) {
    console.error('Failed to apply custom template:', err)
  }
}

// Change a saved edited video: it is loaded into the Video page's timeline, and everyone moves there
async function editSaved(edit) {
  await updateDoc(roomRef(), { videoTimeline: edit.timeline, videoEditing: edit.id, stage: 'video' })
}

// Work out the cut of every frame that is on screen (and of new ones as they load)
watch(
  () => [
    ...shownStudioFrames.value,
    ...(sectionOpen('mine') ? mineTemplates.value : []),
    ...(sectionOpen('saved') ? savedTemplates.value : []),
  ],
  (frames) => frames.forEach(workOutCut),
  { immediate: true }
)
</script>

<template>
  <!-- app-page: the shared Blue Studios look (colours, font, buttons) from pages.css, see design.md -->
  <div class="app-page room-page">
  <StageBar current="pick" />

  <!-- 3 columns from Bootstrap "lg" (992px) up. On phones: strip first, then gallery, then frames -->
  <div class="row g-3">
    <!-- LEFT: gallery -->
    <div class="col-12 col-md-6 col-lg-3 order-2 order-lg-1">
      <div class="panel gallery-panel" :class="{ 'tip-target': pickTip && pickTip.target === 'gallery' }">
        <div class="panel-head mb-3">
          <h2 class="section-title mb-0">Gallery</h2>
          <!-- Shows the how-to tips again -->
          <button type="button" class="tip-help" title="How to fill the strip" aria-label="How to fill the strip" @click="showPickTips">?</button>
          <PageTip
            v-if="pickTip && pickTip.target === 'gallery'"
            class="tip-under-head"
            :title="pickTip.title"
            :text="pickTip.text"
            :phone="pickTip.phone"
            :step="pickTipIndex + 1"
            :total="PICK_TIPS.length"
            @next="nextPickTip"
            @skip="closePickTips"
          />
        </div>

        <div v-if="sessions.length === 0" class="empty-state">
          <div class="empty-icon"><AppIcon name="camera" :size="22" /></div>
          <p class="mb-2">No photos or videos yet.</p>
          <button type="button" class="btn btn-outline-secondary btn-sm" @click="goToStage('shoot')">Go to the camera</button>
        </div>

        <!-- The videos made on the Video page, to drag into a slot like a photo. Each one has a dark tag with scissors. -->
        <section v-if="editedList.length > 0" class="mb-3">
          <h3 class="group-label"><span class="badge edited-badge"><AppIcon name="scissors" :size="11" /> Edited videos</span></h3>
          <div class="row g-2 session-box edited-box">
            <div v-for="edit in editedList" :key="edit.id" class="col-6">
              <div
                class="thumb video-thumb edited"
                :class="{ selected: edit.id === selectedPhotoId }"
                draggable="true"
                data-sound="click"
                @dragstart="onPhotoDragStart($event, edit)"
                @click="selectPhoto(edit.id)"
              >
                <EditedVideoThumb :edited="edit" />
                <span class="name-tag edited-tag"><AppIcon name="scissors" :size="10" /> {{ edit.name }}</span>
                <span v-if="isUsed(edit.id)" class="used-tick used-left">✓</span>
              </div>
              <!-- How long it is, and a shortcut to change it on the Video page -->
              <div class="small text-muted d-flex justify-content-between">
                <span>{{ edit.entries.length }} clip(s) · {{ edit.seconds.toFixed(1) }}s</span>
                <button class="btn btn-link btn-sm p-0 align-baseline" @click="editSaved(edit)">Edit</button>
              </div>
            </div>
          </div>
        </section>

        <!-- Scrolls up and down through the sessions; 2 per row in each session (col-6), like the gallery on the camera page -->
        <div class="gallery-scroll">
          <section v-for="session in sessions" :key="session.shotNumber" class="mb-3">
            <h3 class="group-label">Shot {{ session.shotNumber }}</h3>
            <div class="row g-2 session-box">
              <div v-for="photo in session.photos" :key="photo.id" class="col-6">
                <div class="thumb" :class="{ selected: photo.id === selectedPhotoId }">
                  <img
                    :src="photo.image"
                    :alt="'Photo by ' + photo.name"
                    draggable="true"
                    data-sound="click"
                    @dragstart="onPhotoDragStart($event, photo)"
                    @click="selectPhoto(photo.id)"
                  />
                  <span class="name-tag">{{ initials(photo.name) }} · #{{ session.shotNumber }}</span>
                  <span v-if="isUsed(photo.id)" class="used-tick">✓</span>
                </div>
              </div>

              <!-- The session's unedited clips: drag or tap like a photo. The round play button plays it right here. -->
              <div v-for="clip in session.clips" :key="clip.id" class="col-6">
                <div
                  class="thumb clip-thumb"
                  :class="{ selected: clip.id === selectedPhotoId }"
                  draggable="true"
                  data-sound="click"
                  @dragstart="onPhotoDragStart($event, clip)"
                  @click="selectPhoto(clip.id)"
                >
                  <ClipThumb :clip="clip" badge-plays />
                  <span class="name-tag">{{ initials(clip.name) }} · #{{ session.shotNumber }}</span>
                  <span v-if="isUsed(clip.id)" class="used-tick">✓</span>
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>

    <!-- MIDDLE: the strip (the same for everyone) -->
    <div class="col-12 col-lg-6 order-1 order-lg-2">
      <div class="panel canvas-area position-relative" :class="{ 'tip-target': pickTip && pickTip.target === 'strip' }">
        <PageTip
          v-if="pickTip && pickTip.target === 'strip'"
          class="tip-on-strip"
          arrow="down"
          :title="pickTip.title"
          :text="pickTip.text"
            :phone="pickTip.phone"
          :step="pickTipIndex + 1"
          :total="PICK_TIPS.length"
          @next="nextPickTip"
          @skip="closePickTips"
        />
        <div class="stage-layout" :style="{ '--strip-aspect': layout.aspect, '--strip-zoom': stripZoom }">
          <!-- LEFT: the reposition card for the slot picked, or a short note on how to get it -->
          <div class="stage-side">
            <div v-if="cropSlot !== null && slotHasMedia(cropSlot)" class="reposition-card" role="group" :aria-label="'Reposition ' + cropLabel">
              <div class="reposition-head mb-3">
                <span class="reposition-icon" aria-hidden="true"><AppIcon name="image" :size="18" /></span>
                <div class="reposition-title">Reposition {{ cropLabel }}</div>
              </div>

              <!-- Zoom: − / slider / + . Zooming in gives the picture room to move. -->
              <div class="reposition-zoom-label">
                <span>Zoom</span>
                <span class="zoom-value tabular">{{ shownZoom.toFixed(1) }}×</span>
              </div>
              <div class="d-flex align-items-center gap-2">
                <button class="zoom-btn" :disabled="shownZoom <= 1" aria-label="Zoom out" title="Zoom out" @click="stepZoom(-0.25)">−</button>
                <input
                  type="range"
                  class="form-range flex-grow-1"
                  min="1"
                  :max="MAX_ZOOM"
                  step="0.05"
                  :value="shownZoom"
                  aria-label="Zoom"
                  @input="previewZoom"
                  @change="commitZoom"
                />
                <button class="zoom-btn" :disabled="shownZoom >= MAX_ZOOM" aria-label="Zoom in" title="Zoom in" @click="stepZoom(0.25)">+</button>
              </div>

              <button class="btn btn-primary btn-sm w-100 mt-3" @click="finishCrop">Done</button>
              <div class="d-flex gap-2 mt-2">
                <button class="btn btn-outline-secondary btn-sm flex-fill" @click="resetCrop">Reset</button>
                <button class="btn btn-outline-danger btn-sm flex-fill" data-test="remove-from-bar" @click="clearSlot(cropSlot)">Remove</button>
              </div>
            </div>
            <div v-else class="reposition-empty">
              <span class="reposition-icon muted" aria-hidden="true"><AppIcon name="image" :size="18" /></span>
              <p class="mb-0">{{ usesTouch ? 'Tap' : 'Click' }} a photo in the strip to reposition it.</p>
            </div>
          </div>

          <!-- MIDDLE: the strip. Zoomed in, this box scrolls around it. -->
          <div
            ref="stripViewport"
            class="strip-viewport"
            :class="{ zoomed: stripZoom > 1, 'dragging-view': draggingView }"
            @wheel="onStripWheel"
            @pointerdown="onViewPointerDown"
            @pointermove="onViewPointerMove"
            @pointerup="onViewPointerUp"
            @pointercancel="onViewPointerUp"
            @touchstart.passive="onViewTouchStart"
            @touchend.passive="onViewTouchEnd"
            @touchcancel.passive="onViewTouchEnd"
          >
            <div class="strip-stage">
              <PhotoStrip
                mode="pick"
                :layout="layout"
                :frame-style="frameStyle"
                :photos-by-id="photosById"
                :slot-photos="slotPhotos"
                :clips="clips"
                :edited-videos="editedVideos"
                :edits="room.stripEdits || {}"
                :crops="shownCrops"
                :stickers="safeStickers(room.stripStickers)"
                :selected-slot="targetSlot !== null ? targetSlot : cropSlot"
                :flash-empty="flashEmpty"
                @drop-photo="placePhoto"
                @slot-click="onSlotClick"
                @clear-slot="clearSlot"
                @crop-slot="saveCrop"
                @crop-start="onCropStart"
                @crop-preview="liveCrop = $event"
              />
            </div>
          </div>

          <!-- RIGHT: zoom the whole strip, so it is easier to see -->
          <div class="strip-zoom" role="group" aria-label="Zoom the strip">
            <button type="button" class="strip-zoom-btn" :disabled="stripZoom >= MAX_STRIP_ZOOM" aria-label="Zoom in on the strip" title="Zoom in" data-test="strip-zoom-in" @click="zoomStrip(1)">
              <AppIcon name="plus" :size="16" />
            </button>
            <span class="strip-zoom-value" aria-live="polite">{{ Math.round(stripZoom * 100) }}%</span>
            <button type="button" class="strip-zoom-btn" :disabled="stripZoom <= 1" aria-label="Zoom out on the strip" title="Zoom out" data-test="strip-zoom-out" @click="zoomStrip(-1)">−</button>
            <span class="strip-zoom-line" aria-hidden="true"></span>
            <button type="button" class="strip-zoom-btn" :disabled="stripZoom === 1" aria-label="Fit the strip" title="Fit" @click="setStripZoom(1)">
              <AppIcon name="minimize" :size="15" />
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- RIGHT: saved frames -->
    <div class="col-12 col-md-6 col-lg-3 order-3 frames-col">
      <div class="panel frames-panel d-flex flex-column" :class="{ 'tip-target': pickTip && pickTip.target === 'frames' }">
        <div class="panel-head">
          <h2 class="section-title">Saved frames</h2>
          <PageTip
            v-if="pickTip && pickTip.target === 'frames'"
            class="tip-under-head"
            :title="pickTip.title"
            :text="pickTip.text"
            :phone="pickTip.phone"
            :step="pickTipIndex + 1"
            :total="PICK_TIPS.length"
            @next="nextPickTip"
            @skip="closePickTips"
          />
        </div>

        <!-- The frame the room is using, at the top so it is easy to see: its picture, name and cut -->
        <div v-if="room.stripCustomTemplate" class="active-frame">
          <img v-if="room.stripCustomTemplate.thumbnailUrl" :src="room.stripCustomTemplate.thumbnailUrl" alt="" class="active-frame-thumb" />
          <div class="active-frame-text">
            <div class="active-frame-name text-truncate">{{ room.stripCustomTemplate.name }}</div>
            <div v-if="activeCut" class="active-frame-cut">{{ activeCut }}</div>
          </div>
        </div>

        <!-- The frames, in 3 dropdowns. On computers the list scrolls inside the panel, so a long list
             does not stretch the row and the strip in the middle keeps its size. -->
        <div class="frames-scroll">
          <!-- DEFAULT: the frames published by the Blue Studios account, a dropdown per category -->
          <section class="frame-section" :class="{ open: sectionOpen('default') }">
            <button
              type="button"
              class="section-toggle"
              :aria-expanded="sectionOpen('default')"
              aria-controls="frames-default"
              data-test="section-default"
              @click="toggleSection('default')"
            >
              <span>Blue Studios</span>
              <span v-if="studioFrames.length" class="section-count">{{ studioFrames.length }}</span>
              <AppIcon name="chevron-down" :size="16" class="toggle-chevron" />
            </button>
            <div v-if="sectionOpen('default')" id="frames-default" class="section-body">
              <div v-if="loadingStudioFrames" class="frame-grid" role="status" aria-label="Loading frames">
                <span v-for="n in 4" :key="n" class="skeleton frame-skeleton"></span>
              </div>
              <template v-else-if="studioFrames.length">
                <div v-for="group in studioGroups" :key="group.id" class="frame-group" :class="{ open: groupOpen(group) }">
                  <button
                    type="button"
                    class="group-toggle"
                    :aria-expanded="groupOpen(group)"
                    :aria-controls="'frames-' + group.id"
                    @click="toggleGroup(group)"
                  >
                    <span>{{ group.label }}</span>
                    <span class="group-count">{{ group.frames.length }}</span>
                    <AppIcon name="chevron-down" :size="14" class="toggle-chevron" />
                  </button>
                  <div v-if="groupOpen(group)" :id="'frames-' + group.id" class="frame-grid group-grid">
                    <FrameTile
                      v-for="tpl in group.frames"
                      :key="tpl.id"
                      :frame="tpl"
                      :cut="cutOf(tpl)"
                      :active="tpl.id === frameStyle.id"
                      @choose="chooseCustomTemplate(tpl)"
                    />
                  </div>
                </div>
              </template>
              <!-- No Blue Studios frames could be loaded: the built-in colour frames -->
              <div v-else class="frame-grid">
                <FrameTile
                  v-for="st in defaultStyles"
                  :key="st.id"
                  :frame="{ ...st, name: st.caption }"
                  :cut="cutLabel(layout.slots)"
                  :active="st.id === frameStyle.id"
                  @choose="chooseStyle(st.id)"
                />
              </div>
            </div>
          </section>

          <!-- MINE: frames this account made -->
          <section class="frame-section" :class="{ open: sectionOpen('mine') }">
            <button
              type="button"
              class="section-toggle"
              :aria-expanded="sectionOpen('mine')"
              aria-controls="frames-mine"
              data-test="section-mine"
              @click="toggleSection('mine')"
            >
              <span>Mine</span>
              <span v-if="mineTemplates.length" class="section-count">{{ mineTemplates.length }}</span>
              <AppIcon name="chevron-down" :size="16" class="toggle-chevron" />
            </button>
            <div v-if="sectionOpen('mine')" id="frames-mine" class="section-body">
              <div v-if="mineTemplates.length" class="frame-grid">
                <FrameTile
                  v-for="tpl in mineTemplates"
                  :key="tpl.id"
                  :frame="tpl"
                  :cut="cutOf(tpl)"
                  :active="tpl.id === frameStyle.id"
                  @choose="chooseCustomTemplate(tpl)"
                />
              </div>
              <p v-else-if="!isAccount" class="group-empty">Log in to use the frames you made.</p>
              <p v-else-if="loadingTemplates" class="group-empty" role="status">Loading your frames…</p>
              <p v-else class="group-empty">No frames yet. Frames you make in the Frame Editor show up here.</p>
            </div>
          </section>

          <!-- SAVED: templates saved from the marketplace (in My Studio) -->
          <section v-if="savedTemplates.length" class="frame-section" :class="{ open: sectionOpen('saved') }">
            <button
              type="button"
              class="section-toggle"
              :aria-expanded="sectionOpen('saved')"
              aria-controls="frames-saved"
              data-test="section-saved"
              @click="toggleSection('saved')"
            >
              <span>Saved</span>
              <span class="section-count">{{ savedTemplates.length }}</span>
              <AppIcon name="chevron-down" :size="16" class="toggle-chevron" />
            </button>
            <div v-if="sectionOpen('saved')" id="frames-saved" class="section-body">
              <div class="frame-grid">
                <FrameTile
                  v-for="tpl in savedTemplates"
                  :key="tpl.id"
                  :frame="{ ...tpl, saved: true }"
                  :cut="cutOf(tpl)"
                  :active="tpl.id === frameStyle.id"
                  @choose="chooseCustomTemplate(tpl)"
                />
              </div>
            </div>
          </section>
        </div>

        <!-- Next, Quick export and Edit video are in the floating pill (RoomStageNav.vue) -->
      </div>
    </div>
  </div>
  </div>
</template>

<style scoped>
/* Styles follow design.md: the colours are the app-page variables (--brand, --ink, --muted, --line, --soft),
   corners 10px (buttons, tiles) / 16px (cards), soft low shadows, hover only with a mouse,
   and every movement switched off for people who ask for reduced motion (at the bottom). */

/* ---------- Page and panels ---------- */
.room-page {
  padding-bottom: 24px;
  /* The same sizes on Pick and Decorate (PickView.vue and DecorateView.vue keep these the same):
     --stage-h  the most the strip can be tall
     --panel-h  on computers, all 3 panels are exactly this tall, whatever is in them (the side panels scroll inside),
                so nothing grows or shrinks when the frame, the photos or the stickers change */
  --stage-h: min(76vh, 740px);
  --panel-h: calc(var(--stage-h) + 40px); /* + the panel's padding */
}

/* Tablets and phones: the panels stack, and the strip is a bit shorter so the panels below are not far away */
@media (max-width: 991.98px) {
  .room-page {
    --stage-h: min(62vh, 560px);
  }
}

/* A card: white, 16px corners, a thin line and the soft card shadow */
.panel {
  background: #fff;
  border: 1px solid var(--line);
  border-radius: 16px;
  padding: 20px;
  height: 100%;
  box-shadow: 0 1px 2px rgba(20, 23, 43, 0.04);
}

/* The middle: the strip on a soft grey well, always the same size whatever frame is chosen
   (the strip is never taller than --stage-h, see PhotoStrip.vue) */
.canvas-area {
  container: stage / inline-size; /* the layout inside switches on the panel's own width (see below) */
  background: var(--soft);
  min-height: calc(var(--stage-h) + 40px); /* + the panel's padding */
  display: flex;
  flex-direction: column;
  justify-content: center;
}

.section-title {
  font-size: 1.15rem;
  font-weight: 700;
  text-wrap: balance;
}

/* Small uppercase labels for the parts of a panel (Default, Mine, Saved, Shot 1) */
.group-label {
  margin: 16px 0 8px;
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--muted);
}

.group-label:first-of-type {
  margin-top: 4px;
}

/* The count next to a title, e.g. "Mine 3" */
.section-count {
  display: inline-block;
  margin-left: 4px;
  padding: 1px 7px;
  border-radius: 999px;
  background: var(--brand-tint);
  color: var(--brand);
  font-size: 0.68rem;
  font-weight: 700;
  letter-spacing: 0;
  font-variant-numeric: tabular-nums;
  vertical-align: 1px;
}

.hint,
.group-empty {
  margin: 0 0 12px;
  font-size: 0.82rem;
  color: var(--muted);
  text-wrap: pretty;
}

.group-empty {
  margin-bottom: 4px;
}

.tabular {
  font-variant-numeric: tabular-nums;
}

.back-link {
  font-size: 0.82rem;
  font-weight: 600;
}

/* ---------- Frames ---------- */
/* 4 per row; each tile is a FrameTile card (picture + cut label, bigger preview on hover).
   The cards keep one size (72px wide at most) and the space left over goes between them. */
.frame-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 72px));
  justify-content: space-between;
  gap: 10px 8px;
  padding: 3px; /* room for the chosen frame's blue ring */
}

/* Grey placeholders while the default frames load, the size of a card */
.frame-skeleton {
  display: block;
  width: 100%;
  max-width: 72px;
  aspect-ratio: 3 / 4.6;
  border-radius: 10px;
}

/* The frame the room is using, at the top of Saved frames: just its picture and name */
.active-frame {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 4px;
  padding: 8px 10px;
  background: var(--brand-tint);
  border: 1px solid var(--brand-tint);
  border-radius: 10px;
}

.active-frame-thumb {
  width: 24px;
  height: 32px;
  object-fit: contain;
  flex-shrink: 0;
}

.active-frame-text {
  min-width: 0;
  line-height: 1.25;
}

.active-frame-name {
  font-size: 0.85rem;
  font-weight: 700;
  color: var(--ink);
}

/* "4-cut" under the name */
.active-frame-cut {
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--brand);
  font-variant-numeric: tabular-nums;
}

/* ---------- The frame list: Default, Mine, Saved dropdowns ---------- */
/* The list scrolls on its own (on phones and tablets a set height; on computers, see below) */
.frames-scroll {
  max-height: 60vh;
  margin-top: 4px;
  overflow-y: auto;
  overscroll-behavior: contain;
  scrollbar-width: thin;
  scrollbar-color: var(--line) transparent;
}

.frames-scroll::-webkit-scrollbar {
  width: 6px;
}

.frames-scroll::-webkit-scrollbar-thumb {
  background: var(--line);
  border-radius: 999px;
}

/* Computers: the frames panel is exactly as tall as the row (the strip and gallery decide it),
   and only the list inside it scrolls */
@media (min-width: 992px) {
  .frames-col {
    position: relative;
  }

  .frames-col > .frames-panel {
    position: absolute;
    top: 0;
    bottom: 0;
    left: calc(var(--bs-gutter-x) * 0.5);
    right: calc(var(--bs-gutter-x) * 0.5);
    height: auto;
  }

  .frames-scroll {
    flex: 1 1 auto;
    min-height: 0;
    max-height: none;
  }
}

/* A thin line between the 3 dropdowns */
.frame-section + .frame-section {
  border-top: 1px solid var(--line);
}

/* DEFAULT / MINE / SAVED: black capitals */
.section-toggle {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  padding: 12px 6px;
  border: 0;
  border-radius: 10px;
  background: transparent;
  color: var(--ink);
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-align: left;
  text-transform: uppercase;
  transition: background-color 150ms ease;
}

.section-toggle .section-count {
  margin-left: 0;
}

/* The categories inside Default: grey, normal case, a little smaller */
.group-toggle {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  padding: 7px 8px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--muted);
  font-size: 0.82rem;
  font-weight: 600;
  text-align: left;
  transition: background-color 150ms ease, color 150ms ease;
}

.group-count {
  font-size: 0.75rem;
  font-weight: 500;
  opacity: 0.75;
  font-variant-numeric: tabular-nums;
}

/* An open category sits on a soft grey strip, so it is clear which frames belong to it */
.frame-group.open > .group-toggle {
  background: var(--soft);
}

.frame-group + .frame-group {
  margin-top: 2px;
}

.section-toggle:focus-visible,
.group-toggle:focus-visible {
  outline: 2px solid var(--brand);
  outline-offset: -2px;
}

/* The arrow on the right turns over when the dropdown is open */
.toggle-chevron {
  flex-shrink: 0;
  margin-left: auto;
  color: var(--muted);
  transition: transform 200ms var(--ease-out);
}

.frame-section.open > .section-toggle .toggle-chevron,
.frame-group.open > .group-toggle .toggle-chevron {
  transform: rotate(180deg);
}

.section-body {
  padding: 0 0 12px;
}

.group-grid {
  padding: 8px 3px 10px;
}

/* The frames fade in when a dropdown opens */
.section-body,
.group-grid {
  transition: opacity 200ms var(--ease-out), transform 200ms var(--ease-out);
}

@starting-style {
  .section-body,
  .group-grid {
    opacity: 0;
    transform: translateY(-4px);
  }
}

@media (hover: hover) and (pointer: fine) {
  .section-toggle:hover,
  .group-toggle:hover {
    background: var(--soft);
  }

  .group-toggle:hover {
    color: var(--ink);
  }
}

@media (prefers-reduced-motion: reduce) {
  .toggle-chevron,
  .section-body,
  .group-grid {
    transition: none;
  }
}

/* ---------- First-time tips (PageTip.vue) ---------- */
/* A panel heading that a tip can hang under */
.panel-head {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.panel-head .section-title {
  margin-bottom: 14px;
}

.panel-head.mb-3 .section-title {
  margin-bottom: 0;
}

/* Under the heading, the arrow pointing up at it */
.tip-under-head {
  top: calc(100% + 10px);
  left: 0;
}

/* On the strip: at the top, the arrow pointing down at it */
.tip-on-strip {
  top: 16px;
  left: 16px;
}

/* The panel a tip is about gets a soft blue ring (like the Sticker Maker's tips) */
.panel.tip-target {
  border-color: var(--brand);
  box-shadow: 0 0 0 4px rgba(47, 91, 234, 0.15);
  transition: border-color 200ms ease, box-shadow 200ms ease;
}

/* The round "?" that shows the tips again (the same as the Sticker Maker's) */
.tip-help {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  flex-shrink: 0;
  border: 1px solid var(--line);
  border-radius: 999px;
  background: #ffffff;
  color: var(--muted);
  font-size: 0.85rem;
  font-weight: 700;
  transition: color 150ms ease, border-color 150ms ease, transform 160ms var(--ease-out);
}

.tip-help:active {
  transform: scale(0.97);
}

.tip-help:focus-visible {
  outline: 2px solid var(--brand);
  outline-offset: 2px;
}

@media (hover: hover) and (pointer: fine) {
  .tip-help:hover {
    color: var(--brand);
    border-color: var(--brand);
  }
}

@media (prefers-reduced-motion: reduce) {
  .tip-help:active {
    transform: none;
  }
}

/* ---------- The middle: reposition card | strip | zoom controls ---------- */
.stage-layout {
  display: grid;
  grid-template-columns: 184px minmax(0, 1fr) 44px;
  gap: 12px;
  height: var(--stage-h);
}

.stage-side {
  align-self: center;
  min-width: 0;
}

/* The strip's box: as big as fits, times the zoom. Zoomed in, the box scrolls.
   (margin: auto centres the strip but, unlike centring with flex, it can still be scrolled to every edge) */
.strip-viewport {
  display: flex;
  min-width: 0;
  height: 100%;
  overflow: auto;
  overscroll-behavior: contain;
  container-type: inline-size;
  scrollbar-width: thin;
  scrollbar-color: var(--line) transparent;
}

/* Zoomed in: a hand over the frame and the space around it, to drag the view */
.strip-viewport.zoomed {
  cursor: grab;
}

.strip-viewport.dragging-view {
  cursor: grabbing;
  user-select: none;
}

.strip-stage {
  --strip-max-w: none;
  flex: none;
  width: calc(min(100cqw, (var(--stage-h) - 12px) * var(--strip-aspect, 0.3)) * var(--strip-zoom, 1));
  margin: auto;
  padding: 2px 0;
}

/* The round zoom controls on the right */
.strip-zoom {
  align-self: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 4px;
  background: #fff;
  border: 1px solid var(--line);
  border-radius: 999px;
  box-shadow: 0 1px 2px rgba(20, 23, 43, 0.04), 0 8px 24px rgba(20, 23, 43, 0.06);
}

.strip-zoom-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  padding: 0;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: var(--ink);
  font-size: 1.15rem;
  font-weight: 700;
  line-height: 1;
  transition: background-color 150ms ease, color 150ms ease, transform 160ms var(--ease-out);
}

.strip-zoom-btn:active:not(:disabled) {
  transform: scale(0.97);
}

.strip-zoom-btn:disabled {
  opacity: 0.35;
}

.strip-zoom-btn:focus-visible {
  outline: 2px solid var(--brand);
  outline-offset: 1px;
}

.strip-zoom-value {
  font-size: 0.66rem;
  font-weight: 700;
  color: var(--brand);
  font-variant-numeric: tabular-nums;
}

.strip-zoom-line {
  width: 18px;
  height: 1px;
  margin: 2px 0;
  background: var(--line);
}

/* The reposition card, on the left of the strip */
.reposition-card {
  background: #fff;
  border: 1px solid var(--line);
  border-radius: 16px;
  padding: 14px;
  box-shadow: 0 1px 2px rgba(20, 23, 43, 0.04), 0 12px 32px rgba(20, 23, 43, 0.06);
  transition: opacity 200ms var(--ease-out), transform 200ms var(--ease-out);
}

@starting-style {
  .reposition-card {
    opacity: 0;
    transform: translateX(-6px);
  }
}

.reposition-head {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 8px;
}

.reposition-title {
  font-size: 0.85rem;
  font-weight: 700;
  line-height: 1.25;
}

.reposition-zoom-label {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: 4px;
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--muted);
}

/* Nothing picked yet: a quiet dashed note in the same place */
.reposition-empty {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 14px;
  border: 1px dashed var(--line);
  border-radius: 16px;
  color: var(--muted);
  font-size: 0.8rem;
  line-height: 1.45;
  text-wrap: pretty;
}

/* Narrow middle panel (tablets in two columns, phones): the strip and zoom controls side by side,
   the reposition card under them, sticking to the bottom of the screen while the strip is in view */
@container stage (max-width: 520px) {
  .stage-layout {
    grid-template-columns: minmax(0, 1fr) 44px;
    grid-template-rows: var(--stage-h) auto;
    height: auto;
  }

  .stage-side {
    grid-column: 1 / -1;
    grid-row: 2;
  }

  .reposition-card {
    position: sticky;
    /* Sticks just above the docked Back / Next bar (RoomStageNav.vue sets its height as --stage-nav-h),
       not the bottom of the screen, where that bar would cover the card's buttons */
    bottom: calc(var(--stage-nav-h, 56px) + 12px);
    z-index: 30;
    max-width: 320px;
    margin: 0 auto;
  }

  .reposition-empty {
    display: none;
  }
}

@media (hover: hover) and (pointer: fine) {
  .strip-zoom-btn:hover:not(:disabled) {
    background: var(--soft);
    color: var(--brand);
  }
}

@media (prefers-reduced-motion: reduce) {
  .reposition-card {
    transition: none;
  }

  .strip-zoom-btn:active:not(:disabled) {
    transform: none;
  }
}

.reposition-icon.muted {
  background: var(--soft);
  color: var(--muted);
}

/* Round − and + buttons (32px tap targets) */
.zoom-btn {
  width: 32px;
  height: 32px;
  flex-shrink: 0;
  border-radius: 999px;
  border: 1px solid var(--line);
  background: #fff;
  color: var(--ink);
  font-weight: 700;
  line-height: 1;
  transition: background-color 150ms ease, color 150ms ease, border-color 150ms ease, transform 160ms var(--ease-out);
}

.zoom-btn:active:not(:disabled) {
  transform: scale(0.97);
}

.zoom-btn:disabled {
  opacity: 0.4;
}

.zoom-value {
  min-width: 36px;
  text-align: right;
  font-size: 0.78rem;
  font-weight: 700;
  color: var(--brand);
}

/* ---------- Gallery ---------- */
.gallery-scroll {
  max-height: 70vh; /* a fixed height, so the sessions scroll inside the card */
  overflow-y: auto;
  overflow-x: hidden;
  padding-right: 4px;
}

.session-box {
  border: 1px solid var(--line);
  border-radius: 10px;
  padding: 6px;
  margin: 0;
}

.thumb {
  position: relative;
  border-radius: 10px;
  overflow: hidden;
  border: 3px solid transparent;
  transition: border-color 150ms ease, transform 160ms var(--ease-out);
}

.thumb:active {
  transform: scale(0.97);
}

.thumb.selected {
  border-color: var(--brand);
}

.video-thumb {
  aspect-ratio: 4 / 3; /* the same shape as a photo (and as the gallery on the camera page) */
  background: #0E1020; /* dark surfaces in a room are navy, not black */
  cursor: grab;
}

/* The edited video has a dark ink tag and line (not blue, which means "chosen"), so it is easy to tell from a normal photo or clip */
.edited-badge,
.edited-tag {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  background: var(--ink, #14172B);
  color: #fff;
}

.edited-box {
  border-color: var(--ink, #14172B);
}

.thumb.edited {
  border-color: var(--ink, #14172B);
}

.used-left {
  left: 4px;
  right: auto;
}

.thumb.edited.selected {
  border-color: var(--brand);
}

/* An unedited clip is exactly the size of a photo: the full width of its column, in the same 4:3 shape.
   The video is laid over the tile (absolute), so its own size cannot stretch or shrink the tile.
   The video ignores the mouse, so the whole tile is dragged. */
.clip-thumb :deep(.clip) {
  width: 100%;
  aspect-ratio: 4 / 3;
  border-radius: 0;
  cursor: grab;
}

.clip-thumb :deep(video) {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

/* The play button is in the top-right corner of a clip, so its "used" tick moves to the top-left */
.clip-thumb .used-tick {
  left: 4px;
  right: auto;
}

.video-thumb video {
  pointer-events: none; /* so the whole tile is dragged, not the video inside it */
}

.thumb img {
  width: 100%;
  aspect-ratio: 4 / 3; /* the same shape as the photos taken (and the gallery on the camera page) */
  object-fit: cover;
  display: block;
  cursor: grab;
}

.name-tag {
  position: absolute;
  left: 4px;
  bottom: 4px;
  background: #fff;
  color: var(--ink);
  border-radius: 999px;
  font-size: 0.6rem;
  padding: 0 6px;
  font-weight: 600;
}

.used-tick {
  position: absolute;
  right: 4px;
  top: 4px;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: var(--brand);
  color: #fff;
  font-size: 0.65rem;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* Keyboard focus is always visible */
.zoom-btn:focus-visible {
  outline: 2px solid var(--brand);
  outline-offset: 2px;
}

/* Hover colours only with a real mouse (otherwise phones keep them stuck after a tap) */
@media (hover: hover) and (pointer: fine) {
  .zoom-btn:hover:not(:disabled) {
    background: var(--brand-tint);
    color: var(--brand);
    border-color: var(--brand);
  }
}

/* ---------- Smaller screens ---------- */
/* Tablets and phones: the panels stack, so the long lists get shorter scroll areas */
@media (max-width: 991.98px) {
  .gallery-scroll {
    max-height: 55vh; /* leaves room to reach the frames below */
  }
}

/* Computers: every panel exactly --panel-h tall. The gallery scrolls inside (the frames panel, see above). */
@media (min-width: 992px) {
  .canvas-area {
    height: var(--panel-h);
  }

  .gallery-panel {
    display: flex;
    flex-direction: column;
    height: var(--panel-h);
  }

  .gallery-panel .gallery-scroll {
    flex: 1 1 auto;
    min-height: 0;
    max-height: none;
  }
}

/* Phones: cards keep 16px of space inside, and the buttons are full width */
@media (max-width: 575.98px) {
  .panel {
    padding: 16px;
  }
}

/* Reduced motion: no movement (colour fades stay) */
@media (prefers-reduced-motion: reduce) {
  .thumb,
  .zoom-btn {
    transition: border-color 150ms ease, background-color 150ms ease;
  }

  .thumb:active,
  .zoom-btn:active:not(:disabled) {
    transform: none;
  }
}
</style>
