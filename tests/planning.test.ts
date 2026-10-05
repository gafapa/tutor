import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdir, readFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import initSqlJs from 'sql.js';
import { Store } from '../electron/store';
import { decrypt, writeEncrypted } from '../electron/vault';
import { dailyPlan, reviewSchedule } from '../electron/planning';
import { estimate, getExercise } from '../electron/learning';
import { validateBackup, taskInput } from '../electron/validation';
import { addDays, dayKey, validDay } from '../shared/calendar';
import type { Attempt, Concept, StudyTask } from '../shared/types';

const wasm = resolve('node_modules/sql.js/dist/sql-wasm.wasm');
const now = new Date('2026-10-10T12:00:00.000Z');
function evidence(date: string, input: Partial<Attempt> = {}): Attempt {
  return { id: randomUUID(), subjectId: 'subject', conceptId: 'power', statement: '¿Cuánto es 2 elevado a 5?', answer: '32', expected: '32', feedback: '', outcome: 'correct', source: 'verified', hints: 0, durationSeconds: 10, createdAt: `${date}T12:00:00.000Z`, ...input };
}
const power: Concept = { id: 'power', subjectId: 'subject', name: 'Potencias de 2', description: '', position: 0, prerequisiteIds: [] };
const subnet: Concept = { ...power, id: 'subnet', name: 'Subnetting', position: 1, prerequisiteIds: ['power'] };
async function fixture() {
  const directory = resolve('.tools/test-data', randomUUID()); await mkdir(directory, { recursive: true });
  const path = join(directory, 'history.tutor'); const key = randomBytes(32);
  return { directory, path, key, store: await Store.open(path, key, wasm) };
}

test('los repasos avanzan por días independientes, conservan sus evidencias y se reinician tras una dificultad', () => {
  const attempts = [evidence('2026-10-05'), evidence('2026-10-05'), evidence('2026-10-05')];
  assert.equal(reviewSchedule(power, attempts, now)?.intervalDays, 1);
  attempts.push(evidence('2026-10-06'));
  assert.equal(reviewSchedule(power, attempts, now)?.intervalDays, 3);
  attempts.push(evidence('2026-10-07'));
  const review = reviewSchedule(power, attempts, now)!;
  assert.equal(review.intervalDays, 7); assert.equal(review.nextDate, '2026-10-14');
  assert.ok(review.evidenceIds.every(id => attempts.some(a => a.id === id)));
  attempts.push(evidence('2026-10-08', { hints: 1 }));
  assert.equal(reviewSchedule(power, attempts, now)?.intervalDays, 1);
  attempts.push(evidence('2026-10-09', { outcome: 'incorrect' }));
  assert.equal(reviewSchedule(power, attempts, now)?.nextDate, '2026-10-10');
  attempts.push(evidence('2026-10-10', { source: 'self' }));
  assert.equal(reviewSchedule(power, attempts, now)?.nextDate, '2026-10-10');
  attempts.push(evidence('2027-01-01'));
  assert.equal(reviewSchedule(power, attempts, now)?.nextDate, '2026-10-10');
  assert.equal(reviewSchedule(power, [evidence('2026-10-10', { source: 'self' })], now), null);
});

test('repetir una única pregunta en varios días no demuestra dominio de un concepto', () => {
  const attempts = Array.from({ length: 6 }, (_, index) => evidence(dayKey(new Date(Date.now() - index * 86400000))));
  assert.equal(estimate(power.id, attempts).status, 'progress');
});

test('el orden de los intentos decide la evidencia más reciente cuando comparten fecha', () => {
  const attempts = [evidence('2026-10-08'), evidence('2026-10-09'), evidence('2026-10-10'), evidence('2026-10-10', { outcome: 'incorrect' })];
  const review = reviewSchedule(power, attempts, now)!;
  assert.equal(review.intervalDays, 1); assert.deepEqual(review.evidenceIds, [attempts[3].id]);
  assert.equal(estimate(power.id, attempts,now).evidenceIds[0], attempts[3].id);
});

test('los nombres de conceptos no acceden a propiedades heredadas del banco', () => {
  assert.equal(getExercise({ ...power, name: 'toString' }, 0), null);
  assert.equal(getExercise({ ...power, name: '__proto__' }, 0), null);
});

