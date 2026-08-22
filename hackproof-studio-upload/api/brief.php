<?php
/**
 * HackProof Studio — brief endpoint.
 *
 * Receives one brief as JSON from js/hp-offline.js and emails it to the studio.
 *
 * The status codes matter. js/hp-offline.js treats them as instructions:
 *   2xx            delivered, remove from the offline queue
 *   4xx (not 429)  rejected for good, remove from the queue
 *   429 / 5xx      transient, KEEP it queued and try again later
 * So never return 4xx for something that might succeed on a retry, or a real
 * brief is thrown away.
 */

declare(strict_types=1);

// A PHP fatal would otherwise emit an HTML error page with HTTP 200 — and the
// client reads 2xx as "delivered" and deletes the brief from its offline queue.
// A crash must always surface as 5xx so the brief is retried, never discarded.
ini_set("display_errors", "0");
register_shutdown_function(static function (): void {
    $e = error_get_last();
    if ($e === null || !in_array($e["type"], [E_ERROR, E_PARSE, E_CORE_ERROR, E_COMPILE_ERROR], true)) {
        return;
    }
    error_log("[hackproof-brief] fatal: " . $e["message"] . " @ " . $e["file"] . ":" . $e["line"]);
    if (!headers_sent()) {
        http_response_code(500);
        header("Content-Type: application/json; charset=utf-8");
    }
    echo json_encode(["ok" => false, "error" => "server-error"]);
});

// ---------------------------------------------------------------- config
const MAIL_TO       = 'info@hackproofwp.com';
const MAIL_SUBJECT  = 'New brief — HackProof Studio';
// Must be a mailbox on your own domain or the mail is likely to be rejected
// or spam-filed. Never put the visitor's address here; it goes in Reply-To.
const MAIL_FROM     = 'no-reply@hackproofwp.com';
const MAIL_FROM_NAME = 'HackProof Studio';

// reCAPTCHA v3. Paste the secret key here when you have it; leave it empty and
// verification is skipped so the form keeps working in the meantime.
const RECAPTCHA_SECRET    = '6LdgpZItAAAAAHWOtrx9jGIElXRQeGQ-Mc6Oaxoq';
const RECAPTCHA_MIN_SCORE = 0.5;   // 0.0 = almost certainly a bot, 1.0 = almost certainly human

// Origins allowed to POST here.
const ALLOWED_ORIGINS = [
    'https://hackproofwp.com',
    'https://www.hackproofwp.com',
];

// Writable directory for the dedupe log and rate limiter. Keep it OUTSIDE the
// web root if you can; if you cannot, the .htaccess beside this file blocks it.
const STATE_DIR = __DIR__ . '/.state';

const MAX_BODY_BYTES  = 64 * 1024;  // a brief is ~2KB; anything near this is abuse
const RATE_LIMIT_MAX  = 5;          // submissions per IP
const RATE_LIMIT_WINDOW = 600;      // per 10 minutes
const DEDUPE_TTL      = 7 * 86400;  // remember a briefId for a week

