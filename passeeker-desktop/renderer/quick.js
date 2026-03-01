const base = window.passeeker?.apiBase || "http://127.0.0.1:8787";
let token = null;
let selectedAppKey = "";

const $ = (id) => document.getElementById(id);

function toast(msg) {
  const el = $("toast");
  if (!el) return;
  el.textContent = msg;
  el.classList.add("show");
  setTimeout(() => el.classList.remove("show"), 1200);
}
function setQuickStatus(msg) { const el = $("quickStatus"); if (el) el.textContent = msg || ""; }

function showPane(which) {
  $("listPane").style.display = which === "list" ? "" : "none";
  $("savePane").style.display = which === "save" ? "" : "none";
  $("tabList").classList.toggle("btnPrimary", which === "list");
  $("tabSave").classList.toggle("btnPrimary", which === "save");
}

function toggleEye(inputId) {
  const input = $(inputId);
  input.type = (input.type === "password") ? "text" : "password";
}

async function loadSharedToken() {
  token = await window.passeeker.getSessionToken();
}
window.passeeker.onSessionUpdated((t) => { token = t; });

async function api(path, opts = {}) {
  const url = base + path;
  const headers = Object.assign({}, opts.headers || {});
  if (!token) await loadSharedToken();
  if (token) headers["X-Passeeker-Session"] = token;

  const res = await fetch(url, { ...opts, headers });
  const text = await res.text();

  let data;
  try { data = JSON.parse(text); } catch { data = { ok: false, error: text || "Respuesta no-JSON" }; }
  if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
  return data;
}

function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function renderApps(apps) {
  const wrap = $("apps");
  if (!wrap) return;

  if (!apps.length) {
    wrap.innerHTML = `<div class="muted">Sin apps.</div>`;
    return;
  }

  wrap.innerHTML = apps.map(a => {
    const active = a.appKey === selectedAppKey;
    return `
      <div class="appItem ${active ? "active" : ""}" data-app="${escapeHtml(a.appKey)}">
        <div>${escapeHtml(a.appKey)}</div>
        <div class="appBadge">${Number(a.count || 0)}</div>
      </div>
    `;
  }).join("");
}

function renderCreds(items) {
  const wrap = $("list");
  if (!wrap) return;

  if (!items.length) {
    wrap.innerHTML = `<div class="muted">No hay credenciales para esta app.</div>`;
    return;
  }

  wrap.innerHTML = items.slice(0, 20).map(c => {
    const safe = c.pwned ? `⚠️ PWNED ${c.pwnedCount || 0}` : `✅ SAFE`;
    return `
      <div class="item">
        <div class="itemTop">
          <div>
            <div class="itemUrl">${escapeHtml(c.url || "")}</div>
            <div class="itemUser">${escapeHtml(c.username || "") || "(sin usuario)"} · ${safe}</div>
          </div>
          <div class="itemBtns">
            <button class="btn" data-act="copy" data-id="${c.id}">Copiar</button>
            <button class="btn" data-act="view" data-id="${c.id}">Ver</button>
          </div>
        </div>
      </div>
    `;
  }).join("");
}

async function loadAppsAndSelectFirst() {
  setQuickStatus("Cargando apps…");
  const data = await api("/api/apps");
  const apps = data.apps || [];
  renderApps(apps);
  setQuickStatus("");

  if (!selectedAppKey && apps.length) {
    selectedAppKey = apps[0].appKey;
  }
  highlightSelectedApp();
  await loadCreds();
}

function highlightSelectedApp() {
  const items = document.querySelectorAll(".appItem");
  items.forEach(el => {
    el.classList.toggle("active", el.dataset.app === selectedAppKey);
  });
  $("credsTitle").textContent = selectedAppKey ? `Credenciales · ${selectedAppKey}` : "Credenciales";
}

async function loadCreds() {
  const q = ($("q").value || "").trim();
  const appKey = selectedAppKey || "";
  setQuickStatus("Cargando credenciales…");
  const data = await api(`/api/credentials?appKey=${encodeURIComponent(appKey)}&q=${encodeURIComponent(q)}`);
  renderCreds(data.items || []);
  setQuickStatus("");
}

async function getPassword(id) {
  const data = await api(`/api/password/${encodeURIComponent(id)}`);
  return data.password;
}

