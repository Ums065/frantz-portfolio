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

    /* Strip the folder the app is installed in. At the domain root that is
       nothing and this does nothing; under /frantz-portfolio/ it is the
       difference between reading the route as "/blog/12" and as
       "/frantz-portfolio/blog/12" — which matched no route, so every page
       answered 404 and got none of its meta tags. The base comes from this
       script's own location, so it is right wherever the app is installed. */
    $base = str_replace('\\', '/', dirname((string) ($_SERVER['SCRIPT_NAME'] ?? '')));
    $base = '/' . trim($base, '/.');
    if ($base !== '/' && strpos($path, $base) === 0) {
        $path = substr($path, strlen($base));
    }

    $path = '/' . trim($path, '/');
    if ($path === '/') { echo $html; exit; } // homepage: static tags are already correct

    /* Prefer the prerendered page for this route (dist/media/index.html, …) over
       the bare shell. `npm run build:seo` writes one per public route, but the
       root .htaccess never serves them directly — a route is a directory, and
       its "real file" rule only matches files — so every route fell through to
       this script and got the shell: an empty <div id="root">. A crawler that
       does not run our JavaScript saw no content at all on /media or
       /new-school. The meta rewrite below still runs on top, so titles, canonical
       and the soft-404 / blog / careers logic are unchanged.
       The pattern has no dot, so this cannot be pointed outside dist/. */
    if (preg_match('#^/[A-Za-z0-9/_-]+$#', $path)) {
        $pre = @file_get_contents(__DIR__ . '/frontend/dist' . $path . '/index.html');
        if ($pre !== false && strlen($pre) > 2000) {
            // The prerender already carries the page's own breadcrumb JSON-LD;
            // the block injected below would be a duplicate of it.
            $html = preg_replace('#<script type="application/ld\+json" data-seo="page">.*?</script>\s*#is', '', $pre) ?? $pre;
        }
    }

    // Static route → [title, description, image?]. Titles get " — Frantz Coutard"
    // appended (matching useSeo). Descriptions mirror each page's useSeo() call.
    $routes = [
        '/about' => ['About', 'Faith, family, and purpose - the story of Frantz Coutard, award-winning entrepreneur, technology innovator, and community advocate.', '/assets/awards/frantz-coutard.webp'],
        '/awards' => ['Awards & Recognition', 'Recognized by community, county, state, federal, and national organizations — from the Queens Chamber (2023) to the Presidential Lifetime Achievement Award and the U.S. Senate.', '/assets/awards/frantz-coutard.webp'],
        '/careers' => ['Careers & Opportunities', 'Open roles across the Frantz Coutard ecosystem and our partner organisations. Apply online — open to applicants 18 and over.', null],
        '/blog' => ['Blog & News', 'Insights from Frantz Coutard on technology, entrepreneurship, and community - plus news shaping local commerce.', null],
        /* /winners and /donate are real pages (and /winners is in sitemap.php), but
           were missing here — so they answered HTTP 404 to every crawler, which
           tells Google to drop a URL the sitemap was asking it to index. */
        '/winners' => ['Winners', 'The students, schools, and community projects recognized in the Student Impact Challenge.', null],
        '/donate' => ['Donate — Student Impact Challenge', 'Fund the Student Impact Challenge: scholarships, the school-impact grant and the showcase night. A program of TrendCatch Gives Back Inc., a registered 501(c)(3) nonprofit.', null],
        '/events' => ['Events', 'Where to find Frantz Coutard next - keynotes, panels, and community gatherings.', null],
        '/contact' => ['Contact', 'Get in touch with Frantz Coutard and the team for partnerships, press, speaking, and community initiatives.', '/assets/fc-logo.webp'],
        '/resources' => ['Resources & Handbooks', 'Download official handbooks, the New School program guide, and media, partnership, and sponsorship kits.', null],
        '/media' => ['Media Center', 'Press kits, interview assets, photos, video clips, and testimonial highlights for Frantz Coutard.', '/assets/gallery-speaking-stage.webp'],
        '/projects' => ['Projects', "TrendCatch Network, TrendCatch Player Technology, TrendCatch Gives Back, and Unlock A Cause - the flagship projects driving Frantz Coutard's ecosystem.", '/assets/project-trendcatch-network.webp'],
        '/store' => ['Merch Collection', 'Admin-managed merch catalog with live, sold out, and upcoming product states.', null],
        '/partner' => ['Our Partners', 'The organizations, schools, businesses, media, and government partners powering New York’s largest student problem-solving movement.', null],
        '/new-school' => ['1st Annual Student Impact Challenge', 'Leave It Better Than You Found It — ages 10-20, elementary school through college. Interview 10 local people, choose one problem, propose a solution. Entries close March 31, 2027.', '/assets/challenge-poster.webp'],
        '/rules' => ['Official Rules — Student Impact Challenge', 'Who can enter (ages 10-20), what to submit, key dates in Eastern Time, awards and how entries are judged.', '/assets/challenge-poster.webp'],
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
        '/business', '/fellow', '/sponsor', '/partner-portal', '/media-portal', '/volunteer',
        '/demo', '/new-school/dashboard', '/register',
    ];

    $title = null; $desc = null; $image = null; $post = null; $job = null; $known = false;
    /* "The database is down" and "this page does not exist" are different
       answers. A 404 tells a crawler to drop the URL for good; a database that
       is briefly unreachable must not cost us every article and every open
       role in the index. Set when a lookup FAILS, never when it simply finds
       no row — that really is a 404. */
    $dbUnavailable = false;

    if (isset($routes[$path])) {
        [$title, $desc, $image] = $routes[$path];
        $known = true;
    } elseif (in_array($path, $appRoutes, true) || preg_match('#^/new-school/parent/#', $path) || preg_match('#^/register/[A-Za-z0-9_-]+$#', $path)) {
        $known = true; // valid app route, no meta injection
    } elseif (preg_match('#^/blog/(\d+)$#', $path, $m)) {
        // Single blog post — pull the real title/excerpt/cover/date from the DB.
        require_once __DIR__ . '/api/config.php';
        header('Content-Type: text/html; charset=utf-8'); // config.php sets JSON; restore HTML
        /* A draft, or an article dated in the future, is not a page yet — it
           must 404 for a crawler rather than being indexed early. The status
           column is checked in PHP so this still works against a database that
           has not run the migration (no column, everything live). */
        try {
            $stmt = db()->prepare('SELECT * FROM posts WHERE id = ?');
            $stmt->execute([(int) $m[1]]);
            $post = $stmt->fetch() ?: null;
            if ($post) {
                // Same clock the API uses — the site's, not the server's.
                $siteToday = (new DateTimeImmutable('now', new DateTimeZone((string) env('APP_TIMEZONE', 'America/New_York'))))->format('Y-m-d');
                $live = (string) ($post['status'] ?? 'published') === 'published'
                    && (empty($post['published_at']) || substr((string) $post['published_at'], 0, 10) <= $siteToday);
                if (!$live) $post = null;
            }
        } catch (Throwable $e) { $post = null; $dbUnavailable = true; }
        if ($post) {
            $title = (string) $post['title'];
            $desc = $post['excerpt'] !== null && $post['excerpt'] !== '' ? (string) $post['excerpt'] : null;
            $image = $post['cover_image'] !== null && $post['cover_image'] !== '' ? (string) $post['cover_image'] : null;
            $known = true;
        }
        // else: post id doesn't exist → genuine 404 (handled below)
    } elseif (preg_match('#^/careers/(\d+)$#', $path, $m)) {
        /* A single open role. Only an approved one is a real page: a pending,
           declined or deleted posting must 404 rather than sit in the index
           advertising a job nobody can apply for. */
        require_once __DIR__ . '/api/config.php';
        header('Content-Type: text/html; charset=utf-8'); // config.php sets JSON; restore HTML
        try {
            $stmt = db()->prepare("SELECT * FROM career_jobs WHERE id = ? AND status = 'approved' LIMIT 1");
            $stmt->execute([(int) $m[1]]);
            $job = $stmt->fetch() ?: null;
        } catch (Throwable $e) { $job = null; $dbUnavailable = true; }
        if ($job) {
            $title = (string) $job['title'] . ' — ' . (string) $job['org_name'];
            $desc = trim((string) ($job['summary'] ?? '')) !== ''
                ? (string) $job['summary']
                : (string) $job['title'] . ' at ' . (string) $job['org_name']
                    . '. Apply online — open to applicants 18 and over.';
            $known = true;
        }
    }

    /* Database unreachable: answer 503 with Retry-After, not 404 and not a
       cheerful 200. 503 is the one status that says "this page is real, come
       back later" — Google holds the URL instead of dropping it, and will not
       index the generic shell in place of the real article or role. */
    if ($dbUnavailable) {
        http_response_code(503);
        header('Retry-After: 600');
        echo $html;
        exit;
    }

    // Soft-404 fix: a URL that matches no real route (the SPA's NotFound catch-all,
    // or a deleted blog post) must return HTTP 404, not 200. The SPA still renders
    // its NotFound page; only the status code changes so search engines drop it.
    if (!$known) { http_response_code(404); echo $html; exit; }

    // Valid app/auth route (dashboards, profile, reset): no public meta, but
    // force noindex so these never appear in search results even if a crawler
    // ignores robots.txt. Defense-in-depth alongside the robots.txt Disallow.
    if ($title === null) {
        $out = preg_replace(
            '#(<meta\s+name="robots"\s+content=")[^"]*(")#i',
            '${1}noindex, nofollow${2}',
            $html
        );
        echo $out ?? $html;
        exit;
    }

    $fullTitle = $title . ' — ' . SITE;
    $descOut = $desc ?? 'Frantz Coutard — Technology Innovator, Visionary, Community Builder. From Community to Legacy.';
    $imgOut = $image ?: DEFAULT_IMAGE;
    if (!preg_match('#^https?://#i', $imgOut)) $imgOut = SITE_URL . '/' . ltrim($imgOut, '/');
    $canonical = SITE_URL . $path;

    $t = fn(string $s) => htmlspecialchars($s, ENT_QUOTES);

    // Replace each known head tag by attribute, regardless of its current value.
    /* Each entry is [pattern, the text to put in]. The text goes in through a
       CALLBACK, never as a replacement string.

       preg_replace() reads $1, ${1} and \1 inside its replacement as
       backreferences — including inside content it was handed. A title
       reading "Starting at $29 a Month" became "Starting at  a Month" on
       every share card and in every search result, because PHP read the $29
       as capture group 29, found none, and substituted nothing. "$100" lost
       everything but the last 0. A price in a headline is not an edge case
       for this site, and nothing about the symptom pointed at the cause.
       A callback returns its string verbatim, so there is nothing to parse. */
    $reps = [
        ['#<title>.*?</title>#is', $t($fullTitle), 'title'],
        ['#(<meta\s+name="description"\s+content=")[^"]*(")#i', $t($descOut), 'wrap'],
        ['#(<meta\s+property="og:title"\s+content=")[^"]*(")#i', $t($fullTitle), 'wrap'],
        ['#(<meta\s+property="og:description"\s+content=")[^"]*(")#i', $t($descOut), 'wrap'],
        ['#(<meta\s+property="og:image"\s+content=")[^"]*(")#i', $t($imgOut), 'wrap'],
        ['#(<meta\s+property="og:url"\s+content=")[^"]*(")#i', $t($canonical), 'wrap'],
        ['#(<link\s+rel="canonical"\s+href=")[^"]*(")#i', $t($canonical), 'wrap'],
        ['#(<meta\s+name="twitter:title"\s+content=")[^"]*(")#i', $t($fullTitle), 'wrap'],
        ['#(<meta\s+name="twitter:description"\s+content=")[^"]*(")#i', $t($descOut), 'wrap'],
        ['#(<meta\s+name="twitter:image"\s+content=")[^"]*(")#i', $t($imgOut), 'wrap'],
    ];
    foreach ($reps as [$pattern, $value, $kind]) {
        $out = preg_replace_callback(
            $pattern,
            static fn(array $m): string => $kind === 'title'
                ? '<title>' . $value . '</title>'
                : $m[1] . $value . $m[2],
            $html
        );
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

    /* Open role → JobPosting structured data. This is what lets a role appear
       in Google's jobs results, and it has to be in the served HTML: the
       crawler that reads it does not run our JavaScript. */
    if ($job !== null) {
        $body = implode("\n\n", array_filter([
            (string) ($job['summary'] ?? ''), (string) ($job['description'] ?? ''),
            (string) ($job['responsibilities'] ?? ''), (string) ($job['requirements'] ?? ''),
        ]));
        $deadline = trim((string) ($job['apply_deadline'] ?? ''));
        $remote = (string) ($job['work_mode'] ?? '') === 'remote';
        $loc = trim((string) ($job['location'] ?? ''));
        $schema = array_filter([
            '@context' => 'https://schema.org',
            '@type' => 'JobPosting',
            'title' => (string) $job['title'],
            'description' => $body !== '' ? $body : (string) $job['title'],
            'datePosted' => substr((string) $job['created_at'], 0, 10),
            'validThrough' => $deadline !== '' && $deadline !== '0000-00-00' ? $deadline : null,
            'employmentType' => strtoupper((string) $job['employment_type']),
            'hiringOrganization' => ['@type' => 'Organization', 'name' => (string) $job['org_name']],
            'jobLocationType' => $remote ? 'TELECOMMUTE' : null,
            'jobLocation' => $loc !== ''
                ? ['@type' => 'Place', 'address' => ['@type' => 'PostalAddress', 'addressLocality' => $loc, 'addressCountry' => 'US']]
                : null,
            'applicantLocationRequirements' => $remote ? ['@type' => 'Country', 'name' => 'USA'] : null,
            'skills' => trim((string) ($job['skills'] ?? '')) ?: null,
            'directApply' => true,
            'url' => $canonical,
        ], static fn($v) => $v !== null);
        $ld = '<script type="application/ld+json">'
            . json_encode($schema, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE)
            . '</script>' . "\n</head>";
        $html = str_replace('</head>', $ld, $html);
    }

    // Breadcrumb structured data (breadcrumb rich results). Home > [Blog >] Page.
    $crumbs = [['name' => 'Home', 'item' => SITE_URL . '/']];
    if ($post !== null) {
        $crumbs[] = ['name' => 'Blog', 'item' => SITE_URL . '/blog'];
    }
    if ($job !== null) {
        $crumbs[] = ['name' => 'Careers', 'item' => SITE_URL . '/careers'];
    }
    $crumbs[] = ['name' => $title, 'item' => $canonical];
    $breadcrumb = [
        '@context' => 'https://schema.org',
        '@type' => 'BreadcrumbList',
        'itemListElement' => [],
    ];
    foreach ($crumbs as $i => $c) {
        $breadcrumb['itemListElement'][] = [
            '@type' => 'ListItem',
            'position' => $i + 1,
            'name' => $c['name'],
            'item' => $c['item'],
        ];
    }
    $bcLd = '<script type="application/ld+json">'
        . json_encode($breadcrumb, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE)
        . '</script>' . "\n</head>";
    $html = str_replace('</head>', $bcLd, $html);

    echo $html;
} catch (Throwable $e) {
    // Any failure: fall back to the untouched shell so the page still works.
    echo $html;
}
