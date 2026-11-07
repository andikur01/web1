import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRYPT_KEYLEN = 64;

export function hashSecret(secret) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(secret), salt, SCRYPT_KEYLEN).toString('hex');
  return `scrypt$${salt}$${hash}`;
}

export function verifySecret(secret, stored) {
  if (!stored) return false;
  const parts = String(stored).split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  const [, salt, hash] = parts;
  const test = crypto.scryptSync(String(secret), salt, SCRYPT_KEYLEN).toString('hex');
  const a = Buffer.from(hash, 'hex');
  const b = Buffer.from(test, 'hex');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export function randomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('hex');
}

export function randomPin(len = 6) {
  let out = '';
  for (let i = 0; i < len; i++) out += crypto.randomInt(0, 10);
  return out;
}

export function randomPassword(len = 10) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  let out = '';
  for (let i = 0; i < len; i++) out += chars[crypto.randomInt(0, chars.length)];
  return out;
}

export function safeEqual(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

/* Kunci enkripsi untuk vault PIN. Ambil dari env, kalau tidak ada pakai kunci
   yang dibuat sekali lalu disimpan di data/secret.key (mode 0600). */
function vaultKey() {
  const envKey = process.env.GLM_SECRET_KEY;
  if (envKey && envKey.length >= 32) return crypto.createHash('sha256').update(envKey).digest();
  const keyPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data', 'secret.key');
  if (!fs.existsSync(keyPath)) {
    fs.mkdirSync(path.dirname(keyPath), { recursive: true });
    fs.writeFileSync(keyPath, crypto.randomBytes(32).toString('hex'), { mode: 0o600 });
  }
  return crypto.createHash('sha256').update(fs.readFileSync(keyPath, 'utf8').trim()).digest();
}

/** Enkripsi rahasia yang harus bisa dibaca lagi (vault PIN). */
export function encryptSecret(plain) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', vaultKey(), iv);
  const enc = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  return `v1$${iv.toString('hex')}$${cipher.getAuthTag().toString('hex')}$${enc.toString('hex')}`;
}

export function decryptSecret(stored) {
  if (!stored) return null;
  const parts = String(stored).split('$');
  if (parts.length !== 4 || parts[0] !== 'v1') return null;
  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', vaultKey(), Buffer.from(parts[1], 'hex'));
    decipher.setAuthTag(Buffer.from(parts[2], 'hex'));
    return Buffer.concat([decipher.update(Buffer.from(parts[3], 'hex')), decipher.final()]).toString('utf8');
  } catch {
    return null;
  }
}
