import { Parser } from 'htmlparser2';

export function decodeText(buffer: Buffer): string {
  let encoding = 'utf-8', data = buffer;
  if (buffer[0] === 0xff && buffer[1] === 0xfe) { encoding = 'utf-16le'; data = buffer.subarray(2); }
  else if (buffer[0] === 0xfe && buffer[1] === 0xff) { encoding = 'utf-16be'; data = buffer.subarray(2); }
  try { return new TextDecoder(encoding, { fatal: true }).decode(data).replace(/\r\n?/g, '\n'); }
  catch { throw new Error('La codificación del texto no es válida. Guarda el archivo como UTF-8 o UTF-16 con marca de codificación.'); }
}

const BLOCKS = new Set(['p', 'div', 'section', 'article', 'main', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'pre', 'tr', 'blockquote', 'ul', 'ol']);
const OMIT = new Set(['script', 'style', 'iframe', 'object', 'embed', 'noscript', 'template', 'svg', 'canvas', 'nav', 'footer', 'aside', 'form', 'button', 'input', 'select', 'textarea']);
export function htmlMaterial(html: string): string {
  const parts: string[] = []; let length = 0;
  const add = (value: string) => { length += value.length; if (length > 2000000) throw new Error('La página contiene demasiado texto (máximo 2 millones de caracteres).'); parts.push(value); };
  const stack: { name: string; hidden: boolean }[] = []; let title = '';
  const parser = new Parser({
    onopentag(name, attributes) {
      const parentHidden = stack.at(-1)?.hidden ?? false;
      const hidden = parentHidden || OMIT.has(name) || 'hidden' in attributes || attributes['aria-hidden'] === 'true' || /(?:display\s*:\s*none|visibility\s*:\s*hidden)/i.test(attributes.style ?? '');
      stack.push({ name, hidden });
      if (hidden || stack.some(entry => entry.name === 'head')) return;
      if (BLOCKS.has(name) || name === 'br') add('\n');
      else if (name === 'li') add('\n• ');
      else if (name === 'td' || name === 'th') add('\t');
      else if (name === 'img' && attributes.alt) add(`[Imagen: ${attributes.alt}]`);
      else if (name === 'sup') add('^(');
      else if (name === 'sub') add('_(');
    },
    ontext(value) {
      if (stack.at(-1)?.hidden) return;
      if (stack.some(entry => entry.name === 'head')) { if (stack.at(-1)?.name === 'title') title += value; return; }
      add(value);
    },
    onclosetag(name) {
      const entry = stack.pop();
      if (entry?.hidden || name === 'head' || stack.some(entry => entry.name === 'head')) return;
      if (BLOCKS.has(name) || name === 'li') add('\n');
      if (name === 'sup' || name === 'sub') add(')');
    }
  }, { decodeEntities: true });
  parser.end(html);
  const body = parts.join('').replace(/[\u0000\f]/g, ' ').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  return body ? `${title.trim() ? title.trim() + '\n\n' : ''}${body}` : '';
}

function timestamp(value: string, kind: 'srt' | 'vtt'): number {
  const pattern = kind === 'srt' ? /^(\d{2,3}):(\d{2}):(\d{2}),(\d{3})$/ : /^(?:(\d{2,3}):)?(\d{2}):(\d{2})\.(\d{3})$/;
  const match = value.match(pattern);
  if (!match || Number(match[2]) > 59 || Number(match[3]) > 59) throw new Error('Los subtítulos contienen un tiempo no válido.');
  return ((Number(match[1] ?? 0) * 60 + Number(match[2])) * 60 + Number(match[3])) * 1000 + Number(match[4]);
}
export function subtitleMaterial(raw: string, kind: 'srt' | 'vtt'): { text: string; pageCount: number } {
  let input = raw.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').trim();
  if (kind === 'vtt') {
    if (!/^WEBVTT(?:[ \t][^\n]*)?(?:\n|$)/.test(input)) throw new Error('El archivo VTT debe empezar por WEBVTT.');
    const boundary = input.indexOf('\n\n'); input = boundary < 0 ? '' : input.slice(boundary + 2);
  }
  const cues: string[] = []; let previous = -1;
  for (const block of input.split(/\n[ \t]*\n/).filter(b => b.trim())) {
    if (kind === 'vtt' && /^(?:NOTE(?:[ \t]|$)|STYLE(?:[ \t]*\n|$)|REGION(?:[ \t]*\n|$))/.test(block)) continue;
    const lines = block.split('\n');
    if (!lines[0].includes('-->')) {
      if (kind === 'srt' && !/^\d+$/.test(lines[0].trim())) throw new Error('El archivo SRT contiene un bloque sin índice válido.');
      lines.shift();
    }
    const times = lines.shift()?.match(/^(\S+)\s+-->\s+(\S+)(?:[ \t].*)?$/);
    if (!times) throw new Error('Los subtítulos contienen un bloque sin tiempos válidos.');
    const start = timestamp(times[1], kind), end = timestamp(times[2], kind);
    if (end <= start || start < previous) throw new Error('Los tiempos de los subtítulos deben avanzar y terminar después del inicio.');
    previous = start;
    // HTML is parsed as inert text. Voice labels and inline timestamps are retained/removed respectively.
    const content = htmlMaterial(lines.join('\n').replace(/<v\s+([^>]+)>/g, '$1: ').replace(/<\d{2}(?::\d{2})?:\d{2}\.\d{3}>/g, '')).trim();
    if (content) cues.push(`[${times[1].replace(',', '.')} → ${times[2].replace(',', '.')}]\n${content}`);
    if (cues.length > 18000) throw new Error('Los subtítulos superan el límite de 18.000 fragmentos.');
  }
  const groups: string[] = [];
  for (let index = 0; index < cues.length; index += 60) groups.push(cues.slice(index, index + 60).join('\n\n'));
  return { text: groups.join('\f'), pageCount: Math.max(1, groups.length) };
}
