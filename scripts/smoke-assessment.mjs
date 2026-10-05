import { _electron as electron } from 'playwright';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { resolve, join } from 'node:path';
const require = createRequire(import.meta.url);
const packaged = process.argv.includes('--packaged'); const prefix = packaged ? 'packaged-' : '';
const directory = resolve('.tools/assessment-test', randomUUID()); await mkdir(directory, { recursive: true }); await mkdir('test-results', { recursive: true });
const env = { ...process.env, TUTOR_DATA_DIR: directory, TUTOR_SMOKE: '1' }; delete env.ELECTRON_RUN_AS_NODE;
const launch = () => electron.launch({ executablePath: packaged ? resolve('release/win-unpacked/Tutor Local.exe') : require('electron'), args: packaged ? [] : ['.'], env, timeout: 90000 });
const answerSheet = { 'Potencias de 2:0': '32', 'Potencias de 2:1': '64', 'Potencias de 2:2': '7', 'Potencias de 2:3': '16', 'Sistema binario:0': '10', 'Sistema binario:1': '1101', 'Sistema binario:2': '15', 'Subnetting:0': '64', 'Subnetting:1': '30', 'Subnetting:2': '26' };
let app = await launch(); const errors = [];
try {
  let window = await app.firstWindow(); window.setDefaultTimeout(45000); window.on('pageerror', error => errors.push(error.message));
  await window.getByRole('button', { name: 'Explorar un ejemplo', exact: true }).click();
  await window.getByRole('heading', { name: 'Un poco de potencias de 2.' }).waitFor();
  await window.evaluate(async () => {
    const data = await window.tutor.snapshot(); const subjectId = data.subjects[0].id;
    await window.tutor.addNote({ subjectId, name: 'Marcador de privacidad', text: 'PISTA_PRIVADA_DE_TEST con contenido que no debe llegar al simulacro.' });
    await window.tutor.createFlashcard({ subjectId, conceptId: data.concepts[0].id, front: 'TARJETA_PRIVADA_DE_TEST', back: 'La respuesta privada es cuarenta y dos.' });
    await window.tutor.saveUnit({ subjectId, title: 'Redes impartidas', objectives: 'OBJETIVO_PRIVADO_DE_TEST', startsOn: null, endsOn: null, status: 'taught', conceptIds: data.concepts.map(concept => concept.id), prerequisiteIds: [], curriculumIds: [], materialIds: [] });
  });
  await window.reload(); await window.getByRole('button', { name: 'Simulacros', exact: true }).click();
  await window.getByRole('button', { name: 'Preparar simulacro', exact: true }).click();
  await window.getByLabel('Título del simulacro').fill('Ensayo de redes sin pistas');
  await window.getByLabel('Dificultad máxima del simulacro', { exact: true }).selectOption('3');
  await window.getByLabel('Número de preguntas del simulacro', { exact: true }).selectOption('3');
  await window.getByLabel('Tiempo del simulacro', { exact: true }).selectOption('10');
  await window.screenshot({ path: `test-results/${prefix}mock-config.png` });
  await window.getByRole('button', { name: 'Empezar simulacro', exact: true }).click();
  await window.getByLabel('Respuesta al simulacro', { exact: true }).waitFor();
  let snapshot = await window.evaluate(() => window.tutor.snapshot()); let exam = snapshot.mockExams[0];
  assert.equal(exam.questions.length, 3); assert.equal(exam.status, 'active');
  assert.equal(new Set(exam.questions.map(question => question.conceptId)).size, 3);
  assert.equal(snapshot.attempts.length, 0); assert.equal(snapshot.materials.length, 0); assert.equal(snapshot.flashcards.length, 0);
  const publicData = JSON.stringify(snapshot);
  for (const marker of ['PISTA_PRIVADA_DE_TEST', 'TARJETA_PRIVADA_DE_TEST', 'OBJETIVO_PRIVADO_DE_TEST', 'answerKey']) assert.equal(publicData.includes(marker), false, `${marker} debe estar oculto durante el simulacro.`);
  assert.equal(await window.getByRole('button', { name: 'Mi tutor', exact: true }).isDisabled(), true);
  const denied = await window.evaluate(async () => {
    const data = await window.tutor.snapshot(); const subjectId = data.subjects[0].id; const conceptId = data.concepts[0].id;
    const probes = [
      ['chat', () => window.tutor.chat({ subjectId, text: 'Dame la respuesta', mode: 'explain' })],
      ['exercise', () => window.tutor.nextExercise(conceptId)],
      ['diagnostic', () => window.tutor.startDiagnostic({ subjectId, selfRatings: [] })],
      ['export', () => window.tutor.exportData({ format: 'json' })],
      ['import', () => window.tutor.importData({})],
      ['cards', () => window.tutor.generateFlashcards({ subjectId, fromErrors: true })],
      ['erase', () => window.tutor.eraseData()],
      ['subjectSettings', () => window.tutor.updateSubject({ ...data.subjects[0], goals: 'Cambiar configuración durante el simulacro' })],
      ['session', () => window.tutor.startSession({ subjectId, goal: 'Otra ayuda', minutes: 10, conceptIds: [], unitId: null, taskId: null, materialIds: [] })]
    ];
    const result = [];
    for (const [name, work] of probes) { try { await work(); result.push({ name, denied: false }); } catch (error) { result.push({ name, denied: /terminar el simulacro/.test(String(error)) }); } }
    return result;
  });
  assert.ok(denied.every(probe => probe.denied), JSON.stringify(denied));
  console.log('Simulacro iniciado y ayudas bloqueadas también por IPC.');
  const first = exam.questions[0]; await window.getByLabel('Respuesta al simulacro').fill(answerSheet[first.exerciseId]);
  await window.getByRole('button', { name: 'Guardar y siguiente', exact: true }).click();
  await window.getByRole('heading', { name: exam.questions[1].statement, exact: true }).waitFor();
  await window.getByLabel('Respuesta al simulacro').fill('99999');
  await window.getByText('Respuesta guardada en este ordenador.', { exact: true }).waitFor();
  await window.waitForFunction(async () => (await window.tutor.snapshot()).mockExams[0].answers[1].value === '99999');
  await window.screenshot({ path: `test-results/${prefix}mock-running.png` });
  await app.close(); app = await launch(); window = await app.firstWindow(); window.setDefaultTimeout(45000); window.on('pageerror', error => errors.push(error.message));
  await window.getByLabel('Respuesta al simulacro').waitFor(); assert.equal(await window.getByLabel('Respuesta al simulacro').inputValue(), '99999');
  snapshot = await window.evaluate(() => window.tutor.snapshot());
  assert.equal(snapshot.mockExams[0].id, exam.id); assert.equal(snapshot.mockExams[0].answers[0].value, answerSheet[first.exerciseId]);
  assert.equal(snapshot.attempts.length, 0); console.log('Respuestas y pregunta actual conservadas tras reiniciar.');
  await window.getByRole('button', { name: 'Guardar y siguiente', exact: true }).click();
  await window.getByRole('heading', { name: exam.questions[2].statement, exact: true }).waitFor();
  await window.getByRole('button', { name: 'Entregar simulacro', exact: true }).click();
  await window.getByRole('button', { name: 'Entregar y ver corrección', exact: true }).click();
  await window.locator('.mock-result-summary').waitFor();
  snapshot = await window.evaluate(() => window.tutor.snapshot());
  assert.equal(snapshot.mockExams[0].status, 'completed'); assert.equal(snapshot.attempts.length, 3);
  assert.deepEqual(snapshot.attempts.map(attempt => attempt.outcome), ['correct', 'incorrect', 'ungraded']);
  assert.ok(snapshot.attempts.every(attempt => attempt.purpose === 'mock' && attempt.classification));
  assert.ok(snapshot.materials.some(material => material.text.includes('PISTA_PRIVADA_DE_TEST')));
  assert.equal(await window.getByRole('button', { name: 'Mi tutor', exact: true }).isDisabled(), false);
  await window.screenshot({ path: `test-results/${prefix}mock-correction.png` });
  await window.getByRole('button', { name: 'Preparar simulacro', exact: true }).click();
  await window.getByLabel('Título del simulacro').fill('Prueba interrumpida');
  await window.getByLabel('Número de preguntas del simulacro', { exact: true }).selectOption('1');
  await window.getByRole('button', { name: 'Empezar simulacro', exact: true }).click();
  await window.getByLabel('Respuesta al simulacro').fill('123');
  await window.getByText('Respuesta guardada en este ordenador.', { exact: true }).waitFor();
  await window.getByRole('button', { name: 'Interrumpir sin corregir', exact: true }).click();
  await window.getByRole('button', { name: 'Interrumpir simulacro', exact: true }).click();
  await window.getByText('Interrumpido, sin evaluación.', { exact: false }).waitFor();
  const before = await window.evaluate(() => window.tutor.snapshot());
  assert.equal(before.attempts.length, 3); assert.equal(before.mockExams[1].status, 'cancelled'); assert.equal(before.mockExams[1].answers[0].value, '123');
  const path = join(directory, 'assessment.tutor');
  await app.evaluate(({ dialog }, path) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath: path }); dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] }); }, path);
  await window.evaluate(() => window.tutor.exportData({ format: 'encrypted', password: 'simulacros-prueba-portable' }));
  assert.equal((await readFile(path)).includes(Buffer.from('Ensayo de redes sin pistas')), false);
  await window.evaluate(() => window.tutor.eraseData()); await window.evaluate(() => window.tutor.importData({ password: 'simulacros-prueba-portable' })); await window.reload();
  const restored = await window.evaluate(() => window.tutor.snapshot()); assert.deepEqual(restored.mockExams, before.mockExams); assert.deepEqual(restored.attempts, before.attempts);
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setBounds({ width: 960, height: 700 }));
  await window.getByRole('button', { name: 'Simulacros', exact: true }).click();
  await window.getByLabel('Elegir simulacro anterior', { exact: true }).selectOption(exam.id);
  await window.screenshot({ path: `test-results/${prefix}mock-small.png` });
  assert.equal(await window.evaluate(() => { const main = document.querySelector('.main-content'); return main.scrollWidth <= main.clientWidth + 2; }), true);
  assert.deepEqual(errors, []);
  await writeFile(`test-results/${prefix}assessment-verification.json`, JSON.stringify({ checkedAt: new Date().toISOString(), packaged, questionCount: exam.questions.length, difficultyAndSequence: true, blockedHelpers: denied, hiddenResourcesAndAnswerKeys: true, restart: true, outcomes: before.attempts.map(attempt => attempt.outcome), cancelledWithoutAssessment: true, encryptedRestore: true, smallScreen: true, errors }, null, 2));
  console.log(`Simulacros ${packaged ? 'empaquetados' : 'de desarrollo'} verificados: selección, ayudas bloqueadas, respuestas, reinicio, corrección posterior, interrupción, copias y pantalla pequeña.`);
} catch (error) { const page = app.windows()[0]; if (page) await page.screenshot({ path: `test-results/${prefix}assessment-failure.png` }).catch(() => {}); throw error; }
finally { await app.close(); }
