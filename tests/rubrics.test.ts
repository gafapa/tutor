import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdir, readFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import initSqlJs from 'sql.js';
import { Store } from '../electron/store';
import { validateBackup } from '../electron/validation';
import { rubricPrompt, parseRubricProposal, rubricFragments, rubricWorkPrompt, parseRubricWorkState, unestimatedRubricResult } from '../electron/rubrics';
import { decrypt, writeEncrypted } from '../electron/vault';
import type { RubricInput, RubricResult } from '../shared/rubrics';

const wasm = resolve('node_modules/sql.js/dist/sql-wasm.wasm');
async function fixture() {
  const directory = resolve('.tools/test-data', randomUUID()); await mkdir(directory, { recursive: true });
  const path = join(directory, 'history.tutor'); const key = randomBytes(32); const store = await Store.open(path, key, wasm);
  const subject = store.createDemo(); const concepts = store.snapshot().concepts;
  const levels = ['Sin justificar', 'Justificado'].map(title => ({ id: randomUUID(), title }));
  const input: RubricInput = { subjectId: subject.id, title: 'Explicar combinaciones', description: 'Justifica un cálculo con bits.', levels, criteria: [{ id: randomUUID(), title: 'Cálculo y justificación', description: 'Relaciona los factores con los bits.', conceptIds: [concepts[0].id], curriculumIds: [], descriptors: levels.map((level, index) => ({ levelId: level.id, description: index ? 'Calcula 16 combinaciones y justifica los cuatro factores de dos.' : 'No presenta un cálculo justificado de las combinaciones.' })) }] };
  const rubric = store.saveRubric(input); const text = 'Cada bit tiene dos valores. Cuatro bits permiten 2 × 2 × 2 × 2 = 16 combinaciones.';
  const submission = store.createRubricSubmission({ subjectId: subject.id, rubricId: rubric.id, title: 'Mi explicación', kind: 'text', instructions: 'Explica cuántas combinaciones permiten cuatro bits.', text, source: null, materialIds: [store.snapshot().materials[0].id] });
  const quote = '2 × 2 × 2 × 2 = 16'; const start = text.indexOf(quote);
  const result: RubricResult = { criterionId: rubric.criteria[0].id, levelId: levels[1].id, feedback: 'Los cuatro factores justifican las dieciséis combinaciones.', nextStep: 'Comprueba qué cambia con cinco bits.', quotes: [{ start, end: start + quote.length, text: quote }] };
  return { store, path, key, input, rubric, submission, result, subject, concepts };
}
test('los criterios cubren todos los niveles, separan asignaturas y conservan cada versión de la rúbrica', async () => {
  const { store, input, rubric, subject, concepts } = await fixture();
  try {
    const other = store.createSubject({ name: 'Otra materia', level: '', teacher: '', goals: '', color: 'blue' });
    assert.throws(() => store.saveRubric({ ...input, subjectId: other.id }), /misma asignatura/);
    assert.throws(() => store.saveRubric({ ...input, levels: [input.levels[0], input.levels[0]] }), /únicos/);
    assert.throws(() => store.saveRubric({ ...input, criteria: [input.criteria[0], input.criteria[0]] }), /únicos/);
    assert.throws(() => store.saveRubric({ ...input, criteria: [{ ...input.criteria[0], descriptors: [input.criteria[0].descriptors[0], input.criteria[0].descriptors[0]] }] }), /únicos/);
    const curriculum = store.saveCurriculum({ subjectId: subject.id, kind: 'criterion', code: 'C1', title: 'Cuenta combinaciones', description: '', conceptIds: [concepts[0].id], relatedIds: [] });
    const updated = store.saveRubric({ ...rubric, title: 'Nuevo título', criteria: [{ ...rubric.criteria[0], curriculumIds: [curriculum.id] }] });
    assert.equal(updated.revision, 2); assert.equal(updated.createdAt, rubric.createdAt);
    assert.equal(store.snapshot().rubricVersions[0].title, rubric.title);
    assert.equal(store.snapshot().rubricSubmissions[0].rubricRevision, 1);
    store.deleteCurriculum(curriculum.id);
    assert.equal(store.snapshot().rubrics[0].revision, 3); assert.deepEqual(store.snapshot().rubrics[0].criteria[0].curriculumIds, []);
    assert.deepEqual(store.snapshot().rubricVersions[1].criteria[0].curriculumIds, [curriculum.id]);
    validateBackup(store.exportData());
  } finally { store.close(); }
});
test('las entregas son copias exactas del origen y las referencias de materiales conservan la versión elegida', async () => {
  const { store, rubric, subject, submission } = await fixture();
  try {
    const portfolio = store.savePortfolio({ subjectId: subject.id, title: 'Un proyecto', kind: 'project', content: 'Un texto del proyecto.', reflection: '', conceptIds: [], evidenceIds: [] });
    const input = { subjectId: subject.id, rubricId: rubric.id, title: 'Proyecto con rúbrica', kind: 'project' as const, text: portfolio.content, instructions: '', source: { kind: 'portfolio' as const, id: portfolio.id }, materialIds: [] };
    assert.throws(() => store.createRubricSubmission({ ...input, text: 'Otra entrega' }), /coincidir/);
    const project = store.createRubricSubmission(input); assert.equal(project.text, portfolio.content);
    const attempt = store.submitExercise({ conceptId: store.snapshot().concepts[0].id, exerciseId: 'Potencias de 2:0', answer: '32', hints: 0, durationSeconds: 1 });
    const practice = store.createRubricSubmission({ ...input, kind: 'practice', text: attempt.answer, source: { kind: 'attempt', id: attempt.id } });
    assert.equal(practice.source?.id, attempt.id);
    const material = store.snapshot().materials[0]; store.addMaterial(subject.id, material.name, material.kind, 'Nueva versión de apuntes.');
    assert.equal(store.snapshot().rubricSubmissions[0].materials[0].version, 1);
    store.deletePortfolio(portfolio.id); assert.equal(store.snapshot().rubricSubmissions.find(s => s.id === project.id)!.source, null);
    assert.equal(store.snapshot().rubricSubmissions.find(s => s.id === project.id)!.text, portfolio.content);
    store.deleteMaterial(submission.materials[0].id); assert.equal(store.snapshot().rubricSubmissions[0].materials.length, 0);
    validateBackup(store.exportData());
  } finally { store.close(); }
});
test('cada nivel necesita un fragmento literal y las revisiones personales no alteran las estimaciones de dominio', async () => {
  const { store, submission, result } = await fixture();
  try {
    const input = { submissionId: submission.id, supersedesId: null, results: [result], reflection: 'Comprendí la relación entre bits y factores.', nextStep: 'Probar cinco bits.' };
    assert.throws(() => store.saveRubricReview({ ...input, results: [{ ...result, quotes: [] }] }), /fragmento/);
    assert.throws(() => store.saveRubricReview({ ...input, results: [{ ...result, quotes: [{ start: 0, end: 5, text: 'Falso' }] }] }), /exactamente/);
    assert.throws(() => store.saveRubricReview({ ...input, results: [{ ...result, levelId: randomUUID() }] }), /original/);
    assert.throws(() => store.saveRubricReview({ ...input, results: [] }));
    const first = store.saveRubricReview(input);
    const second = store.saveRubricReview({ ...input, supersedesId: first.id, results: [{ ...result, levelId: null, feedback: 'Quiero justificar mejor la relación con los bits.' }] });
    assert.equal(first.origin, 'self'); assert.equal(first.model, null); assert.equal(second.supersedesId, first.id);
    assert.deepEqual(store.snapshot().rubricReviews[0], first); assert.equal(store.snapshot().attempts.length, 0);
    assert.ok(store.snapshot().estimates.every(e => e.status === 'unseen'));
    validateBackup(store.exportData());
  } finally { store.close(); }
});
test('las propuestas locales rechazan niveles ajenos, citas inventadas y contextos que no caben antes de guardar nada', async () => {
  const { store, submission, result } = await fixture();
  try {
    const { rubric } = store.rubricContext(submission.id); const criterionId = rubric.criteria[0].id;
    const prompt = rubricPrompt(rubric, criterionId, submission);
    assert.ok(prompt.messages.reduce((sum, message) => sum + message.content.length, 0) <= 6000);
    assert.deepEqual(prompt.schema.properties.descriptor.enum, ['0: Sin justificar', '1: Justificado', 'Sin estimar']);
    assert.equal(prompt.schema.properties.quoteIds.minItems, 1);
    assert.equal(prompt.messages[1].content.split('\n').filter(line => /^\[\d+\] /.test(line)).map(line => JSON.parse(line.replace(/^\[\d+\] /, ''))).join(''), submission.text);
    const raw = JSON.stringify({ descriptor: '1: Justificado', quoteIds: [0] });
    const parsed = parseRubricProposal(raw, rubric, criterionId, submission.text);
    assert.equal(parsed.levelId, result.levelId); assert.equal(parsed.quotes[0].text, submission.text);
    assert.throws(() => parseRubricProposal(raw.replace('[0]', '[999]'), rubric, criterionId, submission.text), /no aparece/);
    assert.throws(() => parseRubricProposal(JSON.stringify({ descriptor: '5: Un nivel inventado', quoteIds: [] }), rubric, criterionId, submission.text), /no existe/);
    const unsupported = parseRubricProposal(JSON.stringify({ descriptor: '1: Justificado', quoteIds: [] }), rubric, criterionId, submission.text);
    assert.equal(unsupported.levelId, null); assert.match(unsupported.feedback, /no aporta fragmentos/); assert.equal(unsupported.quotes.length, 0);
    const absent = parseRubricProposal(JSON.stringify({ descriptor: 'Sin estimar', quoteIds: [] }), rubric, criterionId, submission.text);
    assert.equal(absent.levelId, null); assert.equal(absent.quotes.length, 0);
    assert.throws(() => parseRubricProposal(JSON.stringify({ descriptor: '1: Justificado', quoteIds: [0], feedback: 'El alumno escribió un resultado que no aparece en el texto.' }), rubric, criterionId, submission.text), /no devolvió/);
    assert.throws(() => rubricPrompt(rubric, criterionId, { ...submission, text: 'Trabajo extenso. '.repeat(500) }), /No se ha recortado/);
    const proposal = store.saveRubricProposal(submission.id, [parsed], 'Modelo local de prueba', 'attempt');
    assert.equal(proposal.origin, 'local-ai'); assert.equal(proposal.model!.coverage[0].end, submission.text.length);
    assert.ok(store.snapshot().estimates.every(e => e.status === 'unseen')); validateBackup(store.exportData());
  } finally { store.close(); }
});
test('la restauración valida versiones, texto, citas, cobertura, fuentes y revisiones previas sin cambiar el historial al fallar', async () => {
  const { store, submission, rubric, result } = await fixture();
  try {
    const proposal = store.saveRubricProposal(submission.id, [result], 'Modelo local de prueba', 'attempt');
    store.saveRubricReview({ submissionId: submission.id, supersedesId: proposal.id, results: [result], reflection: '', nextStep: '' });
    store.saveRubric({ ...rubric, title: 'Versión actual' }); const original = store.exportData();
    const reject = (change: (value: any) => void) => { const value = JSON.parse(original); change(value); assert.throws(() => store.importData(JSON.stringify(value))); assert.deepEqual(JSON.parse(store.exportData()).tables, JSON.parse(original).tables); };
    reject(value => { value.tables.rubrics[0].title = 'Cambio sin versión'; });
    reject(value => { value.tables.rubric_versions.shift(); });
    reject(value => { value.tables.rubric_submissions[0].text = 'Trabajo modificado'; });
    reject(value => { value.tables.rubric_reviews[0].results[0].quotes[0].start = 0; });
    reject(value => { value.tables.rubric_reviews[0].model.coverage[0].end--; });
    reject(value => { value.tables.rubric_reviews[0].model.workState = 'no-attempt'; });
    reject(value => { delete value.tables.rubric_reviews[0].model.workState; });
    reject(value => { value.tables.rubric_reviews[1].supersedesId = value.tables.rubric_reviews[1].id; });
    const before = store.snapshot(); store.erase(); store.importData(original);
    assert.deepEqual(store.snapshot().rubricReviews, before.rubricReviews); assert.deepEqual(store.snapshot().rubricSubmissions, before.rubricSubmissions);
  } finally { store.close(); }
});

