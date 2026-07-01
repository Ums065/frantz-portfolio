<?php
declare(strict_types=1);

/* ============================================================
   Branded HTML email layout + body builders.
   Each builder returns ['subject','html','text'] for a multipart
   (HTML + plaintext) message. The logo is embedded as an inline
   CID image (see email_inline_logo + queue_themed_mail) so it
   renders in every client without a public URL.
   Theme mirrors the site: deep black with a warm gold accent.
   ============================================================ */

const EMAIL_LOGO_CID = 'fc-logo';

/** Brand palette + display name used across all emails. */
function email_brand(): array
{
    $base = storefront_public_base_url();
    return [
        'name'      => mail_from_name() !== '' ? mail_from_name() : 'FrantzCoutard',
        'site'      => $base,
        'bg'        => '#08080A',
        'card'      => '#15130D',
        'panel'     => '#1C1A12',
        'gold'      => '#C9A84C',
        'goldLight' => '#F5D48A',
        'ink'       => '#F3EEE4',
        'muted'     => '#A29B8A',
        'border'    => '#2E2A1E',
    ];
}

/** Read the site logo and return it as an inline-image attachment (cid:fc-logo). */
function email_inline_logo(): ?array
{
    static $cached = null;
    static $done = false;
    if ($done) {
        return $cached;
    }
    $done = true;

    $path = dirname(__DIR__) . '/frontend/public/assets/fc-logo.webp';
    if (!is_file($path)) {
        $path = dirname(__DIR__) . '/frontend/dist/assets/fc-logo.webp';
    }
    if (!is_file($path)) {
        return $cached = null;
    }

    // Prefer PNG for the widest email-client support; fall back to raw webp.
    $mime = 'image/webp';
    $data = (string) @file_get_contents($path);
    if ($data === '') {
        return $cached = null;
    }
    if (function_exists('imagecreatefromwebp') && function_exists('imagepng')) {
        $img = @imagecreatefromwebp($path);
        if ($img !== false) {
            // Downscale to a lightweight email size (max 128px, retina for a 64px slot).
            $max = 128;
            $w = imagesx($img);
            $h = imagesy($img);
            if ($w > $max || $h > $max) {
                $scale = $max / max($w, $h);
                $nw = max(1, (int) round($w * $scale));
                $nh = max(1, (int) round($h * $scale));
                $resized = imagecreatetruecolor($nw, $nh);
                imagealphablending($resized, false);
                imagesavealpha($resized, true);
                imagefill($resized, 0, 0, imagecolorallocatealpha($resized, 0, 0, 0, 127));
                imagecopyresampled($resized, $img, 0, 0, 0, 0, $nw, $nh, $w, $h);
                imagedestroy($img);
                $img = $resized;
            }
            imagealphablending($img, false);
            imagesavealpha($img, true);
            ob_start();
            imagepng($img, null, 9);
            $png = (string) ob_get_clean();
            imagedestroy($img);
            if ($png !== '') {
                $mime = 'image/png';
                $data = $png;
            }
        }
    }

    return $cached = [
        'cid'      => EMAIL_LOGO_CID,
        'inline'   => true,
        'filename' => 'logo.' . ($mime === 'image/png' ? 'png' : 'webp'),
        'mime'     => $mime,
        'data'     => $data,
    ];
}

/** Escape a value for safe HTML output. */
function email_e(string $value): string
{
    return htmlspecialchars($value, ENT_QUOTES, 'UTF-8');
}

