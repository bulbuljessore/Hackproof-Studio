# Web Project Playbook

Standing instructions for building and launching a client website. Written from
problems that actually bit on real projects, not from general advice.

**How to use it:** copy this file into a new project folder. If the project has a
`CLAUDE.md`, add one line to it — `Follow WEB-PROJECT-PLAYBOOK.md` — and the
assistant will apply everything below without being asked each time.

Rules are written as **do this** / **never this**, with the reason. The reason is
the important part: without it the rule gets "cleaned up" by someone later and
the bug comes back.

---

## 0. The one habit that matters

**Verify, don't assume. Reproduce before fixing, re-test after fixing.**

Nearly every real bug on the last project was found by testing something that
"obviously worked", and several were found only because a test was re-run *after*
the fix. Specifically:

- Test in a **fresh browser tab**. Console messages accumulate across navigations;
  a stale error from three page loads ago reads as a current failure and sends you
  chasing nothing.
- Check **both** the browser console and the **server log**. A 404 appears in one
  and not always the other.
- **Count before and after.** "Were there new 404s?" is answerable; "are there
  404s?" is not, because the log holds history.
- When a fix "works", ask what *else* the change touched. Renaming files fixed the
  URLs and silently broke a component fetch on the same commit.
- If a test harness reports something odd, suspect the harness first. A synthetic
  `dispatchEvent` did not reach a framework handler and looked like a broken feature.

---

### Do delivery first, not last

**Order matters as much as the work.** On the last project the site was designed,
built, optimised, launched — and only then did anyone find that the contact form
had never delivered a single email. Everything upstream was correct. The one thing
the site existed to do had never once been tested.

Prove the boring path before building the interesting one:

1. **Delivery.** Endpoint reachable, authenticated SMTP configured, a real test
   email received in a real inbox. Day one, before a page is designed.
2. **Observability.** Every fallback reports which branch it took (§6). Write it
   with the code, not while debugging the code at midnight.
3. **Secrets.** Decide where credentials live and confirm the host's actual
   directory layout *before* you need them. Not live on a production server with
   the client waiting.
4. **Then** build the site.

The cost of getting this backwards is not a delay. It is every enquiry submitted
between launch and discovery, and none of them can be recovered.

---

## 1. Pre-launch checklist

Run every line. Any "no" blocks launch.

- [ ] Every URL in `sitemap.xml` returns 200 — not the file path, the **canonical URL**
- [ ] Canonical tag on each page matches the URL that actually serves it
- [ ] `.html` URLs 301 to the clean URL (no page reachable at two addresses)
- [ ] Retired pages 301 somewhere useful, not 404
- [ ] Every page: one `<h1>`, no skipped heading levels, `<html lang>` set
- [ ] Title 50–60 chars, description 150–160, both unique per page
- [ ] Zero horizontal overflow at 320 / 375 / 414 / 768 / 1024 / 1440 / 1920
- [ ] Every tap target ≥ 24×24 CSS px
- [ ] Favicon set complete, iOS icon opaque and square
- [ ] Analytics fires **once** per page load, not twice
- [ ] Form actually delivers — send yourself a real test submission **through the
      form in a browser**, not just a `curl` to the endpoint. A scripted test can
      take a different branch and pass while real visitors fail
- [ ] The success response names the path it took (`via`, `config`) — see §6
- [ ] SPF authorises whatever actually sends the mail (§6). The web server is not
      the mail server
- [ ] Authenticated SMTP configured — not `mail()` (§6)
- [ ] A **low** bot score delivers flagged, never rejects (§6)
- [ ] Spam protection rejects an empty-token POST
- [ ] Archive contains no credentials — read the file back out of the ZIP and check
- [ ] Anything server-only is written down, with what breaks if it is re-uploaded
- [ ] CSP does not break the site (see §8 — this has caused a fully blank site)
- [ ] Zero console errors in a fresh tab on every page
- [ ] Security headers present (check securityheaders.com after deploy)

---

