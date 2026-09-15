import { Fragment, type ReactNode } from 'react'
import { Link } from 'react-router-dom'

/* Turns the plain text an editor types into readable paragraphs with working
   links.

   It builds React elements rather than injecting HTML, so a stray angle
   bracket in an article is just an angle bracket and there is no way for
   markup — pasted in from anywhere — to become live HTML. That matters even
   though only admins write posts: an admin pasting a formatted quote from the
   web should never be able to break the page, let alone run script on it.

   What it understands, in the order it looks for them:
     [read the report](https://example.com)   a labelled link
     https://example.com/page                 a bare address
     www.example.com                          the same, without the scheme
     hello@example.com                        an email
   A blank line starts a new paragraph; a single newline is a line break,
   which is what "separate paragraphs with a blank line" implies. */

const TOKEN = new RegExp(
  [
    // [label](target)
    '\\[([^\\]\\n]{1,160})\\]\\(\\s*([^\\s)]{1,500})\\s*\\)',
    // bare http(s) or www address
    '(https?://[^\\s<>"\'\\)\\]]+|www\\.[^\\s<>"\'\\)\\]]+)',
    // email
    '([\\w.+-]+@[\\w-]+\\.[\\w.-]{2,})',
  ].join('|'),
  'gi',
)

/* Addresses often end a sentence, and the full stop is not part of them.
   Closing brackets only count when they balance one that opened inside. */
function trimTrailing(url: string): [string, string] {
  let end = url.length
  while (end > 0) {
    const ch = url[end - 1]
    if ('.,;:!?'.includes(ch)) { end -= 1; continue }
    if (ch === ')' && (url.slice(0, end).split('(').length <= url.slice(0, end).split(')').length)) { end -= 1; continue }
    break
  }
  return [url.slice(0, end), url.slice(end)]
}

/** http, https, mailto and site-relative only. Anything else — javascript:,
 *  data:, a bare word — is left as plain text rather than made clickable. */
function safeHref(raw: string): { href: string; internal: boolean } | null {
  const v = raw.trim()
  if (v === '') return null
  if (/^https?:\/\//i.test(v)) {
    try {
      const u = new URL(v)
      // A link to our own site should not reload the whole app.
      if (typeof window !== 'undefined' && u.origin === window.location.origin) {
        return { href: u.pathname + u.search + u.hash, internal: true }
      }
    } catch { return null }
    return { href: v, internal: false }
  }
  if (/^www\./i.test(v)) return { href: `https://${v}`, internal: false }
  if (/^mailto:/i.test(v)) return { href: v, internal: false }
  if (/^[\w.+-]+@[\w-]+\.[\w.-]{2,}$/.test(v)) return { href: `mailto:${v}`, internal: false }
  if (v.startsWith('/')) return { href: v, internal: true }
  return null
}

function Anchor({ href, internal, children }: { href: string; internal: boolean; children: ReactNode }) {
  if (internal) return <Link to={href}>{children}</Link>
  // noreferrer as well as noopener: an outbound link from an article should
  // not hand the destination the page the reader came from.
  return <a href={href} target="_blank" rel="noopener noreferrer">{children}</a>
}

/** One run of text with its links turned into anchors. */
function linkify(text: string, keyPrefix: string): ReactNode[] {
  const out: ReactNode[] = []
  let last = 0
  let n = 0
  TOKEN.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = TOKEN.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index))
    const [full, label, target, bare, email] = m
    const key = `${keyPrefix}-${n++}`

    if (label !== undefined && target !== undefined) {
      const safe = safeHref(target)
      out.push(safe ? <Anchor key={key} {...safe}>{label}</Anchor> : full)
    } else if (bare !== undefined) {
      const [url, tail] = trimTrailing(bare)
      const safe = safeHref(url)
      // Shown without the scheme: an article reads better with
      // "frantzcoutard.com/blog" than with the whole address.
      out.push(safe ? <Anchor key={key} {...safe}>{url.replace(/^https?:\/\//i, '')}</Anchor> : url)
      if (tail) out.push(tail)
    } else if (email !== undefined) {
      const safe = safeHref(email)
      out.push(safe ? <Anchor key={key} {...safe}>{email}</Anchor> : email)
    }
    last = m.index + full.length
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}

/** Text with single newlines kept as line breaks. */
function withBreaks(text: string, keyPrefix: string): ReactNode[] {
  return text.split('\n').flatMap((line, i, all) => {
    const parts: ReactNode[] = [<Fragment key={`${keyPrefix}-l${i}`}>{linkify(line, `${keyPrefix}-${i}`)}</Fragment>]
    if (i < all.length - 1) parts.push(<br key={`${keyPrefix}-br${i}`} />)
    return parts
  })
}

export default function RichText({ text, inline }: { text: string; inline?: boolean }) {
  const value = text || ''
  // On a card there is no room for paragraphs — the excerpt is one run of text.
  if (inline) return <>{linkify(value.replace(/\s*\n\s*/g, ' '), 'i')}</>
  return (
    <>
      {value.split(/\n{2,}/).map((para, i) => (
        <p key={i}>{withBreaks(para, `p${i}`)}</p>
      ))}
    </>
  )
}
