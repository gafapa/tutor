import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { Store } from '../electron/store';
import { arithmeticGuide, arithmeticValue } from '../electron/arithmetic';
import { Lms } from '../electron/lms';
import { LmsCredentials } from '../electron/lms-credentials';
import { startMoodleHttpFixture } from '../scripts/moodle-http-fixture.mjs';
import { EXERCISES } from '../electron/learning';
import { learningCycleMessage } from '../shared/learning-cycle';

async function fixture() {
  const directory = resolve('.tools/test-data', randomUUID()); await mkdir(directory, { recursive: true });
  const path = join(directory, 'guided.tutor'), key = randomBytes(32), wasm = resolve('node_modules/sql.js/dist/sql-wasm.wasm');
  const store = await Store.open(path, key, wasm), subject = store.createDemo();
  const entry = store.savePortfolio({ subjectId: subject.id, title: 'Mi cálculo', kind: 'work', content: '2+3*4=11', reflection: '', conceptIds: [], evidenceIds: [] });
  const analysis = store.analyzeSteps({ kind: 'portfolio', id: entry.id });
  store.reviewObservation({ analysisId: analysis.id, observationId: analysis.observations[0].id, decision: 'accepted', reason: 'Sumé antes de multiplicar.' });
  const plan = store.startIntervention({ analysisId: analysis.id, observationId: analysis.observations[0].id, minutes: 10, guided: true });
  return { directory, path, key, wasm, store, subject, entry, plan };
}

test('arithmetic guidance checks precedence, signs and exact fractions without executing text', () => {
  const steps = arithmeticGuide('2+3*4'); assert.equal(steps.length, 2); assert.equal(steps[0].expected, '12'); assert.equal(steps[1].expected, '14');
  assert.equal(arithmeticGuide('-2^2').at(-1)!.expected, '-4'); assert.equal(arithmeticGuide('1/2+1/4').at(-1)!.expected, '3/4');
  assert.equal(arithmeticGuide('2^3^2').at(-1)!.expected, '512'); assert.throws(() => arithmeticGuide('process.exit()'));
});

test('guided practice requires an own attempt, limits hints and blocks skipping activities or submitting a fabricated final response', async () => {
  const f = await fixture(); try {
    const input = { interventionId: f.plan.id, activityId: f.plan.activities[0].id }, before = f.store.snapshot();
    assert.equal(f.plan.guided, true); assert.equal('guidance' in f.plan, false); assert.ok(f.plan.activities.every(row => !('expected' in row) && row.hint === ''));
    assert.throws(() => f.store.requestGuidedHint(input)); assert.throws(() => f.store.guidedPractice({ ...input, activityId: f.plan.activities[1].id }));
    assert.throws(() => f.store.answerIntervention({ ...input, answer: '15', hints: 0, durationSeconds: 0 }));
    const copiedExpression = arithmeticGuide(f.plan.activities[0].expression!)[0].expression;
    assert.equal(f.store.submitGuidedStep({ ...input, answer: copiedExpression }).stepIndex, 0);
    let view = f.store.submitGuidedStep({ ...input, answer: '0' }); assert.equal(view.stepIndex, 0); assert.equal(view.attempts[0].correct, false); assert.equal(view.canHint, true);
    view = f.store.requestGuidedHint(input); assert.equal(view.hints.length, 1); view = f.store.requestGuidedHint(input); assert.equal(view.hints.length, 2); assert.throws(() => f.store.requestGuidedHint(input));
    const steps = arithmeticGuide(f.plan.activities[0].expression!);
    view = f.store.submitGuidedStep({ ...input, answer: steps[0].expected }); assert.equal(view.stepIndex, 1); assert.equal(view.hints.length, 0); assert.equal(view.canHint, false);
    view = f.store.submitGuidedStep({ ...input, answer: steps[1].expected }); assert.equal(view.completed, true);
    const response = f.store.snapshot().interventionResponses[0]; assert.equal(response.outcome, 'correct'); assert.equal(response.hints, 2); assert.equal(response.answer, steps[1].expected);
    assert.throws(() => f.store.submitGuidedStep({ ...input, answer: steps[1].expected })); assert.throws(() => f.store.requestGuidedHint(input));
    assert.deepEqual(f.store.snapshot().attempts, before.attempts); assert.deepEqual(f.store.snapshot().estimates, before.estimates);
    assert.equal(f.store.guidedPractice({ ...input, activityId: f.plan.activities[1].id }).stepIndex, 0);
  } finally { f.store.close(); }
});

