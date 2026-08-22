/* HackProof Studio — offline support, loaded by every page.
 *
 *   HPOffline.submitBrief(payload)  ->  Promise<{ status }>
 *
 * status is "sent" when it reached the server, or "queued" when it did not and
 * is now waiting in IndexedDB. A queued brief is retried on Background Sync, on
 * the next `online` event, and on the next page load, so it survives a closed
 * tab and a restarted phone.
 */
(function () {
  "use strict";

  // The design-canvas runtime evaluates helmet scripts twice, so this file runs
  // twice from a single <script> tag. Without this guard there are two module
  // instances, each with its own flush lock and its own online/visibilitychange
  // listeners — which POSTs every queued brief twice. One instance only.
  if (window.HPOffline) return;

  // ---------------------------------------------------------------- config
  // Set this to the URL that receives a brief as JSON. Until it is set, briefs
  // are still captured and held locally — nothing is lost — but nothing can be
  // delivered either, so this is the one line that has to be filled in.
  var ENDPOINT = "/api/brief.php";

  // reCAPTCHA v3 site key (the public one). Paste it here and load Google's
  // script on the page; leave it empty and the form works without a token.
  var RECAPTCHA_SITE_KEY = "6LdgpZItAAAAAFyEUijHWF5-olSk_I34Ln_DbaPz";

  var DB_NAME = "hp-briefs";
  var STORE = "queue";
  var SYNC_TAG = "hp-brief-sync";

  function openDB() {
    return new Promise(function (resolve, reject) {
      var r = indexedDB.open(DB_NAME, 1);
      r.onupgradeneeded = function () {
        if (!r.result.objectStoreNames.contains(STORE)) {
          r.result.createObjectStore(STORE, { keyPath: "id" });
        }
      };
      r.onsuccess = function () { resolve(r.result); };
      r.onerror = function () { reject(r.error); };
    });
  }

  function tx(db, mode, fn) {
    return new Promise(function (resolve, reject) {
      var t = db.transaction(STORE, mode);
      var req = fn(t.objectStore(STORE));
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
  }

  // navigator.serviceWorker.ready NEVER settles when registration failed — it does
  // not reject, it just hangs. Awaiting it directly deadlocks submitBrief() and
  // flush() in private mode, on unsupported browsers, and on plain http. Always
  // race it against a timeout.
  function swReady(ms) {
    if (!("serviceWorker" in navigator)) return Promise.resolve(null);
    return Promise.race([
      navigator.serviceWorker.ready.catch(function () { return null; }),
      new Promise(function (r) { setTimeout(function () { r(null); }, ms || 1500); })
    ]);
  }

  // v3 is invisible: no checkbox, no puzzle. execute() returns a token that is
  // only valid for two minutes, which is why a token is taken again at flush
  // time rather than reusing the one captured at submit.
  function recaptchaToken() {
    if (!RECAPTCHA_SITE_KEY || typeof grecaptcha === "undefined" || !grecaptcha.execute) {
      return Promise.resolve("");
    }
    return new Promise(function (resolve) {
      try {
        grecaptcha.ready(function () {
          grecaptcha
            .execute(RECAPTCHA_SITE_KEY, { action: "brief" })
            .then(function (t) { resolve(t || ""); })
            .catch(function () { resolve(""); });
        });
      } catch (e) { resolve(""); }
      setTimeout(function () { resolve(""); }, 4000); // never block the submit
    });
  }

  function newId() {
    // Not Date.now() alone: two briefs in the same millisecond would collide.
    return String(Date.now()) + "-" + Math.random().toString(36).slice(2, 10);
  }

  async function enqueue(payload) {
    var db = await openDB();
    var item = {
      id: newId(),
      endpoint: ENDPOINT,
      payload: payload,
      queuedAt: new Date().toISOString(),
    };
    await tx(db, "readwrite", function (s) { return s.put(item); });
    // Ask for a Background Sync where it exists (Chrome, Edge, Android).
    try {
      var reg = await swReady(1500);
      if (reg && reg.sync) await reg.sync.register(SYNC_TAG);
    } catch (e) { /* no Background Sync — the fallbacks below cover it */ }
    return item.id;
  }

  // online, visibilitychange and load can all fire within a moment of each other.
  // Without this lock two flushes read the same queue before either deletes from
  // it, and the same brief is POSTed twice — one visitor, two identical emails.
  var flushing = false;

  async function flush() {
    if (flushing || !navigator.onLine) return;
    flushing = true;
    try {
      await flushInner();
    } finally {
      flushing = false;
    }
  }

  async function flushInner() {
    // Prefer the service worker so a flush can outlive the page.
    try {
      var reg = await swReady(1500);
      if (reg && reg.active) { reg.active.postMessage({ type: "flush-briefs", endpoint: ENDPOINT }); return; }
    } catch (e) { /* fall through to the in-page path */ }

    // No service worker (private mode, unsupported browser): send from here.
    var db = await openDB();
    var items = await tx(db, "readonly", function (s) { return s.getAll(); });
    for (var i = 0; i < items.length; i++) {
      var item = items[i];
      // Fall back to the current ENDPOINT: briefs captured before one was
      // configured must still go out once it is, not stay stuck forever.
      var target = item.endpoint || ENDPOINT;
      if (!target) continue;
      try {
        // A token captured when the brief was written is long dead by now, so
        // take a new one. If the page has no grecaptcha this is "" and the
        // endpoint accepts the brief flagged rather than dropping it.
        var t = await recaptchaToken();
        var res = await fetch(target, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(Object.assign({ briefId: item.id, recaptchaToken: t }, item.payload)),
        });
        // Mirror the service worker: 2xx delivered, 4xx (not 429) rejected for
        // good. Without the 4xx branch a permanently-rejected brief is retried
        // on every reconnect forever and the queue never drains.
        var drop = res.ok || (res.status >= 400 && res.status < 500 && res.status !== 429);
        if (drop) {
          await tx(db, "readwrite", (function (id) {
            return function (s) { return s.delete(id); };
          })(item.id));
        }
      } catch (e) { break; } // still offline; keep the rest queued
    }
  }

  async function submitBrief(payload) {
    // Online and configured: try the direct send first so the visitor gets a
    // real confirmation rather than an optimistic one.
    if (navigator.onLine && ENDPOINT) {
      try {
        var token = await recaptchaToken();
        var res = await fetch(ENDPOINT, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(Object.assign({ recaptchaToken: token }, payload)),
        });
        if (res.ok) return { status: "sent" };
      } catch (e) { /* fall through and queue it */ }
    }
    await enqueue(payload);
    return { status: "queued" };
  }

  async function pendingCount() {
    try {
      var db = await openDB();
      var items = await tx(db, "readonly", function (s) { return s.getAll(); });
      return items.length;
    } catch (e) { return 0; }
  }

  // ---------------------------------------------------------------- wiring
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", function () {
      navigator.serviceWorker.register("/sw.js").catch(function () {
        // Registration fails on file:// and on plain http from a remote host.
        // The site still works; it just is not available offline.
      });
    });
    navigator.serviceWorker.addEventListener("message", function (e) {
      if (e.data && e.data.type === "brief-sent") {
        window.dispatchEvent(new CustomEvent("hp:brief-sent", { detail: e.data }));
      }
    });
  }

  // Three chances to drain the queue: reconnect, page load, and tab refocus.
  // Between them, a queued brief goes out whether the wait was two seconds or
  // two days, and whether or not Background Sync exists on the device.
  window.addEventListener("online", flush);
  window.addEventListener("load", function () { setTimeout(flush, 1200); });
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "visible") flush();
  });

  window.HPOffline = {
    submitBrief: submitBrief,
    flush: flush,
    pendingCount: pendingCount,
    isConfigured: function () { return !!ENDPOINT; },
    endpoint: ENDPOINT,
  };
})();
