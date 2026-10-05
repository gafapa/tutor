import type { Store } from './store.js';
import type { SearchHit, SemanticProgress, SemanticSearchInput, SemanticSearchResult } from '../shared/semantic.js';
import { searchInput, searchCorpus, corpusSignature, rankChunks } from './semantic-corpus.js';
import { SemanticIndex } from './semantic-index.js';

export interface EmbeddingClient { embed(text: string, mode: 'query' | 'passage'): Promise<string>; close(): Promise<void>; }
export type OpenEmbedding = (signal: AbortSignal) => Promise<EmbeddingClient>;
type Job = { input: SemanticSearchInput; controller: AbortController; progress: SemanticProgress };
export class SemanticSearch {
  private job?: Job;
  constructor(private store: Pick<Store, 'snapshot' | 'requireSubject' | 'hasActiveMock'>, private index: SemanticIndex, private open: OpenEmbedding) {}
  progress() { return this.job ? { ...this.job.progress } : null; }
  cancel() { this.job?.controller.abort(); }
  invalidate() { this.cancel(); this.index.clear(); }
  async search(value: SemanticSearchInput): Promise<SemanticSearchResult> {
    const input = searchInput.parse(value), { hits, searchedFragments } = await this.retrieve(input);
    const ordered = input.order === 'relevance' ? hits : [...hits].sort((a, b) => (input.order === 'oldest' ? a.createdAt.localeCompare(b.createdAt) : b.createdAt.localeCompare(a.createdAt)) || a.key.localeCompare(b.key));
    const pages = Math.max(1, Math.ceil(ordered.length / 20)), page = Math.min(input.page, pages);
    return { hits: ordered.slice((page - 1) * 20, page * 20), total: ordered.length, pages, page, searchedFragments };
  }
  async retrieve(input: SemanticSearchInput, forTutor = false): Promise<{ hits: SearchHit[]; searchedFragments: number }> {
    if (this.job) throw new Error('Termina o cancela la búsqueda actual antes de iniciar otra.');
    if (this.store.hasActiveMock()) throw new Error('La búsqueda estará disponible al terminar el simulacro.');
    const job: Job = { input, controller: new AbortController(), progress: { subjectId: input.subjectId, stage: 'preparing', current: 0, total: 0 } }; this.job = job;
    let client: EmbeddingClient | undefined;
    try {
      const chunks = searchCorpus(this.store.snapshot(), input), signature = corpusSignature(chunks);
      const check = (sources = false) => {
        if (job.controller.signal.aborted) throw new Error('Búsqueda cancelada.');
        if (this.store.hasActiveMock() || sources && signature !== corpusSignature(searchCorpus(this.store.snapshot(), input))) { this.index.clear(); throw new Error('Los registros han cambiado durante la búsqueda. Vuelve a buscar para usar su versión actual.'); }
      };
      check(); if (!chunks.length) return { hits: [], searchedFragments: 0 };
      client = await this.open(job.controller.signal); check();
      const vectors = new Map<string, string>(); job.progress = { ...job.progress, stage: 'indexing', total: chunks.length };
      let changed = false;
      for (const [i, chunk] of chunks.entries()) {
        if (job.controller.signal.aborted) throw new Error('Búsqueda cancelada.');
        let vector = this.index.get(chunk.key);
        if (!vector) { vector = await client.embed(chunk.title + '\n' + chunk.text, 'passage'); check(); this.index.put(chunk.key, vector); changed = true; }
        vectors.set(chunk.key, vector); job.progress.current = i + 1;
        if (changed && (i + 1) % 100 === 0) { check(true); this.index.save(); changed = false; }
      }
      check(true); if (changed) this.index.save(); job.progress.stage = 'searching';
      const query = await client.embed(input.query, 'query'); check(true);
      const ranked = forTutor ? [...rankChunks(chunks.filter(row => row.kind === 'material'), input.query, query, vectors), ...rankChunks(chunks.filter(row => row.kind !== 'material'), input.query, query, vectors)].sort((a, b) => b.score - a.score || a.chunk.key.localeCompare(b.chunk.key)) : rankChunks(chunks, input.query, query, vectors);
      return { hits: ranked.map(({ chunk, literal, meaning }) => ({ ...chunk, match: literal >= 0.5 ? meaning >= 0.785 ? 'both' : 'text' : 'meaning' })), searchedFragments: chunks.length };
    } finally { await client?.close(); if (this.job === job) this.job = undefined; }
  }
}