## 2. SEO

**Per page, non-negotiable:**

| Element | Rule |
|---|---|
| `<title>` | 50–60 chars, unique, primary keyword early |
| `<meta description>` | 150–160 chars, unique, reads like a reason to click |
| `<h1>` | exactly one |
| headings | never skip a level (H2 → H4 is a defect) |
| `<html lang>` | always set |
| canonical | self-referencing, absolute, matches the served URL |
| Open Graph | title, description, url, image + `image:width/height/alt` |
| Twitter | `summary_large_image` |
| JSON-LD | one `@graph` per page, `@id`-linked to a site-wide entity |

**Share card:** one 1200×630 image is enough for the whole site.

**Do not add FAQPage schema.** Google retired FAQ rich results in May 2026. It
earns nothing now. Use QAPage only for genuine user-generated Q&A.

**H4–H6 are not a checklist item.** If content doesn't nest that deep, adding them
makes the outline worse. What matters is that nothing skips a level.

**Client-side rendered sites:** check the *rendered* DOM, not just the source. If
headings come from a template, the raw HTML may contain literal `{{ binding }}`.
Googlebot renders JS; simpler crawlers and many SEO tools do not.

**Watch for thin pages that don't look thin.** A portfolio page with 40 projects
in a JS array can render 3 headings and 700 words. The content is there; the
*structure* isn't, so search engines see almost nothing.

**Ship `robots.txt` and `sitemap.xml`.** Do not `Disallow` a page you want
de-indexed — a blocked crawler never reads the `noindex` tag. Blocking and
de-indexing are opposites.

**Submitting the sitemap to Search Console is a manual step.** Nobody does it for you.

---

## 3. Icons and favicons

**The iOS trap.** An apple-touch icon must be a **full-bleed opaque square**:

- iOS does **not** support transparency — transparent pixels render **black**
- iOS applies **its own** squircle mask — pre-rounded corners get rounded twice,
  leaving dark notches

So: no rounded corners, no alpha. Strip the alpha channel outright
(`ffmpeg -pix_fmt rgb24`), don't just make it opaque.

**Full set:**

```
favicon.ico              root, bundling 16/32/48   ← browsers request this by default
favicon-16 / 32.png      rounded corners fine, alpha fine
apple-touch-icon.png     180×180, SQUARE, OPAQUE
icon-192 / 512.png       manifest, purpose "any", rounded fine
icon-maskable-512.png    SQUARE, OPAQUE, logo inside the inner 80% safe circle
site.webmanifest
```

**Never point the manifest's `maskable` entry at a rounded icon.** The launcher
masks it again and you get corner artefacts. Maskable needs its own square file.

**Proof it works:** load a page and confirm the browser stops requesting
`/favicon.ico`. Count 404s before and after — same count means it's being served.

---

## 4. Responsive and accessibility

**Test widths:** 320, 375, 414, 430, 768, 1024, 1366, 1440, 1920, 2560.

An iframe harness at each width tests media queries for real and is far faster
than resizing by hand.

**Measure overflow with `documentElement.scrollWidth`, not element rectangles.**
Marquees and infinite scrollers legitimately extend past the viewport inside
`overflow:hidden`. Element-rect checks report those as overflow. They aren't.

**The usual overflow culprit is a header that doesn't wrap.** A row of
`logo | page-label | MENU | CTA` fits at 430 and breaks at 375 the moment a label
gets longer. Decide which element gives way — hide the label, never the buttons.

**Write the fix into the breakpoint where the layout actually changes, not the one
you happened to be looking at.** A two-column block that stacks at `1023px` needs
its stacked-state fix in the `1023px` block. Put it in the `767px` block and it
looks right on a phone while 768–1023 stays broken — a range nobody thinks to
re-check. Find the query that changes the layout and fix it there.

**Tap targets: 24×24 CSS px minimum.** Grow the hit box without moving the visual:

```css
.small-control { position: relative; }
.small-control::after {
  content: ""; position: absolute; inset: -14px 0;   /* 8px bar → 36px target */
}
```

