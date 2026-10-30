// Animated GIF stickers for the finished strip (the PNG, GIF and MP4 are drawn on a canvas, and a canvas only
// draws the ONE picture of a GIF it is given). So the GIF is taken apart into its pictures here, and
// stripRender.js draws the one that is on at each moment.
// Uses the browser's ImageDecoder (Chrome, Edge, and newer Safari and Firefox). Where there is none,
// decodeGif gives back null, and the sticker stays a still picture.

// A very long GIF would fill the memory with pictures, so only its first pictures are used (it then repeats from there)
export const MAX_GIF_FRAMES = 150

// How long a picture stays when the GIF does not say, or says almost nothing (browsers do the same)
const DEFAULT_MS = 100
const MIN_MS = 20

// Take a GIF apart: { frames: [ { bitmap, until } ], duration }
//   bitmap  the picture, ready to draw (already combined with the pictures before it, so it is a whole picture)
//   until   when it goes off, in milliseconds from the start
// Gives back null if it cannot be done, or the GIF has only one picture.
export async function decodeGif(src) {
  if (typeof ImageDecoder === 'undefined') return null

  const response = await fetch(src)
  if (!response.ok) return null
  const decoder = new ImageDecoder({ data: await response.arrayBuffer(), type: 'image/gif' })

  try {
    await decoder.tracks.ready
    const count = Math.min(decoder.tracks.selectedTrack.frameCount, MAX_GIF_FRAMES)
    if (count < 2) return null

    const frames = []
    let total = 0
    for (let i = 0; i < count; i++) {
      const { image } = await decoder.decode({ frameIndex: i })
      const ms = image.duration ? Math.max(MIN_MS, image.duration / 1000) : DEFAULT_MS // duration is in microseconds
      const bitmap = await createImageBitmap(image)
      image.close()
      total += ms
      frames.push({ bitmap: bitmap, until: total })
    }
    return { frames: frames, duration: total }
  } finally {
    decoder.close()
  }
}

// The picture of an animation that is on at t seconds (the animation repeats, so only t % its length counts)
export function pickFrame(animation, t) {
  const at = (t * 1000) % animation.duration
  return animation.frames.find((frame) => at < frame.until) || animation.frames[animation.frames.length - 1]
}
