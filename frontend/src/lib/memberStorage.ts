export type SavedKind = 'event' | 'article'

export interface SavedContentItem {
  id: string
  title: string
  href: string
  meta: string
  savedAt: string
}

export interface MemberNotification {
  id: string
  title: string
  body: string
  tone: 'gold' | 'green' | 'blue' | 'muted'
  href?: string
  createdAt: string
}

const SAVED_KEYS: Record<SavedKind, string> = {
  event: 'fc_saved_events',
  article: 'fc_saved_articles',
}

const NOTIFICATION_KEY = 'fc_member_notifications'

export const DEFAULT_MEMBER_NOTIFICATIONS: MemberNotification[] = [
  {
    id: 'welcome',
    title: 'Welcome to the member area',
    body: 'Save events and articles, then revisit them from your dashboard any time.',
    tone: 'gold',
    href: '/dashboard',
    createdAt: 'Today',
  },
  {
    id: 'community',
    title: 'VIP community access is live',
    body: 'Registered members can claim early invites, founder updates, and private resources.',
    tone: 'green',
    href: '/community',
    createdAt: 'This week',
  },
  {
    id: 'merch',
    title: 'Merch discount reminder',
    body: 'Use the member discount code from your dashboard when you shop the collection.',
    tone: 'blue',
    href: '/store',
    createdAt: 'This week',
  },
]

function canUseStorage(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined'
}

function readList<T>(key: string, fallback: T[]): T[] {
  if (!canUseStorage()) return fallback
  try {
    const raw = window.localStorage.getItem(key)
    if (!raw) return fallback
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : fallback
  } catch {
    return fallback
  }
}

function writeList<T>(key: string, value: T[]): void {
  if (!canUseStorage()) return
  window.localStorage.setItem(key, JSON.stringify(value))
}

export function loadSavedItems(kind: SavedKind): SavedContentItem[] {
  return readList<SavedContentItem>(SAVED_KEYS[kind], [])
}

export function isSavedItem(kind: SavedKind, id: string): boolean {
  return loadSavedItems(kind).some((item) => item.id === id)
}

export function toggleSavedItem(kind: SavedKind, item: Omit<SavedContentItem, 'savedAt'>): SavedContentItem[] {
  const current = loadSavedItems(kind)
  const exists = current.some((saved) => saved.id === item.id)
  const next = exists
    ? current.filter((saved) => saved.id !== item.id)
    : [{ ...item, savedAt: new Date().toISOString() }, ...current]
  writeList(SAVED_KEYS[kind], next)
  return next
}

export function removeSavedItem(kind: SavedKind, id: string): SavedContentItem[] {
  const next = loadSavedItems(kind).filter((item) => item.id !== id)
  writeList(SAVED_KEYS[kind], next)
  return next
}

export function clearSavedItems(kind: SavedKind): void {
  writeList(SAVED_KEYS[kind], [])
}

export function loadMemberNotifications(): MemberNotification[] {
  const notifications = readList<MemberNotification>(NOTIFICATION_KEY, [])
  if (notifications.length > 0) return notifications
  writeList(NOTIFICATION_KEY, DEFAULT_MEMBER_NOTIFICATIONS)
  return DEFAULT_MEMBER_NOTIFICATIONS
}

export function saveMemberNotifications(notifications: MemberNotification[]): void {
  writeList(NOTIFICATION_KEY, notifications)
}

export function dismissMemberNotification(id: string): MemberNotification[] {
  const next = loadMemberNotifications().filter((item) => item.id !== id)
  writeList(NOTIFICATION_KEY, next)
  return next
}
