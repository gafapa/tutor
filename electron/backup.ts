import { randomBytes, scryptSync } from 'node:crypto';
import { encrypt, decrypt } from './vault.js';

const HEADER = Buffer.from('TUTORBACKUP01');
export function isEncryptedBackup(bytes: Buffer): boolean {
  return bytes.length >= HEADER.length && bytes.subarray(0, HEADER.length).equals(HEADER);
}
export function encodeBackup(json: string, password: string): Buffer {
  if (password.length < 8) throw new Error('La contraseña debe tener al menos 8 caracteres.');
  const salt = randomBytes(16);
  const key = scryptSync(password, salt, 32);
  return Buffer.concat([HEADER, salt, encrypt(Buffer.from(json), key)]);
}
export function decodeBackup(bytes: Buffer, password: string): string {
  if (bytes.length < HEADER.length + 16 + 35 || !bytes.subarray(0, HEADER.length).equals(HEADER)) throw new Error('La copia cifrada no tiene un formato válido.');
  const salt = bytes.subarray(HEADER.length, HEADER.length + 16);
  try {
    return decrypt(bytes.subarray(HEADER.length + 16), scryptSync(password, salt, 32)).toString('utf8');
  } catch { throw new Error('La contraseña es incorrecta o la copia está dañada.'); }
}
