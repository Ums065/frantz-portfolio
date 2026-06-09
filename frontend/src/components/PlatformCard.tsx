import type { Platform } from '../lib/platforms'

/* One platform card — used in the About grid and the Home ecosystem band. */
export default function PlatformCard({ platform, delay = 1 }: { platform: Platform; delay?: number }) {
  return (
    <article className={`glass platform reveal d${delay}`}>
      <div className="platform__tag">{platform.tag}</div>
      <h3>{platform.name}</h3>
      <p>{platform.copy}</p>
      {platform.link && (
        <a className="platform__link" href={platform.link} target="_blank" rel="noopener noreferrer">
          Visit Site
          <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth={2}><path d="M7 17L17 7M9 7h8v8" /></svg>
        </a>
      )}
    </article>
  )
}
