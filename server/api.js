import express from "express";
import { encryptPassword, decryptPassword } from "./crypto.js";
import { checkPwnedPassword } from "./hibp.js";
import { generateRandomOrgPassword } from "./randomorg.js";
import { generateHFPassphrase } from "./hf.js";

import {
  initDb,
  insertCredential,
  listCredentials,
  getSecret,
  listApps,
  getCredentialById,
  updateCredentialMeta,
  updateCredentialSecret,
  deleteCredential
} from "./db.js";

import {
  loadAuth,
  requireSession,
  getVaultKey,
  startPairing,
  finishPairing,
  requireExtension,
  isConfigured,
  isUnlocked,
  setupAccount,
  login,
  logout
} from "./auth.js";

function makeAppKey(url) {
  try {
    const u = new URL(String(url));
    return u.hostname.replace(/^www\./, "");
  } catch {
    return String(url || "").trim().toLowerCase();
  }
}

export async function startApiServer({ host, port, dataDir }) {
  initDb(dataDir);
  loadAuth(dataDir);

  const app = express();
  app.use(express.json({ limit: "1mb" }));

  // HEALTH
  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, configured: isConfigured(), unlocked: isUnlocked() });
  });

  // AUTH STATUS (este es el que debes usar en el renderer)
  app.get("/api/auth/status", (_req, res) => {
    res.json({ ok: true, configured: isConfigured(), unlocked: isUnlocked() });
  });

  // SETUP (primer uso) -> crea cuenta y devuelve token (auto-login)
  app.post("/api/auth/setup", (req, res) => {
    try {
      const { user, username, password } = req.body || {};
      const u = (user ?? username ?? "").trim();

      if (!u || !password) {
        return res.status(400).json({ ok: false, error: "Missing user/password" });
      }

      setupAccount(dataDir, { user: u, password });

      // auto login para devolver token y que el renderer no se quede colgado
      const token = login(dataDir, { user: u, password });

      res.json({ ok: true, sessionToken: token });
    } catch (e) {
      res.status(400).json({ ok: false, error: String(e?.message ?? e) });
    }
  });

  // LOGIN -> devuelve token
  app.post("/api/auth/login", (req, res) => {
    try {
      const { user, username, password } = req.body || {};
      const u = (user ?? username ?? "").trim();

      if (!u || !password) {
        return res.status(400).json({ ok: false, error: "Missing user/password" });
      }

      const token = login(dataDir, { user: u, password });
      res.json({ ok: true, sessionToken: token });
    } catch (e) {
      res.status(401).json({ ok: false, error: String(e?.message ?? e) });
    }
  });

  // LOGOUT (bloquea)
  app.post("/api/auth/logout", (_req, res) => {
    logout();
    res.json({ ok: true });
  });

  // -------- EXTENSION PAIRING --------
  app.post("/api/ext/pair/start", requireSession, (_req, res) => {
    try {
      const out = startPairing(dataDir);
      res.json({ ok: true, code: out.code, expiresInMs: out.expiresInMs });
    } catch (e) {
      res.status(400).json({ ok: false, error: String(e?.message ?? e) });
    }
  });

  app.post("/api/ext/pair/finish", (req, res) => {
    try {
      const { code } = req.body || {};
      const extToken = finishPairing(dataDir, code);
      res.json({ ok: true, extToken });
    } catch (e) {
      res.status(401).json({ ok: false, error: String(e?.message ?? e) });
    }
  });

  const requireExt = requireExtension(dataDir);

  // -------- EXTENSION API --------
  app.get("/api/ext/creds", requireExt, (req, res) => {
    const domain = String(req.query.domain || "").trim().toLowerCase();
    if (!domain) return res.status(400).json({ ok: false, error: "Missing domain" });

    const items = listCredentials({ q: "", appKey: domain });
    res.json({
      ok: true,
      items: items.map(x => ({ id: x.id, url: x.url, username: x.username }))
    });
  });

  app.post("/api/ext/password", requireExt, async (req, res) => {
    try {
      const { id } = req.body || {};
      if (!id) return res.status(400).json({ ok: false, error: "Missing id" });

      const row = getSecret(id);
      if (!row) return res.status(404).json({ ok: false, error: "Not found" });

      const vaultKey = getVaultKey();
      const password = await decryptPassword(row.enc, row.iv, row.tag, vaultKey);

      res.json({ ok: true, password });
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e?.message ?? e) });
    }
  });

  // APPS
  app.get("/api/apps", requireSession, (_req, res) => {
    res.json({ ok: true, apps: listApps() });
  });

  // LIST CREDENTIALS
  app.get("/api/credentials", requireSession, (req, res) => {
    const q = String(req.query.q || "").trim();
    const appKey = String(req.query.appKey || "").trim();
    res.json({ ok: true, items: listCredentials({ q, appKey }) });
  });

  // GET PASSWORD BY ID
  app.get("/api/password/:id", requireSession, async (req, res) => {
    try {
      const row = getSecret(req.params.id);
      if (!row) return res.status(404).json({ ok: false, error: "Not found" });

      const vaultKey = getVaultKey();
      const password = await decryptPassword(row.enc, row.iv, row.tag, vaultKey);

      res.json({ ok: true, password });
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e?.message ?? e) });
    }
  });

  // CHECK HIBP (por password)
  app.post("/api/hibp", requireSession, async (req, res) => {
    try {
      const { password } = req.body || {};
      if (!password) return res.status(400).json({ ok: false, error: "Missing password" });

      const result = await checkPwnedPassword(String(password));
      res.json({ ok: true, result });
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e?.message ?? e) });
    }
  });

  // CREATE CREDENTIAL
  app.post("/api/credentials", requireSession, async (req, res) => {
    try {
      const { url, username, password, createdAt } = req.body || {};
      if (!url || !password) return res.status(400).json({ ok: false, error: "Missing url/password" });

      const pwnedInfo = await checkPwnedPassword(String(password));
      const vaultKey = getVaultKey();
      const encrypted = await encryptPassword(String(password), vaultKey);

      const appKey = makeAppKey(url);

      insertCredential({
        appKey,
        url: String(url),
        username: username ? String(username) : "",
        enc: encrypted.enc,
        iv: encrypted.iv,
        tag: encrypted.tag,
        createdAt: Number(createdAt || Date.now()),
        pwned: pwnedInfo.pwned,
        pwnedCount: pwnedInfo.count
      });

      res.json({ ok: true, appKey, pwned: pwnedInfo.pwned, pwnedCount: pwnedInfo.count });
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e?.message ?? e) });
    }
  });

  // UPDATE CREDENTIAL
  app.put("/api/credentials/:id", requireSession, async (req, res) => {
    try {
      const id = req.params.id;
      const { url, username, password } = req.body || {};

      const existing = getCredentialById(id);
      if (!existing) return res.status(404).json({ ok: false, error: "Not found" });

      const newUrl = String(url ?? existing.url);
      const newUsername = String(username ?? existing.username ?? "");

      const newAppKey = makeAppKey(newUrl);

      let pwned = existing.pwned ? 1 : 0;
      let pwnedCount = Number(existing.pwnedCount || 0);

      if (typeof password === "string" && password.length > 0) {
        const pwnedInfo = await checkPwnedPassword(password);
        const vaultKey = getVaultKey();
        const encrypted = await encryptPassword(password, vaultKey);

        updateCredentialSecret({
          id,
          enc: encrypted.enc,
          iv: encrypted.iv,
          tag: encrypted.tag
        });

        pwned = pwnedInfo.pwned ? 1 : 0;
        pwnedCount = pwnedInfo.count;
      }

      updateCredentialMeta({
        id,
        appKey: newAppKey,
        url: newUrl,
        username: newUsername,
        pwned,
        pwnedCount
      });

      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e?.message ?? e) });
    }
  });

  // DELETE CREDENTIAL
  app.delete("/api/credentials/:id", requireSession, (req, res) => {
    try {
      deleteCredential(req.params.id);
      res.json({ ok: true });
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e?.message ?? e) });
    }
  });

  // GENERATORS
  app.get("/api/generate/random", requireSession, async (_req, res) => {
    try {
      const password = await generateRandomOrgPassword(20);
      res.json({ ok: true, password });
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e?.message ?? e) });
    }
  });

  app.get("/api/suggestion/hf", requireSession, async (_req, res) => {
    try {
      const hfToken = process.env.HF_TOKEN || "";
      if (!hfToken) return res.json({ ok: true, enabled: false });

      const phrase = await generateHFPassphrase(hfToken);
      res.json({ ok: true, enabled: true, phrase });
    } catch (e) {
      res.status(500).json({ ok: false, error: String(e?.message ?? e) });
    }
  });

  return new Promise((resolve) => {
    app.listen(port, host, () => {
      console.log(`✅ Passeeker API running at http://${host}:${port}`);
      resolve();
    });
  });
}