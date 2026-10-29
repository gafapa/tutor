import { prepareTestWindow } from './test-profile.mjs';
import { _electron as electron } from 'playwright';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { createOcrFixtures } from './ocr-fixtures.mjs';

const require = createRequire(import.meta.url), packaged = process.argv.includes('--packaged'), prefix = packaged ? 'packaged-' : '';
const directory = resolve('.tools/ocr-desktop-test', randomUUID()), files = await createOcrFixtures(directory); await mkdir('test-results', { recursive: true });
const env = { ...process.env, TUTOR_DATA_DIR: directory, TUTOR_SMOKE: '1', TUTOR_OCR_PRIVATE_TEST: 'not-in-ocr-environment' }; delete env.ELECTRON_RUN_AS_NODE;
const launch = () => electron.launch({ executablePath: packaged ? resolve('release/win-unpacked/Tutor Local.exe') : require('electron'), args: packaged ? [] : ['.'], env, timeout: 60000 });
let app = await launch(); const errors = [], proof = { version: JSON.parse(await readFile('package.json', 'utf8')).version, syntheticPrintedImages: true, realHandwritingQuality: 'not verified', multimodalResponse: 'deterministic double; native Gemma qualification is separate', checks: [] };
try {
  let window = await app.firstWindow(); await prepareTestWindow(window); window.on('pageerror', error => errors.push(error.message));
  await app.evaluate(({ utilityProcess, BrowserWindow }) => {
    const fork = utilityProcess.fork.bind(utilityProcess); globalThis.ocrForks = []; globalThis.ocrExits = 0; globalThis.ocrFixtureErrors = [];
    utilityProcess.fork = (path, args, options) => { const child = fork(path, args, options); if (path.endsWith('ocr-process.js')) { globalThis.ocrForks.push({ keys: Object.keys(options.env).sort(), partition: options.partition, stdio: options.stdio, heap: options.execArgv }); child.once('exit', () => globalThis.ocrExits++); child.on('message', message => { if (typeof message.error === 'string') globalThis.ocrFixtureErrors.push(message.error.slice(0, 300)); if (message.progress && globalThis.cancelOcrOnProgress) { globalThis.cancelOcrOnProgress = false; void BrowserWindow.getAllWindows()[0].webContents.executeJavaScript('window.tutor.cancelOcr()'); } }); } return child; };
  });
  await app.evaluate(({app}) => {
    const hostRequire = typeof require === 'function' ? require : process.mainModule.require.bind(process.mainModule);
    const {createRequire}=hostRequire('node:module'), {join}=hostRequire('node:path');
    const { AIService } = createRequire(join(app.getAppPath(),'package.json'))('./build/electron/ai-service.js');
    AIService.prototype.complete = async function(messages, options) {
      if (!options?.image?.base64 || options.image.mime !== 'image/jpeg') throw new Error('Expected a real prepared image');
      return globalThis.visionTestBlank ? '' : 'Ejercicio de calculo: 2 + 2 = 5. O alumnado aprende. The student learns. PAGINA DOS. PAGINA TRES.';
    };
  });
  await window.evaluate(() => window.tutor.configureAI({provider:'local',modelId:'qwen-1.5b',cloudConsent:false}));
  await assert.rejects(() => window.evaluate(() => window.tutor.recognizeDocument({subjectId:'00000000-0000-4000-8000-000000000000',language:'spa',firstPage:1,lastPage:1,rotation:0})), /solo admite texto/);
  await window.evaluate(() => window.tutor.configureAI({provider:'local',modelId:'gemma4-e2b',cloudConsent:false}));
  const subject = await window.evaluate(() => window.tutor.createDemo()); await window.reload();
  const opts = { subjectId: subject.id, language: 'spa', firstPage: 1, lastPage: 1, rotation: 0 };
  const picker = path => app.evaluate(({ dialog }, path) => { dialog.showOpenDialog = async (_window, options) => { globalThis.ocrExtensions = options.filters?.[0]?.extensions; return { canceled: false, filePaths: [path] }; }; }, path);
  const read = async (path, changes = {}) => { await app.evaluate((_electron, blank) => { globalThis.visionTestBlank = blank; }, path === files.blank); await picker(path); return window.evaluate(options => window.tutor.recognizeDocument(options), { ...opts, ...changes }); };
  const discard = drafts => window.evaluate(ids => window.tutor.discardOcrDrafts(ids), drafts.map(row => row.draftId));
  const commit = (draft, changes = {}) => window.evaluate(input => window.tutor.commitOcrDraft(input), { draftId: draft.draftId, text: draft.capture.recognition.text, confirmed: true, destination: 'material', name: draft.capture.name, statement: '', conceptId: null, ...changes });
  await window.getByRole('button', { name: 'Materiales', exact: true }).click();
  await picker(files.png); await window.getByRole('button', { name: 'Leer imagen o PDF escaneado', exact: true }).click();
  await window.getByRole('button', { name: 'Seleccionar archivo y leer', exact: true }).click();
  const reviewDialog = window.getByRole('dialog', { name: 'Revisar la captura', exact: true }); await reviewDialog.waitFor({ timeout: 120000 });
  assert.match(await reviewDialog.getByLabel('Texto revisado', { exact: true }).inputValue(), /2\s*\+\s*2\s*=\s*5/);
  assert.equal((await window.evaluate(() => window.tutor.snapshot())).captures.length, 0);
  assert.equal(await reviewDialog.getByRole('button', { name: 'Guardar texto revisado', exact: true }).isEnabled(), false);
  await reviewDialog.getByLabel('Título', { exact: true }).fill('Cálculo confirmado');
  await reviewDialog.getByLabel('Texto revisado', { exact: true }).fill('Ejercicio de cálculo\n2 + 2 = 5\n5 × 3 = 15');
  await reviewDialog.getByRole('checkbox', { name: 'He comparado el texto', exact: false }).check();
  await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(960, 800));
  await window.screenshot({ path: `test-results/${prefix}ocr-review-960.png` });
  await reviewDialog.getByRole('button', { name: 'Guardar texto revisado', exact: true }).click(); await reviewDialog.waitFor({ state: 'hidden' });
  let data = await window.evaluate(() => window.tutor.snapshot()); const original = data.materials.find(row => row.name === 'Cálculo confirmado'); assert.equal(original.kind, 'ocr'); assert.equal(data.captures.length, 1);
  assert.equal('image' in data.captures[0], false); assert.equal('text' in data.captureReviews[0], false);
  const detail = await window.evaluate(id => window.tutor.captureData(id), data.captures[0].id); assert.equal(Buffer.from(detail.capture.image.base64, 'base64').includes(Buffer.from('fixture-metadata-not-stored')), false);
  assert.equal(detail.capture.recognition.words.length, 0); assert.equal(detail.capture.recognition.confidence, null); assert.equal(detail.capture.recognition.engine, 'multimodal'); assert.equal(detail.capture.image.mime, 'image/jpeg');
  await window.screenshot({ path: `test-results/${prefix}ocr-library-960.png` });
  await window.getByRole('button', { name: 'Ver y revisar', exact: true }).click(); const editDialog = window.getByRole('dialog', { name: 'Revisar la captura', exact: true });
  await editDialog.getByLabel('Texto revisado', { exact: true }).fill('Ejercicio de cálculo\n2 + 2 = 4\n5 × 3 = 15'); await editDialog.getByLabel('Título', { exact: true }).fill('Cálculo confirmado');
  await editDialog.getByRole('checkbox', { name: 'He comparado el texto', exact: false }).check(); await editDialog.getByRole('button', { name: 'Guardar nueva revisión', exact: true }).click(); await editDialog.waitFor({ state: 'hidden' });
  data = await window.evaluate(() => window.tutor.snapshot()); assert.equal(data.materials.find(row => row.name === 'Cálculo confirmado' && row.version === 2).text.includes('2 + 2 = 4'), true);
  const updated = await window.evaluate(id => window.tutor.captureData(id), detail.capture.id); assert.equal(updated.reviews.length, 2); assert.equal(updated.capture.recognition.text, detail.capture.recognition.text); assert.equal(updated.reviews[0].text, original.text);
  await window.getByRole('button', { name: 'Ver y revisar', exact: true }).click(); await window.getByText('Revisiones anteriores (2)', { exact: true }).click(); await window.screenshot({ path: `test-results/${prefix}ocr-history-960.png` }); await window.getByRole('dialog').getByRole('button', { name: 'Cerrar', exact: true }).click();
  proof.checks.push('mandatory human review, edited text, immutable original, material versions, metadata removal, scoped summaries, 960px review/history/library');
  // Exercise capture is ungraded; arithmetic checks the confirmed text, not the OCR output.
  await window.getByRole('button', { name: 'Practicar', exact: true }).click(); await picker(files.jpeg); await window.getByRole('button', { name: 'Capturar mi resolución', exact: true }).click(); await window.getByRole('button', { name: 'Seleccionar archivo y leer', exact: true }).click(); await reviewDialog.waitFor({ timeout: 120000 });
  await reviewDialog.getByLabel('Texto revisado', { exact: true }).fill('2 + 2 = 5\n5 × 3 = 15'); await reviewDialog.getByLabel('Enunciado del ejercicio', { exact: true }).fill('Comprueba las igualdades de mi resolución.'); await reviewDialog.getByRole('checkbox', { name: 'He comparado el texto', exact: false }).check(); await reviewDialog.getByRole('button', { name: 'Guardar texto revisado', exact: true }).click(); await reviewDialog.waitFor({ state: 'hidden' });
  data = await window.evaluate(() => window.tutor.snapshot()); const attempt = data.attempts.at(-1); assert.equal(attempt.source, 'self'); assert.equal(attempt.outcome, 'ungraded'); assert.ok(attempt.ocrSource); assert.ok(data.estimates.every(row => row.status === 'unseen'));
  const analysis = await window.evaluate(id => window.tutor.analyzeSteps({ kind: 'attempt', id }), attempt.id); assert.deepEqual(analysis.steps.map(row => row.correct), [false, true]); assert.equal(analysis.observations.length, 1);
  await window.getByRole('button', { name: 'Ver imagen y revisión original', exact: true }).click(); await window.getByRole('dialog').waitFor(); await window.screenshot({ path: `test-results/${prefix}ocr-exercise-source-960.png` }); await window.getByRole('dialog').getByRole('button', { name: 'Cerrar', exact: true }).click();
  proof.checks.push('native JPEG exercise capture, source image, ungraded attempt, first arithmetic error on reviewed text, no mastery change');
  // Language hints and bitmap preparation are exercised with a deterministic vision response.
  for (const [path, language, expected, rotation] of [[files.webp, 'spa', /calculo/i, 0], [files.glg, 'glg', /alumnado/i, 0], [files.eng, 'eng', /student/i, 0], [files.eng, 'spa+eng', /student/i, 0], [files.rotated, 'spa', /calculo/i, 270]]) { const drafts = await read(path, { language, rotation }); assert.equal(drafts.length, 1); assert.match(drafts[0].capture.recognition.text, expected); await discard(drafts); }
  const blank = await read(files.blank); assert.equal(blank[0].capture.recognition.text, ''); await discard(blank);
  proof.checks.push('multimodal response double with language hints; real preparation of PNG/JPEG/WebP; rotated image; blank image stays unsaved');
  const scanned = await read(files.pdf, { firstPage: 2, lastPage: 3 }); assert.deepEqual(scanned.map(row => row.capture.sourcePage), [2, 3]); assert.match(scanned[0].capture.recognition.text, /PAGINA DOS/); assert.match(scanned[1].capture.recognition.text, /PAGINA TRES/); await commit(scanned[0]); await discard([scanned[1]]);
  await assert.rejects(() => read(files.pdf, { firstPage: 3, lastPage: 4 }), /contiene 3 páginas/);
  proof.checks.push('image-only scanned PDF, selected original pages 2 and 3, per-page review, out-of-range rejection');
  // Cancel after the utility process is launched, before recognition can complete.
  await picker(files.png); await app.evaluate(() => { globalThis.cancelOcrOnProgress = true; });
  const cancelled = await window.evaluate(options => window.tutor.recognizeDocument(options).then(() => ({ completed: true }), error => ({ error: error.message })), opts);
  assert.match(cancelled.error, /cancelada/); assert.equal(await window.evaluate(() => window.tutor.ocrProgress()), null);
  let forkProof = await app.evaluate(() => ({ forks: globalThis.ocrForks, exits: globalThis.ocrExits })); assert.equal(forkProof.exits, forkProof.forks.length); assert.ok(forkProof.forks.every(row => row.keys.every(key => ['SystemRoot', 'WINDIR', 'TEMP', 'TMP', 'SystemDrive'].includes(key)) && row.partition.startsWith('ocr-') && row.stdio === 'ignore' && row.heap.includes('--max-old-space-size=512')));
  proof.checks.push('utility-process cancellation and exit; isolated session; no inherited application credentials; bounded heap');
  const pendingDraft = (await read(files.png))[0]; data = await window.evaluate(() => window.tutor.snapshot()); const concept = data.concepts[0];
  const exam = await window.evaluate(input => window.tutor.startMockExam(input), { subjectId: subject.id, title: 'Bloqueo de capturas', unitId: null, conceptIds: [concept.id], maxDifficulty: 3, minutes: 10, questionCount: 1 });
  const locked = await window.evaluate(() => window.tutor.snapshot()); assert.equal(locked.captures.length, 0); assert.equal(locked.captureReviews.length, 0); await assert.rejects(() => window.evaluate(id => window.tutor.captureData(id), detail.capture.id), /simulacro/); await window.evaluate(id => window.tutor.cancelMockExam(id), exam.id); await assert.rejects(() => commit(pendingDraft), /caducado|descartado/);
  // Pending native file selection must not resurrect a deleted subject.
  const temporary = await window.evaluate(() => window.tutor.createSubject({ name: 'Borrar durante OCR', level: '', teacher: '', goals: '', color: 'blue' }));
  await app.evaluate(({ dialog }, path) => { dialog.showOpenDialog = () => new Promise(resolve => { globalThis.releaseOcrDialog = () => resolve({ canceled: false, filePaths: [path] }); }); }, files.png);
  const selecting = window.evaluate(options => window.tutor.recognizeDocument(options).then(() => ({ completed: true }), error => ({ error: error.message })), { ...opts, subjectId: temporary.id }); await delay(50); await window.evaluate(id => window.tutor.deleteSubject(id), temporary.id); assert.match((await selecting).error, /cancelada/); await app.evaluate(() => globalThis.releaseOcrDialog());
  proof.checks.push('exam hides source collections and blocks source APIs; clears drafts; delete subject during picker prevents late import');
  const beforeReload = (await read(files.png))[0]; await window.reload();
  await assert.rejects(() => commit(beforeReload), /caducado|descartado/);
  await discard(await read(files.png));
  proof.checks.push('renderer reload clears unconfirmed images and permits a fresh reading');
  const backupPath = join(directory, 'capturas.tutor');
  await app.evaluate(({ dialog }, path) => { dialog.showSaveDialog = async () => ({ canceled: false, filePath: path }); dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [path] }); }, backupPath);
  await window.evaluate(() => window.tutor.exportData({ format: 'encrypted', password: 'copias-ocr-privadas' })); assert.equal((await readFile(backupPath)).includes(Buffer.from(detail.capture.image.base64.slice(0, 120))), false);
  await window.evaluate(() => window.tutor.eraseData()); await window.evaluate(() => window.tutor.importData({ password: 'copias-ocr-privadas' }));
  await app.close(); app = await launch(); window = await app.firstWindow(); await prepareTestWindow(window); window.on('pageerror', error => errors.push(error.message)); data = await window.evaluate(() => window.tutor.snapshot()); assert.equal(data.captures.length, 3); assert.equal(data.captureReviews.length, 4); assert.equal((await window.evaluate(id => window.tutor.captureData(id), detail.capture.id)).reviews.length, 2);
  await window.evaluate(id => window.tutor.deleteCapture(id), attempt.ocrSource.captureId); data = await window.evaluate(() => window.tutor.snapshot()); assert.equal(data.attempts.find(row => row.id === attempt.id).ocrSource.removed, true); await assert.rejects(() => window.evaluate(id => window.tutor.captureData(id), attempt.ocrSource.captureId), /encuentra/);
  // Real scanned PDF preparation, deterministic multimodal transcription and curriculum extraction.
  await app.evaluate(({app}) => {
    const hostRequire=typeof require==='function'?require:process.mainModule.require.bind(process.mainModule);
    const {createRequire}=hostRequire('node:module'),{join}=hostRequire('node:path');
    const {AIService}=createRequire(join(app.getAppPath(),'package.json'))('./build/electron/ai-service.js');
    AIService.prototype.complete=async function(messages,options){
      if(options.image)return 'Unidad visual: estudiar fracciones con ejemplos.';
      const page=Number(messages.at(-1).content.match(/Page (\d+)/)[1]);
      return JSON.stringify({rows:[{kind:'unit',code:'V'+page,title:'Fracciones visuales '+page,description:'Revisar ejemplos.',page,quote:'Unidad visual: estudiar fracciones'}]});
    };
  });
  await picker(files.pdf);
  const programme=await window.evaluate(id=>window.tutor.prepareProgramme(id),subject.id);
  assert.equal(programme.pages.length,3);assert.equal(programme.rows.length,3);
  assert.ok(programme.warnings.some(text=>text.includes('transcripción de IA')));
  assert.ok(programme.pages.every(page=>page.image.base64&&page.text.includes('Unidad visual')));
  assert.equal((await window.evaluate(()=>window.tutor.snapshot())).units.length,0);
  await window.evaluate(draft=>window.tutor.commitProgramme({draftId:draft.id,rows:draft.rows}),programme);
  assert.equal((await window.evaluate(()=>window.tutor.snapshot())).units.length,3);
  proof.checks.push('scanned programme PDF renders all pages, returns visual sources, warns about AI transcription, saves only after explicit confirmation');
  await window.evaluate(id => window.tutor.deleteSubject(id), subject.id); data = await window.evaluate(() => window.tutor.snapshot()); assert.equal(data.captures.length, 0); assert.equal(data.captureReviews.length, 0); assert.equal(data.attempts.length, 0);
  proof.checks.push('encrypted portable copy, erase/restore/restart, targeted image deletion keeps reviewed text, subject deletion cascades');
  assert.deepEqual(errors, []); proof.checkedAt = new Date().toISOString(); proof.errors = errors; await writeFile(`test-results/${prefix}ocr-verification.json`, JSON.stringify(proof, null, 2)); console.log(`Multimodal capture desktop checks passed (${proof.checks.length} groups).`);
} catch (error) { try { console.error('Synthetic OCR fixture errors:', await app.evaluate(() => globalThis.ocrFixtureErrors?.slice(-3))); await (await app.firstWindow()).screenshot({ path: `test-results/${prefix}ocr-failure.png` }); } catch {} throw error; }
finally { await app.close().catch(() => {}); }
