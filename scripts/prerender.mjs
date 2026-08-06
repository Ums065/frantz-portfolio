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

import { createServer } from 'node:http'
import { execFile } from 'node:child_process'
import { readFile, writeFile, mkdir, stat } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { extname, join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DIST = join(__dirname, '..', 'frontend', 'dist')

const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe'

// Public, indexable routes only (mirrors sitemap.php; auth pages excluded).
const ROUTES = [
  '/', '/about', '/projects', '/awards', '/events', '/blog', '/winners',
  '/resources', '/partner', '/media', '/store', '/contact',
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

// Static server for dist/ with SPA fallback (unknown routes → index.html).
const server = createServer(async (req, res) => {
  try {
    const urlPath = decodeURIComponent((req.url || '/').split('?')[0])
    const ext = extname(urlPath)
    if (ext) {
      const filePath = join(DIST, urlPath)
      if (existsSync(filePath) && (await stat(filePath)).isFile()) {
        res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' })
        res.end(await readFile(filePath))
        return
      }
    }
    // SPA fallback (including /api/* → app fetches fail gracefully to empty).
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

let ok = 0
for (const route of ROUTES) {
  try {
    const dom = await renderOne(base + route)
    if (!dom || dom.length < 500) throw new Error('empty render')
    const html = dom.startsWith('<!DOCTYPE') || dom.startsWith('<!doctype') ? dom : '<!doctype html>\n' + dom
    const outDir = route === '/' ? DIST : join(DIST, route)
    await mkdir(outDir, { recursive: true })
    await writeFile(join(outDir, 'index.html'), html, 'utf8')
    ok++
    console.log(`  ✓ ${route}  (${(html.length / 1024).toFixed(0)} KB)`)
  } catch (e) {
    console.warn(`  ✗ ${route} — ${e.message}`)
  }
}

server.close()
console.log(`\nPrerendered ${ok}/${ROUTES.length} routes into dist/.`)
process.exit(ok > 0 ? 0 : 1)
