import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api, type PostDetail } from '../lib/api'
import { isSavedItem, toggleSavedItem } from '../lib/memberStorage'
import { useSeo } from '../hooks/useSeo'

const cover = '/assets/abstract-gold-network.png'
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
  })

  useEffect(() => {
    window.scrollTo(0, 0)
    setPost(null)
    setNotFound(false)
    setSaved(false)
    api.get<{ post: PostDetail }>(`posts/${id}`)
      .then((d) => {
        setPost(d.post)
        setSaved(isSavedItem('article', String(d.post.id)))
      })
      .catch(() => setNotFound(true))
  }, [id])

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
                </div>
                <h1 className="gold-text">{post.title}</h1>
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', margin: '0 0 24px' }}>
                  <button className={saved ? 'btn btn--sm btn--solid' : 'btn btn--sm'} type="button" onClick={toggle}>
                    {saved ? 'Saved' : 'Save Article'}
                  </button>
                  <button className="btn btn--sm" type="button" data-request="Newsletter Topic">
                    Request Update
                  </button>
                </div>
                <div className="legacy__photo" style={{ aspectRatio: '16/7', marginBottom: 30 }}>
                  <img src={post.cover_image || cover} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                </div>
                <div className="post-article__body">
                  {(post.body || post.excerpt).split('\n\n').map((para, i) => <p key={i}>{para}</p>)}
                </div>
              </>
            )}
          </article>
        </div>
      </section>
    </main>
  )
}
