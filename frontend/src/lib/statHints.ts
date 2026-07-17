/* Human descriptions for the admin stat-chip counters, so hovering a card
   explains what the number means. Keyed by the chip's label (normalised:
   lower-cased, leading emoji/symbols stripped). Call statHint(label) — or pass
   an explicit hint on the chip to override. */
const STAT_HINTS: Record<string, string> = {
  total: 'Total number of records in this list.',
  new: 'New, unread items still awaiting your first review.',
  pending: 'Awaiting admin review — no decision has been made yet.',
  'pending approval': 'Accounts waiting for you to approve or reject them.',
  reviewed: 'Items you have looked at and marked as reviewed.',
  approved: 'Items you have approved.',
  accepted: 'Items that have been accepted.',
  declined: 'Requests you declined — a reason was sent to the requester.',
  rejected: 'Accounts or items that were rejected.',
  closed: 'Completed or closed — no further action needed.',
  cancelled: 'Items that were cancelled.',
  'needs info': 'Sent back to the requester asking for more information.',
  fulfilled: 'Orders that have been fulfilled / shipped.',
  paid: 'Orders that have been paid for.',
  revenue: 'Total revenue from store orders.',
  live: 'Products currently visible in the store.',
  hidden: 'Products hidden from the store.',
  upcoming: 'Upcoming / preview items not yet public.',
  'low stock': 'Products running low on inventory.',
  'sold out': 'Products that are out of stock.',
  subscribers: 'People subscribed to the newsletter.',
  messages: 'Messages received through the contact form.',
  'contact messages': 'Messages received through the contact form.',
  'members waiting': 'Accounts waiting for approval.',
  'business interviews': 'Interviews students logged with local businesses.',
  'student submissions': 'Solutions / projects students have submitted.',
  'internships placed': 'Internships fully confirmed by admin, student and parent.',
  students: 'Registered students.',
  schools: 'Registered schools.',
  teachers: 'Registered teachers.',
  parents: 'Registered parents / guardians.',
  winners: 'Announced challenge winners.',
  'judge scores': 'Scores submitted by judges.',
  'event rsvps': 'People who RSVP’d to events.',
  'founding sponsors': 'Founding sponsor applications.',
  'unclaimed schools': 'Schools registered under TrendCatch EDU, not yet claimed by a principal.',
  'claimed (history)': 'Schools that have been claimed by a principal.',
}

export function statHint(label: string, explicit?: string): string | undefined {
  if (explicit) return explicit
  const key = (label || '').trim().toLowerCase().replace(/^[^a-z0-9]+/, '').trim()
  return STAT_HINTS[key]
}