// ---------------------------------------------------------------- helpers
function respond(int $code, array $body): void
{
    http_response_code($code);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($body, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    exit;
}

/** Strip CR/LF so nothing can inject extra mail headers. */
function headerSafe(string $v): string
{
    return trim(str_replace(["\r", "\n", "\0"], ' ', $v));
}

/** mb_substr is not available on every host; truncate safely either way. */
function strCut(string $v, int $max): string
{
    if (function_exists("mb_substr")) {
        return mb_substr($v, 0, $max, "UTF-8");
    }
    if (strlen($v) <= $max) {
        return $v;
    }
    $cut = substr($v, 0, $max);
    // Do not leave half a multi-byte character on the end.
    while ($cut !== "" && (ord($cut[strlen($cut) - 1]) & 0xC0) === 0x80) {
        $cut = substr($cut, 0, -1);
    }
    if ($cut !== "" && (ord($cut[strlen($cut) - 1]) & 0xC0) === 0xC0) {
        $cut = substr($cut, 0, -1);
    }
    return $cut;
}

function clean($v, int $max = 2000): string
{
    if (is_array($v)) {
        $v = implode(', ', array_map(static fn($x) => is_scalar($x) ? (string) $x : '', $v));
    }
    if (!is_scalar($v)) {
        return '';
    }
    $v = (string) $v;
    // Drop control characters but keep newlines inside the summary.
    $v = preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/u', '', $v) ?? '';
    return strCut(trim($v), $max);
}

function clientIp(): string
{
    // Only trust a proxy header if you actually sit behind that proxy.
    foreach (['HTTP_CF_CONNECTING_IP', 'HTTP_X_REAL_IP'] as $k) {
        if (!empty($_SERVER[$k]) && filter_var($_SERVER[$k], FILTER_VALIDATE_IP)) {
            return $_SERVER[$k];
        }
    }
    return $_SERVER['REMOTE_ADDR'] ?? '0.0.0.0';
}

function stateDir(): ?string
{
    if (!is_dir(STATE_DIR) && !@mkdir(STATE_DIR, 0700, true) && !is_dir(STATE_DIR)) {
        return null;
    }
    return STATE_DIR;
}

/** True when this briefId has already been delivered. */
function alreadySeen(string $id): bool
{
    $dir = stateDir();
    if ($dir === null || $id === '') {
        return false;
    }
    $f = $dir . '/seen-' . hash('sha256', $id) . '.txt';
    if (is_file($f) && (time() - (int) filemtime($f)) < DEDUPE_TTL) {
        return true;
    }
    return false;
}

function markSeen(string $id): void
{
    $dir = stateDir();
    if ($dir === null || $id === '') {
        return;
    }
    @file_put_contents($dir . '/seen-' . hash('sha256', $id) . '.txt', (string) time(), LOCK_EX);
    // Opportunistic cleanup so the directory does not grow without bound.
    if (random_int(1, 50) === 1) {
        foreach (glob($dir . '/seen-*.txt') ?: [] as $old) {
            if ((time() - (int) filemtime($old)) > DEDUPE_TTL) {
                @unlink($old);
            }
        }
    }
}

/** Returns false when this IP has exceeded the window. */
function rateLimitOk(string $ip): bool
{
    $dir = stateDir();
    if ($dir === null) {
        return true; // cannot track; do not lock people out
    }
    $f = $dir . '/rate-' . hash('sha256', $ip) . '.json';
    $now = time();
    $hits = [];
    if (is_file($f)) {
        $raw = @file_get_contents($f);
        $decoded = $raw ? json_decode($raw, true) : null;
        if (is_array($decoded)) {
            $hits = array_values(array_filter(
                $decoded,
                static fn($t) => is_int($t) && ($now - $t) < RATE_LIMIT_WINDOW
            ));
        }
    }
    if (count($hits) >= RATE_LIMIT_MAX) {
        return false;
    }
    $hits[] = $now;
    @file_put_contents($f, json_encode($hits), LOCK_EX);
    return true;
}

/**
 * reCAPTCHA v3. Returns [ok, score, reason].
 * A token is only valid for two minutes, which matters here — see verifyDecision().
 */
function verifyRecaptcha(string $token, string $ip): array
{
    if (RECAPTCHA_SECRET === '') {
        return [true, null, 'not-configured'];
    }
    if ($token === '') {
        return [false, null, 'missing-token'];
    }
    $post = http_build_query([
        'secret'   => RECAPTCHA_SECRET,
        'response' => $token,
        'remoteip' => $ip,
    ]);

    $raw = false;
    if (function_exists('curl_init')) {
        $ch = curl_init('https://www.google.com/recaptcha/api/siteverify');
        curl_setopt_array($ch, [
            CURLOPT_POST           => true,
            CURLOPT_POSTFIELDS     => $post,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT        => 8,
            CURLOPT_SSL_VERIFYPEER => true,
        ]);
        $raw = curl_exec($ch);
        curl_close($ch);
    } else {
        $ctx = stream_context_create(['http' => [
            'method'  => 'POST',
            'header'  => "Content-Type: application/x-www-form-urlencoded\r\n",
            'content' => $post,
            'timeout' => 8,
        ]]);
        $raw = @file_get_contents('https://www.google.com/recaptcha/api/siteverify', false, $ctx);
    }

    if ($raw === false) {
        // Google unreachable. Not the visitor's fault — treat as transient.
        return [false, null, 'verify-unreachable'];
    }
    $data = json_decode((string) $raw, true);
    if (!is_array($data)) {
        return [false, null, 'verify-bad-response'];
    }
    if (empty($data['success'])) {
        $codes = implode(',', (array) ($data['error-codes'] ?? []));
        return [false, null, $codes !== '' ? $codes : 'verify-failed'];
    }
    $score = isset($data['score']) ? (float) $data['score'] : null;
    if ($score !== null && $score < RECAPTCHA_MIN_SCORE) {
        return [false, $score, 'low-score'];
    }
    return [true, $score, 'ok'];
}

// ---------------------------------------------------------------- CORS
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
if ($origin !== '' && in_array($origin, ALLOWED_ORIGINS, true)) {
    header('Access-Control-Allow-Origin: ' . $origin);
    header('Vary: Origin');
}
header('Access-Control-Allow-Headers: Content-Type');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('X-Content-Type-Options: nosniff');

if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
    http_response_code(204);
    exit;
}
if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
    respond(405, ['ok' => false, 'error' => 'method-not-allowed']);
}

// ---------------------------------------------------------------- read body
$raw = file_get_contents('php://input');
if ($raw === false || $raw === '') {
    respond(400, ['ok' => false, 'error' => 'empty-body']);
}
if (strlen($raw) > MAX_BODY_BYTES) {
    respond(413, ['ok' => false, 'error' => 'too-large']);
}
$in = json_decode($raw, true, 8);
if (!is_array($in)) {
    respond(400, ['ok' => false, 'error' => 'bad-json']);
}

