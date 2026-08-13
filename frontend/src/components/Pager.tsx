/* One pager for every server-paged table, on both dashboards. Renders nothing
   when everything already fits, so short lists stay uncluttered.
   Kept in its own file so importing it does not pull a whole screen's component
   into another screen's bundle. */

export default function Pager({ page, pages, total, unit = 'rows', onPage }:
  { page: number; pages: number; total: number; unit?: string; onPage: (p: number) => void }) {
  if (pages <= 1) return null
  return (
    <div className="fc-pager">
      <button className="btn btn--sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>← Previous</button>
      <span className="msub" style={{ fontSize: 12.5 }}>Page {page} of {pages} · {total} {unit}</span>
      <button className="btn btn--sm" disabled={page >= pages} onClick={() => onPage(page + 1)}>Next →</button>
    </div>
  )
}
