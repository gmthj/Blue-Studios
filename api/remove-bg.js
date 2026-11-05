// Vercel serverless function: POST /api/remove-bg
// Body: { image: '<base64 PNG, without the data: prefix>' }
// Header: Authorization: Bearer <Firebase ID token>
// Returns the cut-out as a PNG.
//
// This runs on Vercel's server, not in the browser, so the remove.bg key (which costs
// money) is never copied into the JavaScript that every visitor downloads.
// Same pattern as api/token.js: check who is calling, then do the secret work.

import { getCaller, adminDb } from './_lib/firebaseAdmin.js'

// Per-user cooldown window in memory so one account cannot rapidly drain remove.bg credits
const RATE_WINDOW_MS = 10 * 60 * 1000
const MAX_REQUESTS_PER_WINDOW = 20
const userHits = new Map()

function isRateLimited(uid) {
  const now = Date.now()
  if (userHits.size > 500) userHits.clear()
  const recent = (userHits.get(uid) || []).filter((t) => now - t < RATE_WINDOW_MS)
  if (recent.length >= MAX_REQUESTS_PER_WINDOW) return true
  recent.push(now)
  userHits.set(uid, recent)
  return false
}

export default async function handler(req, res) {
  // Only POST: this function spends our remove.bg credits, so nothing else may reach it.
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  // The key comes from Vercel's environment variables, with no VITE_ prefix, so it stays secret.
  const apiKey = process.env.REMOVE_BG_API_KEY
  if (!apiKey) {
    console.error('REMOVE_BG_API_KEY is not set')
    return res.status(500).json({ error: 'Background removal is not available' })
  }

  // Who is asking? getCaller checks the Firebase ID token the browser sent.
  // Guests are refused: an anonymous visitor is one click away, so they would drain the free quota.
  const caller = await getCaller(req)
  if (caller === null || caller.firebase.sign_in_provider === 'anonymous') {
    return res.status(401).json({ error: 'Log in to remove backgrounds' })
  }

  // Banned accounts cannot spend remove.bg credits
  const profileSnap = await adminDb().doc('users/' + caller.uid).get()
  if (profileSnap.exists && profileSnap.data().banned === true) {
    return res.status(403).json({ error: 'Your account has been suspended' })
  }

  if (isRateLimited(caller.uid)) {
    return res.status(429).json({ error: 'Too many background removals. Please wait a few minutes.' })
  }

  // Check the input before spending a credit: base64 text only, and small enough for Vercel
  // (Vercel allows about 4.5 MB per request; 3,000,000 characters is about 2.2 MB of image).
  const image = String((req.body && req.body.image) || '')
  if (image.length === 0 || image.length > 3000000 || !/^[A-Za-z0-9+/=]+$/.test(image)) {
    return res.status(400).json({ error: 'Invalid image' })
  }

  try {
    // Send the picture to remove.bg with our secret key.
    // The key travels in a header, never in the URL, so it cannot leak into logs.
    const form = new FormData()
    form.append('image_file_b64', image)
    form.append('size', 'auto')

    const response = await fetch('https://api.remove.bg/v1.0/removebg', {
      method: 'POST',
      headers: { 'X-Api-Key': apiKey },
      body: form,
    })

    // Log the real reason for us (Vercel > Logs), but send the browser only a friendly message
    if (!response.ok) {
      console.error('remove.bg error', response.status, await response.text())
      return res.status(502).json({ error: 'Could not remove the background' })
    }

    // Send the PNG itself back, so the browser can turn it straight into a Blob
    res.setHeader('Content-Type', 'image/png')
    return res.send(Buffer.from(await response.arrayBuffer()))
  } catch (error) {
    console.error(error)
    return res.status(500).json({ error: 'Could not remove the background' })
  }
}