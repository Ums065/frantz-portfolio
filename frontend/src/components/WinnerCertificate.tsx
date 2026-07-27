import { createPortal } from 'react-dom'

/* Winner certificate — a printable award certificate the student can view and
   save as PDF (via the browser's Print → Save as PDF). No server-side PDF
   dependency: the preview is rendered in a modal, and "Download / Print" opens
   a self-contained print window. */

const PLACE_LABEL: Record<string, string> = { first: '1st Place', second: '2nd Place', third: '3rd Place' }
const PROGRAM = 'Community Business Impact Challenge'
const TAGLINE = 'Leave It Better Than You Found It'

function certificateHtml(name: string, placeLabel: string, amount: string, dateStr: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><title>Certificate — ${name}</title>
  <style>
    @page { size: landscape; margin: 0; }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: Georgia, 'Times New Roman', serif; background: #0d0d0d; }
    .cert { width: 1122px; height: 793px; margin: 0 auto; position: relative; color: #f4efe4;
      background: radial-gradient(circle at 50% 0%, #241f10, #0d0d0d 70%); padding: 64px; }
    .frame { position: absolute; inset: 26px; border: 2px solid #c9a84c; border-radius: 8px; }
    .frame::after { content:''; position:absolute; inset:8px; border:1px solid rgba(201,168,76,0.45); border-radius:6px; }
    .inner { position: relative; height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; }
    .eyebrow { letter-spacing: .35em; text-transform: uppercase; font-size: 13px; color: #c9a84c; }
    .title { font-size: 46px; margin: 10px 0 4px; color: #e6cd7f; letter-spacing: .04em; }
    .sub { font-size: 15px; color: #b7b0a0; font-style: italic; margin-bottom: 30px; }
    .awarded { font-size: 14px; color: #b7b0a0; letter-spacing: .1em; text-transform: uppercase; }
    .name { font-size: 44px; margin: 8px 0; color: #fff; border-bottom: 2px solid rgba(201,168,76,0.5); display: inline-block; padding: 0 26px 8px; }
    .place { font-size: 26px; color: #e6cd7f; margin: 22px 0 6px; letter-spacing: .06em; }
    .amount { font-size: 17px; color: #8fd6a3; }
    .foot { position: absolute; bottom: 44px; left: 64px; right: 64px; display: flex; justify-content: space-between; font-size: 12.5px; color: #b7b0a0; }
    .foot b { color: #f4efe4; display: block; border-top: 1px solid rgba(201,168,76,0.5); padding-top: 6px; margin-top: 26px; }
  </style></head><body>
  <div class="cert"><div class="frame"></div><div class="inner">
    <div class="eyebrow">${PROGRAM}</div>
    <div class="title">Certificate of Achievement</div>
    <div class="sub">“${TAGLINE}”</div>
    <div class="awarded">This certificate is proudly presented to</div>
    <div class="name">${name}</div>
    <div class="place">🏆 ${placeLabel}</div>
    ${amount ? `<div class="amount">Scholarship Award: ${amount}</div>` : ''}
    <div class="foot"><span><b>${dateStr}</b>Date</span><span><b>FrantzCoutard.com</b>Program Director</span></div>
  </div></div>
  <script>window.onload=function(){setTimeout(function(){window.print();},250);};</script>
  </body></html>`
}

export default function WinnerCertificate({ name, place, amount, onClose }: { name: string; place: string; amount?: number | string | null; onClose: () => void }) {
  const placeLabel = PLACE_LABEL[String(place)] || 'Winner'
  const amt = amount != null && Number(amount) > 0 ? `$${Number(amount).toLocaleString()}` : ''
  const dateStr = new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })

  const print = () => {
    const w = window.open('', '_blank', 'width=1160,height=840')
    if (!w) { window.fcToast?.('Please allow pop-ups to download your certificate.'); return }
    w.document.write(certificateHtml(name, placeLabel, amt, dateStr))
    w.document.close()
  }

  return createPortal(
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.8)', display: 'grid', placeItems: 'center', padding: 18, zIndex: 10000 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ maxWidth: 640, width: '100%' }}>
        {/* On-screen preview */}
        <div style={{ position: 'relative', color: '#f4efe4', background: 'radial-gradient(circle at 50% 0%, #241f10, #0d0d0d 70%)', borderRadius: 12, padding: 'clamp(24px,5vw,44px)', textAlign: 'center', border: '2px solid #c9a84c' }}>
          <div style={{ letterSpacing: '.3em', textTransform: 'uppercase', fontSize: 11, color: '#c9a84c' }}>{PROGRAM}</div>
          <div style={{ fontFamily: 'var(--f-serif)', fontSize: 'clamp(22px,5vw,34px)', color: '#e6cd7f', margin: '8px 0 2px' }}>Certificate of Achievement</div>
          <div style={{ fontSize: 13, color: 'var(--muted)', fontStyle: 'italic', marginBottom: 18 }}>“{TAGLINE}”</div>
          <div style={{ fontSize: 11, letterSpacing: '.1em', textTransform: 'uppercase', color: 'var(--muted)' }}>Proudly presented to</div>
          <div style={{ fontFamily: 'var(--f-serif)', fontSize: 'clamp(22px,5vw,32px)', color: '#fff', margin: '6px 0', borderBottom: '2px solid rgba(201,168,76,0.5)', display: 'inline-block', padding: '0 18px 6px' }}>{name}</div>
          <div style={{ fontSize: 'clamp(18px,4vw,22px)', color: '#e6cd7f', marginTop: 16 }}>🏆 {placeLabel}</div>
          {amt && <div style={{ fontSize: 15, color: '#8fd6a3', marginTop: 4 }}>Scholarship Award: {amt}</div>}
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 16, flexWrap: 'wrap' }}>
          <button className="btn btn--sm" onClick={onClose}>Close</button>
          <button className="btn btn--sm btn--solid" onClick={print}>Download / Print certificate</button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
