import * as htmlToImage from 'html-to-image'
import { jsPDF } from 'jspdf'

/**
 * Curated Mock Photos (Portraits with CORS Anonymous support)
 * Used for realistic photobooth mockups and exports
 */
export const MOCK_PORTRAIT_PHOTOS = [
  'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=600&q=80',
  'https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=600&q=80',
  'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=600&q=80',
  'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?auto=format&fit=crop&w=600&q=80'
]

/**
 * Helper to download Blob directly to client
 */
export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.download = filename
  link.href = url
  link.style.display = 'none'
  document.body.appendChild(link)
  link.click()
  setTimeout(() => {
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }, 200)
}

/**
 * Wait for images inside an element to be fully loaded and decoded
 */
async function preloadImages(container) {
  const images = Array.from(container.querySelectorAll('img'))
  const promises = images.map((img) => {
    if (img.complete && img.naturalWidth > 0) return Promise.resolve()
    return new Promise((resolve) => {
      img.crossOrigin = 'anonymous'
      img.onload = () => resolve()
      img.onerror = () => resolve() // Continue even if one fails
    })
  })
  await Promise.all(promises)
}

/**
 * Clean up filename for safe downloads
 */
export function sanitizeFilename(name) {
  return (name || 'photostrip')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '_')
    .replace(/_+/g, '_')
}

/**
 * Apply 100% Alpha Cutout punch-out holes for photobooth hardware overlays
 */
export function punchOutCutouts(canvas, stripEl, slotShape = 'Rounded') {
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  const frameRect = stripEl.getBoundingClientRect()
  const slotEls = stripEl.querySelectorAll('.cutout-slot')

  const scaleX = canvas.width / frameRect.width
  const scaleY = canvas.height / frameRect.height

  ctx.save()
  // destination-out removes existing canvas pixels where new shapes are drawn
  ctx.globalCompositeOperation = 'destination-out'
  ctx.fillStyle = '#000000'

  slotEls.forEach((slot) => {
    const r = slot.getBoundingClientRect()
    const x = (r.left - frameRect.left) * scaleX
    const y = (r.top - frameRect.top) * scaleY
    const w = r.width * scaleX
    const h = r.height * scaleY

    ctx.beginPath()
    if (slotShape === 'Circle') {
      ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2)
    } else if (slotShape === 'Rounded') {
      // 12px standard radius scaled to canvas pixels
      const radius = 12 * Math.min(scaleX, scaleY)
      if (typeof ctx.roundRect === 'function') {
        ctx.roundRect(x, y, w, h, radius)
      } else {
        ctx.rect(x, y, w, h)
      }
    } else {
      // Square
      ctx.rect(x, y, w, h)
    }
    ctx.fill()
  })

  ctx.restore()
}

/**
 * Wrap canvas with 3mm Bleed and Hairline Crop / Trim Marks for 300 DPI Print
 * Target: 600px x 1800px trim for 2x6" strip
 * Bleed: 35px (~3mm @ 300 DPI) on each side -> 670px x 1870px
 * Slug/Marks margin: 60px on each side -> 790px x 1990px total canvas
 */
