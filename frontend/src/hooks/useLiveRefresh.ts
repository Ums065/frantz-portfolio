import { useEffect, useRef } from 'react'

/**
 * Keeps dashboard data (and the counters derived from it) fresh without a manual
 * page refresh:
 *   • refetches the moment the tab regains focus / becomes visible again, and
 *   • polls on a gentle interval while the tab is open.
 *
 * Pass any `reload` callback — its identity may change between renders; the hook
 * always calls the latest one via a ref, so it never tears down the listeners
 * or restarts the interval just because `reload` was recreated.
 */
export function useLiveRefresh(reload: () => void | Promise<void>, opts?: { intervalMs?: number; enabled?: boolean }) {
  const intervalMs = opts?.intervalMs ?? 45000
  const enabled = opts?.enabled ?? true
  const reloadRef = useRef(reload)
  reloadRef.current = reload

  useEffect(() => {
    if (!enabled) return
    const fire = () => { void reloadRef.current() }
    const onVisible = () => { if (document.visibilityState === 'visible') fire() }
    window.addEventListener('focus', fire)
    document.addEventListener('visibilitychange', onVisible)
    const id = window.setInterval(() => { if (document.visibilityState === 'visible') fire() }, intervalMs)
    return () => {
      window.removeEventListener('focus', fire)
      document.removeEventListener('visibilitychange', onVisible)
      window.clearInterval(id)
    }
  }, [enabled, intervalMs])
}
