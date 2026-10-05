import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdir, readFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import initSqlJs from 'sql.js';
import { Store } from '../electron/store';
import { scheduleCard, assertAcyclic } from '../electron/education';
import { validateBackup } from '../electron/validation';
import { decrypt, writeEncrypted } from '../electron/vault';
import type { CardReview, Flashcard, UnitInput } from '../shared/education';
import type { Attempt } from '../shared/types';

const wasm = resolve('node_modules/sql.js/dist/sql-wasm.wasm');
const newTables = ['curriculum', 'units', 'flashcards', 'card_revisions', 'card_reviews', 'portfolio'];
async function fixture() {
  const directory = resolve('.tools/test-data', randomUUID()); await mkdir(directory, { recursive: true });
  const path = join(directory, 'history.tutor'); const key = randomBytes(32);
  const store = await Store.open(path, key, wasm); const subject = store.createDemo();
  const concept = store.snapshot().concepts[0];
  return { store, subject, concept, path, key };
}
function unit(subjectId: string, input: Partial<UnitInput> = {}): UnitInput {
  return { subjectId, title: 'Unidad 1', objectives: 'Interpretar las potencias de dos.', startsOn: '2026-10-01', endsOn: '2026-10-10', status: 'current', prerequisiteIds: [], conceptIds: [], curriculumIds: [], materialIds: [], ...input };
}
function submit(store: Store, conceptId: string, answer = '32', hints = 0) {
  return store.submitExercise({ conceptId, exerciseId: 'Potencias de 2:0', answer, hints, durationSeconds: 12 });
}

test('el currículo admite sus cuatro tipos y enlaza tareas y unidades con referencias de la misma asignatura', async () => {
  const { store, subject, concept } = await fixture();
  try {
    const curriculum = (['competency', 'criterion', 'content', 'outcome'] as const).map(kind => store.saveCurriculum({ subjectId: subject.id, kind, code: kind, title: `Elemento ${kind}`, description: '', conceptIds: [concept.id], relatedIds: [] }));
    const related = store.saveCurriculum({ ...curriculum[1], relatedIds: [curriculum[0].id] });
    const lesson = store.saveUnit(unit(subject.id, { conceptIds: [concept.id], curriculumIds: [related.id], materialIds: [store.snapshot().materials[0].id] }));
    store.createTask({ subjectId: subject.id, title: 'Actividad curricular', notes: '', dueDate: '2026-10-10', conceptIds: [concept.id], estimatedMinutes: 20, unitId: lesson.id, curriculumIds: [related.id] });
    assert.equal(store.snapshot().curriculum.length, 4);
    assert.equal(store.snapshot().tasks[0].unitId, lesson.id);
    const foreign = store.createSubject({ name: 'Otra materia', level: '', teacher: '', goals: '', color: 'blue' });
    assert.throws(() => store.saveCurriculum({ ...related, subjectId: foreign.id }), /trasladar/);
    assert.throws(() => store.saveCurriculum({ subjectId: foreign.id, kind: 'content', code: '', title: 'No mezclar', description: '', conceptIds: [concept.id], relatedIds: [] }), /misma asignatura/);
    assert.throws(() => store.createTask({ subjectId: foreign.id, title: 'No mezclar', notes: '', dueDate: '2026-10-10', conceptIds: [], estimatedMinutes: 20, unitId: lesson.id, curriculumIds: [] }), /misma asignatura/);
    store.deleteCurriculum(related.id);
    assert.deepEqual(store.snapshot().units[0].curriculumIds, []);
    assert.deepEqual(store.snapshot().tasks[0].curriculumIds, []);
    store.deleteCurriculum(curriculum[0].id);
    validateBackup(store.exportData());
  } finally { store.close(); }
});

