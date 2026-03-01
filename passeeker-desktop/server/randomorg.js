// SPDX-License-Identifier: MIT
import crypto from "crypto";

async function randomOrgIntegers(n, min, max){
  const url =
    `https://www.random.org/integers/?num=${n}&min=${min}&max=${max}` +
    `&col=1&base=10&format=plain&rnd=new`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Random.org error: ${res.status}`);
  const txt = await res.text();
  return txt.trim().split(/\s+/).map(Number);
}

function base62FromInts(ints){
  const alphabet = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  return ints.map((i) => alphabet[i % alphabet.length]).join("");
}

function cryptoFallbackPassword(length){
  const alphabet = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*-_+";
  const bytes = crypto.randomBytes(length);
  return [...bytes].map((b) => alphabet[b % alphabet.length]).join("");
}

export async function generateRandomOrgPassword(length = 20){
  try {
    const ints = await randomOrgIntegers(length, 0, 61);
    return base62FromInts(ints);
  } catch {
    return cryptoFallbackPassword(length);
  }
}
