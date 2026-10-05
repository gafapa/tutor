import { InferenceSession, Tensor } from 'onnxruntime-node';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { SEMANTIC_MODEL } from './semantic-config.js';
import { normalizeVector, vectorCode } from './semantic-vectors.js';

export async function verifySemanticAssets(directory: string) {
  for (const asset of SEMANTIC_MODEL.files) {
    const path = join(directory, asset.name); if ((await stat(path)).size !== asset.bytes) throw new Error('Los recursos de búsqueda local están incompletos. Reinstala la app.');
    const digest = createHash('sha256'); for await (const bytes of createReadStream(path)) digest.update(bytes);
    if (digest.digest('hex') !== asset.sha256) throw new Error('Los recursos de búsqueda local no superan la comprobación de integridad. Reinstala la app.');
  }
}
export class SemanticEngine {
  private constructor(private tokenizer: InstanceType<typeof import('@huggingface/tokenizers').Tokenizer>, private session: InferenceSession) {}
  static async open(directory: string) {
    await verifySemanticAssets(directory);
    const { Tokenizer } = await import('@huggingface/tokenizers');
    const tokenizer = new Tokenizer(JSON.parse(await readFile(join(directory, 'tokenizer.json'), 'utf8')), JSON.parse(await readFile(join(directory, 'tokenizer_config.json'), 'utf8')));
    const session = await InferenceSession.create(join(directory, 'model.onnx'), { executionProviders: ['cpu'], intraOpNumThreads: 2, interOpNumThreads: 1, executionMode: 'sequential', logSeverityLevel: 3, graphOptimizationLevel: 'all' });
    if (session.inputNames.join('|') !== 'input_ids|attention_mask|token_type_ids' || session.outputNames.join('|') !== 'last_hidden_state') { await session.release(); throw new Error('El modelo de búsqueda tiene una estructura inesperada.'); }
    return new SemanticEngine(tokenizer, session);
  }
  async embed(text: string, mode: 'query' | 'passage'): Promise<{ vector: string; windows: number }> {
    const prefix = this.tokenizer.encode(mode + ': ', { add_special_tokens: false }).ids, content = this.tokenizer.encode(text, { add_special_tokens: false }).ids;
    const maxContent = SEMANTIC_MODEL.maxTokens - 2 - prefix.length;
    const combined = new Array<number>(SEMANTIC_MODEL.dimensions).fill(0); let windows = 0;
    // Long fragments use overlapping token windows. No input text is dropped.
    for (let offset = 0; offset < Math.max(1, content.length); offset += maxContent - 64) {
      const ids = [0, ...prefix, ...content.slice(offset, offset + maxContent), 2];
      const result = await this.session.run({ input_ids: new Tensor('int64', BigInt64Array.from(ids.map(BigInt)), [1, ids.length]), attention_mask: new Tensor('int64', BigInt64Array.from(ids.map(() => 1n)), [1, ids.length]), token_type_ids: new Tensor('int64', new BigInt64Array(ids.length), [1, ids.length]) });
      const hidden = result.last_hidden_state; if (hidden.dims.join('|') !== `1|${ids.length}|${SEMANTIC_MODEL.dimensions}` || hidden.type !== 'float32') throw new Error('El resultado del modelo de búsqueda no coincide con el texto.');
      const pooled = new Array<number>(SEMANTIC_MODEL.dimensions).fill(0), values = hidden.data as Float32Array;
      for (let token = 0; token < ids.length; token++) for (let dimension = 0; dimension < SEMANTIC_MODEL.dimensions; dimension++) pooled[dimension] += values[token * SEMANTIC_MODEL.dimensions + dimension] / ids.length;
      const normalized = normalizeVector(pooled); normalized.forEach((value, index) => combined[index] += value); windows++;
      if (offset + maxContent >= content.length) break;
    }
    return { vector: vectorCode(combined), windows };
  }
  async close() { await this.session.release(); }
}
