import { posix } from 'node:path';
import { SaxesParser, type SaxesAttributeNS } from 'saxes';
import { decodeText } from './import-text.js';

const P = new Set(['http://schemas.openxmlformats.org/presentationml/2006/main', 'http://purl.oclc.org/ooxml/presentationml/main']);
const A = new Set(['http://schemas.openxmlformats.org/drawingml/2006/main', 'http://purl.oclc.org/ooxml/drawingml/main']);
const R = new Set(['http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'http://purl.oclc.org/ooxml/officeDocument/relationships']);
const REL = 'http://schemas.openxmlformats.org/package/2006/relationships';
interface Xml { local: string; uri: string; attributes: Record<string, SaxesAttributeNS>; children: (Xml | string)[]; }
export function xmlPart(buffer: Buffer, keep = true): Xml {
  if (buffer.length > 8 * 1024 * 1024) throw new Error('Una parte XML del documento supera el límite de 8 MB.');
  const parser = new SaxesParser({ xmlns: true });
  const stack: Xml[] = []; let root: Xml | undefined, nodes = 0;
  parser.on('doctype', () => { throw new Error('El documento contiene definiciones XML externas no admitidas.'); });
  parser.on('opentag', tag => {
    if (++nodes > 100000 || stack.length > 128) throw new Error('La estructura XML del documento es demasiado compleja.');
    const node: Xml = { local: tag.local, uri: tag.uri, attributes: tag.attributes, children: [] };
    if (keep) stack.at(-1)?.children.push(node);
    if (!root) root = node;
    stack.push(node);
  });
  const text = (value: string) => { if (keep) stack.at(-1)?.children.push(value); };
  parser.on('text', text); parser.on('cdata', text); parser.on('closetag', () => { stack.pop(); });
  parser.write(decodeText(buffer)).close();
  if (!root) throw new Error('El documento contiene una parte XML vacía.');
  return root;
}
function descendants(node: Xml, local: string, namespaces: Set<string> | string): Xml[] {
  const result: Xml[] = [];
  function walk(value: Xml) {
    if (value.local === local && (typeof namespaces === 'string' ? value.uri === namespaces : namespaces.has(value.uri))) result.push(value);
    for (const child of value.children) if (typeof child !== 'string') walk(child);
  }
  walk(node); return result;
}
function required(files: Map<string, Buffer>, name: string): Xml {
  const value = files.get(name); if (!value) throw new Error(`Falta una parte necesaria del documento: ${name}.`);
  return xmlPart(value);
}
function relationships(files: Map<string, Buffer>, part: string): Map<string, { type: string; target: string; external: boolean }> {
  const name = posix.join(posix.dirname(part), '_rels', posix.basename(part) + '.rels');
  if (!files.has(name)) return new Map();
  const root = required(files, name);
  if (root.local !== 'Relationships' || root.uri !== REL) throw new Error('Las relaciones internas del documento no son válidas.');
  const result = new Map<string, { type: string; target: string; external: boolean }>();
  for (const node of descendants(root, 'Relationship', REL)) {
    const id = node.attributes.Id?.value;
    if (!id || result.has(id)) throw new Error('El documento contiene relaciones internas repetidas o incompletas.');
    result.set(id, { type: node.attributes.Type?.value ?? '', target: node.attributes.Target?.value ?? '', external: node.attributes.TargetMode?.value === 'External' });
  }
  return result;
}
function resolvePart(part: string, relation: { target: string; external: boolean }): string {
  if (relation.external) throw new Error('Una diapositiva o sus notas apuntan a un recurso externo no admitido.');
  let target: string; try { target = decodeURIComponent(relation.target); } catch { throw new Error('El documento contiene una ruta interna no válida.'); }
  if (!target || /[\\?#:\u0000-\u001f]/.test(target)) throw new Error('El documento contiene una ruta interna no válida.');
  const name = target.startsWith('/') ? posix.normalize(target.slice(1)) : posix.normalize(posix.join(posix.dirname(part), target));
  if (!name.startsWith('ppt/') || name.includes('../')) throw new Error('Una relación sale del contenido de la presentación.');
  return name;
}
function drawingText(root: Xml, notes = false): string {
  const parts: string[] = [];
  const run = (node: Xml): string => {
    if (A.has(node.uri) && node.local === 'br') return '\n';
    if (A.has(node.uri) && node.local === 'tab') return '\t';
    if (A.has(node.uri) && node.local === 't') return node.children.filter((child): child is string => typeof child === 'string').join('');
    return node.children.map(child => typeof child === 'string' ? '' : run(child)).join('');
  };
  const walk = (node: Xml) => {
    if (P.has(node.uri) && node.local === 'sp') {
      if (descendants(node, 'cNvPr', P).some(value => ['1', 'true'].includes(value.attributes.hidden?.value))) return;
      if (notes && descendants(node, 'ph', P).some(value => ['hdr', 'ftr', 'dt', 'sldNum', 'sldImg'].includes(value.attributes.type?.value))) return;
    }
    if (A.has(node.uri) && node.local === 'tr') {
      parts.push(node.children.filter((child): child is Xml => typeof child !== 'string' && A.has(child.uri) && child.local === 'tc').map(cell => descendants(cell, 'p', A).map(run).join(' ')).join('\t')); return;
    }
    if (A.has(node.uri) && node.local === 'p') { parts.push(run(node)); return; }
    for (const child of node.children) if (typeof child !== 'string') walk(child);
  };
  walk(root); return parts.join('\n').replace(/[\u0000\f]/g, ' ').trim();
}
export function presentationMaterial(files: Map<string, Buffer>): { text: string; pageCount: number } {
  const path = 'ppt/presentation.xml', root = required(files, path);
  if (root.local !== 'presentation' || !P.has(root.uri)) throw new Error('El archivo no contiene una presentación PPTX válida.');
  const slides = descendants(root, 'sldId', P), rels = relationships(files, path);
  if (!slides.length || slides.length > 300) throw new Error('La presentación debe contener entre 1 y 300 diapositivas.');
  const pages: string[] = [], seen = new Set<string>();
  for (const slide of slides) {
    const id = Object.values(slide.attributes).find(attr => attr.local === 'id' && R.has(attr.uri))?.value;
    const relation = id ? rels.get(id) : undefined;
    if (!relation || !R.has(relation.type.slice(0, relation.type.lastIndexOf('/'))) || !relation.type.endsWith('/slide')) throw new Error('No se puede localizar una diapositiva declarada en la presentación.');
    const part = resolvePart(path, relation);
    if (seen.has(part)) throw new Error('Una diapositiva aparece repetida en la presentación.');
    seen.add(part);
    const content = required(files, part);
    if (content.local !== 'sld' || !P.has(content.uri)) throw new Error('Una diapositiva no contiene una estructura PPTX válida.');
    let page = drawingText(content);
    const noteRels = [...relationships(files, part).values()].filter(rel => rel.type.endsWith('/notesSlide') && R.has(rel.type.slice(0, rel.type.lastIndexOf('/'))));
    if (noteRels.length > 1) throw new Error('Una diapositiva contiene varias relaciones de notas.');
    if (noteRels.length) {
      const notes = required(files, resolvePart(part, noteRels[0]));
      if (notes.local !== 'notes' || !P.has(notes.uri)) throw new Error('Las notas de la presentación no son válidas.');
      const text = drawingText(notes, true); if (text) page += `${page ? '\n\n' : ''}Notas del profesor:\n${text}`;
    }
    pages.push(page);
  }
  // Blank slides retain their position, and never acquire invented text.
  return { text: pages.join('\f'), pageCount: pages.length };
}
