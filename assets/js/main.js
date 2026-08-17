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

  // --- "Send as a postcard" (Cloudflare Worker + Resend + D1) ---
  var POSTCARD_API = "https://ffo-postcard-api.printforgood.workers.dev/send";

  // --- Site-owned digital-download checkout (Cloudflare Worker + Stripe) ---
  // Pilot started 2026-08-17, first step off Etsy. Only pieces listed in
  // build_site.py's STRIPE_CHECKOUT_PIECES render a .stripe-checkout-btn —
  // everything else still uses a plain Etsy link or the waitlist button.
  var CHECKOUT_API = "https://ffo-checkout.printforgood.workers.dev/create-checkout-session";

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

  // --- Image page: bleed the black band behind the poster to the true
  // left edge of the screen (added 2026-08-09, per Paul's follow-up on the
  // black-letterbox change) ---
  // .image-frame-bg sits in the LEFT column of a two-column grid
  // (.image-page), so it can only ever bleed left -- the right side is
  // bounded by the .image-info sidebar in the same row. How far it needs
  // to pull left varies with viewport width AND which of the layout's
  // three breakpoints (mobile single-column / 900px 1.9fr / 1300px 2.3fr)
  // is active, so this measures the real gap live via
  // getBoundingClientRect() rather than trying to precompute it with nested
  // calc() across three breakpoints. The poster stays centered inside the
  // band (justify-content: center, set in CSS), so as the band bleeds
  // left the poster re-centers within it too, shifting left along with it.
  var frameBg = document.querySelector(".image-frame-bg");
  if (frameBg) {
    function bleedFrameBgLeft() {
      frameBg.style.marginLeft = "";
      frameBg.style.width = "";
      // Below 900px .image-page drops to a single column and the CSS
      // above switches .image-frame-bg back to centered -- matches the
      // @media (max-width: 899px) breakpoint used everywhere else in
      // style.css, so skip the bleed there rather than fighting it.
      if (window.innerWidth < 900) return;
      var rect = frameBg.getBoundingClientRect();
      if (rect.left > 0) {
        frameBg.style.marginLeft = "-" + rect.left + "px";
        frameBg.style.width = "calc(100% + " + rect.left + "px)";
      }
    }
    bleedFrameBgLeft();
    window.addEventListener("resize", bleedFrameBgLeft);
  }

  // --- Home page: hero rotating image ---
  // Two independent carousel instances -- SE Series (default) and Complete
  // Gallery -- toggled via .hero-toggle-btn. Only the visible instance's
  // auto-advance interval ever runs; the hidden one sits idle at no cost.
  // Added 2026-08-02 when SE Series became the homepage default (see
  // [[project_ffo_se_series]]); previously this was a single carousel.
  var HERO_INTERVAL_MS = 8000; // keep in sync with setInterval calls below
  var captionTitle = document.getElementById("hero-caption-title");
  var captionPlace = document.getElementById("hero-caption-place");
  var captionBlurb = document.getElementById("hero-caption-blurb");
  var captionInfo = document.getElementById("hero-caption-info");

  function setupHeroCarousel(view, isDefaultView) {
    var carousel = document.getElementById("hero-carousel-" + view);
    if (!carousel) return null;
    var slides = carousel.querySelectorAll(".hero-slide");
    var prevBtn = document.getElementById("hero-prev-" + view);
    var nextBtn = document.getElementById("hero-next-" + view);
    var pauseBtn = document.getElementById("hero-pause-" + view);
    var progressBar = document.getElementById("hero-progress-bar-" + view);
    var current = 0;
    var interval = null;
    var paused = false;

    // --- Windowed loading for hero slides ---
    // Only the default view's first slide ships a real `src` from the
    // server (see build_site.py); every other slide holds its image URL in
    // `data-src` until this pulls it in, for the current slide +/- 1 on
    // every navigation -- so at most ~3 images per instance are ever
    // fetched at once, instead of all of them (56, for Complete Gallery)
    // racing each other on page load.
    function loadSlide(i) {
      var slide = slides[(i + slides.length) % slides.length];
      var img = slide && slide.querySelector("img");
      if (img && img.dataset.src) {
        img.src = img.dataset.src;
        delete img.dataset.src;
      }
    }

    // --- Discreet "time until next slide" progress bar ---
    // A thin bar rather than a numeric countdown -- reads as ambient
    // texture, not a clock. Restarted every time the active slide changes
    // (auto-advance OR a manual arrow click), reset to empty while paused.
    function progressRestart() {
      if (!progressBar) return;
      progressBar.style.transition = "none";
      progressBar.style.width = "0%";
      // Force a reflow so the browser registers the 0% width before the
      // transition below is re-applied -- otherwise it just jumps straight
      // to 100% with no visible fill.
      progressBar.offsetHeight;
      progressBar.style.transition = "width " + (HERO_INTERVAL_MS / 1000) + "s linear";
      progressBar.style.width = "100%";
    }
    function progressReset() {
      if (!progressBar) return;
      progressBar.style.transition = "none";
      progressBar.style.width = "0%";
    }
    function updateCaption(slide) {
      // Swap the shared caption panel to match whatever piece is now
      // showing -- each hero-slide carries its own title/place/blurb/info
      // as data-* attributes (set at build time), so this is just a read.
      if (!slide || !captionTitle || !slide.dataset.title) return;
      captionTitle.textContent = slide.dataset.title;
      captionPlace.textContent = slide.dataset.place;
      captionBlurb.textContent = slide.dataset.blurb;
      captionInfo.textContent = slide.dataset.info;
    }

    function show(i) {
      slides[current].classList.remove("active");
      current = (i + slides.length) % slides.length;
      var slide = slides[current];
      slide.classList.add("active");
      loadSlide(current - 1);
      loadSlide(current + 1);
      updateCaption(slide);
      // Re-sync the auto-advance timer to *now*, whether this change came
      // from the timer ticking or a manual arrow click.
      if (interval) { clearInterval(interval); interval = null; }
      if (!paused && slides.length > 1) {
        interval = setInterval(next, HERO_INTERVAL_MS);
        progressRestart();
      } else {
        progressReset();
      }
    }
    function next() { show(current + 1); }
    function prev() { show(current - 1); }
    function start() {
      if (slides.length > 1 && !interval && !paused) {
        interval = setInterval(next, HERO_INTERVAL_MS);
        progressRestart();
      }
    }
    function stop() {
      if (interval) { clearInterval(interval); interval = null; }
      progressReset();
    }

    if (slides.length > 1) {
      // Preload the neighbors of the initially-active slide so the first
      // manual click or auto-advance is instant rather than triggering a
      // fresh fetch at the moment of transition.
      loadSlide(current - 1);
      loadSlide(current + 1);
      if (prevBtn) prevBtn.addEventListener("click", function (e) {
        e.preventDefault(); e.stopPropagation(); prev();
      });
      if (nextBtn) nextBtn.addEventListener("click", function (e) {
        e.preventDefault(); e.stopPropagation(); next();
      });
      if (pauseBtn) pauseBtn.addEventListener("click", function (e) {
        e.preventDefault(); e.stopPropagation();
        paused = !paused;
        if (paused) {
          stop();
          pauseBtn.innerHTML = "&#9654; Play";
          pauseBtn.setAttribute("aria-label", "Play slideshow");
        } else {
          start();
          pauseBtn.innerHTML = "&#10073;&#10073; Pause";
          pauseBtn.setAttribute("aria-label", "Pause slideshow");
        }
      });
    } else {
      if (prevBtn) prevBtn.style.display = "none";
      if (nextBtn) nextBtn.style.display = "none";
      if (pauseBtn) pauseBtn.style.display = "none";
    }

    // The default (SE Series) view's initial caption needs to be set on
    // load, since it never goes through show() until the timer first ticks
    // or an arrow is clicked.
    if (isDefaultView && slides.length) updateCaption(slides[current]);

    return {
      start: start,
      stop: stop,
      reset: function () {
        // Called when the visitor switches INTO this view via the toggle:
        // jump back to slide 0 and start clean, always unpaused -- so
        // switching views never resumes mid-cycle or inherits a stale
        // "paused" state/button label from before.
        paused = false;
        if (pauseBtn) {
          pauseBtn.innerHTML = "&#10073;&#10073; Pause";
          pauseBtn.setAttribute("aria-label", "Pause slideshow");
        }
        if (slides.length) {
          slides[current].classList.remove("active");
          current = 0;
          slides[0].classList.add("active");
          loadSlide(0);
          loadSlide(1);
          updateCaption(slides[0]);
        }
        stop();
        start();
      },
    };
  }

  var heroOuterEls = document.querySelectorAll(".hero-carousel-outer");
  if (heroOuterEls.length) {
    var HERO_DEFAULT_VIEW = "se";
    var heroInstances = {};
    heroOuterEls.forEach(function (outer) {
      var view = outer.getAttribute("data-view");
      heroInstances[view] = setupHeroCarousel(view, view === HERO_DEFAULT_VIEW);
    });
    if (heroInstances[HERO_DEFAULT_VIEW]) heroInstances[HERO_DEFAULT_VIEW].start();

    var activeHeroView = HERO_DEFAULT_VIEW;
    var heroToggleBtns = document.querySelectorAll(".hero-toggle-btn");
    heroToggleBtns.forEach(function (btn) {
      btn.addEventListener("click", function () {
        var view = btn.getAttribute("data-view");
        if (view === activeHeroView || !heroInstances[view]) return;
        heroToggleBtns.forEach(function (b) {
          b.classList.remove("active");
          b.setAttribute("aria-selected", "false");
        });
        btn.classList.add("active");
        btn.setAttribute("aria-selected", "true");
        heroOuterEls.forEach(function (outer) {
          outer.classList.toggle("hero-view-hidden", outer.getAttribute("data-view") !== view);
        });
        if (heroInstances[activeHeroView]) heroInstances[activeHeroView].stop();
        activeHeroView = view;
        heroInstances[view].reset();
      });
    });
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
  var FORMAT_LABELS = { digital: "digital download", canvas: "canvas print", unframed: "unframed print", framed: "framed print" };
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

  // --- Stripe-backed digital-download checkout (pilot, 2026-08-17) ---
  // Only pieces in build_site.py's STRIPE_CHECKOUT_PIECES trigger this
  // (currently just FFO-CA-018). POSTs the piece code to the ffo-checkout
  // Worker, which creates a Stripe Checkout Session and returns its URL —
  // Stripe's own hosted page collects the buyer's email and card, we never
  // touch either. On success the browser is redirected straight there.
  // Exposed on window (not just bound to .stripe-checkout-btn below) because
  // the homepage globe's preview card and lightbox are built from a separate
  // inline <script> in build_site.py and need to trigger the exact same flow
  // from their own buy-link element — see showImage()/populateLightboxImage().
  function startStripeCheckout(code, btn) {
    if (!code || !btn) return;
    var originalHTML = btn.innerHTML;
    var wasDisabled = btn.disabled;
    btn.disabled = true;
    btn.innerHTML = "<span>Loading checkout&hellip;</span>";
    fetch(CHECKOUT_API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // returnUrl lets the Worker send a cancelled checkout back to whatever
      // page the buyer was actually on (piece page, homepage globe, etc.)
      // instead of a fixed fallback -- Worker validates this is same-origin
      // before using it.
      body: JSON.stringify({ code: code, returnUrl: window.location.href }),
    })
      .then(function (res) { return res.json(); })
      .then(function (data) {
        if (data && data.url) {
          window.location.href = data.url;
        } else {
          throw new Error("no checkout url returned: " + JSON.stringify(data));
        }
      })
      .catch(function (err) {
        console.error("Checkout failed:", err);
        btn.disabled = wasDisabled;
        btn.innerHTML = originalHTML;
        alert("Sorry — checkout couldn't start. Please try again in a moment, or email us if it keeps happening.");
      });
  }
  window.startStripeCheckout = startStripeCheckout;

  document.querySelectorAll(".stripe-checkout-btn").forEach(function (btn) {
    btn.addEventListener("click", function () {
      startStripeCheckout(btn.getAttribute("data-code"), btn);
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

  // --- "Send as a postcard": reveals a tiny form, POSTs to the Worker,
  // which sends a real HTML email via Resend (poster image embedded) and
  // logs the send + optional Mailchimp opt-in. See ffo-postcard-worker.js.
  document.querySelectorAll(".postcard-toggle").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var form = btn.nextElementSibling;
      if (!form) return;
      var expanded = btn.getAttribute("aria-expanded") === "true";
      btn.setAttribute("aria-expanded", String(!expanded));
      form.hidden = expanded;
      if (!expanded) {
        var nameField = form.querySelector(".postcard-sender-name");
        if (nameField) nameField.focus();
      }
    });
  });

  document.querySelectorAll(".postcard-form").forEach(function (form) {
    var statusEl = form.querySelector(".postcard-status");
    var sendBtn = form.querySelector(".postcard-send");

    function setStatus(text, kind) {
      if (!statusEl) return;
      statusEl.textContent = text;
      statusEl.hidden = !text;
      statusEl.className = "postcard-status" + (kind ? " is-" + kind : "");
    }

    form.addEventListener("submit", function (e) {
      e.preventDefault();

      var senderEmailField = form.querySelector(".postcard-sender-email");
      var recipientEmailField = form.querySelector(".postcard-email");
      var senderEmail = senderEmailField ? senderEmailField.value.trim() : "";
      var recipientEmail = recipientEmailField ? recipientEmailField.value.trim() : "";
      if (!senderEmail) { if (senderEmailField) senderEmailField.focus(); return; }
      if (!recipientEmail) { if (recipientEmailField) recipientEmailField.focus(); return; }

      var nameField = form.querySelector(".postcard-sender-name");
      var noteField = form.querySelector(".postcard-note");
      var optinField = form.querySelector(".postcard-optin-check");
      var honeypotField = form.querySelector(".postcard-website");

      var payload = {
        senderEmail: senderEmail,
        senderName: nameField ? nameField.value.trim() : "",
        senderOptin: optinField ? optinField.checked : false,
        recipientEmail: recipientEmail,
        note: noteField ? noteField.value.trim() : "",
        ffoCode: form.getAttribute("data-code") || "",
        pieceTitle: form.getAttribute("data-title") || "",
        place: form.getAttribute("data-place") || "",
        pieceUrl: form.getAttribute("data-url") || "",
        website: honeypotField ? honeypotField.value : "",
      };

      if (sendBtn) sendBtn.disabled = true;
      setStatus("Sending…", "");

      fetch(POSTCARD_API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }).then(function (res) {
        return res.json().then(function (data) { return { ok: res.ok, data: data }; });
      }).then(function (result) {
        if (sendBtn) sendBtn.disabled = false;
        if (result.ok) {
          setStatus("Sent! " + payload.recipientEmail + " should see it shortly.", "success");
          form.reset();
        } else {
          setStatus((result.data && result.data.error) || "Couldn't send that — try again.", "error");
        }
      }).catch(function () {
        if (sendBtn) sendBtn.disabled = false;
        setStatus("Couldn't reach the server — check your connection and try again.", "error");
      });
    });
  });
})();
