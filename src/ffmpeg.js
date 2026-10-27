// FFmpeg.wasm: turns the recording of the strip into an MP4 that plays everywhere, inside the browser (no server).
//
// IMPORTANT: this is the SINGLE-THREADED build (@ffmpeg/core), not @ffmpeg/core-mt. The
// multi-threaded one needs the page headers Cross-Origin-Opener-Policy and Cross-Origin-Embedder-Policy,
// and those break Google sign-in and the video call. Do not add them to vercel.json.
//
// The core file (.wasm) is about 30 MB, so nothing is downloaded until the user presses "Make MP4"
// (loadFfmpeg is only called from there), and it is only downloaded once per visit.

const CORE_URL = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm' // the exact version (single-threaded build)

let loading = null // a Promise of the ready FFmpeg, so two clicks do not load it twice

// Download and start FFmpeg (the first call does the work, later calls get the same one)
export function loadFfmpeg() {
  if (!loading) {
    loading = (async () => {
      // Imported here, so the FFmpeg code is a separate file that only downloads when needed
      const { FFmpeg } = await import('@ffmpeg/ffmpeg')
      const { toBlobURL } = await import('@ffmpeg/util')
      const ffmpeg = new FFmpeg()
      // toBlobURL downloads a file and gives a local address for it, which gets around cross-site worker rules
      await ffmpeg.load({
        coreURL: await toBlobURL(CORE_URL + '/ffmpeg-core.js', 'text/javascript'),
        wasmURL: await toBlobURL(CORE_URL + '/ffmpeg-core.wasm', 'application/wasm'),
      })
      return ffmpeg
    })()
    loading.catch(() => {
      loading = null // so pressing the button again tries again
    })
  }
  return loading
}

// Convert a recording (a webm or mp4 Blob) to an MP4 and give the result back as a Blob.
// fps: the frame rate of the video. onProgress gets a number from 0 to 1 while it converts.
export async function toMp4(recording, fps, onProgress) {
  const ffmpeg = await loadFfmpeg()
  const inputName = recording.type.includes('mp4') ? 'in.mp4' : 'in.webm'

  const showProgress = ({ progress }) => {
    if (onProgress) onProgress(Math.min(1, Math.max(0, progress)))
  }
  ffmpeg.on('progress', showProgress)
  try {
    // The files live in FFmpeg's own memory, not on the disk
    await ffmpeg.writeFile(inputName, new Uint8Array(await recording.arrayBuffer()))
    const exitCode = await ffmpeg.exec([
      '-i', inputName,
      '-r', String(fps),                                 // the same number of frames every second
      '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2',        // MP4 needs an even width and height
      '-c:v', 'libx264',                                 // H.264, the video format everything can play
      '-preset', 'veryfast',                             // faster to make, a little bigger
      '-pix_fmt', 'yuv420p',                             // the colour format phones and browsers expect
      '-movflags', '+faststart',                         // starts playing before it is fully downloaded
      'out.mp4',
    ])
    if (exitCode !== 0) throw new Error('FFmpeg could not make the MP4')
    const data = await ffmpeg.readFile('out.mp4')
    return new Blob([data], { type: 'video/mp4' })
  } finally {
    ffmpeg.off('progress', showProgress)
    // Free the memory
    await ffmpeg.deleteFile(inputName).catch(() => {})
    await ffmpeg.deleteFile('out.mp4').catch(() => {})
  }
}
