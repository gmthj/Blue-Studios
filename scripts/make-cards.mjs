// Make the card pictures (see "Card pictures" in src/studio.js) for templates and stickers saved before
// cards existed. The website makes them when something is saved, so this only needs to run once.
// Run on YOUR laptop:
//
//   npm run make-cards -- --dry-run   only list what it would do
//   npm run make-cards                make the missing cards
//
// It uses the secret service account key in .env (FIREBASE_SERVICE_ACCOUNT) and the bucket name in
// VITE_FIREBASE_STORAGE_BUCKET, like scripts/set-cors.mjs. Items that already have a card are skipped,
// so it is safe to run again.

import { randomUUID } from 'node:crypto'
import events from 'node:events'
import sharp from 'sharp'
import { getDownloadURL } from 'firebase-admin/storage'
import { adminDb, adminStorage } from '../api/_lib/firebaseAdmin.js'

// The same sizes and cache settings as studio.js
const CARD_WIDTH = 400
const CARD_MAX_HEIGHT = 1200
const NEVER_CHANGES = 'public, max-age=31536000, immutable'
const MAY_CHANGE = 'no-cache'

// Storage's download() puts more than Node's default of 10 listeners on each download stream, which
// prints a "MaxListenersExceededWarning" for every file. Harmless (each stream is thrown away after its
// download), so allow more here to keep the output readable.
events.defaultMaxListeners = 30

const dryRun = process.argv.includes('--dry-run')
const bucketName = process.env.VITE_FIREBASE_STORAGE_BUCKET
if (!bucketName) {
  console.error('VITE_FIREBASE_STORAGE_BUCKET is not set in .env')
  process.exit(1)
}
const bucket = adminStorage().bucket(bucketName)

let made = 0
let failed = 0

for (const type of ['templates', 'stickers']) {
  const snapshot = await adminDb().collection(type).get()
  for (const itemDoc of snapshot.docs) {
    const item = itemDoc.data()
    if (item.cardUrl) continue

    const source = type === 'templates' ? item.thumbnailPath : item.imagePath
    const folder = source.slice(0, source.lastIndexOf('/') + 1)
    const label = type + '/' + itemDoc.id + ' "' + item.name + '"'

    try {
      const [image] = await bucket.file(source).download()
      const pages = (await sharp(image).metadata()).pages || 1

      // Moving stickers keep their own image as the card (a resized copy would stop moving)
      let cardPath = source
      if (!(type === 'stickers' && (item.kind !== 'static' || pages > 1))) {
        cardPath = folder + 'card.webp'
        const card = await sharp(image)
          .resize({ width: CARD_WIDTH, height: CARD_MAX_HEIGHT, fit: 'inside', withoutEnlargement: true })
          .webp({ quality: 85 })
          .toBuffer()
        console.log(label + ': ' + kb(image.length) + ' -> ' + kb(card.length))

        if (!dryRun) {
          // The download token is what makes the link work; the website's uploads get one automatically
          await bucket.file(cardPath).save(card, {
            contentType: 'image/webp',
            metadata: {
              cacheControl: type === 'templates' ? MAY_CHANGE : NEVER_CHANGES,
              metadata: { firebaseStorageDownloadTokens: randomUUID() },
            },
          })
        }
      } else {
        console.log(label + ': moving sticker, its image is the card')
      }

      if (!dryRun) {
        const cardUrl = await getDownloadURL(bucket.file(cardPath))
        await itemDoc.ref.update({ cardPath, cardUrl }) // not updatedAt: nothing the owner sees changed
      }
      made++
    } catch (error) {
      console.error(label + ': FAILED', error.message)
      failed++
    }
  }
}

console.log((dryRun ? 'Would make ' : 'Made ') + made + ' cards' + (failed ? ', ' + failed + ' failed' : ''))
process.exit(failed ? 1 : 0)

function kb(bytes) {
  return Math.round(bytes / 1024) + ' KB'
}
