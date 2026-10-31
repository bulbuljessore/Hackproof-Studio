// HackProof Studio blog: hover preview of each guide's featured image, and copy-link.
(function () {
  var pv = document.getElementById("pv");
  if (pv) {
    var img = pv.querySelector("img"), cap = pv.querySelector("div");
    var fine = window.matchMedia && window.matchMedia("(hover: hover) and (pointer: fine)").matches;
    var calm = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    var place = function (e) {
      var w = pv.offsetWidth || 300, h = pv.offsetHeight || 240, l = e.clientX + 28;
      if (l + w > window.innerWidth - 16) l = e.clientX - w - 28;
      var t = Math.min(Math.max(16, e.clientY - h / 2), window.innerHeight - h - 16);
      pv.style.transform = "translate3d(" + Math.round(l) + "px," + Math.round(t) + "px,0)";
    };
    if (fine && !calm) {
      Array.prototype.forEach.call(document.querySelectorAll("[data-pv]"), function (a) {
        a.addEventListener("mouseenter", function (e) {
          if (window.innerWidth < 1024 || !a.getAttribute("data-pv")) return;
          if (img.getAttribute("src") !== a.getAttribute("data-pv")) img.src = a.getAttribute("data-pv");
          cap.textContent = a.getAttribute("data-pvcap") || "";
          pv.style.opacity = "1";
          place(e);
        });
        a.addEventListener("mousemove", function (e) { if (pv.style.opacity === "1") place(e); });
        a.addEventListener("mouseleave", function () { pv.style.opacity = "0"; });
      });
      window.addEventListener("scroll", function () { pv.style.opacity = "0"; }, { passive: true });
    }
  }
  Array.prototype.forEach.call(document.querySelectorAll(".copylink"), function (b) {
    b.addEventListener("click", function () {
      var label = b.querySelector("span");
      var done = function () { label.textContent = "Copied ✓"; setTimeout(function () { label.textContent = "Copy link"; }, 1800); };
      try { navigator.clipboard.writeText(b.getAttribute("data-url")).then(done, done); } catch (e) { done(); }
    });
  });
  // MENU overlay: open and close, and the preview panel follows the row under the pointer or focus.
  var menu = document.getElementById("menu"), btn = document.querySelector(".menubtn");
  if (menu && btn) {
    var mImg = document.getElementById("menu-img"), mLabel = menu.querySelector(".menu-label"),
        mNote = menu.querySelector(".menu-note"), mForm = menu.querySelector(".menu-form"),
        rows = Array.prototype.slice.call(menu.querySelectorAll(".mrow"));
    var preview = function (a) {
      var src = a.getAttribute("data-prev-img");
      mImg.hidden = !src;
      if (src && mImg.getAttribute("src") !== src) mImg.setAttribute("src", src);
      mImg.style.objectFit = a.getAttribute("data-prev-fit") || "contain";
      mLabel.textContent = a.getAttribute("data-prev-label") || "";
      mNote.textContent = a.getAttribute("data-prev-note") || "";
      mForm.hidden = a.getAttribute("data-prev-form") !== "1";
    };
    var open = function () {
      menu.hidden = false;
      btn.setAttribute("aria-expanded", "true");
      document.body.style.overflow = "hidden";
      var cur = menu.querySelector(".mrow.on");
      if (cur) preview(cur);
    };
    var close = function () {
      menu.hidden = true;
      btn.setAttribute("aria-expanded", "false");
      document.body.style.overflow = "";
      btn.focus();
    };
    btn.addEventListener("click", open);
    menu.querySelector(".menuclose").addEventListener("click", close);
    document.addEventListener("keydown", function (e) { if (e.key === "Escape" && !menu.hidden) close(); });
    rows.forEach(function (a) {
      a.addEventListener("mouseenter", function () { preview(a); });
      a.addEventListener("focus", function () { preview(a); });
    });
  }
})();
