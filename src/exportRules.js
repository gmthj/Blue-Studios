import { isTrustedStickerSrc } from './stripData.js'

// Which export formats a strip is allowed to have (the Export page's format cards).
//
//   PNG  only a still strip: no video and no GIF sticker in it
//   GIF  a strip that moves: it has a video or a GIF sticker
//   MP4  a strip with music (the mix made on the Music page)
//   PNG and GIF cannot carry music, so with music they still work, but say the music will not be included.
//   Nothing can be exported until every slot has a photo or a video.

export const FORMATS = ['png', 'gif', 'mp4']

// ---------- WHAT IS IN THE STRIP ----------

// Is every slot filled, and does the strip have a video? A slot holds the id of a photo, a clip or a saved edit
// (see StripView.vue), so each id is looked up in all three.
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

// ---------- THE FORMAT CARDS ----------

// What each format card should do.
//   complete, hasVideo, hasMusic, hasGifSticker: yes / no, see above
// Gives { png, gif, mp4 }, each { available, reason, musicLost }:
//   available  false: the card is blurred and cannot be picked
//   reason     why it cannot be picked (shown on the blurred card), or '' if it can
//   musicLost  true: it can be picked, but the music will not be in the file (show a message)
export function exportOptions({ complete, hasVideo, hasMusic, hasGifSticker }) {
  const moves = hasVideo || hasGifSticker // does anything in the strip move?

  // The rule for each format, and what to say when the rule says no
  const rules = {
    png: { allowed: !moves, why: hasVideo ? 'Your strip has video: choose GIF or MP4' : 'Your strip has a moving sticker: choose GIF or MP4' },
    gif: { allowed: moves, why: 'Nothing in your strip moves: choose PNG' },
    mp4: { allowed: hasMusic, why: 'Add music on the Music page to export an MP4' },
  }

  const options = {}
  for (const format of FORMATS) {
    const rule = rules[format]
    const available = complete && rule.allowed
    options[format] = {
      available: available,
      reason: !complete ? 'Fill every slot of the strip first' : rule.allowed ? '' : rule.why,
      musicLost: available && hasMusic && format !== 'mp4', // PNG and GIF cannot carry the music
    }
  }
  return options
}