test('independent next-day checks reject hints, preserve failure and require a new explicit practice cycle', async context => {
  context.mock.timers.enable({ apis: ['Date'], now: new Date('2026-11-01T10:00:00Z').getTime() });
  const f = await fixture(); try {
    const before = f.store.snapshot().estimates;
    for (const activity of f.plan.activities.slice(0, 2)) for (const step of arithmeticGuide(activity.expression!)) f.store.submitGuidedStep({ interventionId: f.plan.id, activityId: activity.id, answer: step.expected });
    const input = { interventionId: f.plan.id, activityId: f.plan.activities[2].id, answer: '0', hints: 0, durationSeconds: 15 };
    assert.throws(() => f.store.answerIntervention(input)); assert.throws(() => f.store.requestGuidedHint({ interventionId: input.interventionId, activityId: input.activityId }));
    context.mock.timers.setTime(new Date('2026-11-02T10:00:00Z').getTime()); assert.throws(() => f.store.answerIntervention({ ...input, hints: 1 }));
    assert.throws(() => f.store.answerIntervention({ ...input, answer: f.plan.activities[2].expression! }));
    const response = f.store.answerIntervention(input); assert.equal(response.outcome, 'incorrect'); assert.equal(response.hints, 0); assert.throws(() => f.store.answerIntervention({ ...input, answer: arithmeticValue(f.plan.activities[2].expression!) }));
    assert.deepEqual(f.store.snapshot().estimates, before); assert.doesNotThrow(() => f.store.importData(f.store.exportData()));
  } finally { f.store.close(); }
});

test('steps survive encrypted restart and backup restoration; tampered hints, chronology and orphaned sources roll back', async () => {
  const f = await fixture(); let reopened: Store | undefined;
  try {
    const input = { interventionId: f.plan.id, activityId: f.plan.activities[0].id };
    f.store.submitGuidedStep({ ...input, answer: '0' }); const expected = f.store.requestGuidedHint(input), backup = f.store.exportData(); f.store.close();
    reopened = await Store.open(f.path, f.key, f.wasm); assert.deepEqual(reopened.guidedPractice(input), expected); reopened.importData(backup); assert.deepEqual(reopened.guidedPractice(input), expected);
    const before = reopened.exportData();
    for (const mutate of [
      (data: any) => { data.tables.interventions[0].guidance[0].kind = 'hint'; data.tables.interventions[0].guidance[0].answer = ''; },
      (data: any) => { data.tables.interventions[0].guidance[0].createdAt = '2000-01-01T00:00:00.000Z'; },
      (data: any) => { data.tables.portfolio = []; },
      (data: any) => { data.tables.interventions[0].guidance[1].activityId = data.tables.interventions[0].activities[2].id; }
    ]) { const data = JSON.parse(before); mutate(data); assert.throws(() => reopened!.importData(JSON.stringify(data))); assert.deepEqual(reopened.guidedPractice(input), expected); }
    reopened.deletePortfolio(f.entry.id); assert.equal(reopened.snapshot().learningAnalyses.length, 0); assert.equal(reopened.snapshot().interventions.length, 0); assert.doesNotThrow(() => reopened!.importData(reopened!.exportData()));
  } finally { reopened?.close(); if (!reopened) f.store.close(); }
});

