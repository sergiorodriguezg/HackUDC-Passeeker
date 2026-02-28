import crypto from "crypto";

async function randomOrgIntegers(n, min, max) {
  const url =
    `https://www.random.org/integers/?num=${n}&min=${min}&max=${max}` +
    `&col=1&base=10&format=plain&rnd=new`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Random.org error: ${res.status}`);
  const txt = await res.text();
  return txt.trim().split(/\s+/).map(Number);
}

function base62FromInts(ints) {
  const alphabet = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  return ints.map((i) => alphabet[i % alphabet.length]).join("");
}

function cryptoFallbackPassword(length) {
  const alphabet = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*-_+";
  const arr = new Uint32Array(length);
  crypto.getRandomValues(arr);
  return [...arr].map((x) => alphabet[x % alphabet.length]).join("");
}

export async function generateRandomOrgPassword(length = 20) {
  try {
    const ints = await randomOrgIntegers(length, 0, 61);
    return base62FromInts(ints);
  } catch {
    return cryptoFallbackPassword(length);
  }
}