import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api, type PostDetail } from '../lib/api'
import { isSavedItem, toggleSavedItem } from '../lib/memberStorage'
import { useSeo } from '../hooks/useSeo'
import { GoodRead, ReadingProgress, ReadingTime, ShareRow, useReadTracking, visitorId } from '../components/ArticleEngagement'

const cover = '/assets/abstract-gold-network.webp'
const fmt = (d: string) => new Date(d + 'T00:00:00').toLocaleString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })

export default function BlogPost() {
  const { id } = useParams<{ id: string }>()
  const [post, setPost] = useState<PostDetail | null>(null)
  const [notFound, setNotFound] = useState(false)
  const [saved, setSaved] = useState(false)

  useSeo({
    title: post?.title || 'Article',
    description: post?.excerpt || undefined,
    image: post?.cover_image || undefined,
    type: 'article',
    publishedTime: post?.published_at || undefined,
    jsonLd: post ? {
      '@context': 'https://schema.org',
      '@type': 'Article',
      headline: post.title,
      description: post.excerpt || undefined,
      image: post.cover_image || undefined,
      datePublished: post.published_at || undefined,
      articleSection: post.category || undefined,
      author: { '@type': 'Person', name: 'Frantz Coutard' },
      publisher: {
        '@type': 'Organization',
        name: 'Frantz Coutard',
        logo: { '@type': 'ImageObject', url: 'https://frantzcoutard.com/assets/fc-logo.webp' },
      },
      mainEntityOfPage: `https://frantzcoutard.com/blog/${post.id}`,
    } : undefined,
  })

  useEffect(() => {
    window.scrollTo(0, 0)
    setPost(null)
    setNotFound(false)
    setSaved(false)
    // The visitor id lets the server say whether THIS reader already liked it.
    api.get<{ post: PostDetail }>(`posts/${id}?v=${encodeURIComponent(visitorId())}`)
      .then((d) => {
        setPost(d.post)
        setSaved(isSavedItem('article', String(d.post.id)))
      })
      .catch(() => setNotFound(true))
  }, [id])
  const bodyRef = useRef<HTMLDivElement | null>(null)
  useReadTracking(post?.id, bodyRef)

  const toggle = () => {
    if (!post) return
    const next = toggleSavedItem('article', {
      id: String(post.id),
      title: post.title,
      href: `/blog/${post.id}`,
      meta: `${post.category} · ${fmt(post.published_at)}`,
    })
    setSaved(next.some((item) => item.id === String(post.id)))
    window.fcToast?.(next.some((item) => item.id === String(post.id)) ? 'Saved for later.' : 'Removed from saved articles.')
  }

  return (
    <main className="page">
      {post && <ReadingProgress />}
      <section className="block" style={{ paddingTop: 40 }}>
        <div className="wrap">
          <article className="post-article">
            <Link className="post-back" to="/blog">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth={2}><path d="M19 12H5M11 6l-6 6 6 6" /></svg>
              All Articles
            </Link>

            {notFound && <p style={{ color: 'var(--muted)' }}>Article not found. <Link to="/blog" style={{ color: 'var(--gold-light)' }}>Back to the blog</Link>.</p>}

            {post && (
              <>
                <div className="kicker" style={{ marginBottom: 10 }}>
                  <span className="cat">{post.category}</span><span>&bull;</span><span>{fmt(post.published_at)}</span>
                  <span>&bull;</span><ReadingTime text={post.body || post.excerpt} />
                </div>
                <h1 className="gold-text">{post.title}</h1>
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', margin: '0 0 20px', alignItems: 'center' }}>
                  <GoodRead postId={post.id} initial={post.engagement} />
                  <button className={saved ? 'btn btn--sm btn--solid' : 'btn btn--sm'} type="button" onClick={toggle}>
                    {saved ? 'Saved' : 'Save Article'}
                  </button>
                  <button className="btn btn--sm" type="button" data-request="Newsletter Topic">
                    Request Update
                  </button>
                </div>
                <ShareRow title={post.title} url={`${window.location.origin}/blog/${post.id}`} postId={post.id} compact />
                {/* contain, not cover: the whole picture, never a cropped one. */}
                <div className="post-cover">
                  <img src={post.cover_image || cover} alt={post.title || 'Article cover'} loading="eager" decoding="async" />
                </div>
                <div className="post-article__body" ref={bodyRef}>
                  {(post.body || post.excerpt).split('\n\n').map((para, i) => <p key={i}>{para}</p>)}
                </div>
                {/* Asked for again at the end, where someone who actually read it is. */}
                <div className="post-endbar">
                  <GoodRead postId={post.id} initial={post.engagement} />
                  <ShareRow title={post.title} url={`${window.location.origin}/blog/${post.id}`} postId={post.id} />
                </div>

                {/* Somewhere to go next, rather than a dead end at the bottom. */}
                {(post.related || []).length > 0 && (
                  <section className="post-related">
                    <h2>Keep reading</h2>
                    <div className="post-related__grid">
                      {(post.related || []).map((r) => (
                        <Link className="post-related__card" to={`/blog/${r.id}`} key={r.id}>
                          <span className="post-related__img">
                            <img src={r.cover_image || cover} alt="" loading="lazy" decoding="async" />
                          </span>
                          <span className="post-related__cat">{r.category}</span>
                          <span className="post-related__title">{r.title}</span>
                        </Link>
                      ))}
                    </div>
                  </section>
                )}
              </>
            )}
          </article>
        </div>
      </section>
    </main>
  )
}
