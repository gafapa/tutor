import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { Store } from '../electron/store';
import { encrypt, decrypt, writeEncrypted } from '../electron/vault';
import initSqlJs from 'sql.js';
import { encodeBackup, decodeBackup } from '../electron/backup';
import { estimate } from '../electron/learning';
import { retrieve } from '../electron/retrieval';
import { extractMaterial } from '../electron/importer';
import { tutorPrompt } from '../electron/prompt';
import type { Attempt, Material } from '../shared/types';

const wasm = resolve('node_modules/sql.js/dist/sql-wasm.wasm');
async function fixture() {
  const directory = resolve('.tools/test-data', randomUUID());
  await mkdir(directory, { recursive: true });
  const key = randomBytes(32); const path = join(directory, 'history.tutor');
  return { directory, path, key, store: await Store.open(path, key, wasm) };
}
function attempt(input: Partial<Attempt> = {}): Attempt {
  return { id: randomUUID(), subjectId: randomUUID(), conceptId: 'concept', statement: 'Prueba', answer: '32', expected: '32', feedback: '', outcome: 'correct', source: 'verified', hints: 0, durationSeconds: 10, createdAt: new Date().toISOString(), ...input };
}
test('el cifrado detecta manipulación y rechaza otra clave', () => {
  const key = randomBytes(32); const bytes = encrypt(Buffer.from('Historial privado del alumno'), key);
  assert.equal(bytes.includes(Buffer.from('Historial privado')), false);
  assert.equal(decrypt(bytes, key).toString(), 'Historial privado del alumno');
  assert.throws(() => decrypt(bytes, randomBytes(32)));
  bytes[bytes.length - 1] ^= 1; assert.throws(() => decrypt(bytes, key));
});
test('una copia cifrada es portable y necesita su contraseña', () => {
  const backup = encodeBackup('{"nombre":"Privado"}', 'una-contraseña-larga');
  assert.equal(backup.includes(Buffer.from('Privado')), false);
  assert.equal(decodeBackup(backup, 'una-contraseña-larga'), '{"nombre":"Privado"}');
  assert.throws(() => decodeBackup(backup, 'otra-contraseña'), /contraseña/);
});
test('editar curso y nivel conserva las evidencias y migra el campo antiguo sin inventar un curso', async () => {
  const { store, path, key } = await fixture();
  const subject = store.createDemo();
  const concept = store.snapshot().concepts.find(concept => concept.name === 'Potencias de 2')!;
  const evidence = store.submitExercise({ conceptId: concept.id, exerciseId: 'Potencias de 2:0', answer: '32', hints: 0, durationSeconds: 10 });
  const before = store.snapshot();
  const changed = store.updateSubject({ id: subject.id, name: 'Redes I', course: '1.º · 2026–2027', level: 'FP de grado medio', teacher: 'Profesora', goals: 'Comprender IPv4', color: 'blue' });
  assert.equal(changed.id, subject.id); assert.equal(changed.createdAt, subject.createdAt); assert.equal(changed.isDemo, true);
  assert.equal(store.snapshot().attempts[0].id, evidence.id);
  assert.deepEqual(store.snapshot().concepts, before.concepts); assert.deepEqual(store.snapshot().materials, before.materials);
  assert.throws(() => store.updateSubject({ ...changed, name: '' }));
  assert.equal(store.requireSubject(subject.id).name, 'Redes I');
  const backup = JSON.parse(store.exportData()); delete backup.tables.subjects[0].course;
  store.importData(JSON.stringify(backup)); assert.equal(store.requireSubject(subject.id).course, '');
  assert.equal(store.requireSubject(subject.id).level, 'FP de grado medio');
  store.close();
  const sql = await initSqlJs({ locateFile: () => wasm }); const db = new sql.Database(decrypt(await readFile(path), key));
  const legacy = { ...changed, level: 'FP · Grado medio' } as Partial<typeof changed>; delete legacy.course;
  db.run('UPDATE subjects SET data = ? WHERE id = ?', [JSON.stringify(legacy), subject.id]);
  writeEncrypted(path, db.export(), key); db.close();
  const reopened = await Store.open(path, key, wasm);
  try {
    assert.equal(reopened.requireSubject(subject.id).course, ''); assert.equal(reopened.requireSubject(subject.id).level, 'FP · Grado medio');
    assert.equal(reopened.snapshot().attempts[0].id, evidence.id);
    assert.equal(JSON.parse(reopened.exportData()).tables.subjects[0].course, '');
  } finally { reopened.close(); }
});
test('la autoevaluación y las pistas no demuestran dominio autónomo', () => {
  assert.equal(estimate('concept', [attempt({ source: 'self' })]).status, 'unseen');
  const hinted = Array.from({ length: 6 }, (_, i) => attempt({ hints: 1, createdAt: new Date(Date.now() - i * 86400000).toISOString() }));
  assert.equal(estimate('concept', hinted).status, 'progress');
  assert.notEqual(estimate('concept', hinted).confidence, 'high');
  assert.equal(estimate('concept', Array.from({ length: 6 }, () => attempt())).status, 'progress');
});
test('la consolidación necesita aciertos independientes en varios días y cambia ante errores recientes', () => {
  const evidence = Array.from({ length: 6 }, (_, i) => attempt({ statement: `Pregunta ${i % 3}`, createdAt: new Date(Date.now() - i * 86400000).toISOString() }));
  assert.equal(estimate('concept', evidence).status, 'consolidated');
  assert.equal(estimate('concept', evidence).confidence, 'high');
  evidence.unshift(attempt({ outcome: 'incorrect' }), attempt({ outcome: 'incorrect' }));
  assert.equal(estimate('concept', evidence).status, 'reinforce');
});
test('la recuperación separa asignaturas y usa la versión actual del material', () => {
  const base: Material = { id: 'a', subjectId: 'math', name: 'Apuntes', kind: 'txt', text: 'fracciones antiguas', pageCount: 1, hash: '', version: 1, createdAt: '' };
  const materials = [base, { ...base, id: 'b', text: 'fracciones actuales', version: 2 }, { ...base, id: 'c', subjectId: 'history', text: 'fracciones de historia' }];
  const result = retrieve(materials, 'math', 'fracciones');
  assert.equal(result.length, 1); assert.equal(result[0].materialId, 'b');
});