Padding moves things and breaks the design. A pseudo-element doesn't.

**Full-screen overlays must lock the page behind them** (`document.body.style
.overflow = "hidden"`) and clear it on unmount. A lock that outlives its overlay
freezes the page permanently.

**Decorative duplicates need `aria-hidden="true"`** — animation clones, marquee
repeats. Otherwise screen readers read everything twice.

---

## 5. Analytics and tracking

**Every inline snippet needs a double-execution guard** if the site uses a runtime
that may evaluate head scripts more than once:

```html
<script>
  if (!window.__gaBooted) {
    window.__gaBooted = true;
    gtag('js', new Date());
    gtag('config', 'G-XXXXXXX');
  }
</script>
```

Why it matters:

- **GA:** two `config` calls = every visit counted twice, permanently
- **Hotjar:** its snippet ends in `appendChild()`, which is **not** idempotent —
  unguarded it injects the script twice and records every session twice

`dataLayer = dataLayer || []` and `_hjSettings = {...}` are safe to re-run. The
`config` call and the `appendChild` are not.

**Verify by counting, not by looking:** `config` calls should be exactly 1, Hotjar
script tags exactly 1, and one `/g/collect` request per page load.

**Never cache analytics in a service worker.** Cached trackers replay stale hits.
Let `googletagmanager.com`, `google-analytics.com` and `hotjar.com` fall through
to the network, and leave a comment saying why.

**Offline visits aren't measured.** Unavoidable. Don't try to queue analytics.

**Session recording on a form page captures what people type.** Hotjar masks input
values by default — verify that in the dashboard rather than trusting it, and use
`data-hj-suppress` on anything sensitive.

---

## 6. Forms, spam protection, delivery

### The form must actually send

Check this first, every time. A form that sets `sent: true` and shows a thank-you
screen **while sending nothing** looks completely fine in testing. This has now
been found twice on the same project, on two different forms.

Search the submit handler for an actual `fetch`/`XHR`/`action`. No network call =
every lead so far is gone.

### Status codes are a contract

If the client queues submissions, the server's status code is an **instruction**:

| Code | Client must |
|---|---|
| 2xx | delete from queue — delivered |
| 4xx (not 429) | delete — rejected for good, retrying won't help |
| 429 / 5xx | **keep and retry** — transient |

**Never return 4xx for anything a retry could fix**, or real submissions are
destroyed. Rate limiting returns **429**, not 400, so a genuine burst is queued
rather than binned.

**A PHP fatal must never surface as HTTP 200.** The default error page returns 200
with HTML, the client reads "delivered", and deletes the submission. Force it:

```php
ini_set("display_errors", "0");
register_shutdown_function(function () {
    $e = error_get_last();
    if ($e && in_array($e["type"], [E_ERROR, E_PARSE, E_CORE_ERROR, E_COMPILE_ERROR], true)) {
        if (!headers_sent()) { http_response_code(500); }
        echo json_encode(["ok" => false, "error" => "server-error"]);
    }
});
```

### `mail()` is not delivery

**PHP `mail()` returning `true` means the local sendmail accepted the message.
It says nothing about whether it was delivered.** On shared hosting the relay
routinely discards it afterwards — no error, no bounce, no log line. The form
reports success forever and the client never hears from anyone.

This cost a full launch cycle. Diagnose in this order; each step is one command
and rules out an entire layer:

| Check | How | Healthy answer |
|---|---|---|
| File is there, PHP runs | `curl https://site/api/endpoint.php` | a JSON error, not HTML |
| Rewrites aren't eating it | same request | not a 404 |
| CSP allows the POST | read the live response header | `connect-src` includes `'self'` |
| Mailbox exists | SMTP `RCPT TO:` against the MX, then `QUIT` | `250` |
| SPF covers the sender | `TXT` lookup on the domain | see below |
| Mail actually sends | POST a real submission | it arrives |

**The SPF check is the one everyone skips.** A record like:

