import { prepareTestWindow } from './test-profile.mjs';
import { _electron as electron } from 'playwright';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { resolve, join } from 'node:path';

const require = createRequire(import.meta.url), packaged = process.argv.includes('--packaged'), prefix = packaged ? 'packaged-' : '';
const directory = resolve('.tools/desktop-test', randomUUID()); await mkdir(directory, { recursive: true });
const env = { ...process.env, TUTOR_DATA_DIR: directory, TUTOR_SMOKE: '1' }; delete env.ELECTRON_RUN_AS_NODE;
const launch = () => electron.launch({ executablePath: packaged ? resolve('release/win-unpacked/Tutor Local.exe') : require('electron'), args: packaged ? [] : ['.'], env, timeout: 60000 });
let app, window; const errors = [];
try {
  app = await launch(); window = await app.firstWindow(); await prepareTestWindow(window); window.setDefaultTimeout(60000); window.on('pageerror', error => errors.push(error.message));
  assert.equal(await app.evaluate(({ app }) => app.getVersion()), JSON.parse(await readFile('package.json', 'utf8')).version);
  const subject = await window.evaluate(() => window.tutor.createDemo());
  const entry = await window.evaluate(subjectId => window.tutor.savePortfolio({ subjectId, title: 'Comparación para mi siguiente práctica', content: 'Datos sintéticos: primer intento 12, segundo intento 16.', reflection: 'Qué he cambiado\nRevisé los factores.\n\nQué practicaré después\nPracticaré cinco bits sin ayuda.', kind: 'work', conceptIds: [], evidenceIds: [] }), subject.id);
  await window.reload({ waitUntil: 'domcontentloaded' }); await window.getByRole('button', { name: 'Portfolio', exact: true }).click(); await window.getByRole('button', { name: 'Leer trabajo y evidencias', exact: true }).click(); await window.getByRole('button', { name: 'Crear tarea desde este trabajo', exact: true }).click();
  await window.getByLabel('Título de mi siguiente tarea', { exact: true }).fill('Practicar cinco bits por mi cuenta'); await window.getByLabel('Qué voy a practicar', { exact: true }).fill('Calcularé las combinaciones y justificaré cada factor.'); await window.getByLabel('Minutos previstos', { exact: true }).fill('15');
  const today = await window.getByLabel('Fecha prevista para practicar', { exact: true }).inputValue();
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setBounds({ width: 1400, height: 1000 })); await window.screenshot({ path: `test-results/${prefix}portfolio-task-wide.png` });
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setBounds({ width: 960, height: 700 }));
  assert.equal(await window.evaluate(() => { const dialog = document.querySelector('dialog[open]'); return dialog.scrollWidth <= dialog.clientWidth + 2; }), true); await window.screenshot({ path: `test-results/${prefix}portfolio-task-960.png` });
  const before = await window.evaluate(() => window.tutor.snapshot());
  await window.getByRole('button', { name: 'Añadir esta práctica a mi plan', exact: true }).click(); await window.getByRole('heading', { name: 'Un plan que tenga sentido para ti.', exact: true }).waitFor();
  let snapshot = await window.evaluate(() => window.tutor.snapshot()); const task = snapshot.tasks.find(row => row.portfolioSource?.entryId === entry.id); assert.ok(task); assert.equal(task.lms, undefined); assert.equal(task.dueDate, today); assert.equal(task.estimatedMinutes, 15); assert.equal(task.portfolioSource.content, entry.content); assert.equal(task.portfolioSource.reflection, entry.reflection);
  const duplicate = await window.evaluate(input => window.tutor.createPortfolioTask(input), { portfolioId: entry.id, title: task.title, notes: task.notes, dueDate: today, estimatedMinutes: 15 }); assert.equal(duplicate.id, task.id);
  assert.ok(snapshot.plans.find(row => row.subjectId === subject.id).items.some(row => row.kind === 'task' && row.targetId === task.id));
  await window.getByRole('button', { name: /^Mis tareas/ }).click(); await window.getByRole('button', { name: 'Ver trabajo y reflexión de origen', exact: true }).click(); await window.getByRole('dialog').getByText(entry.content, { exact: true }).waitFor(); await window.getByRole('dialog').getByText(entry.reflection, { exact: true }).waitFor(); await window.screenshot({ path: `test-results/${prefix}portfolio-task-source.png` }); await window.getByRole('button', { name: 'Cerrar', exact: true }).click();
  await window.getByRole('button', { name: `Marcar terminada ${task.title}`, exact: true }).click();
  snapshot = await window.evaluate(() => window.tutor.snapshot()); assert.equal(snapshot.tasks.find(row => row.id === task.id).status, 'completed'); assert.deepEqual(snapshot.attempts, before.attempts); assert.deepEqual(snapshot.estimates, before.estimates); assert.deepEqual(snapshot.portfolio, before.portfolio); assert.deepEqual(snapshot.lmsItems, before.lmsItems);
  await window.getByRole('button', { name: 'Portfolio', exact: true }).click(); await window.getByRole('button', { name: `Eliminar del portfolio ${entry.title}`, exact: true }).click(); await window.getByRole('button', { name: 'Retirar entrada', exact: true }).click();
  await window.getByRole('button', { name: 'Mi plan', exact: true }).click(); await window.getByRole('button', { name: /^Mis tareas/ }).click(); await window.getByLabel('Filtrar tareas', { exact: true }).selectOption('completed'); await window.getByRole('button', { name: 'Ver trabajo y reflexión de origen', exact: true }).click(); await window.getByText('La entrada original se retiró del portfolio. Esta copia se conserva con tu tarea.', { exact: true }).waitFor(); await window.getByRole('dialog').getByText(entry.content, { exact: true }).waitFor(); await window.screenshot({ path: `test-results/${prefix}portfolio-task-detached.png` }); await window.getByRole('button', { name: 'Cerrar', exact: true }).click();
  const backup = join(directory, 'practice.tutor'), password = 'Synthetic portfolio task backup password';
  await app.evaluate(({ dialog }, path) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath: path }); }, backup); await window.evaluate(password => window.tutor.exportData({ format: 'encrypted', password }), password);
  await app.evaluate(({ dialog }, path) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] }); }, backup); await window.evaluate(password => window.tutor.importData({ password }), password);
  await app.close(); app = await launch(); window = await app.firstWindow(); await prepareTestWindow(window); window.on('pageerror', error => errors.push(error.message)); const restored = await window.evaluate(() => window.tutor.snapshot()); const restoredTask = restored.tasks.find(row => row.id === task.id); assert.equal(restoredTask.portfolioSource.entryId, null); assert.equal(restoredTask.portfolioSource.content, entry.content); assert.equal(restoredTask.status, 'completed'); assert.equal(restored.portfolio.length, 0); assert.deepEqual(restored.attempts, before.attempts); assert.deepEqual(errors, []);
  await writeFile(`test-results/${prefix}portfolio-tasks-verification.json`, JSON.stringify({ checkedAt: new Date().toISOString(), packaged, localSyntheticPortfolio: true, explicitTitleDateAndDuration: true, appearsInDailyPlan: true, authoritativeSourceSnapshot: true, pendingDuplicateSuppressed: true, completionWithoutMastery: true, detachedSourceVisible: true, encryptedBackupAndRestart: true, noMoodleConnectionOrWrite: true, narrowDialogNoOverflow: true, errors }, null, 2));
  console.log('Local portfolio practice tasks verified through creation, completion, source removal and encrypted restart.');
} catch (error) { await window?.screenshot({ path: `test-results/${prefix}portfolio-tasks-failure.png` }).catch(() => {}); throw error; }
finally { await app?.close(); }
