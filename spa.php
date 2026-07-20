<?php
/* ============================================================
   FrantzCoutard.com — SPA shell with per-route meta injection
   ------------------------------------------------------------
   The site is a client-rendered React app. Social scrapers
   (Facebook, LinkedIn, WhatsApp, X) and some crawlers do NOT run
   JavaScript, so they only ever saw the homepage's <title>/OG tags
   no matter which page was shared. This shim serves the same built
   index.html but rewrites the <title>, description, canonical and
   Open Graph / Twitter tags to match the requested route, so shared
   links and search snippets are correct. The browser still gets the
   normal SPA and useSeo() keeps everything in sync at runtime.

   Bulletproof: on ANY problem it echoes the unmodified index.html,
   so it can never make a page worse than the plain static file.
   ============================================================ */

declare(strict_types=1);

const SITE = 'Frantz Coutard';
const SITE_URL = 'https://frantzcoutard.com';
const DEFAULT_IMAGE = SITE_URL . '/assets/fc-logo.webp';

$indexPath = __DIR__ . '/frontend/dist/index.html';
$html = @file_get_contents($indexPath);

// If the build is missing we cannot do anything useful — 404 cleanly.
if ($html === false) {
    http_response_code(404);
    header('Content-Type: text/html; charset=utf-8');
    echo 'Not found';
    exit;
}

// Serve the shell no matter what; only the meta rewrite is best-effort.
header('Content-Type: text/html; charset=utf-8');
header('Cache-Control: no-cache');

