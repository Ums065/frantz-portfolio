import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ReadingTime, ShareRow } from '../components/ArticleEngagement'
import Pager from '../components/Pager'
import { api, type Post } from '../lib/api'
import { loadSavedItems, toggleSavedItem } from '../lib/memberStorage'
import { useSeo } from '../hooks/useSeo'

const cover = '/assets/abstract-gold-network.webp'
const fmt = (d: string) => new Date(d + 'T00:00:00').toLocaleString('en-US', { month: 'short', year: 'numeric' })

export default function Blog() {
  const [posts, setPosts] = useState<Post[]>([])
  const [savedArticles, setSavedArticles] = useState<string[]>([])
  const [loadErr, setLoadErr] = useState(false)

  useSeo({ title: 'Blog & News', description: 'Insights from Frantz Coutard on technology, entrepreneurship, and community - plus news shaping local commerce.' })

  // Paged and filtered on the server, so the list stays fast as the blog grows.
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [cat, setCat] = useState('')
  const [q, setQ] = useState('')
  const [cats, setCats] = useState<{ category: string; n: number }[]>([])
  const per = 12

  useEffect(() => { window.scrollTo(0, 0); setSavedArticles(loadSavedItems('article').map((i) => i.id)) }, [])
  useEffect(() => {
    const params = new URLSearchParams({ page: String(page), per: String(per) })
    if (cat) params.set('category', cat)
    if (q.trim()) params.set('q', q.trim())
    const t = setTimeout(() => {
      api.get<{ posts: Post[]; total: number; categories: { category: string; n: number }[] }>(`posts?${params}`)
        .then((d) => {
          setPosts(Array.isArray(d.posts) ? d.posts : [])
          setTotal(d.total || 0)
          setCats(d.categories || [])
          setLoadErr(false)
        })
        .catch(() => { setPosts([]); setLoadErr(true) })
    }, q.trim() ? 300 : 0)
    return () => clearTimeout(t)
  }, [page, cat, q])

  const safePosts = Array.isArray(posts) ? posts : []
  const pages = Math.max(1, Math.ceil(total / per))

  const toggleArticle = (post: Post) => {
    const next = toggleSavedItem('article', {
      id: String(post.id),
      title: post.title,
      href: `/blog/${post.id}`,
      meta: `${post.category} · ${fmt(post.published_at)}`,
    })
    setSavedArticles(next.map((item) => item.id))
    window.fcToast?.(next.some((item) => item.id === String(post.id)) ? 'Saved for later.' : 'Removed from saved articles.')
  }

  return (
    <main className="page">
      {loadErr && <div className="wrap"><p style={{ color: '#e08a8a', textAlign: 'center', fontSize: 13, margin: '12px auto 0' }}>Couldn’t load the latest articles right now — please refresh the page.</p></div>}
      <section className="page-hero">
        <div className="wrap" style={{ textAlign: 'center' }}>
          <div className="eyebrow reveal in">Blog, News &amp; Articles</div>
          <h1 className="page-hero__title gold-text reveal in" style={{ margin: '14px auto 10px' }}>Insights &amp; Stories</h1>
          <p className="page-hero__lead reveal in d1" style={{ margin: '0 auto' }}>
            Perspectives from Frantz on technology, entrepreneurship, and community - plus news that shapes local commerce.
          </p>
          <div className="page-hero__chips reveal in d2" style={{ justifyContent: 'center', marginTop: 18 }}>
            <span className="chip">{savedArticles.length} saved</span>
            <span className="chip">News</span>
            <span className="chip">Founder notes</span>
          </div>
        </div>
      </section>

      <section className="block" style={{ paddingTop: 20 }}>
        <div className="wrap">
          <div className="blog-filters">
            <input className="blog-search" type="search" value={q}
              onChange={(e) => { setQ(e.target.value); setPage(1) }} placeholder="Search articles…" aria-label="Search articles" />
            <div className="blog-cats" role="tablist" aria-label="Filter by category">
              <button type="button" role="tab" aria-selected={cat === ''}
                className={`blog-cat${cat === '' ? ' is-active' : ''}`} onClick={() => { setCat(''); setPage(1) }}>
                All <em>{total}</em>
              </button>
              {cats.map((c) => (
                <button key={c.category} type="button" role="tab" aria-selected={cat === c.category}
                  className={`blog-cat${cat === c.category ? ' is-active' : ''}`}
                  onClick={() => { setCat(c.category); setPage(1) }}>
                  {c.category} <em>{c.n}</em>
                </button>
              ))}
            </div>
          </div>
          <div className="blog-list-grid">
            {safePosts.map((p) => {
              const saved = savedArticles.includes(String(p.id))
              return (
                <article className="glass blog-card reveal" key={p.id}>
                  {/* The picture is a link too — clicking it opens the article. */}
                  <Link className="blog-card__img" to={`/blog/${p.id}`} aria-label={`Read: ${p.title}`}>
                    <img src={p.cover_image || cover} alt={p.title || 'Blog post cover'} loading="lazy" decoding="async" />
                  </Link>
                  <div className="blog-card__body">
                    <div className="kicker"><span className="cat">{p.category}</span><span>&bull;</span><span>{fmt(p.published_at)}</span><span>&bull;</span><span>{p.read_minutes ? `${p.read_minutes} min read` : <ReadingTime text={p.excerpt} />}</span></div>
                    <h3><Link to={`/blog/${p.id}`}>{p.title}</Link></h3>
                    <p>{p.excerpt}</p>
                    <div className="item-actions">
                      <Link className="read" to={`/blog/${p.id}`}>Read Article <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth={2}><path d="M5 12h14M13 6l6 6-6 6" /></svg></Link>
                      <button
                        type="button"
                        className={saved ? 'btn btn--sm btn--solid' : 'btn btn--sm'}
                        aria-pressed={saved}
                        onClick={() => toggleArticle(p)}
                      >
                        {saved ? 'Saved' : 'Save'}
                      </button>
                      <ShareRow title={p.title} url={`${window.location.origin}/blog/${p.id}`} compact postId={p.id} />
                    </div>
                  </div>
                </article>
              )
            })}
          </div>
          {safePosts.length === 0 && (
            <p style={{ textAlign: 'center', color: 'var(--muted)' }}>
              {q.trim() || cat ? 'No article matches that. Try another word, or clear the filter.' : 'No articles yet - check back soon.'}
            </p>
          )}
          <Pager page={page} pages={pages} total={total} unit="articles" onPage={(p) => { setPage(p); window.scrollTo({ top: 0, behavior: 'smooth' }) }} />
        </div>
      </section>
    </main>
  )
}