// Honeypot: a real visitor never fills this. Answer 200 so a bot cannot tell
// it was caught, but send nothing.
if (!empty($in['company_website'])) {
    respond(200, ['ok' => true]);
}

$briefId = clean($in['briefId'] ?? '', 64);
$ip      = clientIp();

// Already delivered — the offline queue retried after the mail had gone out.
if ($briefId !== '' && alreadySeen($briefId)) {
    respond(200, ['ok' => true, 'duplicate' => true]);
}

if (!rateLimitOk($ip)) {
    // 429 keeps it in the queue so a genuine burst is not discarded.
    respond(429, ['ok' => false, 'error' => 'rate-limited']);
}

// ---------------------------------------------------------------- validate
$name  = clean($in['name'] ?? '', 120);
$email = clean($in['email'] ?? '', 190);
if ($name === '' || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
    respond(400, ['ok' => false, 'error' => 'name-and-valid-email-required']);
}

// ---------------------------------------------------------------- captcha
// A brief queued offline is delivered when the connection returns, which may be
// hours later — long after a v3 token has expired. Rejecting on an expired
// token would silently bin the exact leads this queue exists to protect. So an
// old brief is accepted and flagged in the subject line instead of dropped.
$submittedAt = strtotime((string) ($in['submittedAt'] ?? '')) ?: time();
$isDelayed   = (time() - $submittedAt) > 120;

[$capOk, $capScore, $capReason] = verifyRecaptcha(clean($in['recaptchaToken'] ?? '', 4000), $ip);

if (!$capOk) {
    if ($capReason === 'verify-unreachable' || $capReason === 'verify-bad-response') {
        // Google is down. Transient: keep it queued and try again.
        respond(503, ['ok' => false, 'error' => 'captcha-unavailable']);
    }
    if (!$isDelayed) {
        respond(400, ['ok' => false, 'error' => 'captcha-failed', 'reason' => $capReason]);
    }
    // Delayed submission with a stale token: deliver it, clearly marked.
}
$capNote = $capOk
    ? ($capScore === null ? 'skipped (no secret configured)' : 'passed, score ' . $capScore)
    : 'NOT VERIFIED (' . $capReason . ', token expired while queued offline)';

// ---------------------------------------------------------------- compose
$urgent  = !empty($in['urgent']);
$fields = [
    'Name'            => $name,
    'Email'           => $email,
    'Company'         => clean($in['company'] ?? '', 190),
    'Website'         => clean($in['url'] ?? '', 300),
    'Looking for'     => clean($in['create'] ?? '', 190),
    'Needs attention' => clean($in['changes'] ?? '', 600),
    'Timing'          => clean($in['when'] ?? '', 120),
    'Preferred start' => clean($in['startdate'] ?? '', 40),
    'Budget'          => clean($in['budget'] ?? '', 80),
    'Summary'         => clean($in['summary'] ?? '', 4000),
];

$lines = [];
foreach ($fields as $label => $value) {
    $lines[] = str_pad($label, 17) . ': ' . ($value !== '' ? $value : '—');
}

$body = implode("\n", [
    $urgent ? '*** MARKED URGENT ***' . "\n" : '',
    implode("\n", $lines),
    '',
    str_repeat('-', 58),
    'Submitted   : ' . gmdate('Y-m-d H:i:s', $submittedAt) . ' UTC',
    'Delivered   : ' . gmdate('Y-m-d H:i:s') . ' UTC',
    $isDelayed ? 'NOTE        : queued offline and delivered on reconnect' : '',
    'reCAPTCHA   : ' . $capNote,
    'IP          : ' . $ip,
    'Brief ID    : ' . ($briefId !== '' ? $briefId : '—'),
]);

$subject = MAIL_SUBJECT;
if ($urgent)   { $subject = '[URGENT] ' . $subject; }
if (!$capOk)   { $subject = '[UNVERIFIED] ' . $subject; }
$subject .= ' — ' . headerSafe($name);

$headers = implode("\r\n", [
    'From: ' . headerSafe(MAIL_FROM_NAME) . ' <' . headerSafe(MAIL_FROM) . '>',
    'Reply-To: ' . headerSafe($name) . ' <' . headerSafe($email) . '>',
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: 8bit',
    'X-Mailer: HackProof Brief Endpoint',
]);

$sent = @mail(
    MAIL_TO,
    '=?UTF-8?B?' . base64_encode($subject) . '?=',
    $body,
    $headers,
    '-f' . MAIL_FROM
);

if (!$sent) {
    // Mail failed. 5xx so the brief stays queued and is retried rather than lost.
    error_log('[hackproof-brief] mail() failed for ' . $email);
    respond(500, ['ok' => false, 'error' => 'mail-failed']);
}

if ($briefId !== '') {
    markSeen($briefId);
}

respond(200, ['ok' => true]);