export function applyBleedAndCropMarks(sourceCanvas, templateName = 'Photostrip') {
  const BLEED = 35 // ~3mm at 300 DPI
  const MARGIN = 60 // Margin for crop ticks and slug text
  const EXTRA = BLEED + MARGIN // 95px on all 4 sides

  const totalW = sourceCanvas.width + EXTRA * 2
  const totalH = sourceCanvas.height + EXTRA * 2

  const outCanvas = document.createElement('canvas')
  outCanvas.width = totalW
  outCanvas.height = totalH
  const ctx = outCanvas.getContext('2d')
  if (!ctx) return sourceCanvas

  // 1. Fill clean white canvas background for print slug
  ctx.fillStyle = '#FFFFFF'
  ctx.fillRect(0, 0, totalW, totalH)

  const trimX = EXTRA
  const trimY = EXTRA
  const trimW = sourceCanvas.width
  const trimH = sourceCanvas.height

  // 2. Extend bleed by drawing border replication or soft background bleed
  ctx.save()
  // Draw edge bleed color from the frame edge
  ctx.fillStyle = '#FEFBF6'
  ctx.fillRect(trimX - BLEED, trimY - BLEED, trimW + BLEED * 2, trimH + BLEED * 2)
  ctx.restore()

  // 3. Draw the main trimmed canvas content in the center
  ctx.drawImage(sourceCanvas, trimX, trimY, trimW, trimH)

  // 4. Render Hairline Trim / Crop Marks (0.5pt ticks)
  ctx.save()
  ctx.strokeStyle = '#0F172A'
  ctx.lineWidth = 1 // Crisp 1px hairline at 300 DPI
  ctx.lineCap = 'square'

  const TICK_LEN = 25 // Length of tick line
  const TICK_GAP = 4 // Gap from bleed border so tick doesn't touch artwork

  // Top-Left corner ticks
  // Horizontal tick (aligned with trimY)
  ctx.beginPath()
  ctx.moveTo(trimX - BLEED - TICK_GAP - TICK_LEN, trimY)
  ctx.lineTo(trimX - BLEED - TICK_GAP, trimY)
  ctx.stroke()
  // Vertical tick (aligned with trimX)
  ctx.beginPath()
  ctx.moveTo(trimX, trimY - BLEED - TICK_GAP - TICK_LEN)
  ctx.lineTo(trimX, trimY - BLEED - TICK_GAP)
  ctx.stroke()

  // Top-Right corner ticks
  // Horizontal tick
  ctx.beginPath()
  ctx.moveTo(trimX + trimW + BLEED + TICK_GAP, trimY)
  ctx.lineTo(trimX + trimW + BLEED + TICK_GAP + TICK_LEN, trimY)
  ctx.stroke()
  // Vertical tick
  ctx.beginPath()
  ctx.moveTo(trimX + trimW, trimY - BLEED - TICK_GAP - TICK_LEN)
  ctx.lineTo(trimX + trimW, trimY - BLEED - TICK_GAP)
  ctx.stroke()

  // Bottom-Left corner ticks
  // Horizontal tick
  ctx.beginPath()
  ctx.moveTo(trimX - BLEED - TICK_GAP - TICK_LEN, trimY + trimH)
  ctx.lineTo(trimX - BLEED - TICK_GAP, trimY + trimH)
  ctx.stroke()
  // Vertical tick
  ctx.beginPath()
  ctx.moveTo(trimX, trimY + trimH + BLEED + TICK_GAP)
  ctx.lineTo(trimX, trimY + trimH + BLEED + TICK_GAP + TICK_LEN)
  ctx.stroke()

  // Bottom-Right corner ticks
  // Horizontal tick
  ctx.beginPath()
  ctx.moveTo(trimX + trimW + BLEED + TICK_GAP, trimY + trimH)
  ctx.lineTo(trimX + trimW + BLEED + TICK_GAP + TICK_LEN, trimY + trimH)
  ctx.stroke()
  // Vertical tick
  ctx.beginPath()
  ctx.moveTo(trimX + trimW, trimY + trimH + BLEED + TICK_GAP)
  ctx.lineTo(trimX + trimW, trimY + trimH + BLEED + TICK_GAP + TICK_LEN)
  ctx.stroke()

  // 5. Slug Metadata in Micro-Typography
  ctx.font = '600 11px system-ui, -apple-system, sans-serif'
  ctx.fillStyle = '#64748B'
  ctx.textAlign = 'left'
  const dateStr = new Date().toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  })
  ctx.fillText(
    `BLUE STUDIOS PHOTOBOOTH · ${templateName.toUpperCase()} · 2×6 IN (300 DPI) · 3MM BLEED`,
    trimX,
    trimY - BLEED - 16
  )

  ctx.textAlign = 'right'
  ctx.fillText(`CROP TRIM · ${dateStr}`, trimX + trimW, trimY - BLEED - 16)

  ctx.restore()

  return outCanvas
}

/**
 * Main High-Fidelity Export Pipeline
 */
