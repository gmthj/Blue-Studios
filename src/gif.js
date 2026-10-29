// Turns a list of finished frames into an animated GIF, inside the browser.
// We need a library because a canvas can only export PNG or JPEG — it cannot write GIF.
// gifenc is small and runs entirely in the browser, so nothing is uploaded to a server.
import { GIFEncoder, quantize, applyPalette } from 'gifenc'

// canvases: one 512x512 canvas per frame, already drawn (and masked, later).
// delayMs: how long each frame stays on screen, in milliseconds.
export function encodeGif(canvases, delayMs) {
  const gif = GIFEncoder()

  for (const canvas of canvases) {
    // Read the pixels as raw numbers: 4 per pixel (red, green, blue, alpha).
    const ctx = canvas.getContext('2d')
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height)

    // A GIF frame can only hold 256 colours, so we shrink the picture down to the 256
    // that look closest to the original. This is why GIFs look slightly grainy.
    const palette = quantize(data, 256, { format: 'rgba4444' })

    // Then every pixel is replaced by the number of its nearest colour in that palette.
    const index = applyPalette(data, palette, 'rgba4444')

    // delay is in milliseconds; gifenc converts it to the GIF format's own unit.
    // transparent: true keeps the see-through parts see-through, but GIF only does
    // hard edges (a pixel is either fully clear or fully solid), so cut-outs look jagged.
    gif.writeFrame(index, canvas.width, canvas.height, {
      palette,
      delay: delayMs,
      transparent: true,
    })
  }

  gif.finish()
  return new Blob([gif.bytes()], { type: 'image/gif' })
}