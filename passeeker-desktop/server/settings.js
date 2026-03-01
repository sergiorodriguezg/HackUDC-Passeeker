import keytar from "keytar";
import crypto from "crypto";

const SERVICE = "PasseekerDesktop";

export async function getOrCreateMasterKey() {
  let key = await keytar.getPassword(SERVICE, "masterKey");
  if (!key) {
    key = crypto.randomBytes(32).toString("base64");
    await keytar.setPassword(SERVICE, "masterKey", key);
  }
  return Buffer.from(key, "base64");
}