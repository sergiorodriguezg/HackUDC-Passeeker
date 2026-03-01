import crypto from "crypto";

function sha1Hex(text) {
  return crypto.createHash("sha1").update(String(text), "utf8").digest("hex").toUpperCase();
}

export async function checkPwnedPassword(password) {
  if (!password) return { pwned: false, count: 0 };

  const hash = sha1Hex(password);
  const prefix = hash.slice(0, 5);
  const suffix = hash.slice(5);

  const res = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
    method: "GET",
    headers: { "Add-Padding": "true" }
  });

  if (!res.ok) throw new Error(`HIBP error: ${res.status}`);

  const body = await res.text();
  for (const line of body.split("\n")) {
    const [remoteSuffix, count] = line.trim().split(":");
    if (remoteSuffix === suffix) return { pwned: true, count: Number(count) };
  }
  return { pwned: false, count: 0 };
}