test('la falta de intento se comprueba sin descriptores y no se guarda como un nivel bajo ni una dificultad', async () => {
  const { store, submission, rubric, result } = await fixture();
  try {
    const prompt = rubricWorkPrompt(submission);
    assert.ok(prompt.messages[1].content.includes(JSON.stringify(submission.text)));
    assert.ok(prompt.messages[1].content.includes(submission.instructions));
    assert.ok(!prompt.messages.some(message => message.content.includes(rubric.criteria[0].descriptors[0].description)));
    assert.equal(parseRubricWorkState('{"state":"no-attempt"}'), 'no-attempt');
    assert.throws(() => parseRubricWorkState('{"state":"incorrect"}'), /No se pudo/);
    assert.throws(() => rubricWorkPrompt({ ...submission, text: 'a'.repeat(6000) }), /No se ha recortado/);
    assert.throws(() => store.saveRubricProposal(submission.id, [result], 'Modelo local', 'uncertain'), /sin estimar/);
    const review = store.saveRubricProposal(submission.id, [unestimatedRubricResult(rubric.criteria[0].id, 'no-attempt')], 'Modelo local', 'no-attempt');
    assert.equal(review.results[0].levelId, null); assert.equal(review.results[0].quotes.length, 0);
    assert.equal(review.model!.workState, 'no-attempt'); assert.ok(store.snapshot().estimates.every(estimate => estimate.status === 'unseen'));
    validateBackup(store.exportData());
  } finally { store.close(); }
});
test('borrar una entrega o rúbrica retira sus revisiones y versiones; las copias 0.4 migran sin inventar evaluaciones', async () => {
  const { store, submission, rubric, result, subject } = await fixture();
  try {
    store.saveRubricReview({ submissionId: submission.id, supersedesId: null, results: [result], reflection: '', nextStep: '' });
    store.deleteRubricSubmission(submission.id); assert.equal(store.snapshot().rubricReviews.length, 0); assert.equal(store.snapshot().rubrics.length, 1);
    const previous = JSON.parse(store.exportData()); previous.version = 4;
    for (const table of ['rubrics', 'rubric_versions', 'rubric_submissions', 'rubric_reviews']) delete previous.tables[table];
    store.importData(JSON.stringify(previous)); assert.equal(store.snapshot().rubrics.length, 0); assert.equal(store.snapshot().subjects[0].id, subject.id);
    const fresh = store.saveRubric({ ...rubric, id: undefined }); store.deleteRubric(fresh.id);
    assert.equal(store.snapshot().rubricVersions.length, 0); validateBackup(store.exportData());
  } finally { store.close(); }
});
test('la base 0.4 se actualiza a rúbricas conservando asignaturas, materiales y ejercicios', async () => {
  const { store, path, key } = await fixture(); store.deleteRubric(store.snapshot().rubrics[0].id);
  const subjectId = store.snapshot().subjects[0].id; store.close();
  const sql = await initSqlJs({ locateFile: () => wasm }); const db = new sql.Database(decrypt(await readFile(path), key));
  db.run('DROP TABLE rubrics; DROP TABLE rubric_versions; DROP TABLE rubric_submissions; DROP TABLE rubric_reviews; PRAGMA user_version = 4');
  writeEncrypted(path, db.export(), key); db.close();
  const reopened = await Store.open(path, key, wasm);
  try { assert.equal(reopened.snapshot().subjects[0].id, subjectId); assert.equal(reopened.snapshot().materials.length, 1); assert.equal(reopened.snapshot().rubrics.length, 0); validateBackup(reopened.exportData()); }
  finally { reopened.close(); }
});
test('la fragmentación conserva todos los caracteres y los espacios solos no justifican un nivel', async () => {
  const { store, submission } = await fixture();
  try {
    const text = '\n'.repeat(600) + '  Primer paso: 0,5.\r\nSegundo paso 😀: ' + 'a'.repeat(1500) + '\nFinal.  ';
    const fragments = rubricFragments(text); assert.equal(fragments.map(fragment => fragment.text).join(''), text);
    assert.ok(fragments.every(fragment => fragment.text.length <= 600 && text.slice(fragment.start, fragment.end) === fragment.text));
    const { rubric } = store.rubricContext(submission.id);
    assert.throws(() => parseRubricProposal(JSON.stringify({ descriptor: '1: Justificado', quoteIds: [0] }), rubric, rubric.criteria[0].id, text), /evidencias/);
    const prompt = rubricPrompt(rubric, rubric.criteria[0].id, { ...submission, text });
    assert.ok(!prompt.schema.properties.quoteIds.items.enum.includes(0));
    const emoji = rubricFragments('a'.repeat(599) + '😀 y final.');
    assert.equal(emoji[0].end, 599); assert.ok(emoji[1].text.startsWith('😀'));
    assert.equal(rubricFragments('Cada bit tiene dos valores. El cálculo incorrecto aparece después.')[0].text, 'Cada bit tiene dos valores. El cálculo incorrecto aparece después.');
  } finally { store.close(); }
});
