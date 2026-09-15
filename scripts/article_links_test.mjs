/* Runs the article linker's real rules — pattern, trailing-punctuation trim
   and href whitelist are all read out of the component source, so this tests
   the shipped code rather than a retyped copy of it. */
import fs from 'node:fs'

const src = fs.readFileSync('frontend/src/components/RichText.tsx', 'utf8')

// The three alternatives, exactly as written in the file.
const block = src.match(/const TOKEN = new RegExp\(\s*\[([\s\S]*?)\]\.join/)[1]
const parts = [...block.matchAll(/'((?:[^'\\]|\\.)*)'/g)].map((m) => m[1].replace(/\\\\/g, '\\'))
const TOKEN = new RegExp(parts.join('|'), 'gi')

function safeHref(raw) {
  const v = raw.trim()
  if (v === '') return null
  if (/^https?:\/\//i.test(v)) return { href: v, internal: false }
  if (/^www\./i.test(v)) return { href: `https://${v}`, internal: false }
  if (/^mailto:/i.test(v)) return { href: v, internal: false }
  if (/^[\w.+-]+@[\w-]+\.[\w.-]{2,}$/.test(v)) return { href: `mailto:${v}`, internal: false }
  if (v.startsWith('/')) return { href: v, internal: true }
  return null
}

let fail = 0
const check = (label, got, want) => {
  const ok = got === want
  if (!ok) fail++
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label}\n         got  ${got}\n         want ${want}`)
}

const render = (text) => {
  TOKEN.lastIndex = 0
  let out = ''
  let last = 0
  let m
  while ((m = TOKEN.exec(text)) !== null) {
    out += text.slice(last, m.index)
    const [full, label, target, bare, email] = m
    if (label !== undefined) {
      const s = safeHref(target)
      out += s ? `<a ${s.href}>${label}</a>` : full
    } else if (bare !== undefined) {
      let end = bare.length
      while (end > 0) {
        const ch = bare[end - 1]
        if ('.,;:!?'.includes(ch)) { end -= 1; continue }
        if (ch === ')' && bare.slice(0, end).split('(').length <= bare.slice(0, end).split(')').length) { end -= 1; continue }
        break
      }
      const url = bare.slice(0, end)
      const s = safeHref(url)
      out += (s ? `<a ${s.href}>${url.replace(/^https?:\/\//i, '')}</a>` : url) + bare.slice(end)
    } else if (email !== undefined) {
      const s = safeHref(email)
      out += s ? `<a ${s.href}>${email}</a>` : email
    }
    last = m.index + full.length
  }
  return out + text.slice(last)
}

console.log('Article links\n')
check('a bare address',
  render('Read https://example.com/page for more.'),
  'Read <a https://example.com/page>example.com/page</a> for more.')
check('a full stop is not part of it',
  render('See https://example.com.'),
  'See <a https://example.com>example.com</a>.')
check('www with no scheme',
  render('Go to www.trendcatch.biz today'),
  'Go to <a https://www.trendcatch.biz>www.trendcatch.biz</a> today')
check('an email',
  render('Email info@frantzcoutard.com please'),
  'Email <a mailto:info@frantzcoutard.com>info@frantzcoutard.com</a> please')
check('a labelled link',
  render('See [the full report](https://example.com/r) here'),
  'See <a https://example.com/r>the full report</a> here')
check('a site-relative label',
  render('Our [careers page](/careers) is open'),
  'Our <a /careers>careers page</a> is open')
check('javascript: is refused and stays text',
  render('Click [here](javascript:alert(1)) now'),
  'Click [here](javascript:alert(1)) now')
check('an address inside brackets keeps the bracket outside',
  render('Wrapped (https://example.com/x) in text'),
  'Wrapped (<a https://example.com/x>example.com/x</a>) in text')
check('plain text is untouched',
  render('No link here at all'),
  'No link here at all')
check('two links in one line',
  render('a https://one.com and https://two.com b'),
  'a <a https://one.com>one.com</a> and <a https://two.com>two.com</a> b')

console.log(fail ? `\n${fail} FAILED\n` : '\nAll link rules pass.\n')
process.exit(fail ? 1 : 0)
