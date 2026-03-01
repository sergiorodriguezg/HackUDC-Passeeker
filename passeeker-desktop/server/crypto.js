// SPDX-License-Identifier: MIT
import crypto from "crypto";

export async function encryptPassword(plaintext, vaultKey) {
  if (!vaultKey || vaultKey.length !== 32) throw new Error("Vault key missing");

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", vaultKey, iv);

  const encBuf = Buffer.concat([
    cipher.update(String(plaintext), "utf8"),
    cipher.final(),
  ]);
  const tagBuf = cipher.getAuthTag();

  return {
    enc: encBuf.toString("base64"),
    iv: iv.toString("base64"),
    tag: tagBuf.toString("base64"),
  };
}

export async function decryptPassword(enc, iv, tag, vaultKey) {
  if (!vaultKey || vaultKey.length !== 32) throw new Error("Vault key missing");

  const toBuf = (v) => {
    if (Buffer.isBuffer(v)) return v;
    if (typeof v === "string") return Buffer.from(v, "base64");
    throw new Error("Invalid encrypted field type");
  };

  const encBuf = toBuf(enc);
  const ivBuf = toBuf(iv);
  const tagBuf = toBuf(tag);

  if (tagBuf.length !== 16) {
    throw new Error(`Invalid authentication tag length: ${tagBuf.length}`);
  }

  const decipher = crypto.createDecipheriv("aes-256-gcm", vaultKey, ivBuf);
  decipher.setAuthTag(tagBuf);

  const dec = Buffer.concat([decipher.update(encBuf), decipher.final()]);
  return dec.toString("utf8");
}
