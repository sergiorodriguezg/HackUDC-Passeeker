const $ = (id) => document.getElementById(id);

let SESSION = null;

function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function toast(msg) {
  const el = $("toast");
  if (!el) return;
  el.textContent = msg;
  el.classList.add("show");
  setTimeout(() => el.classList.remove("show"), 2200);
}

function setPwBadge(el, kind, text) {
  if (!el) return;
  el.classList.remove("ok", "bad", "muted");
  if (kind) el.classList.add(kind);
  else el.classList.add("muted");
  el.textContent = text || "—";
}

async function checkPasswordLeak(password, badgeEl) {
  const pw = String(password || "");
  if (!pw) return setPwBadge(badgeEl, null, "Escribe una contraseña");

  setPwBadge(badgeEl, null, "Comprobando…");

  try {
    const data = await api("/api/hibp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: pw })
    });

    const r = data.result;
    if (r.pwned) setPwBadge(badgeEl, "bad", `⚠️ FILTRADA (${r.count})`);
    else setPwBadge(badgeEl, "ok", "✅ NO filtrada (chachi)");
  } catch (e) {
    setPwBadge(badgeEl, "bad", "❌ Error al comprobar");
    toast("❌ " + (e?.message || e));
  }
}

function setAuthStatus(msg) {
  const el = $("authStatus");
  if (el) el.textContent = msg || "";
}

function showAuth() {
  $("auth")?.classList.remove("hidden");
  $("appUI")?.classList.add("hidden");
}

function showApp() {
  $("auth")?.classList.add("hidden");
  $("appUI")?.classList.remove("hidden");
}

function setAuthModeUI(mode) {
  const btn = $("btnAuthMain");
  const label = $("authMode");
  if (!btn || !label) return;

  if (mode === "setup") {
    label.textContent = "Primer uso: crea tu usuario y contraseña.";
    btn.textContent = "Crear cuenta";
    btn.dataset.mode = "setup";
  } else {
    label.textContent = "Introduce tu usuario y contraseña maestra.";
    btn.textContent = "Entrar";
    btn.dataset.mode = "login";
  }
}

async function api(path, opts = {}) {
  const url = `http://127.0.0.1:8787${path}`;
  const headers = new Headers(opts.headers || {});
  if (SESSION) headers.set("X-Passeeker-Session", SESSION);

  const res = await fetch(url, { ...opts, headers });
  const ctype = res.headers.get("content-type") || "";

  // Si backend devuelve HTML (error express), lo mostramos
  if (!ctype.includes("application/json")) {
    const txt = await res.text();
    throw new Error(txt.slice(0, 200));
  }

  const data = await res.json();
  if (!res.ok || data?.ok === false) {
    throw new Error(data?.error || `HTTP ${res.status}`);
  }
  return data;
}

async function copyToClipboard(text) {
  const t = String(text ?? "");
  if (!t) return false;

  // 1) Intento moderno
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(t);
      return true;
    }
  } catch (_) {}

  // 2) Fallback clásico (funciona en Electron casi siempre)
  try {
    const ta = document.createElement("textarea");
    ta.value = t;
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    ta.style.top = "-9999px";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch (_) {
    return false;
  }
}

// ---------- AUTH ----------
async function checkAuthState() {
  showAuth();
  setAuthStatus("");
  setAuthModeUI("login"); // fallback

  try {
    const data = await api("/api/auth/status");

    if (data.configured === false) {
      setAuthModeUI("setup");
      return;
    }

    if (data.unlocked === true) {
      showApp();
      await loadList($("search")?.value || "");
      return;
    }

    setAuthModeUI("login");
  } catch (e) {
    setAuthStatus("Error: " + (e?.message || e));
  }
}

async function setupAccount() {
  try {
    setAuthStatus("");
    const user = $("user")?.value?.trim();
    const password = $("pass")?.value;

    if (!user || !password) {
      setAuthStatus("Usuario y contraseña obligatorios");
      return;
    }

    const data = await api("/api/auth/setup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user, password })
    });

    if (data.sessionToken) SESSION = data.sessionToken;

    toast("✅ Cuenta creada");
    await checkAuthState();
  } catch (e) {
    setAuthStatus(String(e?.message || e));
  }
}