test('el plan respeta el presupuesto, prioriza la fecha y propone comprobar prerrequisitos sin diagnosticar una dificultad inexistente', () => {
  const attempts = [evidence('2026-10-08', { conceptId: subnet.id, outcome: 'incorrect' }), evidence('2026-10-09', { conceptId: subnet.id, outcome: 'incorrect' })];
  const concepts = [power, subnet]; const estimates = concepts.map(c => estimate(c.id, attempts));
  const reviews = concepts.flatMap(c => { const review = reviewSchedule(c, attempts, now); return review ? [review] : []; });
  const task: StudyTask = { id: 'task', subjectId: 'subject', title: 'Entrega para hoy', notes: '', dueDate: '2026-10-10', conceptIds: [], estimatedMinutes: 15, status: 'pending', createdAt: now.toISOString(), completedAt: null };
  const plan = dailyPlan('subject', concepts, estimates, reviews, [task, { ...task, id: 'foreign', subjectId: 'other' }], [], 20, now);
  assert.equal(plan.items[0].targetId, task.id);
  assert.equal(plan.items[1].targetId, power.id);
  assert.equal(plan.items[1].minutes, 5); assert.match(plan.items[1].reason, /todavía no sabemos/);
  assert.ok(plan.items.every(item => item.subjectId === 'subject'));
  assert.equal(plan.items.reduce((sum, item) => sum + item.minutes, 0), 20);
  const withoutTask = dailyPlan('subject', concepts, estimates, reviews, [], [], 20, now);
  assert.deepEqual(withoutTask.items.map(item => item.targetId), [power.id, subnet.id]);
  assert.ok(withoutTask.items[1].evidenceIds.every(id => attempts.some(a => a.id === id)));
  assert.equal(dailyPlan('subject', [], [], [], [], [], 20, now).items.length, 0);
});

test('las fechas se validan y los intervalos usan días de calendario', () => {
  assert.equal(validDay('2026-02-29'), false); assert.equal(validDay('2028-02-29'), true);
  assert.equal(validDay('2026-13-01'), false); assert.equal(validDay('2026-10-01'), true);
  assert.equal(addDays('2026-03-28', 2), '2026-03-30');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(taskInput.safeParse({ subjectId: randomUUID(), title: 'Tarea', notes: '', dueDate: '2026-02-30', conceptIds: [], estimatedMinutes: 20 }).success, false);
});

test('el diagnóstico adapta el recorrido, se reanuda y guarda respuestas sin duplicarlas', async () => {
  const { path, key, store } = await fixture(); const subject = store.createDemo();
  const concepts = store.snapshot().concepts;
  const ratings = concepts.map(c => ({ conceptId: c.id, rating: 'confident' as const }));
  let view = store.startDiagnostic({ subjectId: subject.id, selfRatings: ratings });
  const sessionId = view.session.id;
  assert.match(view.exercise!.id, /^Subnetting:0$/);
  assert.equal('answer' in view.exercise!, false);
  const first = { id: sessionId, conceptId: view.exercise!.conceptId, exerciseId: view.exercise!.id, answer: '63', durationSeconds: 10 };
  view = store.answerDiagnostic(first);
  assert.match(view.exercise!.id, /^Potencias de 2:0$/);
  const invalidNext = JSON.parse(store.exportData());
  invalidNext.tables.diagnostics[0].current.exerciseId = 'Potencias de 2:1';
  assert.throws(() => validateBackup(JSON.stringify(invalidNext)), /siguiente pregunta incompatible/);
  assert.throws(() => store.answerDiagnostic(first), /ya se ha contestado/);
  assert.equal(store.snapshot().attempts.length, 1);
  assert.equal(store.startDiagnostic({ subjectId: subject.id, selfRatings: ratings }).session.id, sessionId);
  store.close();
  const reopened = await Store.open(path, key, wasm);
  view = reopened.diagnostic(sessionId);
  assert.equal(view.session.responses.length, 1);
  const answers: Record<string, string> = { 'Potencias de 2:0': '32', 'Potencias de 2:1': '64', 'Sistema binario:0': '10', 'Sistema binario:1': '1101', 'Subnetting:1': '30' };
  while (view.exercise) view = reopened.answerDiagnostic({ id: sessionId, conceptId: view.exercise.conceptId, exerciseId: view.exercise.id, answer: answers[view.exercise.id], durationSeconds: 12 });
  assert.equal(view.session.status, 'completed'); assert.equal(view.session.responses.length, 6);
  const snapshot = reopened.snapshot();
  assert.equal(snapshot.attempts.length, 6); assert.equal(snapshot.estimates.filter(e => e.status === 'consolidated').length, 0);
  assert.ok(snapshot.attempts.every(a => a.purpose === 'diagnostic' && a.source === 'verified' && a.hints === 0));
  assert.ok(snapshot.estimates.every(e => e.confidence === 'low'));
  reopened.reflectDiagnostic({ id: sessionId, reflection: 'He confundido direcciones totales y hosts.' });
  const backup = reopened.exportData(); reopened.erase(); reopened.importData(backup);
  assert.equal(reopened.diagnostic(sessionId).session.reflection, 'He confundido direcciones totales y hosts.');
  assert.equal(reopened.snapshot().reviews.length, 3);
  const corrupt = JSON.parse(backup); corrupt.tables.diagnostics[0].responses[0].attemptId = randomUUID();
  assert.throws(() => validateBackup(JSON.stringify(corrupt)), /evidencia de diagnóstico/);
  reopened.close();
});

