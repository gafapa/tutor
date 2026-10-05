import { _electron as electron } from 'playwright';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { resolve, join } from 'node:path';
const require = createRequire(import.meta.url), packaged = process.argv.includes('--packaged'), prefix = packaged ? 'packaged-' : '';
const directory = resolve('.tools/reports-desktop-test', randomUUID()), pdfDirectory = resolve('tmp/pdfs');
await mkdir(directory, { recursive: true }); await mkdir(pdfDirectory, { recursive: true }); await mkdir('test-results', { recursive: true });
const env = { ...process.env, TUTOR_DATA_DIR: directory, TUTOR_SMOKE: '1' }; delete env.ELECTRON_RUN_AS_NODE;
const launch = () => electron.launch({ executablePath: packaged ? resolve('release/win-unpacked/Tutor Local.exe') : require('electron'), args: packaged ? [] : ['.'], env, timeout: 60000 });
let app = await launch(); const errors = [];
async function persistedReportCount() {
  return app.evaluate(async ({ app, safeStorage }, directory) => {
    const hostRequire = typeof require === 'function' ? require : process.mainModule.require.bind(process.mainModule);
    const { createRequire } = hostRequire('node:module'), { readFileSync } = hostRequire('node:fs'), { join } = hostRequire('node:path');
    const req = createRequire(join(app.getAppPath(), 'package.json')), key = Buffer.from(safeStorage.decryptString(readFileSync(join(directory, 'vault-key.bin'))), 'base64');
    const sql = await req('sql.js')({ locateFile: () => req.resolve('sql.js/dist/sql-wasm.wasm') });
    const db = new sql.Database(req('./build/electron/vault.js').decrypt(readFileSync(join(directory, 'learning.tutor')), key));
    try { return Number(db.exec('SELECT COUNT(*) FROM learning_reports')[0].values[0][0]); } finally { db.close(); }
  }, directory);
}
try {
  let window = await app.firstWindow(); window.setDefaultTimeout(45000); window.on('pageerror', e => errors.push(e.message));
  assert.equal(await app.evaluate(({ app }) => app.getVersion()), JSON.parse(await readFile('package.json', 'utf8')).version);
  await window.getByRole('button', { name: 'Explorar un ejemplo', exact: true }).click();
  const initial = await window.evaluate(async () => {
    const data = await window.tutor.snapshot(), subject = data.subjects[0], concept = data.concepts.find(c => c.name === 'Potencias de 2');
    const curriculum = await window.tutor.saveCurriculum({ subjectId: subject.id, kind: 'outcome', code: 'RA1', title: 'Aplicar potencias en redes', description: '', conceptIds: [concept.id], relatedIds: [] });
    const unit = await window.tutor.saveUnit({ subjectId: subject.id, title: 'De potencias a redes', objectives: '', startsOn: null, endsOn: null, status: 'taught', prerequisiteIds: [], conceptIds: [concept.id], curriculumIds: [curriculum.id], materialIds: [] });
    const other = await window.tutor.createSubject({ name: 'Materia independiente', level: 'FP', teacher: '', goals: '', color: 'blue' });
    await window.tutor.saveAttempt({ subjectId: other.id, conceptId: null, statement: 'NO_EXPORTAR_OTRA_MATERIA', answer: 'Texto separado del informe.', outcome: 'ungraded', feedback: '', hints: 0, durationSeconds: 20 });
    return { subject, concept, curriculum, unit, other };
  });
  const historyPath = join(directory, 'controlled-history.json');
  await app.evaluate(({ dialog }, path) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath: path }); dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] }); }, historyPath);
  const { EXERCISES } = require('../build/electron/learning.js'), { previousWeek } = require('../build/electron/reports.js'), { addDays } = require('../build/shared/calendar.js'), week = previousWeek();
  await window.evaluate(async ({ concept, questions }) => { for (const [i, q] of questions.entries()) await window.tutor.submitExercise({ conceptId: concept.id, exerciseId: concept.name + ':' + i, answer: q.answer, hints: 0, durationSeconds: 60 }); }, { concept: initial.concept, questions: EXERCISES[initial.concept.name].slice(0, 4) });
  await window.evaluate(() => window.tutor.exportData({ format: 'json' }));
  const history = JSON.parse(await readFile(historyPath, 'utf8')), dates = new Map(), offsets = [-1, 1, 3, 5];
  history.tables.attempts.filter(a => a.source === 'verified').forEach((a, i) => { a.createdAt = new Date(addDays(week.startsOn, offsets[i]) + 'T12:00:00').toISOString(); dates.set(a.id, a.createdAt); });
  history.tables.portfolio.filter(p => p.automatic).forEach(p => p.createdAt = dates.get(p.evidenceIds[0])); await writeFile(historyPath, JSON.stringify(history));
  await window.evaluate(() => window.tutor.importData({}));
  assert.equal(await persistedReportCount(), 0, 'El resumen todavía no se ha generado ni se ha pedido un snapshot.');
  const deadline = Date.now() + 80000;
  while (await persistedReportCount() !== 2) { assert.ok(Date.now() < deadline, 'El temporizador real debe guardar las semanas pendientes.'); await new Promise(resolve => setTimeout(resolve, 10000)); }
  await window.reload(); await window.getByRole('button', { name: 'Mis informes', exact: true }).click();
  await window.getByRole('heading', { name: 'Lo que aprendiste, con sus evidencias.', exact: true }).waitFor();
  let snapshot = await window.evaluate(() => window.tutor.snapshot()), weekly = snapshot.learningReports.find(r => r.startsOn === week.startsOn); assert.equal(weekly.origin, 'automatic'); assert.equal(weekly.stats.verified, 3); assert.equal(weekly.concepts.find(c => c.conceptId === initial.concept.id).change, 'improved'); assert.equal(snapshot.learningReports.length, 2);
  await window.getByLabel('Generar mi resumen semanal', { exact: true }).uncheck(); assert.equal((await window.evaluate(() => window.tutor.snapshot())).reportPreferences[0].automaticWeekly, false);
  await window.getByLabel('Generar mi resumen semanal', { exact: true }).check();
  await window.getByRole('button', { name: 'Crear nueva versión', exact: true }).click(); await window.getByLabel('Reflexión del informe', { exact: true }).fill('Los ejercicios nuevos confirman la regla. Comprobaré otra aplicación.');
  await window.getByRole('button', { name: 'Guardar informe', exact: true }).click(); await window.getByRole('dialog').waitFor({ state: 'hidden' });
  snapshot = await window.evaluate(() => window.tutor.snapshot()); weekly = snapshot.learningReports.at(-1); assert.equal(weekly.revision, 2); assert.equal(snapshot.learningReports.length, 3);
  await window.locator('.report-concept').filter({ has: window.getByRole('heading', { name: 'Potencias de 2', exact: true }) }).getByRole('button', { name: 'Ver ejercicios y comparar', exact: true }).click();
  await window.getByLabel('Resolución anterior', { exact: true }).waitFor(); assert.equal(await window.locator('.comparison-work').count(), 2);
  for (const [position, question] of [[0, EXERCISES[initial.concept.name][0]], [1, EXERCISES[initial.concept.name][3]]]) { const card = window.locator('.comparison-work').nth(position); assert.equal(await card.getByRole('heading').innerText(), question.statement); assert.equal(await card.locator('.report-original').innerText(), question.answer); }
  await window.getByRole('dialog').locator('.modal-actions').getByRole('button', { name: 'Cerrar', exact: true }).click();
  await window.getByRole('button', { name: 'Fin de unidad', exact: true }).click(); await window.getByRole('button', { name: 'Crear informe', exact: true }).click();
  await window.getByLabel('Unidad del informe', { exact: true }).selectOption(initial.unit.id); await window.getByRole('button', { name: 'Guardar informe', exact: true }).click(); await window.getByRole('dialog').waitFor({ state: 'hidden' });
  await window.getByText('RA1', { exact: true }).waitFor(); snapshot = await window.evaluate(() => window.tutor.snapshot()); const unit = snapshot.learningReports.find(r => r.kind === 'unit'); assert.equal(unit.concepts.length, 1);
  await window.getByRole('button', { name: 'Cambio de curso', exact: true }).click(); await window.getByRole('button', { name: 'Crear informe', exact: true }).click();
  await window.getByLabel('Curso de destino', { exact: true }).fill('Segundo curso'); await window.locator('.report-selection label').filter({ hasText: 'Potencias de 2' }).getByRole('checkbox').check();
  await window.getByLabel('Reflexión del informe', { exact: true }).fill('Conservaré la regla y comprobaré su uso en otro contexto. <script>neverRun()</script>');
  await window.getByRole('button', { name: 'Guardar informe', exact: true }).click(); await window.getByRole('dialog').waitFor({ state: 'hidden' });
  snapshot = await window.evaluate(() => window.tutor.snapshot()); const transition = snapshot.learningReports.find(r => r.kind === 'transition'); assert.equal(transition.concepts.length, 1); assert.equal(transition.attemptIds.length, 4);
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setBounds({ width: 960, height: 700 }));
  assert.equal(await window.evaluate(() => { const m = document.querySelector('.main-content'); return m.scrollWidth <= m.clientWidth + 2; }), true);
  await window.screenshot({ path: `test-results/${prefix}reports-small.png` });
  const outputs = {};
  async function exportFile(format, path) { await app.evaluate(({ dialog }, path) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath: path }); }, path); await window.getByRole('button', { name: 'Exportar informe', exact: true }).click(); await window.getByLabel('Formato', { exact: true }).selectOption(format); await window.getByRole('button', { name: 'Guardar archivo', exact: true }).click(); await window.getByRole('dialog').waitFor({ state: 'hidden', timeout: 60000 }); return readFile(path); }
  const jsonPath = join(directory, 'transition.json'), csvPath = join(directory, 'transition.csv');
  const json = JSON.parse((await exportFile('json', jsonPath)).toString('utf8')); assert.equal(json.report.id, transition.id); assert.equal(json.evidence.length, 4); assert.ok(!JSON.stringify(json).includes('NO_EXPORTAR_OTRA_MATERIA')); assert.ok(!JSON.stringify(json).includes('messages'));
  const csv = (await exportFile('csv', csvPath)).toString('utf8'); assert.ok(csv.includes('Segundo curso')); assert.ok(csv.includes(transition.id)); assert.ok(csv.includes('Consolidado'));
  for (const [kind, label] of [['weekly', 'Mi semana'], ['unit', 'Fin de unidad'], ['transition', 'Cambio de curso']]) {
    await window.getByRole('button', { name: label, exact: true }).click(); const path = join(pdfDirectory, `${prefix}report-${kind}.pdf`), bytes = await exportFile('pdf', path);
    assert.equal(bytes.subarray(0, 5).toString('ascii'), '%PDF-'); assert.ok(bytes.length > 10000); outputs[kind] = path;
  }
  assert.equal(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows().length), 1);
  const exam = await window.evaluate(data => window.tutor.startMockExam({ subjectId: data.subject.id, title: 'Bloqueo de informes', unitId: null, conceptIds: [data.concept.id], maxDifficulty: 3, minutes: 5, questionCount: 1 }), initial);
  const locked = await window.evaluate(() => window.tutor.snapshot()); assert.equal(locked.learningReports.length, 0); assert.equal(locked.reportPreferences.length, 0);
  assert.equal(await window.evaluate(async id => { try { await window.tutor.exportLearningReport({ id, format: 'pdf' }); return false; } catch { return true; } }, transition.id), true);
  await window.evaluate(id => window.tutor.cancelMockExam(id), exam.id);
  const backupPath = join(directory, 'reports.tutor'); await app.evaluate(({ dialog }, path) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath: path }); dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] }); }, backupPath);
  await window.evaluate(() => window.tutor.exportData({ format: 'encrypted', password: 'reports-private-fixture' })); await window.evaluate(() => window.tutor.eraseData()); await window.evaluate(() => window.tutor.importData({ password: 'reports-private-fixture' }));
  await app.close(); app = await launch(); window = await app.firstWindow(); window.on('pageerror', e => errors.push(e.message));
  await window.getByRole('button', { name: 'Mis informes', exact: true }).click(); const restored = await window.evaluate(() => window.tutor.snapshot()); assert.deepEqual(restored.learningReports, snapshot.learningReports);
  await window.getByRole('button', { name: 'Cambio de curso', exact: true }).click(); await window.getByRole('button', { name: 'Eliminar informe y versiones', exact: true }).click(); await window.getByRole('button', { name: 'Eliminar informe', exact: true }).click(); await window.getByRole('dialog').waitFor({ state: 'hidden' });
  await window.evaluate(id => window.tutor.deleteSubject(id), initial.subject.id); const remaining = await window.evaluate(() => window.tutor.snapshot()); assert.equal(remaining.learningReports.length, 0); assert.equal(remaining.reportPreferences.length, 0); assert.equal(remaining.attempts.length, 1); assert.deepEqual(errors, []);
  await writeFile(`test-results/${prefix}reports-verification.json`, JSON.stringify({ checkedAt: new Date().toISOString(), packaged, automaticWeekly: true, realAutomaticTimer: true, recoveredPendingWeeks: true, weeklyEvidenceAndChange: true, immutableVersions: true, compareOriginalWorks: true, unitCurriculum: true, selectedTransition: true, jsonScopedEvidence: true, csvExport: true, pdfOutputs: outputs, pdfHeaderVerified: true, hiddenPdfWindowDisposed: true, examGate: true, encryptedRestore: true, restart: true, smallScreen: true, deletion: true, errors }, null, 2)); console.log('Reports workflow verified. PDF files await rendering and visual verification.');
} catch (error) { await app.windows()[0]?.screenshot({ path: `test-results/${prefix}reports-failure.png` }).catch(() => {}); throw error; }
finally { await app.close(); }
