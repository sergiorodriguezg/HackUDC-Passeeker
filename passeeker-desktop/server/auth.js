// SPDX-License-Identifier: MIT
import crypto from "crypto";
import fs from "fs";
import path from "path";

let state = {
  configured: false,
  user: null,

  sessionToken: null,
  vaultKey: null,
  lastActivity: 0,

  lockMs: 5 * 60 * 1000,
  lockTimer: null,

  extTokens: new Set(),
  pairCode: null,
  pairExpiresAt: 0,
};

function authFile(dataDir){
  return path.join(dataDir, "auth.json");
}

function extTokensFile(dataDir){
  return path.join(dataDir, "ext-tokens.json");
}

function loadExtTokens(dataDir){
  const file = extTokensFile(dataDir);
  state.extTokens = new Set();
  if (!fs.existsSync(file)) return;

  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
    const arr = Array.isArray(parsed?.tokens) ? parsed.tokens : [];
    for (const t of arr) state.extTokens.add(String(t));
  } catch {
    state.extTokens = new Set();
  }
}

function saveExtTokens(dataDir){
  const file = extTokensFile(dataDir);
  const payload = { tokens: Array.from(state.extTokens) };
  fs.writeFileSync(file, JSON.stringify(payload, null, 2), "utf8");
}

function scryptHash(password, saltHex){
  const salt = Buffer.from(saltHex, "hex");
  return crypto.scryptSync(String(password), salt, 32).toString("hex");
}

function deriveVaultKey(masterPassword, vaultSaltHex){
  const salt = Buffer.from(vaultSaltHex, "hex");
  return crypto.scryptSync(String(masterPassword), salt, 32);
}

function scheduleAutoLock(){
  if (state.lockTimer) clearTimeout(state.lockTimer);

  state.lockTimer = setTimeout(() => {
    const idle = Date.now() - state.lastActivity;
    if (state.sessionToken && idle >= state.lockMs){
      logout();
      console.log("🔒 Auto-lock por inactividad");
      return;
    }
    if (state.sessionToken) scheduleAutoLock();
  }, 15 * 1000);
}

export function loadAuth(dataDir){
  const file = authFile(dataDir);

  if (!fs.existsSync(file)){
    state.configured = false;
    state.user = null;
    state.sessionToken = null;
    state.vaultKey = null;
    state.lastActivity = 0;
    return state;
  }

  const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
  state.configured = true;
  state.user = parsed.user;
  state.sessionToken = null;
  state.vaultKey = null;
  state.lastActivity = 0;

  loadExtTokens(dataDir);
  return state;
}

export function isConfigured(){
  return !!state.configured;
}

export function isUnlocked(){
  return !!state.sessionToken && !!state.vaultKey;
}

export function getVaultKey(){
  return state.vaultKey;
}

export function touch(){
  state.lastActivity = Date.now();
  if (state.sessionToken) scheduleAutoLock();
}

export function logout(){
  state.sessionToken = null;
  state.vaultKey = null;
  state.lastActivity = 0;
  if (state.lockTimer) clearTimeout(state.lockTimer);
  state.lockTimer = null;
}

export function setupAccount(dataDir, { user, password }){
  if (!user || !password) throw new Error("Missing user/password");

  const file = authFile(dataDir);
  if (fs.existsSync(file)) throw new Error("Account already configured");

  const saltHex = crypto.randomBytes(16).toString("hex");
  const vaultSaltHex = crypto.randomBytes(16).toString("hex");
  const hash = scryptHash(password, saltHex);

  const payload = {
    user: String(user),
    salt: saltHex,
    hash,
    vaultSalt: vaultSaltHex,
    createdAt: Date.now()
  };

  fs.writeFileSync(file, JSON.stringify(payload, null, 2), "utf8");

  state.configured = true;
  state.user = payload.user;
  state.sessionToken = null;
  state.vaultKey = null;
}

export function login(dataDir, { user, password }){
  const file = authFile(dataDir);
  if (!fs.existsSync(file)) throw new Error("Account not configured");

  const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
  if (String(user) !== String(parsed.user)) throw new Error("Bad credentials");

  const hash = scryptHash(password, parsed.salt);
  if (hash !== parsed.hash) throw new Error("Bad credentials");

  state.vaultKey = deriveVaultKey(password, parsed.vaultSalt);
  state.sessionToken = crypto.randomBytes(24).toString("hex");
  state.lastActivity = Date.now();
  scheduleAutoLock();

  return state.sessionToken;
}

export function requireSession(req, res, next){
  const token = req.header("X-Passeeker-Session") || "";
  if (!state.sessionToken || token !== state.sessionToken || !state.vaultKey){
    return res.status(401).json({ ok:false, error:"Unauthorized (locked)" });
  }
  touch();
  next();
}

// -------- EXTENSION PAIRING --------
export function startPairing(){
  if (!isUnlocked()) throw new Error("Locked");

  const code = String(Math.floor(100000 + Math.random() * 900000));
  state.pairCode = code;
  state.pairExpiresAt = Date.now() + 60 * 1000;
  touch();

  return { code, expiresInMs: 60 * 1000 };
}

export function finishPairing(dataDir, code){
  if (!isUnlocked()) throw new Error("Locked");

  const now = Date.now();
  if (!state.pairCode || now > state.pairExpiresAt){
    state.pairCode = null;
    state.pairExpiresAt = 0;
    throw new Error("Pair code expired");
  }

  if (String(code) !== String(state.pairCode)){
    throw new Error("Bad pair code");
  }

  state.pairCode = null;
  state.pairExpiresAt = 0;

  const extToken = crypto.randomBytes(32).toString("hex");
  state.extTokens.add(extToken);
  saveExtTokens(dataDir);

  touch();
  return extToken;
}

export function requireExtension(dataDir){
  return (req, res, next) => {
    const token = req.header("X-Passeeker-Ext") || "";

    if (!isUnlocked()){
      return res.status(401).json({ ok:false, error:"Unauthorized (locked)" });
    }

    if (!token || !state.extTokens.has(token)){
      return res.status(401).json({ ok:false, error:"Unauthorized (ext)" });
    }

    touch();
    next();
  };
}
