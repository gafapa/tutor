import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import initSqlJs from 'sql.js';
import { Store } from '../electron/store';
import { sessionElapsed, sessionRemaining, type SessionInput } from '../shared/study';
import { stopSession } from '../electron/study';
import { validateBackup } from '../electron/validation';
import { decrypt, writeEncrypted } from '../electron/vault';

const wasm = resolve('node_modules/sql.js/dist/sql-wasm.wasm');
async function fixture() {
  const directory = resolve('.tools/test-data', randomUUID()); await mkdir(directory, { recursive: true });
  const path = join(directory, 'history.tutor'); const key = randomBytes(32);
  const store = await Store.open(path, key, wasm); const subject = store.createDemo(); const concept = store.snapshot().concepts[0];
  const input: SessionInput = { subjectId: subject.id, goal: 'Explicar las combinaciones de cuatro bits.', minutes: 10, conceptIds: [concept.id], unitId: null, taskId: null, materialIds: [store.snapshot().materials[0].id] };
  return { store, subject, concept, input, path, key };
}
test('las sesiones conservan objetivo, pausas, tiempo y revisión sin convertir una percepción en dominio', async () => {
  const { store, input, subject } = await fixture();
  try {
    const start = new Date(Date.now() - 120000);
    const session = store.startSession(input, start);
    assert.equal(store.snapshot().plans[0].items[0].kind, 'session');
    assert.throws(() => store.startSession(input), /Pausa/);
    store.pauseSession(session.id, new Date(start.getTime() + 60000));
    assert.equal(sessionElapsed(store.snapshot().studySessions[0]), 60000);
    assert.equal(sessionRemaining(store.snapshot().studySessions[0]), 540000);
    store.resumeSession(session.id, new Date(start.getTime() + 90000));
    store.finishSession(session.id, new Date(start.getTime() + 110000));
    const stopped = store.snapshot().studySessions[0];
    assert.equal(stopped.status, 'review'); assert.equal(sessionElapsed(stopped), 80000);
    assert.deepEqual(stopped.intervals.map(span => span.reason), ['pause', 'finish']);
    assert.throws(() => store.completeSession({ id: session.id, review: { learned: '', difficulty: '', nextStep: 'Seguir', selfRating: 'confident' } }));
    store.completeSession({ id: session.id, review: { learned: 'Puedo explicar el significado de una potencia de dos.', difficulty: 'Necesito distinguir bits y direcciones.', nextStep: 'Probar dos ejercicios de redes.', selfRating: 'confident' } });
    assert.equal(store.snapshot().studySessions[0].status, 'completed');
    assert.equal(store.snapshot().estimates[0].status, 'unseen');
    assert.equal(store.snapshot().attempts.length, 0);
    assert.throws(() => store.resumeSession(session.id), /terminado/);
    assert.throws(() => store.completeSession({ id: session.id, review: stopped.review! }), /./);
    validateBackup(store.exportData());
    store.deleteSubject(subject.id); assert.equal(store.snapshot().studySessions.length, 0);
  } finally { store.close(); }
});
test('los ejercicios y tarjetas realizados en marcha se vinculan; los posteriores a una pausa se conservan fuera de ella', async () => {
  const { store, input, subject, concept } = await fixture();
  try {
    const card = store.createFlashcard({ subjectId: subject.id, conceptId: concept.id, front: '¿Qué es una potencia?', back: 'Un producto de factores iguales.' });
    const session = store.startSession(input, new Date(Date.now() - 100));
    const submit = () => store.submitExercise({ conceptId: concept.id, exerciseId: 'Potencias de 2:0', answer: '32', hints: 0, durationSeconds: 1 });
    const attempt = submit(); const review = store.reviewFlashcard({ id: card.id, rating: 'good' });
    store.pauseSession(session.id);
    const another = submit(); store.reviewFlashcard({ id: card.id, rating: 'again' });
    assert.deepEqual(store.snapshot().studySessions[0].attemptIds, [attempt.id]);
    assert.deepEqual(store.snapshot().studySessions[0].cardReviewIds, [review.id]);
    assert.ok(store.snapshot().attempts.some(a => a.id === another.id));
    const foreign = store.createSubject({ name: 'Otra materia', level: '', teacher: '', goals: '', color: 'blue' });
    assert.throws(() => store.startSession({ ...input, subjectId: foreign.id }), /misma asignatura/);
    validateBackup(store.exportData());
    store.deleteFlashcard(card.id); assert.deepEqual(store.snapshot().studySessions[0].cardReviewIds, []);
    store.deleteMaterial(input.materialIds[0]); assert.deepEqual(store.snapshot().studySessions[0].materials, []);
    validateBackup(store.exportData());
  } finally { store.close(); }
});
test('el presupuesto se agota exactamente y las pausas no consumen minutos', async () => {
  const { store, input } = await fixture();
  try {
    const start = new Date(Date.now() - 3600000); const session = store.startSession(input, start);
    store.pauseSession(session.id, new Date(start.getTime() + 300000));
    store.resumeSession(session.id, new Date(start.getTime() + 1200000));
    store.tickStudy(new Date(start.getTime() + 3600000));
    const row = store.snapshot().studySessions[0];
    assert.equal(row.status, 'review'); assert.equal(sessionElapsed(row), 600000);
    assert.equal(sessionRemaining(row), 0);
    assert.equal(row.intervals[1].endedAt, new Date(start.getTime() + 1500000).toISOString());
    assert.equal(row.intervals[1].reason, 'timeout');
    assert.throws(() => store.resumeSession(row.id), /revisión/);
    assert.equal(stopSession(session, 'pause', new Date(start.getTime() - 5000)).intervals[0].endedAt, start.toISOString());
    validateBackup(store.exportData());
  } finally { store.close(); }
});
test('cerrar y recuperar una interrupción conservan tiempo confirmado y excluyen el tiempo con la app cerrada', async () => {
  const { store, input, path, key } = await fixture();
  const start = new Date(Date.now() - 30000); store.startSession(input, start);
  store.tickStudy(new Date(start.getTime() + 15000));
  const checkpoint = await readFile(path);
  store.close();
  const graceful = await Store.open(path, key, wasm);
  assert.equal(graceful.snapshot().studySessions[0].status, 'paused');
  assert.equal(graceful.snapshot().studySessions[0].intervals[0].reason, 'closed');
  assert.ok(sessionElapsed(graceful.snapshot().studySessions[0]) >= 30000); graceful.close();
  // Restore the last committed checkpoint to simulate a process killed before before-quit.
  await writeFile(path, checkpoint);
  const recovered = await Store.open(path, key, wasm);
  try {
    const row = recovered.snapshot().studySessions[0];
    assert.equal(row.status, 'paused'); assert.equal(row.intervals[0].reason, 'recovered');
    assert.equal(sessionElapsed(row), 15000);
    assert.equal(sessionElapsed(row, new Date(Date.now() + 86400000)), 15000);
    assert.ok(recovered.snapshot().events.some(e => e.type === 'study.recovered'));
    validateBackup(recovered.exportData());
  } finally { recovered.close(); }
});
test('restaurar valida intervalos, estados, fuentes y pertenencia temporal de las evidencias antes de reemplazar el historial', async () => {
  const { store, input, concept } = await fixture();
  try {
    const row = store.startSession(input, new Date(Date.now() - 10000));
    store.submitExercise({ conceptId: concept.id, exerciseId: 'Potencias de 2:0', answer: '32', hints: 0, durationSeconds: 1 });
    store.pauseSession(row.id); const original = store.exportData();
    const reject = (change: (value: any) => void) => { const value = JSON.parse(original); change(value); assert.throws(() => store.importData(JSON.stringify(value))); assert.deepEqual(JSON.parse(store.exportData()).tables, JSON.parse(original).tables); };
    reject(value => { value.tables.study_sessions[0].intervals[0].endedAt = new Date(Date.now() + 3600000).toISOString(); });
    reject(value => { value.tables.study_sessions[0].status = 'completed'; });
    reject(value => { value.tables.study_sessions[0].attemptIds.push(value.tables.study_sessions[0].attemptIds[0]); });
    reject(value => { value.tables.study_sessions[0].intervals[0].startedAt = new Date(Date.now() + 3600000).toISOString(); });
    reject(value => { value.tables.study_sessions[0].materials[0].version = 99; });
    store.erase(); store.importData(original); assert.equal(store.snapshot().studySessions[0].id, row.id);
    assert.equal(store.snapshot().studySessions[0].attemptIds.length, 1);
    validateBackup(store.exportData());
  } finally { store.close(); }
});
test('las bases y copias 0.3 migran a sesiones sin fabricar actividad', async () => {
  const { store, input, path, key } = await fixture();
  const previous = JSON.parse(store.exportData()); previous.version = 3; delete previous.tables.study_sessions;
  store.importData(JSON.stringify(previous)); assert.equal(store.snapshot().studySessions.length, 0);
  store.close();
  const sql = await initSqlJs({ locateFile: () => wasm }); const db = new sql.Database(decrypt(await readFile(path), key));
  db.run('DROP TABLE study_sessions; PRAGMA user_version = 3'); writeEncrypted(path, db.export(), key); db.close();
  const reopened = await Store.open(path, key, wasm);
  try {
    assert.equal(reopened.snapshot().studySessions.length, 0);
    const session = reopened.startSession(input); reopened.cancelSession(session.id);
    assert.equal(reopened.snapshot().attempts.length, 0);
    assert.equal(reopened.snapshot().studySessions[0].status, 'cancelled');
    validateBackup(reopened.exportData());
  } finally { reopened.close(); }
});
