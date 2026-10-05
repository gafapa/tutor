import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

const MAGIC = Buffer.from('TUTOR01');

export function encrypt(bytes: Uint8Array, key: Buffer): Buffer {
  const nonce = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, nonce);
  const content = Buffer.concat([cipher.update(bytes), cipher.final()]);
  return Buffer.concat([MAGIC, nonce, cipher.getAuthTag(), content]);
}

export function decrypt(bytes: Buffer, key: Buffer): Buffer {
  if (bytes.length < 35 || !bytes.subarray(0, 7).equals(MAGIC)) {
    throw new Error('El archivo de datos no tiene un formato válido.');
  }
  const decipher = createDecipheriv('aes-256-gcm', key, bytes.subarray(7, 19));
  decipher.setAuthTag(bytes.subarray(19, 35));
  return Buffer.concat([decipher.update(bytes.subarray(35)), decipher.final()]);
}

export function writeEncrypted(path: string, bytes: Uint8Array, key: Buffer): void {
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.tmp`;
  writeFileSync(temporary, encrypt(bytes, key), { mode: 0o600, flush: true });
  renameSync(temporary, path);
}

export function readEncrypted(path: string, key: Buffer): Buffer {
  return decrypt(readFileSync(path), key);
}
