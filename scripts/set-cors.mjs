// Apply storage.cors.json to our Firebase Storage bucket. Run on YOUR laptop:
//
//   npm run set-cors            apply storage.cors.json
//   npm run set-cors -- --show  only print what the bucket has now
//
// Why: our pages download Storage files with fetch() (loadTemplateProject in studio.js) and draw
// Storage images on a <canvas> to export strips. Browsers only allow that if the bucket says so
// (CORS). Uploads through the Firebase SDK do not need this.
//
// It is only about READING files in the browser (GET/HEAD). Who can read a file is still decided by
// storage.rules and the secret token in each download URL; CORS cannot give anyone extra access.
// "origin": ["*"] because Vercel gives every branch preview its own address.
//
// Uses the secret service account key in .env (FIREBASE_SERVICE_ACCOUNT) and the bucket name in
// VITE_FIREBASE_STORAGE_BUCKET.

import fs from 'node:fs'
import { adminStorage } from '../api/_lib/firebaseAdmin.js'

const bucketName = process.env.VITE_FIREBASE_STORAGE_BUCKET
if (!bucketName) {
  console.error('VITE_FIREBASE_STORAGE_BUCKET is not set in .env')
  process.exit(1)
}

try {
  const bucket = adminStorage().bucket(bucketName)
  if (!process.argv.includes('--show')) {
    const cors = JSON.parse(fs.readFileSync(new URL('../storage.cors.json', import.meta.url), 'utf8'))
    await bucket.setCorsConfiguration(cors)
    console.log('CORS set on ' + bucketName)
  }
  const [metadata] = await bucket.getMetadata()
  console.log(JSON.stringify(metadata.cors || [], null, 2))
  process.exit(0)
} catch (error) {
  console.error(error.message)
  process.exit(1)
}
