# HackProof Studio — project notes

> **Also follow [WEB-PROJECT-PLAYBOOK.md](WEB-PROJECT-PLAYBOOK.md)** — the portable
> standards for any site build (SEO, icons, responsive, analytics, forms, CSP,
> deploy). This file holds only what is specific to THIS project.

## Verified live (2026-08-23) — do not re-diagnose these

Checked against the production site, not the source. If something looks broken,
start by re-running the check rather than assuming the note is still true.

| Thing | How it was proven | Result |
|---|---|---|
| Endpoint uploaded, PHP executes | `GET /api/brief.php` | `405` + JSON, not HTML |
| Clean-URL rewrite doesn't eat the endpoint | same request | not a 404 |
| CSP allows the POST | live response header | `connect-src 'self'` present |
| Server can reach Google | POST a bogus token | `invalid-input-response` — also proves the secret is valid |
| `info@` mailbox exists | SMTP `RCPT TO:` against `mx1.hostinger.com` | `250 2.1.5 Ok` |
| SPF / DMARC / MX | DNS | MX -> Hostinger, `v=spf1 include:_spf.mail.hostinger.com ~all`, `p=none` |
| SMTP path actually runs | POST a brief | `{"ok":true,"via":"smtp","config":"inline"}` |
| Mail genuinely delivered | client confirmed inbox | arrived |
| Real form, live reCAPTCHA token | submitted through the browser | arrived |

**The two numbers worth remembering:** server-side processing is ~**0.3s** on the
`mail()` path and ~**1.4s** on SMTP. If a future test returns 200 in 0.3s, the
credentials are gone and mail is silently broken again, whatever the form says.

**What was NOT covered by scripted tests:** every `curl` test used a
`submittedAt` older than two minutes, which takes the delayed branch and skips
reCAPTCHA entirely. That branch passing proves nothing about real visitors. Always
finish by submitting the actual form in a browser.

## Files
- `work.html` — WORK page. Five auto-scrolling lanes, 40 projects from one array in the logic class (name, industry, url, img, note). 39 live screenshots in `assets/work/` (1280px JPEGs); Aegean Pools is the one pending slot. Frames show the full screenshot uncropped, full colour, desaturating slightly on hover. Opening a frame gives detail plus two actions: VIEW PROJECT (live site, new tab) and BOOK A CALL (TidyCal overlay, same `hackproofwp/thirty-minute-meeting` path as the contact page).
- `services.html` — SERVICES page. Eleven sections: hero + service index, "where are you starting from", the three services (01 custom build, 02 redesign, 03 security), what every project includes (spec table), six-stage process, engagement/fit, work bridge, FAQ, conversion band. Reuses the approved header, left rail, MENU overlay and footer. Platform-neutral language: no "WordPress" anywhere — build/CMS instead. Scroll reveals are driven by a rAF-throttled scroll sweep with inline styles (IntersectionObserver does not fire in the preview shell, and GSAP ScrollTrigger registers no triggers there); nothing can be left hidden — reduced-motion and no-JS render sharp and static.
- `security.html` — SECURITY page. Eleven sections: hero (layered "seven layers" panel with a single coral scan pass), what are you seeing (11 signs), two pathways (incident response / preventive), seven-stage incident response, security service table, access-and-visibility, security beneath every build, anonymised incident categories, principles, four-stage engagement flow, FAQ. No guarantees, no invented case studies, no client names. Every CTA goes to the Open Brief with `?need=security`.
- `index.html` — master file. All 10 sections, animations, forms, footer.
- `contact.html` — RETIRED. Open Brief is the only lead-capture page. Carries `noindex, follow`, no canonical, no schema, and nothing links to it. Kept for its multi-step form + TidyCal calendar layout. On deploy: 301 `/contact` -> `/open-brief`.
- `favicon.ico` (root, 16/32/48) + `assets/favicon/` (16, 32, 180 apple-touch, 192, 512) + `site.webmanifest`. Mark is the linked coral OO cropped from `assets/logo-o-coral.png` (bbox 962,0 335x171) on the ink ground `#0D1512`, rounded square. Regenerate from the 512 master with ffmpeg.
- `robots.txt` / `sitemap.xml` — six indexable URLs, matching each page canonical. `contact` is excluded on purpose. `robots.txt` does not Disallow `/contact`: it is noindexed, and a blocked crawler would never read the tag.
- `assets/` — logos, project screenshots, security image.
- `screenshots/` — test captures, NOT site assets.