export async function exportPhotostrip(stripEl, options = {}) {
  const {
    fileType = 'png', // 'png' | 'jpg' | 'pdf' | 'photobooth_overlay'
    scale = 2, // 1 | 2 | 3
    transparentBg = false,
    includeBleedAndCropMarks = false,
    includeMockPhotos = true,
    alphaCutouts = false,
    templateName = 'My_Photostrip',
    slotShape = 'Rounded',
    onProgress = () => {}
  } = options

  if (!stripEl) {
    throw new Error('Photostrip frame element not found')
  }

  const isOverlayMode = fileType === 'photobooth_overlay' || alphaCutouts
  const cleanName = sanitizeFilename(templateName)

  // 1. Progress: Preparing Fonts & Preloading Images
  onProgress('Preloading fonts and assets...')
  await document.fonts.ready
  await preloadImages(stripEl)

  // 2. Calculate DPI & Scale Factor
  // Photostrip frame is ~280px in editor.
  // 300 DPI standard 2" width = 600px -> ratio = 600 / 280 ≈ 2.143
  // 1x = 1.0, 2x = 2.0, 3x / 300 DPI = exact 600px width (or scale 3 = 840px)
  let pixelRatio = scale
  if (scale === 3) {
    // Exact 300 DPI targeting 600px width for 2×6 inch photostrips
    pixelRatio = Math.max(3, 600 / stripEl.offsetWidth)
  }

  onProgress(`Rasterizing canvas at ${scale}x scale (${Math.round(stripEl.offsetWidth * pixelRatio)}px wide)...`)

  // 3. Setup temporary styling for clean export
  const originalBackground = stripEl.style.background
  const originalBoxShadow = stripEl.style.boxShadow
  const originalOverflow = stripEl.style.overflow

  if (transparentBg || (isOverlayMode && transparentBg)) {
    stripEl.style.background = 'transparent'
    stripEl.style.boxShadow = 'none'
  }
  stripEl.style.overflow = 'hidden'

  let rawCanvas
  try {
    rawCanvas = await htmlToImage.toCanvas(stripEl, {
      pixelRatio: pixelRatio,
      cacheBust: true,
      filter: (node) => {
        // Exclude UI editor bounding boxes, marquee selection, transform handles
        if (node.classList) {
          if (
            node.classList.contains('element-bounding-box') ||
            node.classList.contains('collective-bounding-box') ||
            node.classList.contains('canvas-marquee-box') ||
            node.classList.contains('resize-handle') ||
            node.classList.contains('rotate-handle')
          ) {
            return false
          }
          // If in overlay mode without mock photos, exclude cutout-indicator text/cam
          if (isOverlayMode && node.classList.contains('cutout-indicator')) {
            return false
          }
        }
        return true
      }
    })
  } finally {
    // Restore original styles
    stripEl.style.background = originalBackground
    stripEl.style.boxShadow = originalBoxShadow
    stripEl.style.overflow = originalOverflow
  }

  // 4. Punch out Alpha Cutouts for Photobooth Overlay Mode
  if (isOverlayMode) {
    onProgress('Punching out 100% alpha cutout windows...')
    punchOutCutouts(rawCanvas, stripEl, slotShape)
  }

  // 5. Print Bleed & Crop Marks (for PDF or 300 DPI if enabled)
  let finalCanvas = rawCanvas
  const shouldApplyBleed = includeBleedAndCropMarks && (fileType === 'pdf' || scale === 3)
  if (shouldApplyBleed) {
    onProgress('Applying 3mm printer bleed & corner crop marks...')
    finalCanvas = applyBleedAndCropMarks(rawCanvas, templateName)
  }

  // 6. Output Generation & Direct Download
  if (fileType === 'pdf') {
    onProgress('Generating 300 DPI Print PDF document...')
    // Target 2" x 6" standard or scaled dimensions in inches
    const imgData = finalCanvas.toDataURL('image/jpeg', 0.96)

    // Calculate dimensions in inches (at 300 DPI)
    const docWidthInches = finalCanvas.width / 300
    const docHeightInches = finalCanvas.height / 300

    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'in',
      format: [docWidthInches, docHeightInches]
    })

    doc.addImage(imgData, 'JPEG', 0, 0, docWidthInches, docHeightInches)
    doc.save(`${cleanName}_print_300dpi.pdf`)

    onProgress('Download complete!')
    return { success: true, filename: `${cleanName}_print_300dpi.pdf`, format: 'pdf' }
  }

  if (fileType === 'jpg') {
    onProgress('Encoding high-quality JPEG...')
    // Flatten over solid background since JPG has no alpha
    const flattenedCanvas = document.createElement('canvas')
    flattenedCanvas.width = finalCanvas.width
    flattenedCanvas.height = finalCanvas.height
    const flatCtx = flattenedCanvas.getContext('2d')
    flatCtx.fillStyle = '#FFFFFF'
    flatCtx.fillRect(0, 0, flattenedCanvas.width, flattenedCanvas.height)
    flatCtx.drawImage(finalCanvas, 0, 0)

    return new Promise((resolve) => {
      flattenedCanvas.toBlob(
        (blob) => {
          const filename = `${cleanName}_${scale}x.jpg`
          downloadBlob(blob, filename)
          onProgress('Download complete!')
          resolve({ success: true, filename, format: 'jpg' })
        },
        'image/jpeg',
        0.95
      )
    })
  }

  // PNG & Photobooth Overlay (PNG with Alpha Transparency)
  const isOverlay = fileType === 'photobooth_overlay'
  const fileSuffix = isOverlay ? 'photobooth_overlay' : `${scale}x`
  const outputFilename = `${cleanName}_${fileSuffix}.png`

  onProgress(`Encoding crisp ${isOverlay ? 'transparent overlay' : 'PNG'}...`)

  return new Promise((resolve) => {
    finalCanvas.toBlob((blob) => {
      downloadBlob(blob, outputFilename)
      onProgress('Download complete!')
      resolve({ success: true, filename: outputFilename, format: 'png' })
    }, 'image/png')
  })
}
