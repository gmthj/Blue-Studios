// Vercel serverless function: the daily room cleanup.   GET /api/cleanup[?dryRun=1]
// Header: Authorization: Bearer <CRON_SECRET>
//
// Vercel calls this once a day (the "crons" entry in vercel.json) and sends the CRON_SECRET environment
// variable as the Bearer token. Without it set, this refuses to run, so nobody else can trigger it.
// The rules are in src/roomCleanup.js (the admin page uses the same file to show "deletes in N days").
//
// ?dryRun=1 only reports what would happen and changes nothing. Run it first after a change to the rules.
// Every automatic close or delete is written to the admin log with adminId 'system'.

import { adminDb } from './_lib/firebaseAdmin.js'
import { deleteRoomEverything } from './_lib/roomDelete.js'
import { cleanupStatus, RULE_NAMES } from '../src/roomCleanup.js'

// At most this many rooms are changed per run, and we stop starting new ones after TIME_BUDGET_MS
// (a function on the Hobby plan may run for up to 60 seconds). What is left is picked up the next day.
const MAX_ACTIONS = 200
const TIME_BUDGET_MS = 45 * 1000

export default async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }
  const secret = process.env.CRON_SECRET
  if (!secret) {
    return res.status(500).json({ error: 'CRON_SECRET is not set' })
  }
  if ((req.headers.authorization || '') !== 'Bearer ' + secret) {
    return res.status(401).json({ error: 'Not allowed' })
  }

  try {
    const dryRun = req.query && String(req.query.dryRun) === '1'
    return res.status(200).json(await sweep(dryRun, Date.now()))
  } catch (error) {
    console.error(error) // details only in the Vercel logs
    return res.status(500).json({ error: 'Something went wrong' })
  }
}

// Look at every room, then close or delete the ones whose rule is due.
// Returns { dryRun, scanned, closed: [{ code, rule }], deleted: [{ code, rule }], leftForNextRun }
export async function sweep(dryRun, now) {
  const db = adminDb()
  const [rooms, members] = await Promise.all([
    db.collection('rooms').get(),
    db.collectionGroup('members').get(), // the members of every room, in one query
  ])

  const membersByRoom = {}
  members.docs.forEach((memberDoc) => {
    const room = memberDoc.ref.parent.parent
    if (!room || room.parent.id !== 'rooms') return
    if (!membersByRoom[room.id]) membersByRoom[room.id] = []
    membersByRoom[room.id].push(memberDoc.data())
  })

  // Deletes first (they free the most), then closes
  const work = []
  rooms.docs.forEach((roomDoc) => {
    const status = cleanupStatus(roomDoc.data(), membersByRoom[roomDoc.id] || [], now)
    if (status.due) work.push({ roomDoc: roomDoc, status: status })
  })
  work.sort((a, b) => (a.status.action === b.status.action ? a.status.rule - b.status.rule : a.status.action === 'delete' ? -1 : 1))

  const result = { dryRun: dryRun, scanned: rooms.size, closed: [], deleted: [], leftForNextRun: 0 }
  const started = Date.now()
  for (let i = 0; i < work.length; i++) {
    const { roomDoc, status } = work[i]
    if (result.closed.length + result.deleted.length >= MAX_ACTIONS || Date.now() - started > TIME_BUDGET_MS) {
      result.leftForNextRun = work.length - i
      break
    }
    const entry = { code: roomDoc.id, rule: status.rule }
    if (!dryRun) {
      try {
        if (status.action === 'delete') {
          await deleteRoomEverything(roomDoc.id, roomDoc)
        } else {
          await roomDoc.ref.update({ closed: true })
        }
        await writeLog(db, status, roomDoc.id, now)
      } catch (error) {
        console.error('Cleanup failed for room ' + roomDoc.id, error) // try the others
        continue
      }
    }
    if (status.action === 'delete') result.deleted.push(entry)
    else result.closed.push(entry)
  }
  return result
}

async function writeLog(db, status, code, now) {
  await db.collection('adminLog').add({
    adminId: 'system',
    action: status.action === 'delete' ? 'deleteRoom' : 'closeRoom',
    targetType: 'rooms',
    targetId: code,
    reason: 'Automatic cleanup. ' + RULE_NAMES[status.rule],
    createdAt: now,
  })
}