## Brand / design
- Palette: ink `#151614`, paper `#F2EFE8`, coral `#FF5A3C`, dark green-black `#0D1512`, warm border `#D8D3C8`.
- Coral is an accent only — never a fill for large surfaces.
- Max 1–2 background tones. Inline styles throughout (no stylesheets/classes).

## Sections
Hero (client logo reel) → Services → Selected Work → POV → Security → Studio/portrait → Process → Contact/footer with two "doors."

## Logo animation (settled — do not redesign)
- STUDIO in the wordmark fills coral left→right over ~2.3s, holds, fades back, ~5s pause. 9s loop.
- Runs on all three wordmarks: desktop header, mobile header, footer colophon.
- Hover fills STUDIO instantly and holds. Reduced-motion opts out.
- Overlay asset `assets/logo-studio-coral.png`; clip range `inset(0 36.7% 0 0)` → `inset(0 5.9% 0 0)`. Re-measure if the logo art changes.
- Rejected and not to be revisited: coral O highlight, water-fill, trail-around-the-8.

## Page intro (curtain preloader)
- Every page opens with the same curtain: Night panel, paper wordmark fading in, panel lifting up at ~0.95s. 1.8s total.
- Homepage drives it with GSAP; every other page uses the CSS curtain (`[data-curtain]` / `[data-curtain-logo]`) plus a 2s timer in `componentDidMount` that sets it to `display:none` for good.
- After the curtain: masked headline rises, coral phrase wipes in bottom-to-top (`[data-fill]`, muted base + clipped coral duplicate), then eyebrow, copy and index rows stagger. Reel lanes fade up last.
- IMPORTANT (preview shell): the host re-renders often and throttles the frame. So the intro and the scroll reveals are driven by INLINE styles set from `setTimeout` (never CSS animation on those elements, never `requestAnimationFrame`, never IntersectionObserver, never GSAP ScrollTrigger) and each element is marked done so a re-render cannot replay or re-hide it. Reveals use a 140ms polling sweep; markup's own state is always the final visible one.

## Scroll motion
Depth-of-field runs on EVERY page: sections arrive at 6px blur (4px under 768px) and a small rise, sharpen on entry, soften to 3px on exit. Per-element reveals (coral gradients, text slides) play on top.
- Homepage drives it with GSAP ScrollTrigger on `[data-sec]`.
- Every other page uses `buildDof()` in its logic class: each top-level `<section>` and the `<footer>` carries `data-dof="1"`, and a 90ms poll sets inline `filter`/`transform` from `getBoundingClientRect()`. The poll re-reads the node list each pass so an imported footer picked up after mount is included. Reduced-motion opts out entirely.
- The page starts SHARP and the effect only engages after 120px of observed section movement (then a 260ms filter transition eases it in). Some hosts report a scrollable document but never move it — without that gate the main content sits permanently blurred. If nothing has moved after 3s the poll drops to 400ms. Keep this guard. Do not switch this to ScrollTrigger or IntersectionObserver — neither fires in the preview shell.

## Navigation (settled)
- The MENU overlay is identical on all five main pages: six rows (`00` Front door, `01` Work, `02` Services, `03` Security, `04` Studio, `05` Open brief), each with a mono number on the left, a hover-revealed `↗` on the right, and a 60ms stagger on `ovRow`. The current page row carries `data-navcur` + `aria-current="page"` and shows a coral dot with YOU ARE HERE instead of an arrow. Row `05` keeps a coral always-visible arrow as the CTA. `state.hover` defaults to the page own row number. The preview panel is image-driven: hovering a row swaps a screenshot plus a label and a note, keyed by `data-prev` (`01` Work, `02` Services, `03` Security, `04` Studio, `05` Open brief renders a form mock instead of an image). `index.html` shipped with wireframe `SLOT nn` text placeholders and no image layer until this was ported across from the other pages. `03` and `04` use `cover` fit, the rest `contain`.
- Header and footer nav on every page link to the standalone pages: `work`, `services`, `security`, `studio`, `open-brief`. No homepage-anchor links.
- Footer nav reads WORK / SERVICES / SECURITY / STUDIO / OPEN BRIEF. PROCESS was removed — the process content lives inside the Services page at `#process`.
- The Open Brief page uses `HP Nav` + `HP Footer` and carries NO "START A PROJECT" CTA in the header (it would link to itself). Its menu index shows 00 Front door through 05 Open brief with "YOU ARE HERE" on the brief row.

