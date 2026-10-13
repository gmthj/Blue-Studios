// Vercel serverless function: GET /api/token?channel=blue-studios-1234&uid=guest-123
// Returns { appId, token } so the browser can join an Agora video channel.
//
// This code runs on Vercel's server, NOT in the browser. That is why it can safely use the
// App Certificate (a secret). The browser only ever sees the token, which works for
// one channel + one user, and expires after a few hours.

// agora-token is Agora's official package for making tokens.
// It is an older style (CommonJS) package, so we import the whole package and take out what we need.
import agoraToken from 'agora-token'
const { RtcTokenBuilder, RtcRole } = agoraToken

const TOKEN_EXPIRE_SECONDS = 3 * 60 * 60 // 3 hours

export default function handler(req, res) {
  // Read the secrets from Vercel environment variables (set in the Vercel dashboard or .env)
  const appId = process.env.AGORA_APP_ID
  const appCertificate = process.env.AGORA_APP_CERTIFICATE

  if (!appId || !appCertificate) {
    return res.status(500).json({ error: 'AGORA_APP_ID or AGORA_APP_CERTIFICATE is not set' })
  }

  // ?channel=...&uid=... from the URL
  const channel = req.query.channel
  const uid = req.query.uid

  if (!channel || !uid) {
    return res.status(400).json({ error: 'channel and uid are required' })
  }

  // Only make tokens for our own room channels
  if (!channel.startsWith('blue-studios-')) {
    return res.status(400).json({ error: 'invalid channel name' })
  }

  // Our guest ids are strings (e.g. "guest-1728-4821"), so we use the "user account" version.
  // PUBLISHER means this user is allowed to send video, not just watch.
  const token = RtcTokenBuilder.buildTokenWithUserAccount(
    appId,
    appCertificate,
    channel,
    uid,
    RtcRole.PUBLISHER,
    TOKEN_EXPIRE_SECONDS,
    TOKEN_EXPIRE_SECONDS
  )

  // The App ID is not a secret, so we send it back too. Then the frontend does not need its own copy.
  return res.status(200).json({ appId: appId, token: token })
}