```
v=spf1 include:_spf.mail.hostinger.com ~all
```

authorises the host's **mail** servers. `mail()` sends from the **web** server,
which is not in that list. The message fails SPF and is dropped or spam-filed,
and `mail()` has no way to report it.

**Use authenticated SMTP from day one** — not as a fallback, not "if there's
trouble". It relays through the server SPF already authorises, gets DKIM-signed,
and a refusal comes back as a real error instead of silence.

- Keep `mail()` only as a fallback for an unconfigured deploy, so a half-finished
  upload degrades rather than breaks.
- `From` must be the **authenticated mailbox** — not an invented `no-reply@`
  with no mailbox behind it.
- `Reply-To` is the visitor. On a one-mailbox plan, sending from and to the same
  address is fine; replying still reaches the visitor.
- Keep certificate verification **on**. A failure there means the wrong host or a
  broken CA bundle — never a reason to trust whatever answered.
- **Send a real test mail on day one**, not on launch day.

### Make every fallback announce itself

**A 200 that silently delivers nothing is indistinguishable from a 200 that
works.** That ambiguity is what turns a ten-minute fix into six rounds of
guessing, and it is entirely avoidable.

Any endpoint with two code paths must report which one ran:

```php
respond(200, ['ok' => true, 'via' => $via, 'config' => $found ? 'file' : 'inline']);
```

`{"ok":true,"via":"smtp","config":"inline"}` answers in a single request what
timing, logs and code review could not. It leaks nothing — no address, no
credential, just which branch executed.

Apply it to every silent fallback: mail transport, config source, cache hit or
miss, queue path. **If code can quietly do the wrong thing and still return
success, it must say which thing it did.**

**Timing is the backup signal** when you cannot change the code. Server
processing time is `time_starttransfer` minus `time_appconnect`:

```bash
curl -o /dev/null -w "%{time_appconnect} %{time_starttransfer}\n" -X POST https://site/api/endpoint.php
```

A local handoff lands near 0.3s. A real SMTP conversation — TLS, AUTH, DATA —
takes 1s or more. That gap alone tells you which path ran.

### Endpoint hardening

- **Dedupe on a client-generated id** — a retry after a successful send must not
  email twice. Store ids with a TTL.
- **Rate limit per IP**, return 429.
- **Honeypot field** — answer 200 and discard, so bots learn nothing.
- **Strip CR/LF from anything reaching a mail header** — otherwise header injection.
- **`From:` must be your own domain.** The visitor's address goes in `Reply-To`,
  so replying reaches them and the mail isn't spam-filed.
- **Don't assume `mbstring`.** Provide a `substr` fallback that doesn't split a
  UTF-8 sequence.
- **Keep state files out of the web root**, or block them with `.htaccess`.

`mail()` is unreliable on shared hosting. Structure the send as one isolated call
so switching to SMTP is a small change, and expect to need it.

### reCAPTCHA v3

Site key is public (client). Secret key is server-only — **grep the built output
to confirm the secret appears in no client file.**

**The trap: a v3 token expires after 2 minutes.** If submissions can be queued
offline for hours, they arrive with a dead token. Rejecting them destroys exactly
the leads the queue exists to protect.

Handle it by age:

- fresh submission + bad token → **reject 400** (bot)
- submission older than ~2 min + bad token → **deliver, flagged `[UNVERIFIED]`**
- Google unreachable → **503**, keep it queued. Never fail open, never drop.

Take a **fresh token at each send attempt**, not the one captured at submit.

**Verify the key pair before wiring it in.** Post a real token to `siteverify`
with the right secret and with a wrong one. A correct secret produces a
*different* error (`browser-error`) than a wrong one (`invalid-input-response`) —
that difference proves the pair matches.

Threshold 0.5. Raise toward 0.7 only if spam gets through.

**A low score must never reject a submission.** A score is a suspicion, not
evidence. Reject a **missing or forged token** — that is the real bot case. On a
low score, **deliver it flagged `[UNVERIFIED]`** and judge it yourself.