test('interrumpir conserva las evidencias y permite iniciar otro recorrido', async () => {
  const { store } = await fixture(); const subject = store.createDemo();
  const ratings = store.snapshot().concepts.map(c => ({ conceptId: c.id, rating: 'unsure' as const }));
  let view = store.startDiagnostic({ subjectId: subject.id, selfRatings: ratings });
  view = store.answerDiagnostic({ id: view.session.id, conceptId: view.exercise!.conceptId, exerciseId: view.exercise!.id, answer: '64', durationSeconds: 15 });
  store.cancelDiagnostic(view.session.id);
  assert.equal(store.diagnostic(view.session.id).session.status, 'cancelled'); assert.equal(store.snapshot().attempts.length, 1);
  assert.equal(store.diagnostic(view.session.id).exercise, null);
  assert.notEqual(store.startDiagnostic({ subjectId: subject.id, selfRatings: ratings }).session.id, view.session.id);
  assert.throws(() => store.startDiagnostic({ subjectId: randomUUID(), selfRatings: [] }), /asignatura/);
  store.close();
});

test('las tareas son independientes del dominio, respetan la asignatura y sobreviven a las copias', async () => {
  const { store } = await fixture(); const subject = store.createDemo(); const concept = store.snapshot().concepts[0];
  const other = store.createSubject({ name: 'Otra materia', level: '', teacher: '', goals: '', color: 'blue' });
  const input = { subjectId: subject.id, title: 'Preparar una prueba', notes: 'Revisar apuntes', dueDate: dayKey(), conceptIds: [concept.id], estimatedMinutes: 30 };
  assert.throws(() => store.createTask({ ...input, subjectId: other.id }), /misma asignatura/);
  const task = store.createTask(input);
  assert.equal(store.snapshot().plans.find(p => p.subjectId === subject.id)!.items[0].targetId, task.id);
  store.completeTask({ id: task.id, completed: true });
  assert.equal(store.snapshot().attempts.length, 0); assert.equal(store.snapshot().tasks[0].status, 'completed');
  store.completeTask({ id: task.id, completed: false });
  store.updateTask({ ...input, id: task.id, dueDate: addDays(dayKey(), 2), title: 'Repasar dos bloques' });
  assert.equal(store.snapshot().tasks[0].title, 'Repasar dos bloques');
  assert.throws(() => store.updateTask({ ...input, id: task.id, subjectId: other.id }), /trasladarse/);
  const backup = store.exportData(); store.erase(); store.importData(backup);
  assert.equal(store.snapshot().tasks.length, 1);
  store.deleteSubject(subject.id); assert.equal(store.snapshot().tasks.length, 0);
  store.close();
});

test('las copias 0.1 y la base de datos anterior se actualizan conservando los intentos', async () => {
  const { store, path, key } = await fixture(); const subject = store.createDemo(); const concept = store.snapshot().concepts[0];
  store.submitExercise({ conceptId: concept.id, exerciseId: 'Potencias de 2:0', answer: '32', hints: 0, durationSeconds: 20 });
  const oldBackup = JSON.parse(store.exportData()); oldBackup.version = 1;
  delete oldBackup.tables.diagnostics; delete oldBackup.tables.tasks;
  for (const table of ['curriculum', 'units', 'flashcards', 'card_revisions', 'card_reviews', 'portfolio']) delete oldBackup.tables[table];
  oldBackup.tables.attempts.forEach((a: Attempt) => delete a.purpose);
  store.importData(JSON.stringify(oldBackup));
  assert.equal(store.snapshot().attempts[0].purpose, 'practice');
  store.close();
  const sql = await initSqlJs({ locateFile: () => wasm }); const oldDB = new sql.Database(decrypt(await readFile(path), key));
  oldDB.run('DROP TABLE diagnostics; DROP TABLE tasks; PRAGMA user_version = 1;');
  for (const table of ['curriculum', 'units', 'flashcards', 'card_revisions', 'card_reviews', 'portfolio']) oldDB.run(`DROP TABLE ${table}`);
  writeEncrypted(path, oldDB.export(), key); oldDB.close();
  const reopened = await Store.open(path, key, wasm);
  assert.equal(reopened.snapshot().subjects[0].id, subject.id); assert.equal(reopened.snapshot().attempts.length, 1);
  assert.equal(reopened.snapshot().diagnostics.length, 0); assert.equal(reopened.snapshot().tasks.length, 0);
  reopened.createTask({ subjectId: subject.id, title: 'Nueva tarea', notes: '', dueDate: dayKey(), conceptIds: [], estimatedMinutes: 10 });
  assert.equal(reopened.snapshot().tasks.length, 1); reopened.close();
});
