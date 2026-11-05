import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import { existsSync } from 'node:fs'

// Runs our api/ functions inside the Vite dev server, so `npm run dev` works without `vercel dev`.
// Only used in dev mode (configureServer); the real site still runs them on Vercel.
// Vercel adds a few helpers to req/res that plain Node does not have, so we add the ones
// our api/ files use: req.query, req.body, res.status(), res.json(), res.send().
// The daily cron (vercel.json) does not run here; call /api/cleanup?dryRun=1 by hand to test it.
function localApi() {
  return {
    name: 'local-api',
    configureServer(server) {
      server.middlewares.use('/api', async (req, res, next) => {
        const url = new URL(req.url, 'http://localhost')
        const name = url.pathname.replace(/^\/+|\/+$/g, '') // '/token' -> 'token'
        // Only plain names like "token" or "remove-bg" that have a file: no _lib files, no ../ tricks.
        // Anything else is a 404, like on Vercel.
        if (!/^[a-z][a-z-]*$/.test(name) || !existsSync('api/' + name + '.js')) {
          res.statusCode = 404
          return res.end('Not found')
        }

        let mod
        try {
          mod = await server.ssrLoadModule('/api/' + name + '.js') // picks up edits without a restart
        } catch (error) {
          console.error(error)
          res.statusCode = 500
          return res.end('Could not load api/' + name + '.js')
        }

        req.query = Object.fromEntries(url.searchParams)
        let raw = ''
        for await (const chunk of req) raw += chunk
        try {
          req.body = raw ? JSON.parse(raw) : undefined
        } catch {
          req.body = raw
        }
        res.status = (code) => {
          res.statusCode = code
          return res
        }
        res.json = (data) => {
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify(data))
          return res
        }
        res.send = (data) => {
          res.end(data)
          return res
        }

        try {
          await mod.default(req, res)
        } catch (error) {
          console.error(error)
          if (!res.headersSent) {
            res.statusCode = 500
            res.end('Server error')
          }
        }
      })
    },
  }
}

// Vite is the dev server / build tool. The Vue plugin lets it read .vue files.
export default defineConfig(({ mode }) => {
  // The api/ functions read secrets from process.env (AGORA_APP_CERTIFICATE etc.). On Vercel those come
  // from the dashboard; here we load them from .env / .env.local. This only fills process.env on our
  // computer's side; the browser still only sees VITE_ variables. Already-set values are kept (tests).
  const env = loadEnv(mode, process.cwd(), '')
  for (const key in env) {
    if (process.env[key] === undefined) process.env[key] = env[key]
  }

  return {
    plugins: [vue(), localApi()],
    // FFmpeg.wasm starts its own web worker from a file next to it, which breaks if Vite
    // pre-bundles the package in dev mode. So Vite leaves these two packages as they are.
    optimizeDeps: {
      exclude: ['@ffmpeg/ffmpeg', '@ffmpeg/util'],
    },
    // The api/ functions are run by Node as they are (not pre-bundled), so loading one for the first
    // time does not make Vite reload the page in the browser.
    ssr: {
      optimizeDeps: { noDiscovery: true },
    },
    test: {
      environment: 'jsdom',
    },
  }
})
