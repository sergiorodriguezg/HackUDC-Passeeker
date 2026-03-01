const API = "http://127.0.0.1:8787";
let session = null;
let authConfigured = false;

function $(id){ return document.getElementById(id); }

function toast(msg){
  const t = $("toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toast._t);
  toast._t = setTimeout(()=>t.classList.remove("show"), 1800);
}

function setStatus(el, msg){ el.textContent = msg || ""; }

function setAuthMode(){
  const mode = $("authMode");
  const main = $("btnAuthMain");
  if (!authConfigured){
    mode.textContent = "Primer uso: crea tu usuario y contraseña.";
    main.textContent = "Crear cuenta";
  } else {
    mode.textContent = "Introduce tu usuario y contraseña maestra.";
    main.textContent = "Entrar";
  }
}

async function apiFetch(path, opts={}){
  const headers = Object.assign({"Content-Type":"application/json"}, opts.headers || {});
  if (session) headers["X-Passeeker-Session"] = session;

  const res = await fetch(API + path, Object.assign({}, opts, {headers}));
  const ct = res.headers.get("content-type") || "";
  const json = ct.includes("application/json") ? await res.json() : null;
  return {res, json};
}

function showAuth(){
  $("auth").classList.remove("hidden");
  $("appUI").classList.add("hidden");
}

function showApp(){
  $("auth").classList.add("hidden");
  $("appUI").classList.remove("hidden");
}

async function refreshAuthStatus(){
  try {
    const {json} = await apiFetch("/api/auth/status", { method:"GET" });
    authConfigured = !!json?.configured;
  } catch {
    authConfigured = false;
  }
  setAuthMode();
}

async function doAuthMain(){
  const user = $("user").value.trim();
  const password = $("pass").value;
  const status = $("authStatus");
  setStatus(status, "");

  try {
    if (!authConfigured){
      const {res, json} = await apiFetch("/api/auth/setup", {
        method:"POST",
        body: JSON.stringify({user, password})
      });
      if (!res.ok) throw new Error(json?.error || "No se pudo crear");
      authConfigured = true;
      setAuthMode();
      setStatus(status, "Cuenta creada. Ya puedes entrar.");
      return;
    }

    const {res, json} = await apiFetch("/api/auth/login", {
      method:"POST",
      body: JSON.stringify({user, password})
    });

    if (!res.ok) throw new Error(json?.error || "Credenciales incorrectas");

    session = json.sessionToken;
    showApp();
    await loadCredentials();
    toast("Sesión iniciada");
  } catch (e){
    setStatus(status, String(e?.message || e));
  }
}

async function doRecheck(){
  session = null;
  await refreshAuthStatus();
  toast("Estado actualizado");
}

function togglePass(inputId){
  const el = $(inputId);
  el.type = el.type === "password" ? "text" : "password";
}

/* -------------------- CRUD credenciales -------------------- */

function securityBadge(item){
  const pwned = !!item.pwned;
  const count = Number(item.pwnedCount || 0);
  if (!pwned) return `<span class="badge ok">OK</span>`;
  return `<span class="badge bad">PWNED ${count || ""}</span>`;
}

function rowHtml(item){
  const url = String(item.url || "");
  const user = String(item.username || "");

  return `
    <tr>
      <td>${escapeHtml(url)}</td>
      <td>
        <div class="userCell">
          <div class="userName">${escapeHtml(user || "—")}</div>
          <div class="userActions">
            <button class="btn" data-act="view" data-id="${item.id}">Ver</button>
            <button class="btn" data-act="copy" data-id="${item.id}">Copiar</button>
            <button class="btn btnDanger" data-act="del" data-id="${item.id}">Eliminar</button>
          </div>
        </div>
      </td>
      <td>${securityBadge(item)}</td>
    </tr>
  `;
}

function escapeHtml(s){
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function loadCredentials(){
  const q = $("search").value.trim();
  const tbody = $("tbody");
  const status = $("status");

  tbody.innerHTML = `<tr><td colspan="3" class="muted">Cargando…</td></tr>`;
  setStatus(status, "");

  try {
    const {res, json} = await apiFetch(`/api/credentials?q=${encodeURIComponent(q)}`, { method:"GET" });
    if (!res.ok) throw new Error(json?.error || "No se pudo cargar");

    const items = json.items || [];
    if (!items.length){
      tbody.innerHTML = `<tr><td colspan="3" class="muted">No hay resultados.</td></tr>`;
      return;
    }

    tbody.innerHTML = items.map(rowHtml).join("\n");
  } catch (e){
    tbody.innerHTML = `<tr><td colspan="3" class="muted">Error cargando.</td></tr>`;
    setStatus(status, String(e?.message || e));
  }
}

async function fetchPassword(id){
  const {res, json} = await apiFetch(`/api/password/${encodeURIComponent(id)}`, { method:"GET" });
  if (!res.ok) throw new Error(json?.error || "No se pudo obtener la contraseña");
  return String(json.password || "");
}

async function copyToClipboard(text){
  await navigator.clipboard.writeText(text);
}

/* Modal helpers */
function openModal(id){ $(id).classList.remove("hidden"); }
function closeModal(id){ $(id).classList.add("hidden"); }

let lastViewedPassword = "";

async function onRowAction(e){
  const btn = e.target.closest("button[data-act]");
  if (!btn) return;

  const act = btn.dataset.act;
  const id = btn.dataset.id;

  try {
    if (act === "view"){
      const pw = await fetchPassword(id);
      lastViewedPassword = pw;
      $("viewOut").textContent = pw || "—";
      openModal("viewModal");
      return;
    }

    if (act === "copy"){
      const pw = await fetchPassword(id);
      await copyToClipboard(pw);
      toast("Contraseña copiada");
      return;
    }

    if (act === "edit"){
      // buscamos los datos en la fila
      const tr = btn.closest("tr");
      const url = tr?.children?.[0]?.textContent || "";
      const username = tr?.querySelector(".userName")?.textContent || "";

      $("editId").value = id;
      $("editUrl").value = url;
      $("editUsername").value = username === "—" ? "" : username;
      $("editPassword").value = "";
      openModal("editModal");
      return;
    }

    if (act === "del"){
      const ok = confirm("¿Eliminar esta credencial?");
      if (!ok) return;

      const {res, json} = await apiFetch(`/api/credentials/${encodeURIComponent(id)}`, { method:"DELETE" });
      if (!res.ok) throw new Error(json?.error || "No se pudo eliminar");

      toast("Eliminada");
      await loadCredentials();
      return;
    }
  } catch (e){
    setStatus($("status"), String(e?.message || e));
  }
}

async function saveNew(){
  const url = $("newUrl").value.trim();
  const username = $("newUsername").value.trim();
  const password = $("newPassword").value;

  try {
    const {res, json} = await apiFetch("/api/credentials", {
      method:"POST",
      body: JSON.stringify({ url, username, password, createdAt: Date.now() })
    });
    if (!res.ok) throw new Error(json?.error || "No se pudo guardar");

    closeModal("newModal");
    $("newUrl").value = "";
    $("newUsername").value = "";
    $("newPassword").value = "";

    toast("Guardada");
    await loadCredentials();
  } catch (e){
    toast(String(e?.message || e));
  }
}

async function saveEdit(){
  const id = $("editId").value;
  const url = $("editUrl").value.trim();
  const username = $("editUsername").value.trim();
  const password = $("editPassword").value;

  try {
    const {res, json} = await apiFetch(`/api/credentials/${encodeURIComponent(id)}`, {
      method:"PUT",
      body: JSON.stringify({ url, username, password })
    });
    if (!res.ok) throw new Error(json?.error || "No se pudo actualizar");

    closeModal("editModal");
    toast("Actualizada");
    await loadCredentials();
  } catch (e){
    toast(String(e?.message || e));
  }
}

/* -------------------- Generador -------------------- */
async function generatePassword(){
  const provider = $("genProvider").value;
  try {
    if (provider === "random"){
      const {res, json} = await apiFetch("/api/generate/random", { method:"GET" });
      if (!res.ok) throw new Error(json?.error || "No se pudo generar");
      const pw = String(json.password || "");
      $("genOut").textContent = pw || "—";
      if (pw){
        await copyToClipboard(pw);
        toast("Contraseña copiada");
      }
      return;
    }

    // provider === "hf"
    const {res, json} = await apiFetch("/api/suggestion/hf", { method:"GET" });
    if (!res.ok) throw new Error(json?.error || "No se pudo generar");
    if (!json.enabled){
      $("genOut").textContent = "HF_TOKEN no configurado";
      toast("HF_TOKEN no configurado");
      return;
    }

    const phrase = String(json.phrase || "");
    $("genOut").textContent = phrase || "—";
    if (phrase){
      await copyToClipboard(phrase);
      toast("Copiado");
    }
  } catch (e){
    toast(String(e?.message || e));
  }
}

/* -------------------- Password checker (HIBP) -------------------- */
async function checkPassword(){
  const pw = $("pwCheckInput").value;
  if (!pw){
    $("pwCheckOut").textContent = "Escribe una contraseña";
    return;
  }

  try {
    const {res, json} = await apiFetch("/api/hibp", {
      method:"POST",
      body: JSON.stringify({ password: pw })
    });
    if (!res.ok) throw new Error(json?.error || "No se pudo comprobar");

    const r = json.result;
    if (!r?.pwned){
      $("pwCheckOut").textContent = "✅ No aparece en filtraciones conocidas";
    } else {
      $("pwCheckOut").textContent = `⚠️ Filtrada (aparece ${r.count} veces)`;
    }
  } catch (e){
    $("pwCheckOut").textContent = String(e?.message || e);
  }
}

/* -------------------- Session actions -------------------- */
async function logout(){
  try {
    await apiFetch("/api/auth/logout", { method:"POST" });
  } catch {}
  session = null;
  showAuth();
  toast("Sesión cerrada");
}

/* Pairing placeholder */
async function pair(){
  toast("Emparejamiento: pendiente de mejorar");
}

/* Wire up */
window.addEventListener("DOMContentLoaded", async () => {
  $("btnAuthMain").addEventListener("click", doAuthMain);
  $("toggleEye").addEventListener("click", ()=>togglePass("pass"));

  // App buttons
  $("btnRefresh").addEventListener("click", loadCredentials);
  $("btnSearch").addEventListener("click", loadCredentials);
  $("btnLogout").addEventListener("click", logout);

  // Table actions
  $("tbody").addEventListener("click", onRowAction);

  // New modal
  $("btnNew").addEventListener("click", ()=>openModal("newModal"));
  $("btnCancelNew").addEventListener("click", ()=>closeModal("newModal"));
  $("btnSaveNew").addEventListener("click", saveNew);
  $("toggleNewEye").addEventListener("click", ()=>togglePass("newPassword"));

  // Edit modal
  $("btnEditCancel").addEventListener("click", ()=>closeModal("editModal"));
  $("btnEditSave").addEventListener("click", saveEdit);
  $("toggleEditEye").addEventListener("click", ()=>togglePass("editPassword"));

  // View modal
  $("btnCloseView").addEventListener("click", ()=>closeModal("viewModal"));
  $("btnCopyView").addEventListener("click", async ()=>{
    try{
      await copyToClipboard(lastViewedPassword);
      toast("Contraseña copiada");
    }catch(e){
      toast("No se pudo copiar");
    }
  });

  // Generator
  $("btnGenerate").addEventListener("click", generatePassword);

  // Checker
  $("btnPwCheck").addEventListener("click", checkPassword);
  $("pwCheckEye").addEventListener("click", ()=>togglePass("pwCheckInput"));

  await refreshAuthStatus();
});
