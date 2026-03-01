// SPDX-License-Identifier: MIT
(() => {
  console.log("[Passeeker] content.js cargado en:", location.href);

  // ---------- UI ----------
  function ensurePanel() {
    let panel = document.getElementById("passeeker-panel");
    if (panel) return panel;

    panel = document.createElement("div");
    panel.id = "passeeker-panel";
    panel.innerHTML = `
      <div class="pk-head">
        <div class="pk-title">Passeeker</div>
        <button class="pk-x" title="Cerrar">×</button>
      </div>
      <div class="pk-body">
        <div class="pk-status">Listo.</div>
        <div class="pk-list"></div>
        <div class="pk-actions"></div>
      </div>
    `;

    const style = document.createElement("style");
    style.textContent = `
      #passeeker-panel{
        position:fixed; right:16px; bottom:16px; width:320px;
        background:#111827; color:#e5e7eb; border:1px solid rgba(255,255,255,.08);
        border-radius:14px; box-shadow:0 10px 30px rgba(0,0,0,.35);
        z-index:2147483647; font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial;
        overflow:hidden;
      }
      #passeeker-panel .pk-head{ display:flex; align-items:center; justify-content:space-between; padding:10px 12px; background:rgba(255,255,255,.04); }
      #passeeker-panel .pk-title{ font-weight:700; }
      #passeeker-panel .pk-x{ background:transparent; border:0; color:#e5e7eb; font-size:20px; cursor:pointer; }
      #passeeker-panel .pk-body{ padding:12px; }
      #passeeker-panel .pk-status{ font-size:12px; opacity:.85; margin-bottom:10px; }
      #passeeker-panel .pk-item{ display:flex; justify-content:space-between; gap:8px; padding:8px; border-radius:10px; background:rgba(255,255,255,.04); margin-bottom:8px; }
      #passeeker-panel .pk-user{ font-size:13px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:190px; }
      #passeeker-panel button.pk-btn{
        padding:6px 10px; border-radius:10px; border:1px solid rgba(255,255,255,.12);
        background:rgba(255,255,255,.06); color:#e5e7eb; cursor:pointer; font-weight:600;
      }
      #passeeker-panel button.pk-btn:hover{ background:rgba(255,255,255,.10); }
      #passeeker-panel .pk-actions{ display:flex; gap:8px; margin-top:10px; flex-wrap:wrap; }
    `;
    document.documentElement.appendChild(style);
    document.documentElement.appendChild(panel);

    panel.querySelector(".pk-x").addEventListener("click", () => panel.remove());
    return panel;
  }

  function setStatus(panel, t) {
    panel.querySelector(".pk-status").textContent = t;
  }

  function clear(panel) {
    panel.querySelector(".pk-list").innerHTML = "";
    panel.querySelector(".pk-actions").innerHTML = "";
  }

  function domainKey() {
    try { return location.hostname.replace(/^www\./, "").toLowerCase(); }
    catch { return ""; }
  }

  function findUserFieldNear(pwd) {
    const form = pwd.closest("form") || document;
    return (
      form.querySelector("input[type='email']") ||
      form.querySelector("input[name*='email' i]") ||
      form.querySelector("input[name*='user' i]") ||
      form.querySelector("input[type='text']")
    );
  }

  async function renderForPasswordField(pwdInput) {
    const panel = ensurePanel();
    clear(panel);

    const userInput = findUserFieldNear(pwdInput);

    setStatus(panel, "Conectando con la app…");

    // Emparejar si hace falta (esto puede lanzar el diálogo en la app)
    let paired;
    try {
        // Si el contexto ya no es válido, no intentes nada
        if (!chrome?.runtime?.id) return;

            paired = await chrome.runtime.sendMessage({ type: "ENSURE_PAIRED" });

        } catch (e) {
            // Este error es normal cuando recargas la extensión o la página cambia
            if (String(e).includes("Extension context invalidated")) {
                return; // salimos sin romper nada
        }

        // Para otros errores, muéstralo
        console.error("ENSURE_PAIRED error:", e);
        setStatus(panel, "❌ No se pudo conectar con la app (error de extensión).");
        return;
        }
        if (!paired?.ok) {
            setStatus(panel, "❌ Abre Passeeker Desktop (vault desbloqueado) y acepta la conexión.");
            addSave(panel, userInput, pwdInput);
            return;
    }

    const domain = domainKey();
    setStatus(panel, `Buscando credenciales para ${domain}…`);

    const resp = await chrome.runtime.sendMessage({ type: "GET_CREDS", domain });
    if (!resp?.ok) {
      setStatus(panel, `❌ Error: ${resp?.data?.error || resp?.error || resp?.status}`);
      addSave(panel, userInput, pwdInput);
      return;
    }

    const items = resp.data?.items || [];
    const list = panel.querySelector(".pk-list");

    if (items.length === 0) {
      setStatus(panel, "No hay credenciales guardadas para esta web.");
      addSave(panel, userInput, pwdInput);
      return;
    }

    setStatus(panel, "Elige una cuenta para rellenar:");
    for (const it of items) {
      const row = document.createElement("div");
      row.className = "pk-item";
      row.innerHTML = `
        <div class="pk-user">${it.username || "(sin usuario)"}</div>
        <button class="pk-btn">Rellenar</button>
      `;
      row.querySelector("button").addEventListener("click", async () => {
        setStatus(panel, "Rellenando…");
        const pw = await chrome.runtime.sendMessage({ type: "GET_PASSWORD", id: it.id });
        if (!pw?.ok) {
          setStatus(panel, `❌ ${pw?.data?.error || pw?.error || pw?.status}`);
          return;
        }
        if (userInput) userInput.value = it.username || "";
        pwdInput.value = pw.data.password || "";
        pwdInput.dispatchEvent(new Event("input", { bubbles: true }));
        if (userInput) userInput.dispatchEvent(new Event("input", { bubbles: true }));
        setStatus(panel, "✅ Rellenado");
      });
      list.appendChild(row);
    }

    addSave(panel, userInput, pwdInput);
  }

  function addSave(panel, userInput, pwdInput) {
    const actions = panel.querySelector(".pk-actions");
    const btn = document.createElement("button");
    btn.className = "pk-btn";
    btn.textContent = "Guardar";

    btn.addEventListener("click", async () => {
      const username = userInput ? userInput.value : "";
      const password = pwdInput.value || "";
      if (!password) { setStatus(panel, "No hay contraseña para guardar."); return; }

      setStatus(panel, "Guardando…");
      const r = await chrome.runtime.sendMessage({
        type: "SAVE_CREDENTIAL",
        payload: {
          url: location.origin,
          page: location.href,
          username,
          password,
          createdAt: Date.now()
        }
      });

      if (r?.ok) setStatus(panel, "✅ Guardada");
      else setStatus(panel, `❌ ${r?.data?.error || r?.error || r?.status}`);
    });

    actions.appendChild(btn);
  }

  // ---------- Trigger: SIEMPRE que enfoques password ----------
  let lastPwd = null;
  document.addEventListener("focusin", (e) => {
    const el = e.target;
    if (!(el instanceof HTMLInputElement)) return;
    if (el.type !== "password") return;

    // evita re-render si es el mismo input
    if (lastPwd === el) return;
    lastPwd = el;

    console.log("[Passeeker] foco en password:", el);
    renderForPasswordField(el);
  }, true);

  // ---------- Para SPAs: por si cambian inputs o aparecen tarde ----------
  const obs = new MutationObserver(() => {
    // si ya hay un password en pantalla y no hay panel, lo ponemos al primer password visible
    if (document.getElementById("passeeker-panel")) return;

    const pwd = Array.from(document.querySelectorAll("input[type='password']")).find(x => x.offsetParent !== null);
    if (pwd) {
      console.log("[Passeeker] detectado password (observer):", pwd);
      renderForPasswordField(pwd);
    }
  });

  obs.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ["type"] });
})();
