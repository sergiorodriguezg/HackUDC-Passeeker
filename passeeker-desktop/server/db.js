import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import crypto from "crypto";

let db = null;

function dbFile(dataDir){
  return path.join(dataDir, "vault.sqlite");
}

export function initDb(dataDir){
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive:true });

  const file = dbFile(dataDir);
  db = new Database(file);
  db.pragma("journal_mode = WAL");

  db.exec(`
    CREATE TABLE IF NOT EXISTS credentials (
      id TEXT PRIMARY KEY,
      appKey TEXT NOT NULL,
      url TEXT NOT NULL,
      username TEXT,
      enc TEXT NOT NULL,
      iv TEXT NOT NULL,
      tag TEXT NOT NULL,
      createdAt INTEGER NOT NULL,
      pwned INTEGER DEFAULT 0,
      pwnedCount INTEGER DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_credentials_appKey ON credentials(appKey);
    CREATE INDEX IF NOT EXISTS idx_credentials_url ON credentials(url);
    CREATE INDEX IF NOT EXISTS idx_credentials_user ON credentials(username);
  `);
}

function ensureDb(){
  if (!db) throw new Error("DB not initialized");
}

function uuid(){
  return crypto.randomBytes(16).toString("hex");
}

export function insertCredential({ appKey, url, username, enc, iv, tag, createdAt, pwned, pwnedCount }){
  ensureDb();
  const id = uuid();
  const stmt = db.prepare(`
    INSERT INTO credentials (id, appKey, url, username, enc, iv, tag, createdAt, pwned, pwnedCount)
    VALUES (@id, @appKey, @url, @username, @enc, @iv, @tag, @createdAt, @pwned, @pwnedCount)
  `);
  stmt.run({
    id,
    appKey,
    url,
    username: username || "",
    enc,
    iv,
    tag,
    createdAt: Number(createdAt || Date.now()),
    pwned: pwned ? 1 : 0,
    pwnedCount: Number(pwnedCount || 0)
  });
  return id;
}

export function listCredentials({ q = "", appKey = "" } = {}){
  ensureDb();
  const query = String(q || "").trim();
  const key = String(appKey || "").trim().toLowerCase();

  const where = [];
  const params = {};

  if (key){
    where.push("LOWER(appKey) = @appKey");
    params.appKey = key;
  }

  if (query){
    where.push("(url LIKE @q OR username LIKE @q)");
    params.q = `%${query}%`;
  }

  const sql = `
    SELECT id, appKey, url, username, createdAt, pwned, pwnedCount
    FROM credentials
    ${where.length ? "WHERE " + where.join(" AND ") : ""}
    ORDER BY createdAt DESC
    LIMIT 500
  `;

  return db.prepare(sql).all(params);
}

export function listApps(){
  ensureDb();
  const rows = db.prepare(`
    SELECT appKey, COUNT(*) as count
    FROM credentials
    GROUP BY appKey
    ORDER BY count DESC
  `).all();

  return rows.map(r => ({ appKey: r.appKey, count: r.count }));
}

export function getSecret(id){
  ensureDb();
  return db.prepare("SELECT enc, iv, tag FROM credentials WHERE id = ?").get(String(id));
}

export function getCredentialById(id){
  ensureDb();
  return db.prepare("SELECT id, appKey, url, username, pwned, pwnedCount, createdAt FROM credentials WHERE id = ?").get(String(id));
}

export function updateCredentialMeta({ id, appKey, url, username, pwned, pwnedCount }){
  ensureDb();
  db.prepare(`
    UPDATE credentials
    SET appKey=@appKey, url=@url, username=@username, pwned=@pwned, pwnedCount=@pwnedCount
    WHERE id=@id
  `).run({
    id: String(id),
    appKey: String(appKey),
    url: String(url),
    username: String(username || ""),
    pwned: pwned ? 1 : 0,
    pwnedCount: Number(pwnedCount || 0)
  });
}

export function updateCredentialSecret({ id, enc, iv, tag }){
  ensureDb();
  db.prepare(`
    UPDATE credentials
    SET enc=@enc, iv=@iv, tag=@tag
    WHERE id=@id
  `).run({ id: String(id), enc: String(enc), iv: String(iv), tag: String(tag) });
}

export function deleteCredential(id){
  ensureDb();
  db.prepare("DELETE FROM credentials WHERE id = ?").run(String(id));
}

export function findCredentialIdByAppKeyUsername(appKey, username){
  ensureDb();
  const key = String(appKey || "").trim().toLowerCase();
  const user = String(username || "").trim().toLowerCase();

  // Si no hay username, no hacemos upsert (para evitar pisar cuentas "sin usuario")
  if (!user) return null;

  const row = db.prepare(`
    SELECT id
    FROM credentials
    WHERE LOWER(appKey) = @appKey AND LOWER(username) = @username
    ORDER BY createdAt DESC
    LIMIT 1
  `).get({ appKey: key, username: user });

  return row?.id || null;
}