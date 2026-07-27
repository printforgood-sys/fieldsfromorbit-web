// Fields From Orbit — site JS (v1 draft)
// No frameworks, no localStorage restrictions here (real deployed site, not a
// Claude artifact) — likes/cookie-consent use localStorage since there's no
// backend yet. See README.md 06-website section: cross-visitor like counts
// need a real backend before this is more than a per-browser preview.

(function () {
  "use strict";

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

  var likeBtns = document.querySelectorAll(".like-btn");
  var likes = getLikes();
  likeBtns.forEach(function (btn) {
    var code = btn.getAttribute("data-code");
    if (likes[code]) {
      btn.setAttribute("aria-pressed", "true");
      btn.querySelector(".like-icon").innerHTML = "&#9829;"; // filled heart
      btn.querySelector(".like-label").textContent = "Liked";
    }
    btn.addEventListener("click", function () {
      if (likes[code]) return; // one like per image per browser
      likes[code] = true;
      setLikes(likes);
      btn.setAttribute("aria-pressed", "true");
      btn.querySelector(".like-icon").innerHTML = "&#9829;";
      btn.querySelector(".like-label").textContent = "Liked";
      openSoftModal("like");
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
      'action="https://YOUR-MAILCHIMP-DOMAIN.list-manage.com/subscribe/post?u=REPLACE_U&id=REPLACE_ID">' +
      '<input type="email" name="EMAIL" placeholder="you@example.com" required>' +
      '<input type="hidden" name="SOURCE_PAGE" value="' + copy.source + '">' +
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
    var copyKey = (typeof kind === "string" && MODAL_COPY[kind]) ? kind : "like";
    if (softModal) softModal.remove();
    softModal = buildSoftModal(MODAL_COPY[copyKey]);
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
    if (heroSlides.length > 1) {
      setInterval(function () {
        heroSlides[heroCurrent].classList.remove("active");
        heroCurrent = (heroCurrent + 1) % heroSlides.length;
        heroSlides[heroCurrent].classList.add("active");
      }, 4000);
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

  // --- Fan Favourites: nudge order using this browser's own likes as a preview ---
  var favGrid = document.getElementById("favourites-grid");
  if (favGrid) {
    var items = Array.prototype.slice.call(favGrid.querySelectorAll(".grid-item"));
    items.sort(function (a, b) {
      var aLiked = likes[a.getAttribute("data-fav-code")] ? 1 : 0;
      var bLiked = likes[b.getAttribute("data-fav-code")] ? 1 : 0;
      return bLiked - aLiked;
    });
    items.forEach(function (item) { favGrid.appendChild(item); });
  }

  // --- Framed-print waitlist buttons (framed isn't sold yet) ---
  document.querySelectorAll(".waitlist-btn").forEach(function (btn) {
    btn.addEventListener("click", function () { openSoftModal("framed-waitlist"); });
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