The failure this prevents is silent and total: the server answers 400, the client
drops any 4xx from its queue, the visitor sees the thank-you screen, and the
submission is destroyed with nobody aware. Real people on VPNs, privacy browsers
and corporate networks score badly through no fault of their own. A flagged email
a week costs nothing; one destroyed client costs the project.

**Hiding the badge is allowed only with the disclosure text**, linking Google's
Privacy Policy and Terms, wherever the badge would have been. Hiding it silently
breaches their terms.

```css
.grecaptcha-badge { visibility: hidden; }
```

---

## 7. Offline / PWA

**`navigator.serviceWorker.ready` NEVER settles when registration failed.** It
does not reject — it hangs forever, deadlocking anything that awaits it (private
mode, unsupported browsers, plain HTTP). Always race it:

```js
function swReady(ms) {
  if (!("serviceWorker" in navigator)) return Promise.resolve(null);
  return Promise.race([
    navigator.serviceWorker.ready.catch(() => null),
    new Promise(r => setTimeout(() => r(null), ms || 1500)),
  ]);
}
```

**Guard the module against double-initialisation** (`if (window.X) return;`). Two
instances means two flush locks and two sets of event listeners — every queued
item sends twice.

**Lock the flush.** `online`, `visibilitychange` and `load` fire within
milliseconds of each other; without a lock, two flushes read the same queue before
either deletes and everything is submitted twice. Add a **server-side idempotency
key** as well — locks are per-tab.

**Background Sync doesn't exist on iOS/Safari.** Always also flush on `online`, on
page load, and on tab refocus.

**Cache strategy:** HTML network-first with cache fallback (updates land, offline
still works); assets cache-first; **never** cache analytics or API calls.

**Precache the URLs the browser will actually request.** If links use `/work`,
precaching `/work.html` is dead weight — it never matches.

**Bump `CACHE_VERSION` on every deploy** or returning visitors keep the old cache
forever. Serve `sw.js` with `no-store`.

Service workers need HTTPS (localhost excepted) and often won't register inside
embedded preview browsers. Verify in real Chrome → DevTools → Application.

---

## 8. Server config and deploy

### `.htaccess` is not optional

If canonicals declare `/work` while the file is `work.html`, **every URL you tell
Google to index returns 404** without rewrites.

```apache
Options -Indexes
DirectoryIndex index.html

<IfModule mod_rewrite.c>
  RewriteEngine On

  RewriteCond %{HTTPS} !=on
  RewriteCond %{HTTP:X-Forwarded-Proto} !https
  RewriteRule ^ https://%{HTTP_HOST}%{REQUEST_URI} [R=301,L]

  RewriteCond %{HTTP_HOST} ^www\.(.+)$ [NC]
  RewriteRule ^ https://%1%{REQUEST_URI} [R=301,L]

  # .html → clean URL. EXCLUDE any file fetched by exact name at runtime,
  # or the redirect strips its extension and it silently disappears.
  RewriteCond %{THE_REQUEST} \s/+([^?\s]+)\.html[\s?] [NC]
  RewriteCond %{REQUEST_URI} !^/(component-a|component-b)\.html$ [NC]
  RewriteRule ^ /%1 [R=301,L,NE]

  RewriteCond %{REQUEST_FILENAME} !-f
  RewriteCond %{REQUEST_FILENAME} !-d
  RewriteCond %{REQUEST_FILENAME}.html -f
  RewriteRule ^(.+?)/?$ $1.html [L]
</IfModule>
```

Keep links, canonicals, sitemap and service-worker precache all on the **same**
URL form. Mixed forms mean a 301 on every internal click.

### CSP — this can blank the entire site

**A CSP that omits one script host produces HTTP 200 with an empty body.** No
error page, nothing in the HTML — just a white screen. It happened on launch.

