// SPDX-License-Identifier: MIT
const BASE_URL = "http://127.0.0.1:8787";

console.log(" Passeeker background iniciado");

// Auto-prompt de conexión (solo si la app está desbloqueada)

async function getPromptState() {
  const { dismissedAt } = await chrome.storage.local.get(["dismissedAt"]);
  return { dismissedAt: Number(dismissedAt || 0) };
}

async function setDismissedNow() {
  await chrome.storage.local.set({ dismissedAt: Date.now() });
}

async function checkAppHealth() {
  try {
    const r = await get("/api/health");
    return { ok: r.ok, status: r.status, data: r.data };
  } catch (e) {
    return { ok: false, status: 0, data: { error: String(e?.message || e) } };
  }
}

async function openConnectWindow() {
  const url = chrome.runtime.getURL("connect.html");

  // evita abrir muchas veces
  const wins = await chrome.windows.getAll({ populate: true });
  for (const w of wins) {
    for (const t of (w.tabs || [])) {
      if (t.url === url) return;
    }
  }

  await chrome.windows.create({
    url,
    type: "popup",
    width: 420,
    height: 520
  });
}

async function maybePromptConnect(reason = "startup") {
  const token = await getExtToken();
  if (token) return; // ya conectado

  const health = await checkAppHealth();
  const unlocked = !!health?.data?.unlocked;
  if (!health.ok || !unlocked) return; // app cerrada o bloqueada

  // Si el usuario lo rechazó hace poco, no molestamos.
  const { dismissedAt } = await getPromptState();
  const COOLDOWN_MS = 6 * 60 * 60 * 1000; // 6h
  if (dismissedAt && Date.now() - dismissedAt < COOLDOWN_MS) return;

  console.log("🟦 App detectada desbloqueada → mostrando prompt de conexión (", reason, ")");
  await openConnectWindow();
}

// TOKEN

async function getExtToken() {
  const { extToken } = await chrome.storage.local.get(["extToken"]);
  return extToken || "";
}

async function saveExtToken(token) {
  await chrome.storage.local.set({ extToken: token });
  console.log("🔐 extToken guardado:", token ? token.slice(0, 8) + "..." : "none");
}

// El backend espera EXACTAMENTE este header:
function buildHeaders(token, withJson = true) {
  const headers = {};
  if (withJson) headers["Content-Type"] = "application/json";
  if (token) headers["X-Passeeker-Ext"] = token;
  return headers;
}

// HTTP helpers

async function post(path, body, token) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: buildHeaders(token, true),
    body: JSON.stringify(body || {})
  });

  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { raw: text }; }

  console.log("➡️ POST", path, res.status, data);
  return { ok: res.ok, status: res.status, data };
}

async function get(path, token) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "GET",
    headers: buildHeaders(token, false)
  });

  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { raw: text }; }

  console.log("➡️ GET", path, res.status, data);
  return { ok: res.ok, status: res.status, data };
}

// EMPAREJADO

async function ensurePaired(reason = "auto") {
  const existing = await getExtToken();
  if (existing) return { ok: true, paired: true };

  await maybePromptConnect("ensurePaired:" + reason);
  return { ok: false, paired: false, status: 428, error: "Needs user consent" };
}

chrome.runtime.onInstalled.addListener(() => maybePromptConnect("installed"));
chrome.runtime.onStartup.addListener(() => maybePromptConnect("startup"));

// MENSAJES DESDE content.js

chrome.runtime.onMessage.addListener((req, sender, sendResponse) => {
  (async () => {
    try {
      // El usuario NO quiere conectar ahora
      if (req.type === "DISMISS_CONNECT") {
        await setDismissedNow();
        sendResponse({ ok: true });
        return;
      }

      // El usuario quiere conectar → emparejado automático si la app está desbloqueada
      if (req.type === "CONNECT") {
        const health = await checkAppHealth();
        if (!health.ok) {
          sendResponse({ ok: false, status: 0, error: "No se detecta Passeeker Desktop abierto" });
          return;
        }
        if (!health.data?.unlocked) {
          sendResponse({ ok: false, status: 401, error: "Passeeker Desktop está bloqueado. Inicia sesión en la app." });
          return;
        }

        // 1) pedir code (sin session header)  2) finish con code → extToken
        const s = await post("/api/ext/pair/start-unlocked", { reason: "connect" });
        if (!s.ok || !s.data?.code) {
          sendResponse({ ok: false, status: s.status, error: s.data?.error || "No se pudo iniciar el emparejado" });
          return;
        }

        const f = await post("/api/ext/pair/finish", { code: s.data.code });
        if (!f.ok || !f.data?.extToken) {
          sendResponse({ ok: false, status: f.status, error: f.data?.error || "No se pudo finalizar el emparejado" });
          return;
        }

        await saveExtToken(f.data.extToken);
        sendResponse({ ok: true, paired: true });
        return;
      }

      // Forzar pairing si hace falta
      if (req.type === "ENSURE_PAIRED") {
        const t = await getExtToken();
        if (t) {
          sendResponse({ ok: true, paired: true });
          return;
        }
        await maybePromptConnect("content");
        sendResponse({ ok: false, paired: false, status: 428, error: "No conectado todavía" });
        return;
      }

      // Debug rápido
      if (req.type === "DEBUG_TOKEN") {
        const t = await getExtToken();
        sendResponse({ ok: true, hasToken: !!t, preview: t ? t.slice(0, 8) + "..." : "" });
        return;
      }

      const token = await getExtToken();
      if (!token) {
        sendResponse({ ok: false, status: 401, error: "No conectado. Abre el popup y acepta el emparejado." });
        return;
      }

      // Lista creds por dominio
      if (req.type === "GET_CREDS") {
        const domain = encodeURIComponent(req.domain || "");
        const r = await get(`/api/ext/creds?domain=${domain}`, token);
        sendResponse(r);
        return;
      }

      // Password por id
      if (req.type === "GET_PASSWORD") {
        const r = await post("/api/ext/password", { id: req.id }, token);
        sendResponse(r);
        return;
      }

      // Guardar credencial (requiere que tengas el endpoint /api/ext/credentials)
      if (req.type === "SAVE_CREDENTIAL") {
        const r = await post("/api/ext/credentials", req.payload, token);
        sendResponse(r);
        return;
      }

      sendResponse({ ok: false, error: "Unknown message type" });
    } catch (e) {
      console.error("💥 Error background:", e);
      sendResponse({ ok: false, error: String(e.message || e) });
    }
  })();

  return true;
});
