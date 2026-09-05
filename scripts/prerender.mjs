// Prerender the public SPA routes into static HTML so search engines get a
// unique, fully-rendered page per URL (fixes SPA "all pages look identical").
//
// How it works: serve the built dist/ at the site root, open each route in
// headless Chrome, let React render, then save the rendered DOM as
// dist/<route>/index.html. Run locally AFTER `vite build`, then upload dist/.
//
//   node scripts/prerender.mjs
//
// Chrome path / routes can be overridden via env (CHROME_PATH, PRERENDER_BASE).
//
// The static server PROXIES /api/* to a real backend (PRERENDER_API, default the
// local WAMP install). Without that the app's fetches fall back to index.html,
// every page renders with no data, and the saved HTML carries the generic
// site-wide title, description and OG image instead of its own. That is exactly
// why a shared /blog/12 showed the logo and "From Community to Legacy" rather
// than the article: social crawlers never run JS, so whatever is in the saved
// HTML is all they ever see.

import { createServer, request as httpRequest } from 'node:http'
import { execFile } from 'node:child_process'
import { readFile, writeFile, mkdir, stat } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { extname, join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DIST = join(__dirname, '..', 'frontend', 'dist')

const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe'

// Where the real API lives while prerendering. Anything reachable works — the
// local WAMP install, or the live site.
const API = (process.env.PRERENDER_API || 'http://localhost/frantz-portfolio/api').replace(/\/+$/, '')

// Public, indexable routes only (mirrors sitemap.php; auth pages excluded).
// Per-article routes are discovered from the API below.
const STATIC_ROUTES = [
  '/', '/about', '/projects', '/awards', '/events', '/blog', '/winners',
  '/resources', '/partner', '/media', '/store', '/contact', '/donate',
  '/become-a-founding-sponsor', '/founding-sponsors',
  '/new-school', '/terms', '/privacy', '/content-disclaimer',
]

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.woff': 'font/woff', '.woff2': 'font/woff2',
  '.txt': 'text/plain', '.xml': 'application/xml', '.map': 'application/json',
}

if (!existsSync(DIST)) {
  console.error(`dist not found at ${DIST} — run "npm run build" in frontend/ first.`)
  process.exit(1)
}
if (!existsSync(CHROME)) {
  console.error(`Chrome not found at ${CHROME} — set CHROME_PATH env var.`)
  process.exit(1)
}

const indexHtml = await readFile(join(DIST, 'index.html'), 'utf8')

/** Pipe an /api/* call through to the real backend, so pages render with data. */
function proxyApi(req, res) {
  const target = new URL(API + req.url.replace(/^\/api/, ''))
  const up = httpRequest({
    protocol: target.protocol, hostname: target.hostname,
    port: target.port || 80, path: target.pathname + target.search,
    method: req.method, headers: { ...req.headers, host: target.host },
  }, (upRes) => {
    res.writeHead(upRes.statusCode || 502, upRes.headers)
    upRes.pipe(res)
  })
  up.on('error', () => {
    // The backend being down must not hang the render — answer empty JSON.
    if (!res.headersSent) res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end('{}')
  })
  req.pipe(up)
}

// Static server for dist/ with SPA fallback (unknown routes → index.html).
const server = createServer(async (req, res) => {
  try {
    const urlPath = decodeURIComponent((req.url || '/').split('?')[0])
    if (urlPath.startsWith('/api/')) { proxyApi(req, res); return }
    const ext = extname(urlPath)
    if (ext) {
      const filePath = join(DIST, urlPath)
      if (existsSync(filePath) && (await stat(filePath)).isFile()) {
        res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' })
        res.end(await readFile(filePath))
        return
      }
    }
    // SPA fallback for app routes.
    res.writeHead(200, { 'Content-Type': 'text/html' })
    res.end(indexHtml)
  } catch (e) {
    res.writeHead(500); res.end('err')
  }
})

const port = await new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server.address().port)))
const base = `http://127.0.0.1:${port}`
console.log(`Serving dist/ at ${base}`)

const renderOne = (url) => new Promise((resolve, reject) => {
  execFile(CHROME, [
    '--headless=new', '--disable-gpu', '--no-sandbox', '--no-first-run',
    '--hide-scrollbars', '--virtual-time-budget=12000',
    '--run-all-compositor-stages-before-draw', '--dump-dom', url,
  ], { maxBuffer: 64 * 1024 * 1024, timeout: 60000 }, (err, stdout) => {
    if (err) reject(err); else resolve(stdout)
  })
})

/* Every published article gets its own page. sitemap.php already tells Google
   these URLs exist, so without this each one served the generic shell. */
async function discoverArticleRoutes() {
  try {
    const res = await fetch(`${base}/api/posts`)
    const data = await res.json()
    const ids = (data?.posts || []).map((p) => Number(p.id)).filter((n) => Number.isFinite(n) && n > 0)
    return ids.map((id) => `/blog/${id}`)
  } catch (e) {
    console.warn(`  ! could not list articles from ${API} — ${e.message}`)
    console.warn('    Articles will be skipped. Start the API (WAMP) or set PRERENDER_API.')
    return []
  }
}

const articleRoutes = await discoverArticleRoutes()
const ROUTES = [...STATIC_ROUTES, ...articleRoutes]
console.log(`API proxied to ${API}`)
console.log(`${STATIC_ROUTES.length} static routes + ${articleRoutes.length} articles\n`)

let ok = 0
let generic = 0
for (const route of ROUTES) {
  try {
    const dom = await renderOne(base + route)
    if (!dom || dom.length < 500) throw new Error('empty render')
    const html = dom.startsWith('<!DOCTYPE') || dom.startsWith('<!doctype') ? dom : '<!doctype html>\n' + dom
    const outDir = route === '/' ? DIST : join(DIST, route)
    await mkdir(outDir, { recursive: true })
    await writeFile(join(outDir, 'index.html'), html, 'utf8')
    ok++
    /* A page that still carries the site-wide OG title rendered without its
       data — it would look generic when shared. Say so rather than pass it. */
    let note = ''
    if (route !== '/' && /og:title" content="Frantz Coutard - From Community to Legacy"/.test(html)) {
      note = '  ⚠ generic OG title — rendered without data?'
      generic++
    }
    console.log(`  ✓ ${route}  (${(html.length / 1024).toFixed(0)} KB)${note}`)
  } catch (e) {
    console.warn(`  ✗ ${route} — ${e.message}`)
  }
}

server.close()
console.log(`\nPrerendered ${ok}/${ROUTES.length} routes into dist/.`)
if (generic > 0) {
  console.warn(`\n⚠ ${generic} page(s) kept the generic OG tags, so they would look wrong when shared.`)
  console.warn(`  The API proxy target was ${API} — check it is running and reachable.`)
}
process.exit(ok > 0 ? 0 : 1)
