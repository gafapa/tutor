import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { createCanvas } from '@napi-rs/canvas';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { Store } from '../electron/store';
import { imageDimensions } from '../electron/image-header';
import { ocrOptions, ocrReviewInput, validateCapture } from '../electron/ocr-validation';
import { OCR_ASSETS, OCR_VERSION } from '../electron/ocr-config';
import { workContext } from '../electron/pedagogy';
import { retrieve } from '../electron/retrieval';
import { encodeBackup, decodeBackup } from '../electron/backup';
import { readLocalFile } from '../electron/local-file';
import initSqlJs from 'sql.js';
import { readEncrypted, writeEncrypted } from '../electron/vault';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { Capture, OcrReviewInput } from '../shared/ocr';

const root = resolve('.tools/ocr-domain', randomUUID()), wasm = resolve('node_modules/sql.js/dist/sql-wasm.wasm');
const hash = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
function capture(subjectId: string): Capture {
  const canvas = createCanvas(300, 200), ctx = canvas.getContext('2d'); ctx.fillStyle = 'white'; ctx.fillRect(0, 0, 300, 200); ctx.fillStyle = 'black'; ctx.font = '30px Arial'; ctx.fillText('2 + 2 = 5', 20, 90);
  const bytes = canvas.encodeSync('jpeg', 88);
  return { id: randomUUID(), subjectId, name: 'Ejercicio.png', sourceFormat: 'image', sourcePage: 1, sourceHash: hash(Buffer.from('documento original')), image: { mime: 'image/jpeg', base64: bytes.toString('base64'), width: 300, height: 200, hash: hash(bytes) }, recognition: { engine: 'tesseract-local', version: OCR_VERSION, language: 'spa', modelHashes: [OCR_ASSETS[0].sha256], text: '2 + 2 = S', confidence: 80, words: [{ text: 'S', confidence: 20, box: { x0: 10, y0: 20, x1: 25, y1: 50 } }] }, createdAt: new Date().toISOString() };
}
const input = (more: Partial<OcrReviewInput> = {}): OcrReviewInput => ({ text: '2 + 2 = 5', confirmed: true, destination: 'material', name: 'Cálculo revisado', statement: '', conceptId: null, ...more });
async function opened() { await mkdir(root, { recursive: true }); const path = join(root, randomUUID() + '.tutor'), key = randomBytes(32), store = await Store.open(path, key, wasm); const subject = store.createDemo(); return { path, key, store, subject }; }