test('Moodle practice uses only the authoritative personal submission and preserves an independent copy without remote writes or invented attainment', async () => {
  const remote = await startMoodleHttpFixture(), f = await fixture(), lms = new Lms(f.store, new LmsCredentials(join(f.directory, 'credentials.tutor'), f.key));
  try {
    remote.state.submissionText = '<p>2+3*4=11</p>';
    const discovery = await lms.discover({ siteUrl: remote.siteUrl, token: remote.token }); await lms.connectCourses({ discoveryId: discovery.id, courses: [{ courseId: 1 }], autoMinutes: 0 });
    await lms.sync(f.store.snapshot().lmsConnections[0].id);
    const item = f.store.snapshot().lmsItems.find(row => row.data.kind === 'activity' && row.data.module === 'assign')!; assert.ok(item);
    const before = f.store.snapshot(), requestCount = remote.requests.length;
    const prepared = f.store.prepareMoodlePractice({ itemId: item.id, revision: item.revision }); assert.deepEqual(f.store.prepareMoodlePractice({ itemId: item.id, revision: item.revision }), prepared);
    const after = f.store.snapshot(), entry = after.portfolio.find(row => row.id === prepared.portfolioId)!;
    assert.equal(entry.content, '2+3*4=11'); assert.equal(entry.moodlePracticeSource!.revision, item.revision); assert.equal(after.learningAnalyses.find(row => row.id === prepared.analysisId)!.observations.length, 1);
    assert.equal(entry.moodlePracticeSource!.submittedAt, item.data.kind === 'activity' ? item.data.submission!.updatedAt : undefined);
    const sourceWork = f.store.workContext({ kind: 'portfolio', id: entry.id });
    assert.notEqual(sourceWork.evidenceDay, sourceWork.createdAt.slice(0, 10));
    assert.deepEqual(after.attempts, before.attempts); assert.deepEqual(after.estimates, before.estimates); assert.deepEqual(after.lmsItems, before.lmsItems); assert.equal(remote.requests.length, requestCount);
    assert.throws(() => f.store.prepareMoodlePractice({ itemId: item.id, revision: item.revision, text: 'Fabricated student answer' }));
    const originalAnalysis = after.learningAnalyses.find(row => row.id === prepared.analysisId)!;
    f.store.reviewObservation({ analysisId: originalAnalysis.id, observationId: originalAnalysis.observations[0].id, decision: 'accepted', reason: 'Revisaré mi cálculo.' });
    const count = f.store.snapshot().skillProfiles.find(row => row.skill === 'calculation')!.workCount;
    remote.state.revision = 2; await lms.sync(item.connectionId);
    const updated = f.store.snapshot().lmsItems.find(row => row.id === item.id)!;
    const copy = f.store.prepareMoodlePractice({ itemId: updated.id, revision: updated.revision });
    const copiedAnalysis = f.store.snapshot().learningAnalyses.find(row => row.id === copy.analysisId)!;
    f.store.reviewObservation({ analysisId: copiedAnalysis.id, observationId: copiedAnalysis.observations[0].id, decision: 'accepted', reason: 'Es el mismo intento en otra versión local.' });
    assert.equal(f.store.snapshot().skillProfiles.find(row => row.skill === 'calculation')!.workCount, count);
    lms.clear(item.connectionId); assert.equal(f.store.snapshot().portfolio.find(row => row.id === entry.id)!.content, entry.content); assert.doesNotThrow(() => f.store.importData(f.store.exportData()));
  } finally { lms.close(); f.store.close(); await remote.stop(); }
});

test('schema 17 restores without inventing guided history', async () => {
  const f = await fixture(); try {
    const backup = JSON.parse(f.store.exportData()); backup.version = 17; for (const plan of backup.tables.interventions) { delete plan.guidance; delete plan.independent; }
    f.store.importData(JSON.stringify(backup)); assert.equal(f.store.snapshot().interventions[0].guided, undefined); assert.equal(JSON.parse(f.store.exportData()).version, 18);
  } finally { f.store.close(); }
});

