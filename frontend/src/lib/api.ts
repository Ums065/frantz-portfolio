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

async function postForm<T>(path: string, form: FormData, retry = true): Promise<T> {
  const res = await fetch(`${BASE}/${path}`, {
    method: 'POST',
    credentials: 'include',
    headers: csrfToken ? { 'X-CSRF-Token': csrfToken } : undefined,
    body: form,
  })
  const raw = await res.text()
  const data = parseResponseBody(raw)
  storeCsrfToken(data)
  if (res.status === 419 && retry) {
    await bootstrapCsrfToken()
    return postForm<T>(path, form, false)
  }
  if (!res.ok) {
    console.error('[api] form post failed', {
      method: 'POST',
      path,
      status: res.status,
      body: summarizeBody(data),
    })
    throw new Error(extractErrorMessage(data, `Upload failed (${res.status})`))
  }
  return data as T
}

async function upload<T>(path: string, file: File, retry = true): Promise<T> {
  const fd = new FormData()
  fd.append('file', file)
  return postForm<T>(path, fd, retry)
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'POST', body: JSON.stringify(body) }),
  postForm,
  put: <T>(path: string, body: unknown) =>
    request<T>(path, { method: 'PUT', body: JSON.stringify(body) }),
  del: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
  upload,
}

/* Records one page view for the admin Analytics traffic panel. First-party only:
   a random visitor id is kept in localStorage so we can count unique visitors (reach)
   without cookies or any third-party analytics service. Fire-and-forget — never throws. */