test('la secuencia rechaza fechas imposibles, ciclos y órdenes que rompen prerrequisitos; borrar limpia sus enlaces', async () => {
  const { store, subject } = await fixture();
  try {
    assert.throws(() => store.saveUnit(unit(subject.id, { startsOn: '2026-02-30' })));
    assert.throws(() => store.saveUnit(unit(subject.id, { endsOn: '2026-09-30' })), /fecha final/);
    const first = store.saveUnit(unit(subject.id));
    const second = store.saveUnit(unit(subject.id, { title: 'Unidad 2', prerequisiteIds: [first.id] }));
    const third = store.saveUnit(unit(subject.id, { title: 'Unidad 3' }));
    const original = store.exportData();
    assert.throws(() => store.saveUnit({ ...first, prerequisiteIds: [second.id] }), /ciclo/);
    assert.throws(() => store.reorderUnits({ subjectId: subject.id, ids: [second.id, first.id, third.id] }), /prerrequisitos/);
    assert.throws(() => store.reorderUnits({ subjectId: subject.id, ids: [first.id, first.id, third.id] }), /exactamente/);
    assert.deepEqual(JSON.parse(store.exportData()).tables, JSON.parse(original).tables);
    store.reorderUnits({ subjectId: subject.id, ids: [third.id, first.id, second.id] });
    assert.equal(store.snapshot().units.find(u => u.id === third.id)?.position, 0);
    store.createTask({ subjectId: subject.id, title: 'Actividad de unidad', notes: '', dueDate: '2026-10-10', conceptIds: [], estimatedMinutes: 20, unitId: first.id });
    store.deleteUnit(first.id);
    assert.equal(store.snapshot().tasks[0].unitId, null);
    assert.deepEqual(store.snapshot().units.find(u => u.id === second.id)?.prerequisiteIds, []);
    assert.deepEqual(store.snapshot().units.map(u => u.position).sort(), [0, 1]);
    assertAcyclic(Array.from({ length: 10000 }, (_, index) => ({ id: String(index), prerequisiteIds: index ? [String(index - 1)] : [] })));
    validateBackup(store.exportData());
  } finally { store.close(); }
});

test('las tarjetas de materiales conservan fragmentos, página y versión y requieren aprobación antes de repasar', async () => {
  const { store, subject, concept } = await fixture();
  try {
    store.addMaterial(subject.id, 'Dos páginas', 'txt', 'Potencias de 2\nLas potencias de dos permiten contar las combinaciones que representan varios bits.\fSistema binario\nEl sistema binario representa números utilizando solamente los dígitos cero y uno.', 2);
    const material = store.snapshot().materials.at(-1)!;
    assert.equal(store.generateFlashcards({ subjectId: subject.id, materialId: material.id }), 2);
    assert.equal(store.generateFlashcards({ subjectId: subject.id, materialId: material.id }), 0);
    const cards = store.snapshot().flashcards;
    assert.deepEqual(cards.map(c => c.source?.page), [1, 2]);
    assert.ok(cards.every(c => !c.approved && c.source?.materialVersion === 1 && c.back === c.source.quote));
    assert.equal(cards[0].conceptId, concept.id);
    assert.throws(() => store.reviewFlashcard({ id: cards[0].id, rating: 'good' }), /aprueba/);
    store.approveFlashcard({ id: cards[0].id, approved: true });
    store.reviewFlashcard({ id: cards[0].id, rating: 'easy' });
    assert.equal(store.snapshot().cardSchedules[0].intervalDays, 1);
    assert.equal(store.snapshot().attempts.length, 0);
    assert.equal(store.snapshot().estimates[0].status, 'unseen');
    store.addMaterial(subject.id, material.name, 'txt', material.text + '\nUn contenido nuevo de la segunda versión que sigue conservando la fuente anterior.', 2);
    const currentMaterial = store.snapshot().materials.at(-1)!;
    assert.equal(currentMaterial.version, 2);
    assert.equal(store.snapshot().flashcards[0].source?.materialId, material.id);
    assert.ok(store.generateFlashcards({ subjectId: subject.id, materialId: currentMaterial.id }) > 0);
    validateBackup(store.exportData());
  } finally { store.close(); }
});

