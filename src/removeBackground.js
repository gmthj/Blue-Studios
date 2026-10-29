// The browser side of background removal. Kept in its own file so StickerMakerView.vue
// only needs one import, and so the same code can be reused on another page later.
import axios from 'axios'
import { auth } from './firebase.js'

// Shrink the picture and turn it into base64 text.
// Why shrink: a 4000px phone photo becomes ~5 MB of base64, and Vercel refuses requests over ~4.5 MB.
// Why a canvas: it also turns a JPEG or WebP into a PNG, which remove.bg accepts.
async function blobToBase64Png(blob, maxSide = 800) {
  const url = URL.createObjectURL(blob)
  try {
    const img = await new Promise((resolve, reject) => {
      const image = new Image()
      image.onload = () => resolve(image)
      image.onerror = reject
      image.src = url
    })
    const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(img.naturalWidth * scale)
    canvas.height = Math.round(img.naturalHeight * scale)
    canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height)
    const small = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'))

    // FileReader turns the Blob into a data URL; we only keep the part after the comma.
    const dataUrl = await new Promise((resolve) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result)
      reader.readAsDataURL(small)
    })
    return dataUrl.split(',')[1]
  } finally {
    URL.revokeObjectURL(url) // free the temporary browser link
  }
}

// Ask our own server to remove the background, and return the cut-out as a PNG Blob.
export async function removeBackground(blob) {
  if (!auth.currentUser) throw new Error('Log in to remove backgrounds')

  const image = await blobToBase64Png(blob)
  // getIdToken proves who is asking; the server checks it before spending a credit.
  const idToken = await auth.currentUser.getIdToken()

  try {
    const response = await axios.post('/api/remove-bg', { image: image }, {
      headers: { Authorization: 'Bearer ' + idToken },
      responseType: 'blob', // the answer is a PNG file, not JSON
    })
    return response.data
  } catch (error) {
    throw new Error(await readErrorMessage(error))
  }
}

// The server sends { error: '...' } as JSON, but we asked for a blob, so read it back as text.
async function readErrorMessage(error) {
  const data = error.response && error.response.data
  if (data instanceof Blob) {
    try {
      const parsed = JSON.parse(await data.text())
      if (parsed.error) return parsed.error
    } catch (e) {
      // not JSON, fall through to the default message
    }
  }
  return 'Could not remove the background. Please try again.'
}