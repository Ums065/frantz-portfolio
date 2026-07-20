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
function sitemap_url(string $base, string $loc, string $lastmod, string $changefreq, string $priority): string
{
    // Homepage keeps its canonical trailing slash; other paths have none.
    $full = $loc === '' ? $base . '/' : $base . $loc;
    return "  <url>\n"
        . "    <loc>" . htmlspecialchars($full, ENT_XML1) . "</loc>\n"
        . "    <lastmod>" . htmlspecialchars($lastmod, ENT_XML1) . "</lastmod>\n"
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
    ['/about', 'monthly', '0.8'],
    ['/projects', 'monthly', '0.8'],
    ['/blog', 'weekly', '0.8'],
    ['/awards', 'monthly', '0.7'],
    ['/events', 'weekly', '0.7'],
    ['/contact', 'monthly', '0.7'],
    ['/partner', 'monthly', '0.7'],
    ['/media', 'monthly', '0.6'],
    ['/become-a-founding-sponsor', 'monthly', '0.6'],
    ['/founding-sponsors', 'monthly', '0.6'],
    ['/new-school/become-a-founding-sponsor', 'monthly', '0.5'],
    ['/new-school/founding-sponsors', 'monthly', '0.5'],
    ['/store', 'weekly', '0.6'],
    ['/terms', 'yearly', '0.3'],
    ['/privacy', 'yearly', '0.3'],
    ['/content-disclaimer', 'yearly', '0.3'],
];

$body = '';
foreach ($staticPages as [$path, $freq, $prio]) {
    $body .= sitemap_url($base, $path, $today, $freq, $prio);
}

// Published blog posts — /blog/{id}. published_at (a DATE) is the closest
// public "last modified" value; fall back to today when it is null.
try {
    $rows = db()->query('SELECT id, published_at FROM posts ORDER BY published_at DESC, id DESC')->fetchAll();
    foreach ($rows as $r) {
        $lastmod = !empty($r['published_at']) ? substr((string) $r['published_at'], 0, 10) : $today;
        $body .= sitemap_url($base, '/blog/' . (int) $r['id'], $lastmod, 'monthly', '0.6');
    }
} catch (Throwable $e) {
    // DB down: static pages above are still returned. Swallow the error so the
    // sitemap endpoint stays healthy for crawlers.
}

header('Content-Type: application/xml; charset=utf-8');
echo '<?xml version="1.0" encoding="UTF-8"?>' . "\n";
echo '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' . "\n";
echo $body;
echo '</urlset>' . "\n";
