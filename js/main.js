/* =====================================================================
   GM Scrapmetal Limited: main JavaScript
   ---------------------------------------------------------------------
   Contents
     1. Helpers
     2. Contact details (filled in from js/config.js)
     3. WhatsApp links
     4. Header: scroll effect, mobile menu, active page
     5. Scroll animations
     6. Gallery + lightbox (photos uploaded in admin.html, published only)
     7. Enquiry forms → email (Formspree) + admin dashboard + WhatsApp
     8. Start everything when the page has loaded
   Contact details can also be changed in admin.html → Website Settings;
   those saved values replace the ones in js/config.js.
   ===================================================================== */

(function () {
  "use strict";

  var config = window.SITE_CONFIG || {};
  var PLACEHOLDER = "To be confirmed";

  // Tells the CSS that JavaScript is running (used by scroll animations).
  document.documentElement.classList.add("js");

  /* 1. HELPERS -------------------------------------------------------- */

  /** Keep only the digits of a phone number: "+255 748 207 225" → "255748207225" */
  function digitsOnly(value) {
    return String(value || "").replace(/\D/g, "");
  }

  function hasWhatsApp() {
    return digitsOnly(config.whatsapp).length >= 9;
  }

  /** Build a WhatsApp click-to-chat link with a pre-written message. */
  function whatsappLink(message) {
    return "https://wa.me/" + digitsOnly(config.whatsapp) + "?text=" + encodeURIComponent(message);
  }

  /** Supabase address from config.js, or null when not set up. */
  function supabaseBase() {
    var s = config.supabase || {};
    if (!s.url || !s.anonKey || !window.fetch) return null;
    return s.url.replace(/\/+$/, "");
  }

  function supabaseHeaders(extra) {
    var headers = { apikey: config.supabase.anonKey };
    for (var key in extra || {}) headers[key] = extra[key];
    return headers;
  }

  /**
   * Contact details saved in the admin dashboard (Website Settings) replace
   * the ones in config.js. Resolves true when something was loaded.
   */
  function loadSiteSettings() {
    var base = supabaseBase();
    if (!base) return Promise.resolve(false);
    return fetch(base + "/rest/v1/site_settings?select=data&id=eq.1", { headers: supabaseHeaders() })
      .then(function (res) {
        return res.ok ? res.json() : [];
      })
      .then(function (rows) {
        var data = rows && rows[0] && rows[0].data;
        if (!data || typeof data !== "object") return false;
        if (Array.isArray(data.phones)) {
          config.phones = data.phones.filter(function (p) {
            return typeof p === "string" && p.trim();
          });
        }
        ["whatsapp", "email", "address", "businessHours"].forEach(function (key) {
          if (typeof data[key] === "string") config[key] = data[key];
        });
        if (typeof data.mapEmbedUrl === "string" && (data.mapEmbedUrl === "" || /^https:\/\/www\.google\.com\/maps/.test(data.mapEmbedUrl))) {
          config.mapEmbedUrl = data.mapEmbedUrl;
        }
        return true;
      })
      .catch(function () {
        return false; // keep the details from config.js
      });
  }

  /** "2026-10-12" → "12 October 2026" */
  function formatDate(value) {
    if (!value) return "";
    var d = new Date(value);
    if (isNaN(d.getTime())) return value;
    return d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  }

  /* 2. CONTACT DETAILS ------------------------------------------------
     Any element with data-field="phone|whatsapp|email|address|businessHours"
     is filled with the value from config.js. If the value is empty it
     shows "To be confirmed". Links (<a>) also get the right href. */
  function fillContactDetails() {
    var fields = document.querySelectorAll("[data-field]");

    fields.forEach(function (el) {
      var key = el.getAttribute("data-field");

      // Phone numbers: a list, each shown as its own "tap to call" link
      if (key === "phones") {
        var phones = (config.phones || []).filter(Boolean);
        el.textContent = "";
        el.classList.remove("is-placeholder");
        if (!phones.length) {
          el.textContent = PLACEHOLDER;
          el.classList.add("is-placeholder");
          return;
        }
        phones.forEach(function (number, i) {
          if (i > 0) el.appendChild(document.createElement("br"));
          var link = document.createElement("a");
          link.href = "tel:+" + digitsOnly(number);
          link.textContent = number;
          el.appendChild(link);
        });
        return;
      }

      var value = config[key] || "";

      if (!value) {
        el.textContent = PLACEHOLDER;
        el.classList.add("is-placeholder");
        el.removeAttribute("href");
        return;
      }

      el.textContent = value;
      el.classList.remove("is-placeholder");

      if (el.tagName === "A") {
        if (key === "email") el.href = "mailto:" + value;
        if (key === "whatsapp") {
          el.href = whatsappLink(config.whatsappMessages.general);
          el.target = "_blank";
          el.rel = "noopener";
        }
      }
    });

    // Current year in the footer
    document.querySelectorAll("[data-year]").forEach(function (el) {
      el.textContent = new Date().getFullYear();
    });

    // Google Map on the contact page
    var map = document.getElementById("map");
    if (map) {
      if (config.mapEmbedUrl) {
        var frame = map.querySelector("iframe");
        if (frame.getAttribute("src") !== config.mapEmbedUrl) frame.src = config.mapEmbedUrl;
        map.hidden = false;
      } else {
        map.hidden = true;
      }
    }
  }

  /* 3. WHATSAPP LINKS -------------------------------------------------
     Any element with data-whatsapp="general|supplier|buyer" becomes a
     WhatsApp link with the matching pre-written message from config.js.
     If no number is set, the button is greyed out instead of broken. */
  function setupWhatsAppLinks() {
    document.querySelectorAll("[data-whatsapp]").forEach(function (el) {
      var type = el.getAttribute("data-whatsapp") || "general";

      if (!hasWhatsApp()) {
        el.classList.add("is-disabled");
        el.removeAttribute("href");
        el.setAttribute("aria-disabled", "true");
        el.title = "WhatsApp number to be confirmed";
        return;
      }

      el.classList.remove("is-disabled");
      el.removeAttribute("aria-disabled");
      el.removeAttribute("title");
      el.href = whatsappLink(config.whatsappMessages[type] || config.whatsappMessages.general);
      el.target = "_blank";
      el.rel = "noopener";
    });
  }

  /* 4. HEADER ---------------------------------------------------------- */
  function setupHeader() {
    var header = document.querySelector(".site-header");
    var toggle = document.querySelector(".menu-toggle");
    var menu = document.getElementById("mobile-menu");
    if (!header) return;

    // Solid background once the visitor scrolls down
    function onScroll() {
      var menuOpen = toggle && toggle.getAttribute("aria-expanded") === "true";
      header.classList.toggle("is-solid", window.scrollY > 24 || menuOpen);
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();

    // Mobile menu open / close
    function setMenu(open) {
      toggle.setAttribute("aria-expanded", String(open));
      toggle.querySelector(".sr-only").textContent = open ? "Close menu" : "Open menu";
      menu.hidden = !open;
      document.body.style.overflow = open ? "hidden" : "";
      onScroll();
    }
    if (toggle && menu) {
      toggle.addEventListener("click", function () {
        setMenu(toggle.getAttribute("aria-expanded") !== "true");
      });
      document.addEventListener("keydown", function (e) {
        if (e.key === "Escape" && !menu.hidden) {
          setMenu(false);
          toggle.focus();
        }
      });
    }

    // Highlight the link of the current page.
    // Works for both "contact.html" and "contact" (some hosts hide ".html").
    var page = (location.pathname.split("/").pop() || "index").replace(/\.html$/, "");
    document.querySelectorAll(".main-nav a, .mobile-menu a").forEach(function (link) {
      if (link.getAttribute("href").replace(/\.html$/, "") === page) link.setAttribute("aria-current", "page");
    });
  }

  /* 5. SCROLL ANIMATIONS ---------------------------------------------- */
  function setupReveal() {
    var items = document.querySelectorAll(".reveal");

    if (!("IntersectionObserver" in window)) {
      items.forEach(function (el) {
        el.classList.add("is-visible");
      });
      return;
    }

    var observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            observer.unobserve(entry.target);
          }
        });
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.08 }
    );

    items.forEach(function (el) {
      observer.observe(el);
    });
  }

  /* 5b. COUNTING NUMBERS ----------------------------------------------
     <span data-count="25">25</span> counts up from 0 to 25 when it
     scrolls into view. Without JavaScript the final number simply shows. */
  function setupCounters() {
    var counters = document.querySelectorAll("[data-count]");
    var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!counters.length || reduceMotion || !("IntersectionObserver" in window)) return;

    function animate(el) {
      var target = parseInt(el.getAttribute("data-count"), 10) || 0;
      var duration = 1800; // milliseconds
      var start = null;

      function frame(time) {
        if (start === null) start = time;
        var progress = Math.min((time - start) / duration, 1);
        var eased = 1 - Math.pow(1 - progress, 3); // fast start, gentle finish
        el.textContent = Math.round(target * eased);
        if (progress < 1) requestAnimationFrame(frame);
      }
      requestAnimationFrame(frame);
    }

    var observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            animate(entry.target);
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.5 }
    );

    counters.forEach(function (el) {
      el.textContent = "0";
      observer.observe(el);
    });
  }

  /* 6. GALLERY + LIGHTBOX ---------------------------------------------
     Photos come from two places:
       - photos uploaded on the admin page (stored in Supabase)
       - the "gallery" list in config.js
     <div data-gallery data-limit="6"> shows at most 6 photos (home page). */

  /**
   * Load the PUBLISHED photos uploaded through the admin dashboard.
   * Resolves to { photos: [...], failed: true/false }.
   */
  function fetchUploadedPhotos() {
    var base = supabaseBase();
    if (!base) return Promise.resolve({ photos: [], failed: false });

    return fetch(
      base +
        "/rest/v1/gallery_photos?select=image_path,title,caption,alt,category,taken_on" +
        "&published=eq.true&order=sort_order.asc,created_at.desc",
      { headers: supabaseHeaders() }
    )
      .then(function (res) {
        if (!res.ok) throw new Error("HTTP " + res.status);
        return res.json();
      })
      .then(function (rows) {
        return {
          failed: false,
          photos: rows.map(function (row) {
            return {
              image: base + "/storage/v1/object/public/gallery/" + encodeURI(row.image_path),
              title: row.title,
              caption: row.caption,
              alt: row.alt,
              category: row.category,
              date: row.taken_on,
            };
          }),
        };
      })
      .catch(function () {
        return { photos: [], failed: true }; // offline or a server problem
      });
  }

  function setupGallery() {
    var container = document.querySelector("[data-gallery]");
    if (!container) return;

    var empty = container.querySelector(".empty-state");
    var status = container.querySelector(".gallery-status");
    if (!status) {
      status = document.createElement("div");
      status.className = "gallery-status";
      container.insertBefore(status, container.querySelector(".gallery-grid"));
    }

    var local = (config.gallery || []).filter(function (p) {
      return p && p.image;
    });

    function load() {
      empty.hidden = true;
      status.hidden = !supabaseBase();
      status.textContent = "Loading photos…";

      fetchUploadedPhotos().then(function (result) {
        var photos = result.photos.concat(local);
        status.hidden = true;

        if (result.failed && photos.length === 0) {
          // Could not reach the server and nothing else to show
          status.hidden = false;
          status.textContent = "We couldn't load the photos right now. Please check your connection. ";
          var retry = document.createElement("button");
          retry.type = "button";
          retry.className = "btn btn-outline btn-sm";
          retry.textContent = "Try again";
          retry.addEventListener("click", load);
          status.appendChild(retry);
          return;
        }
        showGallery(container, photos);
      });
    }
    load();
  }

  function showGallery(container, photos) {
    var limit = parseInt(container.getAttribute("data-limit"), 10) || 0;
    var grid = container.querySelector(".gallery-grid");
    var filterBar = container.querySelector(".filters");
    var empty = container.querySelector(".empty-state");
    var viewAll = document.querySelector("[data-gallery-link]");
    var dialog = document.getElementById("lightbox");
    var activeFilter = "All";
    var visible = [];
    var current = 0;

    if (photos.length === 0) {
      empty.hidden = false;
      return;
    }
    empty.hidden = true;
    if (viewAll) viewAll.hidden = false;
    if (filterBar) filterBar.innerHTML = "";

    // Category filter buttons (only categories that have photos)
    var used = (config.galleryCategories || []).filter(function (cat) {
      return photos.some(function (p) {
        return p.category === cat;
      });
    });
    if (filterBar && !limit && used.length > 1) {
      ["All"].concat(used).forEach(function (cat) {
        var btn = document.createElement("button");
        btn.type = "button";
        btn.textContent = cat;
        btn.setAttribute("aria-pressed", String(cat === activeFilter));
        btn.addEventListener("click", function () {
          activeFilter = cat;
          filterBar.querySelectorAll("button").forEach(function (b) {
            b.setAttribute("aria-pressed", String(b.textContent === cat));
          });
          render();
        });
        filterBar.appendChild(btn);
      });
      filterBar.hidden = false;
    }

    function render() {
      visible = photos.filter(function (p) {
        return activeFilter === "All" || p.category === activeFilter;
      });
      if (limit) visible = visible.slice(0, limit);

      grid.innerHTML = "";
      visible.forEach(function (photo, index) {
        var li = document.createElement("li");
        var btn = document.createElement("button");
        btn.type = "button";
        btn.className = "gallery-item";
        btn.addEventListener("click", function () {
          openLightbox(index);
        });

        var img = document.createElement("img");
        img.src = photo.image;
        img.alt = photo.alt || photo.title || photo.caption || "Gallery photo";
        img.loading = "lazy";
        btn.appendChild(img);

        // Caption overlay (built with textContent so text is never treated as HTML)
        var cap = document.createElement("span");
        cap.className = "caption";
        if (photo.category) addSpan(cap, "cat", photo.category);
        if (photo.title) addSpan(cap, "title", photo.title);
        if (photo.caption) addSpan(cap, "", photo.caption);
        if (photo.date) addSpan(cap, "date", formatDate(photo.date));
        btn.appendChild(cap);

        li.appendChild(btn);
        grid.appendChild(li);
      });
    }

    function addSpan(parent, className, text) {
      var span = document.createElement("span");
      span.style.display = "block";
      if (className) span.className = className;
      span.textContent = text;
      parent.appendChild(span);
    }

    function showPhoto() {
      var photo = visible[current];
      dialog.querySelector("img").src = photo.image;
      dialog.querySelector("img").alt = photo.alt || photo.title || photo.caption || "";
      dialog.querySelector(".lightbox-caption").textContent = [photo.title, photo.caption].filter(Boolean).join(": ");
      var meta = [photo.category, formatDate(photo.date)].filter(Boolean).join(" · ");
      if (visible.length > 1) meta += (meta ? " · " : "") + (current + 1) + " of " + visible.length;
      dialog.querySelector(".lightbox-meta").textContent = meta;
      dialog.querySelectorAll(".lightbox-prev, .lightbox-next").forEach(function (b) {
        b.hidden = visible.length < 2;
      });
    }

    function openLightbox(index) {
      current = index;
      showPhoto();
      dialog.showModal();
    }

    function step(direction) {
      current = (current + direction + visible.length) % visible.length;
      showPhoto();
    }

    render();

    // The lightbox buttons always use the latest photo list
    dialog.stepPhoto = step;

    // ...but are only wired up once per page
    if (dialog.getAttribute("data-ready")) return;
    dialog.setAttribute("data-ready", "1");

    dialog.querySelector(".lightbox-close").addEventListener("click", function () {
      dialog.close();
    });
    dialog.querySelector(".lightbox-prev").addEventListener("click", function () {
      dialog.stepPhoto(-1);
    });
    dialog.querySelector(".lightbox-next").addEventListener("click", function () {
      dialog.stepPhoto(1);
    });
    dialog.addEventListener("keydown", function (e) {
      if (e.key === "ArrowRight") dialog.stepPhoto(1);
      if (e.key === "ArrowLeft") dialog.stepPhoto(-1);
    });
    // Click on the dark background closes the lightbox
    dialog.addEventListener("click", function (e) {
      if (e.target === dialog || e.target.classList.contains("lightbox-inner")) dialog.close();
    });
  }

  /* 7. ENQUIRY FORMS → WHATSAPP ---------------------------------------
     When a visitor submits a form:
       1. each field is checked (required, phone, email, number...)
       2. if all is fine, the answers are put into one message
       3. WhatsApp opens to the business number with that message
     The visitor then presses "Send" in WhatsApp. */

  // Error messages for each kind of check
  var MESSAGES = {
    required: "Please fill in this field.",
    select: "Please choose an option.",
    phone: "Enter a valid phone number, e.g. +255 7XX XXX XXX.",
    email: "Enter a valid email address.",
    number: "Enter a number greater than 0, e.g. 500.",
    consent: "Please confirm that we may contact you about this enquiry.",
    phoneOrEmail: "Please give a phone number or an email address.",
  };

  function isValidPhone(value) {
    var digits = digitsOnly(value);
    return /^\+?[\d\s()-]+$/.test(value) && digits.length >= 9 && digits.length <= 15;
  }

  function isValidEmail(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value);
  }

  /** Check one field. Returns an error message, or "" if it is fine. */
  function checkField(input) {
    var value = input.type === "checkbox" ? input.checked : input.value.trim();
    var rule = input.getAttribute("data-validate");

    if (input.type === "checkbox") {
      return input.required && !value ? MESSAGES.consent : "";
    }
    if (input.required && !value) {
      if (input.getAttribute("data-error")) return input.getAttribute("data-error");
      return input.tagName === "SELECT" ? MESSAGES.select : MESSAGES.required;
    }
    if (!value) return "";
    if (rule === "phone" && !isValidPhone(value)) return MESSAGES.phone;
    if (input.type === "email" && !isValidEmail(value)) return MESSAGES.email;
    if (rule === "number" && !(parseFloat(value.replace(",", ".")) > 0 && /^\d+([.,]\d+)?$/.test(value))) {
      return MESSAGES.number;
    }
    return "";
  }

  /** Show (or clear) an error message under a field. */
  function showError(input, message) {
    var field = input.closest(".field");
    if (!field) return;
    var error = field.querySelector(".error-text");

    if (!error) {
      error = document.createElement("p");
      error.className = "error-text";
      error.id = input.id + "-error";
      field.appendChild(error);
    }

    error.textContent = message;
    error.hidden = !message;
    field.classList.toggle("has-error", Boolean(message));

    if (message) {
      input.setAttribute("aria-invalid", "true");
      input.setAttribute("aria-describedby", error.id);
    } else {
      input.removeAttribute("aria-invalid");
      input.removeAttribute("aria-describedby");
    }
  }

  /** Collect the answers as [label, value] pairs, e.g. ["Full name", "Asha"]. */
  function collectFields(form) {
    var fields = [];
    form.querySelectorAll("[data-label]").forEach(function (input) {
      if (input.type === "radio" && !input.checked) return;
      var value = input.value.trim();
      if (!value) return;

      // Add the unit after the quantity, e.g. "500 kg"
      var unitId = input.getAttribute("data-unit");
      if (unitId) value += " " + document.getElementById(unitId).value;

      fields.push([input.getAttribute("data-label"), value]);
    });
    return fields;
  }

  /** Put the answers into a readable WhatsApp message. */
  function buildMessage(form, fields) {
    var lines = ["Hello " + config.companyName + ",", "", form.getAttribute("data-title"), ""];
    fields.forEach(function (pair) {
      lines.push(pair[0] + ": " + pair[1]);
    });
    return lines.join("\n");
  }

  var formSettings = config.forms || {};

  function hasFormspree() {
    return /^https:\/\/formspree\.io\/f\/[\w-]+$/.test(formSettings.formspreeEndpoint || "");
  }

  /**
   * Send the answers to Formspree, which emails them to the business and
   * keeps a copy in the Formspree inbox. Resolves to true if it worked.
   */
  function sendToFormspree(form, fields) {
    var data = new FormData();
    var name = "";
    var email = "";

    fields.forEach(function (pair) {
      data.append(pair[0], pair[1]);
      if (/name/i.test(pair[0]) && !name) name = pair[1];
      if (pair[0] === "Email") email = pair[1];
    });
    data.append("_subject", "Website: " + form.getAttribute("data-title") + (name ? " – " + name : ""));
    if (email) data.append("_replyto", email); // so you can reply straight to the visitor

    return fetch(formSettings.formspreeEndpoint, {
      method: "POST",
      body: data,
      headers: { Accept: "application/json" },
      keepalive: true, // finish sending even if the page changes to WhatsApp
    })
      .then(function (res) {
        return res.ok;
      })
      .catch(function () {
        return false;
      });
  }

  /**
   * Save the enquiry in Supabase so it appears in the admin dashboard
   * (Supplier Enquiries / Buyer Enquiries / Messages). Visitors can add
   * enquiries but never read them. Resolves to true if it worked.
   */
  function saveToDashboard(form, fields) {
    var base = supabaseBase();
    if (!base) return Promise.resolve(false);

    function find(pattern) {
      for (var i = 0; i < fields.length; i++) if (pattern.test(fields[i][0])) return fields[i][1];
      return "";
    }
    var body = {
      type: form.getAttribute("data-type") || "contact",
      name: find(/name/i).slice(0, 160),
      company: find(/^company/i).slice(0, 160),
      phone: find(/^phone/i).slice(0, 40),
      email: find(/^email/i).slice(0, 160),
      summary: find(/material category|material required|subject/i).slice(0, 300),
      details: fields,
    };

    return fetch(base + "/rest/v1/enquiries", {
      method: "POST",
      headers: supabaseHeaders({ "Content-Type": "application/json", Prefer: "return=minimal" }),
      body: JSON.stringify(body),
      keepalive: true,
    })
      .then(function (res) {
        return res.ok;
      })
      .catch(function () {
        return false;
      });
  }

  function setupForms() {
    // Pre-select a material when coming from a "What We Buy" card,
    // e.g. sell-your-scrap.html?material=Ferrous%20metals
    var material = new URLSearchParams(location.search).get("material");
    var materialSelect = document.getElementById("materialCategory");
    if (material && materialSelect) {
      Array.prototype.forEach.call(materialSelect.options, function (opt) {
        if (opt.value === material) materialSelect.value = material;
      });
    }

    document.querySelectorAll("form[data-enquiry]").forEach(function (form) {
      var inputs = form.querySelectorAll("input:not([type=radio]):not(.hp-input), select, textarea");
      var done = form.parentElement.querySelector(".form-done");
      var summaryError = form.querySelector(".form-summary-error");

      // Re-check a field when the visitor leaves it or corrects it
      inputs.forEach(function (input) {
        input.addEventListener("blur", function () {
          showError(input, checkField(input));
        });
        input.addEventListener("input", function () {
          if (input.closest(".field.has-error")) showError(input, checkField(input));
        });
        input.addEventListener("change", function () {
          if (input.closest(".field.has-error")) showError(input, checkField(input));
        });
      });

      form.addEventListener("submit", function (event) {
        event.preventDefault();

        // Spam check: real visitors never fill the hidden field
        var honeypot = form.querySelector(".hp-input");
        if (honeypot && honeypot.value) return;

        // Check every field
        var firstInvalid = null;
        inputs.forEach(function (input) {
          var message = checkField(input);
          showError(input, message);
          if (message && !firstInvalid) firstInvalid = input;
        });

        // Contact form: phone OR email is required
        if (form.hasAttribute("data-phone-or-email")) {
          var phone = form.querySelector("#phone");
          var email = form.querySelector("#email");
          if (!phone.value.trim() && !email.value.trim()) {
            showError(phone, MESSAGES.phoneOrEmail);
            if (!firstInvalid) firstInvalid = phone;
          }
        }

        if (firstInvalid) {
          summaryError.hidden = false;
          firstInvalid.focus();
          return;
        }
        summaryError.hidden = true;

        var fields = collectFields(form);
        var useWhatsApp = formSettings.openWhatsApp !== false && hasWhatsApp();
        var emailStatus = done.querySelector("[data-email-status]");

        var canSendCopy = hasFormspree() || Boolean(supabaseBase());

        if (!useWhatsApp && !canSendCopy) {
          summaryError.textContent = "Online enquiries are not set up yet. Please contact us by phone or email.";
          summaryError.hidden = false;
          return;
        }

        // 1. Send copies in the background: email (Formspree) + admin dashboard (Supabase).
        //    Resolves true if at least one of them worked.
        var emailSent = canSendCopy
          ? Promise.all([
              hasFormspree() ? sendToFormspree(form, fields) : false,
              saveToDashboard(form, fields),
            ]).then(function (results) {
              return results[0] === true || results[1] === true;
            })
          : null;

        // 2a. WhatsApp + email: open WhatsApp straight away
        if (useWhatsApp) {
          var link = whatsappLink(buildMessage(form, fields));
          var win = window.open(link, "_blank");
          if (win) win.opener = null;
          else window.location.href = link; // pop-up blocked: open in this tab

          done.querySelector("[data-reopen]").href = link;
          showDone();

          if (emailSent) {
            emailStatus.textContent = "Sending a copy of your enquiry to our team…";
            emailStatus.hidden = false;
            emailSent.then(function (ok) {
              emailStatus.textContent = ok
                ? "✓ A copy of your enquiry has also been sent to our team."
                : "We could not send a copy, so please make sure you press Send in WhatsApp.";
            });
          }
          return;
        }

        // 2b. Email only: wait for Formspree to confirm
        submitButton.disabled = true;
        submitButton.textContent = "Sending…";
        emailSent.then(function (ok) {
          submitButton.disabled = false;
          submitButton.textContent = "Send enquiry";
          if (!ok) {
            summaryError.textContent = "Sorry, your enquiry could not be sent. Please try again, or contact us by phone or WhatsApp.";
            summaryError.hidden = false;
            return;
          }
          done.querySelector(".done-icon").style.background = "var(--charcoal)";
          done.querySelector("h3").textContent = "Enquiry sent";
          done.querySelector("p").textContent =
            "Thank you. Our team has received your details and will contact you to discuss the next steps.";
          done.querySelector("[data-reopen]").hidden = true;
          done.querySelector("[data-edit]").hidden = true;
          showDone();
        });
      });

      function showDone() {
        form.hidden = true;
        done.hidden = false;
        done.focus();
      }

      // Email-only mode: plain "Send enquiry" button instead of WhatsApp
      var submitButton = form.querySelector("button[type=submit]");
      if (formSettings.openWhatsApp === false && (hasFormspree() || supabaseBase())) {
        submitButton.className = "btn btn-dark";
        submitButton.textContent = "Send enquiry";
      }

      // Buttons on the "finish in WhatsApp" panel
      done.querySelector("[data-edit]").addEventListener("click", function () {
        done.hidden = true;
        form.hidden = false;
      });
      done.querySelector("[data-new]").addEventListener("click", function () {
        form.reset();
        var status = done.querySelector("[data-email-status]");
        if (status) status.hidden = true;
        done.hidden = true;
        form.hidden = false;
        form.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    });
  }

  /* 8. START ----------------------------------------------------------- */
  document.addEventListener("DOMContentLoaded", function () {
    fillContactDetails();
    setupWhatsAppLinks();
    // Then apply any contact details saved in the admin dashboard
    loadSiteSettings().then(function (changed) {
      if (changed) {
        fillContactDetails();
        setupWhatsAppLinks();
      }
    });
    setupHeader();
    setupGallery();
    setupForms();
    setupReveal();
    setupCounters();
  });
})();
