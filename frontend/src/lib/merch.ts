const merchHoodie = '/assets/merch-hoodie.webp'
const merchTee = '/assets/merch-tee.webp'
const merchCap = '/assets/merch-cap.webp'
const merchCollectible = '/assets/merch-collectible.webp'
const brandSignature = '/assets/brand-signature-white.webp'

export interface MerchPreviewItem {
  id: string
  title: string
  image: string
}

export interface MerchCatalogItem extends MerchPreviewItem {
  category: string
  description: string
  status: 'live' | 'coming-soon'
}

export const merchPreviewItems: MerchPreviewItem[] = [
  {
    id: 'founder-hoodies',
    title: 'Founder Hoodies',
    image: merchHoodie,
  },
  {
    id: 'premium-tees',
    title: 'Premium T-Shirts',
    image: merchTee,
  },
  {
    id: 'signature-caps',
    title: 'Signature Caps',
    image: merchCap,
  },
  {
    id: 'books-resources',
    title: 'Books & Resources',
    image: brandSignature,
  },
  {
    id: 'limited-collectibles',
    title: 'Limited Edition Collectibles',
    image: merchCollectible,
  },
]

export const merchCatalogItems: MerchCatalogItem[] = [
  {
    ...merchPreviewItems[0],
    category: 'Hoodies',
    description: 'Heavyweight layers and future hoodie drops built around the FC mission.',
    status: 'live',
  },
  {
    ...merchPreviewItems[1],
    category: 'T-Shirts',
    description: 'Clean everyday tees with the brand visual system and purpose-driven messaging.',
    status: 'live',
  },
  {
    ...merchPreviewItems[2],
    category: 'Caps',
    description: 'Structured headwear styled for the community, the stage, and the everyday look.',
    status: 'live',
  },
  {
    ...merchPreviewItems[3],
    category: 'Books',
    description: 'Guides, stories, and future reading material for the legacy collection.',
    status: 'live',
  },
  {
    ...merchPreviewItems[4],
    category: 'Collectibles',
    description: 'Small-run pieces reserved for supporters who want the official collection look.',
    status: 'live',
  },
  {
    id: 'hoodie-legacy',
    title: 'Founder Hoodie - Legacy Black',
    image: merchHoodie,
    category: 'Hoodies',
    description: 'Heavyweight fleece hoodie with the embroidered FC emblem and sleeve message.',
    status: 'coming-soon',
  },
  {
    id: 'hoodie-c2l',
    title: 'From Community to Legacy Hoodie',
    image: merchHoodie,
    category: 'Hoodies',
    description: 'Premium brushed hoodie with the legacy tagline and a bold mission-first look.',
    status: 'coming-soon',
  },
  {
    id: 'tee-emblem',
    title: 'Premium Tee - FC Emblem',
    image: merchTee,
    category: 'T-Shirts',
    description: 'Soft cotton tee with the FC emblem and a minimalist everyday fit.',
    status: 'coming-soon',
  },
  {
    id: 'tee-tech',
    title: 'Technology For Good Tee',
    image: merchTee,
    category: 'T-Shirts',
    description: 'A clean graphic tee centered on the brand message and the tech-for-good mission.',
    status: 'coming-soon',
  },
  {
    id: 'cap-gold',
    title: 'Signature Cap - Gold FC',
    image: merchCap,
    category: 'Caps',
    description: 'Structured cap with embroidered gold FC monogram and adjustable fit.',
    status: 'coming-soon',
  },
  {
    id: 'collectible-pin',
    title: 'Limited Edition FC Lapel Pin',
    image: merchCollectible,
    category: 'Collectibles',
    description: 'Gold and green enamel pin reserved for a future release of the official collection.',
    status: 'coming-soon',
  },
]
