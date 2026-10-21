// Give or take away the admin (moderator) mark of an account. Run on YOUR laptop, never on the website:
//
//   npm run set-admin -- someone@example.com            make them an admin
//   npm run set-admin -- someone@example.com --remove   take it away
//
// It uses the secret service account key in .env (FIREBASE_SERVICE_ACCOUNT, the same one Vercel uses).
// The mark is a Firebase "custom claim" (admin: true) stored in the account's login token, so nobody can
// give it to themselves from the browser. The person must log out and in again (or refresh the page)
// to get a token with the new mark.

import { adminAuth, adminDb } from '../api/_lib/firebaseAdmin.js'

const args = process.argv.slice(2)
const email = args.find((arg) => !arg.startsWith('--'))
const remove = args.includes('--remove')

if (!email) {
  console.log('Usage: npm run set-admin -- someone@example.com [--remove]')
  process.exit(1)
}

try {
  const account = await adminAuth().getUserByEmail(email)
  const claims = { ...(account.customClaims || {}) }
  if (remove) {
    delete claims.admin
  } else {
    claims.admin = true
  }
  await adminAuth().setCustomUserClaims(account.uid, claims)

  // Keep a record of who was made an admin (shown on the admin page)
  await adminDb().collection('adminLog').add({
    adminId: 'set-admin script',
    action: remove ? 'removeAdmin' : 'makeAdmin',
    targetType: 'users',
    targetId: account.uid,
    reason: 'scripts/set-admin.mjs',
    createdAt: Date.now(),
  })

  console.log((remove ? 'Removed the admin mark from ' : 'Made admin: ') + email + ' (uid ' + account.uid + ')')
  console.log('They need to log out and in again (or refresh the page) for it to take effect.')
  process.exit(0)
} catch (error) {
  console.error(error.code === 'auth/user-not-found' ? 'No account with that email.' : error.message)
  process.exit(1)
}