async function copyWithTimeout(text, seconds = 25) {
  await navigator.clipboard.writeText(text);
  toast("✅ Copiado");
  await window.passeeker.hideQuickWindow();

  setTimeout(async () => {
    try {
      const current = await navigator.clipboard.readText();
      if (current === text) await navigator.clipboard.writeText("");
    } catch {
      try { await navigator.clipboard.writeText(""); } catch {}
    }
  }, seconds * 1000);
}

async function unlock() {
  const user = ($("lockUser").value || "").trim();
  const pass = $("lockPass").value || "";
  setQuickStatus("Desbloqueando…");

  try {
    const res = await fetch(base + "/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user, password: pass })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error || "Login failed");

    await window.passeeker.setSessionToken(data.sessionToken);
    token = data.sessionToken;

    $("lockPane").style.display = "none";
    setQuickStatus("");
    toast("✅ Desbloqueado");

    showPane("list");
    selectedAppKey = "";
    await loadAppsAndSelectFirst();
  } catch (e) {
    setQuickStatus("❌ " + e.message);
  }
}

async function genRandom() {
  try {
    const data = await api("/api/generate/random");
    $("genOutQuick").textContent = data.password || "—";
    $("sPass").value = data.password || "";
    toast("🔐 Generada");
  } catch (e) {
    toast("❌ " + e.message);
  }
}

async function saveNew() {
  const url = ($("sUrl").value || "").trim();
  const username = ($("sUser").value || "").trim();
  const password = $("sPass").value || "";
  if (!url || !password) return toast("Falta URL o contraseña");

  setQuickStatus("Guardando…");
  try {
    const r = await api("/api/credentials", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url, username, password, createdAt: Date.now() })
    });

    setQuickStatus("");
    toast("✅ Guardada");

    // refresca lista y selecciona app donde se guardó
    selectedAppKey = r.appKey || selectedAppKey;
    showPane("list");
    await loadAppsAndSelectFirst();
  } catch (e) {
    setQuickStatus("❌ " + e.message);
  }
}

async function checkLocked() {
  await loadSharedToken();
  if (!token) {
    $("lockPane").style.display = "";
    return true;
  }
  $("lockPane").style.display = "none";
  return false;
}

async function onAppsClick(e) {
  const item = e.target.closest(".appItem");
  if (!item) return;
  selectedAppKey = item.dataset.app || "";
  highlightSelectedApp();
  await loadCreds();
}

async function onCredsClick(e) {
  const btn = e.target.closest("button[data-act]");
  if (!btn) return;

  const act = btn.dataset.act;
  const id = btn.dataset.id;

  try {
    const pw = await getPassword(id);
    if (act === "view") return alert(pw);
    if (act === "copy") return copyWithTimeout(pw, 25);
  } catch (e2) {
    toast("❌ " + e2.message);
  }
}

window.addEventListener("DOMContentLoaded", async () => {
  await loadSharedToken();

  $("btnClose").addEventListener("click", () => window.passeeker.hideQuickWindow());
  $("btnOpenFull").addEventListener("click", async () => {
    await window.passeeker.showMainWindow();
    await window.passeeker.hideQuickWindow();
  });

  $("tabList").addEventListener("click", () => showPane("list"));
  $("tabSave").addEventListener("click", () => showPane("save"));

  $("lockEye").addEventListener("click", () => toggleEye("lockPass"));
  $("btnUnlock").addEventListener("click", unlock);

  $("sEye").addEventListener("click", () => toggleEye("sPass"));
  $("btnGen").addEventListener("click", genRandom);
  $("btnSave").addEventListener("click", saveNew);

  $("btnGo").addEventListener("click", loadCreds);
  $("q").addEventListener("keydown", (ev) => { if (ev.key === "Enter") loadCreds(); });

  $("apps").addEventListener("click", onAppsClick);
  $("list").addEventListener("click", onCredsClick);

  // Cuando se pulsa el atajo, refresca
  window.passeeker.onQuickRefresh(async () => {
    const locked = await checkLocked();
    if (!locked) {
      showPane("list");
      await loadAppsAndSelectFirst();
    }
  });

  const locked = await checkLocked();
  if (!locked) {
    showPane("list");
    await loadAppsAndSelectFirst();
  }
});