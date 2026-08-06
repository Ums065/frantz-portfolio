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
        'tagline'   => 'Leave It Better Than You Found It',
        'site'      => $base,
        'bg'        => '#070708',
        'bg2'       => '#0E0D0A',
        'card'      => '#141209',
        'panel'     => '#1B1810',
        'panel2'    => '#211D12',
        'gold'      => '#C9A84C',
        'goldLight' => '#F5D48A',
        'ink'       => '#F5F1E8',
        'muted'     => '#9E9682',
        'border'    => '#2C271A',
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
function email_layout(string $heading, string $bodyHtml, string $preheader = '', string $eyebrow = ''): string
{
    $b = email_brand();
    $year = date('Y');
    $siteLabel = preg_replace('#^https?://#', '', $b['site']);
    $sans = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
    $serif = "Georgia,'Times New Roman',serif";

    return '<!doctype html><html lang="en"><head><meta charset="utf-8">'
        . '<meta name="viewport" content="width=device-width,initial-scale=1">'
        . '<meta name="x-apple-disable-message-reformatting">'
        . '<meta name="color-scheme" content="dark"><meta name="supported-color-schemes" content="dark">'
        . '<!--[if mso]><style>body,table,td,a{font-family:Arial,Helvetica,sans-serif!important}</style><![endif]-->'
        . '</head>'
        . '<body style="margin:0;padding:0;background:' . $b['bg'] . ';-webkit-font-smoothing:antialiased;">'
        . ($preheader !== ''
            ? '<div style="display:none!important;max-height:0;overflow:hidden;opacity:0;color:' . $b['bg'] . ';mso-hide:all;">' . email_e($preheader) . '&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;</div>'
            : '')
        . '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="' . $b['bg'] . '" style="background:' . $b['bg'] . ';background-image:radial-gradient(1000px 400px at 50% -160px,rgba(201,168,76,0.10),transparent 70%);padding:36px 12px;">'
        . '<tr><td align="center">'
        // Tiny brand kicker above the card
        . '<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;"><tr><td style="padding:0 6px 14px;text-align:center;font-family:' . $sans . ';font-size:11px;letter-spacing:3px;text-transform:uppercase;color:' . $b['muted'] . ';">' . email_e($b['name']) . '</td></tr></table>'
        . '<table role="presentation" width="600" cellpadding="0" cellspacing="0" bgcolor="' . $b['card'] . '" style="max-width:600px;width:100%;background:' . $b['card'] . ';border:1px solid ' . $b['border'] . ';border-radius:20px;overflow:hidden;box-shadow:0 20px 55px rgba(0,0,0,0.6);">'
        // Gold accent strip
        . '<tr><td bgcolor="' . $b['gold'] . '" style="height:4px;line-height:4px;font-size:0;background:linear-gradient(90deg,#6E521F,#F5D48A,#C9A84C,#6E521F);">&nbsp;</td></tr>'
        // Header — logo in a gold-ringed badge + brand + tagline
        . '<tr><td style="background:linear-gradient(180deg,' . $b['panel2'] . ',' . $b['card'] . ');padding:38px 32px 26px;text-align:center;">'
        . '<table role="presentation" cellpadding="0" cellspacing="0" align="center"><tr><td style="border-radius:50%;border:2px solid ' . $b['gold'] . ';padding:8px;background:' . $b['bg2'] . ';">'
        . '<img src="cid:' . EMAIL_LOGO_CID . '" width="60" height="60" alt="' . email_e($b['name']) . '" style="display:block;border:0;outline:none;width:60px;height:60px;border-radius:50%;">'
        . '</td></tr></table>'
        . '<div style="margin-top:16px;font-family:' . $serif . ';font-size:23px;letter-spacing:1px;color:' . $b['goldLight'] . ';font-weight:700;">' . email_e($b['name']) . '</div>'
        . '<div style="margin-top:6px;font-family:' . $sans . ';font-size:11px;letter-spacing:2px;text-transform:uppercase;color:' . $b['muted'] . ';">' . email_e($b['tagline']) . '</div>'
        . '<div style="margin:18px auto 0;width:56px;height:2px;background:linear-gradient(90deg,transparent,' . $b['gold'] . ',transparent);"></div>'
        . '</td></tr>'
        // Body
        . '<tr><td style="padding:36px 36px 28px;font-family:' . $sans . ';color:' . $b['ink'] . ';">'
        . ($eyebrow !== ''
            ? '<div style="margin:0 0 10px;font-family:' . $sans . ';font-size:11px;letter-spacing:2px;text-transform:uppercase;color:' . $b['gold'] . ';font-weight:700;">' . email_e($eyebrow) . '</div>'
            : '')
        . '<h1 style="margin:0 0 20px;font-family:' . $serif . ';font-size:26px;line-height:1.3;color:' . $b['goldLight'] . ';font-weight:700;">' . email_e($heading) . '</h1>'
        . $bodyHtml
        . '</td></tr>'
        // Footer
        . '<tr><td style="padding:24px 34px 30px;border-top:1px solid ' . $b['border'] . ';background:' . $b['panel'] . ';font-family:' . $sans . ';font-size:12px;line-height:1.8;color:' . $b['muted'] . ';text-align:center;">'
        . '<a href="' . email_e($b['site']) . '" style="color:' . $b['goldLight'] . ';text-decoration:none;font-weight:700;font-size:13px;letter-spacing:0.4px;">' . email_e((string) $siteLabel) . '</a>'
        . '<div style="margin:10px auto;width:40px;height:1px;background:' . $b['border'] . ';"></div>'
        . 'This is an automated message — no need to reply.<br>'
        . '&copy; ' . $year . ' ' . email_e($b['name']) . ' &nbsp;&middot;&nbsp; ' . email_e($b['tagline'])
        . '</td></tr>'
        . '</table>'
        // sign-off under card
        . '<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;"><tr><td style="padding:16px 6px 0;text-align:center;font-family:' . $sans . ';font-size:11px;line-height:1.6;color:' . $b['muted'] . ';opacity:.8;">Sent with care by the ' . email_e($b['name']) . ' team.</td></tr></table>'
        . '</td></tr></table></body></html>';
}

