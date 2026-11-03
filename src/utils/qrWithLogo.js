import QRCode from 'qrcode'

// Makes a QR code picture (a data: address) with the Blue Studios logo in the middle.
// Error correction is set to the highest level ('H') so the code still scans with the middle covered.
// Usage: const url = await qrWithLogo('https://...', 360)

const LOGO = '/images/logo-mark.png'
const LOGO_SHARE = 0.22 // the logo box is this fraction of the QR width (keep under ~0.25 so it still scans)

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })
}

export async function qrWithLogo(text, width = 360) {
  const canvas = document.createElement('canvas')
  await QRCode.toCanvas(canvas, text, {
    width,
    margin: 1,
    errorCorrectionLevel: 'H',
    color: { dark: '#1a1a2e', light: '#ffffff' },
  })

  try {
    const logo = await loadImage(LOGO)
    const ctx = canvas.getContext('2d')
    const box = Math.round(canvas.width * LOGO_SHARE)
    const x = Math.round((canvas.width - box) / 2)
    const y = Math.round((canvas.height - box) / 2)
    const pad = Math.round(box * 0.12)

    // Fit the logo inside the box, keeping its shape
    const scale = Math.min(box / logo.width, box / logo.height)
    const w = logo.width * scale
    const h = logo.height * scale

    // White circle behind the logo (big enough to reach the logo's corners) so the dots don't run into it
    ctx.fillStyle = '#ffffff'
    ctx.beginPath()
    ctx.arc(canvas.width / 2, canvas.height / 2, Math.hypot(w, h) / 2 + pad / 2, 0, Math.PI * 2)
    ctx.fill()

    ctx.drawImage(logo, x + (box - w) / 2, y + (box - h) / 2, w, h)
  } catch (error) {
    console.error(error) // no logo is fine; the plain QR code still works
  }

  return canvas.toDataURL('image/png')
}