/** Wrap inner content in the full branded HTML document. */
function email_layout(string $heading, string $bodyHtml, string $preheader = ''): string
{
    $b = email_brand();
    $year = date('Y');
    $siteLabel = preg_replace('#^https?://#', '', $b['site']);

    return '<!doctype html><html lang="en"><head><meta charset="utf-8">'
        . '<meta name="viewport" content="width=device-width,initial-scale=1">'
        . '<meta name="color-scheme" content="dark"><meta name="supported-color-schemes" content="dark"></head>'
        . '<body style="margin:0;padding:0;background:' . $b['bg'] . ';-webkit-font-smoothing:antialiased;">'
        . ($preheader !== ''
            ? '<div style="display:none!important;max-height:0;overflow:hidden;opacity:0;color:' . $b['bg'] . ';">' . email_e($preheader) . '</div>'
            : '')
        . '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:' . $b['bg'] . ';padding:32px 12px;">'
        . '<tr><td align="center">'
        . '<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:' . $b['card'] . ';border:1px solid ' . $b['border'] . ';border-radius:18px;overflow:hidden;box-shadow:0 18px 50px rgba(0,0,0,0.55);">'
        // Gold accent strip
        . '<tr><td style="height:4px;line-height:4px;font-size:0;background:linear-gradient(90deg,#8A6A2F,#F5D48A,#C9A84C,#8A6A2F);">&nbsp;</td></tr>'
        // Header
        . '<tr><td style="background:linear-gradient(180deg,' . $b['panel'] . ',' . $b['card'] . ');padding:34px 32px 24px;text-align:center;">'
        . '<img src="cid:' . EMAIL_LOGO_CID . '" width="64" height="64" alt="' . email_e($b['name']) . '" style="display:inline-block;border:0;outline:none;width:64px;height:64px;border-radius:14px;">'
        . '<div style="margin-top:12px;font-family:Georgia,\'Times New Roman\',serif;font-size:22px;letter-spacing:1.5px;color:' . $b['goldLight'] . ';font-weight:700;">' . email_e($b['name']) . '</div>'
        . '<div style="margin:14px auto 0;width:64px;height:2px;background:linear-gradient(90deg,transparent,' . $b['gold'] . ',transparent);"></div>'
        . '</td></tr>'
        // Body
        . '<tr><td style="padding:34px 34px 26px;font-family:-apple-system,Segoe UI,Arial,Helvetica,sans-serif;color:' . $b['ink'] . ';">'
        . '<h1 style="margin:0 0 20px;font-family:Georgia,\'Times New Roman\',serif;font-size:24px;line-height:1.3;color:' . $b['goldLight'] . ';font-weight:700;">' . email_e($heading) . '</h1>'
        . $bodyHtml
        . '</td></tr>'
        // Footer
        . '<tr><td style="padding:22px 34px 28px;border-top:1px solid ' . $b['border'] . ';background:' . $b['panel'] . ';font-family:-apple-system,Segoe UI,Arial,Helvetica,sans-serif;font-size:12px;line-height:1.7;color:' . $b['muted'] . ';text-align:center;">'
        . 'This is an automated message from ' . email_e($b['name']) . '.<br>'
        . '<a href="' . email_e($b['site']) . '" style="color:' . $b['gold'] . ';text-decoration:none;font-weight:600;">' . email_e((string) $siteLabel) . '</a>'
        . ' &nbsp;&middot;&nbsp; &copy; ' . $year . ' ' . email_e($b['name'])
        . '</td></tr>'
        . '</table></td></tr></table></body></html>';
}

/** One body paragraph. */
function email_paragraph(string $text): string
{
    $b = email_brand();
    return '<p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:' . $b['ink'] . ';">' . nl2br(email_e($text)) . '</p>';
}

/** A gold call-to-action button. */
function email_button(string $label, string $url): string
{
    return '<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 22px;"><tr>'
        . '<td align="center" style="border-radius:12px;background:linear-gradient(180deg,#F6E2A8 0%,#EBC96B 45%,#C9A84C 100%);">'
        . '<a href="' . email_e($url) . '" style="display:inline-block;padding:14px 30px;font-family:-apple-system,Segoe UI,Arial,sans-serif;font-size:15px;font-weight:700;letter-spacing:0.3px;color:#14110A;text-decoration:none;border-radius:12px;">' . email_e($label) . '</a>'
        . '</td></tr></table>';
}

/** A definition table of label => value rows. */
function email_details(array $pairs): string
{
    $b = email_brand();
    $rows = '';
    $i = 0;
    foreach ($pairs as $label => $value) {
        if ($value === null || $value === '') {
            continue;
        }
        $bg = ($i % 2 === 0) ? $b['card'] : $b['panel'];
        $rows .= '<tr>'
            . '<td style="padding:11px 14px;background:' . $bg . ';font-size:11px;letter-spacing:0.6px;text-transform:uppercase;color:' . $b['gold'] . ';white-space:nowrap;vertical-align:top;border-bottom:1px solid ' . $b['border'] . ';">' . email_e((string) $label) . '</td>'
            . '<td style="padding:11px 14px;background:' . $bg . ';font-size:14px;color:' . $b['ink'] . ';border-bottom:1px solid ' . $b['border'] . ';">' . nl2br(email_e((string) $value)) . '</td>'
            . '</tr>';
        $i++;
    }
    if ($rows === '') {
        return '';
    }
    return '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:6px 0 22px;border:1px solid ' . $b['border'] . ';border-radius:12px;overflow:hidden;">' . $rows . '</table>';
}

