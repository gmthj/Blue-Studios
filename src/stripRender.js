// filterCss turns a slot's saved filter and sliders into a CSS filter text (the same as on screen)
import { filterCss } from './stripData.js'
// getClipUrl gives a local address of a clip's video. CLIP_SECONDS is how long a raw clip is.
import { getClipUrl, CLIP_SECONDS } from './clips.js'

// Draws the finished strip on a <canvas> as an animation, and records it as a video.
// Used by the Export page (see ExportView.vue).
//
// A "scene" holds everything already downloaded (photos, stickers, videos), so any moment can be drawn quickly:
//   const scene = await createScene({ layout, frameStyle, photosById, slotPhotos, edits, stickers, clips, editedVideos })
//   scene.tick(t)                  // start / pause the videos so they match the time t (seconds)
//   scene.draw(ctx, W, H, t)       // draw the strip as it looks t seconds in
//   scene.stop()                   // pause everything
//   const blob = await recordScene(scene, { width, fps, seconds, onProgress, isCancelled })
//
// Every slot with a video is a "track": the clips that play in it, one after another. A raw clip is a track
// of one clip. A track shorter than the video repeats from its start (t % the track's length).

// How many seconds before a clip's turn it is jumped to its start (so it is ready the moment it plays)
const PREPARE_AHEAD = 0.4

// Sticker images can be set by anyone in the room, so only these places are allowed (see Germaine's guide)
const TRUSTED_STICKER_SOURCES = ['https://firebasestorage.googleapis.com/', 'data:image/', 'https://media.giphy.com/']

// Turn an image address into an <img> element we can draw on a canvas.
// crossOrigin is needed for images from other sites (e.g. Storage), or the canvas cannot be recorded.
function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })
}

// Jump a <video> to a time (seconds) and wait until it has got there (some browsers never answer, so give up after a second)
function seekTo(video, time) {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, 1000)
    video.onseeked = () => {
      clearTimeout(timer)
      resolve()
    }
    video.currentTime = time
  })
}

// A <video> element loaded with a clip, ready to be drawn on a canvas
async function loadVideo(clip) {
  const video = document.createElement('video')
  video.muted = true
  video.playsInline = true
  video.preload = 'auto'
  video.src = await getClipUrl(clip)
  // Wait until the first frame is ready. If the file is broken, the Promise fails.
  await new Promise((resolve, reject) => {
    video.onloadeddata = resolve
    video.onerror = () => reject(new Error('Could not load a clip'))
  })
  // A video from MediaRecorder does not know its own length until it is played to the end.
  // Jumping far past the end makes the browser work it out, so jumping to a time works afterwards.
  if (!Number.isFinite(video.duration)) {
    await seekTo(video, 1e6)
  }
  return video
}

// Draw a photo or a video frame so it fills the box (cropped in the middle, like object-fit: cover)
function drawCover(ctx, source, sourceWidth, sourceHeight, x, y, w, h, mirrored) {
  const scale = Math.max(w / sourceWidth, h / sourceHeight)
  const cropWidth = w / scale   // how much of the source fits in the box
  const cropHeight = h / scale
  ctx.save()
  if (mirrored) {
    // flip left to right inside the box (the selfie camera is shown like a mirror)
    ctx.translate(x + w, 0)
    ctx.scale(-1, 1)
    x = 0
  }
  ctx.drawImage(source, (sourceWidth - cropWidth) / 2, (sourceHeight - cropHeight) / 2, cropWidth, cropHeight, x, y, w, h)
  ctx.restore()
}

// Make the slot's shape the only area that can be drawn on (the same shapes as PhotoStrip.vue)
function clipToSlot(ctx, shape, x, y, w, h, W) {
  ctx.beginPath()
  if (shape === 'circle') {
    ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2)
  } else if (shape === 'rounded' && ctx.roundRect) {
    ctx.roundRect(x, y, w, h, W * 0.04) // PhotoStrip rounds the corners by 4% of the strip's width
  } else {
    ctx.rect(x, y, w, h)
  }
  ctx.clip()
}

// The clips that play in a slot, as a track: { segments, length }.
// Each segment is one clip's part that is played: it has its own <video>, so no clip has to be reloaded.
//   from / to: when the segment is on, in seconds from the start of the track. start: where in the clip it begins.
async function buildTrack(entries) {
  const segments = []
  let offset = 0
  for (const entry of entries) {
    const length = entry.end - entry.start
    const video = await loadVideo(entry.clip)
    await seekTo(video, entry.start) // every clip waits at its start frame, so the first frame of the video is never empty
    segments.push({
      video: video,
      mirrored: entry.clip.mirrored,
      start: entry.start,
      from: offset,
      to: offset + length,
      playing: false,
      prepared: true, // true while it has been jumped to its start and is ready to play
    })
    offset += length
  }
  return { segments: segments, length: offset }
}

