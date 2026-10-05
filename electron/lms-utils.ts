import { Parser } from 'htmlparser2';
import { createHash } from 'node:crypto';

export function normalizeMoodleUrl(value: string): string {
  let url: URL;
  try { url = new URL(value.trim()); } catch { throw new Error('Escribe la dirección completa de Moodle, empezando por https://.'); }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && local)) throw new Error('La conexión a Moodle requiere HTTPS. HTTP solo está permitido en el ordenador local.');
  if (url.username || url.password) throw new Error('La dirección de Moodle no debe contener credenciales.');
  url.search = ''; url.hash = '';
  url.pathname = url.pathname.replace(/\/(?:course\/view\.php|login\/index\.php|my(?:\/index\.php)?)\/?$/, '').replace(/\/+$/, '');
  if (/%(?:2f|5c|2e)/i.test(url.pathname) || url.pathname.includes('\\')) throw new Error('La ruta de Moodle no es válida.');
  return url.href.replace(/\/$/, '');
}
export function cleanLmsUrl(value: string, base: string): string {
  let url: URL;
  try { url = new URL(value, base + '/'); } catch { return ''; }
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) return '';
  for (const name of [...url.searchParams.keys()]) if (/token|sesskey|pass|secret|auth|signature|^x-amz-|^x-goog-|^api.?key$/i.test(name)) url.searchParams.delete(name);
  url.hash = ''; return url.href;
}
export function credentialFingerprint(siteUrl: string, userId: number, salt: string) {
  return createHash('sha256').update(JSON.stringify([siteUrl, userId, salt])).digest('hex');
}
export function unixDate(value: unknown): string | null {
  if (value === undefined || value === null || value === 0 || value === '0') return null;
  const seconds = Number(value);
  if (!Number.isSafeInteger(seconds) || seconds < 0 || seconds > 7258118400) throw new Error('Moodle devolvió una fecha no válida.');
  return new Date(seconds * 1000).toISOString();
}
export function shortLmsTitle(value: string): string {
  if (value.length <= 120) return value;
  let end = 117; if (/[\uD800-\uDBFF]/.test(value[end - 1])) end--;
  return value.slice(0, end).trimEnd() + '…';
}
export function lmsHash(value: unknown) {
  const stable = (v: unknown): unknown => Array.isArray(v) ? v.map(stable) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).filter(([, value]) => value !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => [key, stable(value)])) : v;
  return createHash('sha256').update(JSON.stringify(stable(value))).digest('hex');
}
export function moodlePlainText(value: string): string {
  if (value.length > 2000000) throw new Error('El contenido de Moodle supera el límite de texto.');
  const blocks = new Set(['p', 'div', 'section', 'article', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'pre', 'tr', 'blockquote', 'ul', 'ol']);
  const blocked = new Set(['script', 'style', 'iframe', 'object', 'noscript']);
  const parts: string[] = []; let skip = 0;
  const parser = new Parser({
    onopentag(name, attributes) {
      if (skip) { skip++; return; }
      if (blocked.has(name)) { skip = 1; return; }
      if (blocks.has(name) || name === 'br') parts.push('\n');
      else if (name === 'li') parts.push('\n• ');
      else if (name === 'td' || name === 'th') parts.push('\t');
      else if (name === 'sup') parts.push('^(');
      else if (name === 'sub') parts.push('_(');
      else if (name === 'img' && attributes.alt) parts.push(`[Imagen: ${attributes.alt}]`);
    },
    ontext(text) { if (!skip) parts.push(text); },
    onclosetag(name) {
      if (skip) { skip--; return; }
      if (blocks.has(name) || name === 'li') parts.push('\n');
      if (name === 'sup' || name === 'sub') parts.push(')');
    }
  }, { decodeEntities: true });
  parser.end(value);
  return parts.join('').replace(/\r/g, '').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}
