import { open } from 'node:fs/promises';
import { extname, basename } from 'node:path';
import mammoth from 'mammoth';
import { readOfficeArchive } from './import-archive.js';
import { presentationMaterial, xmlPart } from './import-presentation.js';
import { decodeText, htmlMaterial, subtitleMaterial } from './import-text.js';

export interface ExtractedMaterial { name: string; kind: string; text: string; pageCount: number; }

export async function extractMaterial(path: string): Promise<ExtractedMaterial> {
  const handle = await open(path, 'r');
  try {
    const file = await handle.stat();
    if (!file.isFile()) throw new Error('Selecciona un archivo de materiales.');
    if (file.size > 20 * 1024 * 1024) throw new Error('El archivo supera el límite de 20 MB.');
    // A growing file cannot make readFile allocate past the advertised limit.
    const buffer = Buffer.alloc(file.size + 1); let count = 0;
    while (count < buffer.length) {
      const { bytesRead } = await handle.read(buffer, count, buffer.length - count, count);
      if (!bytesRead) break; count += bytesRead;
    }
    const after = await handle.stat();
    if (count !== file.size || after.size !== file.size || after.mtimeMs !== file.mtimeMs) throw new Error('El archivo cambió durante la lectura. Espera a que termine de guardarse y vuelve a añadirlo.');
    return await extractMaterialBuffer(basename(path), buffer.subarray(0, count));
  } finally { await handle.close(); }
}
export async function extractMaterialBuffer(name: string, buffer: Buffer): Promise<ExtractedMaterial> {
  if (buffer.length > 20 * 1024 * 1024) throw new Error('El archivo supera el límite de 20 MB.');
  const extension = extname(name).toLowerCase();
  let text = '';
  let pageCount = 1;
  if (extension === '.txt' || extension === '.md') text = decodeText(buffer).replace(/[\u0000\f]/g, ' ');
  else if (extension === '.html' || extension === '.htm') text = htmlMaterial(decodeText(buffer));
  else if (extension === '.srt' || extension === '.vtt') ({ text, pageCount } = subtitleMaterial(decodeText(buffer), extension.slice(1) as 'srt' | 'vtt'));
  else if (extension === '.docx' || extension === '.pptx') {
    const files = await readOfficeArchive(buffer);
    for (const [name, bytes] of files) if (bytes.length) xmlPart(bytes, false);
    if (extension === '.pptx') ({ text, pageCount } = presentationMaterial(files));
    else {
      if (!files.has('word/document.xml')) throw new Error('El archivo no contiene un documento DOCX válido.');
      text = (await mammoth.extractRawText({ buffer })).value.replace(/[\u0000\f]/g, ' ');
    }
  }
  else if (extension === '.pdf') {
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const task = pdfjs.getDocument({ data: new Uint8Array(buffer), useSystemFonts: true, useWorkerFetch: false });
    const pdf = await task.promise;
    try {
      if (pdf.numPages > 300) throw new Error('El PDF supera el límite de 300 páginas de esta primera versión.');
      pageCount = pdf.numPages;
      const pages: string[] = [];
      for (let number = 1; number <= pdf.numPages; number++) {
        const page = await pdf.getPage(number);
        const content = await page.getTextContent();
        pages.push(content.items.map(item => 'str' in item ? item.str.replace(/[\u0000\f]/g, ' ') + (item.hasEOL ? '\n' : ' ') : '').join(''));
      }
      text = pages.join('\f');
    } finally { await task.destroy(); }
  } else throw new Error('Formato no compatible. Añade PDF, DOCX, PPTX, TXT, Markdown, HTML, SRT o VTT.');
  if (text.length > 2000000) throw new Error('El documento contiene demasiado texto para esta primera versión.');
  if (!text.trim()) throw new Error('No se ha encontrado texto. Para una imagen o un PDF escaneado, usa «Leer imagen o PDF escaneado» y revisa el reconocimiento.');
  const fullName = basename(name).trim();
  const shortName = fullName.length <= 120 ? fullName : [...fullName.slice(0, 110)].slice(0, 109).join('') + '…' + extension;
  return { name: shortName, kind: extension === '.htm' ? 'html' : extension.slice(1), text, pageCount };
}
