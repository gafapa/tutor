import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdir, readFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import initSqlJs from 'sql.js';
import { Store } from '../electron/store';
import { EXERCISES } from '../electron/learning';
import { goalProgress, learningAlerts, learningHabit, conceptTimeline, recentChanges, type GoalsData } from '../electron/goals';
import { decrypt, writeEncrypted } from '../electron/vault';
import type { GoalInput } from '../shared/goals';

const wasm = resolve('node_modules/sql.js/dist/sql-wasm.wasm'), now = new Date('2026-10-02T12:00:00Z');
async function fixture() { const dir = resolve('.tools/goal-tests', randomUUID()); await mkdir(dir, { recursive: true }); const key = randomBytes(32), path = join(dir, 'data.tutor'), store = await Store.open(path, key, wasm), subject = store.createDemo(), concept = store.snapshot().concepts.find(c => c.name === 'Potencias de 2')!; return { store, subject, concept, key, path }; }
function data(store: Store): GoalsData { return JSON.parse(store.exportData()).tables; }
function input(subjectId: string, conceptId: string, rest: Partial<GoalInput> = {}): GoalInput { return { subjectId, title: 'Comprender y aplicar potencias', kind: 'improve', description: 'Explicar la regla y comprobar otra pregunta.', conceptIds: [conceptId], targetDays: 3, startsOn: '2026-09-20', dueOn: '2026-10-05', supersedesId: null, ...rest }; }
function history(store: Store, conceptId: string, rows: { at: string; correct?: boolean; hints?: number }[]) {
  const ids: string[] = [];
  for (const [i, row] of rows.entries()) { const index = i % EXERCISES['Potencias de 2'].length, a = store.submitExercise({ conceptId, exerciseId: `Potencias de 2:${index}`, answer: row.correct === false ? '999' : EXERCISES['Potencias de 2'][index].answer, hints: row.hints ?? 0, durationSeconds: 30 }); ids.push(a.id); const copy = JSON.parse(store.exportData()); copy.tables.attempts.find((r: any) => r.id === a.id).createdAt = row.at; for (const entry of copy.tables.portfolio) if (entry.evidenceIds.includes(a.id)) entry.createdAt = row.at; store.importData(JSON.stringify(copy)); }
  return ids;
}
test('las cuatro clases de meta guardan criterios y versiones; editar no sobrescribe una decisión personal', async () => {
  const { store, subject, concept } = await fixture(); try {
    for (const kind of ['improve', 'exam', 'recover', 'advance'] as const) assert.equal(store.saveGoal(input(subject.id, concept.id, { kind })).kind, kind);
    const first = store.snapshot().personalGoals[0]; const review = store.reviewGoal({ goalId: first.id, action: 'achieved', reflection: 'Puedo explicarlo en otro contexto.', evidenceIds: [] });
    const next = store.saveGoal(input(subject.id, concept.id, { supersedesId: first.id, title: 'Comprobar otra aplicación' }));
    assert.equal(next.revision, 2); assert.equal(next.supersedesId, first.id); assert.equal(store.snapshot().goalProgress.find(p => p.goalId === next.id)!.status, 'active'); assert.equal(store.snapshot().goalReviews[0].id, review.id);
    assert.throws(() => store.saveGoal(input(subject.id, concept.id, { supersedesId: first.id })), /última/); assert.throws(() => store.reviewGoal({ goalId: first.id, action: 'progress', reflection: 'No actualizar una versión antigua', evidenceIds: [] }), /actual/);
    assert.doesNotThrow(() => store.importData(store.exportData()));
  } finally { store.close(); }
});
test('la práctica cuenta días independientes sin pistas, incluso errores, excluyendo autoevaluaciones y futuro', async () => {
  const { store, subject, concept } = await fixture(); try {
    history(store, concept.id, [{ at: '2026-09-21T10:00:00Z' }, { at: '2026-09-21T15:00:00Z' }, { at: '2026-09-22T10:00:00Z', correct: false }, { at: '2026-09-23T10:00:00Z', hints: 1 }, { at: '2027-01-01T10:00:00Z' }]);
    store.saveAttempt({ subjectId: subject.id, conceptId: concept.id, statement: 'Mi otro ejercicio', answer: 'Mi respuesta', outcome: 'correct', feedback: 'Autovaloración', hints: 0, durationSeconds: 20 });
    const goal = store.saveGoal(input(subject.id, concept.id)), progress = goalProgress(goal, data(store), now);
    assert.equal(progress.practiceDays, 2); assert.equal(progress.evidenceIds.length, 3); assert.equal(progress.targetMet, false); assert.equal(progress.status, 'active'); assert.ok(progress.reason.includes('incorrectos'));
  } finally { store.close(); }
});
test('pausar, retomar y alcanzar requiere reflexión y no cambia el dominio; las reflexiones conservan cadena', async () => {
  const { store, subject, concept } = await fixture(); try {
    const goal = store.saveGoal(input(subject.id, concept.id)), before = store.snapshot().estimates;
    const pause = store.reviewGoal({ goalId: goal.id, action: 'paused', reflection: 'Cambio la fecha para descansar.', evidenceIds: [] });
    assert.throws(() => store.reviewGoal({ goalId: goal.id, action: 'achieved', reflection: 'Sin reanudar', evidenceIds: [] }), /estado/);
    const resume = store.reviewGoal({ goalId: goal.id, action: 'resumed', reflection: 'Empiezo con una pregunta.', evidenceIds: [] }); assert.equal(resume.previousId, pause.id);
    store.reviewGoal({ goalId: goal.id, action: 'achieved', reflection: 'Mi decisión personal.', evidenceIds: [] }); assert.equal(store.snapshot().goalProgress[0].status, 'achieved'); assert.deepEqual(store.snapshot().estimates, before);
    assert.throws(() => store.reviewGoal({ goalId: goal.id, action: 'progress', reflection: ' ', evidenceIds: [] })); assert.doesNotThrow(() => store.importData(store.exportData()));
  } finally { store.close(); }
});
test('metas y reflexiones rechazan fechas incoherentes y datos de otra materia', async () => {
  const { store, subject, concept } = await fixture(); try {
    const other = store.createSubject({ name: 'Otra', level: '', teacher: '', goals: '', color: 'blue' }), otherConcept = store.createConcept({ subjectId: other.id, name: 'Potencias de 2', description: '', prerequisiteIds: [] });
    const a = store.submitExercise({ conceptId: otherConcept.id, exerciseId: 'Potencias de 2:0', answer: '32', hints: 0, durationSeconds: 10 });
    assert.throws(() => store.saveGoal(input(subject.id, otherConcept.id)), /asignatura/); assert.throws(() => store.saveGoal(input(subject.id, concept.id, { dueOn: '2026-09-01' })), /fechas/);
    const g = store.saveGoal(input(subject.id, concept.id)); assert.throws(() => store.reviewGoal({ goalId: g.id, action: 'progress', reflection: 'Otra materia', evidenceIds: [a.id] }), /conceptos/);
    assert.throws(() => store.saveGoal(input(subject.id, concept.id, { conceptIds: [concept.id, concept.id] })));
  } finally { store.close(); }
});
test('una meta activa se integra en el presupuesto del plan y una pausada deja de priorizar', async () => {
  const { store, subject, concept } = await fixture(); try {
    const goal = store.saveGoal(input(subject.id, concept.id, { dueOn: '2026-10-02' })); let plan = store.snapshot().plans.find(p => p.subjectId === subject.id)!;
    assert.ok(plan.items.some(i => i.reason.includes(goal.title))); assert.ok(plan.items.reduce((n, i) => n + i.minutes, 0) <= 20);
    history(store, concept.id, [{ at: '2026-10-01T12:00:00Z', correct: false }]);
    plan = store.snapshot().plans.find(p => p.subjectId === subject.id)!; assert.ok(plan.items.some(i => i.reason.includes(goal.title) && i.evidenceIds.length > 0));
    store.reviewGoal({ goalId: goal.id, action: 'paused', reflection: 'Otro bloque primero.', evidenceIds: [] }); plan = store.snapshot().plans.find(p => p.subjectId === subject.id)!; assert.ok(!plan.items.some(i => i.reason.includes('Meta personal:')));
  } finally { store.close(); }
});
test('la evolución reconstruye estados por fechas y enlaza nuevos ejercicios, excluyendo futuro y registro personal', async () => {
  const { store, subject, concept } = await fixture(); try {
    const ids = history(store, concept.id, ['20', '22', '24', '26'].map(day => ({ at: `2026-09-${day}T12:00:00Z` })));
    const timeline = conceptTimeline({ conceptId: concept.id, startsOn: '2026-09-20', endsOn: '2026-09-27' }, data(store), now);
    assert.equal(timeline.points[0].estimate.status, 'unseen'); assert.equal(timeline.points.at(-1)!.estimate.status, 'consolidated'); assert.deepEqual(timeline.points.flatMap(p => p.newEvidenceIds), ids); assert.equal(timeline.points.filter(p => p.newEvidenceIds.length).length, 4); assert.equal(recentChanges(data(store), now).find(c => c.conceptId === concept.id)!.change, 'first-evidence');
    assert.throws(() => conceptTimeline({ conceptId: concept.id, startsOn: '2024-01-01', endsOn: '2026-09-27' }, data(store), now), /año/); assert.throws(() => conceptTimeline({ conceptId: concept.id, startsOn: '2026-09-20', endsOn: '2027-09-27' }, data(store), now));
  } finally { store.close(); }
});
test('cuatro aciertos en solo dos días proponen comprobar autonomía sin dar el bloque por consolidado', async () => {
  const { store, concept } = await fixture(); try {
    history(store, concept.id, ['20', '20', '22', '22'].map((day, i) => ({ at: `2026-09-${day}T${i % 2 ? '15' : '12'}:00:00Z` })));
    const alert = learningAlerts(data(store), now).find(a => a.conceptId === concept.id)!;
    assert.equal(alert.kind, 'unconsolidated'); assert.equal(alert.evidenceIds.length, 4); assert.ok(alert.reason.includes('sin pistas'));
  } finally { store.close(); }
});
test('retroceso exige consolidación anterior y tres dificultades en varias preguntas y días', async () => {
  const { store, concept } = await fixture(); try {
    history(store, concept.id, ['20', '22', '24', '26'].map(day => ({ at: `2026-09-${day}T12:00:00Z` })));
    history(store, concept.id, [{ at: '2026-09-28T12:00:00Z', correct: false }, { at: '2026-09-29T12:00:00Z', hints: 1 }, { at: '2026-09-30T12:00:00Z', correct: false }]);
    const alerts = learningAlerts(data(store), now).filter(a => a.conceptId === concept.id); assert.equal(alerts.length, 1); assert.equal(alerts[0].kind, 'regression'); assert.equal(alerts[0].evidenceIds.length, 7);
  } finally { store.close(); }
});
test('repetir el mismo error en el mismo día no activa persistencia; tres trabajos variados sí', async () => {
  const { store, concept } = await fixture(); try {
    history(store, concept.id, Array.from({ length: 3 }, () => ({ at: '2026-09-29T12:00:00Z', correct: false })));
    assert.equal(learningAlerts(data(store), now).filter(a => a.conceptId === concept.id).length, 0);
    history(store, concept.id, [{ at: '2026-09-30T12:00:00Z', correct: false }]);
    assert.equal(learningAlerts(data(store), now).find(a => a.conceptId === concept.id)?.kind, 'persistent');
  } finally { store.close(); }
});
test('la antigüedad propone comprobar el recuerdo y la inactividad solo describe registros', async () => {
  const { store, subject, concept } = await fixture(); try {
    history(store, concept.id, [{ at: '2026-08-01T12:00:00Z' }]); const alerts = learningAlerts(data(store), now);
    assert.equal(alerts.find(a => a.conceptId === concept.id)?.kind, 'review'); assert.ok(alerts.find(a => a.kind === 'inactivity')?.reason.includes('fuera de la app'));
    store.saveAttempt({ subjectId: subject.id, conceptId: null, statement: 'Trabajo personal de hoy', answer: 'Una respuesta', outcome: 'ungraded', feedback: '', hints: 0, durationSeconds: 30 }); assert.ok(!learningAlerts(data(store), now).some(a => a.kind === 'inactivity'));
  } finally { store.close(); }
});
test('revisar un aviso conserva motivo y evidencias; nuevos intentos producen otra señal', async () => {
  const { store, concept } = await fixture(); try {
    history(store, concept.id, [{ at: '2026-09-28T12:00:00Z', correct: false }, { at: '2026-09-29T12:00:00Z', correct: false }, { at: '2026-09-30T12:00:00Z', correct: false }]);
    const alert = store.snapshot().learningAlerts.find(a => a.kind === 'persistent')!; store.reviewAlert({ key: alert.key, reflection: 'Comprobaré el prerrequisito.' }); assert.equal(store.snapshot().learningAlerts.find(a => a.key === alert.key)!.reviewed, true);
    assert.throws(() => store.reviewAlert({ key: alert.key, reflection: 'No duplicar' }), /cambió/); assert.doesNotThrow(() => store.importData(store.exportData()));
    history(store, concept.id, [{ at: '2026-10-01T12:00:00Z', correct: false }]); const next = store.snapshot().learningAlerts.find(a => a.kind === 'persistent')!; assert.notEqual(next.key, alert.key); assert.equal(next.reviewed, false); assert.equal(store.snapshot().alertReviews.length, 1);
  } finally { store.close(); }
});
test('la racha cuenta días locales una vez y no usa notas, tareas ni fechas futuras', async () => {
  const { store, subject, concept } = await fixture(); try {
    history(store, concept.id, [{ at: '2026-09-29T23:30:00Z' }, { at: '2026-09-30T12:00:00Z', correct: false }, { at: '2026-10-01T12:00:00Z', hints: 1 }, { at: '2027-01-01T12:00:00Z' }]);
    const d = data(store), habit = learningHabit(d, subject.id, now, 'Europe/Madrid'); assert.equal(habit.totalDays, 2); assert.equal(habit.currentStreak, 2); assert.equal(habit.longestStreak, 2); assert.equal(habit.recentDays.length, 28);
    assert.equal(learningHabit(d, subject.id, now, 'America/New_York').totalDays, 3);
    const before = store.snapshot().estimates, card = store.createFlashcard({ subjectId: subject.id, conceptId: concept.id, front: 'Una regla', back: 'Mi recuerdo' });
    store.reviewFlashcard({ id: card.id, rating: 'good' }); store.reviewFlashcard({ id: card.id, rating: 'hard' });
    const withCards = learningHabit(data(store), subject.id, now, 'Europe/Madrid'); assert.equal(withCards.totalDays, 3); assert.equal(withCards.currentStreak, 3); assert.deepEqual(store.snapshot().estimates, before);
  } finally { store.close(); }
});
test('restaurar rechaza ramas, decisiones y referencias manipuladas sin perder datos', async () => {
  const { store, subject, concept } = await fixture(); try {
    const goal = store.saveGoal(input(subject.id, concept.id)); store.reviewGoal({ goalId: goal.id, action: 'paused', reflection: 'Una pausa.', evidenceIds: [] });
    for (const mutate of [(copy: any) => copy.tables.personal_goals[0].revision = 2, (copy: any) => copy.tables.personal_goals[0].supersedesId = goal.id, (copy: any) => copy.tables.goal_reviews[0].previousId = copy.tables.goal_reviews[0].id, (copy: any) => copy.tables.goal_reviews[0].evidenceIds = [randomUUID()]]) { const copy = JSON.parse(store.exportData()); mutate(copy); assert.throws(() => store.importData(JSON.stringify(copy))); assert.equal(store.snapshot().personalGoals[0].id, goal.id); }
  } finally { store.close(); }
});
test('base y copia 0.9 migran sin inventar metas; borrar la serie conserva ejercicios y borrar materia limpia revisiones', async () => {
  const { store, subject, concept, path, key } = await fixture(); history(store, concept.id, [{ at: '2026-09-29T12:00:00Z' }]); const copy = JSON.parse(store.exportData()); copy.version = 9; for (const t of ['personal_goals', 'goal_reviews', 'alert_reviews']) delete copy.tables[t]; store.importData(JSON.stringify(copy)); assert.equal(store.snapshot().personalGoals.length, 0); store.close();
  const sql = await initSqlJs({ locateFile: () => wasm }), db = new sql.Database(decrypt(await readFile(path), key)); db.run('DROP TABLE personal_goals; DROP TABLE goal_reviews; DROP TABLE alert_reviews; PRAGMA user_version = 9;'); writeEncrypted(path, db.export(), key); db.close(); const reopened = await Store.open(path, key, wasm);
  try { assert.equal(JSON.parse(reopened.exportData()).version, 12); assert.equal(reopened.snapshot().personalGoals.length, 0); const first = reopened.saveGoal(input(subject.id, concept.id)), next = reopened.saveGoal(input(subject.id, concept.id, { supersedesId: first.id })); reopened.reviewGoal({ goalId: next.id, action: 'progress', reflection: 'Mi siguiente paso.', evidenceIds: [] }); reopened.deleteGoal(first.id); assert.equal(reopened.snapshot().goalReviews.length, 0); assert.equal(reopened.snapshot().attempts.length, 1); reopened.saveGoal(input(subject.id, concept.id)); reopened.deleteSubject(subject.id); assert.equal(reopened.snapshot().personalGoals.length, 0); assert.equal(reopened.snapshot().alertReviews.length, 0); assert.doesNotThrow(() => reopened.importData(reopened.exportData())); } finally { reopened.close(); }
});