test('solo los errores comprobados producen tarjetas de error, con un enlace a la corrección original', async () => {
  const { store, subject, concept } = await fixture();
  try {
    store.saveAttempt({ subjectId: subject.id, conceptId: concept.id, statement: 'Error percibido', answer: '?', feedback: '', outcome: 'incorrect', hints: 0, durationSeconds: 1 });
    assert.equal(store.generateFlashcards({ subjectId: subject.id, fromErrors: true }), 0);
    const attempt = submit(store, concept.id, '31');
    assert.equal(store.generateFlashcards({ subjectId: subject.id, fromErrors: true }), 1);
    const card = store.snapshot().flashcards[0];
    assert.equal(card.front, attempt.statement);
    assert.equal(card.back, `Respuesta: ${attempt.expected}\n\n${attempt.feedback}`);
    assert.deepEqual(card.evidenceIds, [attempt.id]);
    const foreign = store.createSubject({ name: 'Otra materia', level: '', teacher: '', goals: '', color: 'blue' });
    assert.equal(store.generateFlashcards({ subjectId: foreign.id, fromErrors: true }), 0);
    validateBackup(store.exportData());
  } finally { store.close(); }
});

test('editar una tarjeta mantiene revisiones anteriores, cambia su origen y reinicia su calendario', async () => {
  const { store, subject, concept, path, key } = await fixture();
  const material = store.snapshot().materials[0];
  store.generateFlashcards({ subjectId: subject.id, materialId: material.id });
  const card = store.snapshot().flashcards[0];
  store.approveFlashcard({ id: card.id, approved: true });
  store.reviewFlashcard({ id: card.id, rating: 'good' });
  store.editFlashcard({ id: card.id, front: '¿Qué significa 2 elevado a n?', back: 'El número de combinaciones de n bits.', conceptId: concept.id });
  assert.equal(store.snapshot().flashcards[0].revision, 2);
  assert.equal(store.snapshot().flashcards[0].approved, false);
  assert.equal(store.snapshot().flashcards[0].origin, 'manual');
  assert.equal(store.snapshot().flashcards[0].source, null);
  store.approveFlashcard({ id: card.id, approved: true });
  assert.equal(store.snapshot().cardSchedules[0].reviewCount, 0);
  assert.equal(store.snapshot().cardReviews[0].revision, 1);
  assert.equal(store.snapshot().cardRevisions.filter(r => r.cardId === card.id)[0].back, card.back);
  validateBackup(store.exportData()); store.close();
  const reopened = await Store.open(path, key, wasm);
  try {
    assert.equal(reopened.snapshot().cardRevisions.filter(r => r.cardId === card.id).length, 2);
    assert.equal(reopened.snapshot().cardReviews.length, 1);
    reopened.deleteMaterial(material.id);
    assert.equal(reopened.snapshot().flashcards.length, 0);
    assert.equal(reopened.snapshot().cardRevisions.length, 0);
    assert.equal(reopened.snapshot().cardReviews.length, 0);
    assert.equal(decrypt(await readFile(path), key).includes(Buffer.from('Una potencia de 2 representa')), false);
    validateBackup(reopened.exportData());
  } finally { reopened.close(); }
});