try {
    // Clean request path: drop query/hash, collapse trailing slash.
    $path = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/';
    $path = '/' . trim($path, '/');
    if ($path === '/') { echo $html; exit; } // homepage: static tags are already correct

    // Static route → [title, description, image?]. Titles get " — Frantz Coutard"
    // appended (matching useSeo). Descriptions mirror each page's useSeo() call.
    $routes = [
        '/about' => ['About', 'Faith, family, and purpose - the story of Frantz Coutard, award-winning entrepreneur, technology innovator, and community advocate.', '/assets/awards/frantz-coutard.webp'],
        '/awards' => ['Awards & Recognition', 'Recognized by community, county, state, federal, and national organizations — from the Queens Chamber (2023) to the Presidential Lifetime Achievement Award and the U.S. Senate.', '/assets/awards/frantz-coutard.webp'],
        '/blog' => ['Blog & News', 'Insights from Frantz Coutard on technology, entrepreneurship, and community - plus news shaping local commerce.', null],
        '/events' => ['Events', 'Where to find Frantz Coutard next - keynotes, panels, and community gatherings.', null],
        '/contact' => ['Contact', 'Get in touch with Frantz Coutard and the team for partnerships, press, speaking, and community initiatives.', '/assets/fc-logo.webp'],
        '/media' => ['Media Center', 'Press kits, interview assets, photos, video clips, and testimonial highlights for Frantz Coutard.', '/assets/gallery-speaking-stage.webp'],
        '/projects' => ['Projects', "TrendCatch Network, TrendCatch Player Technology, TrendCatch Gives Back, and Unlock A Cause - the flagship projects driving Frantz Coutard's ecosystem.", '/assets/project-trendcatch-network.webp'],
        '/store' => ['Merch Collection', 'Admin-managed merch catalog with live, sold out, and upcoming product states.', null],
        '/partner' => ['Our Partners', 'The organizations, schools, businesses, media, and government partners powering New York’s largest student problem-solving movement.', null],
        '/new-school' => ['1st Annual Student Impact Challenge', 'Leave It Better Than You Found It — New York’s largest student problem-solving challenge. Schools, students, and sponsors building real community impact.', null],
        '/become-a-founding-sponsor' => ['Become A Founding Sponsor', 'Support New York’s next generation of problem solvers through scholarships, school grants, and community impact.', null],
        '/founding-sponsors' => ['Founding Sponsors', 'Published founding sponsors supporting the Student Impact Challenge.', null],
        '/new-school/become-a-founding-sponsor' => ['Become A Founding Sponsor', 'Support New York’s next generation of problem solvers through scholarships, school grants, and community impact.', null],
        '/new-school/founding-sponsors' => ['Founding Sponsors', 'Published founding sponsors supporting the Student Impact Challenge.', null],
        '/terms' => ['Terms & Conditions', 'The terms and conditions governing use of FrantzCoutard.com.', null],
        '/privacy' => ['Privacy Policy', 'How FrantzCoutard.com collects, uses, and protects your information.', null],
        '/content-disclaimer' => ['Content Disclaimer', 'Disclaimer covering the content published on FrantzCoutard.com.', null],
    ];

    // App / auth-gated routes: valid pages (return 200) but no public meta —
    // they are noindex dashboards, so we serve the shell unchanged.
    $appRoutes = [
        '/dashboard', '/profile', '/reset-password', '/admin', '/judge/dashboard',
        '/business', '/sponsor', '/partner-portal', '/media-portal', '/volunteer',
        '/demo', '/new-school/dashboard',
    ];

    $title = null; $desc = null; $image = null; $post = null; $known = false;

    if (isset($routes[$path])) {
        [$title, $desc, $image] = $routes[$path];
        $known = true;
    } elseif (in_array($path, $appRoutes, true) || preg_match('#^/new-school/parent/#', $path)) {
        $known = true; // valid app route, no meta injection
    } elseif (preg_match('#^/blog/(\d+)$#', $path, $m)) {
        // Single blog post — pull the real title/excerpt/cover/date from the DB.
        require_once __DIR__ . '/api/config.php';
        header('Content-Type: text/html; charset=utf-8'); // config.php sets JSON; restore HTML
        $stmt = db()->prepare('SELECT title, excerpt, cover_image, published_at FROM posts WHERE id = ?');
        $stmt->execute([(int) $m[1]]);
        $post = $stmt->fetch();
        if ($post) {
            $title = (string) $post['title'];
            $desc = $post['excerpt'] !== null && $post['excerpt'] !== '' ? (string) $post['excerpt'] : null;
            $image = $post['cover_image'] !== null && $post['cover_image'] !== '' ? (string) $post['cover_image'] : null;
            $known = true;
        }
        // else: post id doesn't exist → genuine 404 (handled below)
    }

    // Soft-404 fix: a URL that matches no real route (the SPA's NotFound catch-all,
    // or a deleted blog post) must return HTTP 404, not 200. The SPA still renders
    // its NotFound page; only the status code changes so search engines drop it.
    if (!$known) { http_response_code(404); echo $html; exit; }

    // Valid app route with no public meta to change: serve shell as-is.
    if ($title === null) { echo $html; exit; }

    $fullTitle = $title . ' — ' . SITE;
    $descOut = $desc ?? 'Frantz Coutard — Technology Innovator, Visionary, Community Builder. From Community to Legacy.';
    $imgOut = $image ?: DEFAULT_IMAGE;
    if (!preg_match('#^https?://#i', $imgOut)) $imgOut = SITE_URL . '/' . ltrim($imgOut, '/');
    $canonical = SITE_URL . $path;

    $t = fn(string $s) => htmlspecialchars($s, ENT_QUOTES);

    // Replace each known head tag by attribute, regardless of its current value.
    $reps = [
        ['#<title>.*?</title>#is', '<title>' . $t($fullTitle) . '</title>'],
        ['#(<meta\s+name="description"\s+content=")[^"]*(")#i', '${1}' . $t($descOut) . '${2}'],
        ['#(<meta\s+property="og:title"\s+content=")[^"]*(")#i', '${1}' . $t($fullTitle) . '${2}'],
        ['#(<meta\s+property="og:description"\s+content=")[^"]*(")#i', '${1}' . $t($descOut) . '${2}'],
        ['#(<meta\s+property="og:image"\s+content=")[^"]*(")#i', '${1}' . $t($imgOut) . '${2}'],
        ['#(<meta\s+property="og:url"\s+content=")[^"]*(")#i', '${1}' . $t($canonical) . '${2}'],
        ['#(<link\s+rel="canonical"\s+href=")[^"]*(")#i', '${1}' . $t($canonical) . '${2}'],
        ['#(<meta\s+name="twitter:title"\s+content=")[^"]*(")#i', '${1}' . $t($fullTitle) . '${2}'],
        ['#(<meta\s+name="twitter:description"\s+content=")[^"]*(")#i', '${1}' . $t($descOut) . '${2}'],
        ['#(<meta\s+name="twitter:image"\s+content=")[^"]*(")#i', '${1}' . $t($imgOut) . '${2}'],
    ];
    foreach ($reps as [$pattern, $replacement]) {
        $out = preg_replace($pattern, $replacement, $html);
        if ($out !== null) $html = $out; // keep previous on regex failure
    }

    // Blog post → BlogPosting structured data (article rich results). Injected
    // just before </head> so crawlers get it without running JavaScript.
    if ($post !== null) {
        $schema = [
            '@context' => 'https://schema.org',
            '@type' => 'BlogPosting',
            'headline' => $title,
            'description' => $descOut,
            'image' => $imgOut,
            'datePublished' => !empty($post['published_at']) ? substr((string) $post['published_at'], 0, 10) : null,
            'author' => ['@type' => 'Person', 'name' => SITE],
            'publisher' => [
                '@type' => 'Organization',
                'name' => SITE,
                'logo' => ['@type' => 'ImageObject', 'url' => DEFAULT_IMAGE],
            ],
            'mainEntityOfPage' => $canonical,
        ];
        $ld = '<script type="application/ld+json">'
            . json_encode($schema, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE)
            . '</script>' . "\n</head>";
        $html = str_replace('</head>', $ld, $html);
    }

    echo $html;
} catch (Throwable $e) {
    // Any failure: fall back to the untouched shell so the page still works.
    echo $html;
}