test('OCR limita páginas, rotación e idiomas antes de abrir el archivo', () => {
  const valid = { subjectId: randomUUID(), language: 'spa', firstPage: 2, lastPage: 11, rotation: 90 };
  assert.doesNotThrow(() => ocrOptions.parse(valid));
  for (const change of [{ lastPage: 12 }, { lastPage: 1 }, { firstPage: 0 }, { lastPage: 301 }, { rotation: 1 }, { language: 'https://external.invalid' }, { filename: 'externo' }]) assert.throws(() => ocrOptions.parse({ ...valid, ...change }));
});
test('OCR exige revisión y enunciado para resoluciones sin aceptar una nota', () => {
  assert.doesNotThrow(() => ocrReviewInput.parse(input()));
  for (const change of [{ confirmed: false }, { text: ' ' }, { destination: 'attempt' }, { outcome: 'correct' }, { text: 'a'.repeat(20001), destination: 'attempt', statement: 'Suma' }]) assert.throws(() => ocrReviewInput.parse(input(change as Partial<OcrReviewInput>)));
});
test('cabeceras de imágenes verifican dimensiones y rechazan animaciones y tamaños abusivos', () => {
  const canvas = createCanvas(40, 25);
  for (const format of ['png', 'jpeg', 'webp'] as const) assert.deepEqual(imageDimensions(canvas.encodeSync(format)), { format, width: 40, height: 25 });
  const png = canvas.encodeSync('png'); png.writeUInt32BE(10001, 16); assert.throws(() => imageDimensions(png), /límites/);
  const animation = Buffer.alloc(30); animation.write('RIFF', 0); animation.write('WEBP', 8); animation.write('VP8X', 12); animation[20] = 2; assert.throws(() => imageDimensions(animation), /animada/);
  for (const bytes of [Buffer.from('<svg>'), Buffer.from([255, 216, 255, 192, 0, 20]), Buffer.alloc(0)]) assert.throws(() => imageDimensions(bytes));
});
test('imagen, modelo y posiciones OCR deben coincidir con sus comprobaciones', () => {
  const row = capture(randomUUID()); assert.doesNotThrow(() => validateCapture(row));
  for (const mutate of [(r: Capture) => { r.image.hash = '0'.repeat(64); }, (r: Capture) => { r.image.width++; }, (r: Capture) => { r.recognition.modelHashes = [OCR_ASSETS[2].sha256]; }, (r: Capture) => { r.recognition.words[0].box.x1 = 301; }, (r: Capture) => { r.image.base64 += '='; }]) { const bad = structuredClone(row); mutate(bad); assert.throws(() => validateCapture(bad)); }
});
test('captura confirmada guarda original cifrado, fuente y contexto de la asignatura', async () => {
  const { store, subject, path } = await opened();
  try { const row = capture(subject.id), saved = store.commitCapture(row, input({ text: 'La suma revisada: 2 + 2 = 5' })); const snapshot = store.snapshot(); assert.equal(snapshot.captures.length, 1); assert.equal(snapshot.captureReviews.length, 1); assert.equal('image' in snapshot.captures[0], false); assert.equal('text' in snapshot.captureReviews[0], false); assert.deepEqual(store.captureData(saved.captureId).capture, row); const material = snapshot.materials.find(m => m.ocrSource)!; assert.equal(material.text, 'La suma revisada: 2 + 2 = 5'); assert.equal(material.ocrSource!.reviewId, saved.reviewId); assert.equal(material.kind, 'ocr'); assert.equal(retrieve([material], subject.id, 'suma revisada').length, 1); assert.equal(retrieve([material], randomUUID(), 'suma revisada').length, 0); assert.equal(snapshot.attempts.length, 0); assert.ok(snapshot.estimates.every(e => e.status === 'unseen')); const vault = await readFile(path); assert.equal(vault.includes(Buffer.from(row.image.base64.slice(0, 120))), false); assert.equal(vault.includes(Buffer.from('2 + 2 = 5')), false); assert.doesNotThrow(() => store.importData(store.exportData())); } finally { store.close(); }
});
test('revisiones son inmutables y un editor antiguo no puede crear una rama', async () => {
  const { store, subject } = await opened();
  try { const saved = store.commitCapture(capture(subject.id), input()); const review = store.reviewCapture(saved.captureId, saved.reviewId, input({ text: '2 + 2 = 4' })); assert.equal(review.previousId, saved.reviewId); assert.throws(() => store.reviewCapture(saved.captureId, saved.reviewId, input()), /más reciente/); const detail = store.captureData(saved.captureId); assert.equal(detail.capture.recognition.text, '2 + 2 = S'); assert.deepEqual(detail.reviews.map(r => r.text), ['2 + 2 = 5', '2 + 2 = 4']); assert.doesNotThrow(() => store.importData(store.exportData())); } finally { store.close(); }
});
test('resoluciones OCR no elevan dominio y sus revisiones comparten la misma evidencia', async () => {
  const { store, subject } = await opened();
  try { const concept = store.snapshot().concepts[0], saved = store.commitCapture(capture(subject.id), input({ destination: 'attempt', statement: 'Comprueba estas sumas', conceptId: concept.id })); store.reviewCapture(saved.captureId, saved.reviewId, input({ destination: 'attempt', statement: 'Comprueba estas sumas', conceptId: concept.id, text: '2 + 2 = 4' })); const snapshot = store.snapshot(); assert.equal(snapshot.attempts.length, 2); for (const row of snapshot.attempts) { assert.equal(row.outcome, 'ungraded'); assert.equal(row.source, 'self'); assert.equal(row.classification, undefined); } const keys = snapshot.attempts.map(a => workContext({ kind: 'attempt', id: a.id }, snapshot.attempts, [], []).evidenceKey); assert.equal(keys[0], keys[1]); assert.ok(snapshot.estimates.every(e => e.status === 'unseen')); const analysis = store.analyzeSteps({ kind: 'attempt', id: snapshot.attempts[0].id }); assert.equal(analysis.steps[0].correct, false); assert.equal(analysis.observations.length, 1); assert.doesNotThrow(() => store.importData(store.exportData())); } finally { store.close(); }
});
test('releer una captura no duplica la imagen ni el mismo trabajo', async () => {
  const { store, subject } = await opened();
  try { const row = capture(subject.id); const first = store.commitCapture(row, input({ destination: 'attempt', statement: 'Suma' })); const second = store.commitCapture({ ...row, id: randomUUID() }, input({ destination: 'attempt', statement: 'Suma' })); assert.equal(second.duplicate, true); assert.equal(second.captureId, first.captureId); assert.equal(store.snapshot().captures.length, 1); assert.equal(store.snapshot().attempts.length, 1); assert.equal(store.captureData(first.captureId).reviews.length, 2); } finally { store.close(); }
});
test('borrar imagen elimina original y revisiones, conserva texto y no independiza evidencias', async () => {
  const { store, subject } = await opened();
  try { const row = capture(subject.id); const saved = store.commitCapture(row, input()); store.commitCapture(row, input({ destination: 'attempt', statement: 'Suma' })); const before = store.snapshot(), key = workContext({ kind: 'attempt', id: before.attempts[0].id }, before.attempts, [], []).evidenceKey; store.deleteCapture(saved.captureId); const snapshot = store.snapshot(); assert.equal(snapshot.captures.length, 0); assert.equal(snapshot.captureReviews.length, 0); assert.equal(snapshot.attempts[0].answer, '2 + 2 = 5'); assert.equal(snapshot.attempts[0].ocrSource!.removed, true); assert.equal(workContext({ kind: 'attempt', id: snapshot.attempts[0].id }, snapshot.attempts, [], []).evidenceKey, key); assert.doesNotThrow(() => store.importData(store.exportData())); const copy = store.exportData(); assert.equal(copy.includes(row.image.base64), false); assert.equal(copy.includes(row.recognition.text), false); } finally { store.close(); }
});
test('copias OCR cifradas sobreviven a restauración y reinicio; borrar asignatura limpia sus imágenes', async () => {
  const { store, subject, path, key } = await opened(); const saved = store.commitCapture(capture(subject.id), input()); const backup = encodeBackup(store.exportData(), 'copia OCR privada'); store.erase(); store.importData(decodeBackup(backup, 'copia OCR privada')); store.close();
  const reopened = await Store.open(path, key, wasm); try { assert.equal(reopened.captureData(saved.captureId).reviews.length, 1); assert.equal(JSON.parse(reopened.exportData()).version, 12); reopened.deleteSubject(subject.id); assert.equal(reopened.snapshot().captures.length, 0); assert.equal(reopened.snapshot().captureReviews.length, 0); assert.doesNotThrow(() => reopened.importData(reopened.exportData())); } finally { reopened.close(); }
});
test('restauración rechaza imagen alterada, fuentes cruzadas y notas inventadas sin tocar el historial', async () => {
  const { store, subject } = await opened();
  try { store.commitCapture(capture(subject.id), input({ destination: 'attempt', statement: 'Suma' })); const snapshot = store.snapshot(), valid = JSON.parse(store.exportData());
    for (const mutate of [(b: any) => { b.tables.captures[0].image.hash = '0'.repeat(64); }, (b: any) => { b.tables.capture_reviews[0].subjectId = randomUUID(); }, (b: any) => { b.tables.attempts[0].answer = 'Texto inventado'; }, (b: any) => { b.tables.attempts[0].outcome = 'correct'; }, (b: any) => { b.tables.attempts[0].ocrSource.sourcePage = 2; }, (b: any) => { b.tables.capture_reviews.push({ ...b.tables.capture_reviews[0], id: randomUUID() }); }]) { const bad = structuredClone(valid); mutate(bad); assert.throws(() => store.importData(JSON.stringify(bad))); assert.deepEqual(store.snapshot().attempts, snapshot.attempts); assert.equal(store.snapshot().captures.length, 1); }
  } finally { store.close(); }
});
test('copias versión 11 incorporan tablas OCR vacías sin inferir trabajos', async () => {
  const { store, subject } = await opened(); try { const legacy = JSON.parse(store.exportData()); legacy.version = 11; delete legacy.tables.captures; delete legacy.tables.capture_reviews; store.importData(JSON.stringify(legacy)); assert.equal(store.snapshot().subjects[0].id, subject.id); assert.equal(store.snapshot().captures.length, 0); assert.equal(store.snapshot().captureReviews.length, 0); assert.equal(store.snapshot().attempts.length, 0); assert.equal(JSON.parse(store.exportData()).version, 12); } finally { store.close(); }
});
test('lector de archivos OCR limita bytes antes de reservar una imagen grande', async () => {
  await mkdir(root, { recursive: true }); const path = join(root, 'bounded.bin'); await writeFile(path, Buffer.alloc(1025)); await assert.rejects(() => readLocalFile(path, 1024), /límite/); assert.equal((await readLocalFile(path, 1025)).length, 1025);
});
test('base versión 11 migra cifrada sin modificar asignaturas ni inventar capturas', async () => {
  const { store, subject, path, key } = await opened(); store.close();
  const sql = await initSqlJs({ locateFile: () => wasm }), db = new sql.Database(readEncrypted(path, key)); db.run('DROP TABLE capture_reviews; DROP TABLE captures; PRAGMA user_version = 11;'); writeEncrypted(path, db.export(), key); db.close();
  const reopened = await Store.open(path, key, wasm); try { assert.equal(reopened.snapshot().subjects[0].id, subject.id); assert.equal(reopened.snapshot().captures.length, 0); assert.equal(reopened.snapshot().captureReviews.length, 0); assert.equal(JSON.parse(reopened.exportData()).version, 12); assert.doesNotThrow(() => reopened.importData(reopened.exportData())); } finally { reopened.close(); }
});
test('guardia OCR bloquea fetch, HTTP, HTTPS, sockets y TLS en un proceso separado', async () => {
  const code = "const assert=require('node:assert/strict');require('./electron/ocr-network.ts').denyOcrNetwork();const h=require('node:http'),s=require('node:https'),n=require('node:net'),t=require('node:tls');for(const call of [()=>h.request('http://127.0.0.1'),()=>h.get('http://127.0.0.1'),()=>s.request('https://127.0.0.1'),()=>s.get('https://127.0.0.1'),()=>n.connect({port:1}),()=>n.createConnection({port:1}),()=>new n.Socket().connect({port:1}),()=>t.connect({port:1})])assert.throws(call,/no permite conexiones/);assert.rejects(()=>fetch('http://127.0.0.1'),/no permite conexiones/).then(()=>console.log('9 rutas de red bloqueadas'));";
  const result = await promisify(execFile)(process.execPath, ['--import', 'tsx', '-e', code], { windowsHide: true, timeout: 15000 }); assert.match(result.stdout, /9 rutas de red bloqueadas/);
});
