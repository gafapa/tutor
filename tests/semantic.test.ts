import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { Store } from '../electron/store';
import { searchCorpus, searchInput, sha, rankChunks } from '../electron/semantic-corpus';
import { SemanticIndex } from '../electron/semantic-index';
import { SemanticSearch, type EmbeddingClient } from '../electron/semantic-search';
import { normalizeVector, vectorCode, readVector, cosine } from '../electron/semantic-vectors';
import { writeEncrypted } from '../electron/vault';
import type { SemanticSearchInput } from '../shared/semantic';

const root = resolve('.tools/semantic-domain', randomUUID());
const input = (subjectId: string | null, more: Partial<SemanticSearchInput> = {}): SemanticSearchInput => ({ subjectId, query: 'parte de un total', scope: 'all', conceptId: null, outcome: 'all', since: null, until: null, order: 'relevance', page: 1, ...more });
const vector = (dimension = 0) => vectorCode(Array.from({ length: 384 }, (_, i) => i === dimension ? 1 : 0));
async function opened() {
  await mkdir(root, { recursive: true }); const key = randomBytes(32), store = await Store.open(join(root, randomUUID() + '.tutor'), key, resolve('node_modules/sql.js/dist/sql-wasm.wasm'));
  const subject = store.createSubject({ name: 'Matemáticas', level: 'Prueba', teacher: '', goals: '', color: 'sage' }), path = join(root, randomUUID() + '.index'); return { store, subject, key, path, index: new SemanticIndex(path, key) };
}