test('el calendario de tarjetas usa días independientes y versiones; una dificultad reinicia el intervalo', () => {
  const now = new Date('2026-10-10T12:00:00.000Z');
  const card = { id: 'card', revision: 2 } as Flashcard;
  const review = (day: string, input: Partial<CardReview> = {}): CardReview => ({ id: randomUUID(), subjectId: 'subject', cardId: 'card', revision: 2, rating: 'good', createdAt: `${day}T12:00:00.000Z`, ...input });
  const reviews = [review('2026-10-05'), review('2026-10-05'), review('2026-10-05')];
  assert.equal(scheduleCard(card, reviews, now).intervalDays, 1);
  reviews.push(review('2026-10-06'), review('2026-10-07', { rating: 'easy' }));
  assert.equal(scheduleCard(card, reviews, now).intervalDays, 7);
  assert.equal(scheduleCard(card, reviews, now).dueDate, '2026-10-14');
  reviews.push(review('2026-10-08', { rating: 'hard' }));
  assert.equal(scheduleCard(card, reviews, now).intervalDays, 1);
  reviews.push(review('2026-10-09', { rating: 'again' }));
  assert.equal(scheduleCard(card, reviews, now).dueDate, '2026-10-09');
  reviews.push(review('2026-10-10', { revision: 1 }), review('2027-01-01'));
  assert.equal(scheduleCard(card, reviews, now).reviewCount, 7);
  reviews.push(review('2026-10-10'));
  assert.equal(scheduleCard(card, reviews, now).intervalDays, 1);
});

test('el portfolio automático guarda únicamente aciertos autónomos y permite selecciones personales sin alterar el dominio', async () => {
  const { store, subject, concept } = await fixture();
  try {
    store.saveAttempt({ subjectId: subject.id, conceptId: concept.id, statement: 'Me parece correcto', answer: '32', feedback: '', outcome: 'correct', hints: 0, durationSeconds: 1 });
    submit(store, concept.id, '32', 1);
    assert.equal(store.snapshot().portfolio.length, 0);
    const attempt = submit(store, concept.id);
    submit(store, concept.id);
    assert.equal(store.snapshot().portfolio.length, 1);
    assert.deepEqual(store.snapshot().portfolio[0].evidenceIds, [attempt.id]);
    const personal = store.savePortfolio({ subjectId: subject.id, title: 'Mi proyecto', kind: 'project', content: 'Una explicación de mi trabajo', reflection: 'Necesito leer con atención.', conceptIds: [concept.id], evidenceIds: [attempt.id] });
    assert.equal(personal.automatic, false);
    assert.equal(store.snapshot().estimates[0].status, 'progress');
    assert.ok(store.snapshot().events.some(e => e.type === 'learning.estimate_changed'));
    assert.equal(store.snapshot().events.filter(e => e.type === 'concept.mastered').length, 0);
    const attempts = store.snapshot().attempts.length;
    store.deletePortfolio(personal.id);
    assert.equal(store.snapshot().attempts.length, attempts);
    validateBackup(store.exportData());
  } finally { store.close(); }
});

test('la restauración rechaza fuentes, revisiones y portfolios falsificados antes de modificar los datos', async () => {
  const { store, subject, concept } = await fixture();
  try {
    store.generateFlashcards({ subjectId: subject.id, materialId: store.snapshot().materials[0].id });
    const card = store.snapshot().flashcards[0]; store.approveFlashcard({ id: card.id, approved: true }); store.reviewFlashcard({ id: card.id, rating: 'good' });
    submit(store, concept.id);
    const original = store.exportData();
    const mutate = (change: (tables: any) => void) => { const backup = JSON.parse(original); change(backup.tables); assert.throws(() => store.importData(JSON.stringify(backup))); assert.deepEqual(JSON.parse(store.exportData()).tables, JSON.parse(original).tables); };
    mutate(t => { t.flashcards[0].source.quote = 'Un fragmento inventado'; t.flashcards[0].back = 'Un fragmento inventado'; });
    mutate(t => { t.card_revisions.splice(0, 1); });
    mutate(t => { t.card_reviews[0].revision = 99; });
    mutate(t => { t.portfolio[0].content = 'Trabajo que no corresponde a la evidencia'; });
    mutate(t => { t.portfolio[0].conceptIds = []; });
    const before = store.snapshot(); store.erase(); store.importData(original);
    const after = store.snapshot();
    for (const key of ['flashcards', 'cardReviews', 'cardRevisions', 'portfolio'] as const) assert.deepEqual(after[key], before[key]);
    store.deleteSubject(subject.id);
    const erased = store.snapshot();
    for (const key of ['curriculum', 'units', 'flashcards', 'cardReviews', 'cardRevisions', 'portfolio', 'events'] as const) assert.equal(erased[key].length, 0);
  } finally { store.close(); }
});

