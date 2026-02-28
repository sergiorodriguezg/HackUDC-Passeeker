import Database from "better-sqlite3";
import path from "path";

let db = null;

function hasColumn(table, column) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all();
  return cols.some(c => c.name === column);
}

export function initDb(dataDir) {
  const dbPath = path.join(dataDir, "passeeker.db");
  db = new Database(dbPath);

  // 1) crea tabla si no existe (sin appKey no pasa nada, pero ya la metemos aquí)
  db.exec(`
    CREATE TABLE IF NOT EXISTS credentials (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      appKey TEXT,
      url TEXT NOT NULL,
      username TEXT,
      enc_password BLOB NOT NULL,
      iv BLOB NOT NULL,
      tag BLOB NOT NULL,
      createdAt INTEGER,
      pwned INTEGER,
      pwnedCount INTEGER
    );
  `);

  // 2) migración: si vienes de una DB vieja, puede no existir appKey
  if (!hasColumn("credentials", "appKey")) {
    db.exec(`ALTER TABLE credentials ADD COLUMN appKey TEXT;`);
  }

  // 3) crea índices DESPUÉS de asegurar columnas
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_appKey ON credentials(appKey);
    CREATE INDEX IF NOT EXISTS idx_url ON credentials(url);
    CREATE INDEX IF NOT EXISTS idx_username ON credentials(username);
  `);
}

export function insertCredential({ appKey, url, username, enc, iv, tag, createdAt, pwned, pwnedCount }) {
  if (!db) throw new Error("DB not initialized");

  db.prepare(`
    INSERT INTO credentials (appKey, url, username, enc_password, iv, tag, createdAt, pwned, pwnedCount)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    String(appKey || ""),
    String(url),
    String(username || ""),
    enc,
    iv,
    tag,
    Number(createdAt || Date.now()),
    pwned ? 1 : 0,
    Number(pwnedCount || 0)
  );
}

export function listCredentials({ q = "", appKey = "" } = {}) {
  if (!db) throw new Error("DB not initialized");

  const query = String(q || "").trim();
  const ak = String(appKey || "").trim();

  if (!query && !ak) {
    return db.prepare(`
      SELECT id, appKey, url, username, createdAt, pwned, pwnedCount
      FROM credentials
      ORDER BY createdAt DESC
      LIMIT 500
    `).all();
  }

  if (!query && ak) {
    return db.prepare(`
      SELECT id, appKey, url, username, createdAt, pwned, pwnedCount
      FROM credentials
      WHERE appKey = ?
      ORDER BY createdAt DESC
      LIMIT 500
    `).all(ak);
  }

  if (query && !ak) {
    return db.prepare(`
      SELECT id, appKey, url, username, createdAt, pwned, pwnedCount
      FROM credentials
      WHERE url LIKE ? OR username LIKE ? OR appKey LIKE ?
      ORDER BY createdAt DESC
      LIMIT 500
    `).all(`%${query}%`, `%${query}%`, `%${query}%`);
  }

  return db.prepare(`
    SELECT id, appKey, url, username, createdAt, pwned, pwnedCount
    FROM credentials
    WHERE appKey = ? AND (url LIKE ? OR username LIKE ?)
    ORDER BY createdAt DESC
    LIMIT 500
  `).all(ak, `%${query}%`, `%${query}%`);
}

export function getSecret(id) {
  if (!db) throw new Error("DB not initialized");

  return db.prepare(`
    SELECT enc_password as enc, iv, tag
    FROM credentials
    WHERE id=?
  `).get(Number(id));
}

export function listApps() {
  if (!db) throw new Error("DB not initialized");

  return db.prepare(`
    SELECT COALESCE(appKey, '') as appKey, COUNT(*) as count, MAX(createdAt) as lastUsed
    FROM credentials
    GROUP BY COALESCE(appKey, '')
    ORDER BY lastUsed DESC
    LIMIT 200
  `).all().filter(r => r.appKey);
}

export function getCredentialById(id) {
  if (!db) throw new Error("DB not initialized");

  return db.prepare(`
    SELECT id, appKey, url, username, pwned, pwnedCount
    FROM credentials
    WHERE id=?
  `).get(Number(id));
}

export function updateCredentialMeta({ id, appKey, url, username, pwned, pwnedCount }) {
  if (!db) throw new Error("DB not initialized");

  db.prepare(`
    UPDATE credentials
    SET appKey=?, url=?, username=?, pwned=?, pwnedCount=?
    WHERE id=?
  `).run(
    String(appKey || ""),
    String(url || ""),
    String(username || ""),
    pwned ? 1 : 0,
    Number(pwnedCount || 0),
    Number(id)
  );
}

export function updateCredentialSecret({ id, enc, iv, tag }) {
  if (!db) throw new Error("DB not initialized");

  db.prepare(`
    UPDATE credentials
    SET enc_password=?, iv=?, tag=?
    WHERE id=?
  `).run(enc, iv, tag, Number(id));
}

export function deleteCredential(id) {
  if (!db) throw new Error("DB not initialized");
  db.prepare(`DELETE FROM credentials WHERE id=?`).run(Number(id));
}