## Selected Work
- Four projects, each in a browser frame: dark ground, coral chrome strip only, traffic-light dots, drop shadow.
- Frame aspect ratio follows the active project so nothing crops. Metal Roofing re-rendered to 1280×616 to match.
- Mobile stacks each row with its own framed screenshot.

## Hero reel + project deep links (2026-09-09)
- **Hover PAUSES the reel. Never re-time it.** The hover rule used to set
  `animation-duration: 500s`. A CSS animation's position is elapsed ÷ duration, so
  30s into a 60s loop is 50% — and the instant the duration became 500s the browser
  recomputed that as 6% and the track SNAPPED back to the top. The card under the
  cursor jumped away and could never be clicked. `animation-play-state: paused`
  freezes it in place with no recalculation. Do not "improve" this back into a
  duration or a speed change.
- **Every reel card deep-links to its project**: `/work?p=<slug>`. All twelve used
  to point at `#work`, a same-page anchor, so no card led anywhere. Six projects,
  each rendered twice for the seamless loop; the duplicates carry empty alt and
  link to the same slug.
- **The slug is the project NAME slugified, never the array index.** `this.projects`
  in `work.html` gets reordered whenever a project is added, and an index would
  silently open the wrong one. `openFromQuery()` matches the exact slug, then falls
  back to a prefix match, then gives up and leaves the page as it is.
- Slugs in use: `monolith`, `about-smiles-sydney`, `lexmens-lawyers`,
  `space-solar`, `dr-justine-o-hara`, `roof-smart-roofing`. **If a project is
  renamed in `work.html`, its homepage link breaks silently** — re-slugify and
  update `index.html`.
- The array is `this.projects`, NOT a module-level `PROJECTS`. Referencing the
  latter throws on every Work page load.
