import { randomBytes, scryptSync } from 'node:crypto';
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { encrypt, decrypt } from './vault.js';

const HEADER = Buffer.from('TUTORPORTABLE01');
const FILE_BYTES = HEADER.length + 16 + 35 + 32;
export const PORTABLE_KEY_FILE = 'portable-key.bin';

function passwordKey(password: string, salt: Buffer): Buffer {
  if (typeof password !== 'string' || password.length < 12 || password.length > 256) throw new Error('Usa una contraseña de entre 12 y 256 caracteres.');
  return scryptSync(password, salt, 32, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
}

export function wrapPortableKey(key: Buffer, password: string): Buffer {
  if (key.length !== 32) throw new Error('La clave del historial no es válida.');
  const salt = randomBytes(16), derived = passwordKey(password, salt);
  try { return Buffer.concat([HEADER, salt, encrypt(key, derived)]); }
  finally { derived.fill(0); }
}

export function unwrapPortableKey(bytes: Buffer, password: string): Buffer {
  if (bytes.length !== FILE_BYTES || !bytes.subarray(0, HEADER.length).equals(HEADER)) throw new Error('La clave portable está dañada. Conserva la carpeta y restaura una copia de seguridad en otra carpeta.');
  const derived = passwordKey(password, bytes.subarray(HEADER.length, HEADER.length + 16));
  try { return decrypt(bytes.subarray(HEADER.length + 16), derived); }
  catch { throw new Error('La contraseña es incorrecta o la clave portable está dañada.'); }
  finally { derived.fill(0); }
}

export function portableKeyExists(directory: string): boolean {
  const path = join(directory, PORTABLE_KEY_FILE);
  if (existsSync(path)) return true;
  if (['learning.tutor', 'vault-key.bin', 'moodle-credentials.tutor', 'semantic-index.tutor'].some(name => existsSync(join(directory, name)))) throw new Error('Falta la clave portable o esta carpeta pertenece a una instalación. Conserva los archivos y restaura una copia de seguridad en una carpeta portable nueva.');
  return false;
}

export function openPortableKey(directory: string, password: string, confirmation?: string): Buffer {
  const path = join(directory, PORTABLE_KEY_FILE);
  if (portableKeyExists(directory)) {
    if (statSync(path).size !== FILE_BYTES) throw new Error('La clave portable está dañada. No se ha cambiado ningún dato.');
    return unwrapPortableKey(readFileSync(path), password);
  }
  if (confirmation !== password) throw new Error('Las contraseñas no coinciden.');
  const key = randomBytes(32);
  try { writeFileSync(path, wrapPortableKey(key, password), { flag: 'wx', mode: 0o600, flush: true }); return key; }
  catch (error) { key.fill(0); throw error; }
}
