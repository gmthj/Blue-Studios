import { isTrustedStickerSrc } from './stripData.js'

// Which format a strip is exported as. Nobody chooses: the strip decides (see chooseExportFormat below).
//
//   PNG  a still strip with no music: nothing moves and there is no sound
//   MP4  everything else. A video or a moving (GIF) sticker needs a video file, and so does music.
//        With music the MP4 has the sound. Without music it is a silent MP4, which loops when it is played (like a GIF).
//   Nothing can be exported until every slot has a photo or a video.

// ---------- WHAT IS IN THE STRIP ----------

// Is every slot filled, and does the strip have a video? A slot holds the id of a photo, a clip or a saved edit
// (see PickView.vue), so each id is looked up in all three.
//   slotPhotos: { 0: 'id', 1: 'id', ... }. photosById: { id: photo }. clips: the room's clips. editedVideos: { id: edit } (see resolveEditedVideos).
export function stripContents({ layout, slotPhotos, photosById, clips, editedVideos }) {
  let complete = true
  let hasVideo = false
  for (let i = 0; i < layout.slots.length; i++) {
    const id = slotPhotos[i]
    const edit = editedVideos[id]
    if (edit && edit.entries.length > 0) {
      hasVideo = true
    } else if (clips.some((c) => c.id === id)) {
      hasVideo = true
    } else if (!photosById[id]) {
      complete = false // nothing in this slot (or a saved edit with no clips in it)
    }
  }
  return { complete, hasVideo }
}

// ---------- GIF STICKERS ----------

// A GIF sticker is stored as a file with no ".gif" in its name (the Sticker Maker calls it just "image"), so the
// address cannot tell. Every GIF file starts with the letters GIF8, so look at the first bytes of the file instead.
const gifChecks = new Map() // src -> a Promise of true / false, so each sticker is only looked at once

export function isGifSrc(src) {
  if (src.startsWith('data:')) return Promise.resolve(src.startsWith('data:image/gif'))
  if (!gifChecks.has(src)) {
    const check = fetch(src)
      .then((response) => (response.ok ? response.blob() : null))
      .then(async (blob) => {
        if (!blob) return false
        const bytes = new Uint8Array(await blob.slice(0, 4).arrayBuffer())
        return String.fromCharCode(...bytes) === 'GIF8'
      })
      .catch(() => {
        gifChecks.delete(src) // it may only be the network: look again next time
        return false
      })
    gifChecks.set(src, check)
  }
  return gifChecks.get(src)
}

// Does the strip have a sticker that moves? Only the stickers that will really be in the export count
// (shown, and from a trusted place, the same as in stripRender.js).
export async function hasGifSticker(stickers) {
  for (const sticker of stickers) {
    if (!sticker.visible || !isTrustedStickerSrc(sticker.src)) continue
    if (await isGifSrc(sticker.src)) return true
  }
  return false
}

// ---------- THE FORMAT ----------

// The format the strip is exported as: 'png', 'mp4', or null while the strip is not finished.
//   complete: every slot has a photo or a video. hasVideo, hasMusic, hasGifSticker: yes / no, see above.
export function chooseExportFormat({ complete, hasVideo, hasMusic, hasGifSticker }) {
  if (!complete) return null
  return hasVideo || hasGifSticker || hasMusic ? 'mp4' : 'png'
}