- Verified: all six slugs open the correct project (checked against each detail
  panel's VIEW PROJECT href). No param and unknown slugs load the page normally.
  A query string carrying quotes and tags is harmless — the slugify reduces it to
  `[a-z0-9-]` and it is only ever used for an array lookup, never rendered.
- Offline still works: `sw.js` matches with `ignoreSearch: true`, so
  `/work?p=slug` falls back to the cached `/work`, and the deep link still
  resolves because it reads `location.search` at runtime. No precache entry needed.
- **Hero status label is `TAKING BRIEFS`**, replacing `AVAILABLE / Q4` which went
  stale every quarter. Two longer drafts were measured and rejected:
  `AVAILABLE / TAKING BRIEFS` wrapped to two lines at 390px, `NOW TAKING BRIEFS`
  wrapped at 320px. The current one is 118x14 on a single line at 320 / 390 / 768 /
  1440. The coral status dot already carries the "now", so keep the text at or under
  ~14 characters if it is ever reworded.
- `VIEW CASE STUDY` under Selected Work now goes to `/work`. It used to be
  `href="#work"` while sitting INSIDE `<section id="work">`, so it scrolled the
  visitor to where they already were and read as a dead button.
- Zero `href="#work"` links remain on the homepage.

## Hero reel
Infinite vertical loop, resumes from the same progress point on resize. No mouse tilt. No restart on image load.

## Contact
- Multi-step form: name, email, phone, budget ($1500–$5000+), start timing. All required.
- Two entry points: popup from footer Door 02 "START A BRIEF," and the standalone contact page.
- "Book a call" opens a TidyCal overlay; both entry points embed the same calendar.

## Open items (need user input)
1. Service scopes all read "SCOPE ON REQUEST" — real scope lines needed.
2. Project descriptions are visual descriptions only — one real sentence per project needed.
3. Client count mismatch: homepage hero reel names six clients; the WORK page now carries 40.
4. ~~Homepage CASE STUDY links still point at `#work`.~~ DONE 2026-09-09 — every reel card now deep-links to `/work?p=<slug>` and opens that project detail, which is where VIEW PROJECT (live site) and BOOK A CALL live. No separate case-study pages were needed.
7. WORK project notes describe the design only, and years are blank for all but the first four — send real years/scope lines if they should show.
5. GSAP is on CDN — for production, download `gsap.min.js` + `ScrollTrigger.min.js` to `js/` and swap two URLs.
6. ~~Domain in form/calendar config needs the final origin.~~ DONE — `hackproofwp.com` is live, canonicals, sitemap, `ALLOWED_ORIGINS` and the endpoint all verified against it on 2026-08-23.

## SEO (settled)
- Page files are plain lowercase `.html`: `index.html`, `work.html`, `services.html`, `security.html`, `studio.html`, `open-brief.html`, `contact.html`. No spaces, no `.dc`, so no `%20` in any href.
- Components are `hp-nav.html` and `hp-footer.html`. There is no `.dc.html` anywhere. `support.js:1646` was patched from `+ ".dc.html"` to `+ ".html"`, so the `<dc-import name="hp-nav">` stem must match the filename exactly. If support.js is ever regenerated, re-apply that one-line patch or the nav and footer vanish from Open Brief.
- `.htaccess` excludes `hp-nav.html` / `hp-footer.html` from the clean-URL redirect so the runtime fetch resolves in one hop.
- Every live page carries: `<html lang="en">`, a 47-58 char title, a 148-160 char description, `robots`, a canonical, full Open Graph incl. `og:image`, a `summary_large_image` Twitter card, and JSON-LD.
- JSON-LD is one `@graph` per page, `@id`-linked back to the homepage `#website` / `#studio` / `#founder` nodes. Types in use: WebSite, ProfessionalService, Person, CollectionPage, WebPage, AboutPage, ContactPage, Service, BreadcrumbList.
- No FAQPage, despite the FAQ sections on Services and Security. Google retired FAQ rich results in May 2026, so it earns nothing. Do not add it back.
- The Work detail panel reserves space from `SHOT_H` in `work.html`, a generated map of each screenshot true height (582-751, all 1280 wide). It replaced a hardcoded `1280x800` that shifted the layout on every project open. Regenerate the map if the screenshots change.
- Share card is `assets/share-card.jpg` (1200x630) for every page.
- Open Brief is the ONLY lead-capture page. It deliberately collects no phone number: the urgent lane opens the TidyCal calendar inline (verified), and email reaches the studio directly. Do not add a phone field back.

## Deploy
- **The CSP in `.htaccess` is load-bearing.** `support.js` fetches React, ReactDOM and Babel from `unpkg.com` and compiles the page with `new Function()`. `script-src` MUST keep `https://unpkg.com` and `'unsafe-eval'`, and `connect-src` MUST keep `https://www.google.com` for reCAPTCHA telemetry. Drop any of them and every page returns HTTP 200 with a completely blank body — no error, just nothing. This happened on the first upload.
- The site is client-side rendered by the canvas runtime. Nothing is visible until React loads from a CDN. That is the single biggest fragility in production: unpkg down or blocked = blank site.
- **After ANY deploy that touches `api/brief.php`, re-check the mail path.** The credentials live on the server only, so re-uploading that file from a ZIP wipes them and drops the site back to `mail()` — which reports success and delivers nothing. One command:
  ```
  curl -X POST https://hackproofwp.com/api/brief.php -H "Content-Type: application/json" -d "{\"name\":\"Health Check\",\"email\":\"you@example.com\",\"summary\":\"test\",\"submittedAt\":\"2020-01-01T00:00:00.000Z\"}"
  ```
  `"via":"smtp"` = healthy. `"via":"mail"` = credentials gone, email is silently broken.
- `.htaccess` denies `hp-mail-config.php` alongside `CLAUDE.md` and `*.md`. That is a safety net only — the file belongs ABOVE `public_html`, and the inline constants are what is actually in use.
- ZIP entries must use forward slashes. Windows .NET writes backslashes, which Linux extractors turn into files literally named `apirief.php`.
- Upload everything except `CLAUDE.md` and `.thumbnail` (both blocked by `.htaccess` anyway). 86 files, ~6MB.
- **`.htaccess` at the root is required, not optional.** Canonicals and the sitemap declare `/work`, `/services` and so on while the files are `work.html` etc. Without the rewrite block every URL Google is told to index returns 404.
- `.dc.html` is excluded from the `.html`->clean-URL redirect. Without that exclusion the redirect strips the extension off the component fetch and the nav and footer silently disappear from Open Brief.
- Internal links, canonicals, the sitemap and the `sw.js` precache all use clean URLs. Keep them in step: a precache entry that does not match what the browser requests is never used.
- `sw.js` is served `no-store`; assets get a one-year immutable cache. Bump `CACHE_VERSION` every deploy.
- `/contact` 301s to `/open-brief`.
- Removed at cleanup: 28 concept artboards, `contact.html`, `screenshots/`, `uploads/`, 14 unused images. 85MB -> 6MB.

## Analytics
- GA4 `G-3TXVNF6YDR`, in the helmet of all seven pages, directly after the `hp-offline.js` tag.
- The inline block is wrapped in a `window.__gaBooted` guard. The canvas runtime evaluates helmet scripts twice, so without it `gtag('config')` fires twice and every visit counts as two page_views. Verified: one `config` call, one `/g/collect` hit per page load.
- Hotjar `6765824` sits directly after the GA block, behind a `window.__hjBooted` guard. Hotjar's snippet ends in `appendChild()`, which is NOT idempotent — unguarded, the second helmet evaluation injects a second Hotjar script and every session is recorded twice. Verified by re-running the raw snippet: 1 tag became 2.
- `sw.js` deliberately does NOT cache googletagmanager.com, google-analytics.com or hotjar.com. Never add them to the cache lists — cached analytics replays stale hits.
- **Hotjar records sessions on the Open Brief page**, where visitors type their name, email and business problem. Hotjar suppresses text-input values by default, but confirm that in the Hotjar dashboard, and add `data-hj-suppress` to any element that must never be captured.
- Offline visits are not measured. GA cannot reach the network, and that is expected; analytics for offline sessions is inherently lossy.
- **Any CSP must allow GA or measurement silently stops.** See the header block below.

## Brief endpoint (api/brief.php)
- Emails a brief to `info@hackproofwp.com`. `Reply-To` is the visitor, so replying goes straight to them. `From` is built from `SMTP_USER` on the SMTP path so the header always matches whoever authenticated; `MAIL_FROM` is only read by the `mail()` fallback.
- **Status codes are instructions to the offline queue**, not decoration: 2xx delete, 4xx (not 429) delete, 429/5xx keep and retry. Never return 4xx for anything a retry could fix, or a real brief is destroyed.
- Dedupe on `briefId` (7 days, files in `api/.state`, blocked by `api/.htaccess`). Rate limit 5 per IP per 10 min, returning 429 so a genuine burst is queued, not dropped.
- **reCAPTCHA v3 vs the offline queue:** a v3 token dies after 2 minutes, so a brief queued offline for hours arrives with an expired one. Rejecting it would bin exactly the leads the queue exists to protect. A submission older than 2 minutes is therefore delivered and flagged `[UNVERIFIED]` instead of dropped. A *fresh* submission with a missing or forged token is still rejected 400 — but a fresh one that merely scores LOW is delivered flagged, not rejected (see Lead safety). If Google itself is unreachable the answer is 503 (retry), never a drop.
- Keys go in `RECAPTCHA_SECRET` (PHP) and `RECAPTCHA_SITE_KEY` (js/hp-offline.js). Both empty = verification skipped, form still works.
- Needs curl (or openssl + allow_url_fopen) for verification, and a CA bundle. Without them it answers 503 and keeps retrying rather than failing open.
- A PHP fatal must never surface as 200 — the shutdown handler forces 500, because a 200 makes the client delete the brief.

## Mail delivery (Hostinger)
- Diagnosed live on 2026-08-22 because no brief was arriving. Verified working: the endpoint is reachable and PHP executes (GET returns JSON 405), the CSP allows the POST, `ENDPOINT` is `/api/brief.php`, the server reaches Google (a bogus token returns `invalid-input-response`, which also proves the secret is valid), and `info@hackproofwp.com` accepts mail (SMTP RCPT returns `250 2.1.5 Ok`). A delayed test brief returned `200 {"ok":true}` — so `mail()` returned TRUE and the message still never arrived.
- **That is the Hostinger failure mode: the local sendmail accepts the message and the relay discards it.** The web server is not an authorised sender — SPF is `v=spf1 include:_spf.mail.hostinger.com ~all`, which covers the MAIL servers, not the web host. `mail()` cannot report this, so the form reports success and delivers nothing.
- **Fix: authenticated SMTP.** `smtpSend()` in `api/brief.php` is a dependency-free SMTP client (no Composer on this host). Set `SMTP_USER`/`SMTP_PASS` to a real mailbox from hPanel -> Emails. 465 uses implicit TLS, 587 negotiates STARTTLS. Certificate verification is ON and must stay on — the mailbox password crosses that socket.
- `MAIL_FROM` should match `SMTP_USER` so the From header aligns with the authenticated sender. The `From` header is built from `SMTP_USER` for exactly this reason.
- Leave `SMTP_USER` empty and it falls back to `mail()`, so an un-configured deploy behaves as before instead of breaking.
- **RESOLVED and verified live on 2026-08-23.** A test brief returned `{"ok":true,"via":"smtp","config":"inline"}` and arrived in the inbox. Server-side processing went from 0.307s on the `mail()` path to 1.44s on SMTP, which is the TLS handshake plus the AUTH/MAIL/RCPT/DATA exchange — that timing gap is the quickest way to tell the two paths apart if this ever regresses. A real form submission with a live reCAPTCHA token was also confirmed delivered.
- The success response reports `via` (`smtp`/`mail`) and `config` (`file`/`inline`). Keep those — a 200 that silently delivers nothing looks identical to a 200 that works, and diagnosing this without them took several rounds.
- **The credentials live in `SMTP_USER_INLINE`/`SMTP_PASS_INLINE` inside `api/brief.php` ON THE SERVER ONLY.** They are deliberately empty in this repo and in every ZIP. **Re-uploading `api/brief.php` from a ZIP wipes them and silently returns the site to the `mail()` path that delivers nothing.** Re-add them after any redeploy of that one file, then confirm with `via`.
- The config-file route (above the web root) is the stronger option and `brief.php` searches four locations for it, but Hostinger's layout varies per account and the inline constants are what is actually in use.
- **Never relax `verify_peer` to get a connection working.** A failure there means the wrong host or a broken CA bundle, not a reason to trust anything that answers.

## Lead safety (do not re-tighten)
- **A low reCAPTCHA score no longer rejects the brief — it delivers it flagged `[UNVERIFIED]`.** Rejecting was destroying real leads: the server answered 400, and `hp-offline.js` drops any 4xx from the queue, so the visitor saw the thank-you screen and the studio never heard from them. A real person on a VPN or a privacy browser scores badly through no fault of their own.
- A missing or forged token is still rejected 400. That is the genuine bot case; a low score is not.
- **The client ignores the send result**: `submitBrief(payload).catch(function(){})` in `open-brief.html`, so the thank-you screen shows whether or not delivery succeeded. Defensible while the brief is queued and retried, but it means any silent server-side drop is invisible to everyone. Keep that in mind before adding any new 4xx.

## reCAPTCHA (v3, invisible)
- Site key in `js/hp-offline.js`, secret in `api/brief.php`. The secret appears in no client file — verified.
- Script loaded on `index.html` and `open-brief.html` only. Open Brief is the live form; the homepage carries it for v3 scoring context, which is what makes real visitors score well on the form page.
- **The homepage inline brief form is dead code.** Nothing sets `brief: true`, so the popup never renders; `openBrief` navigates to `/open-brief` instead. `sendHomeBrief()` is wired anyway so the form is safe if it is ever revived.
- Threshold `RECAPTCHA_MIN_SCORE = 0.5`. Raise toward 0.7 only if spam gets through; lower it if real people are refused.
- The badge is HIDDEN (`.grecaptcha-badge { visibility: hidden }` on index and open-brief). Google permits this only with the disclosure text, which sits under the Open Brief form with links to their Privacy Policy and Terms. Remove the notice and you are in breach of their terms — restore the badge instead.
- Verified: a submission with no token and a submission with a fake token are both rejected 400 and send no email. A genuine brief queued offline for three hours is still delivered, flagged `[UNVERIFIED]`.

## Offline / PWA
- `sw.js` + `js/hp-offline.js` + `site.webmanifest`. The site loads with no connection (pages, fonts, logos, runtime precached on install; screenshots cached as viewed) and a brief submitted offline is queued in IndexedDB and sent on reconnect.
- `ENDPOINT` in `js/hp-offline.js` is `/api/brief.php`. Verified live 2026-08-23. Old queued items fall back to the current ENDPOINT, so one queued before it was set still flushes. (This file used to claim ENDPOINT was empty — it was wrong, and it cost a diagnosis round. Check the file, not the note.)
- Before this existed the form sent nowhere at all: it set `sent:true` and discarded the brief.
- Bump `CACHE_VERSION` in `sw.js` on every deploy or visitors keep the old cache.
- **Caches expire at the visitor local midnight**, not on a fixed TTL. `hp-offline.js` stamps the local date in localStorage and drops all Cache Storage on the first load of a new day (and on tab refocus, for a phone left open overnight). The worker refills on the next request. The service worker cannot do this itself — it has no idea what timezone the visitor is in.
- The purge calls `caches.delete()` only. **IndexedDB is never touched**, so a brief queued at 23:50 is still there at 00:05. Verified.
- Service workers need HTTPS (localhost excepted). They do not register in the Claude preview pane, so offline behaviour must be checked in real Chrome.
- Three bugs found building this, all fixed, all easy to reintroduce:
  1. `navigator.serviceWorker.ready` NEVER settles when registration failed — it does not reject. Always race it against a timeout (`swReady()`).
  2. The canvas runtime evaluates helmet scripts TWICE, so `hp-offline.js` ran twice from one `<script>` tag — two flush locks, two listener sets, every brief POSTed twice. Guarded with `if (window.HPOffline) return;`.
  3. `online` + `visibilitychange` + load can flush concurrently; both a lock and a `briefId` idempotency key are in place.

## Studio label (mobile)
- On desktop "THE STUDIO" sits in the text column and the portrait in its own — no overlap, leave it.
- On mobile the section collapses to one column and the label was stranded between the portrait coral rule and the heading. `[data-studiolabel]` hides below 768px and `[data-portraitcap]` shows instead: bottom-left ON the photograph, paper text over a dark gradient scrim.
- The overlay copy is NOT aria-hidden — on mobile it is the only copy rendered, so it must be the one a screen reader reads.

## Homepage animation (do not put this back on GSAP)
- The homepage was the ONLY page driving its reel and coral fills with GSAP. Every other page uses plain CSS and has never stalled. When GSAP fails to boot — CDN blocked, rAF not firing, a hidden tab at load — the homepage lost every animation while the rest of the site was fine.
- **Reel:** `@keyframes reelV` on `#hero [data-track]`, 60s linear infinite, cards duplicated so -50% is one loop. Hover/focus slows it via `animation-duration: 500s`. Same approach as `work.html`. GSAP no longer tweens the track.
- **Fills:** `@keyframes fillIn` applied by a single attribute, `data-fillgo`, set by a 140ms sweep when the element scrolls into view. GSAP and ScrollTrigger no longer touch the fills, and `forceStatic()` deliberately leaves them alone.
- **The fill spans no longer carry `clip-path: inset(100% 0 0 0)` in the markup.** They used to, which meant "GSAP did not run" rendered as invisible coral text. The keyframe supplies the hidden start state instead, so no animation degrades to visible text — the rule the rest of this project already follows.
- Do not reveal fills from a JS timer or inline styles. The host re-renders often; inline clip-path values survived a re-render while the guard flag did not, stranding text invisible. An attribute plus a keyframe cannot do that.

## Mobile-only rules (max-width: 767px)
- One CSS block per page, marked `mobile-only adjustments`, plus a matching pair in `hp-nav.html`.
- **Mobile keeps the full wordmark on the left; MENU and START sit hard right.** A mark-only logo was tried and rejected — do not reintroduce it.
- The real blocker was structural, not margins: `[data-top-mobile] { display: flex }` makes the header a flex CONTAINER, so its inner row became a flex ITEM and shrank to content width (337px inside a 390px screen). No margin could push anything right because there was no free space. `[data-top-mobile] > div { flex: 1 1 auto; width: 100% }` is what actually fixes it.
- `[data-toplabel]` keeps `margin-left: auto` — that is what pushes the group right. It hides only below 360px, and there the first button takes over the push.
- On mobile `[data-secfig]` goes full width: its `clamp(132px,22vw,320px)` sits on the 132px floor on a phone and reads as a thumbnail.
- `[data-portrait]` becomes a square on mobile. The source is 900x900 and a 350x205 letterbox showed only a band of the face.
- `[data-door2]` padding-left must MATCH door 1, not be zero. Zeroing it just moved the mismatch to the other door.
- `[data-toplabel] { margin-left: 0 !important }` — removes the auto margin. On its own this does NOTHING at or below 430px, because the label is already hidden there and the buttons already follow the logo. It only matters between 431 and 767px. Do not treat it as the fix for "buttons are not on the left" — the logo width is.
- `[data-sec], [data-dof] { filter: none !important }` — no depth-of-field blur on mobile. **`!important` is required**: the effect writes `filter` as an inline style from JS, and that is the only thing that outranks it. Verified by writing an inline `blur(6px)` at both widths — survives at 1280, killed at 375.
- `[data-door2] { padding-left: 0 !important }` — both footer doors share one left edge. The 24px indent is a desktop gutter and only misaligns them once stacked.
- Hero reel: `buildReel` used to give up permanently if the track measured under 40px, and its ResizeObserver watched only the band. It now retries (bounded, 40 tries) and observes the track too. **Unverified** — GSAP does not animate in the preview pane, so neither desktop nor mobile could be used as a baseline.

## V3 mobile pass (verified)
- **Mobile bar label is now identical on all six pages**: coral 5px dot + ink `#151614`. The homepage had no dot and used grey `#62655F`; `hp-nav.html` (used only by Open Brief) had neither. Every page now renders the same thing.
- **Footer doors.** On services, security and studio door 1 carries `padding-left:0` inline — it is the flush left column of the desktop pair — while door 2 carries 24px. Stacked, they sat 24px out of step. Fixed with `[data-doors] > div { padding-left/right: clamp(24px,3vw,40px) !important }`. **This rule belongs in the `max-width:1023px` block, not the 767px one** — the doors stack from 1023px down, so a mobile-only rule left 768-1023px still broken. Verified 44/44 at 390px, 63/63 at 900px, and untouched two-column at 1440px.
- **Open Brief, mobile only.** The form used to start at 1385px with the whole step ladder above it. Now:
  - `[data-briefgrid] > [data-ladder] { order: 2; position: static }` puts the form first and drops the ladder below it as a summary (the form header already says STEP 01 / 04).
  - The two rails are re-laid as a 2-column grid: label and button share the top line, the explanation spans underneath. 167px each -> 126px.
  - **The rails stay ABOVE the form deliberately.** The urgent control changes what gets submitted, so meeting it after writing the brief would be too late. Do not "tidy" them to the bottom.
  - CLOSE was wrapping onto its own line at the left edge because the `FOUR STEPS / ABOUT TWO MINUTES` caption holds `margin-left:auto`. The caption is hidden below 768px (`[data-briefcap]`), which leaves CLOSE on the header line, hard right.
  - Net: form 1385 -> 715, ladder 1261, no horizontal overflow. Desktop verified unchanged at 1440 (ladder still sticky in the left column, rails still one flex line, caption visible).

## Responsive (verified)
- Breakpoints: mobile bar below 768px; `[data-toplabel]` (the page name in the mobile bar) hides at or below 430px so MENU and START always fit; desktop header rhythm tightens at or below 900px because it is still shown from 768px up.
- Verified with an iframe harness at 320 / 375 / 414 / 430 / 768 / 1024 / 1366 / 1440 / 1920 / 2560. Zero horizontal overflow on all seven pages at every width.
- Tap targets: anything rendering under 24px gets an `::after` overlay rather than padding, so the hit box grows without moving the visual. Applied to `[data-segwrap]` (8px bars, now 36px), `[data-footmail]` and `[data-flink][href^="mailto:"]` (14px, now 32px), `[data-link]` on contact, and `[data-rail] a/button` (23px wide, now 35px).
- The hero reel cards legitimately extend past the viewport inside `overflow:hidden` marquee containers. That is not overflow — check `documentElement.scrollWidth`, not element rects.

## Icons
- `apple-touch-icon.png` and `icon-maskable-512.png` are **full-bleed opaque squares with no alpha channel** (`ffmpeg -pix_fmt rgb24`). iOS renders transparent pixels black and applies its own squircle mask, so a pre-rounded transparent icon shows dark double-rounded corners. Do not add rounded corners or transparency to these two.
- `icon-192`/`icon-512`/`favicon-*` keep rounded corners and alpha; browsers show them as-is.

## Known runtime constraints (do not regress)
- `support.js:1013` calls `componentDidUpdate(prevProps)` with ONE argument. A second `prevState` parameter is always `undefined` and reading it throws. Track previous values on the instance instead. This silently broke the HP Nav menu scroll lock until it was found.
- The browser preload scanner fetches `src` from the raw HTML before any JS runs, so an `<img src="{{ binding }}">` marked `loading="eager"`/`fetchpriority="high"` requests the literal `{{ ... }}` and 404s. Images inside overlays that open on demand must be `loading="lazy"`.
- Every page with a full-screen overlay sets `document.body.style.overflow` while it is open and clears it on unmount. index, work, services, security, studio and HP Nav all do this.

## Working rules
- No invented claims about named clients — security posture, scope, outcomes. Hold the line.
- Placeholder images: empty alt + caption stating it's a slot. Real alt text only when the real image lands.
- Desktop and mobile copy are stored separately in the homepage file. Editing one does not update the other — always change both.