Before writing a CSP, **list every host the site actually loads at runtime**,
including ones loaded *by other scripts*. Grep the JS for `http` URLs — a runtime
that fetches its own framework from a CDN will not appear in the HTML at all.

Also check whether anything uses `eval` / `new Function()`. Runtimes that compile
in the browser need `'unsafe-eval'`, and without it the page is blank.

Ship it as `Content-Security-Policy-Report-Only` first, watch the console, then
enforce.

Baseline headers:

```apache
Header always set Strict-Transport-Security "max-age=31536000; includeSubDomains"
Header always set X-Content-Type-Options "nosniff"
Header always set Referrer-Policy "strict-origin-when-cross-origin"
Header always set Permissions-Policy "geolocation=(), microphone=(), camera=(), payment=()"
```

### Cache headers

```
sw.js         no-cache, no-store, must-revalidate   ← or deploys never reach anyone
*.html        no-cache, must-revalidate
*.webmanifest public, max-age=3600
images/fonts  public, max-age=31536000, immutable
```

### Building the upload archive

**ZIP entry names must use forward slashes.** Windows .NET writes backslashes;
Linux extractors then create a file literally named `api\brief.php` in the root
instead of an `api/` directory, and half the site is missing with no error.

Build entries explicitly:

```powershell
$rel = $_.FullName.Substring($base.Length).Replace('\','/')
$archive.CreateEntry($rel, 'Optimal')
```