async function login() {
  try {
    setAuthStatus("");
    const user = $("user")?.value?.trim();
    const password = $("pass")?.value;

    if (!user || !password) {
      setAuthStatus("Usuario y contraseña obligatorios");
      return;
    }

    const data = await api("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user, password })
    });

    SESSION = data.sessionToken;

    toast("✅ Desbloqueado");
    showApp();
    await loadList("");
  } catch (e) {
    setAuthStatus(String(e?.message || e));
  }
}

async function logout() {
  try {
    await api("/api/auth/logout", { method: "POST" });
  } catch {}
  SESSION = null;
  toast("🔒 Bloqueado");
  await checkAuthState();
}

// ---------- LISTA ----------
function badgeHtml(c) {
  const pwned = Number(c.pwned || 0) === 1;
  const count = Number(c.pwnedCount || 0);
  if (!pwned) return `<span class="badge ok">OK</span>`;
  return `<span class="badge bad">PWNED ${count}</span>`;
}

function rowHtml(c) {
  const url = escapeHtml(c.url || "");
  const user = escapeHtml(c.username || "");

  return `
    <tr>
      <td class="mono">${url}</td>

      <td>
        <div class="userCell">
          <div class="userName">${user}</div>

          <div class="userActions">
            <button class="btn btnSm" data-act="view" data-id="${c.id}">Ver</button>
            <button class="btn btnSm" data-act="copy" data-id="${c.id}">Copiar</button>
            <button class="btn btnSm" data-act="edit" data-id="${c.id}"
              data-url="${url}" data-user="${user}">Actualizar</button>
            <button class="btn btnDanger" data-act="del" data-id="${c.id}">Eliminar</button>
          </div>
        </div>
      </td>

      <td>${badgeHtml(c)}</td>
    </tr>
  `;
}

async function loadList(q) {
  const tbody = $("tbody");
  if (!tbody) return;

  tbody.innerHTML = `<tr><td colspan="4" class="muted">Cargando…</td></tr>`;

  const data = await api(`/api/credentials?q=${encodeURIComponent(q || "")}`);
  const items = data.items || [];

  if (!items.length) {
    tbody.innerHTML = `<tr><td colspan="4" class="muted">Sin resultados</td></tr>`;
    return;
  }

  tbody.innerHTML = items.map(rowHtml).join("");
}

async function getPasswordById(id) {
  const data = await api(`/api/password/${encodeURIComponent(id)}`);
  return data.password || "";
}

function openViewModal(pw) {
  $("viewPassword").value = pw || "";
  $("viewPassword").type = "password";
  $("viewModal").classList.remove("hidden");
}

function closeViewModal() {
  $("viewModal").classList.add("hidden");
  $("viewPassword").value = "";
}

async function viewPassword(id) {
  try {
    const pw = await getPasswordById(id);
    if (!pw) return toast("❌ No hay contraseña");

    openViewModal(pw);
  } catch (e) {
    toast("❌ " + (e?.message || e));
  }
}

async function copyPassword(id) {
  try {
    const pw = await getPasswordById(id);
    if (!pw) return toast("❌ No hay contraseña");

    const ok = await copyToClipboard(pw);
    if (ok) toast("✅ Copiada");
    else toast("⚠️ No pude copiar (permiso/clip).");
  } catch (e) {
    toast("❌ " + (e?.message || e));
  }
}

async function checkHIBPById(id) {
  try {
    const pw = await getPasswordById(id);
    if (!pw) return toast("❌ No hay contraseña");

    const data = await api("/api/hibp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: pw })
    });

    const r = data.result;
    toast(r.pwned ? `⚠️ PWNED ${r.count}` : "✅ OK");
  } catch (e) {
    toast("❌ " + (e?.message || e));
  }
}

async function onTableClick(e) {
  const btn = e.target.closest?.("button[data-act]");
  if (!btn) return;

  const act = btn.dataset.act;
  const id = btn.dataset.id;

  try {
    if (act === "view") return await viewPassword(id);
    if (act === "copy") return await copyPassword(id);
    if (act === "check") return await checkHIBPById(id);

    if (act === "edit") {
      openEditModal({ id, url: btn.dataset.url, username: btn.dataset.user });
      return;
    }

    if (act === "del") {
      await deleteCredentialUI(id);
      return;
    }
  } catch (e2) {
    toast("❌ " + (e2?.message || e2));
  }
}

