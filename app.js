(() => {
  "use strict";

  const $ = (s) => document.querySelector(s);

  // Reaction set (keys must match api/_redis.js REACTIONS)
  const REACTIONS = [
    { key: "love",  char: "❤️", label: "Suka" },
    { key: "thumb", char: "👍", label: "Setuju" },
    { key: "clap",  char: "👏", label: "Apresiasi" },
    { key: "fire",  char: "🔥", label: "Keren" },
    { key: "idea",  char: "💡", label: "Inspiratif" },
  ];
  const RKEYS = REACTIONS.map((r) => r.key);

  const state = {
    all: [],
    list: [],
    idx: 0,
    filter: "Semua",
    counts: {},       // id -> { emoji: count }
    mine: {},         // id -> Set(emoji)
    backend: null,
    autoplay: true,
    timer: null,
  };
  const AUTOPLAY_MS = 30000;

  // ---- device id ----
  function deviceId() {
    let id;
    try { id = localStorage.getItem("sb_device"); } catch (e) {}
    if (!id) {
      id = "d-" + Math.random().toString(36).slice(2) + Date.now().toString(36);
      try { localStorage.setItem("sb_device", id); } catch (e) {}
    }
    return id;
  }
  const DEV = deviceId();

  // ---- local fallback store ----
  const LKEY = "sb_react_v1";
  function localLoad() {
    try { return JSON.parse(localStorage.getItem(LKEY) || "{}"); } catch (e) { return {}; }
  }
  function localSave(obj) { try { localStorage.setItem(LKEY, JSON.stringify(obj)); } catch (e) {} }

  function mineSet(id) { if (!state.mine[id]) state.mine[id] = new Set(); return state.mine[id]; }
  function countOf(id, emoji) { return (state.counts[id] && state.counts[id][emoji]) || 0; }
  function setCount(id, emoji, n) { if (!state.counts[id]) state.counts[id] = {}; state.counts[id][emoji] = Math.max(0, n); }

  // ---- API (graceful fallback) ----
  async function fetchReactions() {
    try {
      const r = await fetch(`api/reactions?deviceId=${encodeURIComponent(DEV)}`, { cache: "no-store" });
      if (!r.ok) throw new Error("no api");
      const data = await r.json();
      state.backend = true;
      state.counts = data.counts || {};
      state.mine = {};
      const m = data.mine || {};
      Object.keys(m).forEach((id) => { state.mine[id] = new Set(m[id] || []); });
      return;
    } catch (e) {
      state.backend = false;
      const local = localLoad();
      state.counts = {};
      state.mine = {};
      Object.keys(local).forEach((id) => {
        state.counts[id] = Object.assign({}, local[id].counts || {});
        state.mine[id] = new Set(Object.keys(local[id].mine || {}).filter((k) => local[id].mine[k]));
      });
    }
  }

  async function sendReaction(id, emoji, action) {
    if (state.backend) {
      try {
        const r = await fetch("api/react", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id, deviceId: DEV, emoji, action }),
        });
        if (!r.ok) throw new Error("react fail");
        const data = await r.json();
        if (typeof data.count === "number") setCount(id, emoji, data.count);
        return;
      } catch (e) {
        showToast("Gagal menyimpan ke server, memakai mode lokal.");
        state.backend = false;
      }
    }
    // local fallback
    const local = localLoad();
    if (!local[id]) local[id] = { counts: {}, mine: {} };
    const rec = local[id];
    const cur = rec.counts[emoji] || 0;
    if (action === "add" && !rec.mine[emoji]) { rec.counts[emoji] = cur + 1; rec.mine[emoji] = true; }
    else if (action === "remove" && rec.mine[emoji]) { rec.counts[emoji] = Math.max(0, cur - 1); rec.mine[emoji] = false; }
    localSave(local);
    setCount(id, emoji, rec.counts[emoji] || 0);
  }

  // ---- rendering ----
  const posterImg = $("#posterImg");
  const els = {
    counter: $("#counter"), badges: $("#badges"), title: $("#workTitle"),
    name: $("#authorName"), inst: $("#authorInst"), meta: $("#authorMeta"),
    reactions: $("#reactions"), pdfBtn: $("#pdfBtn"), progress: $("#progress"),
  };

  function current() { return state.list[state.idx]; }

  function render(animate = true) {
    const w = current();
    if (!w) return;
    if (animate) {
      posterImg.classList.add("swap");
      setTimeout(() => {
        posterImg.src = w.image;
        posterImg.alt = (w.judul || "Poster karya") + (w.nama ? " — " + w.nama : "");
      }, 120);
      posterImg.addEventListener("load", () => posterImg.classList.remove("swap"), { once: true });
    } else {
      posterImg.src = w.image;
      posterImg.alt = (w.judul || "Poster karya") + (w.nama ? " — " + w.nama : "");
    }

    els.counter.textContent = `Karya ${state.idx + 1} dari ${state.list.length}`;

    const b = [];
    b.push(`<span class="badge jenis" data-j="${esc(w.jenis)}">${esc(w.jenis)}</span>`);
    if (w.jenjang) b.push(`<span class="badge soft">${esc(w.jenjang)}</span>`);
    if (w.angkatan) b.push(`<span class="badge soft">Angkatan ${esc(w.angkatan)}</span>`);
    els.badges.innerHTML = b.join("");

    els.title.textContent = w.judul || "—";
    els.name.textContent = w.nama || "Penulis belum dicantumkan";
    els.name.style.opacity = w.nama ? "1" : ".55";
    els.inst.textContent = w.instansi || "";
    els.inst.style.display = w.instansi ? "" : "none";

    const metaParts = [];
    if (w.jenjang) metaParts.push(w.jenjang);
    if (w.angkatan) metaParts.push("Angkatan " + w.angkatan);
    els.meta.textContent = metaParts.join(" · ");
    els.meta.style.display = metaParts.length ? "" : "none";

    if (w.pdf) { els.pdfBtn.hidden = false; els.pdfBtn.href = w.pdf; }
    else { els.pdfBtn.hidden = true; }

    renderReactions();
    renderDots();
    scheduleAuto();
  }

  function renderReactions() {
    const w = current();
    const mset = state.mine[w.id] || new Set();
    els.reactions.innerHTML = REACTIONS.map((r) => {
      const c = countOf(w.id, r.key);
      const on = mset.has(r.key);
      return `<button class="react-btn${on ? " on" : ""}" data-emoji="${r.key}" aria-pressed="${on ? "true" : "false"}" title="${esc(r.label)}">`
        + `<span class="re-emoji">${r.char}</span>`
        + `<span class="re-count${c ? "" : " zero"}">${c}</span></button>`;
    }).join("");
  }

  function renderDots() {
    els.progress.innerHTML = state.list.map((_, i) =>
      `<button class="dot ${i === state.idx ? "active" : ""}" data-i="${i}" aria-label="Ke karya ${i + 1}"></button>`
    ).join("");
  }

  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }

  // ---- navigation ----
  function go(delta) {
    const n = state.list.length;
    if (!n) return;
    state.idx = (state.idx + delta + n) % n;
    render();
    if (!lightbox.hidden) lbImg.src = current().image;
  }
  function goTo(i) { state.idx = i; render(); }

  // ---- autoplay ----
  function modalOpen() { return !lightbox.hidden; }
  function clearAuto() { if (state.timer) { clearTimeout(state.timer); state.timer = null; } }
  function scheduleAuto() {
    clearAuto();
    const fill = document.getElementById("autofill");
    if (!state.autoplay || modalOpen() || state.list.length < 2) {
      if (fill) { fill.style.transition = "none"; fill.style.width = "0%"; }
      return;
    }
    if (fill) {
      fill.style.transition = "none"; fill.style.width = "0%";
      void fill.offsetWidth;
      fill.style.transition = "width " + AUTOPLAY_MS + "ms linear";
      fill.style.width = "100%";
    }
    state.timer = setTimeout(() => go(1), AUTOPLAY_MS);
  }
  function setAutoplay(on) {
    state.autoplay = on;
    const btn = document.getElementById("autoBtn");
    if (btn) {
      btn.setAttribute("aria-pressed", on ? "true" : "false");
      btn.querySelector(".ic-pause").hidden = !on;
      btn.querySelector(".ic-play").hidden = on;
      document.getElementById("autoLabel").textContent = on ? "Auto-slide" : "Dijeda";
    }
    scheduleAuto();
  }

  // ---- filter ----
  function applyFilter(jenis) {
    state.filter = jenis;
    state.list = jenis === "Semua" ? state.all.slice() : state.all.filter((w) => w.jenis === jenis);
    state.idx = 0;
    document.querySelectorAll(".chip").forEach((c) => c.classList.toggle("active", c.dataset.j === jenis));
    render(false);
  }

  function buildFilters() {
    const counts = {};
    state.all.forEach((w) => counts[w.jenis] = (counts[w.jenis] || 0) + 1);
    const order = ["Buku", "Artikel Jurnal", "Penelitian", "Tesis", "Disertasi", "Orasi Ilmiah", "Lainnya"];
    const present = order.filter((j) => counts[j]);
    const bar = $("#filterbar");
    const chips = [`<button class="chip active" data-j="Semua">Semua <span class="n">${state.all.length}</span></button>`];
    present.forEach((j) => chips.push(`<button class="chip" data-j="${esc(j)}">${esc(j)} <span class="n">${counts[j]}</span></button>`));
    bar.innerHTML = chips.join("");
    bar.querySelectorAll(".chip").forEach((c) => c.addEventListener("click", () => applyFilter(c.dataset.j)));
  }

  // ---- reaction action ----
  async function toggleReaction(emoji) {
    if (RKEYS.indexOf(emoji) < 0) return;
    const w = current();
    const mset = mineSet(w.id);
    const on = mset.has(emoji);
    const action = on ? "remove" : "add";
    if (on) { mset.delete(emoji); setCount(w.id, emoji, countOf(w.id, emoji) - 1); }
    else { mset.add(emoji); setCount(w.id, emoji, countOf(w.id, emoji) + 1); }
    renderReactions();
    const btn = els.reactions.querySelector(`.react-btn[data-emoji="${emoji}"]`);
    if (btn && !on) {
      btn.classList.add("pop"); setTimeout(() => btn.classList.remove("pop"), 380);
      flyBurst(emoji, btn);
    }
    await sendReaction(w.id, emoji, action);
    renderReactions();
  }

  // ---- floating emoji (Zoom-style) ----
  const reduceMotion = (() => { try { return window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch (e) { return false; } })();
  function charOf(key) { const r = REACTIONS.find((x) => x.key === key); return r ? r.char : "❤️"; }
  function flyOne(char, x, y) {
    const el = document.createElement("span");
    el.className = "fly-emoji";
    el.textContent = char;
    el.style.left = x + "px";
    el.style.top = y + "px";
    document.body.appendChild(el);
    const dx = Math.random() * 120 - 60;
    const rise = -(window.innerHeight * 0.5 + Math.random() * 160);
    const rot = Math.random() * 44 - 22;
    const dur = 1500 + Math.random() * 800;
    const anim = el.animate([
      { transform: "translate(-50%,-50%) scale(.5)", opacity: 0 },
      { transform: "translate(-50%,-50%) scale(1.2)", opacity: 1, offset: 0.14 },
      { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${rise}px)) scale(1) rotate(${rot}deg)`, opacity: 0 },
    ], { duration: dur, easing: "cubic-bezier(.33,0,.3,1)" });
    anim.onfinish = () => el.remove();
    anim.oncancel = () => el.remove();
  }
  function flyBurst(emoji, btn) {
    if (reduceMotion || !btn) return;
    const r = btn.getBoundingClientRect();
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    for (let i = 0; i < 3; i++) {
      setTimeout(() => flyOne(charOf(emoji), cx + (Math.random() * 20 - 10), cy), i * 110);
    }
  }

  // ---- lightbox ----
  const lightbox = $("#lightbox"), lbImg = $("#lbImg");
  function openLightbox() { lbImg.src = current().image; lightbox.hidden = false; document.body.style.overflow = "hidden"; clearAuto(); scheduleAuto(); }
  function closeLightbox() { lightbox.hidden = true; document.body.style.overflow = ""; scheduleAuto(); }

  // ---- QR (inline) ----
  function canonicalUrl() {
    const u = new URL(window.location.href);
    u.hash = ""; u.search = "";
    return u.toString();
  }
  function buildInlineQR() {
    const box = document.getElementById("qrBox");
    if (!box || typeof window.qrcode !== "function") return;
    try {
      const qr = window.qrcode(0, "M");
      qr.addData(canonicalUrl());
      qr.make();
      box.innerHTML = qr.createSvgTag({ cellSize: 6, margin: 1, scalable: true }).replace(/fill="black"/g, 'fill="#122a21"');
    } catch (e) {}
  }

  // ---- toast ----
  let toastT;
  function showToast(msg) {
    const t = $("#toast"); t.textContent = msg; t.classList.add("show");
    clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove("show"), 2600);
  }

  // ---- events ----
  function wire() {
    $("#prevBtn").addEventListener("click", () => go(-1));
    $("#nextBtn").addEventListener("click", () => go(1));
    els.reactions.addEventListener("click", (e) => {
      const btn = e.target.closest(".react-btn");
      if (btn) toggleReaction(btn.getAttribute("data-emoji"));
    });
    $("#posterWrap").addEventListener("click", openLightbox);
    $("#lbClose").addEventListener("click", closeLightbox);
    $("#lbPrev").addEventListener("click", (e) => { e.stopPropagation(); go(-1); });
    $("#lbNext").addEventListener("click", (e) => { e.stopPropagation(); go(1); });
    lightbox.addEventListener("click", (e) => { if (e.target === lightbox) closeLightbox(); });
    const autoBtn = document.getElementById("autoBtn");
    if (autoBtn) autoBtn.addEventListener("click", () => setAutoplay(!state.autoplay));
    els.progress.addEventListener("click", (e) => { const d = e.target.closest(".dot"); if (d) goTo(+d.dataset.i); });

    document.addEventListener("keydown", (e) => {
      if (!lightbox.hidden) {
        if (e.key === "Escape") closeLightbox();
        else if (e.key === "ArrowLeft") go(-1);
        else if (e.key === "ArrowRight") go(1);
        return;
      }
      if (e.key === "ArrowLeft") go(-1);
      else if (e.key === "ArrowRight") go(1);
    });

    // swipe
    let sx = 0, sy = 0, tracking = false;
    const area = $("#viewer");
    area.addEventListener("touchstart", (e) => { sx = e.touches[0].clientX; sy = e.touches[0].clientY; tracking = true; }, { passive: true });
    area.addEventListener("touchend", (e) => {
      if (!tracking) return; tracking = false;
      const dx = e.changedTouches[0].clientX - sx, dy = e.changedTouches[0].clientY - sy;
      if (Math.abs(dx) > 55 && Math.abs(dx) > Math.abs(dy) * 1.5) go(dx < 0 ? 1 : -1);
    }, { passive: true });
  }

  // ---- boot ----
  async function boot() {
    try {
      const r = await fetch("data/works.json", { cache: "no-store" });
      const data = await r.json();
      state.all = data.works || [];
    } catch (e) {
      $("#workTitle").textContent = "Gagal memuat data karya.";
      return;
    }
    state.list = state.all.slice();
    buildFilters();
    wire();
    buildInlineQR();
    render(false);
    await fetchReactions();
    render(false);
    if (state.backend === false) {
      try {
        if (!sessionStorage.getItem("sb_demo_hinted")) {
          showToast("Mode demo: reaksi tersimpan di perangkat ini. Aktifkan backend untuk reaksi bersama.");
          sessionStorage.setItem("sb_demo_hinted", "1");
        }
      } catch (e) {}
    }
  }

  boot();
})();
