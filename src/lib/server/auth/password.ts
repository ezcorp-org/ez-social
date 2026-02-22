/**
 * Workers-compatible password hashing using Web Crypto PBKDF2.
 * No native binaries or WASM required — uses the built-in Web Crypto API.
 *
 * Storage format: "iterations:base64salt:base64hash"
 */

const ITERATIONS = 100_000;
const HASH_LENGTH = 32; // bytes
const SALT_LENGTH = 16; // bytes

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );

  const hashBuffer = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: ITERATIONS, hash: "SHA-256" },
    key,
    HASH_LENGTH * 8,
  );

  const saltB64 = btoa(String.fromCharCode(...salt));
  const hashB64 = btoa(String.fromCharCode(...new Uint8Array(hashBuffer)));

  return `${ITERATIONS}:${saltB64}:${hashB64}`;
}

export async function verifyPassword(
  stored: string,
  password: string,
): Promise<boolean> {
  const [iterStr, saltB64, hashB64] = stored.split(":");
  const iterations = parseInt(iterStr, 10);
  const salt = Uint8Array.from(atob(saltB64), (c) => c.charCodeAt(0));
  const expectedHash = Uint8Array.from(atob(hashB64), (c) => c.charCodeAt(0));

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );

  const hashBuffer = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations, hash: "SHA-256" },
    key,
    expectedHash.length * 8,
  );

  const actualHash = new Uint8Array(hashBuffer);

  // Constant-time comparison to prevent timing attacks
  if (actualHash.length !== expectedHash.length) return false;
  let result = 0;
  for (let i = 0; i < actualHash.length; i++) {
    result |= actualHash[i] ^ expectedHash[i];
  }
  return result === 0;
}
