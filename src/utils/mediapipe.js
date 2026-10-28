// Loads Google's MediaPipe (face finder, person cut-out) only when it is first needed.
// Shared by useFaceFilter.js and useBehindLayer.js, so its program files download once.
//
// Usage:
//   const { vision, files } = await loadMediaPipe()
//   const finder = await vision.FaceLandmarker.createFromOptions(files, { ... })

// MediaPipe's program files (must be the same version as @mediapipe/tasks-vision in package.json)
const MEDIAPIPE_WASM_URL = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm'

let loading = null // the download in progress (a Promise), so it only happens once

function loadMediaPipe() {
  if (!loading) {
    loading = download().catch((error) => {
      loading = null // let the next try download again
      throw error
    })
  }
  return loading
}

async function download() {
  // import() here (not at the top of the file) so MediaPipe is only downloaded when needed
  const vision = await import('@mediapipe/tasks-vision')
  const files = await vision.FilesetResolver.forVisionTasks(MEDIAPIPE_WASM_URL)
  return { vision, files }
}

// Make a MediaPipe task (e.g. vision.FaceLandmarker) on the GPU (graphics card), which is much faster.
// Some devices do not support it, so fall back to the CPU.
async function createTask(Task, files, options) {
  try {
    return await Task.createFromOptions(files, { ...options, baseOptions: { ...options.baseOptions, delegate: 'GPU' } })
  } catch (error) {
    console.error(error)
    return await Task.createFromOptions(files, { ...options, baseOptions: { ...options.baseOptions, delegate: 'CPU' } })
  }
}

export { loadMediaPipe, createTask }
