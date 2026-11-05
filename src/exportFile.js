import { ref as storageRef, getDownloadURL } from 'firebase/storage'
import { storage } from './firebase.js'
import { MAX_EDIT_SECONDS } from './clips.js'
import { createScene, recordScene } from './stripRender.js'
import { NO_PROGRESS } from './exportProgress.js'

// Makes the finished file of a strip: a PNG or an MP4 (with the music if there is a mix, otherwise silent). Used on the
// Share page (see ShareView.vue). The strip is played and recorded in real time, so an MP4 takes about as long as the
// video itself (MAX_EDIT_SECONDS) and the page has to stay open.

const PNG_WIDTH = 900 // pixels wide (the height follows the strip's shape)
const MP4_WIDTH = 480
const MP4_FPS = 15

// What each format makes: the file's ending and its type
const FILE_TYPES = {
  png: { ext: 'png', mime: 'image/png' },
  mp4: { ext: 'mp4', mime: 'video/mp4' },
}

// strip: everything createScene needs { layout, frameStyle, photosById, slotPhotos, edits, crops, stickers, clips, editedVideos }
// audioPath: where the Music page saved the mix in Storage (only used for an MP4; a PNG has no sound)
// onStatus(text): what is happening now. isCancelled(): true if the page was closed.
// progress: the job's ONE progress bar (see createOverallProgress in exportProgress.js). Each stage here only says how
// far it is, and the bar decides where that is on the whole bar.
// Gives back { blob, ext, mime }, or null if it was cancelled.
export async function buildExportFile({ format, strip, audioPath, onStatus, progress = NO_PROGRESS, isCancelled }) {
  const type = FILE_TYPES[format]
  if (!type) throw new Error('Unknown format: ' + format)

  onStatus('Getting your strip ready...')
  progress.creep('ready') // downloading everything has no way to say how far it is
  const scene = await createScene(strip)
  progress.report('ready', 1)

  let blob = null
  if (format === 'png') {
    blob = await makePng(scene)
  } else {
    blob = await makeMp4(scene, audioPath, onStatus, progress, isCancelled)
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

// The strip recorded as a video, then turned into an MP4 by FFmpeg (with the music under it, if there is a mix)
async function makeMp4(scene, audioPath, onStatus, progress, isCancelled) {
  onStatus('Recording the video... keep this page open')
  const recording = await recordScene(scene, {
    width: MP4_WIDTH,
    fps: MP4_FPS,
    seconds: MAX_EDIT_SECONDS,
    onProgress: (p) => progress.report('record', p),
    isCancelled: isCancelled,
  })
  if (!recording) return null
  progress.report('record', 1)

  // The music: a WAV in Storage
  let audio = null
  if (audioPath) {
    onStatus('Getting your music...')
    progress.creep('music')
    const url = await getDownloadURL(storageRef(storage, audioPath))
    audio = await (await fetch(url)).blob()
    progress.report('music', 1)
  }

  // Safari already records an MP4, so it only needs converting to add the music
  if (recording.type.includes('mp4') && !audio) return recording
  onStatus('Loading the converter... (the first time takes a while)')
  progress.creep('convert') // the converter is about 30 MB and does not say how far it is: the bar creeps on
  const { toMp4 } = await import('./ffmpeg.js') // only downloaded now
  onStatus('Making the MP4...')
  const mp4 = await toMp4(recording, MP4_FPS, (p) => progress.report('convert', p), audio)
  progress.report('convert', 1)
  return mp4
}
