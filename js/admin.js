/* =====================================================================
   GM Scrapmetal Limited: admin dashboard (admin.html)
   ---------------------------------------------------------------------
   Uses Supabase for:
     - login (email + password, password reset)       → Supabase Auth
     - gallery photos list                            → table gallery_photos
     - image files                                    → storage bucket "gallery"
     - enquiries from the website forms               → table enquiries
     - contact details shown on the website           → table site_settings
   Security is enforced by the database rules in setup/supabase-setup.sql:
   only emails on the admin list can read enquiries or change anything,
   no matter what this file does.

   Contents
     1.  Setup & small helpers
     2.  Screens (loading / login / dashboard)
     3.  Login, logout, forgot password, new password
     4.  Navigation (pages inside the dashboard)
     5.  Overview
     6.  Gallery: list, search, filter, edit, publish, reorder, delete
     7.  Gallery: add photos (previews, checks, resize, upload)
     8.  Enquiries (supplier / buyer / messages)
     9.  Website settings
     10. Start
   ===================================================================== */

(function () {
  "use strict";

  /* 1. SETUP & SMALL HELPERS ------------------------------------------- */
  var config = window.SITE_CONFIG || {};
  var supa = config.supabase || {};
  var BUCKET = "gallery";
  var MAX_FILE_BYTES = 15 * 1024 * 1024; // largest photo accepted (before resizing)
  var MAX_FILES = 20;                     // photos per upload batch
  var MAX_SIZE_PX = 1600;                 // longest side after resizing
  var PAGE_SIZE = 15;                     // enquiries per page
  var CATEGORIES = config.galleryCategories || ["Scrap Metal", "Materials", "Equipment", "Collection", "Projects"];
  var TYPE_NAMES = { supplier: "Supplier enquiry", buyer: "Buyer enquiry", contact: "Message" };

  var db = null;          // Supabase client
  var currentUser = null; // signed-in admin
  var recovering = /type=recovery/.test(location.hash); // arrived from a password-reset email

  function $(id) {
    return document.getElementById(id);
  }

  function isConfigured() {
    var url = (supa.url || "").replace(/\/+$/, "");
    // https for real projects; plain http only for a Supabase running on this computer
    var validUrl = /^https:\/\/[^/]+$/.test(url) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/[\w/-]*)?$/.test(url);
    return validUrl && (supa.anonKey || "").length > 20;
  }

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = text; // always text, never HTML
    return node;
  }

  function digitsOnly(value) {
    return String(value || "").replace(/\D/g, "");
  }

  function formatDate(value, withTime) {
    if (!value) return "";
    var d = new Date(value);
    if (isNaN(d.getTime())) return value;
    var opts = { day: "numeric", month: "short", year: "numeric" };
    if (withTime) {
      opts.hour = "2-digit";
      opts.minute = "2-digit";
    }
    return d.toLocaleString("en-GB", opts);
  }

  function showNotice(node, message, kind) {
    node.textContent = message || "";
    node.hidden = !message;
    node.className = "notice" + (kind ? " notice-" + kind : "");
  }

  function setBusy(button, busy, label) {
    button.disabled = busy;
    var spinner = button.querySelector(".spinner");
    var text = button.querySelector(".label");
    if (spinner) spinner.hidden = !busy;
    if (text && label) text.textContent = label;
  }

  var toastTimer = null;
  function toast(message, isError) {
    var t = $("toast");
    t.textContent = message;
    t.classList.toggle("is-error", Boolean(isError));
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      t.hidden = true;
    }, isError ? 7000 : 4000);
  }

  /** Turn a Supabase error into a clear message (and sign out if the login expired). */
  function explain(error) {
    var msg = (error && (error.message || error.error_description)) || "Something went wrong.";
    var code = (error && error.code) || "";
    if (code === "PGRST301" || /jwt expired|invalid jwt/i.test(msg)) {
      toast("Your session has expired. Please sign in again.", true);
      db.auth.signOut();
      return "Session expired.";
    }
    if (code === "PGRST205" || code === "PGRST202" || code === "42P01" || /schema cache|does not exist/i.test(msg)) {
      return "The database is not set up yet. Run setup/supabase-setup.sql in Supabase (README step 4).";
    }
    if (code === "42501" || /row-level security|permission denied/i.test(msg)) {
      return "Permission denied. Is this account on the admin list? (README step 6)";
    }
    if (/failed to fetch|network/i.test(msg)) {
      return "Could not reach Supabase. Check your internet connection.";
    }
    return msg;
  }

  /** Simple confirm box. Resolves true if "Delete" (or the given label) is pressed. */
  function confirmBox(title, text, yesLabel) {
    var dialog = $("confirm-dialog");
    $("confirm-title").textContent = title;
    $("confirm-text").textContent = text;
    $("confirm-yes").textContent = yesLabel || "Delete";
    return new Promise(function (resolve) {
      function done(answer) {
        $("confirm-yes").onclick = $("confirm-no").onclick = null;
        dialog.onclose = null;
        if (dialog.open) dialog.close();
        resolve(answer);
      }
      $("confirm-yes").onclick = function () {
        done(true);
      };
      $("confirm-no").onclick = function () {
        done(false);
      };
      dialog.onclose = function () {
        done(false);
      };
      dialog.showModal();
      $("confirm-no").focus();
    });
  }

  function publicUrl(path) {
    return db.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
  }

  function fillSelect(select, values, selected, firstLabel) {
    select.innerHTML = "";
    if (firstLabel) select.appendChild(new Option(firstLabel, ""));
    values.forEach(function (v) {
      var opt = new Option(v, v);
      if (v === selected) opt.selected = true;
      select.appendChild(opt);
    });
    // keep an old value that is no longer in the list
    if (selected && values.indexOf(selected) === -1) select.appendChild(new Option(selected, selected, true, true));
  }

  // Close buttons inside dialogs
  document.querySelectorAll("[data-close]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      btn.closest("dialog").close();
    });
  });

  // Show / hide password buttons
  document.querySelectorAll("[data-toggle-password]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var input = $(btn.getAttribute("data-toggle-password"));
      var show = input.type === "password";
      input.type = show ? "text" : "password";
      btn.setAttribute("aria-pressed", String(show));
      btn.querySelector("span").textContent = show ? "Hide" : "Show";
    });
  });

  /* 2. SCREENS --------------------------------------------------------- */
  function showScreen(name) {
    $("boot-view").hidden = name !== "boot";
    $("login-view").hidden = name !== "login";
    $("app-view").hidden = name !== "app";
  }

  function showAuthBox(name) {
    $("signin-box").hidden = name !== "signin";
    $("forgot-box").hidden = name !== "forgot";
    $("newpass-box").hidden = name !== "newpass";
  }

  function enterLogin(message) {
    currentUser = null;
    // Remove any admin data from the page
    $("photo-grid").innerHTML = "";
    $("enq-rows").innerHTML = "";
    $("recent-rows").innerHTML = "";
    document.querySelectorAll("dialog[open]").forEach(function (d) {
      d.close();
    });
    showScreen("login");
    showAuthBox("signin");
    showNotice($("login-error"), message || "", "error");
    $("login-email").focus();
  }

  async function enterApp(session) {
    // Logging in is not enough: the account must be on the admin list.
    var check = await db.rpc("is_admin");
    if (check.error) {
      enterLogin("Could not check admin access: " + explain(check.error));
      return;
    }
    if (check.data !== true) {
      await db.auth.signOut();
      enterLogin("This account is not an administrator. Ask the site owner to add your email to the admin list.");
      return;
    }
    currentUser = session.user;
    $("admin-email").textContent = currentUser.email;
    showScreen("app");
    if (!location.hash || /access_token|type=/.test(location.hash)) {
      history.replaceState(null, "", location.pathname + "#overview");
    }
    route();
  }

  /* 3. LOGIN, LOGOUT, FORGOT PASSWORD, NEW PASSWORD -------------------- */
  $("login-form").addEventListener("submit", async function (event) {
    event.preventDefault();
    var email = $("login-email").value.trim();
    var password = $("login-password").value;
    var errorBox = $("login-error");

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return showNotice(errorBox, "Please enter a valid email address.", "error");
    if (!password) return showNotice(errorBox, "Please enter your password.", "error");

    showNotice(errorBox, "");
    setBusy($("login-btn"), true, "Signing in…");
    var result = await db.auth.signInWithPassword({ email: email, password: password });
    setBusy($("login-btn"), false, "Sign in");

    if (result.error) {
      var e = result.error;
      var msg;
      if (e.status === 429 || /rate|too many/i.test(e.message)) msg = "Too many attempts. Please wait a few minutes and try again.";
      else if (/not confirmed/i.test(e.message)) msg = "This email address has not been confirmed yet. Confirm it in Supabase (Authentication → Users).";
      else if (e.status === 400 || /invalid login credentials/i.test(e.message)) msg = "Incorrect email or password."; // same message for both (doesn't reveal which)
      else if (!e.status || /fetch|network/i.test(e.message)) msg = "Could not connect to the login service. Check your internet connection.";
      else msg = "The login service replied with an error (" + e.status + "). Check the Supabase URL and anon key in js/config.js.";
      showNotice(errorBox, msg, "error");
      return;
    }
    $("login-password").value = "";
    enterApp(result.data.session);
  });

  $("forgot-link").addEventListener("click", function () {
    $("forgot-email").value = $("login-email").value;
    showNotice($("forgot-msg"), "");
    showAuthBox("forgot");
    $("forgot-email").focus();
  });
  $("back-to-login").addEventListener("click", function () {
    showAuthBox("signin");
  });

  $("forgot-form").addEventListener("submit", async function (event) {
    event.preventDefault();
    var email = $("forgot-email").value.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return showNotice($("forgot-msg"), "Please enter a valid email address.", "error");

    setBusy($("forgot-btn"), true, "Sending…");
    var result = await db.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname });
    setBusy($("forgot-btn"), false, "Send reset link");

    if (result.error && (result.error.status === 429 || /rate/i.test(result.error.message))) {
      return showNotice($("forgot-msg"), "Too many requests. Please wait a few minutes and try again.", "error");
    }
    if (result.error && (!result.error.status || /fetch|network/i.test(result.error.message))) {
      return showNotice($("forgot-msg"), "Could not connect. Check your internet connection.", "error");
    }
    // Same message whether or not the account exists
    showNotice($("forgot-msg"), "If this email belongs to an admin account, a reset link is on its way. Check your inbox and spam folder.", "ok");
  });

  $("newpass-form").addEventListener("submit", async function (event) {
    event.preventDefault();
    var p1 = $("newpass-1").value;
    var p2 = $("newpass-2").value;
    if (p1.length < 10) return showNotice($("newpass-msg"), "Use at least 10 characters.", "error");
    if (p1 !== p2) return showNotice($("newpass-msg"), "The two passwords do not match.", "error");

    setBusy($("newpass-btn"), true, "Saving…");
    var result = await db.auth.updateUser({ password: p1 });
    setBusy($("newpass-btn"), false, "Save new password");
    if (result.error) return showNotice($("newpass-msg"), explain(result.error), "error");

    recovering = false;
    $("newpass-1").value = $("newpass-2").value = "";
    toast("Password changed.");
    var session = (await db.auth.getSession()).data.session;
    if (session) enterApp(session);
    else enterLogin();
  });

  $("logout-btn").addEventListener("click", async function () {
    await db.auth.signOut(); // also clears the saved session in this browser
    history.replaceState(null, "", location.pathname);
    enterLogin();
  });

  /* 4. NAVIGATION ------------------------------------------------------ */
  var PAGES = {
    overview: { title: "Overview", page: "overview", load: loadOverview },
    gallery: { title: "Gallery", page: "gallery", load: loadPhotos },
    supplier: { title: "Supplier Enquiries", page: "enquiries", load: function () { openEnquiryList("supplier"); } },
    buyer: { title: "Buyer Enquiries", page: "enquiries", load: function () { openEnquiryList("buyer"); } },
    contact: { title: "Messages", page: "enquiries", load: function () { openEnquiryList("contact"); } },
    settings: { title: "Website Settings", page: "settings", load: loadSettings },
  };

  function route() {
    if (!currentUser) return; // not signed in: nothing in the dashboard is shown
    var name = location.hash.replace("#", "");
    if (!PAGES[name]) name = "overview";
    var info = PAGES[name];

    $("page-title").textContent = info.title;
    document.title = info.title + " | Admin | GM Scrapmetal Limited";
    document.querySelectorAll(".page").forEach(function (p) {
      p.hidden = p.getAttribute("data-page") !== info.page;
    });
    document.querySelectorAll(".sidebar nav a").forEach(function (a) {
      if (a.getAttribute("data-route") === name) a.setAttribute("aria-current", "page");
      else a.removeAttribute("aria-current");
    });
    setSidebar(false);
    info.load();
  }
  window.addEventListener("hashchange", route);

  function setSidebar(open) {
    $("sidebar").classList.toggle("is-open", open);
    $("sidebar-backdrop").hidden = !open;
    $("menu-btn").setAttribute("aria-expanded", String(open));
  }
  $("menu-btn").addEventListener("click", function () {
    setSidebar(true);
  });
  $("sidebar-close").addEventListener("click", function () {
    setSidebar(false);
  });
  $("sidebar-backdrop").addEventListener("click", function () {
    setSidebar(false);
  });

  /* 5. OVERVIEW -------------------------------------------------------- */
  function countQuery(table) {
    return db.from(table).select("id", { count: "exact", head: true });
  }

  async function updateBadges() {
    var types = ["supplier", "buyer", "contact"];
    var results = await Promise.all(
      types.map(function (t) {
        return countQuery("enquiries").eq("type", t).eq("status", "New");
      })
    );
    results.forEach(function (r, i) {
      var badge = document.querySelector('[data-badge="' + types[i] + '"]');
      var stat = document.querySelector('[data-stat="' + types[i] + '"]');
      var n = r.error ? null : r.count || 0;
      badge.textContent = n;
      badge.hidden = !n;
      if (stat) stat.textContent = n === null ? "–" : n;
    });
  }

  async function loadOverview() {
    var res = await Promise.all([
      countQuery("gallery_photos").eq("published", true),
      countQuery("gallery_photos").eq("published", false),
      db.from("enquiries").select("id,type,name,company,summary,status,created_at").order("created_at", { ascending: false }).limit(8),
      updateBadges(),
    ]);
    document.querySelector('[data-stat="published"]').textContent = res[0].error ? "–" : res[0].count;
    document.querySelector('[data-stat="hidden"]').textContent = res[1].error ? "–" : res[1].count;

    var tbody = $("recent-rows");
    tbody.innerHTML = "";
    if (res[2].error) {
      toast(explain(res[2].error), true);
      return;
    }
    $("recent-empty").hidden = res[2].data.length > 0;
    res[2].data.forEach(function (row) {
      var tr = document.createElement("tr");
      tr.appendChild(el("td", "", formatDate(row.created_at, true)));
      tr.appendChild(el("td", "", TYPE_NAMES[row.type] || row.type));
      var who = el("td", "strong", row.name || "—");
      if (row.company) who.appendChild(el("span", "sub", row.company));
      tr.appendChild(who);
      tr.appendChild(el("td", "", row.summary));
      var st = el("td");
      st.appendChild(statusBadge(row.status));
      tr.appendChild(st);
      var open = el("td");
      var btn = el("button", "btn btn-outline btn-sm", "View");
      btn.type = "button";
      btn.addEventListener("click", function () {
        openEnquiry(row.id);
      });
      open.appendChild(btn);
      tr.appendChild(open);
      tbody.appendChild(tr);
    });
  }

  document.querySelectorAll("[data-open-upload]").forEach(function (a) {
    a.addEventListener("click", function () {
      openUploadNext = true;
    });
  });

  /* 6. GALLERY: LIST ---------------------------------------------------- */
  var photos = [];
  var openUploadNext = false;

  fillSelect($("gallery-cat"), CATEGORIES, "", "All categories");
  fillSelect($("upload-category"), CATEGORIES, CATEGORIES[0]);
  fillSelect($("edit-category"), CATEGORIES, "");

  async function loadPhotos() {
    if (openUploadNext) {
      openUploadNext = false;
      openUploadPanel();
    }
    $("photos-loading").hidden = false;
    var result = await db
      .from("gallery_photos")
      .select("*")
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: false });
    $("photos-loading").hidden = true;

    if (result.error) {
      toast(explain(result.error), true);
      return;
    }
    photos = result.data;
    renderPhotos();
  }

  function filtersActive() {
    return Boolean($("gallery-search").value.trim() || $("gallery-cat").value || $("gallery-status").value);
  }

  function renderPhotos() {
    var term = $("gallery-search").value.trim().toLowerCase();
    var cat = $("gallery-cat").value;
    var status = $("gallery-status").value;
    var canReorder = !filtersActive();

    var list = photos.filter(function (p) {
      if (cat && p.category !== cat) return false;
      if (status === "published" && !p.published) return false;
      if (status === "hidden" && p.published) return false;
      if (term && (p.title + " " + p.caption + " " + p.alt).toLowerCase().indexOf(term) === -1) return false;
      return true;
    });

    var grid = $("photo-grid");
    grid.innerHTML = "";
    $("photo-count").textContent = photos.length ? "(" + photos.length + ")" : "";
    $("photos-empty").hidden = photos.length > 0;
    $("photos-nomatch").hidden = !(photos.length > 0 && list.length === 0);
    $("reorder-hint").textContent = canReorder
      ? "Use ↑ ↓ to change the order. The first photo is shown first on the website."
      : "Clear the search and filters to change the order.";

    list.forEach(function (photo) {
      var index = photos.indexOf(photo);
      var li = el("li", "photo-card" + (photo.published ? "" : " is-hidden-photo"));

      var thumb = el("div", "photo-thumb");
      var img = el("img");
      img.src = publicUrl(photo.image_path);
      img.alt = photo.alt || photo.title || "";
      img.loading = "lazy";
      thumb.appendChild(img);
      thumb.appendChild(el("span", "photo-badge " + (photo.published ? "published" : "hidden-badge"), photo.published ? "Published" : "Hidden"));
      li.appendChild(thumb);

      var info = el("div", "photo-info");
      info.appendChild(el("strong", "", photo.title || "(no title)"));
      info.appendChild(el("span", "", [photo.category, formatDate(photo.taken_on)].filter(Boolean).join(" · ")));
      li.appendChild(info);

      var actions = el("div", "photo-actions");
      addAction(actions, "Edit", "btn btn-dark", function () {
        openEdit(photo);
      });
      addAction(actions, photo.published ? "Hide" : "Publish", "btn btn-outline", function () {
        setPublished(photo, !photo.published);
      });
      var up = addAction(actions, "↑", "btn btn-outline", function () {
        movePhoto(index, -1);
      });
      up.title = "Move earlier";
      up.setAttribute("aria-label", "Move earlier");
      up.disabled = !canReorder || index === 0;
      var down = addAction(actions, "↓", "btn btn-outline", function () {
        movePhoto(index, 1);
      });
      down.title = "Move later";
      down.setAttribute("aria-label", "Move later");
      down.disabled = !canReorder || index === photos.length - 1;
      addAction(actions, "Delete", "btn btn-danger", function () {
        deletePhoto(photo);
      });
      li.appendChild(actions);
      grid.appendChild(li);
    });
  }

  function addAction(parent, label, className, onClick) {
    var btn = el("button", className, label);
    btn.type = "button";
    btn.addEventListener("click", onClick);
    parent.appendChild(btn);
    return btn;
  }

  ["gallery-search", "gallery-cat", "gallery-status"].forEach(function (id) {
    $(id).addEventListener("input", renderPhotos);
  });

  async function setPublished(photo, published) {
    var result = await db.from("gallery_photos").update({ published: published }).eq("id", photo.id);
    if (result.error) return toast(explain(result.error), true);
    toast(published ? "Photo published. It is now visible on the website." : "Photo hidden from the website.");
    loadPhotos();
  }

  async function movePhoto(index, direction) {
    var target = index + direction;
    if (target < 0 || target >= photos.length) return;
    var ordered = photos.slice();
    var moved = ordered.splice(index, 1)[0];
    ordered.splice(target, 0, moved);

    // Save the new position of every photo
    var results = await Promise.all(
      ordered.map(function (p, i) {
        return p.sort_order === i ? { error: null } : db.from("gallery_photos").update({ sort_order: i }).eq("id", p.id);
      })
    );
    var failed = results.filter(function (r) {
      return r.error;
    })[0];
    if (failed) toast("Could not save the new order: " + explain(failed.error), true);
    loadPhotos();
  }

  async function deletePhoto(photo) {
    var name = photo.title ? '"' + photo.title + '"' : "this photo";
    var yes = await confirmBox("Delete photo?", "Delete " + name + " from the website? This cannot be undone.", "Delete photo");
    if (!yes) return;

    var result = await db.from("gallery_photos").delete().eq("id", photo.id);
    if (result.error) return toast(explain(result.error), true);
    var removed = await db.storage.from(BUCKET).remove([photo.image_path]);
    toast(removed.error ? "Photo removed from the website (the image file could not be deleted from storage)." : "Photo deleted.");
    loadPhotos();
  }

  // Edit dialog
  var editing = null;
  function openEdit(photo) {
    editing = photo;
    $("edit-preview").src = publicUrl(photo.image_path);
    $("edit-title-input").value = photo.title || "";
    $("edit-caption").value = photo.caption || "";
    $("edit-alt").value = photo.alt || "";
    fillSelect($("edit-category"), CATEGORIES, photo.category);
    $("edit-date").value = photo.taken_on || "";
    $("edit-published").checked = photo.published;
    showNotice($("edit-error"), "");
    $("edit-dialog").showModal();
  }

  $("edit-form").addEventListener("submit", async function (event) {
    event.preventDefault();
    if (!editing) return;
    $("edit-save").disabled = true;
    var result = await db
      .from("gallery_photos")
      .update({
        title: $("edit-title-input").value.trim(),
        caption: $("edit-caption").value.trim(),
        alt: $("edit-alt").value.trim(),
        category: $("edit-category").value,
        taken_on: $("edit-date").value || null,
        published: $("edit-published").checked,
      })
      .eq("id", editing.id);
    $("edit-save").disabled = false;
    if (result.error) return showNotice($("edit-error"), explain(result.error), "error");
    $("edit-dialog").close();
    toast("Changes saved. The website shows them straight away.");
    loadPhotos();
  });

  /* 7. GALLERY: ADD PHOTOS -------------------------------------------- */
  var pending = []; // photos chosen but not uploaded yet: {file, url, title, caption, state, error}
  var uploading = false;

  function openUploadPanel() {
    $("upload-panel").hidden = false;
    $("upload-panel").scrollIntoView({ behavior: "smooth", block: "start" });
    $("dropzone").focus();
  }
  $("add-photos-btn").addEventListener("click", openUploadPanel);
  $("upload-cancel").addEventListener("click", function () {
    if (uploading) return;
    clearPending();
    $("upload-panel").hidden = true;
  });

  /** Check the file really is JPG / PNG / WebP by reading its first bytes. */
  async function sniffImage(file) {
    var b = new Uint8Array(await file.slice(0, 12).arrayBuffer());
    if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpeg";
    if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "png";
    if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return "webp";
    return null;
  }

  async function addFiles(fileList) {
    var errors = [];
    var files = Array.from(fileList || []);
    for (var i = 0; i < files.length; i++) {
      var file = files[i];
      if (pending.length >= MAX_FILES) {
        errors.push("Only " + MAX_FILES + " photos can be added at a time. Upload these first, then add more.");
        break;
      }
      if (!/\.(jpe?g|png|webp)$/i.test(file.name)) {
        errors.push(file.name + ": not a JPG, JPEG, PNG or WebP file.");
        continue;
      }
      if (file.size > MAX_FILE_BYTES) {
        errors.push(file.name + ": larger than 15 MB (" + (file.size / 1048576).toFixed(1) + " MB).");
        continue;
      }
      if (!(await sniffImage(file))) {
        errors.push(file.name + ": the file is not a real image or is damaged.");
        continue;
      }
      pending.push({ file: file, url: URL.createObjectURL(file), title: "", caption: "", state: "", error: "" });
    }
    showNotice($("upload-file-errors"), errors.join("\n"), "error");
    $("upload-file-errors").style.whiteSpace = "pre-line";
    renderPreviews();
  }

  function renderPreviews() {
    var grid = $("preview-grid");
    grid.innerHTML = "";
    pending.forEach(function (item, index) {
      var li = el("li", "preview-item" + (item.state === "done" ? " is-done" : item.state === "failed" ? " is-failed" : ""));
      var img = el("img");
      img.src = item.url;
      img.alt = "Preview of " + item.file.name;
      li.appendChild(img);

      var fields = el("div", "preview-fields");
      var nameRow = el("div", "preview-name");
      nameRow.appendChild(el("span", "", item.file.name));
      if (!uploading) {
        var remove = el("button", "preview-remove", "Remove");
        remove.type = "button";
        remove.setAttribute("aria-label", "Remove " + item.file.name);
        remove.addEventListener("click", function () {
          URL.revokeObjectURL(item.url);
          pending.splice(index, 1);
          renderPreviews();
        });
        nameRow.appendChild(remove);
      }
      fields.appendChild(nameRow);

      var title = el("input");
      title.type = "text";
      title.maxLength = 160;
      title.placeholder = "Title (e.g. Steel scrap collection)";
      title.setAttribute("aria-label", "Title for " + item.file.name);
      title.value = item.title;
      title.disabled = uploading;
      title.addEventListener("input", function () {
        item.title = title.value;
      });
      fields.appendChild(title);

      var caption = el("input");
      caption.type = "text";
      caption.maxLength = 500;
      caption.placeholder = "Caption (optional)";
      caption.setAttribute("aria-label", "Caption for " + item.file.name);
      caption.value = item.caption;
      caption.disabled = uploading;
      caption.addEventListener("input", function () {
        item.caption = caption.value;
      });
      fields.appendChild(caption);

      if (item.state === "done") fields.appendChild(el("span", "preview-state", "✓ Uploaded"));
      if (item.state === "uploading") fields.appendChild(el("span", "preview-state", "Uploading…"));
      if (item.state === "failed") fields.appendChild(el("span", "preview-state", "✗ " + item.error));

      li.appendChild(fields);
      grid.appendChild(li);
    });
    var any = pending.length > 0;
    $("upload-shared").hidden = !any;
    $("upload-actions").hidden = !any;
    $("upload-btn").textContent = "Upload " + pending.length + (pending.length === 1 ? " photo" : " photos");
  }

  function clearPending() {
    pending.forEach(function (item) {
      URL.revokeObjectURL(item.url);
    });
    pending = [];
    showNotice($("upload-file-errors"), "");
    $("upload-progress").hidden = true;
    renderPreviews();
  }

  $("upload-files").addEventListener("change", function () {
    addFiles(this.files);
    this.value = ""; // allow choosing the same file again
  });
  var dz = $("dropzone");
  ["dragenter", "dragover"].forEach(function (type) {
    dz.addEventListener(type, function (e) {
      e.preventDefault();
      dz.classList.add("is-over");
    });
  });
  ["dragleave", "drop"].forEach(function (type) {
    dz.addEventListener(type, function (e) {
      e.preventDefault();
      dz.classList.remove("is-over");
    });
  });
  dz.addEventListener("drop", function (e) {
    addFiles(e.dataTransfer.files);
  });

  /** Resize to max 1600px and save as JPEG (also removes hidden GPS/location data). */
  async function resizeImage(file) {
    var bitmap = await createImageBitmap(file);
    var scale = Math.min(1, MAX_SIZE_PX / Math.max(bitmap.width, bitmap.height));
    var canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    var ctx = canvas.getContext("2d");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    if (bitmap.close) bitmap.close();
    return new Promise(function (resolve, reject) {
      canvas.toBlob(function (blob) {
        blob ? resolve(blob) : reject(new Error("could not process the image"));
      }, "image/jpeg", 0.82);
    });
  }

  $("upload-btn").addEventListener("click", async function () {
    var todo = pending.filter(function (item) {
      return item.state !== "done";
    });
    if (uploading || !todo.length) return;

    uploading = true;
    $("upload-btn").disabled = true;
    $("upload-progress").hidden = false;
    var category = $("upload-category").value;
    var takenOn = $("upload-date").value || null;
    var published = $("upload-published").checked;
    // New photos go to the top of the list, in the order chosen
    var firstOrder = photos.length ? Math.min.apply(null, photos.map(function (p) { return p.sort_order; })) : 0;
    var done = 0;
    var failed = 0;

    for (var i = 0; i < todo.length; i++) {
      var item = todo[i];
      item.state = "uploading";
      renderPreviews();
      $("upload-progress-text").textContent = "Uploading photo " + (i + 1) + " of " + todo.length + "…";
      $("upload-bar").style.width = Math.round((i / todo.length) * 100) + "%";

      var path = null;
      try {
        var blob = await resizeImage(item.file);
        path = "photos/" + Date.now() + "-" + Math.random().toString(36).slice(2, 10) + ".jpg";
        var up = await db.storage.from(BUCKET).upload(path, blob, { contentType: "image/jpeg", cacheControl: "31536000", upsert: false });
        if (up.error) throw up.error;

        var title = item.title.trim();
        var caption = item.caption.trim();
        var ins = await db.from("gallery_photos").insert({
          image_path: path,
          title: title,
          caption: caption,
          alt: title || caption || category + " photo",
          category: category,
          taken_on: takenOn,
          published: published,
          sort_order: firstOrder - todo.length + i,
        });
        if (ins.error) {
          await db.storage.from(BUCKET).remove([path]); // don't leave an orphan file
          throw ins.error;
        }
        item.state = "done";
        done++;
      } catch (err) {
        item.state = "failed";
        item.error = explain(err);
        failed++;
      }
    }

    $("upload-bar").style.width = "100%";
    uploading = false;
    $("upload-btn").disabled = false;

    if (failed) {
      $("upload-progress-text").textContent = done + " uploaded, " + failed + " failed. Fix the problem and press Upload again to retry the failed photos.";
      // keep failed ones so they can be retried; drop the uploaded ones
      pending = pending.filter(function (item) {
        if (item.state === "done") URL.revokeObjectURL(item.url);
        return item.state !== "done";
      });
      renderPreviews();
      toast(failed + (failed === 1 ? " photo" : " photos") + " could not be uploaded.", true);
    } else {
      clearPending();
      $("upload-panel").hidden = true;
      toast(done + (done === 1 ? " photo" : " photos") + " uploaded" + (published ? " and published on the website." : " (hidden until you publish)."));
    }
    loadPhotos();
  });

  /* 8. ENQUIRIES ------------------------------------------------------- */
  var enq = { type: "supplier", page: 0, timer: null };
  var EMPTY_TEXT = {
    supplier: "No supplier enquiries yet. They arrive here when someone sends the Sell Your Scrap form.",
    buyer: "No buyer enquiries yet. They arrive here when someone sends the Industrial Buyers form.",
    contact: "No messages yet. They arrive here when someone sends the Contact form.",
  };

  function statusBadge(status) {
    return el("span", "status status-" + String(status).replace(/\s+/g, "-"), status);
  }

  function openEnquiryList(type) {
    if (enq.type !== type) {
      enq.type = type;
      enq.page = 0;
      $("enq-search").value = "";
      $("enq-status").value = "";
    }
    loadEnquiries();
  }

  async function loadEnquiries() {
    $("enq-loading").hidden = false;
    var from = enq.page * PAGE_SIZE;
    var query = db
      .from("enquiries")
      .select("id,name,company,phone,email,summary,status,created_at", { count: "exact" })
      .eq("type", enq.type)
      .order("created_at", { ascending: false })
      .range(from, from + PAGE_SIZE - 1);

    var status = $("enq-status").value;
    if (status) query = query.eq("status", status);
    // remove characters that have special meaning in the search syntax
    var term = $("enq-search").value.trim().replace(/[,()*%\\:."']/g, " ").trim();
    if (term) {
      var like = "*" + term + "*";
      query = query.or(["name", "company", "phone", "email", "summary"].map(function (c) { return c + ".ilike." + like; }).join(","));
    }

    var result = await query;
    $("enq-loading").hidden = true;
    var tbody = $("enq-rows");
    tbody.innerHTML = "";
    if (result.error) {
      toast(explain(result.error), true);
      return;
    }

    var total = result.count || 0;
    $("enq-empty").hidden = result.data.length > 0;
    $("enq-empty").textContent = term || status ? "No enquiries match your search." : EMPTY_TEXT[enq.type];
    $("enq-page-info").textContent = total ? "Showing " + (from + 1) + "–" + (from + result.data.length) + " of " + total : "";
    $("enq-prev").disabled = enq.page === 0;
    $("enq-next").disabled = from + PAGE_SIZE >= total;

    result.data.forEach(function (row) {
      var tr = document.createElement("tr");
      tr.appendChild(el("td", "", formatDate(row.created_at, true)));
      var who = el("td", "strong", row.name || "—");
      if (row.company) who.appendChild(el("span", "sub", row.company));
      tr.appendChild(who);
      tr.appendChild(el("td", "", row.phone));
      tr.appendChild(el("td", "", row.summary));
      var st = el("td");
      st.appendChild(statusBadge(row.status));
      tr.appendChild(st);
      var open = el("td");
      var btn = el("button", "btn btn-outline btn-sm", "View");
      btn.type = "button";
      btn.addEventListener("click", function () {
        openEnquiry(row.id);
      });
      open.appendChild(btn);
      tr.appendChild(open);
      tbody.appendChild(tr);
    });
  }

  $("enq-search").addEventListener("input", function () {
    clearTimeout(enq.timer);
    enq.timer = setTimeout(function () {
      enq.page = 0;
      loadEnquiries();
    }, 300);
  });
  $("enq-status").addEventListener("change", function () {
    enq.page = 0;
    loadEnquiries();
  });
  $("enq-prev").addEventListener("click", function () {
    if (enq.page > 0) enq.page--;
    loadEnquiries();
  });
  $("enq-next").addEventListener("click", function () {
    enq.page++;
    loadEnquiries();
  });

  var openRow = null;
  async function openEnquiry(id) {
    var result = await db.from("enquiries").select("*").eq("id", id).single();
    if (result.error) return toast(explain(result.error), true);
    var row = (openRow = result.data);

    $("enq-title").textContent = (TYPE_NAMES[row.type] || "Enquiry") + (row.name ? " from " + row.name : "");
    $("enq-received").textContent = "Received " + formatDate(row.created_at, true);

    var contact = $("enq-contact");
    contact.innerHTML = "";
    if (row.phone) {
      var call = el("a", "btn btn-outline btn-sm", "Call " + row.phone);
      call.href = "tel:+" + digitsOnly(row.phone);
      contact.appendChild(call);
      var wa = el("a", "btn btn-whatsapp btn-sm", "WhatsApp");
      wa.href = "https://wa.me/" + digitsOnly(row.phone) + "?text=" + encodeURIComponent("Hello " + (row.name || "") + ", thank you for contacting GM Scrapmetal Limited.");
      wa.target = "_blank";
      wa.rel = "noopener";
      contact.appendChild(wa);
    }
    if (row.email) {
      var mail = el("a", "btn btn-outline btn-sm", "Email " + row.email);
      mail.href = "mailto:" + row.email + "?subject=" + encodeURIComponent("Your enquiry to GM Scrapmetal Limited");
      contact.appendChild(mail);
    }

    var dl = $("enq-details");
    dl.innerHTML = "";
    (Array.isArray(row.details) ? row.details : []).forEach(function (pair) {
      if (!Array.isArray(pair) || pair.length < 2) return;
      dl.appendChild(el("dt", "", String(pair[0])));
      dl.appendChild(el("dd", "", String(pair[1])));
    });

    $("enq-status-select").value = row.status;
    $("enq-notes").value = row.admin_notes || "";
    showNotice($("enq-error"), "");
    $("enq-dialog").showModal();
  }

  $("enq-save").addEventListener("click", async function () {
    if (!openRow) return;
    var result = await db
      .from("enquiries")
      .update({ status: $("enq-status-select").value, admin_notes: $("enq-notes").value.trim() })
      .eq("id", openRow.id);
    if (result.error) return showNotice($("enq-error"), explain(result.error), "error");
    $("enq-dialog").close();
    toast("Enquiry updated.");
    refreshAfterEnquiryChange();
  });

  $("enq-delete").addEventListener("click", async function () {
    if (!openRow) return;
    var row = openRow;
    $("enq-dialog").close();
    var yes = await confirmBox("Delete enquiry?", "Delete the enquiry from " + (row.name || "this person") + "? This cannot be undone.", "Delete enquiry");
    if (!yes) return;
    var result = await db.from("enquiries").delete().eq("id", row.id);
    if (result.error) return toast(explain(result.error), true);
    toast("Enquiry deleted.");
    refreshAfterEnquiryChange();
  });

  function refreshAfterEnquiryChange() {
    var page = PAGES[location.hash.replace("#", "")];
    if (page && page.page === "enquiries") loadEnquiries();
    else loadOverview();
    updateBadges();
  }

  /* 9. WEBSITE SETTINGS ------------------------------------------------- */
  async function loadSettings() {
    showNotice($("settings-error"), "");
    var result = await db.from("site_settings").select("data").eq("id", 1).maybeSingle();
    if (result.error) return showNotice($("settings-error"), explain(result.error), "error");

    // Start from js/config.js, then apply anything saved in the dashboard
    var saved = (result.data && result.data.data) || {};
    var v = {
      phones: Array.isArray(saved.phones) ? saved.phones : config.phones || [],
      whatsapp: saved.whatsapp !== undefined ? saved.whatsapp : config.whatsapp,
      email: saved.email !== undefined ? saved.email : config.email,
      address: saved.address !== undefined ? saved.address : config.address,
      businessHours: saved.businessHours !== undefined ? saved.businessHours : config.businessHours,
      mapEmbedUrl: saved.mapEmbedUrl !== undefined ? saved.mapEmbedUrl : config.mapEmbedUrl,
    };
    $("set-phone1").value = v.phones[0] || "";
    $("set-phone2").value = v.phones[1] || "";
    $("set-whatsapp").value = v.whatsapp || "";
    $("set-email").value = v.email || "";
    $("set-address").value = v.address || "";
    $("set-hours").value = v.businessHours || "";
    $("set-map").value = v.mapEmbedUrl || "";
  }

  function validPhone(value) {
    var digits = digitsOnly(value);
    return !value || (/^\+?[\d\s()-]+$/.test(value) && digits.length >= 9 && digits.length <= 15);
  }

  $("settings-form").addEventListener("submit", async function (event) {
    event.preventDefault();
    var data = {
      phones: [$("set-phone1").value.trim(), $("set-phone2").value.trim()].filter(Boolean),
      whatsapp: $("set-whatsapp").value.trim(),
      email: $("set-email").value.trim(),
      address: $("set-address").value.trim(),
      businessHours: $("set-hours").value.trim(),
      mapEmbedUrl: $("set-map").value.trim(),
    };
    var problems = [];
    if (!data.phones.every(validPhone)) problems.push("A phone number is not valid (use e.g. +255 615 741 017).");
    if (!validPhone(data.whatsapp)) problems.push("The WhatsApp number is not valid.");
    if (data.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) problems.push("The email address is not valid.");
    if (data.mapEmbedUrl && !/^https:\/\/www\.google\.com\/maps/.test(data.mapEmbedUrl)) problems.push("The map link must start with https://www.google.com/maps");
    if (problems.length) return showNotice($("settings-error"), problems.join(" "), "error");

    showNotice($("settings-error"), "");
    $("settings-btn").disabled = true;
    var result = await db.from("site_settings").update({ data: data }).eq("id", 1).select("id");
    $("settings-btn").disabled = false;
    if (result.error) return showNotice($("settings-error"), explain(result.error), "error");
    if (!result.data || !result.data.length) {
      return showNotice($("settings-error"), "Nothing was saved. Run setup/supabase-setup.sql in Supabase (README step 4).", "error");
    }
    toast("Settings saved. The website now shows the new details.");
  });

  /* 10. START ----------------------------------------------------------- */
  async function start() {
    if (!isConfigured() || !window.supabase) {
      // Show the real login page, explain what is missing, and disable sign-in.
      showScreen("login");
      showAuthBox("signin");
      $("not-configured").hidden = false;
      if (isConfigured() && !window.supabase) {
        $("not-configured").textContent = "Could not load the login service. Check your internet connection and reload the page.";
      }
      $("login-btn").disabled = true;
      $("forgot-link").hidden = true;
      return;
    }

    db = window.supabase.createClient(supa.url.replace(/\/+$/, ""), supa.anonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    });

    db.auth.onAuthStateChange(function (event) {
      if (event === "PASSWORD_RECOVERY") {
        recovering = true;
        showScreen("login");
        showAuthBox("newpass");
        $("newpass-1").focus();
      } else if (event === "SIGNED_OUT" && currentUser) {
        enterLogin("You have been signed out.");
      }
    });

    var current = await db.auth.getSession();
    if (recovering) {
      showScreen("login");
      showAuthBox("newpass");
      return;
    }
    if (current.data && current.data.session) enterApp(current.data.session);
    else enterLogin();
  }

  start();
})();
