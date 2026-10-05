import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, randomBytes } from 'node:crypto';
import { mkdir, readFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { Store } from '../electron/store';
import { makeReport, previousWeek, reportCsv } from '../electron/reports';
import { reportDocument } from '../electron/report-document';
import { EXERCISES } from '../electron/learning';
import { dayKey } from '../shared/calendar';
import type { ReportInput } from '../shared/reports';
import initSqlJs from 'sql.js';
import { decrypt, writeEncrypted } from '../electron/vault';

const wasm = resolve('node_modules/sql.js/dist/sql-wasm.wasm');
test('una semana con tarjetas genera resumen y conserva su actividad sin inventar dominio', async () => {
  const { store, subject, concept } = await fixture(); try {
    const card = store.createFlashcard({ subjectId: subject.id, conceptId: concept.id, front: 'Una potencia', back: 'Multiplicar factores.' }); store.reviewFlashcard({ id: card.id, rating: 'good' });
    const backup = JSON.parse(store.exportData()); backup.tables.flashcards[0].createdAt = '2026-09-21T12:00:00Z'; backup.tables.card_revisions[0].createdAt = '2026-09-21T12:00:00Z'; backup.tables.card_reviews[0].createdAt = '2026-09-22T12:00:00Z';
    backup.tables.events.filter((e: any) => e.type.startsWith('flashcard.')).forEach((e: any) => e.createdAt = e.type === 'flashcard.reviewed' ? '2026-09-22T12:00:00Z' : '2026-09-21T12:00:00Z');
    store.importData(JSON.stringify(backup)); assert.equal(store.maintainReports(new Date('2026-09-28T12:00:00Z')), 1);
    const report = store.snapshot().learningReports[0]; assert.equal(report.stats.otherActivities, 1); assert.equal(report.stats.verified, 0); assert.ok(report.concepts.every(c => c.after.status === 'unseen')); assert.doesNotThrow(() => store.importData(store.exportData()));
    const bad = JSON.parse(store.exportData()); bad.tables.learning_reports[0].activityEventIds = [randomUUID()]; assert.throws(() => store.importData(JSON.stringify(bad)), /actividades/);
  } finally { store.close(); }
});
test('las ayudas seleccionadas enlazan la reflexión original y borrar el análisis retira sus copias del informe', async () => {
  const { store, subject, concept } = await fixture(); try {
    const attempt = store.saveAttempt({ subjectId: subject.id, conceptId: concept.id, statement: 'Resta dos.', answer: '16 - 2 = 13', outcome: 'ungraded', feedback: '', hints: 0, durationSeconds: 20 });
    const analysis = store.analyzeSteps({ kind: 'attempt', id: attempt.id }), observation = analysis.observations[0];
    store.reviewObservation({ analysisId: analysis.id, observationId: observation.id, decision: 'accepted', reason: 'Compruebo esta resta.' });
    const plan = store.startIntervention({ analysisId: analysis.id, observationId: observation.id, minutes: 10 }), reflection = store.reflectIntervention({ interventionId: plan.id, whatHelped: 'Restar de uno en uno.', reflection: 'Me sirvió comprobar el resultado.', nextStep: 'Volver a comprobar en otro día.' });
    const today = dayKey(), first = store.createLearningReport(input(subject.id, { kind: 'transition', startsOn: today, endsOn: today, targetCourse: 'Segundo', conceptIds: [concept.id], helpIds: [reflection.id] }), new Date(Date.now() + 20));
    const second = store.createLearningReport(input(subject.id, { kind: 'transition', startsOn: today, endsOn: today, targetCourse: 'Segundo', conceptIds: [concept.id], helpIds: [reflection.id], supersedesId: first.id }), new Date(Date.now() + 40));
    assert.equal(second.help[0].whatHelped, reflection.whatHelped); assert.doesNotThrow(() => store.importData(store.exportData()));
    const backup = JSON.parse(store.exportData()); backup.tables.learning_reports[0].help[0].whatHelped = 'Ayuda inventada'; assert.throws(() => store.importData(JSON.stringify(backup)), /reflexión original/);
    store.deleteAnalysis(analysis.id); assert.equal(store.snapshot().learningReports.length, 0); assert.equal(store.snapshot().attempts.length, 1); assert.doesNotThrow(() => store.importData(store.exportData()));
  } finally { store.close(); }
});
test('la falta de práctica propone comprobar el recuerdo y el cambio de mes respeta semanas y calendario', async () => {
  const { store, subject, concept } = await fixture(); try {
    await history(store, concept.id, ['2026-08-20T12:00:00Z', '2026-08-22T12:00:00Z', '2026-08-24T12:00:00Z', '2026-08-26T12:00:00Z']);
    const report = store.createLearningReport(input(subject.id, { startsOn: '2026-08-31', endsOn: '2026-09-06' }));
    assert.equal(report.concepts[0].after.status, 'consolidated');
    const later = store.createLearningReport(input(subject.id)); assert.equal(later.concepts[0].change, 'check-again'); assert.equal(later.concepts[0].after.confidence, 'low');
    assert.deepEqual(previousWeek(new Date('2027-01-04T12:00:00Z')), { startsOn: '2026-12-28', endsOn: '2027-01-03' });
    assert.doesNotThrow(() => store.importData(store.exportData()));
  } finally { store.close(); }
});
test('al volver se recuperan todas las semanas con ejercicios pendientes sin duplicarlas', async () => {
  const { store, subject, concept } = await fixture(); try {
    await history(store, concept.id, ['2026-09-01T12:00:00Z', '2026-09-10T12:00:00Z', '2026-09-22T12:00:00Z']);
    assert.equal(store.maintainReports(new Date('2026-09-28T12:00:00Z')), 3);
    assert.deepEqual(store.snapshot().learningReports.map(r => r.startsOn), ['2026-08-31', '2026-09-07', '2026-09-21']);
    assert.equal(store.maintainReports(new Date('2026-10-02T12:00:00Z')), 0); assert.doesNotThrow(() => store.importData(store.exportData()));
  } finally { store.close(); }
});
test('la base SQLite 0.8 se actualiza con datos cifrados conservados y sin resultados fabricados', async () => {
  const { store, path, key, subject } = await fixture(); store.close(); const sql = await initSqlJs({ locateFile: () => wasm }), db = new sql.Database(decrypt(await readFile(path), key));
  db.run('DROP TABLE learning_reports; DROP TABLE report_preferences; PRAGMA user_version=8;'); writeEncrypted(path, db.export(), key); db.close();
  const reopened = await Store.open(path, key, wasm); try { assert.equal(reopened.snapshot().subjects[0].id, subject.id); assert.equal(reopened.snapshot().learningReports.length, 0); assert.equal(JSON.parse(reopened.exportData()).version, 12); assert.doesNotThrow(() => reopened.importData(reopened.exportData())); } finally { reopened.close(); }
});
async function fixture() {
  const dir = resolve('.tools/test-data', randomUUID()); await mkdir(dir, { recursive: true });
  const path = join(dir, 'reports.tutor'), key = randomBytes(32), store = await Store.open(path, key, wasm), subject = store.createDemo();
  const concept = store.snapshot().concepts.find(c => c.name === 'Potencias de 2')!;
  return { store, path, key, subject, concept };
}
function input(subjectId: string, extra: Partial<ReportInput> = {}): ReportInput { return { subjectId, kind: 'weekly', startsOn: '2026-09-21', endsOn: '2026-09-27', ...extra }; }
async function history(store: Store, conceptId: string, dates: string[]) {
  for (const [index] of dates.entries()) store.submitExercise({ conceptId, exerciseId: `Potencias de 2:${index}`, answer: EXERCISES['Potencias de 2'][index].answer, hints: 0, durationSeconds: 60 });
  const data = JSON.parse(store.exportData()), byId = new Map<string, string>();
  data.tables.attempts.filter((a: any) => a.conceptId === conceptId).forEach((a: any, i: number) => { a.createdAt = dates[i]; byId.set(a.id, a.createdAt); });
  data.tables.portfolio.filter((p: any) => p.automatic).forEach((p: any) => { p.createdAt = byId.get(p.evidenceIds[0]); });
  store.importData(JSON.stringify(data));
}
test('el informe semanal compara evidencias, conserva estimaciones y no inventa dominio para otros conceptos', async () => {
  const { store, subject, concept } = await fixture(); try {
    await history(store, concept.id, ['2026-09-20T12:00:00Z', '2026-09-22T12:00:00Z', '2026-09-24T12:00:00Z', '2026-09-26T12:00:00Z']);
    const report = store.createLearningReport(input(subject.id)), row = report.concepts.find(c => c.conceptId === concept.id)!;
    assert.equal(row.before.status, 'progress'); assert.equal(row.after.status, 'consolidated'); assert.equal(row.change, 'improved');
    assert.equal(report.stats.verified, 3); assert.equal(report.stats.correctWithoutHints, 3); assert.equal(report.stats.activeDays, 3); assert.equal(report.stats.exerciseSeconds, 180);
    assert.ok(report.concepts.some(c => c.after.status === 'unseen' && c.recommendation.action === 'check'));
    assert.doesNotThrow(() => store.importData(store.exportData()));
    store.submitExercise({ conceptId: concept.id, exerciseId: 'Potencias de 2:0', answer: '0', hints: 0, durationSeconds: 20 });
    assert.deepEqual(store.snapshot().learningReports.find(r => r.id === report.id), report);
  } finally { store.close(); }
});
test('el resumen automático se crea una vez por semana cerrada y respeta desactivación y borrado', async () => {
  const { store, subject, concept } = await fixture(); try {
    await history(store, concept.id, ['2026-09-22T12:00:00Z']); const now = new Date('2026-09-28T12:00:00Z');
    assert.deepEqual(previousWeek(now), { startsOn: '2026-09-21', endsOn: '2026-09-27' });
    assert.equal(store.maintainReports(now), 1); assert.equal(store.maintainReports(now), 0);
    const report = store.snapshot().learningReports[0]; assert.equal(report.origin, 'automatic');
    store.deleteLearningReport(report.id); assert.equal(store.maintainReports(now), 0);
    store.configureReports({ subjectId: subject.id, automaticWeekly: false });
    assert.equal(store.maintainReports(new Date('2026-10-05T12:00:00Z')), 0);
    assert.doesNotThrow(() => store.importData(store.exportData()));
  } finally { store.close(); }
});
test('sin actividad no se inventa un resumen automático y las autoevaluaciones no demuestran dominio', async () => {
  const { store, subject, concept } = await fixture(); try {
    assert.equal(store.maintainReports(), 0);
    store.saveAttempt({ subjectId: subject.id, conceptId: null, statement: 'Mi trabajo abierto.', answer: 'Mi intento.', outcome: 'correct', feedback: 'Mi percepción.', hints: 0, durationSeconds: 30 });
    const today = dayKey(), report = store.createLearningReport(input(subject.id, { kind: 'transition', startsOn: today, endsOn: today, targetCourse: 'Segundo', conceptIds: [concept.id] }));
    assert.equal(report.stats.verified, 0); assert.equal(report.stats.personal, 0); assert.equal(report.concepts[0].after.status, 'unseen');
    assert.throws(() => store.createLearningReport(input(subject.id, { kind: 'transition', startsOn: today, endsOn: today, targetCourse: 'Segundo' })), /selecciona/);
  } finally { store.close(); }
});
test('el informe de unidad conserva currículo y la transición solo los conceptos elegidos', async () => {
  const { store, subject, concept } = await fixture(); try {
    const curriculum = store.saveCurriculum({ subjectId: subject.id, kind: 'outcome', code: 'RA1', title: 'Aplicar potencias', description: '', conceptIds: [concept.id], relatedIds: [] });
    const unit = store.saveUnit({ subjectId: subject.id, title: 'Primer bloque', objectives: '', startsOn: null, endsOn: null, status: 'taught', prerequisiteIds: [], conceptIds: [concept.id], curriculumIds: [curriculum.id], materialIds: [] });
    const report = store.createLearningReport(input(subject.id, { kind: 'unit', unitId: unit.id }));
    assert.equal(report.unit?.curriculum[0].code, 'RA1'); assert.equal(report.concepts.length, 1);
    store.saveUnit({ ...unit, title: 'Título nuevo' }); store.deleteCurriculum(curriculum.id);
    assert.equal(store.snapshot().learningReports[0].unit?.title, 'Primer bloque'); assert.doesNotThrow(() => store.importData(store.exportData()));
    const transition = store.createLearningReport(input(subject.id, { kind: 'transition', targetCourse: 'Segundo curso', conceptIds: [concept.id], reflection: 'Quiero conservar la regla, no todos mis chats.' }));
    assert.equal(transition.concepts.length, 1); assert.equal(transition.targetCourse, 'Segundo curso'); assert.equal(transition.unit, null);
    assert.ok(!JSON.stringify(transition).includes('Subnetting')); assert.ok(!JSON.stringify(transition).includes('messages'));
    const other = store.createSubject({ name: 'Otra materia', level: '', teacher: '', goals: '', color: 'blue' });
    assert.throws(() => store.createLearningReport(input(other.id, { kind: 'unit', unitId: unit.id })), /unidad/);
  } finally { store.close(); }
});
test('actualizar un informe conserva versiones y rechaza ramas; borrar elimina la serie y conserva ejercicios', async () => {
  const { store, subject, concept } = await fixture(); try {
    await history(store, concept.id, ['2026-09-22T12:00:00Z']);
    const first = store.createLearningReport(input(subject.id)), second = store.createLearningReport(input(subject.id, { supersedesId: first.id, reflection: 'Otra revisión.' }));
    assert.equal(second.revision, 2); assert.equal(second.supersedesId, first.id); assert.equal(store.snapshot().learningReports.length, 2);
    assert.throws(() => store.createLearningReport(input(subject.id, { supersedesId: first.id })), /última/);
    assert.doesNotThrow(() => store.importData(store.exportData())); store.deleteLearningReport(first.id);
    assert.equal(store.snapshot().learningReports.length, 0); assert.equal(store.snapshot().attempts.length, 1);
  } finally { store.close(); }
});
test('las copias manipuladas no cambian datos: estados, cifras, fechas, fuentes y revisiones se verifican', async () => {
  const { store, subject, concept } = await fixture(); try {
    await history(store, concept.id, ['2026-09-22T12:00:00Z']); const report = store.createLearningReport(input(subject.id));
    for (const mutate of [(r: any) => r.stats.verified++, (r: any) => r.concepts[0].after.status = 'consolidated', (r: any) => r.concepts[0].after.evidenceIds = [randomUUID()], (r: any) => r.asOf = '2027-01-01T12:00:00Z', (r: any) => r.supersedesId = r.id]) {
      const backup = JSON.parse(store.exportData()); mutate(backup.tables.learning_reports[0]); assert.throws(() => store.importData(JSON.stringify(backup))); assert.equal(store.snapshot().learningReports[0].id, report.id);
    }
  } finally { store.close(); }
});
test('el periodo cerrado excluye evidencias posteriores y el futuro no permite un informe', async () => {
  const { store, subject, concept } = await fixture(); try {
    store.submitExercise({ conceptId: concept.id, exerciseId: 'Potencias de 2:0', answer: '32', hints: 0, durationSeconds: 10 });
    const report = store.createLearningReport(input(subject.id)); assert.equal(report.stats.verified, 0); assert.equal(report.concepts[0].after.status, 'unseen');
    assert.throws(() => store.createLearningReport(input(subject.id, { endsOn: '2099-01-01' })), /terminar/);
    assert.throws(() => store.createLearningReport(input(subject.id, { startsOn: '2026-09-22' })), /lunes/);
  } finally { store.close(); }
});
test('CSV protege fórmulas y PDF escapa contenido sin incluir código ni recursos de red', async () => {
  const { store, subject, concept } = await fixture(); try {
    const report = store.createLearningReport(input(subject.id, { kind: 'transition', targetCourse: '=IMPORT("https://invalid")', conceptIds: [concept.id], reflection: '<script>evil()</script>\n=SUM(1)' }));
    assert.ok(reportCsv(report).includes("'=IMPORT")); const html = reportDocument(report, []);
    assert.ok(html.includes('&lt;script&gt;evil()&lt;/script&gt;')); assert.ok(!html.includes('<script>')); assert.ok(html.includes("default-src 'none'")); assert.ok(!html.includes('<iframe'));
  } finally { store.close(); }
});
test('base y copia 0.8 migran sin fabricar informes y borrar una materia limpia informes y configuración', async () => {
  const { store, path, key, subject } = await fixture(); const backup = JSON.parse(store.exportData());
  backup.version = 8; delete backup.tables.learning_reports; delete backup.tables.report_preferences; store.importData(JSON.stringify(backup));
  assert.equal(store.snapshot().learningReports.length, 0); store.configureReports({ subjectId: subject.id, automaticWeekly: false });
  store.createLearningReport(input(subject.id)); store.close(); const reopened = await Store.open(path, key, wasm);
  try { assert.equal(reopened.snapshot().learningReports.length, 1); assert.equal(reopened.snapshot().reportPreferences.length, 1); reopened.deleteSubject(subject.id); assert.equal(reopened.snapshot().learningReports.length, 0); assert.equal(reopened.snapshot().reportPreferences.length, 0); assert.doesNotThrow(() => reopened.importData(reopened.exportData())); } finally { reopened.close(); }
  assert.ok((await readFile(path)).length > 0);
});