// ---------- MODAL NUEVA ----------
function openNewModal() {
  $("newUrl").value = "";
  $("newUsername").value = "";
  $("newPassword").value = "";
  $("newModal").classList.remove("hidden");
}

function closeNewModal() {
  $("newModal").classList.add("hidden");
}

async function saveNewCredential() {
  try {
    const url = $("newUrl").value.trim();
    const username = $("newUsername").value.trim();
    const password = $("newPassword").value;

    if (!url || !password) return toast("❌ URL y contraseña obligatorias");

    await api("/api/credentials", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url, username, password })
    });

    closeNewModal();
    toast("✅ Guardada");
    await loadList($("search")?.value || "");
  } catch (e) {
    toast("❌ " + (e?.message || e));
  }
}

// ---------- MODAL EDITAR ----------
function openEditModal({ id, url, username }) {
  $("editId").value = id;
  $("editUrl").value = url || "";
  $("editUsername").value = username || "";
  $("editPassword").value = "";
  $("editModal").classList.remove("hidden");
}

function closeEditModal() {
  $("editModal").classList.add("hidden");
}

async function saveEditModal() {
  try {
    const id = $("editId").value;
    const url = $("editUrl").value.trim();
    const username = $("editUsername").value.trim();
    const password = $("editPassword").value; // puede estar vacío

    if (!id || !url) return toast("❌ Falta URL");

    await api(`/api/credentials/${encodeURIComponent(id)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url, username, password })
    });

    closeEditModal();
    toast("✅ Actualizado");
    await loadList($("search")?.value || "");
  } catch (e) {
    toast("❌ " + (e?.message || e));
  }
}

async function deleteCredentialUI(id) {
  if (!confirm("¿Seguro que quieres eliminar esta credencial?")) return;

  try {
    await api(`/api/credentials/${encodeURIComponent(id)}`, { method: "DELETE" });
    toast("🗑 Eliminada");
    await loadList($("search")?.value || "");
  } catch (e) {
    toast("❌ " + (e?.message || e));
  }
}

// ---------- GENERADORES ----------
async function genRandom() {
  try {
    const r = await api("/api/generate/random");
    $("genOut").textContent = r.password || "—";
    if (r.password) {
      await navigator.clipboard.writeText(r.password);
      toast("✅ Generada y copiada");
    }
  } catch (e) {
    toast("❌ " + (e?.message || e));
  }
}

async function loadHF() {
  try {
    const r = await api("/api/suggestion/hf");
    if (!r.enabled) {
      $("hfOut").textContent = "—";
      return;
    }
    $("hfOut").textContent = r.phrase || "—";
  } catch {
    $("hfOut").textContent = "—";
  }
}

async function copyHF() {
  const t = $("hfOut")?.textContent || "";
  if (!t || t === "—") return;
  await navigator.clipboard.writeText(t);
  toast("✅ Copiada");
}

// ---------- PAIRING ----------
async function startPairingUI() {
  try {
    const r = await api("/api/ext/pair/start", { method: "POST" });
    alert(`Código para la extensión: ${r.code}\nCaduca en ${Math.round(r.expiresInMs / 1000)}s`);
  } catch (e) {
    toast("❌ " + (e?.message || e));
  }
}

function setPwBadge(el, kind, text) {
  if (!el) return;
  el.classList.remove("ok", "bad", "muted");
  if (kind) el.classList.add(kind);
  else el.classList.add("muted");
  el.textContent = text || "—";
}

async function checkPasswordLeak(password, badgeEl) {
  const pw = String(password || "");
  if (!pw) return setPwBadge(badgeEl, null, "Escribe una contraseña");

  setPwBadge(badgeEl, null, "Comprobando…");

  try {
    const data = await api("/api/hibp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: pw })
    });

    const r = data.result;
    if (r.pwned) setPwBadge(badgeEl, "bad", `FILTRADA (${r.count})`);
    else setPwBadge(badgeEl, "ok", "NO filtrada ✅");
  } catch (e) {
    setPwBadge(badgeEl, "bad", "Error al comprobar");
    toast("❌ " + (e?.message || e));
  }
}

// ---------- INIT ----------
window.addEventListener("DOMContentLoaded", async () => {
  $("toggleEye")?.addEventListener("click", () => {
    const inp = $("pass");
    if (!inp) return;
    inp.type = inp.type === "password" ? "text" : "password";
  });

  $("btnAuthMain")?.addEventListener("click", async () => {
    const mode = $("btnAuthMain")?.dataset?.mode || "login";
    if (mode === "setup") return setupAccount();
    return login();
  });


  $("btnLogout")?.addEventListener("click", logout);

  $("btnRefresh")?.addEventListener("click", () => loadList($("search")?.value || ""));
  $("btnSearch")?.addEventListener("click", () => loadList($("search")?.value || ""));
  $("search")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") loadList($("search")?.value || "");
  });

  $("tbody")?.addEventListener("click", onTableClick);

  $("btnNew")?.addEventListener("click", openNewModal);
  $("btnCancelNew")?.addEventListener("click", closeNewModal);
  $("btnSaveNew")?.addEventListener("click", saveNewCredential);

  $("btnEditCancel")?.addEventListener("click", closeEditModal);
  $("btnEditSave")?.addEventListener("click", saveEditModal);

  $("btnGenRandom")?.addEventListener("click", genRandom);
  $("btnGenRandom2")?.addEventListener("click", genRandom);

  $("btnCopyHf")?.addEventListener("click", copyHF);

  $("btnPair")?.addEventListener("click", startPairingUI);

  $("btnCheckNewPw")?.addEventListener("click", async () => {
    await checkPasswordLeak($("newPassword")?.value, $("newPwCheck"));
    });

  $("btnCheckEditPw")?.addEventListener("click", async () => {
    await checkPasswordLeak($("editPassword")?.value, $("editPwCheck"));
    });

  $("btnViewClose")?.addEventListener("click", closeViewModal);

  $("btnViewToggle")?.addEventListener("click", () => {
  const inp = $("viewPassword");
  if (!inp) return;
  inp.type = inp.type === "password" ? "text" : "password";
  });
   $("btnViewCopy")?.addEventListener("click", async () => {
  const pw = $("viewPassword")?.value || "";
  if (!pw) return;

  const ok = await copyToClipboard(pw);
  toast(ok ? "✅ Contraseña copiada" : "⚠️ No pude copiar");
  });

  await checkAuthState();
  await loadHF();
});

// --- Comprobador visual (HIBP) - engancha global (a prueba de fallos) ---
(function initPasswordCheckerUI() {
  const setPwBadge = (el, kind, text) => {
    if (!el) return;
    el.classList.remove("ok", "bad", "muted");
    el.classList.add(kind ? kind : "muted");
    el.textContent = text || "—";
  };

  const checkPasswordLeak = async (password, badgeEl) => {
    const pw = String(password || "");
    if (!pw) return setPwBadge(badgeEl, null, "Escribe una contraseña");

    setPwBadge(badgeEl, null, "Comprobando…");
    try {
      const data = await api("/api/hibp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: pw }),
      });
      const r = data.result;
      if (r.pwned) setPwBadge(badgeEl, "bad", `⚠️ FILTRADA (${r.count})`);
      else setPwBadge(badgeEl, "ok", "✅ NO filtrada (chachi)");
    } catch (e) {
      setPwBadge(badgeEl, "bad", "❌ Error al comprobar");
      toast("❌ " + (e?.message || e));
    }
  };

  // Click global: funciona aunque el elemento aparezca más tarde
  document.addEventListener("click", async (e) => {
    const t = e.target;

    // Ojo
    if (t && t.id === "pwCheckEye") {
      const inp = document.getElementById("pwCheckInput");
      if (!inp) return;
      inp.type = inp.type === "password" ? "text" : "password";
      return;
    }

    // Botón comprobar
    if (t && t.id === "btnPwCheck") {
      const inp = document.getElementById("pwCheckInput");
      const badge = document.getElementById("pwCheckResult");
      await checkPasswordLeak(inp?.value, badge);
      return;
    }
  });

  // Enter para comprobar
  document.addEventListener("keydown", async (e) => {
    if (e.key !== "Enter") return;
    const active = document.activeElement;
    if (!active || active.id !== "pwCheckInput") return;

    const inp = document.getElementById("pwCheckInput");
    const badge = document.getElementById("pwCheckResult");
    await checkPasswordLeak(inp?.value, badge);
  });

  // Estado inicial (por si quieres)
  window.addEventListener("load", () => {
    setPwBadge(document.getElementById("pwCheckResult"), null, "—");
  });
})();