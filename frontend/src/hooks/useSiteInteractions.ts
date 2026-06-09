import { useEffect } from 'react'

interface Handlers {
  onAuth: (which: 'login' | 'register') => void
  onRequest: (label: string) => void
  onSubscribe: (email: string) => void
}

/**
 * Ports the DOM-level interactions from the original app.js:
 * gold particle constellation, sticky nav + active link, scroll reveal,
 * scroll progress, editorial section indices, count-up stats, mobile menu,
 * media lightbox, and the giveaway countdown.
 *
 * Form / modal behaviour (auth, request, subscribe, toast) is delegated
 * back to React through the provided handlers so it can hit the API.
 */
export function useSiteInteractions({ onAuth, onRequest, onSubscribe }: Handlers) {
  useEffect(() => {
    const cleanups: Array<() => void> = []
    let raf = 0

    /* ---------- Gold particle constellation ---------- */
    const canvas = document.getElementById('particles') as HTMLCanvasElement | null
    if (canvas) {
      const ctx = canvas.getContext('2d')!
      let w = 0, h = 0, dpr = 1
      let particles: Array<{ x: number; y: number; vx: number; vy: number; r: number; tw: number; tws: number }> = []
      const GOLD = [240, 192, 96]
      const mouse = { x: -9999, y: -9999 }

      const buildParticles = () => {
        const count = Math.min(120, Math.round((w * h) / 12000))
        particles = []
        for (let i = 0; i < count; i++) {
          particles.push({
            x: Math.random() * w, y: Math.random() * h,
            vx: (Math.random() - 0.5) * 0.22, vy: (Math.random() - 0.5) * 0.22,
            r: Math.random() * 1.7 + 0.5,
            tw: Math.random() * Math.PI * 2, tws: Math.random() * 0.03 + 0.008,
          })
        }
      }
      const resize = () => {
        dpr = Math.min(window.devicePixelRatio || 1, 2)
        w = canvas.clientWidth; h = canvas.clientHeight
        canvas.width = w * dpr; canvas.height = h * dpr
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
        buildParticles()
      }
      const step = () => {
        ctx.clearRect(0, 0, w, h)
        for (const p of particles) {
          p.x += p.vx; p.y += p.vy; p.tw += p.tws
          if (p.x < 0) p.x = w; if (p.x > w) p.x = 0
          if (p.y < 0) p.y = h; if (p.y > h) p.y = 0
          const dxm = p.x - mouse.x, dym = p.y - mouse.y
          const dm2 = dxm * dxm + dym * dym
          if (dm2 < 14000) {
            const f = ((14000 - dm2) / 14000) * 0.6
            p.x += (dxm / Math.sqrt(dm2 + 1)) * f
            p.y += (dym / Math.sqrt(dm2 + 1)) * f
          }
        }
        for (let i = 0; i < particles.length; i++) {
          const a = particles[i]
          for (let j = i + 1; j < particles.length; j++) {
            const b = particles[j]
            const dx = a.x - b.x, dy = a.y - b.y
            const d2 = dx * dx + dy * dy
            if (d2 < 16000) {
              const op = (1 - d2 / 16000) * 0.22
              ctx.strokeStyle = `rgba(${GOLD[0]},${GOLD[1]},${GOLD[2]},${op})`
              ctx.lineWidth = 0.6
              ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke()
            }
          }
        }
        for (const p of particles) {
          const tw = 0.55 + Math.sin(p.tw) * 0.45
          const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r * 4)
          g.addColorStop(0, `rgba(${GOLD[0]},${GOLD[1]},${GOLD[2]},${0.95 * tw})`)
          g.addColorStop(1, 'rgba(240,192,96,0)')
          ctx.fillStyle = g
          ctx.beginPath(); ctx.arc(p.x, p.y, p.r * 4, 0, Math.PI * 2); ctx.fill()
          ctx.fillStyle = `rgba(255,238,200,${tw})`
          ctx.beginPath(); ctx.arc(p.x, p.y, p.r * 0.7, 0, Math.PI * 2); ctx.fill()
        }
        raf = requestAnimationFrame(step)
      }
      const onMove = (e: PointerEvent) => {
        const r = canvas.getBoundingClientRect()
        mouse.x = e.clientX - r.left; mouse.y = e.clientY - r.top
      }
      const onLeave = () => { mouse.x = -9999; mouse.y = -9999 }
      window.addEventListener('resize', resize)
      canvas.addEventListener('pointermove', onMove)
      canvas.addEventListener('pointerleave', onLeave)
      resize()
      if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) step()
      cleanups.push(() => {
        window.removeEventListener('resize', resize)
        canvas.removeEventListener('pointermove', onMove)
        canvas.removeEventListener('pointerleave', onLeave)
      })
    }

    /* ---------- Sticky nav + active link ---------- */
    const nav = document.querySelector('.nav')
    const links = [...document.querySelectorAll<HTMLAnchorElement>('.nav__links a')]
    const indicator = document.querySelector<HTMLElement>('.nav__indicator')
    const sections = links
      .map((a) => {
        const href = a.getAttribute('href') || ''
        // Only in-page hash links map to sections; router links (/about) are skipped.
        return href.startsWith('#') ? document.querySelector(href) : null
      })
      .filter(Boolean) as HTMLElement[]
    const updateIndicator = (link: HTMLAnchorElement | undefined) => {
      if (!indicator || !link) return
      const navBox = link.parentElement?.getBoundingClientRect()
      const linkBox = link.getBoundingClientRect()
      if (!navBox) return
      indicator.style.width = `${linkBox.width}px`
      indicator.style.transform = `translateX(${linkBox.left - navBox.left}px)`
      indicator.style.opacity = '1'
    }
    const onScroll = () => {
      if (!nav) return
      nav.classList.toggle('scrolled', window.scrollY > 40)
      // Use viewport-relative position (getBoundingClientRect), not offsetTop,
      // because some targets (e.g. #community) are nested inside another section
      // and their offsetTop is relative to the wrong parent. Pick the section
      // whose top is closest above the threshold line — order/nesting-proof.
      const threshold = window.innerHeight * 0.32
      let current = sections[0]
      let bestTop = -Infinity
      for (const s of sections) {
        const top = s.getBoundingClientRect().top
        if (top <= threshold && top > bestTop) { bestTop = top; current = s }
      }
      let activeLink: HTMLAnchorElement | undefined
      links.forEach((a) => {
        const isActive = !!current && a.getAttribute('href') === '#' + current.id
        a.classList.toggle('active', isActive)
        if (isActive) activeLink = a
      })
      updateIndicator(activeLink)
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    onScroll()
    // Re-position once fonts/layout settle (web-font load shifts link widths).
    const settle1 = window.setTimeout(onScroll, 300)
    const settle2 = window.setTimeout(onScroll, 900)
    if (document.fonts?.ready) document.fonts.ready.then(onScroll).catch(() => {})
    cleanups.push(() => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
      clearTimeout(settle1)
      clearTimeout(settle2)
    })

    /* ---------- Scroll reveal ---------- */
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => {
        if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target) }
      }),
      { threshold: 0.12, rootMargin: '0px 0px -8% 0px' },
    )
    document.querySelectorAll('.reveal').forEach((el) => io.observe(el))
    // Content fetched after mount (blog posts, events, awards) adds `.reveal`
    // nodes the initial scan never saw — observe them as they appear so they
    // don't stay stuck at opacity:0.
    const mo = new MutationObserver((muts) => {
      for (const mut of muts) {
        mut.addedNodes.forEach((n) => {
          if (!(n instanceof HTMLElement)) return
          if (n.classList.contains('reveal')) io.observe(n)
          n.querySelectorAll?.('.reveal').forEach((el) => io.observe(el))
        })
      }
    })
    mo.observe(document.body, { childList: true, subtree: true })
    cleanups.push(() => { io.disconnect(); mo.disconnect() })

    /* ---------- Scroll progress ---------- */
    const progress = document.getElementById('scrollProgress')
    const updateProgress = () => {
      if (!progress) return
      const ht = document.documentElement.scrollHeight - window.innerHeight
      progress.style.width = (ht > 0 ? (window.scrollY / ht) * 100 : 0) + '%'
    }
    window.addEventListener('scroll', updateProgress, { passive: true })
    updateProgress()
    cleanups.push(() => window.removeEventListener('scroll', updateProgress))

    /* ---------- Editorial section indices ---------- */
    let idx = 0
    document.querySelectorAll('section.block .block__head').forEach((head) => {
      if (head.querySelector('.sec-index')) return
      idx++
      const tag = document.createElement('div')
      tag.className = 'sec-index reveal'
      tag.textContent = String(idx).padStart(2, '0')
      head.insertBefore(tag, head.firstChild)
      io.observe(tag)
    })

    /* ---------- Count-up stats ---------- */
    const countIO = new IntersectionObserver(
      (entries) => entries.forEach((e) => {
        if (!e.isIntersecting) return
        const el = e.target as HTMLElement
        countIO.unobserve(el)
        const target = parseFloat(el.getAttribute('data-count') || '0')
        const suffix = el.getAttribute('data-suffix') || ''
        const dur = 1400
        const start = performance.now()
        const easeOut = (t: number) => 1 - Math.pow(1 - t, 3)
        const frame = (now: number) => {
          const p = Math.min(1, (now - start) / dur)
          el.textContent = Math.round(target * easeOut(p)) + suffix
          if (p < 1) requestAnimationFrame(frame)
          else el.textContent = target + suffix
        }
        requestAnimationFrame(frame)
      }),
      { threshold: 0.5 },
    )
    document.querySelectorAll('[data-count]').forEach((el) => countIO.observe(el))
    cleanups.push(() => countIO.disconnect())

    /* ---------- Mobile menu ---------- */
    const menuToggle = document.querySelector('.menu-toggle')
    const mobileMenu = document.querySelector('.mobile-menu')
    if (menuToggle && mobileMenu) {
      const open = () => mobileMenu.classList.add('open')
      const close = () => mobileMenu.classList.remove('open')
      menuToggle.addEventListener('click', open)
      mobileMenu.querySelector('.close-m')?.addEventListener('click', close)
      mobileMenu.querySelectorAll('a').forEach((a) => a.addEventListener('click', close))
      cleanups.push(() => menuToggle.removeEventListener('click', open))
    }

    /* ---------- Toast ---------- */
    const toast = document.getElementById('toast')
    const toastMsg = document.getElementById('toast-msg')
    let toastTimer: number | undefined
    const showToast = (msg: string) => {
      if (!toast || !toastMsg) return
      toastMsg.textContent = msg
      toast.classList.add('show')
      clearTimeout(toastTimer)
      toastTimer = window.setTimeout(() => toast.classList.remove('show'), 3400)
    }
    ;(window as unknown as { fcToast: (m: string) => void }).fcToast = showToast

    /* ---------- Wire data-* buttons back to React ---------- */
    const authBtns = [...document.querySelectorAll<HTMLElement>('[data-auth]')]
    const authHandlers = authBtns.map((b) => {
      const fn = (e: Event) => { e.preventDefault(); onAuth(b.getAttribute('data-auth') as 'login' | 'register') }
      b.addEventListener('click', fn)
      return [b, fn] as const
    })
    const reqBtns = [...document.querySelectorAll<HTMLElement>('[data-request]')]
    const reqHandlers = reqBtns.map((b) => {
      const fn = (e: Event) => { e.preventDefault(); onRequest(b.getAttribute('data-request') || 'Request') }
      b.addEventListener('click', fn)
      return [b, fn] as const
    })
    const toastBtns = [...document.querySelectorAll<HTMLElement>('[data-toast]')]
    const toastHandlers = toastBtns.map((b) => {
      const fn = (e: Event) => { e.preventDefault(); showToast(b.getAttribute('data-toast') || '') }
      b.addEventListener('click', fn)
      return [b, fn] as const
    })
    cleanups.push(() => {
      authHandlers.forEach(([b, fn]) => b.removeEventListener('click', fn))
      reqHandlers.forEach(([b, fn]) => b.removeEventListener('click', fn))
      toastHandlers.forEach(([b, fn]) => b.removeEventListener('click', fn))
    })

    /* ---------- Subscribe form ---------- */
    const subForm = document.getElementById('subscribe-form') as HTMLFormElement | null
    if (subForm) {
      const fn = (e: Event) => {
        e.preventDefault()
        const input = subForm.querySelector('input[type="email"]') as HTMLInputElement | null
        if (input?.value) { onSubscribe(input.value); subForm.reset() }
      }
      subForm.addEventListener('submit', fn)
      cleanups.push(() => subForm.removeEventListener('submit', fn))
    }

    /* ---------- Media gallery lightbox ---------- */
    const lightbox = document.getElementById('lightbox')
    if (lightbox) {
      const lbCap = document.getElementById('lightbox-cap')
      const openLb = (cap: string) => { if (lbCap) lbCap.textContent = cap; lightbox.classList.add('open'); document.body.style.overflow = 'hidden' }
      const closeLb = () => { lightbox.classList.remove('open'); document.body.style.overflow = '' }
      const cells = [...document.querySelectorAll<HTMLElement>('.gallery .cell')]
      const cellHandlers = cells.map((c) => {
        const fn = () => openLb(c.getAttribute('data-cap') || '')
        c.addEventListener('click', fn)
        return [c, fn] as const
      })
      lightbox.querySelectorAll('[data-close-lightbox]').forEach((b) => b.addEventListener('click', closeLb))
      const onLbClick = (e: Event) => { if (e.target === lightbox) closeLb() }
      lightbox.addEventListener('click', onLbClick)
      cleanups.push(() => {
        cellHandlers.forEach(([c, fn]) => c.removeEventListener('click', fn))
        lightbox.removeEventListener('click', onLbClick)
      })
    }

    /* ---------- Giveaway countdown ---------- */
    const cdTimers: number[] = []
    document.querySelectorAll<HTMLElement>('[data-deadline]').forEach((box) => {
      const target = new Date(box.getAttribute('data-deadline') || '').getTime()
      const map = {
        d: box.querySelector('[data-cd="d"]'),
        h: box.querySelector('[data-cd="h"]'),
        m: box.querySelector('[data-cd="m"]'),
        s: box.querySelector('[data-cd="s"]'),
      }
      const pad = (n: number) => String(n).padStart(2, '0')
      const tick = () => {
        let diff = Math.max(0, target - Date.now())
        const d = Math.floor(diff / 86400000); diff -= d * 86400000
        const h = Math.floor(diff / 3600000); diff -= h * 3600000
        const m = Math.floor(diff / 60000); diff -= m * 60000
        const s = Math.floor(diff / 1000)
        if (map.d) map.d.textContent = String(d)
        if (map.h) map.h.textContent = pad(h)
        if (map.m) map.m.textContent = pad(m)
        if (map.s) map.s.textContent = pad(s)
      }
      tick()
      cdTimers.push(window.setInterval(tick, 1000))
    })
    cleanups.push(() => cdTimers.forEach(clearInterval))

    return () => {
      cancelAnimationFrame(raf)
      cleanups.forEach((fn) => fn())
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
}