/** One body paragraph. */
function email_paragraph(string $text): string
{
    $b = email_brand();
    return '<p style="margin:0 0 16px;font-size:15px;line-height:1.7;color:' . $b['ink'] . ';">' . nl2br(email_e($text)) . '</p>';
}

/** A gold call-to-action button (solid bgcolor fallback for Outlook + gradient). */
function email_button(string $label, string $url): string
{
    return '<table role="presentation" cellpadding="0" cellspacing="0" style="margin:10px 0 24px;"><tr>'
        . '<td align="center" bgcolor="#D8BC63" style="border-radius:12px;background:linear-gradient(180deg,#F6E2A8 0%,#EBC96B 45%,#C9A84C 100%);box-shadow:0 8px 22px rgba(201,168,76,0.28);">'
        . '<a href="' . email_e($url) . '" style="display:inline-block;padding:15px 34px;font-family:-apple-system,Segoe UI,Arial,sans-serif;font-size:15px;font-weight:700;letter-spacing:0.3px;color:#14110A;text-decoration:none;border-radius:12px;">' . email_e($label) . ' &nbsp;&rarr;</a>'
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

/** A large, centered one-time code display. */
function email_code(string $code): string
{
    $b = email_brand();
    return '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:6px 0 22px;"><tr>'
        . '<td align="center" bgcolor="' . $b['panel2'] . '" style="padding:22px;background:' . $b['panel2'] . ';border:1px solid ' . $b['border'] . ';border-radius:14px;">'
        . '<div style="font-family:-apple-system,Segoe UI,Arial,sans-serif;font-size:11px;letter-spacing:2px;text-transform:uppercase;color:' . $b['muted'] . ';margin-bottom:10px;">Your verification code</div>'
        . '<div style="font-family:Georgia,\'Times New Roman\',serif;font-size:38px;font-weight:700;letter-spacing:10px;color:' . $b['goldLight'] . ';">' . email_e($code) . '</div>'
        . '</td></tr></table>';
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

function email_verification_code(string $name, string $otp): array
{
    $safe = trim($name) !== '' ? trim($name) : 'there';
    $html = email_paragraph('Hi ' . $safe . ',')
        . email_paragraph('Welcome! Use the code below to verify your email address and activate your account.')
        . email_code($otp)
        . email_note('This code expires shortly. If you didn\'t create an account, you can safely ignore this email.');
    $text = email_text([
        'Hi ' . $safe . ',',
        '',
        'Use this code to verify your email address:',
        $otp,
        '',
        'This code expires shortly. If you didn\'t create an account, ignore this email.',
        '',
        'Thanks,',
        mail_from_name(),
    ]);
    return ['subject' => 'Verify your email address', 'html' => email_layout('Verify Your Email', $html, 'Your verification code', 'Getting started'), 'text' => $text];
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