export async function createScene({ layout, frameStyle, photosById, slotPhotos, edits, stickers, clips, editedVideos }) {
  const slots = layout.slots

  // Download everything first, so drawing a frame is instant
  const photos = []  // a photo image for each slot (or null)
  const tracks = []  // a video track for each slot (or null)
  for (let i = 0; i < slots.length; i++) {
    const id = slotPhotos[i]

    const photo = photosById[id]
    photos.push(photo ? await loadImage(photo.image) : null)

    // A slot holds the id of a photo, a clip, or a saved edit (see StripView.vue)
    const edit = editedVideos[id]
    const clip = clips.find((c) => c.id === id)
    if (edit && edit.entries.length > 0) {
      tracks.push(await buildTrack(edit.entries))
    } else if (clip) {
      tracks.push(await buildTrack([{ clip: clip, start: 0, end: CLIP_SECONDS }]))
    } else {
      tracks.push(null)
    }
  }

  // Stickers, back to front. One that cannot be loaded (not allowed, or the other site refuses) is left out.
  const stickerList = []
  for (const sticker of [...stickers].filter((s) => s.visible).sort((a, b) => a.z - b.z)) {
    if (!TRUSTED_STICKER_SOURCES.some((prefix) => sticker.src.startsWith(prefix))) continue
    try {
      stickerList.push({ sticker: sticker, img: await loadImage(sticker.src) })
    } catch (error) {
      console.error('A sticker could not be loaded, so it is left out of the video', error)
    }
  }

  // The last good picture of each slot with video. While a video has no picture for a moment (right after it was
  // jumped to a time), this is shown instead of the photo or the empty frame, so there is no flash.
  const holds = slots.map(() => null)

  // The segment of a track that is on at time t (the track repeats, so we look at t % its length)
  function activeSegment(track, t) {
    const u = t % track.length
    return track.segments.find((s) => u >= s.from && u < s.to) || null
  }

  // Start or pause the videos so they match the time t. Call this before draw, every frame.
  function tick(t) {
    for (const track of tracks) {
      if (!track) continue
      const u = t % track.length
      // When u jumps back to the start, the track has repeated. A track with ONE clip is "on" the whole time, so
      // without this its video would reach the end and stay stuck there. Pausing everything makes the loop below
      // jump the right clip back to its start and play it again.
      if (track.lastU !== undefined && u < track.lastU) {
        for (const seg of track.segments) {
          seg.video.pause()
          seg.playing = false
        }
      }
      track.lastU = u
      for (const seg of track.segments) {
        const on = u >= seg.from && u < seg.to

        // Jumping a video to a time takes a moment, and for that moment it has no picture (which was a white blink
        // in the exported video). So a clip that is about to play is jumped to its start a little BEFORE its turn,
        // while it is paused. (How long until its turn: the track repeats, so it can also be just after the repeat.)
        if (!on && !seg.playing && !seg.prepared) {
          const startsIn = seg.from >= u ? seg.from - u : seg.from + track.length - u
          if (startsIn <= PREPARE_AHEAD) {
            seg.video.currentTime = seg.start
            seg.prepared = true
          }
        }

        if (on && !seg.playing) {
          // If it was not prepared (e.g. a track with one clip, which repeats without ever switching off), jump now
          if (!seg.prepared) seg.video.currentTime = seg.start + (u - seg.from)
          seg.prepared = false
          // (An AbortError only means a pause() came right after, which is fine)
          seg.video.play().catch((error) => {
            if (error.name !== 'AbortError') console.error(error)
          })
          seg.playing = true
        } else if (!on && seg.playing) {
          seg.video.pause()
          seg.playing = false
        }
      }
    }
  }

  function stop() {
    for (const track of tracks) {
      if (!track) continue
      for (const seg of track.segments) {
        seg.video.pause()
        seg.playing = false
        seg.prepared = false
      }
      track.lastU = undefined
    }
  }

  // Draw the strip as it looks t seconds in
  function draw(ctx, W, H, t) {
    ctx.clearRect(0, 0, W, H)
    ctx.fillStyle = frameStyle.background
    ctx.fillRect(0, 0, W, H)

    for (let i = 0; i < slots.length; i++) {
      const s = slots[i]
      const x = (s.x / 100) * W // the layout is in % of the strip, so turn it into pixels
      const y = (s.y / 100) * H
      const w = (s.w / 100) * W
      const h = (s.h / 100) * H

      // The video playing in this slot right now (only if it has a picture ready to draw)
      const seg = tracks[i] ? activeSegment(tracks[i], t) : null
      const videoReady = seg && seg.video.readyState >= 2
      const held = tracks[i] ? holds[i] : null // the last good picture of this slot (null until there was one)
      if (!videoReady && !held && !photos[i]) continue // nothing to draw (empty slot)

      ctx.save()
      clipToSlot(ctx, frameStyle.shape, x, y, w, h, W)
      if (videoReady) {
        ctx.filter = filterCss(edits[i]) || 'none' // the same filter as on screen (Safari ignores this)
        drawCover(ctx, seg.video, seg.video.videoWidth, seg.video.videoHeight, x, y, w, h, seg.mirrored)
      } else if (held) {
        // No picture for a moment: show the last good one (it already has the filter on it, so no filter here)
        ctx.filter = 'none'
        ctx.drawImage(held, 0, 0, held.width, held.height, x, y, w, h)
      } else {
        ctx.filter = filterCss(edits[i]) || 'none'
        drawCover(ctx, photos[i], photos[i].width, photos[i].height, x, y, w, h, false) // the slot's photo, if it has one
      }
      ctx.restore()

      // Keep a copy of what this slot looks like now, as the picture to hold if the next one is late
      if (videoReady) {
        if (!holds[i] || holds[i].width !== Math.round(w) || holds[i].height !== Math.round(h)) {
          holds[i] = document.createElement('canvas')
          holds[i].width = Math.round(w)
          holds[i].height = Math.round(h)
        }
        holds[i].getContext('2d').drawImage(ctx.canvas, x, y, w, h, 0, 0, holds[i].width, holds[i].height)
      }
    }

    // Stickers. Move to the sticker's centre, rotate (canvas uses radians), draw it centred.
    for (const { sticker, img } of stickerList) {
      const w = (sticker.w / 100) * W
      const h = w * (img.height / img.width) // keep the sticker's own proportions
      ctx.save()
      ctx.translate((sticker.x / 100) * W, (sticker.y / 100) * H)
      ctx.rotate((sticker.rotate * Math.PI) / 180)
      ctx.drawImage(img, -w / 2, -h / 2, w, h)
      ctx.restore()
    }

    // Caption
    ctx.fillStyle = frameStyle.border
    ctx.font = 'bold ' + Math.round(W * 0.038) + 'px sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText(frameStyle.caption, W / 2, H - H * 0.03)
  }

  return { aspect: layout.aspect, tick, stop, draw }
}

