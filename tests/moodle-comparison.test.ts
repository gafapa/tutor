import test from 'node:test';
import assert from 'node:assert/strict';
import { compareMoodleText, moodleComparisonAttempts, MOODLE_COMPARISON_CHARACTERS, MOODLE_COMPARISON_LINES } from '../shared/moodle-comparison';
import type { LmsActivityData, LmsQuizAttempt } from '../shared/lms';

const activity: LmsActivityData = { kind: 'activity', moduleId: 1, assignmentId: 2, module: 'assign', title: 'Four bits', url: 'https://example.invalid/mod/assign/view.php?id=1', instructions: 'Explain', dueAt: null, submission: { status: 'submitted', text: '16 combinations', group: false, attempt: 1, createdAt: null, updatedAt: null }, submissionFeedback: 'Correct', previousSubmissions: [{ submission: { status: 'submitted', text: '12 combinations', group: false, attempt: 0, createdAt: null, updatedAt: null, files: [{ filename: 'first.txt', filepath: '/', size: 10, url: 'https://example.invalid/file' }] }, feedback: 'Check multiplication' }] };

test('Moodle comparisons retain exact originals, separate comments and attachment references without changing source data', () => {
  const before = structuredClone(activity), attempts = moodleComparisonAttempts(activity);
  assert.deepEqual(attempts.map(row => row.number), [1, 2]); assert.equal(attempts[0].text, '12 combinations'); assert.equal(attempts[1].feedback, 'Correct'); assert.deepEqual(attempts[0].files, [{ filename: 'first.txt', filepath: '/', size: 10 }]);
  attempts[0].files[0].filename = 'changed'; assert.deepEqual(activity, before);
  assert.equal(attempts[0].points, null); assert.equal(moodleComparisonAttempts({ ...activity, module: 'forum' }).length, 0);
});

test('quiz comparisons exclude unfinished, restricted and empty reviews and retain permission-filtered points', () => {
  const finished: LmsQuizAttempt = { id: 1, number: 1, state: 'finished', startedAt: null, finishedAt: null, reviewState: 'available', reviewText: 'Response: 16', points: null };
  const rows = moodleComparisonAttempts({ ...activity, module: 'quiz', quizId: 3, quizAttempts: [{ ...finished, id: 2, number: 2, reviewState: 'cached', points: 1 }, finished, { ...finished, id: 3, number: 3, state: 'inprogress', reviewState: 'not-finished', reviewText: '' }, { ...finished, id: 4, number: 4, reviewState: 'restricted', reviewText: '' }, { ...finished, id: 5, number: 5, reviewText: ' ' }] });
  assert.deepEqual(rows.map(row => row.number), [1, 2]); assert.equal(rows[0].points, null); assert.equal(rows[1].cached, true); assert.equal(rows[1].points, 1); assert.ok(rows.every(row => row.group === null));
});

test('exact comparison handles replacements, blank lines, repetitions, Unicode and meaningful indentation', () => {
  const cases = [['', ''], ['', 'A'], ['A', ''], ['Same\nOld\nEnd', 'Same\nNew\nEnd'], ['A\nA\nB', 'A\nB\nA'], ['á🙂\n\n  value', 'á🙂\n\nvalue'], ['A\r\nB', 'A\nB']];
  for (const [before, after] of cases) {
    const result = compareMoodleText(before, after); assert.equal(result.limited, false); if (result.limited) throw Error();
    assert.equal(result.rows.filter(row => row.kind !== 'added').map(row => row.text).join('\n'), before.replace(/\r\n?/g, '\n'));
    assert.equal(result.rows.filter(row => row.kind !== 'removed').map(row => row.text).join('\n'), after.replace(/\r\n?/g, '\n'));
    assert.equal(result.added, result.rows.filter(row => row.kind === 'added').length); assert.equal(result.removed, result.rows.filter(row => row.kind === 'removed').length);
  }
  const indentation = compareMoodleText('  value', 'value'); assert.ok(!indentation.limited && indentation.added === 1 && indentation.removed === 1);
});

test('comparison refuses oversized inputs completely and accepts exact boundaries without truncation', () => {
  assert.equal(compareMoodleText('x'.repeat(MOODLE_COMPARISON_CHARACTERS + 1), '').limited, true);
  assert.equal(compareMoodleText('', Array(MOODLE_COMPARISON_LINES + 1).fill('line').join('\n')).limited, true);
  const boundary = 'á'.repeat(MOODLE_COMPARISON_CHARACTERS), result = compareMoodleText(boundary, boundary);
  assert.ok(!result.limited && result.rows[0].text === boundary && result.added === 0 && result.removed === 0);
  const lines = Array(MOODLE_COMPARISON_LINES).fill('line').join('\n'); assert.equal(compareMoodleText(lines, lines).limited, false);
});
