import { existsSync, readFileSync, rmSync, statSync } from 'node:fs';
import { z } from 'zod';
import { decrypt, writeEncrypted } from './vault.js';
import { MAX_SEMANTIC_CHUNKS, SEMANTIC_MODEL } from './semantic-config.js';
import { readVector } from './semantic-vectors.js';

const cache = z.object({ format: z.literal('tutor-local-semantic-index'), version: z.literal(1), model: z.string(), vectors: z.array(z.tuple([z.string().regex(/^[a-f0-9]{64}$/), z.string().length(2048)])).max(MAX_SEMANTIC_CHUNKS) }).strict();
/** Rebuildable derived data: only fingerprints and normalized vectors, encrypted with the local vault key. */
export class SemanticIndex {
  private vectors = new Map<string, string>();
  constructor(private path: string, private key: Buffer) {
    if (!existsSync(path)) return;
    try {
      if (statSync(path).size > 96 * 1024 * 1024) throw new Error('Índice demasiado grande.');
      const saved = cache.parse(JSON.parse(decrypt(readFileSync(path), key).toString('utf8')));
      if (saved.model !== SEMANTIC_MODEL.version) throw new Error('Índice de otro modelo.');
      for (const [id, vector] of saved.vectors) { if (this.vectors.has(id)) throw new Error('Fragmento duplicado.'); readVector(vector); this.vectors.set(id, vector); }
    } catch { this.clear(); }
  }
  get(id: string) { return this.vectors.get(id); }
  put(id: string, vector: string) {
    if (!/^[a-f0-9]{64}$/.test(id)) throw new Error('El fragmento no tiene una referencia válida.'); readVector(vector);
    this.vectors.delete(id); this.vectors.set(id, vector);
    while (this.vectors.size > MAX_SEMANTIC_CHUNKS) this.vectors.delete(this.vectors.keys().next().value!);
  }
  save() { writeEncrypted(this.path, Buffer.from(JSON.stringify({ format: 'tutor-local-semantic-index', version: 1, model: SEMANTIC_MODEL.version, vectors: [...this.vectors] })), this.key); }
  clear() { this.vectors.clear(); rmSync(this.path, { force: true }); rmSync(`${this.path}.tmp`, { force: true }); }
}
