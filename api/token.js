// Vercel serverless function: GET /api/token?code=1234
// Header: Authorization: Bearer <Firebase ID token>
// Returns { appId, token } so the browser can join the Agora video channel of room 1234.
//
// This code runs on Vercel's server, NOT in the browser. That is why it can safely use the
// App Certificate (a secret). The browser only ever sees the token, which works for
// one channel + one user, and expires after a few hours.
//
// Who gets a token: only a signed-in user (checked by Firebase) who is a member of that room,
// while the room is still open. The Agora user id is the caller's checked Firebase uid,
// so nobody can join the call pretending to be someone else.

// agora-token is Agora's official package for making tokens.
// It is an older style (CommonJS) package, so we import the whole package and take out what we need.
import agoraToken from 'agora-token'
import { adminDb, getCaller } from './_lib/firebaseAdmin.js'
const { RtcTokenBuilder, RtcRole } = agoraToken

const TOKEN_EXPIRE_SECONDS = 3 * 60 * 60 // 3 hours

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  // Read the secrets from Vercel environment variables (set in the Vercel dashboard or .env)
  const appId = process.env.AGORA_APP_ID
  const appCertificate = process.env.AGORA_APP_CERTIFICATE
  if (!appId || !appCertificate) {
    console.error('AGORA_APP_ID or AGORA_APP_CERTIFICATE is not set')
    return res.status(500).json({ error: 'Video call is not available' })
  }

  // ?code=1234 from the URL: must be exactly 4 digits
  const code = String(req.query.code || '')
  if (!/^[0-9]{4}$/.test(code)) {
    return res.status(400).json({ error: 'Invalid room code' })
  }

  try {
    // 1. Who is asking? (Firebase checks the ID token the browser sent)
    const caller = await getCaller(req)
    if (caller === null) {
      return res.status(401).json({ error: 'Please sign in again' })
    }

    // 2. Is the room open, and is the caller in it?
    const db = adminDb()
    const [roomSnap, memberSnap] = await Promise.all([
      db.doc('rooms/' + code).get(),
      db.doc('rooms/' + code + '/members/' + caller.uid).get(),
    ])
    if (!roomSnap.exists || roomSnap.data().closed === true || !memberSnap.exists) {
      return res.status(403).json({ error: 'You are not in this room' })
    }

    // 3. Make the token. Our user ids are Firebase uids, which are strings (e.g. "Xk3v9..."),
    //    so we use the "user account" version. PUBLISHER means this user is allowed to send video.
    const token = RtcTokenBuilder.buildTokenWithUserAccount(
      appId,
      appCertificate,
      'blue-studios-' + code,
      caller.uid,
      RtcRole.PUBLISHER,
      TOKEN_EXPIRE_SECONDS,
      TOKEN_EXPIRE_SECONDS
    )

    // The App ID is not a secret, so we send it back too. Then the frontend does not need its own copy.
    return res.status(200).json({ appId: appId, token: token })
  } catch (error) {
    // Log the details for us (Vercel > Logs), but only send a general message to the browser
    console.error(error)
    return res.status(500).json({ error: 'Video call is not available' })
  }
}