test('búsqueda exige fechas reales, ámbito explícito y filtros válidos', () => {
  const base = input(randomUUID()); assert.doesNotThrow(() => searchInput.parse(base));
  for (const change of [{ query: ' ' }, { since: '2026-02-30' }, { since: '2026-02-02', until: '2026-02-01' }, { page: 0 }, { page: 1501 }, { url: 'https://external.invalid' }, { subjectId: undefined }]) assert.throws(() => searchInput.parse({ ...base, ...change }));
});
test('corpus separa materias, conserva páginas y consulta solo versiones actuales accesibles', async () => {
  const { store, subject } = await opened();
  try {
    const other = store.createSubject({ name: 'Otra', level: '', teacher: '', goals: '', color: 'blue' });
    store.addMaterial(subject.id, 'Apuntes', 'note', 'VERSIÓN ANTERIOR');
    store.addMaterial(subject.id, 'Apuntes', 'note', 'Página primera\fPágina segunda', 2);
    const current = store.snapshot().materials.find(row => row.name === 'Apuntes' && row.version === 2)!;
    store.addMaterial(other.id, 'Privado', 'note', 'FUERA_DEL_ÁMBITO');
    const rows = searchCorpus(store.snapshot(), input(subject.id, { scope: 'materials' }));
    assert.equal(rows.length, 2); assert.ok(rows.every(row => row.sourceId === current.id && row.version === 2)); assert.deepEqual(rows.map(row => row.page), [1, 2]);
    const snapshot = store.snapshot(); snapshot.materials.find(row => row.id === current.id)!.retrievalAvailable = false;
    assert.equal(searchCorpus(snapshot, input(subject.id, { scope: 'materials' })).length, 0, 'Unavailable current versions cannot reactivate superseded copies.');
    assert.equal(searchCorpus(store.snapshot(), input(null, { scope: 'materials' })).length, 3);
  } finally { store.close(); }
});
test('todos los fragmentos enlazan con intervalos exactos y no pierden el final del texto', async () => {
  const { store, subject } = await opened();
  try {
    const text = 'contenido '.repeat(500) + 'ÚLTIMA EVIDENCIA'; store.addMaterial(subject.id, 'Extenso', 'note', text);
    const rows = searchCorpus(store.snapshot(), input(subject.id)); let covered = 0;
    for (const row of rows) { assert.equal(row.text, text.slice(row.start, row.end)); assert.equal(row.sourceHash, sha(text)); assert.ok(row.start <= covered); covered = Math.max(covered, row.end); }
    assert.equal(covered, text.length); assert.match(rows.at(-1)!.text, /ÚLTIMA EVIDENCIA$/);
  } finally { store.close(); }
});
test('filtros de fecha, concepto y resultado conservan el origen de las evidencias', async () => {
  const { store, subject } = await opened();
  try {
    const c = store.createConcept({ subjectId: subject.id, name: 'Fracciones', description: '', prerequisiteIds: [] });
    const wrong = store.saveAttempt({ subjectId: subject.id, conceptId: c.id, statement: 'Representa una parte de la pizza', answer: '8/3', feedback: 'Invertí los términos', outcome: 'incorrect', hints: 0, durationSeconds: 10 });
    store.saveAttempt({ subjectId: subject.id, conceptId: c.id, statement: 'Representa una parte de la pizza', answer: '3/8', feedback: 'Correcto', outcome: 'correct', hints: 0, durationSeconds: 10 });
    store.addMaterial(subject.id, 'Parte de un todo', 'note', 'Material sin resultado educativo');
    const day = wrong.createdAt.slice(0, 10), rows = searchCorpus(store.snapshot(), input(subject.id, { conceptId: c.id, outcome: 'incorrect', since: day, until: day }));
    assert.ok(rows.length); assert.ok(rows.every(row => row.sourceId === wrong.id && row.origin === 'self' && row.outcome === 'incorrect'));
    assert.equal(searchCorpus(store.snapshot(), input(subject.id, { since: '2099-01-01' })).length, 0);
    assert.throws(() => searchCorpus(store.snapshot(), input(subject.id, { conceptId: randomUUID() })), /concepto/);
  } finally { store.close(); }
});
test('el índice exige 384 valores finitos y normalizados con codificación canónica', () => {
  assert.equal(cosine(readVector(vector()), readVector(vector())), 1); assert.equal(cosine(readVector(vector()), readVector(vector(1))), 0);
  assert.throws(() => normalizeVector([1]), /vector/); assert.throws(() => normalizeVector(Array(384).fill(0)), /vacío/);
  assert.throws(() => readVector(vector() + '\n'), /válido/);
  const bytes = Buffer.from(vector(), 'base64'); bytes.writeFloatLE(NaN, 0); assert.throws(() => readVector(bytes.toString('base64')), /normalizado/);
});
test('el índice derivado queda cifrado, se reutiliza y descarta corrupción o modelos antiguos', async () => {
  const { store, key, path, index } = await opened();
  try {
    index.put(sha('PRIVATE_FRAGMENT'), vector()); index.save(); const encrypted = readFileSync(path); assert.equal(encrypted.subarray(0, 7).toString(), 'TUTOR01'); assert.equal(encrypted.includes(Buffer.from('PRIVATE_FRAGMENT')), false); assert.equal(encrypted.includes(Buffer.from(vector())), false);
    assert.equal(new SemanticIndex(path, key).get(sha('PRIVATE_FRAGMENT')), vector());
    encrypted[encrypted.length - 1] ^= 1; writeFileSync(path, encrypted); const rebuilt = new SemanticIndex(path, key); assert.equal(rebuilt.get(sha('PRIVATE_FRAGMENT')), undefined); assert.equal(existsSync(path), false);
    writeEncrypted(path, Buffer.from(JSON.stringify({ format: 'tutor-local-semantic-index', version: 1, model: 'old', vectors: [[sha('old'), vector()]] })), key);
    assert.equal(new SemanticIndex(path, key).get(sha('old')), undefined); assert.equal(existsSync(path), false);
  } finally { store.close(); }
});
test('la búsqueda usa significado y palabras, reduce duplicados y no presenta similitud como nota', async () => {
  const { store, subject } = await opened();
  try {
    store.addMaterial(subject.id, 'Representaciones', 'note', 'texto extenso '.repeat(180)); store.addMaterial(subject.id, 'Texto no relacionado', 'note', 'Otra información.');
    const chunks = searchCorpus(store.snapshot(), input(subject.id)), vectors = new Map(chunks.map(row => [row.key, row.title === 'Representaciones' ? vector() : vector(1)]));
    const hits = rankChunks(chunks, 'sin palabras compartidas', vector(), vectors); assert.equal(hits.length, 1); assert.equal(hits[0].chunk.title, 'Representaciones');
    assert.throws(() => rankChunks(chunks, 'consulta', vector(), new Map()), /completado/);
  } finally { store.close(); }
});
test('la búsqueda reutiliza vectores, cuenta todos los registros y pagina sin recortar el historial', async () => {
  const { store, subject, index } = await opened(); let passages = 0, queries = 0;
  try {
    for (let i = 0; i < 25; i++) store.addMaterial(subject.id, `Documento ${i}`, 'note', `parte de un total ${i}`);
    const client: EmbeddingClient = { async embed(_text, mode) { if (mode === 'passage') passages++; else queries++; return vector(); }, async close() {} };
    const search = new SemanticSearch(store, index, async () => client), first = await search.search(input(subject.id)), second = await search.search(input(subject.id, { page: 2 }));
    assert.equal(first.total, 25); assert.equal(first.hits.length, 20); assert.equal(second.hits.length, 5); assert.equal(second.pages, 2); assert.equal(passages, 25); assert.equal(queries, 2);
    assert.equal(new Set([...first.hits, ...second.hits].map(hit => hit.sourceId)).size, 25); assert.ok(first.hits.every(hit => !('score' in hit) && !('confidence' in hit)));
  } finally { store.close(); }
});
test('un intento muy parecido no desplaza los apuntes útiles del contexto del tutor', async () => {
  const { store, subject, index } = await opened();
  try {
    store.addMaterial(subject.id, 'APUNTE', 'note', 'Representaciones numéricas');
    const attempt = store.saveAttempt({ subjectId: subject.id, conceptId: null, statement: 'Mi intento previo', answer: 'Paso anterior', feedback: '', outcome: 'ungraded', hints: 0, durationSeconds: 0 });
    const materialVector = vectorCode(Array.from({ length: 384 }, (_, i) => i === 0 ? 0.82 : i === 1 ? Math.sqrt(1 - 0.82 ** 2) : 0));
    const search = new SemanticSearch(store, index, async () => ({ async embed(text, mode) { return mode === 'passage' && text.startsWith('APUNTE') ? materialVector : vector(); }, async close() {} }));
    const result = await search.retrieve(input(subject.id, { query: 'consulta distinta' }), true);
    assert.ok(result.hits.some(hit => hit.kind === 'material')); assert.ok(result.hits.some(hit => hit.kind === 'attempt' && hit.sourceId === attempt.id));
  } finally { store.close(); }
});
test('borrar el perfil durante una inferencia impide reescribir el índice o devolver datos antiguos', async () => {
  const { store, subject, index, path } = await opened(); let release!: () => void, entered!: () => void;
  try {
    store.addMaterial(subject.id, 'Privado', 'note', 'parte de un total');
    const started = new Promise<void>(resolve => { entered = resolve; }), waiting = new Promise<void>(resolve => { release = resolve; });
    const search = new SemanticSearch(store, index, async () => ({ async embed() { entered(); await waiting; return vector(); }, async close() {} }));
    const result = search.search(input(subject.id)), rejected = assert.rejects(result, /cancelada/); await started; search.invalidate(); store.erase(); release(); await rejected;
    assert.equal(existsSync(path), false); assert.equal(search.progress(), null); assert.equal(store.snapshot().subjects.length, 0);
  } finally { store.close(); }
});
test('un cambio de material durante la búsqueda invalida los resultados y el índice', async () => {
  const { store, subject, index, path } = await opened(); let calls = 0;
  try {
    store.addMaterial(subject.id, 'Actual', 'note', 'parte de un total');
    const search = new SemanticSearch(store, index, async () => ({ async embed() { if (++calls === 1) store.addMaterial(subject.id, 'Actual', 'note', 'texto nuevo incompatible'); return vector(); }, async close() {} }));
    await assert.rejects(search.search(input(subject.id)), /han cambiado/); assert.equal(existsSync(path), false); assert.equal(search.progress(), null);
  } finally { store.close(); }
});
test('un error del motor cierra la sesión y permite reintentar sin perder el historial', async () => {
  const { store, subject, index } = await opened(); let failed = true, closed = 0;
  try {
    store.addMaterial(subject.id, 'Apuntes', 'note', 'parte de un total');
    const search = new SemanticSearch(store, index, async () => ({ async embed() { if (failed) throw new Error('motor detenido'); return vector(); }, async close() { closed++; } }));
    await assert.rejects(search.search(input(subject.id)), /motor detenido/); assert.equal(closed, 1); assert.equal(search.progress(), null);
    failed = false; assert.equal((await search.search(input(subject.id))).total, 1); assert.equal(closed, 2); assert.equal(store.snapshot().materials.length, 1);
  } finally { store.close(); }
});
test('las evidencias del tutor sobreviven a la copia portable sin permitir referencias a otras materias', async () => {
  const { store, subject } = await opened();
  try {
    const attempt = store.saveAttempt({ subjectId: subject.id, conceptId: null, statement: 'Una parte del total', answer: '3/8', feedback: '', outcome: 'ungraded', hints: 0, durationSeconds: 0 });
    store.addMessage({ subjectId: subject.id, role: 'assistant', text: 'Una explicación', mode: 'explain', citations: [], retrieval: 'hybrid', evidenceIds: [attempt.id] });
    const backup = store.exportData(); store.importData(backup); assert.deepEqual(store.snapshot().messages[0].evidenceIds, [attempt.id]);
    const altered = JSON.parse(backup); altered.tables.messages[0].evidenceIds = [randomUUID()]; assert.throws(() => store.importData(JSON.stringify(altered)), /evidencias del tutor/);
    assert.equal(store.snapshot().messages[0].retrieval, 'hybrid');
  } finally { store.close(); }
});
