import crypto from "crypto";

export async function encryptPassword(plaintext, vaultKey) {
  if (!vaultKey || vaultKey.length !== 32) throw new Error("Vault key missing");
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", vaultKey, iv);

  const enc = Buffer.concat([cipher.update(String(plaintext), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return { enc, iv, tag };
}

export async function decryptPassword(enc, iv, tag, vaultKey) {
  if (!vaultKey || vaultKey.length !== 32) throw new Error("Vault key missing");
  const decipher = crypto.createDecipheriv("aes-256-gcm", vaultKey, iv);
  decipher.setAuthTag(tag);

  const dec = Buffer.concat([decipher.update(enc), decipher.final()]);
  return dec.toString("utf8");
}