export function trackVisit(path: string): void {
  try {
    let token = localStorage.getItem('fc_visitor')
    if (!token) {
      token = (typeof crypto !== 'undefined' && crypto.randomUUID)
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(16).slice(2)}`
      localStorage.setItem('fc_visitor', token)
    }
    void api.post('analytics/track', { path, visitor_token: token, referrer: document.referrer || '' }).catch(() => {})
  } catch {
    /* tracking is best-effort; ignore storage/network errors */
  }
}

/* ---- Domain types ---- */
export interface User {
  id: number
  full_name: string
  email: string
  role: string
  avatar_url?: string | null
  email_verified_at?: string | null
  approval_status?: string | null
  approval_note?: string | null
  approval_reviewed_by_user_id?: number | null
  approval_reviewed_at?: string | null
  created_at: string
  updated_at?: string | null
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

export interface PartnerRow {
  id: number
  name: string
  logo_url: string | null
  partner_type: string | null
  industry: string | null
  borough: string | null
  county: string | null
  location: string | null
  partner_since: string | null
  website: string | null
  blurb: string | null
  is_featured: number
  is_media_partner: number
  status?: string
  sort_order: number
}
export interface PartnerStat { label: string; value: string }
export interface PartnerPage {
  hero: { title: string; subtitle: string; tagline: string; image?: string }
  stats: PartnerStat[]
  cta: { title: string; text: string; button_label: string; button_link: string }
}
export interface PartnersPayload {
  page: PartnerPage
  partners: PartnerRow[]
  types: string[]
  industries: string[]
  boroughs: string[]
  counties: string[]
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


export interface PublicGalleryItemRow {
  id: number
  submission_id: number
  display_title: string
  original_name: string
  file_url: string
  mime_type: string
  media_kind: 'image' | 'video'
  size_bytes: number
  credit_name: string
  credit_organization: string | null
  submitted_at: string | null
  approved_at: string | null
}

export interface GallerySubmissionFileRow {
  id: number
  submission_id: number
  original_name: string
  display_title: string
  file_url: string
  mime_type: string
  media_kind: 'image' | 'video'
  size_bytes: number
  approval_status: 'pending_review' | 'approved' | 'rejected'
  reviewed_by_user_id: number | null
  reviewed_by_name: string | null
  reviewed_at: string | null
  approved_at: string | null
  rejected_at: string | null
  created_at: string | null
  updated_at: string | null
}

export interface GallerySubmissionRow {
  id: number
  user_id: number | null
  submitter_name: string
  submitter_email: string
  organization: string | null
  message: string | null
  overall_status: 'pending_review' | 'partially_approved' | 'approved' | 'rejected'
  created_at: string | null
  updated_at: string | null
  files: GallerySubmissionFileRow[]
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
    pending_accounts?: number
    approved_accounts?: number
    rejected_accounts?: number
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
  traffic?: {
    total: number
    today: number
    last_7: number
    last_30: number
    unique_total: number
    unique_today: number
    unique_30: number
    repeated_visitors?: number
    new_visitors?: number
    daily: Array<{ label: string; value: number; unique: number }>
    top_pages: AnalyticsSeriesRow[]
    top_referrers?: AnalyticsSeriesRow[]
  }
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
  payment_provider?: string | null
  payment_status?: 'pending' | 'paid' | 'failed' | 'refunded'
  payment_session_id?: string | null
  payment_intent_id?: string | null
  payment_confirmed_at?: string | null
  payment_url?: string | null
  payment_error?: string | null
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

export type ProductVisibility = 'live' | 'upcoming' | 'hidden'

export interface InventoryRow {
  product_id: string
  name: string
  category: string | null
  tagline: string | null
  description: string | null
  details: string | null
  feature_list: string | null
  spec_list: string | null
  shipping_note: string | null
  image: string | null
  price: number
  stock: number
  low_stock_threshold: number
  visibility: ProductVisibility
  stock_status: 'in' | 'low' | 'out'
  status: 'in' | 'low' | 'out'
  restock_note: string | null
  sort_order: number
  updated_at: string | null
}

export interface SponsorLevelRow {
  id: number
  slug: string
  name: string
  minimum_amount: number
  sort_order: number
}

export interface SponsorProgramRow {
  id: number
  slug: string
  name: string
  edition_name: string | null
  headline: string
  subheadline: string
  registration_opens: string | null
  winners_announced: string | null
  school_impact_grant_amount: number
  student_scholarship_amount: number
  educator_award_label: string
  age_range: string
  grade_range: string
  is_active: number
  levels: SponsorLevelRow[]
  published_sponsor_count?: number
}

export interface PublicSponsorRow {
  id: number
  organization_name: string
  website: string | null
  logo_url: string | null
  sponsorship_level_slug: string
  sponsorship_level_name: string
  sponsorship_amount: number
  short_description: string
  badge: string
  created_at: string | null
}

export interface PublicSponsorTier {
  slug: string
  name: string
  minimum_amount: number
  sort_order: number
  sponsors: PublicSponsorRow[]
}

export interface SponsorApplicationRow {
  id: number
  program_id: number
  program_name: string | null
  program_edition_name: string | null
  organization_name: string
  contact_person: string
  title_position: string | null
  email_address: string
  phone_number: string
  website: string | null
  street_address: string
  city: string
  state: string
  zip_code: string
  organization_type: string
  logo_url: string | null
  company_bio: string
  support_reason: string
  sponsorship_level_slug: string
  sponsorship_level_name: string
  sponsorship_amount: number
  custom_amount: number
  interests: string[]
  public_description: string | null
  admin_notes: string | null
  payment_status: 'pending_check' | 'check_received' | 'payment_confirmed'
  approval_status: 'pending_review' | 'approved' | 'rejected' | 'published'
  reviewed_by_user_id: number | null
  reviewed_by_name: string | null
  reviewed_at: string | null
  approved_at: string | null
  rejected_at: string | null
  check_received_at: string | null
  payment_confirmed_at: string | null
  published_at: string | null
  created_at: string | null
  updated_at: string | null
  level_minimum_amount: number | null
  level_sort_order: number | null
}

export interface Impersonator {
  id: number
  full_name: string
  email: string
  role: string
}

export interface AuthPayload {
  user: User | null
  csrfToken?: string
  message?: string
  verification_required?: boolean
  verification_email?: string
  verification_email_sent?: boolean
  impersonating?: boolean
  impersonator?: Impersonator | null
}
