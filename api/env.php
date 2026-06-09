<?php
/* ============================================================
   Tiny .env loader (no Composer / no dependency)
   Parses KEY=VALUE lines from a .env file and exposes env().
   ============================================================ */

declare(strict_types=1);

/**
 * Load a .env file into a static store (once).
 * Lines: KEY=VALUE. Blank lines and lines starting with # are ignored.
 * Surrounding single/double quotes around the value are stripped.
 */
function load_env(string $path): void
{
    static $loaded = [];
    if (isset($loaded[$path]) || !is_file($path)) {
        return;
    }
    $loaded[$path] = true;

    foreach (file($path, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) as $line) {
        $line = trim($line);
        if ($line === '' || $line[0] === '#') {
            continue;
        }
        $pos = strpos($line, '=');
        if ($pos === false) {
            continue;
        }
        $key = trim(substr($line, 0, $pos));
        $val = trim(substr($line, $pos + 1));

        // strip matching surrounding quotes
        if (strlen($val) >= 2) {
            $first = $val[0];
            $last  = $val[strlen($val) - 1];
            if (($first === '"' && $last === '"') || ($first === "'" && $last === "'")) {
                $val = substr($val, 1, -1);
            }
        }

        // Don't override real environment variables if already set.
        if (getenv($key) === false) {
            putenv("$key=$val");
            $_ENV[$key] = $val;
        }
    }
}

/** Read an env var with an optional default. */
function env(string $key, ?string $default = null): ?string
{
    $val = getenv($key);
    if ($val === false) {
        return $_ENV[$key] ?? $default;
    }
    return $val;
}
