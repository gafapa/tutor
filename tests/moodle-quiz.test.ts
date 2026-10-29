import test from 'node:test';
import assert from 'node:assert/strict';
import { collectQuizAttempts } from '../electron/moodle-quiz';
import { moodlePlainText } from '../electron/lms-utils';
import type { LmsQuizAttempt } from '../shared/lms';

const row = (id = 1, state = 'finished') => ({ id, quiz: 20, userid: 9, attempt: id, preview: 0, state, timestart: 1700000000, timefinish: state === 'finished' ? 1700000100 : 0 });
const cached: LmsQuizAttempt = { id: 1, number: 1, state: 'finished', startedAt: null, finishedAt: null, reviewState: 'available', reviewText: 'Previous permitted review', points: 2 };
async function collect(options: { rows?: unknown[]; review?: unknown; error?: Error; previous?: LmsQuizAttempt[]; reviewAvailable?: boolean; signal?: AbortSignal } = {}) {
  const calls: { name: string; input: Record<string, unknown> }[] = []; let warnings = 0;
  const results = await collectQuizAttempts({ quizId: 20, userId: 9, previous: options.previous ?? [], reviewAvailable: options.reviewAvailable ?? true, signal: options.signal ?? new AbortController().signal, plain: html => moodlePlainText(html, true), warn: () => warnings++, call: async (name, input) => {
    calls.push({ name, input });
    if (name === 'mod_quiz_get_user_attempts') return { attempts: options.rows ?? [row()] };
    if (options.error) throw options.error;
    return options.review ?? { attempt: { ...row(), sumgrades: null }, grade: 900, questions: [{ slot: 1, html: '<p>Four bits</p><input type="text" value="16"><input type="hidden" value="secret-session"><input type="password" value="secret-password"><script>secret-script</script><div hidden>secret-hidden</div><textarea>My explanation</textarea>' }] };
  } });
  return { results, calls, warnings };
}

test('quiz history reads only own finished attempts and ignores hidden marks and calculated grades', async () => {
  const { results, calls } = await collect({ rows: [row(2, 'inprogress'), row()] });
  assert.deepEqual(calls, [{ name: 'mod_quiz_get_user_attempts', input: { quizid: 20, userid: 9, status: 'all', includepreviews: 0 } }, { name: 'mod_quiz_get_attempt_review', input: { attemptid: 1, page: -1 } }]);
  assert.equal(results[0].points, null); assert.match(results[0].reviewText, /Respuesta: 16/); assert.match(results[0].reviewText, /My explanation/); assert.doesNotMatch(results[0].reviewText, /secret-|900|<input/);
  assert.equal(results[1].reviewState, 'not-finished'); assert.equal(results[1].reviewText, '');
});

test('quiz response extraction preserves selected controls and skips hidden content without swallowing subsequent text', () => {
  const plain = moodlePlainText('<input hidden value="secret"><p>Visible</p><input type="checkbox" checked><label>Sixteen</label><input type="radio"><label>Twelve</label><select><option>Wrong</option><option selected>Correct</option></select><div aria-hidden="true">secret</div><p>End</p>', true);
  assert.match(plain, /Visible/); assert.match(plain, /\[Marcada\] Sixteen/); assert.match(plain, /\[Seleccionada\] Correct/); assert.match(plain, /End/); assert.doesNotMatch(plain, /secret/);
});

test('quiz review uses permission-filtered points and strips unrelated review fields', async () => {
  const { results } = await collect({ review: { attempt: { ...row(), sumgrades: '1.5' }, grade: 75, questions: [{ slot: 1, html: '<p>Answer</p>' }], additionaldata: [{ id: 'feedback', content: '<p>Check units</p>' }, { id: 'other', content: 'secret' }] } });
  assert.equal(results[0].points, 1.5); assert.match(results[0].reviewText, /Check units/); assert.doesNotMatch(JSON.stringify(results), /secret|75|grade/);
});

test('denied quiz review clears the current cached review while a transient failure preserves it explicitly', async () => {
  const denied = await collect({ error: Object.assign(new Error('Denied'), { moodleCode: 'noreview' }), previous: [cached] });
  assert.equal(denied.results[0].reviewState, 'restricted'); assert.equal(denied.results[0].reviewText, ''); assert.equal(denied.results[0].points, null); assert.equal(denied.warnings, 0);
  const offline = await collect({ error: new Error('Network'), previous: [cached] });
  assert.equal(offline.results[0].reviewState, 'cached'); assert.equal(offline.results[0].reviewText, cached.reviewText); assert.equal(offline.warnings, 1);
  const active = await collect({ rows: [row(1, 'inprogress')], previous: [cached] }); assert.equal(active.results[0].reviewText, ''); assert.equal(active.calls.length, 1);
});

test('foreign, preview, duplicate and excessive quiz attempt lists fail closed', async () => {
  for (const rows of [[{ ...row(), userid: 10 }], [{ ...row(), quiz: 21 }], [{ ...row(), preview: 1 }], [row(), row()], Array.from({ length: 101 }, (_, index) => row(index + 1))]) await assert.rejects(collect({ rows }));
});

test('mismatched and excessive quiz reviews are discarded without leaking content', async () => {
  for (const review of [{ attempt: { ...row(), userid: 10 }, questions: [{ slot: 1, html: 'secret' }] }, { attempt: row(), questions: [{ slot: 1, html: 'secret' }, { slot: 1, html: 'secret' }] }, { attempt: row(), questions: Array.from({ length: 301 }, (_, index) => ({ slot: index + 1, html: 'secret' })) }]) {
    const { results, warnings } = await collect({ review }); assert.equal(results[0].reviewState, 'unavailable'); assert.equal(results[0].reviewText, ''); assert.equal(warnings, 1);
  }
});

test('cancelled quiz reads propagate cancellation and missing review functions retain metadata only', async () => {
  const controller = new AbortController(); controller.abort(); await assert.rejects(collect({ signal: controller.signal }), { name: 'AbortError' });
  const { results, warnings, calls } = await collect({ reviewAvailable: false, previous: [cached] }); assert.equal(results[0].reviewState, 'unavailable'); assert.equal(results[0].reviewText, ''); assert.equal(warnings, 1); assert.equal(calls.length, 1);
});
