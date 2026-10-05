import { _electron as electron } from 'playwright';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, link, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { resolve, join } from 'node:path';
const require = createRequire(import.meta.url); const { MODEL } = require('../build/electron/model-config.js');
const packaged = process.argv.includes('--packaged'); const prefix = packaged ? 'packaged-' : '';
const directory = resolve('.tools/rubrics-ai-test', randomUUID()); await mkdir(join(directory, 'models'), { recursive: true }); await mkdir('test-results', { recursive: true });
await link(resolve('.tools/ai-test/models', MODEL.filename), join(directory, 'models', MODEL.filename));
const env = { ...process.env, TUTOR_DATA_DIR: directory, TUTOR_SMOKE: '1' }; delete env.ELECTRON_RUN_AS_NODE;
const app = await electron.launch({ executablePath: packaged ? resolve('release/win-unpacked/Tutor Local.exe') : require('electron'), args: packaged ? [] : ['.'], env, timeout: 90000 });
let progressTimer; const errors = [];
try {
  const window = await app.firstWindow(); window.setDefaultTimeout(45000); window.on('pageerror', error => errors.push(error.message));
  await window.getByRole('button', { name: 'Explorar un ejemplo', exact: true }).click();
  await window.getByRole('heading', { name: 'Un poco de potencias de 2.' }).waitFor();
  const seeded = await window.evaluate(async () => {
    const data = await window.tutor.snapshot(); const subjectId = data.subjects[0].id;
    const levels = [{ id: crypto.randomUUID(), title: 'No justificado' }, { id: crypto.randomUUID(), title: 'Justificado' }];
    const rubric = await window.tutor.saveRubric({ subjectId, title: 'Justificar las combinaciones de bits', description: '', levels, criteria: [{ id: crypto.randomUUID(), title: 'Cálculo y justificación de cuatro bits', description: 'El trabajo debe decir que cada bit permite dos valores y multiplicar cuatro factores de dos para llegar a 16.', conceptIds: [], curriculumIds: [], descriptors: [{ levelId: levels[0].id, description: 'El cálculo es incorrecto o no se justifica la relación entre los bits y los factores.' }, { levelId: levels[1].id, description: 'El trabajo explica que cada bit admite dos valores y que cuatro bits tienen 2 × 2 × 2 × 2 = 16 combinaciones.' }] }] });
    const submission = await window.tutor.createRubricSubmission({ subjectId, rubricId: rubric.id, title: 'Cómo cuento las combinaciones', kind: 'practice', instructions: '¿Cuántas combinaciones permiten cuatro bits? Justifica el cálculo.', text: 'Cada bit puede valer 0 o 1, así que tiene dos valores posibles. Con cuatro bits hay 2 × 2 × 2 × 2 = 16 combinaciones. Cada factor de dos corresponde a uno de los cuatro bits.', source: null, materialIds: [] });
    return { rubric, submission };
  });
  await window.reload(); await app.evaluate(({ session }) => session.defaultSession.enableNetworkEmulation({ offline: true }));
  await window.getByRole('button', { name: 'Rúbricas', exact: true }).click();
  await window.getByRole('button', { name: 'Proponer revisión local', exact: true }).click();
  progressTimer = setInterval(() => { void window.evaluate(() => window.tutor.modelStatus()).then(status => console.log(`Rúbrica local: ${status.state} · ${status.message}`)).catch(() => {}); }, 15000);
  await Promise.race([window.locator('.rubric-result-card').waitFor({ timeout: 420000 }), window.locator('.form-error').waitFor({ timeout: 420000 }).then(async () => { throw new Error('La revisión local falló: ' + await window.locator('.form-error').innerText()); })]);
  clearInterval(progressTimer);
  const data = await window.evaluate(() => window.tutor.snapshot()); const review = data.rubricReviews[0];
  assert.equal(review.origin, 'local-ai'); assert.equal(review.model.name, MODEL.name);
  assert.equal(review.model.workState, 'attempt');
  assert.equal(review.results[0].levelId, seeded.rubric.levels[1].id);
  assert.doesNotMatch(review.results[0].feedback, /no (?:se )?(?:justifica|explica)|no es correct|incorrect[oa]/i, 'El feedback no debe afirmar una carencia que la entrega correcta ya cubre.');
  assert.ok(review.results[0].quotes.length > 0); assert.ok(review.results[0].quotes.every(quote => seeded.submission.text.slice(quote.start, quote.end) === quote.text));
  assert.deepEqual(review.model.coverage, [{ start: 0, end: seeded.submission.text.length }]);
  assert.equal(data.attempts.length, 0); assert.ok(data.estimates.every(estimate => estimate.status === 'unseen'));
  await window.screenshot({ path: `test-results/${prefix}rubric-local-ai.png` });
  await window.getByRole('button', { name: 'Proponer revisión local', exact: true }).click();
  await window.getByRole('button', { name: 'Cancelar revisión local', exact: true }).click();
  await window.getByRole('alert').filter({ hasText: 'Consulta cancelada' }).waitFor();
  assert.equal((await window.evaluate(() => window.tutor.snapshot())).rubricReviews.length, 1);
  const extra = []; const comparisonFailures = [];
  for (const [title, text, expected] of [
    ['Cálculo incorrecto', 'Cada bit tiene dos valores posibles. Cuatro bits permiten 2 × 2 × 2 × 2 = 15 combinaciones.', seeded.rubric.levels[0].id],
    ['Sin procedimiento', 'Todavía no he escrito el procedimiento ni la respuesta.', null]
  ]) {
    const result = await window.evaluate(async ({ rubric, title, text }) => {
      const submission = await window.tutor.createRubricSubmission({ subjectId: rubric.subjectId, rubricId: rubric.id, title, kind: 'practice', instructions: '¿Cuántas combinaciones permiten cuatro bits? Justifica el cálculo.', text, source: null, materialIds: [] });
      const review = await window.tutor.proposeRubricReview(submission.id); return { submission, review };
    }, { rubric: seeded.rubric, title, text });
    extra.push(result);
    try {
      assert.equal(result.review.results[0].levelId, expected, title);
      assert.equal(result.review.model.workState, expected === null ? 'no-attempt' : 'attempt', 'La comprobación del intento debe conservarse con la propuesta.');
      assert.ok(result.review.results[0].quotes.every(quote => text.slice(quote.start, quote.end) === quote.text));
      if (title === 'Cálculo incorrecto') {
        assert.ok(result.review.results[0].quotes.some(quote => quote.text.includes('15')), 'La revisión debe citar el cálculo incorrecto, no solo otra afirmación del trabajo.');
        assert.doesNotMatch(result.review.results[0].nextStep, /(?:explica|justifica)\s+(?:c[oó]mo\s+)?(?:se\s+)?(?:obtiene(?:n)?|que|el resultado de)\s+15/i, 'El siguiente paso no debe pedir justificar el resultado incorrecto.');
      } else assert.equal(result.review.results[0].quotes.length, 0, 'La falta de intento no debe presentarse como un nivel respaldado por citas.');
      console.log(`Comparación de rúbrica verificada: ${title}.`);
    } catch (error) { comparisonFailures.push(`${title}: ${error.message}`); console.log(`Comparación pendiente de corregir: ${title}.`); }
  }
  assert.deepEqual(comparisonFailures, []);
  assert.deepEqual(errors, []);
  await writeFile(`test-results/${prefix}rubrics-ai-verification.json`, JSON.stringify({ checkedAt: new Date().toISOString(), packaged, model: MODEL.name, offlineRendererAndLlama: true, schemaConstrained: true, actualLiteralEvidence: true, fullSubmissionContext: true, independentWorkCheck: true, correctIncorrectAndInsufficientCases: true, noMasteryChange: true, cancellationNoPartialReview: true, review, extra, errors }, null, 2));
  console.log(`Rúbrica con IA real ${packaged ? 'empaquetada' : 'de desarrollo'} verificada: nivel del caso de prueba, citas literales, propuesta separada del dominio y cancelación sin guardar resultados parciales.`);
} catch (error) {
  const page = app.windows()[0];
  if (page) {
    await page.screenshot({ path: `test-results/${prefix}rubrics-ai-failure.png` }).catch(() => {});
    const data = await page.evaluate(() => window.tutor.snapshot()).catch(() => null);
    if (data) await writeFile(`test-results/${prefix}rubrics-ai-failure.json`, JSON.stringify({ checkedAt: new Date().toISOString(), message: String(error), submissions: data.rubricSubmissions, reviews: data.rubricReviews }, null, 2));
  }
  throw error;
}
finally { clearInterval(progressTimer); await app.close(); }
