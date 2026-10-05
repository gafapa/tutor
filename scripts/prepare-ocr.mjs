import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, join } from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url), { OCR_ASSETS, OCR_COMMIT } = require('../build/electron/ocr-config.js');
const directory = resolve('.tools/ocr-runtime'); await mkdir(directory, { recursive: true });
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
for (const asset of OCR_ASSETS) {
  const path = join(directory, asset.name), existing = await readFile(path).catch(() => null);
  if (existing?.length === asset.bytes && digest(existing) === asset.sha256) continue;
  const url = `https://raw.githubusercontent.com/tesseract-ocr/tessdata_fast/${OCR_COMMIT}/${asset.name}`;
  const response = await fetch(url, { signal: AbortSignal.timeout(60000) }); if (!response.ok || !response.body) throw new Error('No se pudo descargar un recurso OCR.');
  const parts = []; let length = 0;
  for await (const part of response.body) { length += part.length; if (length > asset.bytes) throw new Error('Tamaño OCR inesperado.'); parts.push(part); }
  const bytes = Buffer.concat(parts); if (bytes.length !== asset.bytes || digest(bytes) !== asset.sha256) throw new Error('El recurso OCR no coincide con su SHA-256.');
  await writeFile(path + '.partial', bytes); await rename(path + '.partial', path);
}
await writeFile(join(directory, 'runtime-info.json'), JSON.stringify({ source: 'tesseract-ocr/tessdata_fast', tag: '4.1.0', commit: OCR_COMMIT, files: OCR_ASSETS }, null, 2) + '\n');
console.log('Recursos OCR locales verificados.');
