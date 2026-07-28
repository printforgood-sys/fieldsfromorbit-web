// Fields From Orbit — site JS (v1 draft)
// No frameworks. Cookie-consent and "have I liked this" still use
// localStorage (that's a per-browser preference, correctly local). Real
// cross-visitor like counts are now backed by a small Cloudflare Worker +
// KV store (wired 2026-07-27) — see LIKES_API below. Counts themselves are
// never displayed on the site (matches the site's "quiet" like/vote
// philosophy — likes influence Fan Favourites ordering, not shown as a
// public number), only used to sort Fan Favourites by real popularity.

(function () {
  "use strict";

  // --- Real cross-visitor like counts (Cloudflare Worker + KV) ---
  var LIKES_API = "https://ffo-likes-api.printforgood.workers.dev";

  // --- Mobile nav toggle ---
  var toggle = document.getElementById("nav-toggle");
  var nav = document.getElementById("site-nav");
  if (toggle && nav) {
    toggle.addEventListener("click", function () {
      var open = nav.classList.toggle("open");
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
    });
  }

  // --- Cookie consent banner ---
  // Uses a "show" class rather than the `hidden` attribute: a same-
  // specificity .cookie-banner{display:flex} rule was beating [hidden] in
  // the cascade, so setting `banner.hidden = true` never actually hid it —
  // the "Got it" button looked broken even though the click handler fired.
  var banner = document.getElementById("cookie-banner");
  var acceptBtn = document.getElementById("cookie-accept");
  if (banner) {
    if (!localStorage.getItem("ffo_cookie_consent")) {
      banner.classList.add("show");
    }
    if (acceptBtn) {
      acceptBtn.addEventListener("click", function () {
        localStorage.setItem("ffo_cookie_consent", "1");
        banner.classList.remove("show");
      });
    }
  }

  // --- Like buttons ---
  function getLikes() {
    try {
      return JSON.parse(localStorage.getItem("ffo_likes") || "{}");
    } catch (e) {
      return {};
    }
  }
  function setLikes(likes) {
    localStorage.setItem("ffo_likes", JSON.stringify(likes));
  }

  var likeBtns = document.querySelectorAll(".like-overlay");
  var likes = getLikes();
  likeBtns.forEach(function (btn) {
    var code = btn.getAttribute("data-code");
    if (likes[code]) {
      btn.setAttribute("aria-pressed", "true");
      btn.setAttribute("aria-label", "Liked");
      btn.querySelector(".like-icon").innerHTML = "&#9829;"; // filled heart
    }
    btn.addEventListener("click", function () {
      if (likes[code]) return; // one like per image per browser
      likes[code] = true;
      setLikes(likes);
      btn.setAttribute("aria-pressed", "true");
      btn.setAttribute("aria-label", "Liked");
      btn.querySelector(".like-icon").innerHTML = "&#9829;";
      openSoftModal("like");
      // Best-effort: record the real, cross-visitor count server-side.
      // Never blocks or alters the UI if this fails (offline, Worker
      // down, etc.) — the local "Liked" state above already happened.
      fetch(LIKES_API + "/like", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: code }),
      }).catch(function () {});
    });
  });

  // --- Soft signup modal (shown after a like, or a framed-print waitlist join) ---
  var MODAL_COPY = {
    like: {
      title: "Liked this one?",
      body: "Get notified when we add more like it — new pieces roughly every two weeks.",
      source: "post-like",
    },
    "framed-waitlist": {
      title: "Framed prints aren't offered yet",
      body: "Join the waitlist and we'll email you the moment framed prints are available.",
      source: "framed-waitlist",
    },
  };
  var softModal = null;
  function buildSoftModal(copy) {
    var modal = document.createElement("div");
    modal.className = "soft-modal";
    modal.id = "soft-modal";
    modal.innerHTML =
      '<div class="soft-modal-inner">' +
      "<h3>" + copy.title + "</h3>" +
      "<p>" + copy.body + "</p>" +
      '<form class="signup-form" data-source="' + copy.source + '" method="post" target="_blank" ' +
      'action="https://fieldsfromorbit.us18.list-manage.com/subscribe/post?u=690262a37721cb1bb52b9566c&id=cdc4ff7f0b&f_id=00f1b0e6f0">' +
      '<input type="email" name="EMAIL" placeholder="you@example.com" required>' +
      '<input type="hidden" name="SOURCE_PAGE" value="' + copy.source + '">' +
      '<div aria-hidden="true" style="position: absolute; left: -5000px;"><input type="text" name="b_690262a37721cb1bb52b9566c_cdc4ff7f0b" tabindex="-1" value=""></div>' +
      "<button type=\"submit\">Notify me</button>" +
      "</form>" +
      '<button class="soft-modal-close" id="soft-modal-close">No thanks</button>' +
      "</div>";
    document.body.appendChild(modal);
    document.getElementById("soft-modal-close").addEventListener("click", closeSoftModal);
    modal.addEventListener("click", function (e) {
      if (e.target === modal) closeSoftModal();
    });
    return modal;
  }
  function openSoftModal(kind) {
    // `kind` is either a string key into MODAL_COPY, or a ready-made copy
    // object (used by the per-piece waitlist buttons below, since their
    // title/body/source depend on which piece and format was clicked).
    var copy = (typeof kind === "string") ? (MODAL_COPY[kind] || MODAL_COPY.like) : kind;
    if (softModal) softModal.remove();
    softModal = buildSoftModal(copy);
    softModal.classList.add("open");
  }
  function closeSoftModal() {
    if (softModal) softModal.classList.remove("open");
  }

  // --- Zoom / artwork-only popup on image pages ---
  // The main image always shows the poster (with its museum label — that's
  // what ships regardless). Both "click to zoom" and "View artwork only"
  // open the same in-page popup rather than navigating anywhere or
  // replacing the main image, they just load different sources into it.
  var mainImage = document.getElementById("main-image");
  var posterToggle = document.querySelector(".poster-toggle");

  if (mainImage) {
    var overlay = document.createElement("div");
    overlay.className = "zoom-overlay";
    var bigImg = document.createElement("img");
    overlay.appendChild(bigImg);
    document.body.appendChild(overlay);

    function openOverlay(src, alt, fit) {
      bigImg.src = src;
      bigImg.alt = alt;
      overlay.classList.toggle("fit-mode", !!fit);
      overlay.classList.add("open");
      // Lock the page behind the overlay so only the overlay itself
      // scrolls — otherwise both the page and the overlay have their own
      // scrollbar/scroll position at once, which reads as a "double
      // scrollbar" and feels broken, especially on desktop.
      document.documentElement.classList.add("lightbox-open");
    }
    function closeOverlay() {
      overlay.classList.remove("open");
      document.documentElement.classList.remove("lightbox-open");
    }

    mainImage.addEventListener("click", function () {
      // Full-resolution, scrollable — the point here is inspecting detail.
      openOverlay(mainImage.src, mainImage.alt, false);
    });
    if (posterToggle) {
      posterToggle.addEventListener("click", function () {
        // Fit-to-screen, no scrolling — this is just a quick look at the
        // bare artwork, not a detail-inspection tool.
        openOverlay(mainImage.getAttribute("data-art"), mainImage.alt + " (artwork only, no label)", true);
      });
    }
    overlay.addEventListener("click", closeOverlay);
  }

  // --- Home page: hero rotating image ---
  var carousel = document.getElementById("hero-carousel");
  if (carousel) {
    var heroSlides = carousel.querySelectorAll(".hero-slide");
    var heroCurrent = 0;
    var heroInterval = null;
    var heroPaused = false;
    var heroPrevBtn = document.getElementById("hero-prev");
    var heroNextBtn = document.getElementById("hero-next");
    var heroPauseBtn = document.getElementById("hero-pause");

    function heroShow(i) {
      heroSlides[heroCurrent].classList.remove("active");
      heroCurrent = (i + heroSlides.length) % heroSlides.length;
      heroSlides[heroCurrent].classList.add("active");
    }
    function heroNext() { heroShow(heroCurrent + 1); }
    function heroPrev() { heroShow(heroCurrent - 1); }
    function heroStart() {
      if (heroSlides.length > 1 && !heroInterval) {
        heroInterval = setInterval(heroNext, 4000);
      }
    }
    function heroStop() {
      if (heroInterval) { clearInterval(heroInterval); heroInterval = null; }
    }

    if (heroSlides.length > 1) {
      heroStart();
      if (heroPrevBtn) heroPrevBtn.addEventListener("click", function (e) {
        e.preventDefault(); e.stopPropagation(); heroPrev();
      });
      if (heroNextBtn) heroNextBtn.addEventListener("click", function (e) {
        e.preventDefault(); e.stopPropagation(); heroNext();
      });
      if (heroPauseBtn) heroPauseBtn.addEventListener("click", function (e) {
        e.preventDefault(); e.stopPropagation();
        heroPaused = !heroPaused;
        if (heroPaused) {
          heroStop();
          heroPauseBtn.innerHTML = "&#9654;";
          heroPauseBtn.setAttribute("aria-label", "Play slideshow");
        } else {
          heroStart();
          heroPauseBtn.innerHTML = "&#10073;&#10073;";
          heroPauseBtn.setAttribute("aria-label", "Pause slideshow");
        }
      });
    } else {
      if (heroPrevBtn) heroPrevBtn.style.display = "none";
      if (heroNextBtn) heroNextBtn.style.display = "none";
      if (heroPauseBtn) heroPauseBtn.style.display = "none";
    }
  }

  // --- Home page: collection + country filters ---
  var grid = document.getElementById("gallery-grid");
  if (grid) {
    var collectionBtns = document.querySelectorAll(".filter-btn[data-filter]");
    var countryBtns = document.querySelectorAll(".filter-btn[data-country]");
    var activeCollection = "all";
    var activeCountry = "all";

    function applyFilters() {
      grid.querySelectorAll(".grid-item").forEach(function (item) {
        var c = item.getAttribute("data-collection");
        var country = item.getAttribute("data-country");
        var show =
          (activeCollection === "all" || c === activeCollection) &&
          (activeCountry === "all" || country === activeCountry);
        item.style.display = show ? "" : "none";
      });
    }
    collectionBtns.forEach(function (btn) {
      btn.addEventListener("click", function () {
        collectionBtns.forEach(function (b) { b.classList.remove("active"); });
        btn.classList.add("active");
        activeCollection = btn.getAttribute("data-filter");
        applyFilters();
      });
    });
    countryBtns.forEach(function (btn) {
      btn.addEventListener("click", function () {
        countryBtns.forEach(function (b) { b.classList.remove("active"); });
        btn.classList.add("active");
        activeCountry = btn.getAttribute("data-country");
        applyFilters();
      });
    });
  }

  // --- Fan Favourites: order by real, cross-visitor like counts ---
  var favGrid = document.getElementById("favourites-grid");
  if (favGrid) {
    var items = Array.prototype.slice.call(favGrid.querySelectorAll(".grid-item"));
    var codes = items.map(function (item) { return item.getAttribute("data-fav-code"); });

    // Sort by this browser's own likes first so the page isn't blank/
    // unordered while the real counts load, then re-sort once they arrive.
    function sortByLocal() {
      items.sort(function (a, b) {
        var aLiked = likes[a.getAttribute("data-fav-code")] ? 1 : 0;
        var bLiked = likes[b.getAttribute("data-fav-code")] ? 1 : 0;
        return bLiked - aLiked;
      });
      items.forEach(function (item) { favGrid.appendChild(item); });
    }
    sortByLocal();

    fetch(LIKES_API + "/counts?codes=" + encodeURIComponent(codes.join(",")))
      .then(function (r) { return r.json(); })
      .then(function (counts) {
        items.sort(function (a, b) {
          var aCount = counts[a.getAttribute("data-fav-code")] || 0;
          var bCount = counts[b.getAttribute("data-fav-code")] || 0;
          return bCount - aCount;
        });
        items.forEach(function (item) { favGrid.appendChild(item); });
      })
      .catch(function () {
        // Worker unreachable — leave the this-browser-only ordering in place.
      });
  }

  // --- Waitlist buttons ---
  // Two situations use this same button: (1) framed prints, which aren't
  // sold for ANY piece yet, and (2) every format (digital/unframed/framed)
  // on pieces that aren't listed on Etsy yet at all (most of the catalogue,
  // as of the 2026-07-28 site expansion to all 56 ready pieces). Each click
  // tags the Mailchimp signup with the piece code and format
  // (SOURCE_PAGE like "waitlist:FFO-JP-001:digital") so real per-piece
  // demand is visible in the list later, instead of one generic signal.
  var FORMAT_LABELS = { digital: "digital download", unframed: "unframed print", framed: "framed print" };
  document.querySelectorAll(".waitlist-btn").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var code = btn.getAttribute("data-code");
      var format = btn.getAttribute("data-format") || "framed";
      var title = btn.getAttribute("data-title");
      if (!code) {
        // No data attributes present -- fall back to the original generic
        // framed-print copy so nothing breaks if this button shows up
        // somewhere without the new data-* attributes.
        openSoftModal("framed-waitlist");
        return;
      }
      var formatLabel = FORMAT_LABELS[format] || format;
      openSoftModal({
        title: "Join the waitlist",
        body: title
          ? "We'll email you the moment the " + formatLabel + " of “" + title + "” is available."
          : "We'll email you the moment this " + formatLabel + " is available.",
        source: "waitlist:" + code + ":" + format,
      });
    });
  });

  // --- Signup forms: no-op notice until a real Mailchimp form action is wired in ---
  document.querySelectorAll(".signup-form").forEach(function (form) {
    form.addEventListener("submit", function (e) {
      if (form.getAttribute("action").indexOf("YOUR-MAILCHIMP-DOMAIN") !== -1) {
        e.preventDefault();
        alert("Signup form isn't wired up to Mailchimp yet — this is a placeholder for the draft. Once the Mailchimp audience is created, swap the form action URL in build_site.py.");
      }
    });
  });
})();