/** A small muted note line. */
function email_note(string $text): string
{
    $b = email_brand();
    return '<p style="margin:0 0 10px;font-size:13px;line-height:1.6;color:' . $b['muted'] . ';">' . nl2br(email_e($text)) . '</p>';
}

/** A highlighted callout box (e.g. for a code or key fact). */
function email_callout(string $text): string
{
    $b = email_brand();
    return '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:4px 0 20px;"><tr>'
        . '<td style="padding:16px 18px;background:' . $b['panel'] . ';border-left:3px solid ' . $b['gold'] . ';border-radius:8px;font-size:15px;line-height:1.6;color:' . $b['ink'] . ';">' . nl2br(email_e($text)) . '</td>'
        . '</tr></table>';
}

/** Build a plaintext fallback from an ordered list of lines. */
function email_text(array $lines): string
{
    return implode("\n", $lines);
}

/* ---------------- Transactional email builders ---------------- */

function email_password_reset(string $name, string $link): array
{
    $safe = trim($name) !== '' ? trim($name) : 'there';
    $html = email_paragraph('Hi ' . $safe . ',')
        . email_paragraph('We received a request to reset the password for your account. Click the button below to choose a new password.')
        . email_button('Reset My Password', $link)
        . email_note('This link expires in 60 minutes and can be used only once.')
        . email_note('If you did not request this, you can safely ignore this email — your password will not change.');
    $text = email_text([
        'Hi ' . $safe . ',',
        '',
        'We received a request to reset the password for your account.',
        'Open this link to choose a new password:',
        $link,
        '',
        'This link expires in 60 minutes and can be used only once.',
        'If you did not request this, you can safely ignore this email.',
        '',
        'Thanks,',
        mail_from_name(),
    ]);
    return ['subject' => 'Reset your password', 'html' => email_layout('Reset Your Password', $html, 'Reset your password'), 'text' => $text];
}

function email_account_approved(string $name, string $role): array
{
    $safe = trim($name) !== '' ? trim($name) : 'there';
    $roleLabel = $role !== '' ? ucfirst($role) : 'account';
    $link = storefront_public_base_url() . '/';
    $html = email_paragraph('Hi ' . $safe . ',')
        . email_paragraph('Great news — your ' . $roleLabel . ' account has been approved. You now have full access. Sign in to get started.')
        . email_button('Sign In', $link);
    $text = email_text([
        'Hi ' . $safe . ',',
        '',
        'Your ' . $roleLabel . ' account has been approved. You now have full access.',
        'Sign in: ' . $link,
        '',
        'Thanks,',
        mail_from_name(),
    ]);
    return ['subject' => 'Your account has been approved', 'html' => email_layout('Account Approved', $html, 'Your account is now active'), 'text' => $text];
}

function email_account_rejected(string $name, string $role, string $note): array
{
    $safe = trim($name) !== '' ? trim($name) : 'there';
    $roleLabel = $role !== '' ? ucfirst($role) : 'account';
    $html = email_paragraph('Hi ' . $safe . ',')
        . email_paragraph('We\'ve reviewed your ' . $roleLabel . ' account request and are unable to approve it at this time.')
        . ($note !== '' ? email_callout('Reason: ' . $note) : '')
        . email_note('If you believe this was a mistake, please reply to this email or contact the administrator.');
    $text = email_text([
        'Hi ' . $safe . ',',
        '',
        'We\'ve reviewed your ' . $roleLabel . ' account request and are unable to approve it at this time.',
        $note !== '' ? 'Reason: ' . $note : '',
        '',
        'If you believe this was a mistake, please contact the administrator.',
        '',
        'Thanks,',
        mail_from_name(),
    ]);
    return ['subject' => 'Update on your account request', 'html' => email_layout('Account Update', $html, 'About your account request'), 'text' => $text];
}

/** Generic branded wrapper for the admin team notifications (plain text in → themed out). */
function email_admin_notification(string $subject, string $bodyText): array
{
    $lines = preg_split('/\r\n|\r|\n/', trim($bodyText)) ?: [];
    $htmlBody = '';
    foreach ($lines as $line) {
        $htmlBody .= $line === ''
            ? '<div style="height:8px;line-height:8px;font-size:0;">&nbsp;</div>'
            : email_paragraph($line);
    }
    if ($htmlBody === '') {
        $htmlBody = email_paragraph('(no details)');
    }
    return [
        'subject' => $subject,
        'html' => email_layout($subject, $htmlBody, $subject),
        'text' => $bodyText,
    ];
}
