import { GIFEncoder, quantize, applyPalette } from 'gifenc'
import { ref as storageRef, getDownloadURL } from 'firebase/storage'
import { storage } from './firebase.js'
import { MAX_EDIT_SECONDS } from './clips.js'
import { createScene, recordScene, sampleScene } from './stripRender.js'

// Makes the finished file of a strip: a PNG, a GIF or an MP4. Used on the Share page (see ShareView.vue).
// Videos are played and recorded in real time, so a GIF or an MP4 takes about as long as the video itself
// (MAX_EDIT_SECONDS) and the page has to stay open.

const PNG_WIDTH = 900 // pixels wide (the height follows the strip's shape)
const GIF_WIDTH = 300
const GIF_FPS = 10
const MP4_WIDTH = 480
const MP4_FPS = 15

// What each format makes: the file's ending and its type
const FILE_TYPES = {
  png: { ext: 'png', mime: 'image/png' },
  gif: { ext: 'gif', mime: 'image/gif' },
  mp4: { ext: 'mp4', mime: 'video/mp4' },
}

// strip: everything createScene needs { layout, frameStyle, photosById, slotPhotos, edits, crops, stickers, clips, editedVideos }
// audioPath: where the Music page saved the mix in Storage (only used for an MP4; PNG and GIF have no sound)
// onStatus(text): what is happening now. onProgress(0 to 1). isCancelled(): true if the page was closed.
// Gives back { blob, ext, mime }, or null if it was cancelled.
export async function buildExportFile({ format, strip, audioPath, onStatus, onProgress, isCancelled }) {
  const type = FILE_TYPES[format]
  if (!type) throw new Error('Unknown format: ' + format)

  onStatus('Getting your strip ready...')
  const scene = await createScene(strip)

  let blob = null
  if (format === 'png') {
    blob = await makePng(scene)
  } else if (format === 'gif') {
    onStatus('Recording the GIF... keep this page open')
    blob = await makeGif(scene, onProgress, isCancelled)
  } else {
    blob = await makeMp4(scene, audioPath, onStatus, onProgress, isCancelled)
  }

  if (!blob) return null // cancelled
  return { blob: blob, ext: type.ext, mime: type.mime }
}

// A still picture of the strip (only a strip with nothing that moves can be a PNG)
function makePng(scene) {
  const W = PNG_WIDTH
  const H = Math.round(W / scene.aspect)
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  scene.draw(canvas.getContext('2d'), W, H, 0)
  scene.stop()
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Could not make the PNG'))), 'image/png')
  })
}

// The strip playing for MAX_EDIT_SECONDS, one picture at a time. Every picture is squeezed into a GIF straight away,
// so they do not pile up in memory.
async function makeGif(scene, onProgress, isCancelled) {
  const gif = GIFEncoder()
  const finished = await sampleScene(scene, {
    width: GIF_WIDTH,
    fps: GIF_FPS,
    seconds: MAX_EDIT_SECONDS,
    onProgress: onProgress,
    isCancelled: isCancelled,
    onFrame: (canvas) => {
      const { data } = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height)
      // A GIF picture has at most 256 colours: find the 256 that look closest, then use them (see gif.js)
      const palette = quantize(data, 256)
      gif.writeFrame(applyPalette(data, palette), canvas.width, canvas.height, { palette: palette, delay: Math.round(1000 / GIF_FPS) })
    },
  })
  if (!finished) return null
  gif.finish()
  return new Blob([gif.bytes()], { type: 'image/gif' })
}

// The strip recorded as a video, then turned into an MP4 by FFmpeg (with the music under it, if there is a mix)
async function makeMp4(scene, audioPath, onStatus, onProgress, isCancelled) {
  onStatus('Recording the video... keep this page open')
  const recording = await recordScene(scene, { width: MP4_WIDTH, fps: MP4_FPS, seconds: MAX_EDIT_SECONDS, onProgress: onProgress, isCancelled: isCancelled })
  if (!recording) return null

  // The music: a WAV in Storage
  let audio = null
  if (audioPath) {
    onStatus('Getting your music...')
    const url = await getDownloadURL(storageRef(storage, audioPath))
    audio = await (await fetch(url)).blob()
  }

  // Safari already records an MP4, so it only needs converting to add the music
  if (recording.type.includes('mp4') && !audio) return recording
  onProgress(0)
  onStatus('Loading the converter... (the first time takes a while)')
  const { toMp4 } = await import('./ffmpeg.js') // only downloaded now (about 30 MB)
  onStatus('Making the MP4...')
  return toMp4(recording, MP4_FPS, onProgress, audio)
}