// ---------- Recording ----------

// The best video format this browser can record. Chrome and Firefox record webm (FFmpeg then makes it an MP4);
// Safari can only record an MP4, which needs no converting.
function recorderType() {
  const types = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm', 'video/mp4']
  return types.find((type) => MediaRecorder.isTypeSupported(type)) || ''
}

// Play the scene on a hidden canvas and record it with MediaRecorder. This takes as long as the video itself
// (it plays in real time), and the page must stay open while it runs.
//   width: the video's width in pixels. fps: frames per second. seconds: how long to record.
//   onProgress: gets a number from 0 to 1. isCancelled: if it returns true, recording stops and gives back null.
// Returns the recording as a Blob (blob.type tells webm or mp4), or null if it was cancelled.
export async function recordScene(scene, { width, fps, seconds, onProgress, isCancelled }) {
  const W = width - (width % 2) // video needs an even width and height
  const H = Math.round(W / scene.aspect / 2) * 2
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')
  scene.draw(ctx, W, H, 0) // a first frame, so the recording does not start empty

  const type = recorderType()
  // captureStream(fps) turns the canvas into a video stream that MediaRecorder can record
  const recorder = new MediaRecorder(canvas.captureStream(fps), type ? { mimeType: type, videoBitsPerSecond: 2500000 } : {})
  const chunks = []
  recorder.ondataavailable = (event) => {
    if (event.data.size > 0) chunks.push(event.data)
  }
  const stopped = new Promise((resolve) => {
    recorder.onstop = resolve
  })

  recorder.start()
  const startedAt = performance.now()
  let cancelled = false
  await new Promise((resolve) => {
    function frame() {
      const t = (performance.now() - startedAt) / 1000 // seconds since recording started
      if (isCancelled && isCancelled()) {
        cancelled = true
        resolve()
        return
      }
      scene.tick(t)
      scene.draw(ctx, W, H, t)
      if (onProgress) onProgress(Math.min(1, t / seconds))
      if (t >= seconds) {
        resolve()
      } else {
        requestAnimationFrame(frame) // the next screen frame
      }
    }
    frame()
  })
  scene.stop()
  recorder.stop()
  await stopped
  if (cancelled) return null
  return new Blob(chunks, { type: recorder.mimeType || 'video/webm' })
}
