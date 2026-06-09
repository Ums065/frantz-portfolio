/* Tiny fetch wrapper around the PHP API.
   Base is root-absolute (/api) so requests resolve to /api/... from any
   client-side route rather than relative to the current page. Override via
   VITE_API_BASE for a subfolder deployment (e.g. /frantz-portfolio/api). */

const BASE = (import.meta.env.VITE_API_BASE ?? '/api').replace(/\/+$/, '')
let csrfToken = ''
let csrfBootstrap: Promise<void> | null = null

export interface ApiError {
  error: string
}

interface ApiEnvelope {
  csrfToken?: string
}

function parseResponseBody(raw: string): unknown {
  const trimmed = raw.trim()
  if (!trimmed) return {}
  try {
    return JSON.parse(trimmed)
  } catch {
    return trimmed
  }
}

function extractErrorMessage(data: unknown, fallback: string): string {
  if (typeof data === 'string' && data.trim()) {
    return data.slice(0, 500)
  }
  if (data && typeof data === 'object' && 'error' in data && typeof (data as ApiError).error === 'string') {
    return (data as ApiError).error
  }
  return fallback
}

function summarizeBody(data: unknown): unknown {
  if (typeof data === 'string') {
    return data.slice(0, 1000)
  }
  return data
}

function storeCsrfToken(data: unknown) {
  if (data && typeof data === 'object' && 'csrfToken' in data && typeof (data as ApiEnvelope).csrfToken === 'string') {
    csrfToken = (data as ApiEnvelope).csrfToken || ''
  }
}

async function bootstrapCsrfToken(): Promise<void> {
  if (!csrfBootstrap) {
    csrfBootstrap = (async () => {
      const res = await fetch(`${BASE}/auth/me`, {
        credentials: 'include',
      })
      const data = await res.json().catch(() => ({}))
      storeCsrfToken(data)
    })().finally(() => {
      csrfBootstrap = null
    })
  }
  return csrfBootstrap
}

async function request<T>(path: string, options: RequestInit = {}, retry = true): Promise<T> {
  const method = (options.method ?? 'GET').toString().toUpperCase()
  const res = await fetch(`${BASE}/${path}`, {
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(csrfToken ? { 'X-CSRF-Token': csrfToken } : {}),
      ...(options.headers || {}),
    },
    ...options,
  })
  const raw = await res.text()
  const data = parseResponseBody(raw)
  storeCsrfToken(data)
  if (res.status === 419 && retry && path !== 'auth/me') {
    await bootstrapCsrfToken()
    return request<T>(path, options, false)
  }
  if (!res.ok) {
    console.error('[api] request failed', {
      method,
      path,
      status: res.status,
      body: summarizeBody(data),
    })
    throw new Error(extractErrorMessage(data, `Request failed (${res.status})`))
  }
  return data as T
}

async function upload<T>(path: string, file: File, retry = true): Promise<T> {
  const fd = new FormData()
  fd.append('file', file)
  // No Content-Type header — the browser sets the multipart boundary.
  const res = await fetch(`${BASE}/${path}`, {
    method: 'POST',
    credentials: 'include',
    headers: csrfToken ? { 'X-CSRF-Token': csrfToken } : undefined,
    body: fd,
  })
  const raw = await res.text()
  const data = parseResponseBody(raw)
  storeCsrfToken(data)
  if (res.status === 419 && retry) {
    await bootstrapCsrfToken()
    return upload<T>(path, file, false)
  }
  if (!res.ok) {
    console.error('[api] upload failed', {
      method: 'POST',
      path,
      status: res.status,
      body: summarizeBody(data),
    })
    throw new Error(extractErrorMessage(data, `Upload failed (${res.status})`))
  }
  return data as T
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'POST', body: JSON.stringify(body) }),
  put: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'PUT', body: JSON.stringify(body) }),
  del: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
  upload,
}

/* ---- Domain types ---- */
export interface User {
  id: number
  full_name: string
  email: string
  role: string
  created_at: string
}

export interface EventItem {
  id: number
  title: string
  location: string
  role: string
  event_date: string
  is_past: number
  rsvp_count?: number
}

export interface EventRsvpRow {
  id: number
  event_id: number
  event_title?: string
  location?: string | null
  event_date?: string
  confirmation_code: string
  status: string
  notes: string | null
  full_name: string
  email: string
  created_at: string
}

export interface Post {
  id: number
  title: string
  category: string
  excerpt: string
  cover_image: string | null
  is_featured: number
  published_at: string
}

export interface PostDetail extends Post {
  body: string
}

export interface AwardRow {
  id: number
  title: string
  year: string | null
  level: string | null
  presenter: string | null
  short_text: string | null
  description: string | null
  image: string | null
  is_featured: number
  sort_order: number
}

export interface MediaRow {
  id: number
  title: string
  type: string
  summary: string | null
  body: string | null
  image: string | null
  link_url: string | null
  published_at: string | null
  is_featured: number
  sort_order: number
}

export interface TestimonialRow {
  id: number
  quote: string
  author_name: string
  author_title: string | null
  company: string | null
  image: string | null
  is_featured: number
  sort_order: number
  created_at: string
}

export interface AnalyticsSeriesRow {
  label: string
  value: number
}

export interface AnalyticsPayload {
  totals: {
    users: number
    members: number
    vip: number
    admin: number
    requests: number
    orders: number
    revenue: number
    subscribers: number
    contacts: number
    events: number
    posts: number
    awards: number
    testimonials: number
    media: number
    community_threads?: number
    community_comments?: number
    event_rsvps?: number
    inventory_items?: number
    low_stock?: number
  }
  request_types: AnalyticsSeriesRow[]
  request_statuses: AnalyticsSeriesRow[]
  order_statuses: AnalyticsSeriesRow[]
  content_mix: AnalyticsSeriesRow[]
  top_pages?: AnalyticsSeriesRow[]
}

export interface UserRequestRow {
  id: number
  request_type: string
  organization: string | null
  message: string | null
  status: string
  created_at: string
}

export interface UserOrderRow {
  id: number
  order_no: string
  customer_name: string
  email: string
  items: string
  total: string
  payment_method: string
  status: string
  created_at: string
}

export interface CommunityThreadRow {
  id: number
  title: string
  body: string
  audience: 'public' | 'member' | 'vip'
  author_name: string
  is_pinned: number
  created_at: string
  comment_count?: number
  latest_comment_at?: string | null
}

export interface CommunityCommentRow {
  id: number
  thread_id: number
  author_name: string
  body: string
  author_role?: string | null
  created_at: string
}

export interface InventoryRow {
  product_id: string
  name: string
  price: number
  stock: number
  low_stock_threshold: number
  status: 'in' | 'low' | 'out'
  restock_note: string | null
  updated_at: string | null
}

export interface AuthPayload {
  user: User | null
  csrfToken?: string
}
