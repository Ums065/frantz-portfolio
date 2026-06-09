import { useState } from 'react'
import { api } from '../lib/api'

/* Public contact form — posts to the existing `POST /contact` endpoint,
   which stores into `contact_messages` (visible in the Admin → Contacts tab). */
export default function ContactSection() {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    try {
      const d = await api.post<{ message: string }>('contact', { full_name: name, email, message })
      setDone(true)
      window.fcToast?.(d.message)
      setName(''); setEmail(''); setMessage('')
    } catch (err) {
      window.fcToast?.(err instanceof Error ? err.message : 'Something went wrong.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="block" id="contact" data-screen-label="Contact">
      <div className="wrap">
        <div className="block__head reveal">
          <div className="section-title"><span className="ln l" /><h2 className="gold-text">Get In Touch</h2><span className="ln r" /></div>
          <p className="sub">Have a question, opportunity, or idea? Send a message.</p>
        </div>

        <div className="contact-grid">
          <div className="glass contact-info reveal d1">
            <h3 className="gold-text">Let’s Connect</h3>
            <p>Whether it’s a partnership, a speaking opportunity, press, or a community initiative — the team reviews every message and will follow up.</p>
            <ul className="contact-points">
              <li><span className="ci"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6}><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 7l9 6 9-6" /></svg></span>For press &amp; media, mention your outlet and timeline.</li>
              <li><span className="ci"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6}><path d="M12 21s-7-4.5-7-10a7 7 0 0114 0c0 5.5-7 10-7 10z" /><circle cx="12" cy="11" r="2.6" /></svg></span>New York &amp; Long Island · serving communities nationwide.</li>
              <li><span className="ci"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg></span>Typical response within a few business days.</li>
            </ul>
          </div>

          <form className="glass contact-form reveal d2" onSubmit={submit}>
            {done ? (
              <div className="contact-done">
                <div className="ok-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}><circle cx="12" cy="12" r="10" /><path d="M8 12.5l2.5 2.5L16 9" /></svg></div>
                <h3 className="gold-text">Message Sent</h3>
                <p>Thank you for reaching out — the team will be in touch shortly.</p>
                <button type="button" className="btn btn--solid" onClick={() => setDone(false)}>Send Another</button>
              </div>
            ) : (
              <>
                <div className="field"><label>Full Name</label>
                  <input type="text" required placeholder="Your name" value={name} onChange={(e) => setName(e.target.value)} /></div>
                <div className="field"><label>Email</label>
                  <input type="email" required placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
                <div className="field"><label>Message</label>
                  <textarea className="fld-area" required placeholder="How can we help?" value={message} onChange={(e) => setMessage(e.target.value)} /></div>
                <button type="submit" className="btn btn--solid" disabled={busy}>{busy ? 'Sending…' : 'Send Message'}</button>
              </>
            )}
          </form>
        </div>
      </div>
    </section>
  )
}
