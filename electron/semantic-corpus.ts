import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { Snapshot } from '../shared/types.js';
import type { SearchHit, SemanticSearchInput } from '../shared/semantic.js';
import { cosine, readVector } from './semantic-vectors.js';
import { MAX_SEMANTIC_CHUNKS } from './semantic-config.js';

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => { const time = new Date(value); return Number.isFinite(time.getTime()) && time.toISOString().slice(0, 10) === value; });
export const searchInput = z.object({ subjectId: z.uuid().nullable(), query: z.string().trim().min(2).max(2000), scope: z.enum(['materials', 'history', 'all']), conceptId: z.uuid().nullable(), outcome: z.enum(['all', 'correct', 'incorrect', 'partial', 'ungraded']), since: day.nullable(), until: day.nullable(), order: z.enum(['relevance', 'oldest', 'newest']), page: z.number().int().min(1).max(1500) }).strict().refine(value => !value.since || !value.until || value.since <= value.until, { message: 'La fecha inicial debe ser anterior a la final.' });
type CorpusSnapshot = Pick<Snapshot, 'subjects' | 'materials' | 'concepts' | 'attempts' | 'rubricSubmissions' | 'rubrics' | 'portfolio' | 'studySessions' | 'diagnostics'>;
export type SearchChunk = Omit<SearchHit, 'match'>;
export function sha(text: string) { return createHash('sha256').update(text).digest('hex'); }
const STOP = new Set('a al algo como con cual cuando de del donde el en es esta este esto fallé falle hay la las lo los me mi mis para por que qué se sin son su sus te tengo un una unas unos y how do i is the of a to my'.split(' '));
export function words(text: string) { return text.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').split(/[^\p{L}\p{N}]+/u).filter(word => word.length > 1 && !STOP.has(word)); }
export function literalScore(query: string, text: string) {
  const terms = [...new Set(words(query))], tokens = new Set(words(text));
  return terms.length ? terms.filter(term => tokens.has(term)).length / terms.length : 0;
}
export function searchCorpus(snapshot: CorpusSnapshot, input: SemanticSearchInput): SearchChunk[] {
  if (input.subjectId && !snapshot.subjects.some(row => row.id === input.subjectId)) throw new Error('No se encuentra esta asignatura.');
  if (input.conceptId && !snapshot.concepts.some(row => row.id === input.conceptId && (!input.subjectId || row.subjectId === input.subjectId))) throw new Error('El concepto no pertenece a la asignatura seleccionada.');
  const chunks: SearchChunk[] = [];
  const add = (base: Omit<SearchChunk, 'text' | 'key' | 'start' | 'end' | 'sourceHash' | 'subjectName'>, text: string) => {
    if (input.subjectId && base.subjectId !== input.subjectId || input.conceptId && !base.conceptIds.includes(input.conceptId) || input.outcome !== 'all' && base.outcome !== input.outcome || input.since && base.createdAt.slice(0, 10) < input.since || input.until && base.createdAt.slice(0, 10) > input.until) return;
    const subject = snapshot.subjects.find(row => row.id === base.subjectId); if (!subject) return;
    const sourceHash = sha(text);
    for (let start = 0; start < text.length; start += 900) {
      const end = Math.min(text.length, start + 1100), excerpt = text.slice(start, end); if (!excerpt.trim()) continue;
      const key = sha(JSON.stringify([base, subject.name, sourceHash, start, end]));
      chunks.push({ ...base, subjectName: subject.name, sourceHash, start, end, text: excerpt, key });
      if (chunks.length > MAX_SEMANTIC_CHUNKS) throw new Error('La búsqueda supera 30.000 fragmentos. Acota la asignatura, las fechas o el tipo de registro para consultar todo el ámbito seleccionado.');
      if (end === text.length) break;
    }
  };
  if (input.scope !== 'history') {
    const groups = new Map<string, number>();
    const group = (row: CorpusSnapshot['materials'][number]) => `${row.subjectId}:${row.lms ? `lms:${row.lms.itemId}` : `manual:${row.name}`}`;
    for (const material of snapshot.materials) groups.set(group(material), Math.max(groups.get(group(material)) ?? 0, material.version));
    for (const material of snapshot.materials) {
      if (material.retrievalAvailable === false || material.version !== groups.get(group(material))) continue;
      material.text.split('\f').forEach((text, page) => add({ subjectId: material.subjectId, kind: 'material', sourceId: material.id, title: material.name, field: 'text', page: page + 1, version: material.version, createdAt: material.createdAt, outcome: null, origin: null, conceptIds: [] }, text));
    }
  }
  if (input.scope !== 'materials') {
    for (const row of snapshot.attempts) {
      const base = { subjectId: row.subjectId, kind: 'attempt' as const, sourceId: row.id, title: row.statement.slice(0, 120), page: 1, version: 1, createdAt: row.createdAt, outcome: row.outcome, origin: row.source, conceptIds: [...new Set([...(row.conceptId ? [row.conceptId] : []), ...(row.classification?.conceptIds ?? [])])] };
      for (const field of ['statement', 'answer', 'feedback'] as const) add({ ...base, field }, row[field]);
    }
    for (const row of snapshot.rubricSubmissions) {
      const rubric = snapshot.rubrics.find(r => r.id === row.rubricId), conceptIds = [...new Set(rubric?.criteria.flatMap(c => c.conceptIds) ?? [])];
      for (const field of ['text', 'instructions'] as const) add({ subjectId: row.subjectId, kind: 'submission', sourceId: row.id, title: row.title, field, page: 1, version: row.rubricRevision, createdAt: row.createdAt, outcome: null, origin: null, conceptIds }, row[field]);
    }
    for (const row of snapshot.portfolio) for (const field of ['content', 'reflection'] as const) add({ subjectId: row.subjectId, kind: 'portfolio', sourceId: row.id, title: row.title, field, page: 1, version: 1, createdAt: row.createdAt, outcome: null, origin: null, conceptIds: row.conceptIds }, row[field]);
    for (const row of snapshot.studySessions) if (row.status === 'completed' && row.review) for (const field of ['learned', 'difficulty', 'nextStep'] as const) add({ subjectId: row.subjectId, kind: 'reflection', sourceId: row.id, title: row.goal, field, page: 1, version: 1, createdAt: row.completedAt ?? row.createdAt, outcome: null, origin: 'self', conceptIds: row.conceptIds }, row.review[field]);
    for (const row of snapshot.diagnostics) if (row.status === 'completed') add({ subjectId: row.subjectId, kind: 'reflection', sourceId: row.id, title: 'Reflexión de evaluación inicial', field: 'reflection', page: 1, version: 1, createdAt: row.completedAt ?? row.startedAt, outcome: null, origin: 'self', conceptIds: row.conceptIds }, row.reflection);
  }
  return chunks;
}
export function corpusSignature(chunks: SearchChunk[]) { return sha(chunks.map(row => row.key).sort().join('|')); }
export function rankChunks(chunks: SearchChunk[], query: string, queryVector: string, vectors: Map<string, string>) {
  const q = readVector(queryVector);
  const candidates = chunks.map(chunk => {
    const code = vectors.get(chunk.key); if (!code) throw new Error('La búsqueda no ha completado todos los fragmentos. Inténtalo de nuevo.');
    const meaning = cosine(q, readVector(code)), literal = literalScore(query, `${chunk.title} ${chunk.text}`);
    return { chunk, meaning, literal, score: meaning + literal * 0.07 };
  });
  const best = Math.max(0, ...candidates.map(row => row.meaning));
  const ranked = candidates.filter(row => row.meaning >= Math.max(0.785, best - 0.025) || row.literal >= 0.5);
  ranked.sort((a, b) => b.score - a.score || b.chunk.createdAt.localeCompare(a.chunk.createdAt) || a.chunk.key.localeCompare(b.chunk.key));
  // One representative excerpt per original record/page keeps repeated matches readable.
  const seen = new Set<string>();
  return ranked.filter(row => { const id = `${row.chunk.kind}:${row.chunk.sourceId}:${row.chunk.page}`; if (seen.has(id)) return false; seen.add(id); return true; });
}
