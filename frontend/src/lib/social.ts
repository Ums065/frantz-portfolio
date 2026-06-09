/* Social media links — single source of truth for header, footer and the
   "Follow the Journey" grid.

   👉 TO GO LIVE: paste the real profile URL into each `href` below.
      - Any entry left with an empty href is hidden from the icon rails
        (header + footer) and shows a "coming soon" toast on the home grid.
      - Update once here and every location on the site updates. */

export interface Social {
  key: 'instagram' | 'linkedin' | 'youtube' | 'facebook' | 'x' | 'tiktok'
  label: string
  handle: string
  href: string // ← paste the full https:// URL here
  bg: string // brand colour for the home grid icon tile
  cta: string
}

export const socials: Social[] = [
  { key: 'instagram', label: 'Instagram', handle: '@frantzcoutard', href: '', bg: 'linear-gradient(135deg,#f58529,#dd2a7b,#8134af)', cta: 'Follow' },
  { key: 'linkedin', label: 'LinkedIn', handle: 'Frantz Coutard', href: '', bg: '#0a66c2', cta: 'Connect' },
  { key: 'youtube', label: 'YouTube', handle: 'Frantz Coutard', href: '', bg: '#ff0000', cta: 'Subscribe' },
  { key: 'facebook', label: 'Facebook', handle: 'Frantz Coutard', href: '', bg: '#1877f2', cta: 'Follow' },
  { key: 'x', label: 'X / Twitter', handle: '@frantzcoutard', href: '', bg: '#000000', cta: 'Follow' },
  { key: 'tiktok', label: 'TikTok', handle: '@frantzcoutard', href: '', bg: '#000000', cta: 'Follow' },
]

/* Only platforms with a real URL — used by the header/footer icon rails. */
export const activeSocials = socials.filter((s) => s.href.trim() !== '')
