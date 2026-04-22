/**
 * localAuth.ts
 *
 * Local password hashing using Node.js built-in crypto (scrypt).
 * Used as fallback when Supabase Auth is unreachable.
 */
import crypto from "crypto";

const SALT_LEN  = 16;
const KEY_LEN   = 32;
const N         = 16384;
const SCRYPT_OPTS = { N, r: 8, p: 1 };

/** Hash a password — returns "scrypt$<hex-salt>$<hex-key>" */
export function hashPassword(password: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const salt = crypto.randomBytes(SALT_LEN).toString("hex");
    crypto.scrypt(password, salt, KEY_LEN, SCRYPT_OPTS, (err, key) => {
      if (err) reject(err);
      else resolve(`scrypt$${salt}$${key.toString("hex")}`);
    });
  });
}

/** Compare a password against a stored hash. Returns true if they match. */
export function verifyPassword(password: string, stored: string): Promise<boolean> {
  return new Promise((resolve, reject) => {
    if (!stored.startsWith("scrypt$")) { resolve(false); return; }
    const parts = stored.split("$");
    if (parts.length !== 3) { resolve(false); return; }
    const [, salt, keyHex] = parts;
    const expected = Buffer.from(keyHex, "hex");
    crypto.scrypt(password, salt, KEY_LEN, SCRYPT_OPTS, (err, key) => {
      if (err) reject(err);
      else resolve(crypto.timingSafeEqual(key, expected));
    });
  });
}
