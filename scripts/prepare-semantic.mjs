import { readFile, writeFile, mkdir, rename } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, join } from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url), { SEMANTIC_MODEL } = require('../build/electron/semantic-config.js');
const directory = resolve('.tools/semantic-runtime'); await mkdir(directory, { recursive: true });
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
for (const asset of SEMANTIC_MODEL.files) {
  const path = join(directory, asset.name), existing = await readFile(path).catch(() => null);
  if (existing?.length === asset.bytes && digest(existing) === asset.sha256) continue;
  const url = asset.source.startsWith('https://') ? asset.source : `https://huggingface.co/${SEMANTIC_MODEL.repository}/resolve/${SEMANTIC_MODEL.commit}/${asset.source}?download=true`;
  const response = await fetch(url, { signal: AbortSignal.timeout(300000) }); if (!response.ok || !response.body) throw new Error('No se pudo descargar un recurso de búsqueda semántica.');
  const parts = []; let length = 0;
  for await (const part of response.body) { length += part.length; if (length > asset.bytes) throw new Error('Tamaño del recurso semántico inesperado.'); parts.push(part); }
  const bytes = Buffer.concat(parts); if (bytes.length !== asset.bytes || digest(bytes) !== asset.sha256) throw new Error('El recurso de búsqueda no coincide con su SHA-256.');
  await writeFile(path + '.partial', bytes); await rename(path + '.partial', path); console.log(`Recurso semántico verificado: ${asset.name}.`);
}
await writeFile(join(directory, 'runtime-info.json'), JSON.stringify(SEMANTIC_MODEL, null, 2) + '\n');
console.log('Recursos de búsqueda local preparados.');
