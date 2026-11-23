<?php
/* ============================================================
   FrantzCoutard.com — dynamic XML sitemap
   Served at https://frantzcoutard.com/sitemap.xml via a rewrite in the
   project-root .htaccess. Lists the public marketing/content pages plus
   every published blog post (/blog/{id}) pulled live from the database,
   so the sitemap is always fresh with no manual editing.

   Defensive by design: if the database is unreachable the static page
   list is still emitted, so the endpoint never returns a 500 / empty body.
   ============================================================ */

declare(strict_types=1);

// config.php gives us env() + db(). It sets a JSON content-type header, which
// we override below; its session/CORS side effects are harmless here.
require __DIR__ . '/api/config.php';

// Public site origin (no trailing slash).
$base = rtrim((string) env('APP_URL', 'https://frantzcoutard.com'), '/');
$today = date('Y-m-d');

/** One <url> block. $loc is a path (e.g. "/about") or "" for the homepage. */
function sitemap_url(string $base, string $loc, ?string $lastmod, string $changefreq, string $priority): string
{
    // Homepage keeps its canonical trailing slash; other paths have none.
    $full = $loc === '' ? $base . '/' : $base . $loc;
    return "  <url>\n"
        . "    <loc>" . htmlspecialchars($full, ENT_XML1) . "</loc>\n"
        . ($lastmod !== null ? "    <lastmod>" . htmlspecialchars($lastmod, ENT_XML1) . "</lastmod>\n" : '')
        . "    <changefreq>" . $changefreq . "</changefreq>\n"
        . "    <priority>" . $priority . "</priority>\n"
        . "  </url>\n";
}

// Static public pages (path, changefreq, priority). Auth-gated routes
// (/admin, /dashboard, /*-portal, …) are intentionally excluded — they are
// also Disallowed in robots.txt.
$staticPages = [
    ['', 'weekly', '1.0'],
    ['/new-school', 'weekly', '0.9'],
    ['/rules', 'monthly', '0.8'],
    ['/about', 'monthly', '0.8'],
    ['/projects', 'monthly', '0.8'],
    ['/blog', 'weekly', '0.8'],
    ['/awards', 'monthly', '0.7'],
    ['/events', 'weekly', '0.7'],
    ['/contact', 'monthly', '0.7'],
    ['/resources', 'monthly', '0.7'],
    ['/partner', 'monthly', '0.7'],
    ['/media', 'monthly', '0.6'],
    ['/new-school/become-a-founding-sponsor', 'monthly', '0.5'],
    ['/terms', 'yearly', '0.3'],
    ['/privacy', 'yearly', '0.3'],
];

/* Pages that only earn a place once they have real content (audit: "hold until useful").
   Each is added when the data exists, so it appears by itself the day it becomes useful and
   never has to be remembered. They stay reachable for visitors either way. */
$conditional = [];
try {
    if (strtolower((string) db()->query("SELECT setting_value FROM new_school_settings WHERE setting_key = 'winners_published' LIMIT 1")->fetchColumn()) === 'true') {
        $conditional[] = ['/winners', 'weekly', '0.8'];
    }
} catch (Throwable $e) { /* table missing on an old deploy: hold */ }
try {
    if ((int) db()->query("SELECT COUNT(*) FROM career_jobs WHERE status = 'approved' AND (apply_deadline IS NULL OR apply_deadline >= CURDATE())")->fetchColumn() > 0) {
        $conditional[] = ['/careers', 'daily', '0.8'];
    }
} catch (Throwable $e) { /* hold */ }
try {
    if ((int) db()->query("SELECT COUNT(*) FROM sponsor_applications WHERE approval_status = 'published'")->fetchColumn() > 0) {
        $conditional[] = ['/new-school/founding-sponsors', 'monthly', '0.5'];
    }
} catch (Throwable $e) { /* hold */ }
// /store and /donate wait for a real catalog / working giving flow; /content-disclaimer is
// a legal link that stays accessible but is not a search destination.
$staticPages = array_merge($staticPages, $conditional);

$body = '';
foreach ($staticPages as [$path, $freq, $prio]) {
    /* No <lastmod> for these: the pages are static, and stamping every one with
       today's date told Google they all change daily, which teaches it to ignore
       the field (and our real article/role dates with it). */
    $body .= sitemap_url($base, $path, null, $freq, $prio);
}

// Published blog posts — /blog/{id}. published_at (a DATE) is the closest
// public "last modified" value; fall back to today when it is null.
try {
    /* Drafts and posts dated in the future are not public, so they do not
       belong here. Written out rather than pulled from lib.php: this file only
       loads config.php, which does not define it.
       The fallback covers a database that has not run the migration yet — the
       status column simply is not there, and every post was live before it. */
    /* The date comes from PHP on the site's clock, not from MySQL's CURDATE():
       the database session's timezone can be hours behind, which would leave
       an article published today out of the sitemap until tomorrow. */
    $siteToday = (new DateTimeImmutable('now', new DateTimeZone((string) env('APP_TIMEZONE', 'America/New_York'))))->format('Y-m-d');
    try {
        $s = db()->prepare("SELECT id, published_at FROM posts
            WHERE status = 'published' AND (published_at IS NULL OR published_at <= ?)
            ORDER BY published_at DESC, id DESC");
        $s->execute([$siteToday]);
        $rows = $s->fetchAll();
    } catch (Throwable $inner) {
        $rows = db()->query('SELECT id, published_at FROM posts ORDER BY published_at DESC, id DESC')->fetchAll();
    }
    foreach ($rows as $r) {
        $lastmod = !empty($r['published_at']) ? substr((string) $r['published_at'], 0, 10) : $today;
        $body .= sitemap_url($base, '/blog/' . (int) $r['id'], $lastmod, 'monthly', '0.6');
    }
} catch (Throwable $e) {
    // DB down: static pages above are still returned. Swallow the error so the
    // sitemap endpoint stays healthy for crawlers.
}

// Open roles — /careers/{id}. Only approved ones that are still taking
// applications: a crawler should never be sent to a role nobody can apply for.
try {
    $rows = db()->query("SELECT id, updated_at FROM career_jobs
        WHERE status = 'approved' AND (apply_deadline IS NULL OR apply_deadline >= CURDATE())
        ORDER BY created_at DESC")->fetchAll();
    foreach ($rows as $r) {
        $lastmod = !empty($r['updated_at']) ? substr((string) $r['updated_at'], 0, 10) : $today;
        $body .= sitemap_url($base, '/careers/' . (int) $r['id'], $lastmod, 'weekly', '0.7');
    }
} catch (Throwable $e) {
    // The table may not exist yet on an old deploy — the rest still returns.
}

header('Content-Type: application/xml; charset=utf-8');
echo '<?xml version="1.0" encoding="UTF-8"?>' . "\n";
echo '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' . "\n";
echo $body;
echo '</urlset>' . "\n";
