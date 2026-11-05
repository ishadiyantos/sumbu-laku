(() => {
  "use strict";

  const $ = (s) => document.querySelector(s);
  const state = {
    all: [],          // all works
    list: [],         // filtered works
    idx: 0,
    filter: "Semua",
    counts: {},       // id -> love count
    mine: new Set(),  // ids this device loves
    backend: null,    // true/false once known
    autoplay: true,   // auto-slide on by default
    timer: null,
  };
  const AUTOPLAY_MS = 30000; // 30 detik

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
  const LKEY = "sb_votes_v1";
  function localLoad() {
    try { return JSON.parse(localStorage.getItem(LKEY) || "{}"); } catch (e) { return {}; }
  }
  function localSave(obj) { try { localStorage.setItem(LKEY, JSON.stringify(obj)); } catch (e) {} }

  // ---- API helpers (graceful fallback to localStorage) ----
  async function fetchVotes() {
    try {
      const r = await fetch(`api/votes?deviceId=${encodeURIComponent(DEV)}`, { cache: "no-store" });
      if (!r.ok) throw new Error("no api");
      const data = await r.json();
      state.backend = true;
      state.counts = data.counts || {};
      state.mine = new Set(data.mine || []);
      return;
    } catch (e) {
      // demo / offline mode
      state.backend = false;
      const local = localLoad();
      state.counts = {};
      state.mine = new Set();
      state.all.forEach((w) => {
        const rec = local[w.id] || { c: 0, mine: false };
        state.counts[w.id] = rec.c || 0;
        if (rec.mine) state.mine.add(w.id);
      });
    }
  }

  async function sendVote(id, action) {
    if (state.backend) {
      try {
        const r = await fetch("api/vote", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id, deviceId: DEV, action }),
        });
        if (!r.ok) throw new Error("vote fail");
        const data = await r.json();
        if (typeof data.count === "number") state.counts[id] = data.count;
        return true;
      } catch (e) {
        showToast("Gagal menyimpan ke server, memakai mode lokal.");
        state.backend = false;
      }
    }
    // local fallback
    const local = localLoad();
    const rec = local[id] || { c: 0, mine: false };
    if (action === "love" && !rec.mine) { rec.c++; rec.mine = true; }
    else if (action === "unlove" && rec.mine) { rec.c = Math.max(0, rec.c - 1); rec.mine = false; }
    local[id] = rec;
    localSave(local);
    state.counts[id] = rec.c;
    return true;
  }

  // ---- rendering ----
  const posterImg = $("#posterImg");
  const els = {
    counter: $("#counter"), badges: $("#badges"), title: $("#workTitle"),
    name: $("#authorName"), inst: $("#authorInst"), meta: $("#authorMeta"),
    loveBtn: $("#loveBtn"), loveCount: $("#loveCount"), loveLabel: $("#loveLabel"),
    pdfBtn: $("#pdfBtn"), progress: $("#progress"),
  };

  function current() { return state.list[state.idx]; }

  function render(animate = true) {
    const w = current();
    if (!w) return;
    // image swap transition
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

    // badges
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

    // pdf
    if (w.pdf) { els.pdfBtn.hidden = false; els.pdfBtn.href = w.pdf; }
    else { els.pdfBtn.hidden = true; }

    renderLove();
    renderDots();
    scheduleAuto();
  }

  function renderLove() {
    const w = current();
    const c = state.counts[w.id] || 0;
    const mine = state.mine.has(w.id);
    els.loveCount.textContent = c;
    els.loveBtn.setAttribute("aria-pressed", mine ? "true" : "false");
    els.loveLabel.textContent = mine ? "Disukai" : "Like";
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
      void fill.offsetWidth; // reflow to restart animation
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

  // ---- love action ----
  async function toggleLove() {
    const w = current();
    const mine = state.mine.has(w.id);
    const action = mine ? "unlove" : "love";
    // optimistic
    if (mine) { state.mine.delete(w.id); state.counts[w.id] = Math.max(0, (state.counts[w.id] || 1) - 1); }
    else { state.mine.add(w.id); state.counts[w.id] = (state.counts[w.id] || 0) + 1; els.loveBtn.classList.add("pulse"); setTimeout(() => els.loveBtn.classList.remove("pulse"), 400); }
    renderLove();
    await sendVote(w.id, action);
    renderLove();
  }

  // ---- lightbox ----
  const lightbox = $("#lightbox"), lbImg = $("#lbImg");
  function openLightbox() { lbImg.src = current().image; lightbox.hidden = false; document.body.style.overflow = "hidden"; clearAuto(); scheduleAuto(); }
  function closeLightbox() { lightbox.hidden = true; document.body.style.overflow = ""; scheduleAuto(); }

  // ---- QR (inline, under the action buttons) ----
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
    els.loveBtn.addEventListener("click", toggleLove);
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
      else if (e.key.toLowerCase() === "l") toggleLove();
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
    await fetchVotes();
    render(false);
    if (state.backend === false) {
      // subtle hint only once per session
      try {
        if (!sessionStorage.getItem("sb_demo_hinted")) {
          showToast("Mode demo: like tersimpan di perangkat ini. Aktifkan backend untuk like bersama.");
          sessionStorage.setItem("sb_demo_hinted", "1");
        }
      } catch (e) {}
    }
  }

  boot();
})();
