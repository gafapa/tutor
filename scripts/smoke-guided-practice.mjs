import { prepareTestWindow } from './test-profile.mjs';
import { _electron as electron } from 'playwright';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { startMoodleHttpFixture } from './moodle-http-fixture.mjs';

const require = createRequire(import.meta.url), { arithmeticGuide, arithmeticValue } = require('../build/electron/arithmetic.js');
const packaged = process.argv.includes('--packaged'), prefix = packaged ? 'packaged-' : '', version = JSON.parse(await readFile('package.json', 'utf8')).version;
const fixture = await startMoodleHttpFixture(), directory = resolve('.tools/guided-desktop-test', randomUUID());
fixture.state.submissionText = '<p>2+3*4=11</p>';
await mkdir(directory, { recursive: true }); await mkdir('test-results', { recursive: true });
const env = { ...process.env, TUTOR_DATA_DIR: directory, TUTOR_SMOKE: '1' }; delete env.ELECTRON_RUN_AS_NODE;
const launch = () => electron.launch({ executablePath: packaged ? resolve('release/win-unpacked/Tutor Local.exe') : require('electron'), args: packaged ? [] : ['.'], env, timeout: 60000 });
let app, window, stopped = false; const errors = [];
async function open() { app = await launch(); window = await app.firstWindow(); await prepareTestWindow(window); window.setDefaultTimeout(60000); window.on('pageerror', error => errors.push(error.message)); await window.waitForFunction(() => Boolean(window.tutor)); }
async function goToPlan(id) { await window.getByRole('button', { name: 'Cómo aprendo', exact: true }).click(); await window.getByRole('button', { name: /^Mis refuerzos/ }).click(); await window.getByLabel('Refuerzo a consultar', { exact: true }).selectOption(id); }
try {
  await open();
  const connection = await window.evaluate(async input => { const discovery = await window.tutor.discoverMoodle(input); const [connection] = await window.tutor.connectMoodleCourses({ discoveryId: discovery.id, courses: [{ courseId: 1 }], autoMinutes: 0 }); await window.tutor.syncMoodle(connection.id); return connection; }, { siteUrl: fixture.siteUrl, token: fixture.token });
  await window.reload({ waitUntil: 'domcontentloaded' }); await window.getByRole('button', { name: 'Cómo aprendo', exact: true }).click();
  const before = await window.evaluate(() => window.tutor.snapshot()), item = before.lmsItems.find(row => row.data.kind === 'activity' && row.data.module === 'assign'); assert.ok(item);
  const requests = fixture.requests.length;
  await window.getByLabel('Entrega de Moodle para revisar', { exact: true }).selectOption(item.id); await window.getByRole('button', { name: 'Revisar esta entrega y preparar práctica', exact: true }).click();
  await window.getByText('Enunciado y comentarios de la entrega original', { exact: true }).waitFor(); await window.getByRole('button', { name: 'Me representa', exact: true }).waitFor();
  let snapshot = await window.evaluate(() => window.tutor.snapshot()); const entry = snapshot.portfolio.find(row => row.moodlePracticeSource); assert.equal(entry.content, '2+3*4=11'); assert.equal(snapshot.learningAnalyses[0].source.kind, 'portfolio'); assert.deepEqual(snapshot.attempts, before.attempts); assert.equal(fixture.requests.length, requests);
  await window.getByRole('button', { name: 'Me representa', exact: true }).click(); await window.getByLabel('¿Por qué la aceptas o dejas de usarla?', { exact: true }).fill('Sumé antes de multiplicar. Quiero revisar el orden.'); await window.getByRole('button', { name: 'Guardar revisión', exact: true }).click(); await window.getByRole('button', { name: 'Probar un refuerzo', exact: true }).click();
  await window.getByRole('heading', { name: 'Practicar cálculo', exact: true }).waitFor(); snapshot = await window.evaluate(() => window.tutor.snapshot()); const plan = snapshot.interventions[0]; assert.equal(plan.guided, true); assert.equal('guidance' in plan, false); assert.ok(plan.activities.every(activity => !('expected' in activity) && activity.hint === ''));
  const hintButton = window.getByRole('button', { name: 'Pedir la siguiente pista', exact: true }); assert.equal(await hintButton.isEnabled(), false);
  await window.getByLabel('Mi intento de este paso', { exact: true }).fill('0'); await window.getByRole('button', { name: 'Comprobar este paso', exact: true }).click(); await hintButton.waitFor(); await window.waitForFunction(() => [...document.querySelectorAll('button')].some(button => button.textContent === 'Pedir la siguiente pista' && !button.disabled)); await hintButton.click(); await window.getByText(/^Pista 1:/).waitFor();
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setBounds({ width: 1400, height: 1000 })); await window.getByRole("heading",{name:plan.activities[0].statement,exact:true}).scrollIntoViewIfNeeded(); await window.screenshot({ path: `test-results/${prefix}guided-practice-wide.png` });
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setBounds({ width: 960, height: 700 })); assert.equal(await window.evaluate(() => { const main = document.querySelector('.main-content'); return main.scrollWidth <= main.clientWidth + 2; }), true); await window.getByRole("heading",{name:plan.activities[0].statement,exact:true}).scrollIntoViewIfNeeded(); await window.screenshot({ path: `test-results/${prefix}guided-practice-960.png` });
  await window.evaluate(id => window.tutor.disconnectMoodle(id), connection.id); await fixture.stop(); stopped = true;
  await app.close(); app = undefined; await open(); await goToPlan(plan.id); await window.getByText(/^Pista 1:/).waitFor();
  assert.equal((await window.evaluate(input => window.tutor.guidedPractice(input), { interventionId: plan.id, activityId: plan.activities[0].id })).attempts[0].answer, '0');
  for (const [activityIndex, activity] of plan.activities.slice(0, 2).entries()) {
    for (const step of arithmeticGuide(activity.expression)) {
      await window.getByText(`Calcula este paso: ${step.expression}`, { exact: true }).waitFor(); await window.getByLabel('Mi intento de este paso', { exact: true }).fill(step.expected); await window.getByRole('button', { name: 'Comprobar este paso', exact: true }).click();
    }
    await window.getByText('Práctica terminada. Tus intentos y pistas se conservan; falta la comprobación en otro día.', { exact: true }).nth(activityIndex).waitFor();
  }
  snapshot = await window.evaluate(() => window.tutor.snapshot()); assert.equal(snapshot.interventionResponses.length, 2); assert.equal(snapshot.interventionResponses[0].hints, 1); assert.equal(await window.getByLabel(`Respuesta al refuerzo ${plan.activities[2].id}`, { exact: true }).count(), 0);
  await window.getByRole('button', { name: 'Mi plan', exact: true }).click(); await window.getByRole('region', { name: 'Mis comprobaciones de aprendizaje pendientes' }).waitFor();
  await window.getByRole("region", { name: "Mis comprobaciones de aprendizaje pendientes" }).scrollIntoViewIfNeeded(); await window.screenshot({path:`test-results/${prefix}guided-cycle-reminder.png`});
  await window.getByRole("button",{name:"Mi seguimiento",exact:true}).click(); await window.getByRole("region", { name: "Mis comprobaciones de aprendizaje pendientes" }).waitFor(); await window.getByRole("button",{name:"Mi plan",exact:true}).click();
  const nextDay = Date.now() + 2 * 86400000;
  await app.evaluate((_electron, now) => { const NativeDate = Date; globalThis.Date = class extends NativeDate { constructor(...args) { if (args.length) super(...args); else super(now); } static now() { return now; } }; }, nextDay);
  await window.evaluate(now => { const NativeDate = Date; globalThis.Date = class extends NativeDate { constructor(...args) { if (args.length) super(...args); else super(now); } static now() { return now; } }; }, nextDay);
  await window.getByRole('button', { name: 'Consultar mi comprobación', exact: true }).click(); await window.getByLabel('Refuerzo a consultar', { exact: true }).waitFor(); assert.equal(await window.getByLabel('Refuerzo a consultar', { exact: true }).inputValue(), plan.id);
  assert.equal(await window.getByRole('button', { name: 'Pedir una pista', exact: true }).isEnabled(), false);
  await window.getByLabel(`Respuesta al refuerzo ${plan.activities[2].id}`, { exact: true }).fill(arithmeticValue(plan.activities[2].expression)); await window.getByRole('button', { name: 'Guardar y comprobar', exact: true }).click(); await window.getByText(/^Has resuelto esta comprobación sin ayuda\./).waitFor();
  await window.getByLabel('¿Qué explicación o estrategia te ayudó?', { exact: true }).fill('Multiplicar antes de sumar.'); await window.getByLabel('¿Por qué fallaste y qué harías ahora?', { exact: true }).fill('Apliqué el orden equivocado; comprobaré cada paso.'); await window.getByLabel('Siguiente paso', { exact: true }).fill('Usar la estrategia en otro problema.'); await window.getByRole('button', { name: 'Guardar reflexión', exact: true }).click(); await window.getByText('Siguiente paso: Usar la estrategia en otro problema.', { exact: true }).waitFor();
  snapshot = await window.evaluate(() => window.tutor.snapshot()); assert.equal(snapshot.interventionResponses.length, 3); assert.equal(snapshot.interventionResponses[2].hints, 0); assert.equal(snapshot.interventionResponses[2].outcome, 'correct'); assert.deepEqual(snapshot.estimates, before.estimates); assert.deepEqual(snapshot.attempts, before.attempts);
  await window.getByText(/^Has resuelto esta comprobación sin ayuda\./).scrollIntoViewIfNeeded(); await window.screenshot({ path: `test-results/${prefix}guided-practice-result.png` });
  const backup = join(directory, 'cycle.tutor'), password = 'Synthetic guided cycle backup password'; await app.evaluate(({ dialog }, path) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath: path }); }, backup); await window.evaluate(password => window.tutor.exportData({ format: 'encrypted', password }), password);
  await app.evaluate(({ dialog }, path) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] }); }, backup); await window.evaluate(password => window.tutor.importData({ password }), password);
  await app.close(); app = undefined; await open(); const restored = await window.evaluate(() => window.tutor.snapshot()); assert.deepEqual(restored.interventionResponses, snapshot.interventionResponses); assert.deepEqual(restored.interventionReviews, snapshot.interventionReviews); assert.equal(restored.portfolio.find(row => row.id === entry.id).content, entry.content); assert.deepEqual(errors, []);
  await writeFile(`test-results/${prefix}guided-practice-verification.json`, JSON.stringify({ checkedAt: new Date().toISOString(), version, packaged, source: 'deterministic synthetic Moodle REST double', authoritativeStudentTextAndFeedback: true, confirmationBeforeReinforcement: true, serverOwnedStepProgressAndHints: true, attemptedBeforeHint: true, sequentialPractice: true, nextDayGuard: true, simulatedNextDay: true, independentCheckWithoutHints: true, pendingPlanReminderAndNavigation: true, offlineEncryptedRestartDuringPractice: true, encryptedBackupAndCompletedCycleRestart: true, noMoodleWriteOrNewRequests: true, noInventedAttemptsOrMastery: true, narrowNoOverflow: true, errors }, null, 2) + '\n');
  console.log('Moodle evidence, guided practice, persistent hints and a simulated next-day independent check verified.');
} catch (error) { await window?.screenshot({ path: `test-results/${prefix}guided-practice-failure.png` }).catch(() => {}); throw error; }
finally { await app?.close().catch(() => {}); if (!stopped) await fixture.stop(); }