test('el contexto del tutor permanece acotado y las fuentes mostradas coinciden con las enviadas', () => {
  const sources = Array.from({ length: 4 }, (_, index) => ({ materialId: String(index), name: 'Apuntes', page: 1, text: 'Explicación del concepto. '.repeat(100) }));
  const history = Array.from({ length: 4 }, (_, index) => ({ role: index % 2 ? 'assistant' : 'user', content: 'Conversación anterior. '.repeat(100) }));
  const question = 'Pregunta sobre este concepto. '.repeat(60);
  const prompt = tutorPrompt('Instrucción pedagógica. '.repeat(60), sources, history, question);
  assert.ok(prompt.messages.reduce((sum, message) => sum + message.content.length, 0) <= 6000);
  assert.equal(prompt.messages.at(-1)?.content, question);
  for (const citation of prompt.citations) assert.ok(prompt.messages[0].content.includes(citation.text));
  assert.throws(() => tutorPrompt('Contexto'.repeat(1000), sources, [], question), /demasiado contexto/);
});
test('el historial persiste cifrado y las operaciones respetan las asignaturas', async () => {
  const { store, key, path } = await fixture();
  const subject = store.createSubject({ name: 'Materia privada', level: 'FP', teacher: '', goals: 'Aprender', color: 'sage' });
  const other = store.createSubject({ name: 'Otra materia', level: '', teacher: '', goals: '', color: 'blue' });
  const concept = store.createConcept({ subjectId: subject.id, name: 'Potencias de 2', description: '', prerequisiteIds: [] });
  assert.throws(() => store.createConcept({ subjectId: other.id, name: 'Otro', description: '', prerequisiteIds: [concept.id] }), /misma asignatura/);
  assert.equal(store.addMaterial(subject.id, 'Apuntes', 'txt', 'Un dato muy privado'), true);
  assert.equal(store.addMaterial(subject.id, 'Duplicado', 'txt', 'Un dato muy privado'), false);
  assert.equal(store.addMaterial(other.id, 'Apuntes', 'txt', 'Un dato muy privado'), true);
  const exercise = store.nextExercise(concept.id)!;
  const evidence = store.submitExercise({ exerciseId: exercise.id, conceptId: concept.id, answer: '32', hints: 0, durationSeconds: 15 });
  assert.equal(evidence.outcome, 'correct');
  assert.throws(() => store.submitExercise({ exerciseId: 'Subnetting:0', conceptId: concept.id, answer: '32', hints: 0, durationSeconds: 15 }), /no pertenece/);
  store.close();
  assert.equal((await readFile(path)).includes(Buffer.from('Un dato muy privado')), false);
  const reopened = await Store.open(path, key, wasm);
  assert.equal(reopened.snapshot().attempts[0].id, evidence.id);
  reopened.deleteSubject(subject.id);
  assert.equal(reopened.snapshot().concepts.length, 0);
  assert.equal(reopened.snapshot().attempts.length, 0);
  assert.equal(reopened.snapshot().materials.length, 1);
  reopened.close();
});
test('una importación inválida conserva el estado anterior y el borrado limpia el historial', async () => {
  const { store, path, key } = await fixture();
  store.createDemo(); const original = store.exportData();
  const modified = JSON.parse(original); modified.tables.concepts[0].subjectId = randomUUID();
  assert.throws(() => store.importData(JSON.stringify(modified)), /inexistente/);
  assert.equal(store.snapshot().subjects.length, 1);
  store.erase(); assert.equal(store.snapshot().subjects.length, 0);
  const cleared = decrypt(await readFile(path), key);
  assert.equal(cleared.includes(Buffer.from('SUBNETTING IPv4')), false);
  store.importData(original); assert.equal(store.snapshot().concepts.length, 3);
  store.close();
});
test('la importación de texto se realiza en el dispositivo y rechaza formatos no admitidos', async () => {
  const { store, directory } = await fixture(); store.close();
  const path = join(directory, 'apuntes.md'); await writeFile(path, '# Fracciones\nUna fracción representa una parte de un todo.');
  const material = await extractMaterial(path); assert.equal(material.kind, 'md'); assert.match(material.text, /Fracciones/);
  const invalid = join(directory, 'archivo.exe'); await writeFile(invalid, 'contenido');
  await assert.rejects(() => extractMaterial(invalid), /Formato no compatible/);
});

test('PDF y DOCX se extraen localmente y conservan las páginas del PDF', async () => {
  const { store, directory } = await fixture(); store.close();
  const { createImportFixtures } = await import('../scripts/fixtures.mjs');
  const files = await createImportFixtures(directory);
  const pdf = await extractMaterial(files.pdf); const docx = await extractMaterial(files.docx);
  assert.equal(pdf.pageCount, 2); assert.match(pdf.text, /Segunda pagina/); assert.equal(pdf.text.split('\f').length, 2);
  assert.match(docx.text, /Apuntes DOCX/); assert.equal(docx.kind, 'docx');
});