test('los cambios de dominio conservan estados anteriores y emiten consolidación y recuperación con evidencias', async () => {
  const { store, concept } = await fixture();
  try {
    for (const [index, answer] of ['32', '64', '7'].entries()) store.submitExercise({ conceptId: concept.id, exerciseId: `Potencias de 2:${index}`, answer, hints: 0, durationSeconds: 12 });
    const history = JSON.parse(store.exportData());
    const dates = new Map<string, string>();
    history.tables.attempts.forEach((attempt: Attempt, index: number) => {
      attempt.createdAt = new Date(Date.now() - (3 - index) * 86400000).toISOString(); dates.set(attempt.id, attempt.createdAt);
    });
    history.tables.portfolio.forEach((entry: { evidenceIds: string[]; createdAt: string }) => { entry.createdAt = dates.get(entry.evidenceIds[0])!; });
    store.importData(JSON.stringify(history));
    store.submitExercise({ conceptId: concept.id, exerciseId: 'Potencias de 2:3', answer: '16', hints: 0, durationSeconds: 12 });
    const snapshot = store.snapshot();
    assert.equal(snapshot.estimates[0].status, 'consolidated');
    const mastered = snapshot.events.find(e => e.type === 'concept.mastered')!;
    assert.deepEqual(mastered.payload.evidenceIds, snapshot.estimates[0].evidenceIds);
    const change = snapshot.events.filter(e => e.type === 'learning.estimate_changed').at(-1)!;
    assert.equal((change.payload.before as { status: string }).status, 'progress');
    assert.equal((change.payload.after as { status: string }).status, 'consolidated');
    const immutable = JSON.stringify(change);
    submit(store, concept.id, '31'); submit(store, concept.id, '31');
    assert.equal(store.snapshot().estimates[0].status, 'reinforce');
    submit(store, concept.id); submit(store, concept.id);
    assert.equal(store.snapshot().estimates[0].status, 'progress');
    const reinforcement = store.snapshot().events.find(e => e.type === 'reinforcement.completed')!;
    assert.ok(store.snapshot().attempts.some(a => a.id === reinforcement.payload.attemptId));
    assert.equal(JSON.stringify(store.snapshot().events.find(e => e.id === change.id)), immutable);
    validateBackup(store.exportData());
  } finally { store.close(); }
});

test('las copias y bases 0.2 recuperan el portfolio desde intentos existentes sin inventar resultados ni fechas', async () => {
  const { store, subject, concept, path, key } = await fixture();
  const attempt = submit(store, concept.id);
  const old = JSON.parse(store.exportData()); old.version = 2;
  for (const table of newTables) delete old.tables[table];
  store.importData(JSON.stringify(old));
  assert.deepEqual(store.snapshot().portfolio[0].evidenceIds, [attempt.id]);
  assert.equal(store.snapshot().portfolio[0].createdAt, attempt.createdAt);
  assert.equal(store.snapshot().attempts.length, 1);
  store.close();
  const sql = await initSqlJs({ locateFile: () => wasm }); const db = new sql.Database(decrypt(await readFile(path), key));
  for (const table of newTables) db.run(`DROP TABLE ${table}`);
  db.run('PRAGMA user_version = 2'); writeEncrypted(path, db.export(), key); db.close();
  const reopened = await Store.open(path, key, wasm);
  assert.equal(reopened.snapshot().subjects[0].id, subject.id);
  assert.deepEqual(reopened.snapshot().portfolio[0].evidenceIds, [attempt.id]);
  assert.equal(reopened.snapshot().attempts.length, 1);
  validateBackup(reopened.exportData()); reopened.close();
  const again = await Store.open(path, key, wasm);
  try { assert.equal(again.snapshot().portfolio.length, 1); } finally { again.close(); }
});
