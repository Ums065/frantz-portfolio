import { activeSocials, type Social } from '../lib/social'

/* SVG glyph for each platform, keyed by Social['key']. */
export function SocialIcon({ k }: { k: Social['key'] }) {
  switch (k) {
    case 'instagram':
      return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}><rect x="3" y="3" width="18" height="18" rx="5" /><circle cx="12" cy="12" r="4" /><circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" /></svg>
    case 'linkedin':
      return <svg viewBox="0 0 24 24" fill="currentColor"><path d="M4.98 3.5a2.5 2.5 0 11-.02 5 2.5 2.5 0 01.02-5zM3 9h4v12H3zM9 9h3.8v1.7h.05c.53-1 1.83-2.05 3.77-2.05 4.03 0 4.78 2.65 4.78 6.1V21h-4v-5.4c0-1.3 0-2.95-1.8-2.95-1.8 0-2.08 1.4-2.08 2.85V21H9z" /></svg>
    case 'youtube':
      return <svg viewBox="0 0 24 24" fill="currentColor"><path d="M23 12s0-3.3-.42-4.88a2.55 2.55 0 00-1.8-1.8C19.2 5 12 5 12 5s-7.2 0-8.78.32a2.55 2.55 0 00-1.8 1.8C1 8.7 1 12 1 12s0 3.3.42 4.88a2.55 2.55 0 001.8 1.8C4.8 19 12 19 12 19s7.2 0 8.78-.32a2.55 2.55 0 001.8-1.8C23 15.3 23 12 23 12zm-13 3.2V8.8L15.5 12z" /></svg>
    case 'facebook':
      return <svg viewBox="0 0 24 24" fill="currentColor"><path d="M22 12a10 10 0 10-11.56 9.88v-6.99H7.9V12h2.54V9.8c0-2.5 1.49-3.89 3.78-3.89 1.09 0 2.24.2 2.24.2v2.46h-1.26c-1.24 0-1.63.77-1.63 1.56V12h2.78l-.44 2.89h-2.34v6.99A10 10 0 0022 12z" /></svg>
    case 'x':
      return <svg viewBox="0 0 24 24" fill="currentColor"><path d="M17.5 3h3l-7.1 8.1L22 21h-6.4l-4.9-6.4L5 21H2l7.6-8.7L2 3h6.6l4.5 5.9zm-1.1 16h1.7L7.7 4.8H5.9z" /></svg>
    case 'tiktok':
      return <svg viewBox="0 0 24 24" fill="currentColor"><path d="M16.5 3c.3 2.1 1.5 3.6 3.5 3.9v2.4c-1.2.1-2.3-.2-3.5-.8v5.7c0 3-2.2 5.3-5.2 5.3a5.1 5.1 0 01-5.2-5.1c0-3 2.6-5.4 5.8-5v2.6c-.4-.1-.8-.2-1.2-.2-1.5 0-2.7 1.2-2.6 2.7 0 1.4 1.2 2.6 2.6 2.6 1.5 0 2.6-1.1 2.6-2.6V3z" /></svg>
  }
}

/* Icon rail used in the header (vertical) and footer (horizontal bar).
   Renders only platforms with a configured URL; renders nothing if none. */
export function SocialLinks({ variant }: { variant: 'rail' | 'bar' }) {
  if (activeSocials.length === 0) return null
  const className = variant === 'rail' ? 'nav__social' : 'soc'
  return (
    <div className={className}>
      {activeSocials.map((s) => (
        <a key={s.key} href={s.href} target="_blank" rel="noopener noreferrer" aria-label={s.label}>
          <SocialIcon k={s.key} />
        </a>
      ))}
    </div>
  )
}