test('bank practice preserves real hint counts and open work never receives an automatic success', async context => {
  context.mock.timers.enable({ apis: ['Date'], now: new Date('2026-11-01T10:00:00Z').getTime() });
  const f = await fixture(); try {
    const concept = f.store.snapshot().concepts.find(row => row.name === 'Potencias de 2')!;
    const attempt = f.store.saveAttempt({ subjectId: f.subject.id, conceptId: concept.id, statement: 'Explica cómo contar combinaciones.', answer: 'No encuentro la regla.', feedback: '', outcome: 'ungraded', hints: 0, durationSeconds: 10 });
    const analysis = f.store.recordObservation({ kind: 'attempt', id: attempt.id, skill: 'logic', signal: 'difficulty', error: 'conceptual', quote: { start: 0, end: attempt.answer.length, text: attempt.answer }, description: 'Necesito organizar las opciones.' });
    f.store.reviewObservation({ analysisId: analysis.id, observationId: analysis.observations[0].id, decision: 'accepted', reason: 'Probaré una tabla.' });
    const plan = f.store.startIntervention({ analysisId: analysis.id, observationId: analysis.observations[0].id, minutes: 10, guided: true }), activity = plan.activities[0], input = { interventionId: plan.id, activityId: activity.id };
    assert.equal(activity.kind, 'bank'); f.store.submitGuidedStep({ ...input, answer: 'Respuesta incorrecta' }); f.store.requestGuidedHint(input); f.store.requestGuidedHint(input);
    const original = EXERCISES[concept.name].find(row => row.statement === activity.statement)!; assert.ok(original);
    assert.equal(f.store.submitGuidedStep({ ...input, answer: original.answer }).completed, true); assert.equal(f.store.snapshot().interventionResponses.find(row => row.activityId === activity.id)!.hints, 2);
    const open = f.store.savePortfolio({ subjectId: f.subject.id, title: 'Argumento abierto', kind: 'work', content: 'Este argumento necesita más contexto.', reflection: '', conceptIds: [], evidenceIds: [] });
    const observed = f.store.recordObservation({ kind: 'portfolio', id: open.id, skill: 'writing', signal: 'difficulty', error: 'writing', quote: { start: 0, end: open.content.length, text: open.content }, description: 'Faltan conectores.' });
    f.store.reviewObservation({ analysisId: observed.id, observationId: observed.observations[0].id, decision: 'accepted', reason: 'Voy a enlazar las ideas.' });
    const openPlan = f.store.startIntervention({ analysisId: observed.id, observationId: observed.observations[0].id, minutes: 10, guided: true }); assert.equal(openPlan.independent, true); assert.equal(openPlan.guided, undefined);
    assert.throws(() => f.store.guidedPractice({ interventionId: openPlan.id, activityId: openPlan.activities[0].id }));
    for (const activity of openPlan.activities.slice(0, 2)) assert.equal(f.store.answerIntervention({ interventionId: openPlan.id, activityId: activity.id, answer: 'Mi revisión personal.', hints: 0, durationSeconds: 10 }).outcome, 'ungraded');
    context.mock.timers.setTime(new Date('2026-11-02T10:00:00Z').getTime());
    const response = f.store.answerIntervention({ interventionId: openPlan.id, activityId: openPlan.activities[2].id, answer: 'Ahora conectaría los argumentos.', hints: 0, durationSeconds: 10 });
    assert.equal(response.outcome, 'ungraded'); assert.match(learningCycleMessage(openPlan, [response]), /necesita revisión/);
    assert.match(learningCycleMessage(openPlan, [{ ...response, outcome: 'correct' }]), /sin ayuda/);
    assert.match(learningCycleMessage(openPlan, [{ ...response, outcome: 'correct', hints: 1 }]), /con ayuda/);
    assert.doesNotThrow(() => f.store.importData(f.store.exportData()));
  } finally { f.store.close(); }
});

test('late practice moves the independent check to the following day and restore rejects a same-day check', async context => {
  context.mock.timers.enable({ apis: ['Date'], now: new Date('2026-11-01T10:00:00Z').getTime() });
  const f = await fixture(); try {
    context.mock.timers.setTime(new Date('2026-11-03T10:00:00Z').getTime());
    for (const activity of f.plan.activities.slice(0, 2)) for (const step of arithmeticGuide(activity.expression!)) f.store.submitGuidedStep({ interventionId: f.plan.id, activityId: activity.id, answer: step.expected });
    const input = { interventionId: f.plan.id, activityId: f.plan.activities[2].id, answer: arithmeticValue(f.plan.activities[2].expression!), hints: 0, durationSeconds: 10 };
    assert.throws(() => f.store.answerIntervention(input)); context.mock.timers.setTime(new Date('2026-11-04T10:00:00Z').getTime());
    const check = f.store.answerIntervention(input); assert.match(learningCycleMessage(f.plan, [check]), /sin ayuda/); assert.doesNotThrow(() => f.store.importData(f.store.exportData()));
    const tampered = JSON.parse(f.store.exportData()); tampered.tables.intervention_responses.find((response: any) => response.id === check.id).createdAt = '2026-11-03T18:00:00.000Z'; assert.throws(() => f.store.importData(JSON.stringify(tampered)));
  } finally { f.store.close(); }
});

test('guided cycles reject unrepresentable numeric results before persisting an unplayable practice', async () => {
  const f = await fixture(); try {
    const entry = f.store.savePortfolio({ subjectId: f.subject.id, title: 'Resultado muy extenso', kind: 'work', content: '999999999999999999999^20=0', reflection: '', conceptIds: [], evidenceIds: [] });
    const analysis = f.store.analyzeSteps({ kind: 'portfolio', id: entry.id }); assert.ok(analysis.observations.length);
    f.store.reviewObservation({ analysisId: analysis.id, observationId: analysis.observations[0].id, decision: 'accepted', reason: 'Comprobaré este cálculo.' });
    const before = f.store.snapshot(); assert.throws(() => f.store.startIntervention({ analysisId: analysis.id, observationId: analysis.observations[0].id, minutes: 10, guided: true }), /demasiado extensos/); assert.deepEqual(f.store.snapshot().interventions, before.interventions);
  } finally { f.store.close(); }
});
