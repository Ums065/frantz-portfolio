import { useState, type InputHTMLAttributes } from 'react'

/**
 * A password <input> with a show/hide (eye) toggle. Drop-in replacement for
 * <input type="password" …> — it forwards every prop (value/onChange, required,
 * minLength, placeholder, autoComplete, name, style, className, data-*), so it
 * works for both controlled and uncontrolled forms and keeps existing styling.
 */
export default function PasswordInput({ style, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  const [show, setShow] = useState(false)
  return (
    <span style={{ position: 'relative', display: 'block', width: '100%' }}>
      <input
        {...rest}
        type={show ? 'text' : 'password'}
        style={{ width: '100%', boxSizing: 'border-box', ...style, paddingRight: 44 }}
      />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        aria-label={show ? 'Hide password' : 'Show password'}
        title={show ? 'Hide password' : 'Show password'}
        tabIndex={-1}
        style={{
          position: 'absolute', top: '50%', right: 10, transform: 'translateY(-50%)',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          width: 26, height: 26, padding: 0, border: 0, background: 'none',
          color: 'var(--muted, #a9a396)', cursor: 'pointer', lineHeight: 0,
        }}
      >
        {show ? (
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth={2}><path d="M3 3l18 18M10.6 10.6a2 2 0 002.8 2.8M9.9 4.2A9.6 9.6 0 0112 4c5 0 9 4.5 9 8a11 11 0 01-2.2 3.4M6.1 6.1A11 11 0 003 12c0 3.5 4 8 9 8 1.2 0 2.3-.2 3.3-.6" /></svg>
        ) : (
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth={2}><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8S1 12 1 12z" /><circle cx="12" cy="12" r="3" /></svg>
        )}
      </button>
    </span>
  )
}
