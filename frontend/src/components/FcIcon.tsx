/* Line-icon set for the Fellow CRM. Inline SVG rather than emoji so the icons
   inherit the gold text colour, stay crisp at any size, and render identically
   on every platform (emoji glyphs differ wildly between Windows/Mac/Android). */

export type IconName =
  | 'sunrise' | 'building' | 'funnel' | 'phone' | 'mail' | 'cap' | 'award'
  | 'trending' | 'folder' | 'clipboard' | 'plus' | 'upload' | 'sparkles'
  | 'trash' | 'send' | 'contact' | 'calendar' | 'file' | 'note' | 'linkedin'
  | 'check' | 'search' | 'external'

/* Each entry is the inner geometry of a 24×24 icon drawn on a 1.7px stroke. */
const PATHS: Record<IconName, JSX.Element> = {
  sunrise: <><path d="M12 3v3M5.6 8.6 3.5 6.5M18.4 8.6l2.1-2.1M3 17h3M18 17h3M8 17a4 4 0 0 1 8 0M2 21h20" /></>,
  building: <><path d="M4 21V5a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v16M15 10h4a1 1 0 0 1 1 1v10M2 21h20M8 8h3M8 12h3M8 16h3M18 14h.01M18 18h.01" /></>,
  funnel: <><path d="M4 5h16M6.5 10h11M9.5 15h5M11 20h2" /></>,
  phone: <><path d="M15.5 21a13 13 0 0 1-12.5-12.5 2 2 0 0 1 2-2.2h2.6a1 1 0 0 1 1 .84l.5 2.6a1 1 0 0 1-.5 1.03l-1.3.75a10 10 0 0 0 4.4 4.4l.75-1.3a1 1 0 0 1 1.03-.5l2.6.5a1 1 0 0 1 .84 1V19a2 2 0 0 1-2.2 2Z" /></>,
  mail: <><rect x="2.5" y="5" width="19" height="14" rx="2" /><path d="m3.5 6.5 8.5 6 8.5-6" /></>,
  cap: <><path d="M2.5 8.5 12 4l9.5 4.5L12 13 2.5 8.5Z" /><path d="M6 10.5V16c0 1.5 2.7 3 6 3s6-1.5 6-3v-5.5M21.5 9v5" /></>,
  award: <><circle cx="12" cy="9" r="5.5" /><path d="m8.5 13.8-1 7 4.5-2.6 4.5 2.6-1-7" /></>,
  trending: <><path d="M3 20V4M3 20h18M7 15l3.5-4 3 2.5L20 7" /><path d="M20 11V7h-4" /></>,
  folder: <><path d="M3 8a2 2 0 0 1 2-2h3.5l2 2.5H19a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8Z" /></>,
  clipboard: <><path d="M9 4h6v2.5H9zM9 5H7a1 1 0 0 0-1 1v13a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1h-2" /><path d="M9 11h6M9 15h4" /></>,
  plus: <><path d="M12 5v14M5 12h14" /></>,
  upload: <><path d="M12 16V4M7.5 8.5 12 4l4.5 4.5M4 20h16" /></>,
  sparkles: <><path d="M12 3.5 13.4 8l4.6 1.5-4.6 1.5L12 15.5 10.6 11 6 9.5 10.6 8 12 3.5ZM18.5 15l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8.8-2.2ZM5 15l.6 1.7L7.3 17.3l-1.7.6L5 19.6l-.6-1.7-1.7-.6 1.7-.6L5 15Z" /></>,
  trash: <><path d="M4 7h16M9.5 7V4.5h5V7M6 7l1 13h10l1-13M10.5 11v5M13.5 11v5" /></>,
  send: <><path d="M21 4 3 11l7 2.5L12.5 21 21 4Z" /><path d="m10 13.5 4-4" /></>,
  contact: <><rect x="2.5" y="5" width="19" height="14" rx="2" /><circle cx="9" cy="11" r="2.2" /><path d="M5.5 16.2a4 4 0 0 1 7 0M15 10h4M15 13.5h4" /></>,
  calendar: <><rect x="3.5" y="5.5" width="17" height="15" rx="2" /><path d="M3.5 10h17M8 3.5V7M16 3.5V7" /></>,
  file: <><path d="M6 3.5h7L18 8v12.5H6Z" /><path d="M13 3.5V8h5M9 12h6M9 16h4" /></>,
  note: <><path d="M5 4h11l3 3v13H5z" /><path d="M8.5 9.5h7M8.5 13h7M8.5 16.5h4" /></>,
  linkedin: <><rect x="3.5" y="3.5" width="17" height="17" rx="2.5" /><path d="M8 10.5V16M8 7.6v.1M12 16v-3.2a1.8 1.8 0 0 1 3.6 0V16" /></>,
  check: <><path d="m5 12.5 4.5 4.5L19 7.5" /></>,
  search: <><circle cx="10.5" cy="10.5" r="6.5" /><path d="m15.5 15.5 4.5 4.5" /></>,
  external: <><path d="M14 4h6v6M20 4l-8.5 8.5M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" /></>,
}

export default function FcIcon({ name, size = 18, className }: { name: IconName; size?: number; className?: string }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"
      aria-hidden="true" focusable="false" style={{ flex: '0 0 auto' }}>
      {PATHS[name]}
    </svg>
  )
}
