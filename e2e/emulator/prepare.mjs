// Gets the Firebase emulators ready for the end-to-end tests (run by playwright.config.js before it starts them).
//
// The emulators use the SAME security rules as the real project, with one change: on the real project, file links
// start with https://firebasestorage.googleapis.com, but the Storage emulator's links start with
// http://127.0.0.1:9199. Some rules check a link really is one of our files (profile pictures, template cards,
// frame pictures, songs), so here they also accept the emulator's links. Nothing else is changed.
//
// The copies go in e2e/.emulator/ (not committed), with a firebase.json that points at them.
import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..', '..')
const out = path.join(root, 'e2e', '.emulator')
fs.mkdirSync(out, { recursive: true })

const REAL = 'https://firebasestorage[.]googleapis[.]com'
const EITHER = '(https://firebasestorage[.]googleapis[.]com|http://127[.]0[.]0[.]1:9199)'

let firestoreRules = fs.readFileSync(path.join(root, 'firestore.rules'), 'utf8')
const before = firestoreRules
firestoreRules = firestoreRules.replaceAll(REAL, EITHER)
// songs in the mixer: any https link (Jamendo or our Storage), plus the emulator's http link
firestoreRules = firestoreRules.replaceAll("t.audio.matches('https://.*')", "t.audio.matches('(https://|http://127[.]0[.]0[.]1:9199/).*')")
if (firestoreRules === before) {
  throw new Error('e2e/emulator/prepare.mjs: the link checks in firestore.rules changed, update this file to match')
}

fs.writeFileSync(path.join(out, 'firestore.rules'), firestoreRules)
fs.copyFileSync(path.join(root, 'storage.rules'), path.join(out, 'storage.rules'))
fs.copyFileSync(path.join(root, 'firestore.indexes.json'), path.join(out, 'firestore.indexes.json'))

const config = JSON.parse(fs.readFileSync(path.join(root, 'firebase.json'), 'utf8'))
config.firestore = { rules: 'firestore.rules', indexes: 'firestore.indexes.json' }
config.storage = { rules: 'storage.rules' }
config.emulators.hub = { port: 4400 }
config.emulators.ui = { enabled: false }
fs.writeFileSync(path.join(out, 'firebase.json'), JSON.stringify(config, null, 2))

console.log('Emulator rules ready in e2e/.emulator/')

// Also used as Playwright's globalSetup (playwright.config.js): the copies above are made again on every test run,
// even when emulators that are already running get reused. The emulators reload rules files when they change,
// so reused emulators always test today's rules, not the ones from when they were started.
export default function () {}