Then **verify**: count entries containing `\` — must be 0. Extract it and check
directories exist.

Exclude project notes, editor artefacts, and build-only sources. Include dotfiles
— `.htaccess` is invisible in most file managers and is the file that makes the
site work.

**Secrets never go in the archive, the repo, or a synced folder.** Credentials
belong on the server only. Before shipping, prove it programmatically rather than
from memory — read the file back *out of the archive* and assert the field is
empty.

Three follow-ons that are easy to miss:

- **A redeploy wipes server-only credentials.** Re-uploading the endpoint from a
  clean archive silently returns the site to its broken fallback — looking fine,
  delivering nothing. Record it in `CLAUDE.md` and re-check after every deploy.
- **Config above the web root is safer, but hosts disagree about where that is.**
  `/home/u/public_html` on one account, `/home/u/domains/site.com/public_html`
  on another. Search several candidate paths and have the endpoint report which
  one it used; a single guessed path fails silently and falls back.
- **Watch for synced folders.** A credentials file written to the Desktop may sit
  in OneDrive or iCloud and get copied to the cloud. Delete it once deployed.

**Test the archive, not the source folder.** Extract it, serve it, load every
page. A missing file shows up there and nowhere else.

---

## 9. Traps that cost real time

Each of these produced a working-looking site that was broken:

| Symptom | Cause |
|---|---|
| Blank page, HTTP 200 | CSP blocked the framework CDN, or `'unsafe-eval'` missing |
| Menu opens but panel is empty | wireframe placeholder never replaced with real content |
| Nav and footer vanish on one page | a rename or redirect changed a component's exact fetch URL |
| Every lead lost, form looks fine | submit handler shows success and never sends |
| Doubled analytics | inline snippet evaluated twice by the runtime |
| Duplicate emails from one visitor | concurrent queue flush, or two module instances |
| Icon has dark corners on iPhone | transparency + pre-rounded corners on the apple-touch icon |
| Page scrolls behind an open overlay | lifecycle method threw before the scroll lock ran |
| Sideways scroll on mobile | header row that doesn't wrap or shrink |
| 404s for `{{ binding }}` | preload scanner fetched a template placeholder from raw HTML — mark such images `loading="lazy"` |
| Queue retries forever | client only deletes on success; must also drop permanent 4xx |
| Form reports success, no email ever arrives | `mail()` returned true; the relay discarded it because SPF doesn't cover the web server |
| Endpoint passes every test, fails for real visitors | the tests bypassed the captcha branch — a fresh token takes a different path |
| Mobile fixed, tablet still broken | rule written into the wrong breakpoint block |
| Credentials gone after a redeploy | secrets live only on the server; re-uploading the file wipes them |
| Config file uploaded but never read | host's directory layout differs from the one assumed |
| Imported design renders with no images, fonts or scripts | a self-extracting bundle mints `blob:`/`data:` URLs the CSP blocks. Unpack it into real files; do not loosen the CSP |
| `Unexpected token '-'` from a helmet script that parses fine | the canvas runtime rewrote a bare camelCase variable (`sGa =`) as an attribute. Use lowercase locals |
| A new page 404s though the file exists | a folder with the same name beats the `!-d` rewrite condition |
| Landing page never appears in Google | the canvas default is `noindex,nofollow` on every page |
| Lazy images look broken in the preview pane | the pane never fetches lazy images; force one to `eager` before concluding anything |
| Leads vanish silently, form looks perfect | a low bot score returned 4xx and the client dropped it from the queue |

**Vendored/generated runtimes:** if a page depends on a generated file marked
*"do not edit"*, note any patch applied to it. Regenerating silently reverts the
patch and the failure is silent.

---

## 10. Handover

Leave in the repo:

- `CLAUDE.md` — project specifics, settled decisions, and **why** they're settled
- this playbook
- config placeholders clearly marked (endpoints, keys, domains)
- a note of anything that exists **only on the server** — mailbox passwords, API
  keys — and exactly what breaks if that file is ever re-uploaded
- backups of anything deleted during cleanup, until launch is confirmed

Tell the client plainly what is **not** done and what needs their input — real
copy, real credentials, DNS, Search Console. A launch blocked on a missing API
key is better than a launch that silently loses leads.

---

## 11. Where these rules came from

Dated, so the next reader can weigh them. **A rule that came from something
breaking is worth more than one that merely sounded sensible**, and the two are
marked differently below.

### HackProof Studio build — 2026

**Earned the hard way. Each of these was a live failure on a real site:**

| Rule | What actually happened |
|---|---|
| Test delivery on day one (§6) | The form ran on `mail()` the entire time the site was live. `mail()` returned `true`; the relay discarded every message. Found only when the client asked why no briefs were arriving |
| SPF covers the *sender*, not the domain (§6) | `include:_spf.mail.hostinger.com` authorised the mail servers. PHP was sending from the web server, which was not in that list |
| Make every fallback announce itself (§6) | A `200` from working SMTP and a `200` from a silently-discarded `mail()` were indistinguishable from outside. Six rounds of guessing ended the moment the response reported `via` |
| A low score must not reject (§6) | Real visitors scoring under 0.5 got a 400; the client dropped 4xx from its queue; the submission was destroyed while the visitor watched a thank-you screen |
| Fix at the right breakpoint (§4) | Footer doors stack at 1023px; the fix went into the 767px block. The phone looked right and 768–1023 stayed broken |
| CSP can blank the entire site (§8) | First upload returned HTTP 200 with an empty body — `unpkg.com` and `'unsafe-eval'` were missing from `script-src` |
| ZIP entry names (§8) | 67 of 82 entries were written with backslashes; Linux extracted them as files literally named `api\brief.php` |
| Analytics fires once (§5) | The runtime evaluates helmet scripts twice, so every visit counted as two until both snippets were guarded |
| Scripted tests can pass while users fail (§1) | Every `curl` test used an old timestamp, taking a branch that skips reCAPTCHA entirely. The real form was only ever confirmed by the client submitting it in a browser |
| Verify the fix, don't inspect it (§0) | Several "fixed" items were still broken at the width the client actually used. Re-measuring caught the doors, the invisible coral fills and the ZIP paths |

**Carried over as standard practice — not learned from a failure here:** SEO
structure and JSON-LD, icon and favicon rules, tap-target sizing, the responsive
test widths, offline queue design, endpoint hardening.

**Never actually done properly on that project:** deciding where secrets live
before deploying. Three attempts were made live on the production server — above
the web root, then the wrong folder, then inline constants. That is precisely why
§0 now opens with an order of work.
