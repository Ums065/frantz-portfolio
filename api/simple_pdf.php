<?php
declare(strict_types=1);

/**
 * Minimal dependency-free PDF writer for text reports.
 * Supports a title, section headings, body lines (auto-wrapped) and spacing,
 * with automatic page breaks. Uses the built-in Helvetica core fonts, so no
 * font embedding and no external library is required.
 */
final class SimplePdf
{
    private float $w = 612.0;   // Letter width (pt)
    private float $h = 792.0;   // Letter height (pt)
    private float $margin = 54.0;
    private float $y;
    private array $pages = [];
    private string $cur = '';

    public function __construct()
    {
        $this->y = $this->h - $this->margin;
    }

    /** Escape + strip to printable ASCII (core fonts are Latin-1/ASCII safe). */
    private function esc(string $s): string
    {
        $s = (string) preg_replace('/[^\x20-\x7E]/', '', $s);
        return str_replace(['\\', '(', ')'], ['\\\\', '\\(', '\\)'], $s);
    }

    private function flushPage(): void
    {
        if ($this->cur !== '') {
            $this->pages[] = $this->cur;
            $this->cur = '';
        }
        $this->y = $this->h - $this->margin;
    }

    private function ensure(float $need): void
    {
        if ($this->y - $need < $this->margin) {
            $this->flushPage();
        }
    }

    private function write(string $text, float $size, bool $bold, string $rgb): void
    {
        $font = $bold ? '/F2' : '/F1';
        $this->y -= $size;
        $this->cur .= sprintf(
            "BT %s rg %s %.1f Tf 1 0 0 1 %.1f %.1f Tm (%s) Tj ET\n",
            $rgb, $font, $size, $this->margin, $this->y, $this->esc($text)
        );
        $this->y -= 4.0;
    }

    private function rule(): void
    {
        $x2 = $this->w - $this->margin;
        $this->cur .= sprintf("0.79 0.66 0.30 RG 1 w %.1f %.1f m %.1f %.1f l S\n", $this->margin, $this->y, $x2, $this->y);
    }

    public function title(string $text): void
    {
        $this->ensure(34);
        $this->write($text, 20, true, '0.96 0.83 0.54');
        $this->y -= 6;
        $this->rule();
        $this->y -= 12;
    }

    public function heading(string $text): void
    {
        $this->ensure(26);
        $this->y -= 6;
        $this->write($text, 13, true, '0.79 0.66 0.30');
        $this->y -= 2;
    }

    public function line(string $text, bool $bold = false): void
    {
        // Wrap long lines to stay inside the right margin (~95 chars at 10.5pt).
        $wrapped = wordwrap($text, 95, "\n", true);
        foreach (explode("\n", $wrapped) as $chunk) {
            $this->ensure(15);
            $this->write($chunk, 10.5, $bold, '0.12 0.12 0.12');
        }
    }

    public function spacer(float $h = 8.0): void
    {
        $this->y -= $h;
    }

    /** Assemble the final PDF byte string. */
    public function output(): string
    {
        $this->flushPage();
        if (empty($this->pages)) {
            $this->pages[] = '';
        }

        $objects = [];
        // Reserve: 1 = Catalog, 2 = Pages, 3 = F1, 4 = F2. Pages start at 5.
        $pageCount = count($this->pages);
        $pageObjIds = [];
        $contentObjIds = [];
        $next = 5;
        foreach ($this->pages as $_) {
            $pageObjIds[] = $next++;
            $contentObjIds[] = $next++;
        }

        $kids = implode(' ', array_map(static fn(int $id): string => "$id 0 R", $pageObjIds));

        $objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
        $objects[2] = "<< /Type /Pages /Kids [$kids] /Count $pageCount /MediaBox [0 0 {$this->w} {$this->h}]"
            . " /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> >>";
        $objects[3] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>";
        $objects[4] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>";

        foreach ($this->pages as $i => $stream) {
            $pid = $pageObjIds[$i];
            $cid = $contentObjIds[$i];
            $objects[$pid] = "<< /Type /Page /Parent 2 0 R /Contents $cid 0 R >>";
            $len = strlen($stream);
            $objects[$cid] = "<< /Length $len >>\nstream\n$stream\nendstream";
        }

        ksort($objects);
        $pdf = "%PDF-1.4\n";
        $offsets = [];
        foreach ($objects as $id => $body) {
            $offsets[$id] = strlen($pdf);
            $pdf .= "$id 0 obj\n$body\nendobj\n";
        }

        $xrefPos = strlen($pdf);
        $count = count($objects) + 1;
        $pdf .= "xref\n0 $count\n0000000000 65535 f \n";
        for ($id = 1; $id < $count; $id++) {
            $pdf .= sprintf("%010d 00000 n \n", $offsets[$id] ?? 0);
        }
        $pdf .= "trailer\n<< /Size $count /Root 1 0 R >>\nstartxref\n$xrefPos\n%%EOF";

        return $pdf;
    }
}
